// Compiles the lists off the main thread: parsing uBlock Origin's lists
// takes about a second, which the window must never wait for. The same
// file is the build's tool for the snapshot bundled with Oriel:
//   node out/main/blocker-worker.js fetch <folder>          the lists, from their sources
//   node out/main/blocker-worker.js compile <folder> <file> the engine, from the lists

import { parentPort } from 'node:worker_threads'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { checksum, compile, listSources, looksLikeList, looksLikeResources, resourceSource, withIncludes, ENGINE_VERSION, type Source } from './core'

if (parentPort) {
  const port = parentPort
  port.on('message', (job: { id: number; lists: string[]; resources: string }) => {
    try {
      const bytes = compile(job.lists, job.resources)
      port.postMessage({ id: job.id, bytes }, [bytes.buffer as ArrayBuffer])
    } catch (error) {
      port.postMessage({ id: job.id, error: String((error as Error)?.message ?? error) })
    }
  })
} else if (process.argv[2] === 'fetch' || process.argv[2] === 'compile') {
  cli(process.argv[2], process.argv.slice(3)).catch(error => { console.error(`[blocker] ${error?.message ?? error}`); process.exit(1) })
}

async function get(url: string): Promise<string> {
  const r = await fetch(url, { headers: { 'cache-control': 'no-cache' }, signal: AbortSignal.timeout(30_000) })
  if (!r.ok) throw new Error(`${url}: ${r.status}`)
  return r.text()
}

async function first(s: Source, isList: boolean): Promise<{ url: string; text: string }> {
  let last: unknown
  for (const url of s.urls) {
    try {
      let text = await get(url)
      if (isList) text = await withIncludes(text, url, get)
      if (isList ? looksLikeList(text) : looksLikeResources(text)) return { url, text }
      last = new Error(`${url} isn't what was expected`)
    } catch (error) { last = error }
  }
  throw last
}

async function cli(what: string, args: string[]): Promise<void> {
  const folder = path.resolve(args[0] ?? 'build/blocker')
  if (what === 'fetch') {
    mkdirSync(folder, { recursive: true })
    const meta: Record<string, unknown> = { fetched: new Date().toISOString(), lists: {} }
    for (const s of [...listSources, resourceSource]) {
      const { url, text } = await first(s, s !== resourceSource)
      writeFileSync(path.join(folder, `${s.id}.txt`), text)
      ;(meta.lists as Record<string, unknown>)[s.id] = { url, checksum: checksum(text), bytes: text.length }
      console.log(`[blocker] ${s.id}: ${text.length} characters`)
    }
    writeFileSync(path.join(folder, 'meta.json'), JSON.stringify(meta, null, 1))
    return
  }
  const out = path.resolve(args[1] ?? 'out/main/blocker/engine.bin')
  const read = (id: string) => readFileSync(path.join(folder, `${id}.txt`), 'utf8')
  for (const s of [...listSources, resourceSource]) if (!existsSync(path.join(folder, `${s.id}.txt`))) throw new Error(`no ${s.id} in ${folder}`)
  const started = Date.now()
  const bytes = compile(listSources.map(s => read(s.id)), read(resourceSource.id))
  mkdirSync(path.dirname(out), { recursive: true })
  writeFileSync(out, bytes)
  let fetched: string | undefined
  try { fetched = JSON.parse(readFileSync(path.join(folder, 'meta.json'), 'utf8')).fetched } catch {}
  const lists = Object.fromEntries([...listSources, resourceSource].map(s => [s.id, { checksum: checksum(read(s.id)) }]))
  writeFileSync(path.join(path.dirname(out), 'meta.json'), JSON.stringify({ engineVersion: ENGINE_VERSION, built: new Date().toISOString(), fetched, lists }))
  console.log(`[blocker] engine: ${bytes.length} bytes in ${Date.now() - started} ms`)
}

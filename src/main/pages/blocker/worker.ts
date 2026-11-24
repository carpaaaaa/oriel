// Compiles the lists off the main thread: parsing uBlock Origin's lists
// takes about a second, which the window must never wait for. The same
// file is the build's tool for the snapshot bundled with Oriel:
//   node out/main/blocker-worker.cjs fetch <folder>          the lists, from their sources
//   node out/main/blocker-worker.cjs compile <folder> <file> the engine, from the lists,
//     with a gzipped copy of each list beside it (lists/<id>.txt.gz): the
//     last good copy of a list whose update fails before Oriel ever got one

import http from 'node:http'
import https from 'node:https'
import { parentPort } from 'node:worker_threads'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import path from 'node:path'
import { checksum, compile, listSources, looksLikeList, looksLikeResources, pinned, resourceSource, withIncludes, ENGINE_VERSION, type Source } from './core'

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

// Node's https, not fetch: on the Windows release machine Node 24's fetch
// (undici) crashed the whole build on parallel downloads with an assertion
// thrown outside any promise. Redirects followed, 30 s per try, three tries.
function once(url: string, redirects = 5): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = (url.startsWith('http:') ? http : https).get(url, { headers: { 'cache-control': 'no-cache', 'user-agent': 'Oriel (lists)' }, timeout: 30_000 }, res => {
      const code = res.statusCode ?? 0
      if (code >= 300 && code < 400 && res.headers.location && redirects > 0) {
        res.resume()
        once(new URL(res.headers.location, url).toString(), redirects - 1).then(resolve, reject)
        return
      }
      if (code !== 200) { res.resume(); reject(new Error(`${url}: ${code}`)); return }
      res.setEncoding('utf8')
      let body = ''
      res.on('data', chunk => { body += chunk })
      res.on('end', () => resolve(body))
      res.on('error', reject)
    })
    req.on('timeout', () => req.destroy(new Error(`${url}: timed out`)))
    req.on('error', reject)
  })
}

async function get(url: string): Promise<string> {
  let last: unknown
  for (let i = 0; i < 3; i++) {
    try { return await once(url) } catch (error) { last = error; await new Promise(r => setTimeout(r, 1000 * (i + 1))) }
  }
  throw last
}

async function first(s: Source, isList: boolean): Promise<{ url: string; text: string }> {
  let last: unknown
  for (const url of s.urls) {
    try {
      let text = await get(url)
      if (isList) text = await withIncludes(text, url, get)
      if (!pinned(s, text)) { last = new Error(`${url} doesn't match its pinned SHA-256`); continue }
      if (isList ? looksLikeList(text) : looksLikeResources(text)) return { url, text }
      last = new Error(`${url} isn't what was expected`)
    } catch (error) { last = error }
  }
  throw last
}

async function cli(what: string, args: string[]): Promise<void> {
  const folder = path.resolve(args[0] ?? 'build/blocker')
  const all = [...listSources, resourceSource]
  if (what === 'fetch') {
    mkdirSync(folder, { recursive: true })
    const meta: Record<string, unknown> = { fetched: new Date().toISOString(), lists: {} }
    // Each on its own: one that can't be reached keeps the copy already here.
    const got = await Promise.allSettled(all.map(s => first(s, s !== resourceSource)))
    const failed: string[] = []
    all.forEach((s, i) => {
      const r = got[i]
      if (r.status === 'rejected') { failed.push(`${s.id}: ${(r.reason as Error)?.message ?? r.reason}`); return }
      writeFileSync(path.join(folder, `${s.id}.txt`), r.value.text)
      ;(meta.lists as Record<string, unknown>)[s.id] = { url: r.value.url, checksum: checksum(r.value.text), bytes: r.value.text.length }
      console.log(`[blocker] ${s.id}: ${r.value.text.length} characters`)
    })
    // Dated only when all came: the next build tries the others again.
    if (failed.length) throw new Error(`not fetched: ${failed.join('; ')}`)
    writeFileSync(path.join(folder, 'meta.json'), JSON.stringify(meta, null, 1))
    return
  }
  const out = path.resolve(args[1] ?? 'out/main/blocker/engine.bin')
  const read = (id: string) => readFileSync(path.join(folder, `${id}.txt`), 'utf8')
  for (const s of all) if (!existsSync(path.join(folder, `${s.id}.txt`))) throw new Error(`no ${s.id} in ${folder}`)
  if (!pinned(resourceSource, read(resourceSource.id))) throw new Error(`${resourceSource.id} in ${folder} doesn't match its pinned SHA-256`)
  const started = Date.now()
  const bytes = compile(listSources.map(s => read(s.id)), read(resourceSource.id))
  mkdirSync(path.join(path.dirname(out), 'lists'), { recursive: true })
  writeFileSync(out, bytes)
  for (const s of all) writeFileSync(path.join(path.dirname(out), 'lists', `${s.id}.txt.gz`), gzipSync(read(s.id), { level: 9 }))
  let fetched: string | undefined
  try { fetched = JSON.parse(readFileSync(path.join(folder, 'meta.json'), 'utf8')).fetched } catch {}
  const lists = Object.fromEntries(all.map(s => [s.id, { checksum: checksum(read(s.id)) }]))
  writeFileSync(path.join(path.dirname(out), 'meta.json'), JSON.stringify({ engineVersion: ENGINE_VERSION, built: new Date().toISOString(), fetched, lists }))
  console.log(`[blocker] engine: ${bytes.length} bytes in ${Date.now() - started} ms`)
}

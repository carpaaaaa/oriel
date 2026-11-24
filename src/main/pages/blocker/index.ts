// Block ads and trackers, the lists' half (studio/06 §2.1): uBlock Origin's
// default lists compiled by @ghostery/adblocker, kept in Oriel's folder and
// brought up to date about once a day, in the background. A snapshot of the
// lists compiled at build time ships with Oriel (out/main/blocker), so the
// very first launch blocks, offline too. The compiled engine is kept on
// disk: reading it back takes a few milliseconds where compiling the lists
// takes a second (that happens in a worker, never on the main thread).
//
// What this answers: a request's verdict (block, redirect to a stand-in,
// strip parameters, let through), the hiding rules, procedural filters and
// scriptlets for a page or a frame, and the CSP the lists add.
// Shield (shield.ts) asks it on every request through the one webRequest
// owner; the page preload asks it as each page and frame starts (page.ts).

import { app, net as enet } from 'electron'
import { Worker } from 'node:worker_threads'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, openSync, fsyncSync, closeSync, unlinkSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getDomain } from 'tldts'
import { Request, type FiltersEngine, type NetworkFilter } from '@ghostery/adblocker'
import { checksum, ENGINE_VERSION, fromText, listSources, load, looksLikeList, looksLikeResources, resourceSource, withIncludes, type Source } from './core'
import { probe } from '../../paths'
import { testEnv } from '../../testhooks'

const here = path.dirname(fileURLToPath(import.meta.url))
/** The snapshot compiled at build time. */
const bundledFile = path.join(here, 'blocker', 'engine.bin')
const bundledMeta = path.join(here, 'blocker', 'meta.json')
const workerFile = path.join(here, 'blocker-worker.cjs')
const folder = () => path.join(app.getPath('userData'), 'Blocker')

interface Meta {
  engineVersion?: number
  built?: string
  lastCheck?: number
  lastTry?: number
  error?: string
  lists: Record<string, { url?: string; etag?: string; modified?: string; checksum?: string; fetched?: string }>
}

let engine: FiltersEngine | null | undefined
/** A test world's own list (the bench), in place of the real one. */
let testEngine: FiltersEngine | null = null
/** A test world without the lists: Search's own rules alone, as on the Mac. */
let testNone = false
export const status = { source: 'none' as 'none' | 'bundled' | 'downloaded' | 'test', built: '', loadMs: 0, error: '', updating: false, updates: 0 }

function readMeta(): Meta {
  try { return { lists: {}, ...JSON.parse(readFileSync(path.join(folder(), 'meta.json'), 'utf8')) } } catch { return { lists: {} } }
}

function writeAtomic(file: string, data: string | Uint8Array): void {
  mkdirSync(path.dirname(file), { recursive: true })
  const temp = `${file}.${process.pid}.tmp`
  writeFileSync(temp, data)
  try { const fd = openSync(temp, 'r+'); fsyncSync(fd); closeSync(fd) } catch {}
  for (let attempt = 0; ; attempt++) {
    try { renameSync(temp, file); return } catch (error) {
      if (attempt >= 9) { try { unlinkSync(temp) } catch {} ; throw error }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50)
    }
  }
}

/** The day's engine from Oriel's folder, else the bundled snapshot. */
function loadEngine(): void {
  const started = performance.now()
  const meta = readMeta()
  const mine = path.join(folder(), 'engine.bin')
  if (meta.engineVersion === ENGINE_VERSION && existsSync(mine)) {
    try {
      engine = load(readFileSync(mine))
      status.source = 'downloaded'
      status.built = meta.built ?? ''
    } catch (error) { status.error = `engine.bin: ${(error as Error).message}` }
  }
  if (!engine && existsSync(bundledFile)) {
    try {
      engine = load(readFileSync(bundledFile))
      status.source = 'bundled'
      try { status.built = JSON.parse(readFileSync(bundledMeta, 'utf8')).built ?? '' } catch {}
    } catch (error) { status.error = `bundled engine: ${(error as Error).message}` }
  }
  if (!engine) engine = null
  status.loadMs = Math.round(performance.now() - started)
}

/** The engine to ask, or null: Search's own short lists then do the work. */
export function blocker(): FiltersEngine | null {
  if (testNone) return null
  if (testEngine) return testEngine
  if (engine === undefined) loadEngine()
  return engine ?? null
}

// requests

const domainOf = (host: string) => getDomain(host) ?? host

export function request(url: string, sourceUrl: string, type: string): Request {
  return Request.fromRawDetails({ url, sourceUrl, type: type as never })
}

const anyType = (f: NetworkFilter) => f.fromScript() && f.fromImage() && f.fromStylesheet() && f.fromXmlHttpRequest()
/** A filter written for documents ($document, $doc), not one for any type. */
export const forDocuments = (f: NetworkFilter | undefined): boolean => !!f && f.fromDocument() && !anyType(f)

const excluded = (e: FiltersEngine) => (e as unknown as { isFilterExcluded: (f: NetworkFilter) => boolean }).isFilterExcluded.bind(e)

/** An exception in the lists for this request, blocking filter or not
 * (one of Search's own rules then gives way to it too). */
export function excepted(e: FiltersEngine, r: Request): boolean {
  return !!e.exceptions.match(r, excluded(e))
}

const allowedPages = new Map<string, boolean>()
/** The lists turn everything off on this page (@@||site^$document). */
export function pageAllowed(e: FiltersEngine, pageUrl: string): boolean {
  if (!/^https?:/i.test(pageUrl)) return false
  const known = allowedPages.get(pageUrl)
  if (known !== undefined) return known
  const all = e.exceptions.matchAll(request(pageUrl, pageUrl, 'main_frame'), excluded(e))
  const yes = all.some(forDocuments)
  if (allowedPages.size > 300) allowedPages.clear()
  allowedPages.set(pageUrl, yes)
  return yes
}

/** The names the lists' $removeparam take off this address (a page's, for
 * Remove click trackers from links). */
export function paramsToRemove(url: string, type: 'main_frame' | 'sub_frame', sourceUrl: string): Set<string> {
  const e = blocker()
  const out = new Set<string>()
  if (!e || !url.includes('?')) return out
  const r = e.match(request(url, sourceUrl || url, type))
  if (!r.rewrite?.url) return out
  const before = new URL(url).searchParams
  const after = new URL(r.rewrite.url).searchParams
  for (const name of new Set(before.keys())) if (!after.has(name)) out.add(name)
  return out
}

// pages

export interface Cosmetics {
  styles: string
  scripts: string[]
  extended: unknown[]
}

/** What a page on `url` is given as it starts: the hiding rules for its
 * site and the generic ones that need no look at its elements, its
 * procedural filters and its scriptlets. Null where the lists turn
 * everything off. */
export function cosmeticsFor(url: string, ancestors: string[] = []): Cosmetics | null {
  const e = blocker()
  if (!e || !/^https?:/i.test(url)) return null
  if (pageAllowed(e, ancestors[ancestors.length - 1] ?? url)) return null
  let hostname = ''
  try { hostname = new URL(url).hostname } catch { return null }
  const c = e.getCosmeticsFilters({
    url, hostname, domain: domainOf(hostname),
    ancestors: ancestors.map(a => { const h = hostOf(a); return { hostname: h, domain: domainOf(h) } }),
    getBaseRules: true, getInjectionRules: true, getExtendedRules: true, getRulesFromHostname: true, getRulesFromDOM: false,
  })
  if (c.active === false) return null
  return { styles: c.styles, scripts: c.scripts, extended: c.extended }
}

/** The generic hiding rules for classes, ids and links found in the page. */
export function cosmeticsForDOM(url: string, classes: string[], ids: string[], hrefs: string[]): string {
  const e = blocker()
  if (!e || !/^https?:/i.test(url)) return ''
  if (pageAllowed(e, url)) return ''
  let hostname = ''
  try { hostname = new URL(url).hostname } catch { return '' }
  const c = e.getCosmeticsFilters({
    url, hostname, domain: domainOf(hostname), classes, ids, hrefs,
    getBaseRules: false, getInjectionRules: false, getExtendedRules: false, getRulesFromHostname: false, getRulesFromDOM: true,
  })
  return c.active === false ? '' : c.styles
}

const hostOf = (u: string) => { try { return new URL(u).hostname } catch { return '' } }

// the lists' CSP

export function cspFor(url: string, sourceUrl: string, type: 'main_frame' | 'sub_frame'): string | undefined {
  const e = blocker()
  if (!e) return undefined
  return e.getCSPDirectives(request(url, sourceUrl, type))
}

/** A scriptlet in a scope of its own: its helpers (safeSelf...) never
 * become the page's globals, and an error stays inside. */
export const enclosed = (script: string) => `(function(){try{\n${script}\n}catch(e){}})();`

// updates: about once a day, in the background

const DAY = 24 * 60 * 60 * 1000

/** Compiles in a worker thread of its own, gone once it has answered (the
 * parse holds a lot of memory for a second). Started from the worker
 * file's text: a worker can't start from a file inside the app's archive. */
function compileOffThread(lists: string[], resources: string): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(readFileSync(workerFile, 'utf8'), { eval: true })
    const done = (f: () => void) => { f(); void worker.terminate() }
    worker.on('message', (m: { bytes?: Uint8Array; error?: string }) => done(() => (m.bytes ? resolve(m.bytes) : reject(new Error(m.error ?? 'compiling failed')))))
    worker.on('error', error => done(() => reject(error)))
    worker.postMessage({ id: 1, lists, resources })
  })
}

async function fetchText(url: string, headers: Record<string, string> = {}): Promise<Response> {
  return enet.fetch(url, { headers, cache: 'no-store', signal: AbortSignal.timeout(60_000) } as RequestInit)
}

/** One source: its text, from the first address that answers with a
 * list, or the copy already kept when the server says it hasn't changed. */
async function fetchSource(s: Source, kept: Meta['lists'][string] | undefined, keptText: string | null, isList: boolean, least: number): Promise<{ text: string; entry: Meta['lists'][string]; fresh: boolean }> {
  let last: unknown
  for (const url of s.urls) {
    try {
      const headers: Record<string, string> = {}
      if (keptText && kept?.url === url) {
        if (kept.etag) headers['If-None-Match'] = kept.etag
        if (kept.modified) headers['If-Modified-Since'] = kept.modified
      }
      const r = await fetchText(url, headers)
      if (r.status === 304 && keptText) return { text: keptText, entry: kept!, fresh: false }
      if (!r.ok) throw new Error(`${url}: ${r.status}`)
      let text = await r.text()
      if (isList) text = await withIncludes(text, url, async u => { const p = await fetchText(u); if (!p.ok) throw new Error(`${u}: ${p.status}`); return p.text() })
      if (!(isList ? looksLikeList(text, true, least) : looksLikeResources(text, least))) throw new Error(`${url} isn't what was expected`)
      const entry = { url, etag: r.headers.get('etag') ?? undefined, modified: r.headers.get('last-modified') ?? undefined, checksum: checksum(text), fetched: new Date().toISOString() }
      return { text, entry, fresh: entry.checksum !== kept?.checksum }
    } catch (error) { last = error }
  }
  throw last ?? new Error(`${s.id}: no address`)
}

/** Brings the lists up to date and compiles them if any changed. `sources`
 * replaces the real ones for a test world (served on this computer). */
export async function update(sources?: { lists: Source[]; resources: Source }): Promise<{ changed: boolean; error?: string }> {
  if (status.updating) return { changed: false, error: 'already updating' }
  status.updating = true
  const meta = readMeta()
  meta.lastTry = Date.now()
  try {
    const lists = sources?.lists ?? listSources
    const res = sources?.resources ?? resourceSource
    const dir = path.join(folder(), 'lists')
    const keptText = (id: string) => { try { return readFileSync(path.join(dir, `${id}.txt`), 'utf8') } catch { return null } }
    let changed = !existsSync(path.join(folder(), 'engine.bin')) || meta.engineVersion !== ENGINE_VERSION
    const texts: string[] = []
    const fresh: [string, string][] = []
    const entries: Meta['lists'] = {}
    for (const s of [...lists, res]) {
      // A test world's stand-ins are small; the real lists are not.
      const r = await fetchSource(s, meta.lists[s.id], keptText(s.id), s !== res, sources ? 1 : 20)
      if (r.fresh) { changed = true; fresh.push([s.id, r.text]) }
      entries[s.id] = r.entry
      texts.push(r.text)
    }
    const resources = texts.pop()!
    if (changed) {
      const bytes = await compileOffThread(texts, resources)
      const next = load(bytes)
      for (const [id, text] of fresh) writeAtomic(path.join(dir, `${id}.txt`), text)
      writeAtomic(path.join(folder(), 'engine.bin'), bytes)
      meta.engineVersion = ENGINE_VERSION
      meta.built = new Date().toISOString()
      engine = next
      allowedPages.clear()
      status.source = 'downloaded'
      status.built = meta.built
      status.updates++
    }
    // Kept only once what they describe is on disk.
    meta.lists = entries
    meta.lastCheck = Date.now()
    delete meta.error
    status.error = ''
    return { changed }
  } catch (error) {
    meta.error = String((error as Error)?.message ?? error)
    status.error = meta.error
    return { changed: false, error: meta.error }
  } finally {
    status.updating = false
    try { writeAtomic(path.join(folder(), 'meta.json'), JSON.stringify(meta)) } catch {}
  }
}

/** Once a day, an hour after a failed try; never in a test world unless it
 * asks (its pages are on this computer). */
function due(): boolean {
  const meta = readMeta()
  if (meta.lastTry && Date.now() - meta.lastTry < 60 * 60 * 1000 && meta.error) return false
  return !meta.lastCheck || Date.now() - meta.lastCheck > DAY - 60 * 60 * 1000
}

app.whenReady().then(() => {
  // Read at once: the first pages mustn't load before it.
  blocker()
  if (probe && testEnv('ORIEL_BLOCKER_UPDATES') !== '1') return
  const tick = () => { if (due()) void update() }
  setTimeout(tick, 30_000).unref()
  setInterval(tick, 60 * 60 * 1000).unref()
})

// the bench (test worlds only)

export function useTestList(filters: string | null, resources?: string, none = false): void {
  allowedPages.clear()
  testNone = none
  if (none || filters === null) {
    testEngine = null
    status.source = none || !engine ? 'none' : readMeta().engineVersion === ENGINE_VERSION ? 'downloaded' : 'bundled'
    return
  }
  const base = engine === undefined ? (loadEngine(), engine) : engine
  testEngine = fromText(filters, resources ?? base ?? null)
  status.source = 'test'
}

export function describe(): Record<string, unknown> {
  const e = blocker()
  const meta = readMeta()
  return {
    ...status,
    engineVersion: ENGINE_VERSION,
    lists: Object.keys(meta.lists).length ? meta.lists : null,
    lastCheck: meta.lastCheck ?? null,
    scriptlets: e?.resources.scriptlets.length ?? 0,
    resources: e?.resources.resources.length ?? 0,
  }
}

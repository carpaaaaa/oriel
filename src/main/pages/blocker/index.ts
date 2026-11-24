// Block ads and trackers, the lists' half (studio/06 §2.1): uBlock Origin's
// default lists compiled by @ghostery/adblocker, kept in Oriel's folder and
// brought up to date about once a day, in the background, each list on its
// own. A snapshot of the lists compiled at build time ships with Oriel
// (out/main/blocker), with a copy of each list, so the very first launch
// blocks, offline too. The compiled engine is kept on disk: reading it back
// takes a few milliseconds where compiling the lists takes a second (that
// happens in a worker, never on the main thread).
//
// What this answers: a request's verdict (block, redirect to a stand-in,
// strip parameters, let through), a pop-up's ($popup), the hiding rules,
// procedural filters and scriptlets for a page or a frame, and the CSP the
// lists add. Shield (shield.ts) asks it on every request through the one
// webRequest owner; the page preload asks it as each page and frame starts
// (page.ts).

import { app, net as enet } from 'electron'
import { Worker } from 'node:worker_threads'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, openSync, fsyncSync, closeSync, unlinkSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getDomain } from 'tldts'
import { Request, type FiltersEngine, type NetworkFilter } from '@ghostery/adblocker'
import { checksum, ENGINE_VERSION, fromText, listSources, load, looksLikeList, looksLikeResources, pinned, resourceSource, withIncludes, type Engines, type Source } from './core'
import { probe } from '../../paths'
import { testEnv } from '../../testhooks'

const here = path.dirname(fileURLToPath(import.meta.url))
/** The snapshot compiled at build time, and the lists it was made from. */
const bundledFile = path.join(here, 'blocker', 'engine.bin')
const bundledMeta = path.join(here, 'blocker', 'meta.json')
const bundledLists = path.join(here, 'blocker', 'lists')
const workerFile = path.join(here, 'blocker-worker.cjs')
const folder = () => path.join(app.getPath('userData'), 'Blocker')

interface Sources { lists: Source[]; resources: Source }

interface Meta {
  engineVersion?: number
  built?: string
  lastCheck?: number
  lastTry?: number
  error?: string
  lists: Record<string, { url?: string; etag?: string; modified?: string; checksum?: string; fetched?: string }>
  /** A test world's sources, when they made the engine kept (the real ones otherwise). */
  sources?: Sources
}

let engines: Engines | null | undefined
/** A test world's own list (the bench), in place of the real one. */
let testEngines: Engines | null = null
/** A test world without the lists: Search's own rules alone, as on the Mac. */
let testNone = false
type Origin = 'none' | 'bundled' | 'downloaded'
export const status = { source: 'none' as Origin | 'test', built: '', loadMs: 0, error: '', updating: false, updates: 0, rebuilt: 0 }
/** Where the real engine came from (a test world's list stands in front of it). */
let origin: Origin = 'none'
const from = (o: Origin) => { origin = o; if (status.source !== 'test') status.source = o }

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

/** The day's engine from Oriel's folder, else the bundled snapshot. One
 * there that can't be read (damaged, or of an older version) is made again
 * at once from the lists kept beside it, with no wait for the day's update. */
function loadEngine(): void {
  const started = performance.now()
  const meta = readMeta()
  const mine = path.join(folder(), 'engine.bin')
  let again = false
  if (existsSync(mine)) {
    if (meta.engineVersion !== ENGINE_VERSION) again = true
    else {
      try {
        engines = load(readFileSync(mine))
        from('downloaded')
        status.built = meta.built ?? ''
      } catch (error) { status.error = `engine.bin: ${(error as Error).message}`; again = true }
    }
  }
  if (!engines && existsSync(bundledFile)) {
    try {
      engines = load(readFileSync(bundledFile))
      from('bundled')
      try { status.built = JSON.parse(readFileSync(bundledMeta, 'utf8')).built ?? '' } catch {}
    } catch (error) { status.error = `bundled engine: ${(error as Error).message}` }
  }
  if (!engines) engines = null
  status.loadMs = Math.round(performance.now() - started)
  if (again) setTimeout(() => void rebuild(), 0)
}

/** The engine kept, made again from the lists kept (no network): their
 * downloaded copies, else the ones that came with Oriel. */
export async function rebuild(): Promise<{ changed: boolean; error?: string }> {
  const r = await update(readMeta().sources, { offline: true })
  if (r.changed) status.rebuilt++
  return r
}

/** The engine to ask, or null: Search's own short lists then do the work. */
export function blocker(): FiltersEngine | null {
  if (testNone) return null
  if (testEngines) return testEngines.main
  if (engines === undefined) loadEngine()
  return engines?.main ?? null
}

/** The lists' pop-up filters ($popup), or null. */
function popupEngine(): FiltersEngine | null {
  if (testNone) return null
  if (testEngines) return testEngines.popups
  if (engines === undefined) loadEngine()
  return engines?.popups ?? null
}

// requests

const domainOf = (host: string) => getDomain(host) ?? host

export function request(url: string, sourceUrl: string, type: string): Request {
  return Request.fromRawDetails({ url, sourceUrl, type: type as never })
}

const anyType = (f: NetworkFilter) => f.fromScript() && f.fromImage() && f.fromStylesheet() && f.fromXmlHttpRequest()
/** A filter written for documents ($document, $doc, and $all, which comes
 * in as one: core.ts prepare), not one for any type. */
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

/** A page (or a frame in it, `opener`) opening `url` in a tab or a window:
 * a $popup filter for it, as uBlock Origin refuses the pop-up. Asked as
 * the type "other", so $third-party reads the opener against it (the
 * engine takes any page load for a first party). */
export function popupBlocked(url: string, opener: string, page: string): boolean {
  const p = popupEngine()
  if (!p || !/^https?:/i.test(url) || !/^https?:/i.test(opener)) return false
  const e = blocker()
  if (e && pageAllowed(e, page)) return false
  const r = p.match(request(url, opener, 'other'))
  return r.match && !r.redirect
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

// updates: about once a day, in the background, each list on its own

const DAY = 24 * 60 * 60 * 1000
const HOUR = 60 * 60 * 1000
/** How long one list (with its !#include parts) may take, all its addresses together. */
const LIST_TIME = 90_000

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

async function fetchText(url: string, signal: AbortSignal, headers: Record<string, string> = {}): Promise<Response> {
  return enet.fetch(url, { headers, cache: 'no-store', signal } as RequestInit)
}

/** One source: its text, from the first address that answers with a
 * list, or the copy already kept when the server says it hasn't changed.
 * A pinned source (the resources) must be exactly the text pinned. */
async function fetchSource(s: Source, kept: Meta['lists'][string] | undefined, keptText: string | null, isList: boolean, least: number): Promise<{ text: string; entry: Meta['lists'][string]; fresh: boolean }> {
  const signal = AbortSignal.timeout(LIST_TIME)
  let last: unknown
  for (const url of s.urls) {
    try {
      const headers: Record<string, string> = {}
      if (keptText && kept?.url === url && pinned(s, keptText)) {
        if (kept.etag) headers['If-None-Match'] = kept.etag
        if (kept.modified) headers['If-Modified-Since'] = kept.modified
      }
      const r = await fetchText(url, signal, headers)
      if (r.status === 304 && keptText && pinned(s, keptText)) return { text: keptText, entry: kept!, fresh: false }
      if (!r.ok) throw new Error(`${url}: ${r.status}`)
      let text = await r.text()
      if (isList) text = await withIncludes(text, url, async u => { const p = await fetchText(u, signal); if (!p.ok) throw new Error(`${u}: ${p.status}`); return p.text() })
      if (!pinned(s, text)) throw new Error(`${url} doesn't match its pinned SHA-256`)
      if (!(isList ? looksLikeList(text, true, least) : looksLikeResources(text, least))) throw new Error(`${url} isn't what was expected`)
      const entry = { url, etag: r.headers.get('etag') ?? undefined, modified: r.headers.get('last-modified') ?? undefined, checksum: checksum(text), fetched: new Date().toISOString() }
      return { text, entry, fresh: entry.checksum !== kept?.checksum }
    } catch (error) { last = error }
  }
  throw last ?? new Error(`${s.id}: no address`)
}

/** The copy that came with Oriel of one of its own lists, or null. */
function bundledText(id: string): string | null {
  try { return gunzipSync(readFileSync(path.join(bundledLists, `${id}.txt.gz`))).toString('utf8') } catch { return null }
}

const reason = (e: unknown) => String((e as Error)?.message ?? e)

/** Brings the lists up to date, each on its own and all at once, and
 * compiles them if any changed. A list that can't be had this time keeps
 * its last good copy (downloaded, else the one that came with Oriel); the
 * others' news go in all the same. `sources` replaces the real ones for a
 * test world (served on this computer); `offline` makes the engine again
 * from the copies alone. */
export async function update(sources?: Sources, opts: { offline?: boolean } = {}): Promise<{ changed: boolean; error?: string; failed?: string[] }> {
  if (status.updating) return { changed: false, error: 'already updating' }
  status.updating = true
  const meta = readMeta()
  if (!opts.offline) meta.lastTry = Date.now()
  try {
    const lists = sources?.lists ?? listSources
    const res = sources?.resources ?? resourceSource
    const all = [...lists, res]
    const dir = path.join(folder(), 'lists')
    const keptText = (id: string) => { try { return readFileSync(path.join(dir, `${id}.txt`), 'utf8') } catch { return null } }
    /** The last good copy: a pinned one only if it is still the pinned text. */
    const copyOf = (s: Source) => [keptText(s.id), sources ? null : bundledText(s.id)].find(t => t !== null && pinned(s, t)) ?? null
    let changed = !!opts.offline || !existsSync(path.join(folder(), 'engine.bin')) || meta.engineVersion !== ENGINE_VERSION
    // A test world's stand-ins are small; the real lists are not.
    const got = await Promise.allSettled(all.map(s => opts.offline
      ? Promise.reject(new Error('offline'))
      : fetchSource(s, meta.lists[s.id], keptText(s.id), s !== res, sources ? 1 : 20)))
    const texts = new Map<string, string>()
    const fresh: [string, string][] = []
    const entries: Meta['lists'] = {}
    const failed: string[] = []
    all.forEach((s, i) => {
      const r = got[i]
      if (r.status === 'fulfilled') {
        texts.set(s.id, r.value.text)
        entries[s.id] = r.value.entry
        if (r.value.fresh) { changed = true; fresh.push([s.id, r.value.text]) }
        return
      }
      if (!opts.offline) failed.push(`${s.id}: ${reason(r.reason)}`)
      const copy = copyOf(s)
      if (copy === null) return
      texts.set(s.id, copy)
      if (meta.lists[s.id]) entries[s.id] = meta.lists[s.id]
      // A copy that isn't the one kept (it came with Oriel) is a change too.
      if (copy !== keptText(s.id)) { changed = true; fresh.push([s.id, copy]) }
    })
    const resources = texts.get(res.id)
    const listTexts = lists.flatMap(s => texts.get(s.id) ?? [])
    if (resources === undefined || !listTexts.length) throw new Error(failed.join('; ') || 'no copy of the lists to compile')
    if (changed) {
      const bytes = await compileOffThread(listTexts, resources)
      const next = load(bytes)
      for (const [id, text] of fresh) writeAtomic(path.join(dir, `${id}.txt`), text)
      writeAtomic(path.join(folder(), 'engine.bin'), bytes)
      meta.engineVersion = ENGINE_VERSION
      meta.built = new Date().toISOString()
      engines = next
      allowedPages.clear()
      from('downloaded')
      status.built = meta.built
      status.updates++
    }
    // Kept only once what they describe is on disk.
    meta.lists = entries
    if (sources) meta.sources = sources; else delete meta.sources
    if (!opts.offline) meta.lastCheck = Date.now()
    if (failed.length) meta.error = failed.join('; '); else if (!opts.offline) delete meta.error
    status.error = meta.error ?? ''
    return failed.length ? { changed, error: meta.error, failed } : { changed }
  } catch (error) {
    meta.error = reason(error)
    status.error = meta.error
    return { changed: false, error: meta.error }
  } finally {
    status.updating = false
    try { writeAtomic(path.join(folder(), 'meta.json'), JSON.stringify(meta)) } catch {}
  }
}

/** Once a day; an hour after a try where a list couldn't be had. Never in
 * a test world unless it asks (its pages are on this computer). */
function due(): boolean {
  const meta = readMeta()
  if (meta.error) return !meta.lastTry || Date.now() - meta.lastTry >= HOUR
  return !meta.lastCheck || Date.now() - meta.lastCheck > DAY - HOUR
}

app.whenReady().then(() => {
  // Read at once: the first pages mustn't load before it.
  blocker()
  if (probe && testEnv('ORIEL_BLOCKER_UPDATES') !== '1') return
  const tick = () => { if (due()) void update() }
  setTimeout(tick, 30_000).unref()
  setInterval(tick, HOUR).unref()
})

// the bench (test worlds only)

export function useTestList(filters: string | null, resources?: string, none = false): void {
  allowedPages.clear()
  testNone = none
  if (none || filters === null) {
    testEngines = null
    status.source = none || !engines ? 'none' : origin
    return
  }
  const base = engines === undefined ? (loadEngine(), engines) : engines
  testEngines = fromText(filters, resources ?? base?.main ?? null)
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
    popupFilters: !!popupEngine(),
  }
}

// Translate Page, on this PC (studio/03 §6.3; Translate.swift PageTranslator).
// The page's own preload part (preload/page/translate.ts) reads its words in
// Oriel's isolated world, on screen first, and puts the translation back in
// the same text nodes; here each run of a paragraph goes to Bergamot as a
// little HTML, its links and bold kept as marked spans (Bergamot's HTML mode
// carries them across the translation by word alignment), and comes back in
// pieces, one per node. A string seen twice is translated once. Each block
// long enough to tell is checked for its own language, as on the Mac. The
// models are downloaded the first time a language is needed and kept
// (catalog.ts); the engine runs in a thread of its own (engine.ts).
// Owned by the translate module.

import { ipcMain, type WebContents } from 'electron'
import { handle } from '../router'
import { need, tabRuntime } from '../context'
import { model } from '../model/model'
import { controllerFor, registerSlice, type WindowController } from '../views/window'
import { runtimes } from '../views/tabs'
import { benchRequest } from '../bench/server'
import { probe } from '../paths'
import { brand } from '../../shared/brand'
import { addDefaults } from '../../shared/prefs'
import type { ID } from '../../shared/state'
import { languageName, MENU_DEFAULT, MENU_KEY, translateCodes, translateLanguages, type TranslateTab } from '../../shared/modules/translate'
import { detectTexts, ensureModel, translateTexts } from './engine'
import { download, fetched, filesFor, keptRoute, missing, route, type Pair } from './catalog'
import { hideMenu, menuOpenFor, setupMenu } from './menu'

addDefaults({ [MENU_KEY]: MENU_DEFAULT })

/** Test worlds only: a stand-in that marks each piece instead of
 * translating it, to test the page side without a model (Translate.swift fake). */
const fake = !!probe && !!process.env.SEARCH_TRANSLATE_FAKE

type Unit = [id: number, parts: string[], gaps: boolean[], fixed: boolean[]]

interface Job {
  tab: ID
  wc: WebContents
  session: number
  to: string
  from: string | null
  /** The pairs for the page's language; null when it is already `to`. */
  route: Pair[] | null
  /** Other languages met in blocks: their pairs if already on this PC. */
  routes: Map<string, Pair[] | null>
  cache: Map<string, string>
  cancelled: boolean
  begun: boolean
  report: Record<string, unknown>
  started: number
  passed: boolean
  waiters: ((report: Record<string, unknown>) => void)[]
}

const jobs = new Map<ID, Job>()
const marks = new Map<ID, TranslateTab>()
let sessions = 0

const ms = (job: Job) => Date.now() - job.started
const known = (code: string) => (translateCodes as readonly string[]).includes(code)
const count = (job: Job, key: string, n = 1) => { job.report[key] = ((job.report[key] as number) ?? 0) + n }

/** A page's lang or the detector's code as Mozilla's models name it. */
export function normalize(code: string, hint = ''): string {
  const c = code.trim().replace('_', '-')
  if (!c) return ''
  const [base, ...rest] = c.split('-')
  const b = base.toLowerCase()
  const tail = rest.join('-').toLowerCase()
  if (b === 'zh') {
    const h = (tail || hint.toLowerCase().split(/[-_]/).slice(1).join('-'))
    return /hant|tw|hk|mo/.test(h) ? 'zh-Hant' : 'zh-Hans'
  }
  if (b === 'no' || b === 'nn') return 'nb'
  if (b === 'iw') return 'he'
  if (b === 'in') return 'id'
  if (b === 'fil') return 'tl'
  return b
}

// the tab's mark

function windowOf(tab: ID): WindowController | undefined {
  const win = model.tabs.get(tab)?.win
  return win ? controllerFor(win) : undefined
}

function setMark(tab: ID, mark: TranslateTab | null): void {
  if (mark) marks.set(tab, mark); else marks.delete(tab)
  windowOf(tab)?.mark('translate')
}

function patchMark(job: Job, patch: Partial<TranslateTab>): void {
  if (jobs.get(job.tab) !== job) return
  const was = marks.get(job.tab) ?? { phase: 'working', from: job.from, to: job.to }
  setMark(job.tab, { ...was, ...patch })
}

const menuLanguages = () => {
  const chosen = new Set(((model.pref(MENU_KEY as never) as string[] | undefined) ?? MENU_DEFAULT).filter(known))
  return translateLanguages.filter(l => chosen.has(l.code))
}

registerSlice('translate', c => ({
  tabs: Object.fromEntries([...marks].filter(([id]) => model.tabs.get(id)?.win === c.record.id)),
  menu: menuLanguages(),
}))
model.on('window-changed', (id: ID, slices: string[]) => {
  if (slices.includes('prefs')) controllerFor(id)?.mark('translate')
})

// starting and stopping

const watched = new WeakSet<WebContents>()

function watch(tab: ID, wc: WebContents): void {
  if (watched.has(wc)) return
  watched.add(wc)
  // The page went: nothing to put back (Tab.translationGone).
  wc.on('did-start-navigation', details => {
    if (details.isMainFrame && !details.isSameDocument) gone(tabOf(wc) ?? tab)
  })
  wc.on('render-process-gone', () => gone(tabOf(wc) ?? tab))
  wc.once('destroyed', () => gone(tabOf(wc) ?? tab))
}

function tabOf(wc: WebContents): ID | undefined {
  for (const [id, job] of jobs) if (job.wc === wc) return id
  for (const [id, rt] of runtimes) if (rt.contents === wc) return id
  return undefined
}

function finish(job: Job): void {
  const report = { ...job.report, from: job.from, to: job.to, phase: marks.get(job.tab)?.phase ?? null, error: marks.get(job.tab)?.error ?? null }
  for (const w of job.waiters.splice(0)) w(report)
}

/** Show Original (restore), or the page going (no page to restore). */
function end(job: Job, restore: boolean): void {
  job.cancelled = true
  if (jobs.get(job.tab) === job) jobs.delete(job.tab)
  if (restore && !job.wc.isDestroyed()) job.wc.send('translate:stop', { session: job.session, restore: true })
  finish(job)
}

function gone(tab: ID): void {
  const job = jobs.get(tab)
  if (job) end(job, false)
  if (marks.has(tab)) setMark(tab, null)
  if (menuOpenFor(tab)) hideMenu(tab)
}

/** What went wrong, said quietly in the sign's menu; gone after 8 s. */
function fail(job: Job, message: string, detail?: unknown): void {
  if (job.cancelled || jobs.get(job.tab) !== job) return
  job.report.error = message
  if (detail) job.report.errorDetail = String((detail as Error)?.message ?? detail)
  const mark: TranslateTab = { phase: 'failed', from: job.from, to: job.to, error: message }
  setMark(job.tab, mark)
  setTimeout(() => { if (marks.get(job.tab) === mark) setMark(job.tab, null) }, 8000).unref?.()
  end(job, true)
}

export function startTranslation(tab: ID, wc: WebContents, to: string): Job {
  const before = jobs.get(tab)
  if (before) end(before, true)
  const job: Job = {
    tab, wc, session: ++sessions, to, from: null, route: null, routes: new Map(), cache: new Map(),
    cancelled: false, begun: false, report: { units: 0, parts: 0, requests: 0, sent: 0, cached: 0, applied: 0, kept: 0, chars: 0, rounds: 0, languages: {} },
    started: Date.now(), passed: false, waiters: [],
  }
  jobs.set(tab, job)
  setMark(tab, { phase: 'working', from: null, to })
  watch(tab, wc)
  wc.send('translate:start', { session: job.session, to })
  // A page with no part of ours (a PDF, the store's own pages) never answers.
  setTimeout(() => { if (!job.begun) fail(job, "This page can't be translated") }, 10_000).unref?.()
  return job
}

handle('page.translate', ({ id, to }, ctx) => {
  const code = normalize(String(to ?? ''))
  if (!known(code)) throw new Error(`no language ${to}`)
  const c = need(ctx)
  const rt = tabRuntime(c, id)
  const wc = rt?.contents
  if (!rt || !wc) return { error: 'no page' }
  startTranslation(rt.id, wc, code)
  return { started: true }
})

handle('page.untranslate', ({ id }, ctx) => {
  const c = need(ctx)
  const tab = id ?? c.record.active[c.record.space]
  if (!tab) return { restored: false }
  const job = jobs.get(tab)
  if (job) end(job, true)
  setMark(tab, null)
  hideMenu(tab)
  return { restored: !!job }
})

handle('translate.menuLanguages', ({ id }, ctx) => {
  const c = need(ctx)
  const tab = id ?? c.record.active[c.record.space]
  return { languages: menuLanguages(), tab: (tab && marks.get(tab)) || null }
})

setupMenu(tab => marks.get(tab) ?? null)

// the page's side, by IPC

function jobFor(sender: WebContents, session: number): Job | null {
  for (const job of jobs.values()) if (job.wc === sender && job.session === session && !job.cancelled) return job
  return null
}

/** The page's language, from its words; its lang attribute when the words
 * don't say clearly (PageTranslator.detect). */
async function detectPage(sample: string, hint: string): Promise<string> {
  const h = normalize(hint)
  if (sample.trim()) {
    const [[code, reliable]] = await detectTexts([sample])
    const c = normalize(code, hint)
    if (c && (reliable || !h)) return c
  }
  return h
}

ipcMain.handle('translate:begin', async (event, { session, sample, hint }: { session: number; sample: string; hint: string }) => {
  const job = jobFor(event.sender, session)
  if (!job) return { stop: true }
  job.begun = true
  job.report.collectMs = ms(job)
  try {
    const from = await detectPage(String(sample ?? '').slice(0, 4000), String(hint ?? ''))
    if (job.cancelled) return { stop: true }
    if (!from || !known(from)) return fail(job, `${brand.name} couldn't tell which language this page is in`), { stop: true }
    job.from = from
    job.report.source = from
    patchMark(job, { from })
    if (from === job.to) return { from }
    if (fake) { job.route = []; return { from } }
    const pairs = await route(from, job.to).catch(error => { throw Object.assign(new Error('offline'), { cause: error }) })
    if (job.cancelled) return { stop: true }
    if (!pairs) return fail(job, `${languageName(from)} to ${languageName(job.to)} can't be translated on this PC`), { stop: true }
    if (missing(pairs).length) {
      const t = Date.now()
      patchMark(job, { phase: 'downloading', progress: 0 })
      let last = 0
      await download(pairs, share => {
        if (share - last < 0.02 && share < 1) return
        last = share
        patchMark(job, { progress: Math.round(share * 100) / 100 })
      }, () => job.cancelled)
      job.report.downloadMs = Date.now() - t
      patchMark(job, { phase: 'working', progress: undefined })
    }
    const t = Date.now()
    for (const p of pairs) await ensureModel(filesFor(p))
    job.report.loadMs = Date.now() - t
    job.route = pairs
    job.report.models = pairs.map(p => `${p.from}-${p.to} ${p.version}`)
    return { from }
  } catch (error) {
    if (job.cancelled) return { stop: true }
    const offline = (error as Error).message === 'offline' || /net::|fetch|file \d|list \d|checksum/i.test(String((error as Error)?.message))
    fail(job, offline
      ? `${languageName(job.from ?? '')} wasn't translated: its language couldn't be downloaded. Try again when you're online`
      : `${languageName(job.from ?? '')} wasn't translated`, error)
    return { stop: true }
  }
})

ipcMain.handle('translate:slice', async (event, { session, units }: { session: number; units: Unit[] }) => {
  const job = jobFor(event.sender, session)
  if (!job || !job.from) return null
  try {
    const out = await translateUnits(job, sanitize(units))
    if (job.cancelled) return null
    if (!job.report.firstSliceMs) job.report.firstSliceMs = ms(job)
    return out
  } catch (error) {
    fail(job, `${languageName(job.from)} wasn't translated`, error)
    return null
  }
})

ipcMain.on('translate:pass', (event, { session, applied }: { session: number; applied: number }) => {
  const job = jobFor(event.sender, session)
  if (!job || job.passed) return
  job.passed = true
  job.report.applied = applied
  job.report.fullMs = ms(job)
  if (!applied && job.from === job.to) return fail(job, `This page is already in ${languageName(job.to)}`)
  patchMark(job, { phase: 'done' })
  finish(job)
})

ipcMain.on('translate:round', (event, { session, applied }: { session: number; applied: number }) => {
  const job = jobFor(event.sender, session)
  if (!job) return
  count(job, 'rounds')
  count(job, 'applied', Number(applied) || 0)
})

/** What came from the page, held to its shape. */
function sanitize(units: unknown): Unit[] {
  if (!Array.isArray(units)) return []
  return units.filter((u): u is Unit => Array.isArray(u) && u.length === 4 && typeof u[0] === 'number'
    && Array.isArray(u[1]) && Array.isArray(u[2]) && Array.isArray(u[3]) && u[1].length > 0
    && u[1].length === u[2].length && u[1].length === u[3].length && u[1].every(p => typeof p === 'string')).slice(0, 400)
}

// translating a slice

const plain = (u: Unit) => u[1].map((p, i) => (i > 0 && u[2][i] ? ' ' : '') + p).join('')
const LETTER = /\p{L}/u

/** Each block's own language where it is long enough to tell and says so
 * clearly; the page's otherwise (PageTranslator.languages). */
async function languagesOf(job: Job, units: Unit[]): Promise<string[]> {
  const page = job.from!
  const long = units.map((u, i) => [i, plain(u)] as const).filter(([, t]) => t.length >= 40)
  const out = units.map(() => page)
  if (!long.length) return out
  const found = await detectTexts(long.map(([, t]) => t))
  long.forEach(([i], k) => {
    const [code, reliable, score] = found[k]
    const c = normalize(code)
    if (reliable && score >= 0.5 && known(c)) out[i] = c
  })
  return out
}

/** The pairs for a block's language: the page's own, nothing for the
 * reader's, and another only when it is on this PC already. */
async function pairsFor(job: Job, language: string): Promise<Pair[] | null | 'same'> {
  if (language === job.to) return 'same'
  if (language === job.from) return job.route
  if (!job.routes.has(language)) job.routes.set(language, fake ? [] : keptRoute(language, job.to))
  return job.routes.get(language) ?? null
}

async function translateUnits(job: Job, units: Unit[]): Promise<[number, string[] | null][]> {
  count(job, 'units', units.length)
  count(job, 'parts', units.reduce((n, u) => n + u[1].length, 0))
  count(job, 'chars', units.reduce((n, u) => n + plain(u).length, 0))
  const languages = await languagesOf(job, units)
  const out = new Map<number, string[] | null>()
  const tally = job.report.languages as Record<string, number>
  for (const language of new Set(languages)) {
    const group = units.filter((_, i) => languages[i] === language)
    tally[language] = (tally[language] ?? 0) + group.length
    const pairs = await pairsFor(job, language)
    if (pairs === 'same' || !pairs) {
      for (const u of group) out.set(u[0], null)
      count(job, 'kept', group.length)
      continue
    }
    const done = await translateGroup(job, language, pairs, group)
    group.forEach((u, i) => out.set(u[0], done[i]))
  }
  return units.map(u => [u[0], out.get(u[0]) ?? null])
}

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" }
const decode = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+|#39);/gi, (m, e: string) => {
  if (e[0] === '#') { const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) ? String.fromCodePoint(n) : m }
  return entities[e.toLowerCase()] ?? m
})

/** A run of several parts as one little HTML sentence, each part a span.
 * Fixed parts (code, a number) go as <code>, which Bergamot carries across
 * untranslated: the sentence reads whole and nothing is lost into them. */
export function htmlOf(parts: string[], gaps: boolean[], fixed: boolean[]): string {
  return parts.map((p, i) => `${i > 0 && gaps[i] ? ' ' : ''}<${fixed[i] ? 'code' : 'span'} data-p="${i}">${escape(p)}</${fixed[i] ? 'code' : 'span'}>`).join('')
}

/** Bergamot's answer cut back into the parts: each span's words, a span
 * met twice (the translation moved words around it) joined with a space;
 * words left outside any span go with the span before them. What is inside
 * a fixed part's <code> is its own text, never taken back. */
export function partsOf(html: string, count: number): string[] {
  const out: string[] = Array(count).fill('')
  const stack: { at: number; code: boolean }[] = []
  let last = -1
  let loose = ''
  const re = /<(span|code) data-p="(\d+)"[^>]*>|<\/(?:span|code)\s*>|<[^>]*>|([^<]+)/g
  for (let m = re.exec(html); m; m = re.exec(html)) {
    if (m[2] !== undefined) { stack.push({ at: Number(m[2]), code: m[1] === 'code' }); continue }
    if (m[3] === undefined) { if (/^<\/(span|code)/.test(m[0])) stack.pop(); continue }
    const top = stack[stack.length - 1]
    if (top?.code) continue
    const text = decode(m[3])
    let at = top ? top.at : -1
    if (at < 0 || at >= count) {
      if (!/\S/.test(text)) continue
      if (last < 0) { loose += text; continue }
      at = last
    }
    if (at !== last && out[at]) out[at] += ' '
    out[at] += (loose ? loose + ' ' : '') + text
    loose = ''
    last = at
  }
  if (loose && count) out[0] = loose + ' ' + out[0]
  return out.map(s => s.replace(/\s+/g, ' ').trim())
}

/** Whether a sentence's pieces came back well enough to use: every part
 * with words has some, except a short one (a word or two, "della") whose
 * sense the translation folded into its neighbours, which is left empty. */
export function usable(parts: string[], fixed: boolean[], pieces: string[]): boolean {
  const worded = parts.map((p, i) => !fixed[i] && LETTER.test(p))
  const empty = parts.filter((p, i) => worded[i] && !pieces[i])
  if (!empty.length) return true
  const full = worded.filter(Boolean).length - empty.length
  return full > 0 && full >= empty.length && empty.every(p => p.length <= 20 && p.trim().split(/\s+/).length <= 2)
}

/** Strings once each: from the cache, or in one request with the others
 * not seen yet (PageTranslator.strings). */
async function strings(job: Job, language: string, pairs: Pair[], texts: string[], html: boolean): Promise<Map<string, string>> {
  const got = new Map<string, string>()
  const wanted: string[] = []
  const tag = `${language}\u0001${html ? 'h' : 't'}\u0001`
  for (const t of texts) {
    const k = tag + t
    const hit = job.cache.get(k)
    if (hit !== undefined) { got.set(t, hit); count(job, 'cached') } else if (!wanted.includes(t)) wanted.push(t); else count(job, 'cached')
  }
  if (!wanted.length) return got
  count(job, 'requests')
  count(job, 'sent', wanted.length)
  let back: string[]
  if (fake) {
    const mark = `[${language}→${job.to}] `
    back = wanted.map(t => (html ? t.replace(/(<span data-p="\d+">)(?=[^<]*\p{L})/gu, `$1${mark}`) : mark + t))
  } else {
    const models = pairs.map(filesFor)
    const run = () => translateTexts(models, wanted, html)
    // A model let go of by the engine meanwhile: loaded again, once.
    back = await run().catch(error => (/no model/.test(String(error?.message)) ? run() : Promise.reject(error)))
  }
  wanted.forEach((t, i) => { job.cache.set(tag + t, back[i]); got.set(t, back[i]) })
  return got
}

/** Each unit: a run of several parts as one HTML sentence put back in
 * pieces; one whose pieces don't come back, part by part (as the Mac does
 * when a mark is lost). Fixed parts are never written. */
async function translateGroup(job: Job, language: string, pairs: Pair[], units: Unit[]): Promise<(string[] | null)[]> {
  const many = units.filter(u => u[1].length > 1)
  const html = await strings(job, language, pairs, many.map(u => htmlOf(u[1], u[2], u[3])), true)
  const results = new Map<Unit, string[]>()
  const again: Unit[] = []
  for (const u of many) {
    const pieces = partsOf(html.get(htmlOf(u[1], u[2], u[3])) ?? '', u[1].length)
    if (usable(u[1], u[3], pieces)) results.set(u, pieces.map((p, i) => (u[3][i] ? u[1][i] : p))); else again.push(u)
  }
  if (again.length) count(job, 'unjoined', again.length)
  const singles = [...units.filter(u => u[1].length === 1), ...again]
  const texts = singles.flatMap(u => u[1].filter((p, i) => !u[3][i] && LETTER.test(p)))
  const plainBack = await strings(job, language, pairs, texts, false)
  for (const u of singles) results.set(u, u[1].map((p, i) => (u[3][i] ? p : plainBack.get(p) || p)))
  return units.map(u => results.get(u) ?? null)
}

// bench

benchRequest('translate.report', req => {
  const tab = String(req.id ?? '')
  return { report: jobs.get(tab)?.report ?? null, mark: marks.get(tab) ?? null }
})
benchRequest('translate.wait', async req => {
  const tab = String(req.id ?? '')
  const within = Number(req.within ?? 60) * 1000
  const job = jobs.get(tab)
  if (!job) return { report: null, mark: marks.get(tab) ?? null }
  if (job.passed || job.cancelled) return { report: { ...job.report, from: job.from, to: job.to }, mark: marks.get(tab) ?? null }
  const report = await Promise.race([
    new Promise<Record<string, unknown>>(r => job.waiters.push(r)),
    new Promise<null>(r => setTimeout(() => r(null), within)),
  ])
  return { report, mark: marks.get(tab) ?? null }
})
benchRequest('translate.fetched', () => ({ fetched: [...fetched] }))

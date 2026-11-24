// What the field offers for what is typed, and the rest of the address it
// finishes: Browser.placeOffers, History.completion, readAsSearches,
// openPages (studio/03 §1.3, §1.5). History and bookmarks come from the data
// module (data.suggest); the order, the limits and the completion are here.

import { session as electronSession } from 'electron'
import type { Suggestion } from '../../shared/state'
import type { RowKind } from '../../shared/modules/field'
import { data } from '../data/api'
import { model, type WindowRecord } from '../model/model'
import { probe } from '../paths'
import { addressURL, editable, fileURL, identity, pretty, withoutWWW } from '../address'
import {
  bareHost, builtInSites, destination, engineID, engineName, engineTable, engineTemplate, engineURL,
  keywordAccepts, keywordMatch, keywordName, keywords, searchedWords, searchURL, siteURL, type SearchSite,
} from './engines'

const chars = (s: string) => [...s].length

function row(how: RowKind, kind: Suggestion['kind'], key: string, title: string, url: string, extra: Partial<Suggestion> = {}): Suggestion {
  return { kind, how, title: key, detail: title || undefined, url, ...extra }
}

/** data.suggest's rows as the field's: `title` there is the page's title;
 * here `title` is the key (what the row reads, what the field completes
 * towards) and `detail` the page's title. */
function place(s: Suggestion): Suggestion {
  const how: RowKind = s.kind === 'bookmark' ? 'bookmark' : s.kind === 'history' ? 'visited' : 'known'
  let key = editable(s.url)
  if (how === 'known') { try { key = new URL(s.url).host.replace(/^www\./, '') } catch { /* keep */ } }
  return row(how, s.kind, key, s.title && s.title !== s.url ? s.title : '', s.url, { favicon: s.favicon })
}

/** Places from the data module, split as the Mac asks them: history (with
 * the well-known sites) and bookmarks, three of each, best first. */
async function places(typed: string): Promise<{ visited: Suggestion[]; kept: Suggestion[] }> {
  let found: Suggestion[] = []
  try { found = await data.suggest(typed, 12) } catch (e) { console.warn('[field] data.suggest', e) }
  const rows = (found ?? []).filter(s => s && typeof s.url === 'string').map(place)
  return {
    visited: rows.filter(r => r.how !== 'bookmark').slice(0, 3),
    kept: chars(typed.trim()) >= 2 ? rows.filter(r => r.how === 'bookmark').slice(0, 3) : [],
  }
}

/** Browser.placeOffers: three places at most, bookmarks first but leaving
 * room for history's front door, then the search when it can't be a place. */
export async function placeOffers(typed: string): Promise<{ offers: Suggestion[]; ending: string | null }> {
  const { visited, kept } = await places(typed)
  const list: Suggestion[] = []
  const seen = new Set<string>()
  const add = (p: Suggestion) => {
    const id = identity(p.url)
    if (list.length < 3 && !seen.has(id)) { seen.add(id); list.push(p) }
  }
  const front = visited[0] ? identity(visited[0].url) : null
  for (const p of kept) {
    if (list.length === 2 && front && !seen.has(front) && identity(p.url) !== front) break
    add(p)
  }
  visited.forEach(add)
  // Last, and only when what was typed cannot be a place.
  if (typed && !addressURL(typed)) {
    const k = keywordMatch(typed)
    const asked = k && engineURL(k[1], k[0].template)
    if (k && asked) list.push(row('search', 'search', typed, keywordName(k[0]), asked))
    else {
      const url = searchURL(typed)
      if (url) list.push(row('search', 'search', typed, engineName(), url))
    }
  }
  const placesOnly = list.filter(p => p.how !== 'open' && p.how !== 'search')
  const ending = completion(typed, [...placesOnly.filter(p => p.how !== 'bookmark'), ...placesOnly.filter(p => p.how === 'bookmark')])
  return { offers: readAsSearches(list, typed), ending }
}

/** History.completion: the rest of the best place, when it carries on from
 * what was typed. One letter finishes only a front door you have been to. */
export function completion(typed: string, options: Suggestion[]): string | null {
  if (!typed) return null
  const single = chars(typed) === 1
  if (single && options[0] && options[0].how !== 'visited') return null
  for (const option of single ? options.slice(0, 1) : options) {
    for (const [key, target] of endings(option)) {
      if (key.length < typed.length) continue
      if (single && /[/?#]/.test(key)) continue
      if (key.slice(0, typed.length).toLowerCase() !== typed.toLowerCase()) continue
      const rest = key.slice(typed.length)
      const completed = addressURL(typed + rest)
      if (!completed || identity(completed) !== target) continue
      return rest || null
    }
  }
  return null
}

/** Its key, and for a www site the key without www (History.endings). */
function endings(option: Suggestion): [string, string][] {
  const found: [string, string][] = [[option.title, identity(option.url)]]
  if (option.title.toLowerCase().startsWith('www.')) {
    try {
      const u = new URL(option.url)
      if (u.hostname.toLowerCase().startsWith('www.')) {
        u.hostname = u.hostname.slice(4)
        found.push([option.title.slice(4), identity(u.href)])
      }
    } catch { /* not a URL */ }
  }
  return found
}

/** A history page that is a search's results reads as the search it was. */
function readAsSearches(list: Suggestion[], typed: string): Suggestion[] {
  if (!list.some(p => p.how === 'visited')) return list
  const engine = engineTemplate()
  const sites: SearchSite[] = [
    { name: engineName(), host: bareHost(engine) ?? '', template: engine },
    ...keywords().filter(k => keywordAccepts(k.template)).map(k => ({ name: keywordName(k), host: keywordName(k), template: k.template })),
    ...builtInSites(),
  ]
  const asked = typed.trim().toLowerCase()
  const seen = new Set<string>()
  const out: Suggestion[] = []
  for (const p of list) {
    if (p.how !== 'visited') { out.push(p); continue }
    let hit: [SearchSite, string] | null = null
    for (const s of sites) { const w = searchedWords(p.url, s); if (w) { hit = [s, w]; break } }
    if (!hit) { out.push(p); continue }
    const [site, words] = hit
    if (site.template === engine && words.toLowerCase() === asked) continue
    const id = site.host + ' ' + words.toLowerCase()
    if (seen.has(id)) continue
    seen.add(id)
    out.push(row('searched', 'history', words, site.name, p.url))
  }
  return out
}

/** What a row shows: an address without its www, words as they are. */
export function shownKey(s: Suggestion): string {
  return s.how === 'suggested' || s.how === 'searched' || s.how === 'search' || s.how === 'open' ? s.title : withoutWWW(s.title)
}

// ⌘K

export function tabLabel(t: { name?: string; title: string; url: string }): string {
  return t.name || t.title || pretty(t.url)
}

/** Browser.openPages: the window's open pages but the one in front, most
 * recently looked at first; six with nothing typed, three with words. */
export function openPages(win: WindowRecord, typed: string): Suggestion[] {
  const needle = typed.trim().toLowerCase()
  const active = win.active[win.space]
  return model.spaceTabs(win)
    .map(id => model.tabs.get(id)!)
    .filter(t => t && t.id !== active && !t.empty)
    .filter(t => !needle || tabLabel(t).toLowerCase().includes(needle) || pretty(t.url).includes(needle))
    .sort((a, b) => (b.touched ?? 0) - (a.touched ?? 0))
    .slice(0, needle ? 3 : 6)
    .map(t => row('open', 'tab', tabLabel(t), pretty(t.url), t.url, { tabID: t.id, favicon: t.favicon, pinned: !!t.pinID }))
}

// ⌘T's floating field (Settings › Tabs › Opening, studio/01 §3.5)

/** Recent places in the new tab (Browser.recentPlaces, Browser.swift:8150-8158):
 * before anything is typed, the last three places from history that aren't
 * open in this window (⌘K is for those), the newest eight looked at as the
 * Mac's History.recent keeps them. Nothing from a private tab. */
export function recentPlaces(win: WindowRecord, shy: boolean): Suggestion[] {
  if (shy) return []
  const open = new Set(model.spaceTabs(win).map(id => model.tabs.get(id)).filter(t => t && !t.empty).map(t => identity(t!.url)))
  let traces: { url: string; title: string }[] = []
  try { traces = data.everything('', 8) ?? [] } catch (e) { console.warn('[field] data.everything', e) }
  return traces
    .filter(v => v && typeof v.url === 'string' && !open.has(identity(v.url)))
    .slice(0, 3)
    .map(v => row('visited', 'history', editable(v.url), v.title && v.title !== v.url ? v.title : '', v.url, { favicon: data.icon(v.url) }))
}

/** How well what is typed names a tab (Browser.relevance, :7911-7920): 3 when
 * its name or address starts with it, 2 when every word starts a word of
 * them, 1 when every word is somewhere in them (two letters at least). */
function relevance(t: { name?: string; title: string; url: string }, words: string[], whole: string): number {
  const name = tabLabel(t).toLowerCase()
  const address = pretty(t.url).toLowerCase()
  if (name.startsWith(whole) || address.startsWith(whole)) return 3
  const text = name + ' ' + address
  const parts = text.split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  if (words.every(w => parts.some(p => p.startsWith(w)))) return 2
  if ([...whole].length >= 2 && words.every(w => text.includes(w))) return 1
  return 0
}

/** ⌘T finds your open tabs (Browser.tabOffers, :7884-7905): the open tabs,
 * then the pins, that answer to what is typed, best first and between
 * equals the one looked at last; three and two at most. Not the tab the
 * field is over. */
export function tabOffers(win: WindowRecord, typed: string): Suggestion[] {
  const whole = typed.trim().toLowerCase()
  const words = whole.split(/\s+/).filter(Boolean)
  if (!words.length) return []
  const front = win.active[win.space]
  const ranked = model.spaceTabs(win)
    .map(id => model.tabs.get(id)!)
    .filter(t => t && t.id !== front && !t.empty && !t.bench)
    .map(t => ({ t, score: relevance(t, words, whole) }))
    .filter(x => x.score > 0)
    .sort((a, b) => (b.score - a.score) || ((b.t.touched ?? 0) - (a.t.touched ?? 0)))
    .map(x => x.t)
  const open = ranked.filter(t => !t.pinID).slice(0, 3)
  const pins = ranked.filter(t => t.pinID).slice(0, 2)
  return [...open, ...pins].map(t => row('open', 'tab', tabLabel(t), pretty(t.url), t.url, { tabID: t.id, favicon: t.favicon, pinned: !!t.pinID }))
}

/** ⌘K's last row: where words no open page answers go. */
export function switcherFallback(typed: string, blankInFront: boolean): Suggestion | null {
  const words = typed.trim()
  if (!words) return null
  const file = fileURL(words)
  const url = file ?? destination(words)
  if (!url) return null
  const isAddress = !!(file ?? addressURL(words))
  const title = isAddress
    ? (blankInFront ? 'Open in this tab' : 'Open in a new tab')
    : (blankInFront ? 'Search in this tab' : 'Search in a new tab')
  return row(isAddress ? 'known' : 'search', isAddress ? 'url' : 'search', words, title, url)
}

// the engine's suggestions (EngineSuggest.swift, studio/03 §1.8)

const SUGGEST_PAUSE = 120
const SUGGEST_PATIENCE = 800
export const SUGGEST_MOST = 6

/** Whether these words may leave the computer at all (EngineSuggest.sendable). */
export function sendable(typed: string): boolean {
  const text = typed.trim()
  if (!text || chars(text) > 80 || /[\r\n]/.test(text)) return false
  if (addressURL(text)) return false
  const tokens = text.split(/\s+/).filter(Boolean)
  const first = tokens[0] ?? text
  const colon = first.indexOf(':')
  if (/^\p{L}/u.test(first) && colon > 0 && colon < first.length - 1 && /^[\p{L}\p{N}+.-]+$/u.test(first.slice(0, colon))) return false
  if (first.startsWith('/') || first.startsWith('~') || first.startsWith('./') || first.startsWith('../') || text.includes('\\')) return false
  for (const token of tokens) {
    if (tokens.length === 1 && (token.includes('.') || token.includes('/'))) return false
    if (token.includes('@') && token.includes('.')) return false
    if (secretLike(token)) return false
  }
  return true
}

export function secretLike(token: string): boolean {
  const letters = /\p{L}/u.test(token)
  const digits = /\p{N}/u.test(token)
  const n = chars(token)
  if (n >= 12 && letters && digits) return true
  if (n >= 9 && digits && /^[\p{N}-]+$/u.test(token)) return true
  if (n >= 24 && /^[A-Za-z0-9+/=_-]+$/.test(token)) return true
  return false
}

export function parseSuggestions(body: unknown, asked: string): string[] {
  if (!Array.isArray(body) || body.length < 2 || !Array.isArray(body[1])) return []
  const typed = asked.trim().toLowerCase()
  const seen = new Set([typed])
  const out: string[] = []
  for (const word of body[1]) {
    if (typeof word !== 'string') continue
    const clean = word.trim()
    if (!clean || chars(clean) > 200 || /[\r\n]/.test(clean) || seen.has(clean.toLowerCase())) continue
    seen.add(clean.toLowerCase())
    out.push(clean)
    if (out.length === SUGGEST_MOST) break
  }
  return out
}

/** Where these words are asked, or null: off, private, ⌘K, a shortcut or a
 * site that isn't the engine in charge, or words not to send. */
export function engineQuestion(typed: string, o: { summoning: boolean; shy: boolean; chip: SearchSite | null }): string | null {
  if (!model.pref<boolean>('search.suggest') || o.summoning || o.shy || !sendable(typed)) return null
  const words = typed.trim()
  if (o.chip) {
    if (bareHost(engineTemplate()) !== o.chip.host) return null
  } else if (keywordMatch(typed)) return null
  const test = probe ? model.pref<string>('suggest.testURL') : ''
  const id = engineID()
  const template = test || (id === 'custom' ? null : engineTable[id].suggest)
  if (!template) return null
  const url = engineURL(words, template)
  if (!url) return null
  const u = new URL(url)
  if (u.protocol === 'https:') return url
  if (test && u.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(u.hostname)) return url
  return null
}

let suggestSession: Electron.Session | null = null
/** Nothing kept: an in-memory session, no cookies sent, no redirect followed. */
function ephemeral(): Electron.Session {
  if (!suggestSession) {
    suggestSession = electronSession.fromPartition('search-suggest', { cache: false })
    suggestSession.webRequest.onBeforeSendHeaders((d, cb) => {
      const h = { ...d.requestHeaders }
      delete h.Cookie
      delete h.Referer
      cb({ requestHeaders: h })
    })
  }
  return suggestSession
}

/** One question at a time: each waits out the pause and cancels the one before. */
export class EngineSuggester {
  private timer: NodeJS.Timeout | null = null
  private abort: AbortController | null = null
  asked = 0
  cancelled = 0

  ask(url: string, words: string, answer: (words: string[]) => void): void {
    this.stop()
    this.timer = setTimeout(async () => {
      this.timer = null
      const abort = new AbortController()
      this.abort = abort
      const late = setTimeout(() => abort.abort(), SUGGEST_PATIENCE)
      this.asked++
      try {
        const res = await ephemeral().fetch(url, {
          signal: abort.signal, redirect: 'error', credentials: 'omit', cache: 'no-store',
          headers: { Accept: 'application/json, text/javascript;q=0.9' },
        })
        if (abort.signal.aborted || res.status !== 200) return
        const body = JSON.parse(await res.text())
        if (abort.signal.aborted) return
        answer(parseSuggestions(body, words))
      } catch { /* too slow, refused or cancelled */ } finally {
        clearTimeout(late)
        if (this.abort === abort) this.abort = null
      }
    }, SUGGEST_PAUSE)
  }

  stop(): void {
    if (this.timer || this.abort) this.cancelled++
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    this.abort?.abort()
    this.abort = null
  }
}

export function suggestionRow(word: string, chip: SearchSite | null): Suggestion | null {
  const url = chip ? siteURL(chip, word) : searchURL(word)
  return url ? row('suggested', 'search', word, '', url) : null
}

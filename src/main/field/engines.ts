// Search engines, site shortcuts ("yt cats") and searching a site from the
// field: Engine.swift, Keyword.swift, SiteSearch.swift (studio/03 §1.7,
// §1.9, §1.10).

import { app } from 'electron'
import { addDefaults } from '../../shared/prefs'
import { model } from '../model/model'
import { addressURL } from '../address'

// The field's settings, with Prefs.swift's names and defaults (studio/03 §1.14, §9).
addDefaults({
  'search.engine': 'google',
  'search.custom': '',
  'search.shift': '',
  'search.shiftCustom': '',
  'search.keywords': [],
  'search.suggest': false,
  commandbar: false,
  'newtab.floating': false,
  'field.window': false,
  'newtab.recent': false,
  'newtab.arc': false,
  'address.shown': false,
  'address.width': 'small',
})

export type EngineID = 'google' | 'duckduckgo' | 'bing' | 'ecosia' | 'startpage' | 'kagi' | 'brave' | 'qwant' | 'custom'

/** Engine.swift: title, template, and where it suggests (EngineSuggest.swift). */
export const engineTable: Record<Exclude<EngineID, 'custom'>, { title: string; template: string; suggest: string }> = {
  google: { title: 'Google', template: 'https://www.google.com/search?q=%s', suggest: 'https://suggestqueries.google.com/complete/search?client=firefox&q=%s' },
  duckduckgo: { title: 'DuckDuckGo', template: 'https://duckduckgo.com/?q=%s', suggest: 'https://duckduckgo.com/ac/?q=%s&type=list' },
  bing: { title: 'Bing', template: 'https://www.bing.com/search?q=%s', suggest: 'https://www.bing.com/osjson.aspx?query=%s' },
  ecosia: { title: 'Ecosia', template: 'https://www.ecosia.org/search?q=%s', suggest: 'https://ac.ecosia.org/autocomplete?q=%s&type=list' },
  startpage: { title: 'Startpage', template: 'https://www.startpage.com/sp/search?query=%s', suggest: 'https://www.startpage.com/osuggestions?q=%s' },
  kagi: { title: 'Kagi', template: 'https://kagi.com/search?q=%s', suggest: 'https://kagi.com/api/autosuggest?q=%s' },
  brave: { title: 'Brave Search', template: 'https://search.brave.com/search?q=%s', suggest: 'https://search.brave.com/api/suggest?q=%s' },
  qwant: { title: 'Qwant', template: 'https://www.qwant.com/?q=%s', suggest: 'https://api.qwant.com/api/suggest/?q=%s&client=opensearch' },
}

const MARK = 'SEARCHWORDSGOHERE'

/** The words, encoded leaving only A-Z a-z 0-9 - . _ ~ (Engine.swift:66-79). */
export function encodeWords(words: string): string {
  return Array.from(new TextEncoder().encode(words), b => {
    const c = String.fromCharCode(b)
    return /[A-Za-z0-9\-._~]/.test(c) ? c : '%' + b.toString(16).toUpperCase().padStart(2, '0')
  }).join('')
}

/** Engine.url(for:template:): nil for no words or a template that can't be one. */
export function engineURL(text: string, template: string): string | null {
  const words = text.trim()
  if (!words) return null
  let base: string
  try { base = new URL(template.replace('%s', MARK)).href } catch { return null }
  if (!base.includes(MARK)) return null
  return base.replace(MARK, encodeWords(words))
}

/** A template's host, the same whatever the words (Engine.host). */
function templateHost(template: string): string | null {
  const t = template.trim()
  if (!t.includes('%s')) return null
  try {
    const a = new URL(t.replaceAll('%s', 'a'))
    const b = new URL(t.replaceAll('%s', 'b'))
    if (a.protocol !== 'http:' && a.protocol !== 'https:') return null
    if (!a.hostname || a.hostname !== b.hostname) return null
    return a.hostname.toLowerCase()
  } catch { return null }
}

export function bareHost(template: string): string | null {
  const host = templateHost(template)
  return host ? host.replace(/^www\./, '') : null
}

/** A custom engine as people bring it: {searchTerms}, or without https://. */
export function written(template: string): string {
  let text = template.trim().replaceAll('{searchTerms}', '%s')
  if (text && !text.includes('://')) text = 'https://' + text
  return text
}

export function engineID(): EngineID {
  const id = model.pref<string>('search.engine')
  return (id in engineTable || id === 'custom' ? id : 'google') as EngineID
}

export function engineTemplate(id: EngineID = engineID()): string {
  if (id === 'custom') {
    const t = written(model.pref<string>('search.custom') ?? '')
    return templateHost(t) ? t : engineTable.google.template
  }
  return engineTable[id].template
}

export function engineName(id: EngineID = engineID()): string {
  if (id === 'custom') return bareHost(written(model.pref<string>('search.custom') ?? '')) ?? engineTable.google.title
  return engineTable[id].title
}

export function searchURL(words: string): string | null {
  return engineURL(words, engineTemplate())
}

// site shortcuts (Keyword.swift)

export interface Keyword { id?: string; keyword: string; template: string }

export function keywords(): Keyword[] {
  let v = model.pref<unknown>('search.keywords')
  if (typeof v === 'string') { try { v = JSON.parse(v) } catch { v = [] } }
  return Array.isArray(v) ? v.filter(k => k && typeof k.keyword === 'string' && typeof k.template === 'string') : []
}

export function keywordName(k: Keyword): string { return bareHost(k.template) ?? k.template }

/** One site, %s once, in the path, query or fragment (Keyword.accepts). */
export function keywordAccepts(template: string): boolean {
  const t = template.trim()
  if (!templateHost(t) || t.split('%s').length !== 2) return false
  try {
    const u = new URL(t.replace('%s', MARK))
    return [u.pathname, u.search, u.hash].some(p => p.includes(MARK))
  } catch { return false }
}

/** The first shortcut `typed` names, and the words after it. */
export function keywordMatch(typed: string, list = keywords()): [Keyword, string] | null {
  for (const k of list) {
    if (!keywordAccepts(k.template)) continue
    const word = k.keyword.trim()
    const space = typed.indexOf(' ')
    if (!word || space < 0) continue
    if (typed.slice(0, space).toLowerCase() !== word.toLowerCase()) continue
    const rest = typed.slice(space + 1).trim()
    if (rest) return [k, rest]
  }
  return null
}

/** Why a shortcut can't be saved, in Settings' words (Keyword.problem). */
export function keywordProblem(word: string, template: string, list = keywords()): string | null {
  const w = word.trim()
  if (!w) return 'A word to type first, like yt'
  if (/\s/.test(w)) return 'One word, with no spaces in it'
  const taken = list.find(k => k.keyword.toLowerCase() === w.toLowerCase())
  if (taken) return `${taken.keyword} already goes to ${keywordName(taken)}`
  if (!keywordAccepts(template)) return 'An http or https address with %s once, where the words go'
  return null
}

// searching a site (SiteSearch.swift)

export interface SearchSite { name: string; host: string; template: string; aliases?: string[] }

export function siteURL(site: SearchSite, words: string): string | null { return engineURL(words, site.template) }

function wikipediaLanguage(): string {
  const first = (app.getPreferredSystemLanguages?.()[0] ?? app.getLocale() ?? 'en').split(/[-_]/)[0].toLowerCase()
  return /^[a-z]{1,3}$/.test(first) ? first : 'en'
}

function amazonHost(): string {
  const region = (app.getLocaleCountryCode?.() || '').toUpperCase()
  const shops: Record<string, string> = {
    FR: 'amazon.fr', DE: 'amazon.de', AT: 'amazon.de', GB: 'amazon.co.uk', IE: 'amazon.co.uk', IT: 'amazon.it',
    ES: 'amazon.es', NL: 'amazon.nl', BE: 'amazon.com.be', JP: 'amazon.co.jp', CA: 'amazon.ca', AU: 'amazon.com.au',
    IN: 'amazon.in', BR: 'amazon.com.br', MX: 'amazon.com.mx',
  }
  return shops[region] ?? 'amazon.com'
}

let made: SearchSite[] | null = null
/** Built in, as on the Mac (SiteSearch.swift:34-55). */
export function builtInSites(): SearchSite[] {
  if (made) return made
  const amazon = amazonHost()
  made = [
    { name: 'Google', host: 'google.com', template: 'https://www.google.com/search?q=%s' },
    { name: 'Reddit', host: 'reddit.com', template: 'https://www.reddit.com/search/?q=%s' },
    { name: 'YouTube', host: 'youtube.com', template: 'https://www.youtube.com/results?search_query=%s', aliases: ['yt'] },
    { name: 'X', host: 'x.com', template: 'https://x.com/search?q=%s', aliases: ['twitter'] },
    { name: 'ChatGPT', host: 'chatgpt.com', template: 'https://chatgpt.com/?q=%s', aliases: ['gpt', 'openai'] },
    { name: 'Claude', host: 'claude.ai', template: 'https://claude.ai/new?q=%s' },
    { name: 'Perplexity', host: 'perplexity.ai', template: 'https://www.perplexity.ai/search?q=%s' },
    { name: 'Wikipedia', host: 'wikipedia.org', template: `https://${wikipediaLanguage()}.wikipedia.org/w/index.php?search=%s`, aliases: ['wiki'] },
    { name: 'GitHub', host: 'github.com', template: 'https://github.com/search?q=%s', aliases: ['gh'] },
    { name: 'Stack Overflow', host: 'stackoverflow.com', template: 'https://stackoverflow.com/search?q=%s', aliases: ['so'] },
    { name: 'MDN', host: 'developer.mozilla.org', template: 'https://developer.mozilla.org/search?q=%s' },
    { name: 'Amazon', host: amazon, template: `https://www.${amazon}/s?k=%s` },
    { name: 'Google Maps', host: 'google.com/maps', template: 'https://www.google.com/maps/search/%s', aliases: ['maps'] },
    { name: 'IMDb', host: 'imdb.com', template: 'https://www.imdb.com/find/?q=%s' },
    { name: 'Spotify', host: 'open.spotify.com', template: 'https://open.spotify.com/search/%s' },
    { name: 'Figma Community', host: 'figma.com/community', template: 'https://www.figma.com/community/search?resource_type=mixed&sort_by=relevancy&query=%s' },
  ]
  return made
}

/** The site the words begin the name of (SiteSearch.match). Learned sites
 * (OpenSearch) are P1 and not here yet; `visits` weighs a tie. */
export function siteMatch(typed: string, visits: (sites: SearchSite[]) => Record<string, number> = () => ({}), list = keywords()): SearchSite | null {
  const word = typed.toLowerCase().split(/\s+/).filter(Boolean).join(' ')
  if (word.length < 2 || word.includes('/')) return null
  const spaced = word.includes(' ')
  const names = (s: SearchSite): string[] => {
    if (spaced) return s.name.includes(' ') ? [s.name.toLowerCase()] : []
    const host = s.host.replace(/^www\./, '')
    return [s.name.toLowerCase().replaceAll(' ', ''), host, ...(s.aliases ?? [])]
  }
  interface Found { site: SearchSite; length: number; whole: boolean; builtIn: boolean }
  const found: Found[] = []
  const consider = (site: SearchSite) => {
    const fits = names(site).filter(n => n.startsWith(word))
    if (!fits.length) return
    found.push({ site, length: Math.min(...fits.map(f => f.length)), whole: fits.includes(word), builtIn: true })
  }
  builtInSites().forEach(consider)
  for (const k of list) {
    if (!keywordAccepts(k.template)) continue
    const key = k.keyword.trim().toLowerCase()
    const host = keywordName(k)
    const first = host.split('.')[0] ?? key
    consider({ name: first ? first[0].toUpperCase() + first.slice(1).toLowerCase() : key, host, template: k.template, aliases: [key] })
  }
  if (found.length <= 1) return found[0]?.site ?? null
  const whole = found.filter(f => f.whole)
  const pool = whole.length ? whole : found
  const seen = visits(pool.map(f => f.site))
  const count = (f: Found) => seen[f.site.host] ?? 0
  const ranked = [...pool].sort((a, b) => (a.builtIn !== b.builtIn ? (a.builtIn ? -1 : 1) : a.length !== b.length ? a.length - b.length : count(b) - count(a)))
  const first = ranked[0]
  if (!first) return null
  // A habit: ten visits at least and three times the other's.
  if (!whole.length) {
    const busiest = ranked.reduce((m, f) => (count(f) > count(m) ? f : m), ranked[0])
    if (count(busiest) >= 10 && count(busiest) >= 3 * count(first)) return busiest.site
  }
  return first.site
}

/** The words a search page of this site was asked (SiteSearch.words). */
export function searchedWords(url: string, site: SearchSite): string | null {
  let shape: { host: string; path: string; item: string | null }
  try {
    const t = new URL(site.template.replace('%s', 'SEARCHWORDS'))
    const host = t.hostname.toLowerCase().replace(/^www\./, '')
    const item = [...t.searchParams].find(([, v]) => v === 'SEARCHWORDS')?.[0] ?? null
    if (item) shape = { host, path: t.pathname, item }
    else if (t.pathname.endsWith('SEARCHWORDS')) shape = { host, path: t.pathname.slice(0, -'SEARCHWORDS'.length), item: null }
    else return null
  } catch { return null }
  let u: URL
  try { u = new URL(url) } catch { return null }
  if (u.hostname.toLowerCase().replace(/^www\./, '') !== shape.host) return null
  let words: string | null = null
  if (shape.item) {
    const p = u.pathname
    if (!(p === shape.path || p === shape.path + '/' || shape.path === p + '/')) return null
    const raw = u.search.slice(1).split('&').map(kv => kv.split('=')).find(([k]) => k === shape.item)?.[1]
    if (raw == null) return null
    try { words = decodeURIComponent(raw.replaceAll('+', ' ')) } catch { return null }
  } else {
    if (!u.pathname.startsWith(shape.path)) return null
    const rest = u.pathname.slice(shape.path.length)
    if (!rest || rest.includes('/')) return null
    try { words = decodeURIComponent(rest) } catch { words = rest }
  }
  const clean = words.trim()
  return clean && clean.length <= 200 && !/[\r\n]/.test(clean) ? clean : null
}

/** Browser.destination: the site in the field, a file, an address, a
 * shortcut, the engine. Files are the caller's (they check the disk). */
export function destination(typed: string, chip?: SearchSite | null): string | null {
  if (chip) return siteURL(chip, typed)
  const place = addressURL(typed)
  if (place) return place
  const k = keywordMatch(typed)
  if (k) { const url = engineURL(k[1], k[0].template); if (url) return url }
  return searchURL(typed)
}

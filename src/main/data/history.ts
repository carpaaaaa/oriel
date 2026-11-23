// Where you have been, so the field can finish the address for you
// (History.swift, studio/05 §3.5). Kept in history.json, the Mac's format:
// [{ url, key, title, count, last }] with `last` in seconds since 2001, at
// most 2000 places chosen by count × e^(-days/30).

import { readFileSync, renameSync, existsSync } from 'node:fs'
import { writeJSON, writeJSONNow, toAppleDate, fromAppleDate } from '../model/persist'
import { dataFile } from '../paths'
import { editable, homepage, identity, isWeb, kept, parse, stripped } from './urls'
import * as Fuzzy from './fuzzy'

export interface Visit { url: string; key: string; title: string; count: number; last: number }

interface PageText {
  address: string
  searchable: string
  host: string
  homepage: boolean
  findable: string
  /** Prefixes its visits count for: host, host/team, host/team/api. */
  trail: string[]
  weight: number
}

export interface Offer { key: string; title: string; url: string; kind: 'visited' | 'known' }

const mostVisits = 1_000_000_000
/** Places kept in the file, and in memory once a session is cut back. */
export const cap = 2000
/** How far memory may run past the cap; also the newest places a cut keeps. */
export const slack = 250
/** Frecency's month. */
const fading = 30 * 86_400_000
/** A name the app merely knows: under one fresh visit. */
const knownWeight = Math.log(1.5)

function trail(searchable: string): string[] {
  const own = searchable.endsWith('/') ? searchable.slice(0, -1) : searchable
  let end = own.length
  for (let i = 0; i < own.length; i++) if (own[i] === '?' || own[i] === '#') { end = i; break }
  const path = own.slice(0, end)
  const out: string[] = []
  for (let i = 0; i < path.length; i++) if (path[i] === '/') out.push(path.slice(0, i))
  if (end < own.length) out.push(path)
  out.push(own)
  return out
}

function pageText(url: string, title = ''): PageText {
  const u = parse(url)
  if (u) u.hash = ''
  const shown = u?.href ?? url
  const address = editable(shown)
  const searchable = stripped(address)
  const host = (u?.hostname ?? '').toLowerCase()
  const path = u?.pathname ?? ''
  return {
    address,
    searchable,
    host: host.startsWith('www.') ? host.slice(4) : host,
    homepage: path === '' || path === '/',
    findable: title.toLowerCase() + ' ' + searchable,
    trail: trail(searchable),
    weight: 0,
  }
}

function score(v: Visit, now: number): number {
  const days = Math.max(0, (now - v.last) / 86_400_000)
  return v.count * Math.exp(-days / 30)
}

/** Every word somewhere in the page. */
const holds = (words: string[], findable: string) => words.every(w => findable.includes(w))

/** 4 address starts with it, 3 a word of the host does, 2 every word starts
 * a word of title or address, 1 found inside a word. Title and path from
 * three letters. */
function fit(needle: string, words: string[], address: string, findable: string): number | null {
  if (address.startsWith(needle)) return 4
  const end = address.search(/[/?#]/)
  if (Fuzzy.startsWord(needle, end < 0 ? address : address.slice(0, end))) return 3
  if ([...needle].length < 3) return null
  return words.every(w => Fuzzy.startsWord(w, findable)) ? 2 : 1
}

/** Somewhere to start on the first day (History.known). */
const known: [string, string][] = [
  ['google.com', 'Google'], ['mail.google.com', 'Gmail'], ['drive.google.com', 'Google Drive'], ['calendar.google.com', 'Google Calendar'],
  ['maps.google.com', 'Google Maps'], ['youtube.com', 'YouTube'], ['github.com', 'GitHub'], ['figma.com', 'Figma'], ['vercel.com', 'Vercel'],
  ['notion.so', 'Notion'], ['linear.app', 'Linear'], ['slack.com', 'Slack'], ['discord.com', 'Discord'], ['x.com', 'X'], ['linkedin.com', 'LinkedIn'],
  ['instagram.com', 'Instagram'], ['reddit.com', 'Reddit'], ['news.ycombinator.com', 'Hacker News'], ['stackoverflow.com', 'Stack Overflow'],
  ['claude.ai', 'Claude'], ['chatgpt.com', 'ChatGPT'], ['dribbble.com', 'Dribbble'], ['behance.net', 'Behance'], ['awwwards.com', 'Awwwards'],
  ['mobbin.com', 'Mobbin'], ['siteinspire.com', 'SiteInspire'], ['are.na', 'Are.na'], ['pinterest.com', 'Pinterest'], ['framer.com', 'Framer'],
  ['webflow.com', 'Webflow'], ['developer.apple.com', 'Apple Developer'], ['swift.org', 'Swift'], ['npmjs.com', 'npm'], ['supabase.com', 'Supabase'],
  ['stripe.com', 'Stripe'], ['shopify.com', 'Shopify'], ['cloudflare.com', 'Cloudflare'], ['netlify.com', 'Netlify'], ['apple.com', 'Apple'],
  ['spotify.com', 'Spotify'], ['netflix.com', 'Netflix'], ['wikipedia.org', 'Wikipedia'], ['deepl.com', 'DeepL'], ['loom.com', 'Loom'],
  ['amazon.fr', 'Amazon'], ['leboncoin.fr', 'leboncoin'], ['lemonde.fr', 'Le Monde'],
]
const knownText = known.map(([host, title]) => ({ host, title, findable: title.toLowerCase() + ' ' + host }))

export class History {
  private visits = new Map<string, Visit>()
  private text = new Map<string, PageText>()
  private weights = new Map<string, number>()
  private hosts = new Map<string, number>()
  private readonly epoch = Date.now()
  /** A title changed after the visit was written: waits for the next write. */
  private owed = false

  constructor(readonly fileName = 'history.json') { this.load() }

  get size(): number { return this.visits.size }

  // reading the file

  private load(): void {
    const file = dataFile(this.fileName)
    if (!existsSync(file)) return
    let list: unknown
    try { list = JSON.parse(readFileSync(file, 'utf8')) } catch { list = null }
    if (!Array.isArray(list)) {
      // Moved aside, never overwritten (Store.quarantine).
      try { renameSync(file, dataFile(this.fileName.replace(/\.json$/, '') + `.unreadable-${Math.floor(Date.now() / 1000)}.json`)) } catch {}
      return
    }
    let cleaned = false
    for (const raw of list as Record<string, unknown>[]) {
      if (!raw || typeof raw.url !== 'string') continue
      const clean = kept(raw.url)
      if (!clean) continue
      if (clean.href !== raw.url) cleaned = true
      const visit: Visit = {
        url: clean.href,
        key: identity(clean.href),
        title: typeof raw.title === 'string' ? raw.title : '',
        count: Math.min(Math.max(Number(raw.count) || 0, 0), mostVisits),
        last: typeof raw.last === 'number' ? fromAppleDate(raw.last) : Date.now(),
      }
      // Keys written by an older Search can meet: merged, never trusted unique.
      const had = this.visits.get(visit.key)
      this.visits.set(visit.key, had ? merged(had, visit) : visit)
    }
    for (const v of this.visits.values()) this.remember(v)
    if (cleaned) this.save()
  }

  // writing

  /** A page was visited (05 §3.5): its home counts a visit too. */
  record(url: string, title = ''): void {
    const u = kept(url)
    if (!isWeb(u)) return
    const key = identity(u.href)
    const now = Date.now()
    const text = pageText(u.href)
    if (!text.homepage) {
      const home = homepage(u.href)!
      const root = identity(home)
      const visit = this.visits.get(root) ?? { url: home, key: root, title: '', count: 0, last: now }
      visit.count = Math.min(mostVisits, visit.count + 1)
      visit.last = now
      this.visits.set(root, visit)
      this.remember(visit)
    }
    const seen = this.visits.get(key)
    if (seen) {
      seen.count = Math.min(mostVisits, seen.count + 1)
      seen.last = now
      seen.url = u.href
      if (title) seen.title = title
      this.remember(seen)
    } else {
      const visit = { url: u.href, key, title, count: 1, last: now }
      this.visits.set(key, visit)
      this.remember(visit)
    }
    this.prune()
    this.save()
  }

  /** Somewhere another browser has been: the larger count, not the sum, so
   * bringing the same in again doesn't count twice (History.take). */
  take(url: string, title: string, count: number, last: number): void {
    const u = kept(url)
    if (!isWeb(u)) return
    const key = identity(u.href)
    const seen = this.visits.get(key)
    if (seen) {
      seen.count = Math.min(mostVisits, Math.max(seen.count, count))
      if (last > seen.last) seen.last = last
      if (!seen.title) seen.title = title
      this.remember(seen)
    } else {
      const visit = { url: u.href, key, title, count: Math.min(Math.max(count, 0), mostVisits), last }
      this.visits.set(key, visit)
      this.remember(visit)
    }
    this.prune()
  }

  /** After a batch of takes. */
  settle(): void { this.save() }

  /** A page's title usually lands a beat after the page does. */
  retitle(url: string, title: string): void {
    const key = identity(url)
    const seen = this.visits.get(key)
    if (!title || !seen || seen.title === title) return
    const first = !seen.title
    seen.title = title
    this.remember(seen)
    // Only the first title is written at once; one that keeps changing (an
    // inbox counting its mail) waits for the next write or for quitting.
    if (first) this.save()
    else this.owed = true
  }

  forget(url: string): void {
    const key = identity(url)
    if (!this.visits.delete(key)) return
    this.forgetText(key)
    this.save()
  }

  clear(): void {
    this.visits.clear()
    this.text.clear()
    this.weights.clear()
    this.hosts.clear()
    this.save()
  }

  private remember(visit: Visit): void {
    const text = pageText(visit.url, visit.title)
    text.weight = visit.count * Math.exp((visit.last - this.epoch) / fading)
    const old = this.text.get(visit.key)
    if (old) { this.credit(old, -old.weight); this.dropHost(old.host) }
    this.credit(text, text.weight)
    this.text.set(visit.key, text)
    if (text.host) this.hosts.set(text.host, (this.hosts.get(text.host) ?? 0) + 1)
  }

  private dropHost(host: string): void {
    if (!host) return
    const n = (this.hosts.get(host) ?? 0) - 1
    if (n > 0) this.hosts.set(host, n)
    else this.hosts.delete(host)
  }

  private forgetText(key: string): void {
    const old = this.text.get(key)
    if (!old) return
    this.credit(old, -old.weight)
    this.dropHost(old.host)
    this.text.delete(key)
  }

  private credit(text: PageText, weight: number): void {
    for (const prefix of text.trail) {
      const had = this.weights.get(prefix) ?? 0
      const now = had + weight
      // Nothing, or a crumb of rounding: the prefix is no longer anyone's.
      if (now > had * 1e-9 && now > 0) this.weights.set(prefix, now)
      else this.weights.delete(prefix)
    }
  }

  /** Cut back to the cap once memory is `slack` past it: the newest `slack`
   * stay whatever they score, the rest of the cap goes to the best scores. */
  private prune(): void {
    if (this.visits.size <= cap + slack) return
    const now = Date.now()
    const all = [...this.visits.values()]
    const newest = [...all].sort((a, b) => b.last - a.last).slice(0, slack)
    const keep = new Set(newest.map(v => v.key))
    const best = all.filter(v => !keep.has(v.key)).sort((a, b) => score(b, now) - score(a, now)).slice(0, cap - slack)
    for (const v of best) keep.add(v.key)
    for (const key of [...this.visits.keys()]) {
      if (keep.has(key)) continue
      this.visits.delete(key)
      this.forgetText(key)
    }
  }

  private save(): void {
    this.owed = false
    writeJSON(this.fileName, () => this.fileList(), 1500)
  }

  /** What the file holds: the best `cap` by score. */
  fileList(): Record<string, unknown>[] {
    const now = Date.now()
    return [...this.visits.values()]
      .sort((a, b) => score(b, now) - score(a, now))
      .slice(0, cap)
      .map(v => ({ url: v.url, key: v.key, title: v.title, count: v.count, last: toAppleDate(v.last) }))
  }

  /** Quitting: whatever the file doesn't have yet. */
  flush(): void { writeJSONNow(this.fileName, this.fileList()) }

  get owesWrite(): boolean { return this.owed }

  // reading

  /** Everywhere you have been, newest first; home-page credits without a
   * title of their own left out (History.everything). */
  everything(typed = ''): (Visit & { address: string })[] {
    const needle = typed.trim().toLowerCase()
    return [...this.visits.values()]
      .filter(v => !(v.title === '' && this.text.get(v.key)?.homepage))
      .filter(v => !needle || this.text.get(v.key)?.searchable.includes(needle) || v.title.toLowerCase().includes(needle))
      .sort((a, b) => b.last - a.last)
      .map(v => ({ ...v, address: this.text.get(v.key)?.address ?? v.key }))
  }

  visit(url: string): Visit | undefined { return this.visits.get(identity(url)) }

  /** How often each site has been visited, to weigh one against another
   * (History.visits(to:)): every page on its host and the host's subdomains,
   * or under its path for one like google.com/maps. */
  visitsTo(sites: string[]): Record<string, number> {
    const wanted = sites.map(site => {
      const lower = site.toLowerCase()
      const bare = lower.startsWith('www.') ? lower.slice(4) : lower
      const host = bare.split('/')[0]
      return { site, host, path: bare.slice(host.length) }
    })
    const counts: Record<string, number> = {}
    for (const v of this.visits.values()) {
      const text = this.text.get(v.key)
      if (!text) continue
      for (const one of wanted) {
        if (!(text.host === one.host || text.host.endsWith('.' + one.host))) continue
        if (one.path) {
          if (!text.searchable.startsWith(one.host + one.path)) continue
          const rest = text.searchable.slice(one.host.length + one.path.length)
          if (rest && !'/?#'.includes(rest[0])) continue
        }
        counts[one.site] = Math.min(mostVisits, (counts[one.site] ?? 0) + v.count)
      }
    }
    return counts
  }

  /** Best matches first: score = fit × log(2 + popularity) (History.suggestions). */
  suggestions(typed: string, limit = 5): Offer[] {
    const needle = stripped(typed)
    if (!needle) return []
    const words = needle.split(/\s+/).filter(Boolean)
    const fade = Math.exp(-(Date.now() - this.epoch) / fading)
    const best: { offer: Offer; score: number }[] = []
    const ahead = (s: number, key: string, other: { offer: Offer; score: number }) =>
      s === other.score ? key.length < other.offer.key.length : s > other.score
    const offer = (key: string, s: number, make: () => Offer | null) => {
      if (best.length === limit && !ahead(s, key, best[best.length - 1])) return
      const made = make()
      if (!made) return
      const at = best.findIndex(o => ahead(s, key, o))
      best.splice(at < 0 ? best.length : at, 0, { offer: made, score: s })
      if (best.length > limit) best.pop()
    }
    const visited = (visit: Visit, text: PageText, f: number) => {
      const popularity = Math.max(0, (this.weights.get(text.trail[text.trail.length - 1]) ?? 0) * fade)
      offer(text.address, f * Math.log(2 + popularity), () => ({ key: text.address, title: visit.title, url: visit.url, kind: 'visited' }))
    }
    const knownOffer = (site: typeof knownText[number], f: number) =>
      offer(site.host, f * knownWeight, () => ({ key: site.host, title: site.title, url: 'https://' + site.host + '/', kind: 'known' }))

    for (const [key, text] of this.text) {
      if (!holds(words, text.findable)) continue
      const f = fit(needle, words, text.searchable, text.findable)
      const visit = this.visits.get(key)
      if (f == null || !visit) continue
      visited(visit, text, f)
    }
    for (const site of knownText) {
      if (this.hosts.has(site.host) || !holds(words, site.findable)) continue
      const f = fit(needle, words, site.host, site.findable)
      if (f != null) knownOffer(site, f)
    }
    // Room left: a typo, fit 1. Slowest, so only then, from three letters.
    if (best.length < limit && [...needle].length >= 3) {
      for (const [key, text] of this.text) {
        const visit = this.visits.get(key)
        if (visit && Fuzzy.match(words, text.findable) === 0) visited(visit, text, 1)
      }
      for (const site of knownText) {
        if (!this.hosts.has(site.host) && Fuzzy.match(words, site.findable) === 0) knownOffer(site, 1)
      }
    }
    return best.map(o => o.offer)
  }
}

/** The same page twice: visits added up, the latest date, a title if either had one. */
function merged(a: Visit, b: Visit): Visit {
  const kept = a.last >= b.last ? { ...a } : { ...b }
  kept.count = Math.min(mostVisits, a.count + b.count)
  if (!kept.title) kept.title = a.last >= b.last ? b.title : a.title
  return kept
}

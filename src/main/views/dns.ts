// A site whose name couldn't be looked up is, as often as not, a site that
// is there: the resolver had a bad moment, the Wi-Fi was changing, a VPN was
// coming up. Chrome loads the page again by itself; Oriel said "No site at
// that address." and waited (Search 1.0.22, DNSRetry.swift).
//
// So a page that failed only on its lookup is asked for again after 1, 3 and
// 8 seconds while its tab is in sight, at once when the network changes or
// comes back, and for a tab out of sight once it is looked at. It stops at
// the first page that arrives, once the tries are used up, or as the tab
// goes somewhere else. A form or a POST is never sent again, nor an address
// typed without a scheme to a site never visited: most likely a typo.

import os from 'node:os'
import { net as electronNet } from 'electron'
import { net } from '../net'
import { probe } from '../paths'

/** The waits before each try, the first after one second. */
export const DNS_DELAYS = [1000, 3000, 8000]

/** What the page says while it tries again, and once it has stopped; the
 * second line is a hint, drawn smaller. */
export const TRYING = "Couldn't find this site. Trying again…"
export const GAVE_UP = "Couldn't find this site.\nCheck the address or your connection."

/** The name couldn't be looked up: not found, resolution failed, a DNS
 * answer malformed or too slow. */
export function isLookupFailure(code: number): boolean {
  return code === -105 || code === -137 || code === -800 || code === -803
}

/** Whether a page that failed on its lookup may be asked for again by
 * itself (DNSRetryPolicy.mayRetry): a plain GET of a web address, never a
 * form sent; not a name with no dot, which the field never takes for a
 * site; not an address typed without a scheme, neither picked nor finished
 * (`guessed`), to a site never visited (`known`). */
export function mayRetry(url: string, o: { method?: string; form?: boolean; guessed?: boolean; known?: boolean }): boolean {
  let u: URL
  try { u = new URL(url) } catch { return false }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false
  if (u.hostname.split('.').filter(Boolean).length < 2) return false
  const method = (o.method ?? 'GET').toUpperCase()
  if ((method !== 'GET' && method !== 'HEAD') || o.form) return false
  return !o.guessed || !!o.known
}

/** One page tried over http and https is one page: Try HTTPS first asks
 * for the https address before the http one, each failing on the same name. */
export function samePage(a: string, b: string): boolean {
  const bare = (s: string) => { try { return new URL(s).href.replace(/^https?:/i, '') } catch { return s } }
  return bare(a) === bare(b)
}

const hostOf = (url: string) => { try { return new URL(url).hostname.toLowerCase() } catch { return '' } }

// what each main-frame load asked for (method, a form's body)

const asked = new Map<number, { url: string; method: string; form: boolean }>()

net.onBeforeRequest('dns.asked', 0, d => {
  if (d.resourceType !== 'mainFrame' || d.webContentsId == null) return
  asked.set(d.webContentsId, { url: d.url, method: d.method, form: !!d.uploadData?.length })
})

/** How the page's last main-frame load was asked for, if it was `url`. */
export function askedFor(wcID: number, url: string): { method: string; form: boolean } | null {
  const a = asked.get(wcID)
  return a && samePage(a.url, url) ? a : null
}

export function forgetPage(wcID: number): void { asked.delete(wcID) }

// a tab's tries

export interface DnsHost {
  /** The tab is on screen. */
  sight(): boolean
  /** Ask for the page again. */
  load(url: string): void
  /** The address the tab says failed, if it still does. */
  failing(): string | null
}

const all = new Set<DnsRetry>()

export class DnsRetry {
  /** The page being tried, and how many tries it has had. */
  url: string | null = null
  done = 0
  private eligible = false
  private timer: NodeJS.Timeout | null = null
  /** Out of sight when its time came: it goes as the tab is looked at. */
  waitingForSight = false
  /** An address typed without a scheme, sent as the field guessed it. */
  private guessed: string | null = null

  constructor(private host: DnsHost, private known: (host: string) => boolean) {}

  /** Waiting for its time or for the tab to be looked at. */
  get pending(): boolean { return !!this.timer || this.waitingForSight }

  /** The field sent the tab to an address it made from what was typed. */
  typedGuess(url: string): void { this.guessed = url }

  /** The tab's frame is going to `url`: anywhere but the page being tried
   * ends the tries. */
  going(url: string): void {
    if (this.guessed && hostOf(this.guessed) !== hostOf(url)) this.guessed = null
    if (this.url && !samePage(this.url, url)) this.stop()
  }

  /** The page at `url` failed on its lookup; how it was asked for. What the
   * page should say. */
  failed(url: string, how: { method?: string; form?: boolean } | null): string {
    if (!this.url || !samePage(this.url, url)) {
      // A new page: the same one again is a try that didn't work, or Try again.
      this.stop()
      this.url = url
      this.done = 0
      const guess = !!this.guessed && hostOf(this.guessed) === hostOf(url)
      this.eligible = mayRetry(url, { method: how?.method, form: how?.form, guessed: guess, known: guess ? this.known(hostOf(url)) : true })
    }
    this.cancelTimer()
    const wait = this.eligible ? DNS_DELAYS[this.done] : undefined
    if (wait === undefined) {
      this.waitingForSight = false
      all.delete(this)
      return GAVE_UP
    }
    all.add(this)
    watchNetwork()
    if (this.host.sight()) {
      this.timer = setTimeout(() => this.fire(), wait)
      this.waitingForSight = false
    } else {
      this.waitingForSight = true
    }
    return TRYING
  }

  /** Nothing more to try: a page came, or the tab went elsewhere. */
  stop(): void {
    this.cancelTimer()
    this.waitingForSight = false
    this.url = null
    this.eligible = false
    all.delete(this)
  }

  private cancelTimer(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  /** The time has come, the tab was looked at, or the network changed. */
  fire(): void {
    if (!this.pending) return
    this.cancelTimer()
    const at = this.host.failing()
    if (!this.url || !at || !samePage(at, this.url)) { this.stop(); return }
    if (!this.host.sight()) { this.waitingForSight = true; return }
    this.waitingForSight = false
    this.done++
    this.host.load(this.url)
  }

  /** The tab came on screen: a try waiting for that goes now. */
  shown(): void { if (this.waitingForSight) this.fire() }

  /** Whether a try waits for its time in sight (a network change sends it at once). */
  get timed(): boolean { return !!this.timer }
}

/** The network changed or came back: every try waiting for its time, in
 * sight, goes now. */
export function networkChanged(): void {
  for (const r of [...all]) if (r.timed) r.fire()
}

// the network: Electron's main process has no event for it, so while a try
// is pending its shape is looked at each second (online, and the interfaces
// with their addresses: a Wi-Fi changing or a VPN coming up changes them).

let watching: NodeJS.Timeout | null = null
let lastShape: string | null = null

function shape(): string {
  const online = electronNet.isOnline()
  const parts: string[] = []
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list ?? []) if (!a.internal) parts.push(`${name}=${a.address}`)
  }
  return `${online}|${parts.sort().join(',')}`
}

function watchNetwork(): void {
  if (watching) return
  lastShape = shape()
  watching = setInterval(() => {
    if (!all.size) { clearInterval(watching!); watching = null; lastShape = null; return }
    const now = shape()
    const changed = now !== lastShape
    lastShape = now
    if (changed && now.startsWith('true|')) networkChanged()
  }, 1000)
  watching.unref?.()
}

// tests: hosts whose next main-frame loads fail as a lookup does, before
// anything is asked of the network (DNSRetry.testFailures). A load stopped
// here ends as Chromium's ERR_BLOCKED_BY_CLIENT, read back as a lookup failure.

export const testFailures = new Map<string, number>()
const injected = new Set<string>()

if (probe) {
  net.onBeforeRequest('dns.test', 1, d => {
    if (d.resourceType !== 'mainFrame') return
    const host = hostOf(d.url)
    const left = testFailures.get(host) ?? 0
    if (left <= 0) return
    testFailures.set(host, left - 1)
    injected.add(`${d.webContentsId} ${d.url}`)
    return { cancel: true }
  })
}

/** A failure the test made (consumed once read). */
export function madeForTest(wcID: number, url: string): boolean {
  return injected.delete(`${wcID} ${url}`)
}

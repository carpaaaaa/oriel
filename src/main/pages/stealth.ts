// Hide the blocker from sites (Settings › Privacy › Blocking, on by
// default). A page tells an ad blocker is there by what it can measure: a
// script that fails to load (its error event), a fetch or an XMLHttpRequest
// that fails, a stand-in that runs too late, a bait element (an empty
// "adsbox" off the screen) that the hiding rules collapse. The network half
// lives here: every request Shield refuses for a page is noted, with the
// stand-in script that answers it, so the page's preload (src/preload/page/
// stealth.ts) can turn that failure into a load the page can't tell from a
// real one, and run the stand-in first, in order. A script refused without a
// $redirect of the lists still gets uBlock Origin's stand-in where one
// exists (adsbygoogle.js, gpt.js, analytics.js...): a page checking that the
// ad library is there finds it. Read on every request and every question, so
// the switch takes effect at once; a page opened before only follows it
// after it loads again (its hooks go in as it starts).

import { ipcMain, type WebFrameMain } from 'electron'
import { blocker } from './blocker'
import { hostOf, pref, shieldOn } from './facts'

/** The switch itself, under Block ads and trackers (shared/prefs.ts). */
export const stealthPref = (): boolean => pref<boolean>('shield.stealth') !== false

/** Pages made to test an ad blocker, by counting what fails to load: they
 * are told the truth, or they would say nothing is blocked. */
const TEST_PAGES = ['adblock.turtlecute.org', 'd3ward.github.io', 'adblock-tester.com', 'blockads.fivefilters.org', 'canyoublockit.com', 'checkadblock.ru']
const testPage = (host: string | null) => !!host && TEST_PAGES.some(t => host === t || host.endsWith('.' + t))

/** Hide the blocker from a page on `host`: Shield works there, the switch
 * is on, and it isn't a page that tests the blocker. */
export function stealthOn(host: string | null): boolean {
  return shieldOn(host) && stealthPref() && !testPage(host)
}

/** One address's refusals, not yet asked about: each failure the page sees
 * answers one refusal and no more, on the site it was refused for, within
 * a short while; a real failure is never taken for one. */
interface Noted {
  /** Refusals not yet asked about, with the site at the top of each. */
  open: { top: string; at: number }[]
  /** The stand-in script, and how many refusals left it to the page's preload. */
  standIn?: string
  pending: number
}

/** Addresses refused lately, oldest first (a Map keeps its order). */
const noted = new Map<string, Noted>()
const MOST = 2000
/** A failure comes within milliseconds of its refusal: past this, it's another. */
const FRESH = 20_000

/** An address as both sides write it: no fragment (the network never sees one). */
export const plain = (url: string): string => { const i = url.indexOf('#'); return i < 0 ? url : url.slice(0, i) }

const siteOfHost = (host: string | null) => host?.replace(/^www\./, '') ?? ''

/** A refused request: its address, the site at the top, and the stand-in
 * script for it when it's the page's preload to run (`toPage`). One the
 * preload doesn't take within a second (a worker's script, an import(), an
 * element gone before its error) is run by `fallback` instead, as before. */
export function note(url: string, topHost: string | null, standIn?: string, toPage = false, fallback?: () => void): void {
  const key = plain(url)
  const now = Date.now()
  const n = noted.get(key) ?? { open: [], pending: 0 }
  noted.delete(key)
  n.open = n.open.filter(o => now - o.at < FRESH).slice(-20)
  n.open.push({ top: siteOfHost(topHost), at: now })
  if (standIn && toPage) {
    n.standIn = standIn
    n.pending++
    if (fallback) setTimeout(() => { if (n.pending > 0) { n.pending--; try { fallback() } catch {} } }, 1000).unref?.()
  }
  noted.set(key, n)
  if (noted.size > MOST) noted.delete(noted.keys().next().value!)
}

/** What a page's preload is told about one of its failures: refused by
 * Oriel for this site moments ago, or not (null); for a script element
 * (`script`), with the stand-in for it to run, if it is the preload's. */
export function asked(url: string, topHost: string | null, script = false): { standIn?: string } | null {
  if (!stealthPref() || typeof url !== 'string' || url.length > 8192) return null
  const key = plain(url)
  const n = noted.get(key)
  if (!n) return null
  const now = Date.now(), site = siteOfHost(topHost)
  const i = n.open.findIndex(o => o.top === site && now - o.at < FRESH)
  if (i < 0) return null
  n.open.splice(i, 1)
  let answer: { standIn?: string } = {}
  if (script && n.standIn && n.pending > 0) { n.pending--; answer = { standIn: n.standIn } }
  if (!n.open.length && !n.pending) noted.delete(key)
  return answer
}

// Frames whose preload hooks the page (pages:prefs and pages:frame said so
// as the document started): their stand-ins run from the preload, at the
// script's own error event, before the page hears of it. Any other frame
// (about:blank, one whose document came since) gets them from here, as before.

const hooked = new Map<string, string>()
const keyOf = (f: WebFrameMain): string | null => { try { return `${f.processId}:${f.routingId}` } catch { return null } }
const originOf = (u: string) => { try { return new URL(u).origin } catch { return '' } }

/** A document starting in `frame` with the hooks (or without: `on` false). */
export function hookedFrame(frame: WebFrameMain | null | undefined, url: string, on: boolean): void {
  const key = frame && keyOf(frame)
  if (!key) return
  hooked.delete(key)
  if (on) {
    hooked.set(key, originOf(url))
    if (hooked.size > 500) hooked.delete(hooked.keys().next().value!)
  }
}

/** The frame's document has the hooks: the same one that said so (same origin). */
export function frameHooked(frame: WebFrameMain | null | undefined): boolean {
  if (!frame || !stealthPref()) return false
  const key = keyOf(frame)
  const origin = key && hooked.get(key)
  if (!origin) return false
  try { return originOf(frame.url) === origin } catch { return false }
}

// uBlock Origin's stand-ins for the ad and analytics libraries pages look
// for, by the address a page loads them from: a script the lists refuse
// without naming one of their own.
// (A port is allowed after a host, which these never have and a test server does.)
const SURROGATES: [RegExp, string][] = [
  [/^https?:\/\/pagead2\.googlesyndication\.com(?::\d+)?\/pagead\/js\/adsbygoogle\.js/i, 'googlesyndication_adsbygoogle.js'],
  [/^https?:\/\/(?:(?:www\.)?googletagservices\.com|securepubads\.g\.doubleclick\.net|pagead2\.googlesyndication\.com)(?::\d+)?\/tag\/js\/gpt\.js/i, 'googletagservices_gpt.js'],
  [/^https?:\/\/(?:www\.|ssl\.)?google-analytics\.com(?::\d+)?\/analytics\.js/i, 'google-analytics_analytics.js'],
  [/^https?:\/\/(?:www\.|ssl\.)?google-analytics\.com(?::\d+)?\/ga\.js/i, 'google-analytics_ga.js'],
  [/^https?:\/\/(?:www\.)?googletagmanager\.com(?::\d+)?\/gtm\.js/i, 'google-analytics_analytics.js'],
  [/^https?:\/\/c\.amazon-adsystem\.com(?::\d+)?\/aax2\/apstag\.js/i, 'amazon_apstag.js'],
  [/^https?:\/\/imasdk\.googleapis\.com(?::\d+)?\/js\/sdkloader\/ima3\.js/i, 'google-ima.js'],
  [/^https?:\/\/[^?#]*\/(?:fuck|block)adblock[^/?#]*\.js/i, 'nofab.js'],
  // A site's own bait (ads.js, prebid-ads.js...) that sets a flag when it runs.
  [/^https?:\/\/[^?#]*\/(?:ads|ad|adsbygoogle|advertisement|advertising|prebid-ads|ads-prebid|adframe|banner-ads?|show_ads)\.js(?:[?#]|$)/i, 'prebid-ads.js'],
]

/** The stand-in for a refused script, when uBlock Origin has one for its address. */
export function surrogateFor(url: string): { body: string; contentType: string } | null {
  const hit = SURROGATES.find(([re]) => re.test(url))
  if (!hit) return null
  try {
    const r = blocker()?.resources.getResource(hit[1])
    return r && typeof r.body === 'string' && r.body ? { body: r.body, contentType: r.contentType } : null
  } catch { return null }
}

/** For the bench: what is noted. */
export const notedNow = (): { url: string; open: number; pending: number }[] => [...noted].slice(-50).map(([url, n]) => ({ url, open: n.open.length, pending: n.pending }))

// The page's preload asks as one of its loads fails (a script, a picture, a
// stylesheet, a fetch, an XMLHttpRequest): only failures, never a request
// that went through, so a page costs nothing while nothing is refused.
ipcMain.on('pages:hushed', (event, url: unknown, script: unknown) => {
  let answer: { standIn?: string } | null = null
  try {
    const top = event.senderFrame?.top?.url ?? event.sender.getURL()
    const host = hostOf(top)
    if (stealthOn(host)) answer = asked(String(url ?? ''), host, script === true)
  } catch {}
  event.returnValue = answer
})

// What each page's preload is given as it starts (src/preload/page/pages.ts),
// and told again when one of these switches moves: a page already open
// follows from then on, as the Mac's do from their next request or event.
// Shield's page script for YouTube waits for the page's next load, as on
// the Mac (it goes in before the page's own scripts).

import { ipcMain, type WebContents } from 'electron'
import { handle } from '../router'
import { runtimes } from '../views/tabs'
import { model } from '../model/model'
import { gpcFor, protects } from './privacy'
import { hostOf, pref, shieldOn, testHosts } from './facts'
import { hidingCSS, siteOf, standInPattern, youtubeHosts } from './lists'
import { blocker, cosmeticsFor, cosmeticsForDOM, enclosed } from './blocker'
import { siteStyle, styleChanged } from './styles'
import { watchEscape } from './escape'

export interface PagePrefs {
  css: string
  /** The lists' scriptlets for this page, run before its own scripts. */
  scripts: string[]
  /** The lists' procedural filters for this page. */
  extended: unknown[]
  /** Ask for the generic rules that match the page's classes and ids. */
  dom: boolean
  youtube: string[] | null
  standIn: string
  gpc: boolean
  mediaClick: boolean
  escapeTwice: boolean
  autoscroll: boolean
  optionSplit: boolean
  peek: string
  bounce: boolean
  style: string
  /** YouTube's hosts while Hide YouTube Shorts is on, null otherwise. */
  noShorts: string[] | null
  /** Copying set free on this page (everywhere, or this site). */
  copyFree: boolean
  /** Settings > Floating video: a site's own picture in picture button floats the video, or is refused. */
  floatOn: boolean
}

/** Let me copy on every site, or this one (a tab's menu, copy.sites). */
export function copyFreeOn(host: string | null): boolean {
  if (pref<boolean>('pages.allowCopy')) return true
  const site = host?.replace(/^www\./, '')
  return !!site && (pref<string[]>('copy.sites') ?? []).includes(site)
}

const peekChoice = () => (pref<boolean>('links.peek') ? (pref<string>('links.peekClick') || 'shift') : 'off')

export function pagePrefs(wc: WebContents, address: string): PagePrefs | null {
  if (/^(oriel|devtools|chrome|chrome-extension):/i.test(address)) return null
  const host = hostOf(address)
  const shield = shieldOn(host)
  const lists = shield && host ? cosmeticsFor(address) : null
  const engine = shield && !!blocker()
  // The lists turn everything off here (@@||site^$document): Search's own too.
  const allowed = engine && host && /^https?:/i.test(address) && !lists
  const own = shield && host && !allowed ? hidingCSS(host, testHosts('test.redditHosts'), engine) : ''
  return {
    css: [own, lists?.styles ?? ''].filter(Boolean).join('\n'),
    scripts: (lists?.scripts ?? []).map(enclosed),
    extended: lists?.extended ?? [],
    dom: !!lists,
    youtube: shield ? [...youtubeHosts, ...testHosts('test.youtubeHosts')] : null,
    standIn: standInPattern,
    gpc: gpcFor(wc),
    mediaClick: !!pref<boolean>('media.click'),
    escapeTwice: !!pref<boolean>('fullscreen.escapeTwice'),
    autoscroll: !!pref<boolean>('autoscroll'),
    optionSplit: !!pref<boolean>('links.optionSplit'),
    peek: peekChoice(),
    bounce: !!pref<boolean>('pages.bounce'),
    style: host ? siteStyle(host) : '',
    noShorts: pref<boolean>('youtube.hideShorts') ? [...youtubeHosts, ...testHosts('test.youtubeHosts')] : null,
    copyFree: copyFreeOn(host),
    floatOn: pref<boolean>('float.enabled') !== false,
  }
}

/** A frame's own address (an about:blank or srcdoc frame: its origin's)
 * and its page's, as the main process knows them. */
function frameAddresses(frame: Electron.WebFrameMain, wc: WebContents): { url: string; top: string; ancestors: string[] } {
  const http = (u: string | undefined) => (u && /^https?:/i.test(u) ? u : '')
  const url = http(frame.url) || (http(frame.origin) ? frame.origin + '/' : '')
  const ancestors: string[] = []
  for (let f = frame.parent; f; f = f.parent) ancestors.push(f.url)
  return { url, top: frame.top?.url || wc.getURL(), ancestors }
}

// The generic hiding rules for the classes, ids and links a page (or one
// of its frames) has: the preload sends them as they appear.
ipcMain.handle('pages:cosmetics', (event, features: { classes?: unknown; ids?: unknown; hrefs?: unknown }) => {
  const frame = event.senderFrame
  if (!frame) return ''
  const { url, top } = frameAddresses(frame, event.sender)
  if (!url || !/^https?:/i.test(top) || !shieldOn(hostOf(top))) return ''
  // A page sends what it likes: so many names, each of a sensible length
  // (a class or an id of 256 characters at most, a link of 2,048).
  const strings = (v: unknown, longest: number) => (Array.isArray(v) ? v.slice(0, 5000).filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length <= longest) : [])
  return cosmeticsForDOM(url, strings(features?.classes, 256), strings(features?.ids, 256), strings(features?.hrefs, 2048))
})

/** Frames given their share, for the bench. */
export const framesDressed: { url: string; css: number; scripts: number; noCookies: boolean }[] = []

// What a frame is given as it starts (src/preload/page/frame.ts).
ipcMain.on('pages:frame', event => {
  // The answer goes back the first time returnValue is set: once, at the end.
  let answer: unknown = null
  try { answer = framePrefs(event) } catch (error) { console.warn('[pages] frame', error) }
  event.returnValue = answer
})

function framePrefs(event: Electron.IpcMainEvent): unknown {
  const wc = event.sender
  const frame = event.senderFrame
  if (!frame || frame === wc.mainFrame) return null
  const { url, top, ancestors } = frameAddresses(frame, wc)
  // Oriel's own pages and an extension's: their frames are theirs.
  if (!/^https?:/i.test(top)) return null
  const topHost = hostOf(top)
  const shield = shieldOn(topHost)
  const lists = shield && url ? cosmeticsFor(url, ancestors) : null
  const engine = shield && !!blocker()
  const own = shield && topHost && !(engine && !lists && url) ? hidingCSS(topHost, testHosts('test.redditHosts'), engine) : ''
  const third = !!url && siteOf(hostOf(url) ?? '') !== siteOf(topHost ?? '')
  const p = {
    css: [own, lists?.styles ?? ''].filter(Boolean).join('\n'),
    scripts: (lists?.scripts ?? []).map(enclosed),
    extended: lists?.extended ?? [],
    dom: !!lists,
    gpc: gpcFor(wc),
    noCookies: third && protects(wc),
  }
  framesDressed.push({ url, css: p.css.length, scripts: p.scripts.length, noCookies: p.noCookies })
  if (framesDressed.length > 50) framesDressed.shift()
  return p
}

/** Pages whose preload asked, with the address it asked for. */
const pages = new Map<WebContents, string>()

ipcMain.on('pages:prefs', (event, address: string) => {
  const wc = event.sender
  let p: PagePrefs | null = null
  try { p = pagePrefs(wc, String(address ?? '')) } catch (error) { console.warn('[pages] prefs', error) }
  event.returnValue = p
  if (!p) return
  watchEscape(wc)
  if (!pages.has(wc)) wc.once('destroyed', () => pages.delete(wc))
  pages.set(wc, String(address))
})

/** Tell every page what it would be given now, if that changed. */
export function retell(): void {
  for (const [wc, first] of pages) {
    if (wc.isDestroyed()) { pages.delete(wc); continue }
    const address = wc.getURL() || first
    const p = pagePrefs(wc, address)
    if (p) wc.send('pages:prefs', p)
  }
}

const watched = ['youtube.hideShorts', 'shield', 'shield.paused', 'media.click', 'fullscreen.escapeTwice', 'autoscroll', 'links.optionSplit', 'links.peek', 'links.peekClick', 'pages.bounce', 'sites.styles', 'privacy.gpc', 'float.enabled']
let last = ''
let timer: NodeJS.Timeout | null = null
model.on('window-changed', (_id: string, slices: string[]) => {
  if (!slices.includes('prefs') || timer) return
  timer = setTimeout(() => {
    timer = null
    const now = JSON.stringify(watched.map(k => model.pref(k)))
    if (now === last) return
    last = now
    retell()
  }, 0)
})

styleChanged.push(() => retell())

// A tab's menu › Allow Copying on This Site: kept by site, the page again.
handle('pages.copy.site', ({ id, on }) => {
  const t = model.tabs.get(id)
  const site = t && /^https?:/i.test(t.url) ? hostOf(t.url)?.replace(/^www\./, '') : null
  if (!t || !site) return
  const sites = new Set(pref<string[]>('copy.sites') ?? [])
  if (on) sites.add(site); else sites.delete(site)
  model.setPref('copy.sites', [...sites].sort())
  runtimes.get(id)?.contents?.reload()
})

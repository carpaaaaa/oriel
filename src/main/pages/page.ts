// What each page's preload is given as it starts (src/preload/page/pages.ts),
// and told again when one of these switches moves: a page already open
// follows from then on, as the Mac's do from their next request or event.
// Shield's page script for YouTube waits for the page's next load, as on
// the Mac (it goes in before the page's own scripts).

import { ipcMain, type WebContents } from 'electron'
import { model } from '../model/model'
import { gpcFor } from './privacy'
import { hostOf, pref, shieldOn, testHosts } from './facts'
import { hidingCSS, standInPattern, youtubeHosts } from './lists'
import { siteStyle, styleChanged } from './styles'
import { watchEscape } from './escape'

export interface PagePrefs {
  css: string
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
}

const peekChoice = () => (pref<boolean>('links.peek') ? (pref<string>('links.peekClick') || 'shift') : 'off')

export function pagePrefs(wc: WebContents, address: string): PagePrefs | null {
  if (/^(oriel|devtools|chrome|chrome-extension):/i.test(address)) return null
  const host = hostOf(address)
  const shield = shieldOn(host)
  return {
    css: shield && host ? hidingCSS(host, testHosts('test.redditHosts')) : '',
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
  }
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

const watched = ['shield', 'shield.paused', 'media.click', 'fullscreen.escapeTwice', 'autoscroll', 'links.optionSplit', 'links.peek', 'links.peekClick', 'pages.bounce', 'sites.styles', 'privacy.gpc']
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

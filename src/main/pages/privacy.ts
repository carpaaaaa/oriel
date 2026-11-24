// Settings › Privacy › Blocking, the parts WebKit does for the Mac and
// Chromium in Electron doesn't (studio/06 §2.3, §2.4; Privacy.swift,
// Store.swift). Each is read on every request, so a switch reaches the next
// load of every page. A private tab always has all of them.
//  - Remove click trackers from links: gclid, fbclid and the like taken off
//    a page's address before it loads (order 300, with the clean links):
//    Search's list (CleanLink.tracking without utm_), never on a signed
//    address. Campaign tags (utm_) stay, as the row says. The lists'
//    $removeparam for pages (uBlock filters: Privacy) are Block ads and
//    trackers', as in uBlock Origin: with it off, or off for the site,
//    they leave the address alone.
//  - Tell sites not to sell or share your data: Sec-GPC: 1 on every request
//    (navigator.globalPrivacyControl is the preload's).
//  - Try HTTPS first: a top-level http:// load tried over https://, and
//    over http:// again, quietly, where that fails or the site sends it
//    back to http (no redirect loop); local addresses left. A host is then
//    asked for over http for a week only if http worked where https didn't
//    (a site down, or no network, isn't https failing), as Chrome's
//    HTTPS-First keeps its fallbacks for a while, not for ever.
//  - Prevent cross-site tracking: a site inside another gets no cookies and
//    keeps none (WebKit's "cookies only from the main document's site").

import { app, type WebContents } from 'electron'
import { net } from '../net'
import { localHost, withoutClickIDs } from './lists'
import { hostOf, pref, shieldOn, shyContents, thirdParty, topAddress } from './facts'
import { paramsToRemove } from './blocker'
import { contextOf } from './shield'

// Remove click trackers from links

net.onBeforeRequest('click-ids', 300, d => {
  if (d.resourceType !== 'mainFrame' && d.resourceType !== 'subFrame') return
  if (d.method !== 'GET') return
  if (!pref<boolean>('privacy.clickIDs') && !shyContents(d.webContents)) return
  let more: Set<string> | undefined
  const top = d.resourceType === 'mainFrame' ? d.url : topAddress(d)
  if (shieldOn(hostOf(top))) {
    try { more = paramsToRemove(d.url, d.resourceType === 'mainFrame' ? 'main_frame' : 'sub_frame', d.resourceType === 'mainFrame' ? d.url : contextOf(d)) } catch {}
  }
  // utm_ stays even where a list would take it (the row promises it).
  if (more) for (const name of more) if (/^utm_/i.test(name)) more.delete(name)
  const clean = withoutClickIDs(d.url, more)
  if (clean !== d.url) return { redirectURL: clean }
})

// Global Privacy Control

/** Sends it for this page's requests (the switch, or a private tab). */
export const gpcFor = (wc: WebContents | undefined | null) => pref<boolean>('privacy.gpc') !== false || shyContents(wc)

net.onBeforeSendHeaders('gpc', 100, (d, headers) => {
  if (!gpcFor(d.webContents)) return
  headers['Sec-GPC'] = '1'
})

// Prevent cross-site tracking (the switch is inverted: sites.keep true = off)

export const protects = (wc: WebContents | undefined | null) => !pref<boolean>('sites.keep') || shyContents(wc)

function drop(headers: Record<string, unknown>, name: string): void {
  for (const k of Object.keys(headers)) if (k.toLowerCase() === name) delete headers[k]
}

net.onBeforeSendHeaders('cross-site-cookies', 110, (d, headers) => {
  if (protects(d.webContents) && thirdParty(d)) drop(headers, 'cookie')
})

net.onHeadersReceived('cross-site-cookies', 110, (d, headers) => {
  if (protects(d.webContents) && thirdParty(d)) drop(headers, 'set-cookie')
})

// Try HTTPS first

/** https address tried → the http one asked for. */
const tried = new Map<string, string>()
/** A load (webRequest's id, the same through its redirects) → the hosts it
 * was sent to over https: one that comes back to http there is the site's
 * answer, and is let through. */
const upgraded = new Map<number, Set<string>>()
/** The http address of a fall back, let through once. */
const once = new Set<string>()
/** A page loading its fall back: the host, marked if http works. */
const falling = new WeakMap<WebContents, string>()
/** Hosts whose HTTPS really failed (http worked where it didn't), asked for
 * as they are until then. */
export const fallen = new Map<string, number>()
const FALLEN_FOR = 7 * 24 * 60 * 60 * 1000
/** Addresses that went back to http, for the bench. */
export const fellBack: string[] = []

function hasFallen(host: string): boolean {
  const until = fallen.get(host)
  if (until === undefined) return false
  if (Date.now() < until) return true
  fallen.delete(host)
  return false
}

function fall(host: string): void {
  fallen.delete(host)
  fallen.set(host, Date.now() + FALLEN_FOR)
  if (fallen.size > 1000) fallen.delete(fallen.keys().next().value!)
}

const hostWithPort = (url: string) => { try { return new URL(url).host } catch { return '' } }

function noteFellBack(url: string): void {
  fellBack.push(url)
  if (fellBack.length > 50) fellBack.shift()
}

net.onBeforeRequest('https-first', 310, d => {
  if (d.resourceType !== 'mainFrame' || d.method !== 'GET' || !pref<boolean>('privacy.httpsFirst')) return
  let u: URL
  try { u = new URL(d.url) } catch { return }
  if (u.protocol !== 'http:' || localHost(u.hostname)) return
  if (once.delete(d.url)) return
  const hosts = upgraded.get(d.id)
  if (hosts?.has(u.host)) {
    // https sent this load back to http on a host it was upgraded for:
    // upgrading again would loop (ERR_TOO_MANY_REDIRECTS). The site works
    // over http only.
    for (const [to, asked] of tried) if (hostWithPort(asked) === u.host) tried.delete(to)
    fall(u.host)
    noteFellBack(d.url)
    return
  }
  if (hasFallen(u.host)) return
  u.protocol = 'https:'
  const to = u.toString()
  tried.set(to, d.url)
  if (tried.size > 200) tried.delete(tried.keys().next().value!)
  const set = hosts ?? new Set<string>()
  set.add(u.host)
  upgraded.set(d.id, set)
  if (upgraded.size > 200) upgraded.delete(upgraded.keys().next().value!)
  return { redirectURL: to }
})

function watchFallback(wc: WebContents): void {
  wc.on('did-fail-load', (_e, code, _description, url, isMainFrame) => {
    if (!isMainFrame) return
    // The fall back itself failed: the site is down, or there is no network.
    if (falling.get(wc) && /^http:/i.test(url)) falling.delete(wc)
    const asked = tried.get(url)
    if (!asked) return
    tried.delete(url)
    if (code === -3) return // stopped or replaced: nothing failed
    noteFellBack(asked)
    const failed = url
    wc.once('did-navigate', () => {
      // The failed attempt leaves no step in Back.
      try {
        const h = wc.navigationHistory
        const i = h.getActiveIndex()
        if (i > 0 && h.getEntryAtIndex(i - 1)?.url === failed) h.removeEntryAtIndex(i - 1)
      } catch {}
    })
    if (wc.isDestroyed()) return
    falling.set(wc, hostWithPort(asked))
    once.add(asked)
    if (once.size > 50) once.delete(once.keys().next().value!)
    wc.loadURL(asked).catch(() => {})
  })
  wc.on('did-navigate', (_e, url) => {
    tried.delete(url)
    const host = falling.get(wc)
    if (host === undefined) return
    falling.delete(wc)
    // http worked where https didn't: this host's HTTPS really fails.
    try { const u = new URL(url); if (u.protocol === 'http:' && u.host === host) fall(host) } catch {}
  })
}

app.on('web-contents-created', (_e, wc) => watchFallback(wc))

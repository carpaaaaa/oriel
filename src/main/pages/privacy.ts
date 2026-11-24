// Settings › Privacy › Blocking, the parts WebKit does for the Mac and
// Chromium in Electron doesn't (studio/06 §2.3, §2.4; Privacy.swift,
// Store.swift). Each is read on every request, so a switch reaches the next
// load of every page. A private tab always has all of them.
//  - Remove click trackers from links: gclid, fbclid and the like taken off
//    a page's address before it loads (order 300, with the clean links).
//  - Tell sites not to sell or share your data: Sec-GPC: 1 on every request
//    (navigator.globalPrivacyControl is the preload's).
//  - Try HTTPS first: a top-level http:// load tried over https://, and
//    over http:// again, quietly, where that fails; local addresses left.
//  - Prevent cross-site tracking: a site inside another gets no cookies and
//    keeps none (WebKit's "cookies only from the main document's site").

import { app, type WebContents } from 'electron'
import { net } from '../net'
import { localHost, withoutClickIDs } from './lists'
import { pref, shyContents, thirdParty } from './facts'

// Remove click trackers from links

net.onBeforeRequest('click-ids', 300, d => {
  if (d.resourceType !== 'mainFrame' && d.resourceType !== 'subFrame') return
  if (d.method !== 'GET') return
  if (!pref<boolean>('privacy.clickIDs') && !shyContents(d.webContents)) return
  const clean = withoutClickIDs(d.url)
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
/** Hosts whose HTTPS failed in this run: asked for as they are. */
export const fallen = new Set<string>()
/** Addresses that went back to http, for the bench. */
export const fellBack: string[] = []

net.onBeforeRequest('https-first', 310, d => {
  if (d.resourceType !== 'mainFrame' || d.method !== 'GET' || !pref<boolean>('privacy.httpsFirst')) return
  let u: URL
  try { u = new URL(d.url) } catch { return }
  if (u.protocol !== 'http:' || localHost(u.hostname) || fallen.has(u.host)) return
  u.protocol = 'https:'
  const to = u.toString()
  tried.set(to, d.url)
  return { redirectURL: to }
})

function watchFallback(wc: WebContents): void {
  wc.on('did-fail-load', (_e, code, _description, url, isMainFrame) => {
    if (!isMainFrame) return
    const asked = tried.get(url)
    if (!asked) return
    tried.delete(url)
    if (code === -3) return // stopped or replaced: nothing failed
    try { fallen.add(new URL(asked).host) } catch {}
    fellBack.push(asked)
    if (fellBack.length > 50) fellBack.shift()
    const failed = url
    wc.once('did-navigate', () => {
      // The failed attempt leaves no step in Back.
      try {
        const h = wc.navigationHistory
        const i = h.getActiveIndex()
        if (i > 0 && h.getEntryAtIndex(i - 1)?.url === failed) h.removeEntryAtIndex(i - 1)
      } catch {}
    })
    if (!wc.isDestroyed()) wc.loadURL(asked).catch(() => {})
  })
  wc.on('did-navigate', (_e, url) => { tried.delete(url) })
}

app.on('web-contents-created', (_e, wc) => watchFallback(wc))

// Block ads and trackers (studio/06 §2.1, §2.2; Shield.swift, YouTubeAds.swift).
// The network half, through the one webRequest owner (src/main/net, Shield
// at order 100): uBlock Origin's default lists (blocker/), as uBlock Origin
// applies them: blocked, or answered by a harmless stand-in where a page
// needs the script to exist ($redirect), parameters taken off ($removeparam),
// the lists' exceptions (@@) and $important honoured, a whole page left
// alone where a list says so ($document). A page itself is blocked only by
// a filter written for pages ($document, or $all, as the Badware list
// writes them), with the tab's "A block list stopped this page."; a tab or
// a window a page opens is refused by a $popup filter for it (as uBlock
// Origin closes the pop-up); the lists' CSP is added to the pages they name. Search's own rules (its 52 third parties and YouTube's ad
// paths) still apply where the lists say nothing, and give way to their
// exceptions; with no engine at all (it couldn't be read) they are all
// there is, as on the Mac. Read on every request, so the switch and a
// site's pause take effect on the next one. The hiding rules, procedural
// filters and scriptlets go into each page from the preload
// (src/preload/page/pages.ts) with what pagePrefs() hands it.

import type { OnBeforeRequestListenerDetails } from 'electron'
import { net } from '../net'
import { addDefaults } from '../../shared/prefs'
import { handle } from '../router'
import { model } from '../model/model'
import { hooks, runtimes } from '../views/tabs'
import { hostOf, shieldOn, testHosts, thirdParty, topAddress } from './facts'
import { isUnwanted, youtubeRule } from './lists'
import { blocker, cspFor, excepted, forDocuments, pageAllowed, popupBlocked, request } from './blocker'
import { frameHooked, note as noteQuietly, stealthOn, surrogateFor } from './stealth'

addDefaults({ 'shield.paused': [] as string[] })

/** What was blocked last, for the bench (no counter is shown anywhere). */
export const blocked: string[] = []
/** What was answered by a stand-in or had parameters taken off, for the bench. */
export const redirected: string[] = []

const note = (list: string[], url: string) => { list.push(url); if (list.length > 200) list.shift() }

type Details = Pick<OnBeforeRequestListenerDetails, 'url' | 'resourceType' | 'frame' | 'webContents' | 'referrer'>

/** The document a request comes from (uBlock Origin's context): the frame
 * that asks, its parent for a frame being loaded; an about:blank frame is
 * its creator's. */
export function contextOf(d: Details): string {
  let f: Electron.WebFrameMain | null | undefined
  try { f = d.frame } catch { f = null }
  try { if (d.resourceType === 'subFrame') f = f?.parent } catch { f = null }
  for (let hops = 0; f && hops < 20; hops++) {
    try {
      const u = f.url
      if (/^https?:/i.test(u)) return u
      const o = f.origin
      if (o && /^https?:/i.test(o)) return o + '/'
      f = f.parent
    } catch { break }
  }
  return topAddress(d) ?? d.referrer ?? ''
}

/** $redirect: Chromium in Electron refuses a webRequest redirect to a data:
 * address (or to any scheme but http and https), so the stand-in script
 * runs in the frame that asked, in its own world, sent before the request
 * is refused; any other resource (an image, a sound) is refused as is.
 * With Hide the blocker from sites (`quiet`, stealth.ts), the refusal is
 * noted for the page's preload, and a frame whose preload hooks the page
 * runs the stand-in itself at the script's error event, so the page finds
 * it in place when it hears the script loaded. */
function standIn(d: Details, resource: { body: string; contentType: string } | null, quiet: boolean, topHost: string | null): void {
  const js = !!resource && d.resourceType === 'script' && /javascript/i.test(resource.contentType) && !/base64/i.test(resource.contentType)
  let frame: Electron.WebFrameMain | null | undefined
  try { frame = d.frame } catch { frame = null }
  const run = () => { try { void frame?.executeJavaScript(`(function(){try{\n${resource!.body}\n}catch(e){}})();`).catch(() => {}) } catch {} }
  // The preload takes it at the script's error event; one it doesn't take
  // within a second (a worker's script, an import()) is run from here.
  if (js && quiet && frameHooked(frame)) { noteQuietly(d.url, topHost, resource!.body, true, run); return }
  if (js) run()
  if (quiet) noteQuietly(d.url, topHost)
}

net.onBeforeRequest('shield', 100, d => {
  if (!/^(https?|wss?):/i.test(d.url)) return
  const top = topAddress(d)
  const topHost = hostOf(top)
  if (!shieldOn(topHost)) return
  // Extension pages and Oriel's own: their requests are theirs.
  if (top && !/^https?:/i.test(top)) return
  let url: URL
  try { url = new URL(d.url) } catch { return }
  const yt = youtubeRule(url, topHost, testHosts('test.youtubeHosts'))
  if (yt === 'allow') return
  const e = blocker()
  const type = d.resourceType ?? 'other'
  // Hide the blocker from sites: each refusal below is noted, and a script
  // refused without a stand-in of the lists gets uBlock Origin's own where
  // one exists (adsbygoogle.js, gpt.js...).
  const quiet = type !== 'mainFrame' && stealthOn(topHost)
  const refuse = (resource: { body: string; contentType: string } | null = null) => {
    const r = resource ?? (quiet && type === 'script' ? surrogateFor(d.url) : null)
    if (r || quiet) standIn(d, r, quiet, topHost)
    return { cancel: true }
  }
  const r = e && top ? request(d.url, type === 'mainFrame' ? d.url : contextOf(d), type) : null
  if (e && r && top) {
    if (pageAllowed(e, top)) return
    const verdict = e.match(r)
    if (type === 'mainFrame') {
      if (verdict.match && !verdict.redirect && forDocuments(verdict.filter)) { note(blocked, d.url); return { cancel: true } }
      return
    }
    if (verdict.redirect) { note(redirected, d.url); return refuse(verdict.redirect) }
    if (verdict.match) { note(blocked, d.url); return refuse() }
    // A frame's address is Remove click trackers' (privacy.ts).
    if (verdict.rewrite?.url && type !== 'subFrame' && verdict.rewrite.url !== d.url) { note(redirected, d.url); return { redirectURL: verdict.rewrite.url } }
    if (verdict.exception) return
  }
  if (type === 'mainFrame') return
  if (yt === 'block' || (thirdParty(d) && isUnwanted(url.hostname))) {
    if (e && r && excepted(e, r)) return
    note(blocked, d.url)
    return refuse()
  }
})

// The lists' $popup: a page opening a listed address in a tab or a window
// (window.open, a link with a target) is refused, as uBlock Origin closes
// the pop-up. The opener is the frame that asked, as its referrer tells,
// else the page; Shield off or paused on the page leaves it.
hooks.refusePopup = (page, url, referrer) => {
  if (!/^https?:/i.test(page) || !shieldOn(hostOf(page))) return false
  const opener = /^https?:/i.test(referrer) ? referrer : page
  if (!popupBlocked(url, opener, page)) return false
  note(blocked, url)
  return true
}

// The lists' $csp, added to the pages and frames they name.
net.onHeadersReceived('shield-csp', 120, (d, headers) => {
  if (d.resourceType !== 'mainFrame' && d.resourceType !== 'subFrame') return
  if (!/^https?:/i.test(d.url)) return
  const top = d.resourceType === 'mainFrame' ? d.url : topAddress(d)
  if (!top || !/^https?:/i.test(top) || !shieldOn(hostOf(top))) return
  const e = blocker()
  if (!e || pageAllowed(e, top)) return
  const csp = cspFor(d.url, d.resourceType === 'mainFrame' ? d.url : contextOf(d), d.resourceType === 'mainFrame' ? 'main_frame' : 'sub_frame')
  if (!csp) return
  const key = Object.keys(headers).find(k => k.toLowerCase() === 'content-security-policy') ?? 'Content-Security-Policy'
  // One more policy: each is enforced, the page's own as well.
  headers[key] = [...(headers[key] ?? []), csp]
})

/** Block Ads and Trackers for one site (Shield.pause, studio/06 §5.1): its
 * host without www, never from a private tab (a pause isn't kept there);
 * the page reloads, so the whole of it follows. */
handle('pages.shield.site', ({ id, on }) => {
  const t = model.tabs.get(id)
  if (!t || t.shy) return
  const host = hostOf(t.url)?.replace(/^www\./, '')
  if (!host || !/^https?:/i.test(t.url)) return
  const paused = new Set(model.pref<string[]>('shield.paused') ?? [])
  if (on) paused.delete(host); else paused.add(host)
  model.setPref('shield.paused', [...paused].sort())
  runtimes.get(id)?.contents?.reload()
})

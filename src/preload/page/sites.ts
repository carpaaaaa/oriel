// Two things done to some sites, Oriel's own (carpa, 24 Nov 2026):
//  - YouTube without Shorts (Settings › Video › Hide YouTube Shorts): their
//    shelves, the Shorts button, the chip and tab, Shorts among results and
//    suggestions are hidden by a sheet of the user's origin, and a Shorts
//    page opens as an ordinary video;
//  - copying set free (Settings › Pages › Let me copy on every site, or a
//    tab's menu › Allow Copying on This Site): what a page does to stop you
//    selecting, copying or right-clicking is stopped before it runs, and its
//    text can be selected again.
// Owned by the pages module.

import { contextBridge, webFrame } from 'electron'

const SHORTS = [
  'ytd-reel-shelf-renderer',
  'ytd-rich-shelf-renderer[is-shorts]',
  'ytd-rich-section-renderer:has(ytd-rich-shelf-renderer[is-shorts])',
  'ytd-rich-section-renderer:has(ytm-shorts-lockup-view-model)',
  'ytd-rich-section-renderer:has(ytm-shorts-lockup-view-model-v2)',
  'grid-shelf-view-model:has(ytm-shorts-lockup-view-model)',
  'grid-shelf-view-model:has(ytm-shorts-lockup-view-model-v2)',
  'ytm-shorts-lockup-view-model',
  'ytm-shorts-lockup-view-model-v2',
  'ytd-guide-entry-renderer:has(a[title="Shorts"])',
  'ytd-mini-guide-entry-renderer:has(a[title="Shorts"])',
  'ytd-mini-guide-entry-renderer[aria-label="Shorts"]',
  'ytd-video-renderer:has(a[href^="/shorts/"])',
  'ytd-grid-video-renderer:has(a[href^="/shorts/"])',
  'ytd-rich-item-renderer:has(a[href^="/shorts/"])',
  'ytd-compact-video-renderer:has(a[href^="/shorts/"])',
  'yt-lockup-view-model:has(a[href^="/shorts/"])',
  'yt-chip-cloud-chip-renderer:has(yt-formatted-string[title="Shorts"])',
  'yt-chip-cloud-chip-renderer:has([title="Shorts"])',
  'yt-tab-shape[tab-title="Shorts"]',
  'tp-yt-paper-tab:has([title="Shorts"])',
].join(',\n') + ' { display: none !important; }'

let shortsSheet: string | null = null
let shortsOn = false

/** A Shorts page (/shorts/ID) opens as the same video's ordinary page. */
function unshort(): void {
  if (!shortsOn) return
  const m = /^\/shorts\/([\w-]{6,})/.exec(location.pathname)
  if (m) location.replace(`/watch?v=${m[1]}${location.search ? '&' + location.search.slice(1) : ''}`)
}

/** YouTube without Shorts, on its hosts: on or off as the setting changes. */
export function hideShorts(hosts: string[] | null): void {
  const on = !!hosts && hosts.includes(location.hostname)
  if (on === shortsOn) return
  shortsOn = on
  if (on) {
    try { shortsSheet = webFrame.insertCSS(SHORTS, { cssOrigin: 'user' }) } catch {}
    unshort()
  } else if (shortsSheet) {
    try { webFrame.removeInsertedCSS(shortsSheet) } catch {}
    shortsSheet = null
  }
}
// YouTube moves between its pages itself, and says so.
document.addEventListener('yt-navigate-finish', unshort, true)
document.addEventListener('yt-navigate-start', unshort, true)

/** Copying set free, from the page's start (run before its own scripts): its
 * listeners never hear a copy, a cut, a selection starting, a drag, the
 * right button or Ctrl+A/C/X, so they can't stop them; text is selectable
 * whatever its style says. Copied into the page as text. */
function freeCopy(): void {
  'use strict'
  const stop = (e: Event) => { e.stopImmediatePropagation() }
  for (const type of ['copy', 'cut', 'selectstart', 'contextmenu', 'dragstart']) window.addEventListener(type, stop, true)
  const right = (e: MouseEvent) => { if (e.button === 2) e.stopImmediatePropagation() }
  window.addEventListener('mousedown', right, true)
  window.addEventListener('mouseup', right, true)
  window.addEventListener('keydown', (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && !e.altKey && /^[acx]$/i.test(e.key)) e.stopImmediatePropagation() }, true)
}

const SELECTABLE = 'html, body, body * { -webkit-user-select: text !important; user-select: text !important; }'

export function setCopyFree(on: boolean): void {
  if (!on) return
  try { contextBridge.executeInMainWorld({ func: freeCopy }) } catch {}
  try { webFrame.insertCSS(SELECTABLE, { cssOrigin: 'user' }) } catch {}
}

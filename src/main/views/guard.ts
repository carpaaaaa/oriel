// Oriel's own views never leave their page (studio/09 §1.1): the interface
// and the overlay, which have window.search and so every command, and the
// little lines and cards drawn from data: pages. No link, script, redirect
// or new window takes them elsewhere. A link or a file dropped on the
// interface opens in a tab instead, as on the Mac (Browser.take), which
// never opens script or an extension's page from a drop.

import type { WebContents } from 'electron'

/** Navigations stopped, for the bench. */
export const refusedNavigations: { url: string; how: string }[] = []

const keep = (url: string, how: string) => {
  refusedNavigations.push({ url, how })
  if (refusedNavigations.length > 50) refusedNavigations.shift()
}

const notFromDrop = /^(javascript|chrome-extension|webkit-extension):/i

/** Pins `wc` to the page Oriel loaded in it. With `dropped`, a link or file
 * that would have replaced the page (a drop) is handed over instead. */
export function keepOnPage(wc: WebContents, dropped?: (url: string) => void): void {
  // Loads Oriel starts (loadFile, loadURL) aren't asked here: only what the
  // page or a drop starts.
  wc.on('will-frame-navigate', details => {
    if (details.isMainFrame) return // will-navigate, next, has it
    keep(details.url, 'frame')
    details.preventDefault()
  })
  wc.on('will-navigate', details => {
    keep(details.url, 'navigate')
    details.preventDefault()
    if (dropped && !notFromDrop.test(details.url)) dropped(details.url)
  })
  wc.on('will-redirect', details => {
    keep(details.url, 'redirect')
    details.preventDefault()
  })
  wc.setWindowOpenHandler(details => {
    keep(details.url, 'window.open')
    return { action: 'deny' }
  })
}

// A page that hasn't painted yet shows the window's dark, not white
// (studio/01 §2.6; Tab.swift:3058-3116). A web view never drawn is opaque
// white: in a dark window it is a flash while the page loads. The Mac keeps
// the new view out of sight until WebKit's first visually non-empty layout;
// Electron has no such event for a view, so while Oriel is dark the view's
// ground (what Chromium paints before the page's first frame) is the page
// card's dark until the page paints (preload/page/ground.ts), then white
// again, so a page that leaves its ground to the browser reads as anywhere
// else. A page with nothing to paint turns at its load's end, as the Mac's
// didFinish (Browser.swift:9702-9705). Light: white, as before.
// Owned by the pages module.

import { ipcMain, nativeTheme, type WebContents, type WebContentsView } from 'electron'

/** The page card's ground in the dark (tokens.css, dark --ground). */
export const DARK_GROUND = '#1C1C1C'
const WHITE = '#FFFFFF'

/** Pages not painted yet, with the view whose ground waits for them. */
const waiting = new Map<WebContents, WebContentsView>()
const wired = new WeakSet<WebContents>()

/** The page painted (or never will): its ground back to white. */
function painted(wc: WebContents): void {
  const view = waiting.get(wc)
  if (!view) return
  waiting.delete(wc)
  if (!wc.isDestroyed()) view.setBackgroundColor(WHITE)
}

/** Call once a page's view is made, before it loads anything. */
export function groundPage(view: WebContentsView): void {
  const wc = view.webContents
  if (!nativeTheme.shouldUseDarkColors) { view.setBackgroundColor(WHITE); return }
  view.setBackgroundColor(DARK_GROUND)
  waiting.set(wc, view)
  if (wired.has(wc)) return
  wired.add(wc)
  wc.on('did-finish-load', () => painted(wc))
  // -3 is a load replaced by another: the next one paints.
  wc.on('did-fail-load', (_e, code, _d, _u, isMainFrame) => { if (isMainFrame && code !== -3) painted(wc) })
  wc.on('render-process-gone', () => painted(wc))
  wc.once('destroyed', () => waiting.delete(wc))
}

ipcMain.on('ground:painted', event => {
  if (event.senderFrame === event.sender.mainFrame) painted(event.sender)
})

// Oriel turned light while a page loads: white at once.
nativeTheme.on('updated', () => {
  if (nativeTheme.shouldUseDarkColors) return
  for (const wc of [...waiting.keys()]) painted(wc)
})

/** For the tests: whether a page still waits for its first paint. */
export const unpainted = (wc: WebContents) => waiting.has(wc)

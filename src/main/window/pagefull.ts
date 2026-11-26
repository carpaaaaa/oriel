// A page's own full screen (a video's, document.requestFullscreen): the
// window covers the screen, as in Chrome. Electron does it for a free
// window but not for a maximized one, where the video stayed inside the
// maximized window with the taskbar under it: the window is put in full
// screen here then, and taken out again when the page leaves (Escape, the
// video's button). A page going full screen inside F11's leaves F11's alone.
// Owned by the window module.

import { app, ipcMain, type WebContents } from 'electron'
import { allControllers } from '../views/window'

const holderOf = (wc: WebContents) => allControllers().find(c => c.base.contentView.children.some(v => (v as Electron.WebContentsView).webContents === wc))

// The page grows from its place to the whole window while the window covers
// the screen (WindowController.fillWith); on the way out the window leaves
// the screen once the page is back in its place. Electron's own full screen
// is off on Windows (frame.ts windowOptions, fullscreenable): it moved the
// window before Oriel heard of the page, and twice on the way out.
const into = (wc: WebContents) => () => setImmediate(() => holderOf(wc)?.frame.pageFull(true))
const outOf = (wc: WebContents) => () => setImmediate(() => holderOf(wc)?.frame.pageFull(false))
app.on('web-contents-created', (_e, wc) => {
  wc.on('enter-html-full-screen', () => { const c = holderOf(wc); c?.frame.note('enter-html-full-screen'); c?.fillWith(wc, true, into(wc)) })
  wc.on('leave-html-full-screen', () => { const c = holderOf(wc); c?.frame.note('leave-html-full-screen'); c?.fillWith(wc, false, outOf(wc)) })
})

// The page's own word (src/preload/page/pages.ts): Electron's events above
// stop coming after a first video in a row on a maximized window.
ipcMain.on('pages:fullscreen', (e, on: unknown) => {
  const c = holderOf(e.sender)
  if (!c) return
  c.frame.note(`page says full ${!!on}`)
  c.fillWith(e.sender, !!on, on ? into(e.sender) : outOf(e.sender))
})

// A page's own full screen (a video's, document.requestFullscreen): the
// window covers the screen, as in Chrome. Electron does it for a free
// window but not for a maximized one, where the video stayed inside the
// maximized window with the taskbar under it: the window is put in full
// screen here then, and taken out again when the page leaves (Escape, the
// video's button). A page going full screen inside F11's leaves F11's alone.
// Owned by the window module.

import { app, type WebContents } from 'electron'
import { allControllers } from '../views/window'

const holderOf = (wc: WebContents) => allControllers().find(c => c.base.contentView.children.some(v => (v as Electron.WebContentsView).webContents === wc))

app.on('web-contents-created', (_e, wc) => {
  wc.on('enter-html-full-screen', () => { holderOf(wc)?.frame.note('enter-html-full-screen'); setImmediate(() => holderOf(wc)?.frame.pageFull(true)) })
  wc.on('leave-html-full-screen', () => { holderOf(wc)?.frame.note('leave-html-full-screen'); setImmediate(() => holderOf(wc)?.frame.pageFull(false)) })
})

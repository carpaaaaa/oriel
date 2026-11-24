// Links clicked with a modifier in a page (studio/01 §8, §10.19;
// Browser.swift:8646 openLinkBeside, Peek.swift): Alt-click opens the link
// in Split View beside its page, with Settings › Keyboard & Mouse saying
// so; the peek's click opens it in a peek (peek.ts). The preload spots the
// click (src/preload/page/pages.ts) and cancels it; this decides.

import { ipcMain, type WebContents } from 'electron'
import { model, type WindowRecord } from '../model/model'
import { runtimes } from '../views/tabs'
import { controllerFor } from '../views/window'
import { MOST } from '../window/split'
import { pref } from './facts'
import { openPeek, peekOf } from './peek'

/** The tab in the row a page belongs to. */
export function tabOfContents(wc: WebContents): string | null {
  for (const [id, r] of runtimes) if (r.contents === wc) return id
  return null
}

const even = (n: number) => Array.from({ length: n }, () => 1 / n)

/** Open Link in Split View: a tab beside the page, paired with it (Browser.pair). */
export function openBeside(win: WindowRecord, from: string, url: string): string {
  const tab = model.open(win, url, { foreground: false, from, link: true, opener: from })
  const at = win.splits.findIndex(s => s.tabs.includes(from))
  if (at >= 0 && win.splits[at].tabs.length < MOST) {
    const s = win.splits[at]
    const tabs = [...s.tabs]
    tabs.splice(tabs.indexOf(from) + 1, 0, tab.id)
    win.splits = win.splits.map((x, i) => (i === at ? { ...x, tabs, sizes: even(tabs.length), focused: tab.id } : x))
  } else {
    if (at >= 0) win.splits = win.splits.filter((_, i) => i !== at)
    win.splits = [...win.splits, { tabs: [from, tab.id], axis: 'horizontal', sizes: even(2), focused: tab.id }]
  }
  model.touch(win, ['splits'])
  model.selectTab(win, tab.id)
  controllerFor(win.id)?.focusPage()
  return tab.id
}

ipcMain.on('pages:link', (event, msg: { url?: string; how?: string }) => {
  const url = String(msg?.url ?? '')
  if (!/^https?:/i.test(url)) return
  const wc = event.sender
  // Only from a tab in the row (a peek's own links go on in the peek).
  if (peekOf(wc)) { wc.loadURL(url).catch(() => {}); return }
  const id = tabOfContents(wc)
  const win = id ? model.windowOf(id) : null
  if (!id || !win) return
  if (msg.how === 'split') {
    if (!pref<boolean>('links.optionSplit') || pref<boolean>('splitView') === false) { wc.loadURL(url).catch(() => {}); return }
    openBeside(win, id, url)
  } else if (msg.how === 'peek') {
    if (!pref<boolean>('links.peek')) { wc.loadURL(url).catch(() => {}); return }
    openPeek(win, id, url)
  }
})

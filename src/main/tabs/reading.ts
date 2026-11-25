// How far down its page the tab you're on is, for the grey that fills its
// pill (Settings › Appearance › Tabs › Show how far you've read, `tabs.reading`;
// studio/01 §2.17, §4.11; Tab.reading, Tab.scrolled). The page says it (the
// preload, page/reading.ts); here the value is kept for every tab in hundredths,
// and the interface hears only a changed value of the tab in front of a window,
// and only with the setting on. It goes back to nothing as a page is navigated
// to or put to sleep, and a tab brought to the front says where it is at once.

import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc'
import { model } from '../model/model'
import { controllerFor, pageAttached, type WindowController } from '../views/window'
import { runtimes } from '../views/tabs'
import { benchRequest } from '../bench/server'

/** Hundredths each tab last said, 0 for one that hasn't. */
const progress = new Map<string, number>()
/** What each window's interface was last told. */
const told = new Map<string, { id: string; fraction: number }>()

const fractionOf = (id: string) => progress.get(id) ?? 0

/** The interface hears of the tab in front: its value, when that changed. */
function tell(c: WindowController): void {
  if (!model.pref<boolean>('tabs.reading') || c.ui.webContents.isDestroyed()) return
  const id = c.record.active[c.record.space]
  if (!id) return
  const fraction = fractionOf(id)
  const was = told.get(c.record.id)
  if (was && was.id === id && was.fraction === fraction) return
  told.set(c.record.id, { id, fraction })
  c.ui.webContents.send(IPC.reading, { id, fraction })
}

function set(id: string, fraction: number): void {
  if (fractionOf(id) === fraction) return
  progress.set(id, fraction)
  const tab = model.tabs.get(id)
  const c = tab && controllerFor(tab.win)
  // Only the tab in front of its window: the others show nothing.
  if (c && c.record.active[c.record.space] === id) tell(c)
}

/** What a page says, as the hundredth it is. */
function say(id: string, value: unknown): void {
  if (typeof value === 'number' && Number.isFinite(value)) set(id, Math.round(Math.min(1, Math.max(0, value)) * 100) / 100)
}

ipcMain.on('search:tab-reading', (e, value: unknown) => {
  // The page's own frame, never one inside it.
  if (e.senderFrame !== e.sender.mainFrame) return
  for (const [id, r] of runtimes) if (r.contents === e.sender) { say(id, value); return }
})

// Going somewhere (go(to:)): back to nothing at once, not when the new page
// says so; a fragment or a pushState isn't going anywhere.
pageAttached.push((id, wc) => {
  wc.on('did-start-navigation', details => {
    if (details.isMainFrame && !details.isSameDocument) set(id, 0)
  })
})

// Put to sleep (rest): the page is gone, and with it where it was.
model.on('tab-changed', (t: { id: string }, patch: { asleep?: boolean }) => {
  if (patch.asleep) set(t.id, 0)
})
model.on('tab-closed', (id: string) => { progress.delete(id) })

// Another tab in front, another space, the setting turned on: the tab in
// front says where it is.
model.on('window-changed', (wid: string, slices: string[]) => {
  if (!slices.some(s => s === 'activeID' || s === 'space' || s === 'prefs')) return
  const c = controllerFor(wid)
  if (c) tell(c)
})

/** The tests: what is held for a tab and what its window's interface was told;
 * `say` plays a page that reported (a tab out of sight, or a bad value). */
benchRequest('tabs.reading', req => {
  const id = String(req.id ?? '')
  if ('say' in req) say(id, req.say)
  const tab = model.tabs.get(id)
  return { held: fractionOf(id), told: (tab && told.get(tab.win)) ?? null }
})

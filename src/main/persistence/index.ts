// What the person changes stays for the next launch, however the app ends
// (studio/01 §1.10, §9.7). Quitting writes everything (index.ts, before-quit);
// here the ways an app ends without quitting:
//   - Windows logging off, restarting or shutting down: each window hears
//     query-session-end (asked, may still be told no) and then session-end,
//     after which Windows may end the process at once; powerMonitor's
//     shutdown is the Mac's and Linux's;
//   - and what was only written when another change came along: the column
//     folded and the space a window shows (windows.json, §1.2, §9.11), a
//     split (the session, §9.6).

import { app, powerMonitor, session } from 'electron'
import { model, type Slice } from '../model/model'
import { flushJSON } from '../model/persist'
import { onPageSession } from '../views/tabs'
import { allControllers, controllerFor } from '../views/window'
import { benchRequest } from '../bench/server'
import { isSettling, placementNow } from './windows'

/** Cookies and site storage are Chromium's: written by it on a normal quit;
 * asked to reach the disk when the session may end. */
const stores = new Set<Electron.Session>()
onPageSession((s, partition) => { if (partition.startsWith('persist:')) stores.add(s) })
app.whenReady().then(() => stores.add(session.fromPartition('persist:personal')))

function flushStores(): Promise<unknown> {
  return Promise.allSettled([...stores].flatMap(s => [s.cookies.flushStore(), Promise.resolve().then(() => s.flushStorageData())]))
}

let ended = false

/** Windows may end the session: everything written now, the app going on. */
export function sessionMayEnd(): void {
  if (ended) return
  flushJSON(false)
  void flushStores()
}

/** The session ends: written for good; the windows that close next are not
 * closed by the person (they come back). */
export function sessionEnds(): void {
  if (ended) return
  ended = true
  flushJSON(true)
  void flushStores()
}

model.on('window-opened', (id: string) => setImmediate(() => {
  const c = controllerFor(id)
  if (!c) return
  c.base.on('query-session-end', () => sessionMayEnd())
  c.base.on('session-end', () => sessionEnds())
}))
app.whenReady().then(() => powerMonitor.on('shutdown', () => sessionEnds()))

// The column folded and the space on screen are in windows.json: written a
// moment after they change (Browser.swift:370, saveSoon §9.6), not only
// when something else is.
// A split made, resized or taken apart is in the row (Split View's commands
// only tell the window): the session 1.2 s later, as for any tab change (§9.6).
model.on('window-changed', (id: string, slices: Slice[]) => {
  if (slices.includes('sidebar') || slices.includes('space')) model.saveWindowsSoon()
  const win = model.windows.get(id)
  if (win && slices.includes('splits')) model.sessionSoon(win)
})

// For the tests (test/persist_all.py).
benchRequest('persist.placement', () => ({
  pid: process.pid,
  windows: allControllers().map(c => ({
    id: c.record.id, place: c.record.place, now: placementNow(c), state: c.frame.state, visual: c.frame.visual(), bounds: c.base.getBounds(),
    settling: isSettling(c), visible: c.base.isVisible(), loading: c.ui.webContents.isLoading(),
  })),
}))
benchRequest('persist.end', req => {
  const c = allControllers()[0]
  const event = { preventDefault() {}, reasons: ['shutdown'] }
  if (req.how === 'shutdown') powerMonitor.emit('shutdown', event)
  else if (c) {
    c.base.emit('query-session-end', event)
    if (req.how !== 'query') c.base.emit('session-end', event)
  }
  return { pid: process.pid }
})

// Each window's place for windows.json (studio/01 §1.2, §1.4): its visible
// rectangle, maximized, snapped or full screen, and its monitor; brought back
// there at launch and for a window ⇧⌘T reopens. The Mac trusts AppKit to keep
// a frame on a screen; on Windows monitors come and go, so a rectangle whose
// monitor is gone goes to the primary one (§1.2 point 6).

import { screen, type Rectangle } from 'electron'
import { model, type Placement } from '../model/model'
import { frameString, parseFrame } from '../model/formats'
import { controllerFor, type WindowController } from '../views/window'
import { quietTests } from '../context'

/** Windows still to be maximized or put full screen when they show: until
 * then what they say about themselves isn't what their line says. */
const settling = new WeakSet<WindowController>()

/** What a window says about itself now; null when it can't (gone, minimized,
 * not yet shown as its line says): what it said before is kept. */
/** For the tests: still waiting to be maximized or put full screen. */
export const isSettling = (c: WindowController) => settling.has(c)

export function placementNow(c: WindowController): Placement | null {
  const b = c.base
  if (b.isDestroyed() || b.isMinimized() || settling.has(c)) return null
  const f = c.frame
  f.refresh()
  const p: Placement = { frame: frameString(f.normalVisual()) }
  // Maximized under full screen too: it comes back maximized, then full screen.
  if (f.state === 'maximized' || b.isMaximized() || f.maximizedUnderFull()) p.maximized = true
  if (f.isFullScreen()) p.fullScreen = true
  if (f.state === 'snapped') p.snapped = frameString(f.visual())
  const d = screen.getDisplayMatching(f.state === 'free' ? f.visual() : b.getBounds())
  p.display = { id: d.id, frame: frameString(d.bounds) }
  return p
}

model.hooks.frame = id => {
  const c = controllerFor(id)
  return c ? placementNow(c) : null
}

/** Enough of its top strip on a monitor to take hold of it. */
function reachable(r: Rectangle, area: Rectangle): boolean {
  const w = Math.min(r.x + r.width, area.x + area.width) - Math.max(r.x, area.x)
  const h = Math.min(r.y + 40, area.y + area.height) - Math.max(r.y, area.y)
  return w >= 100 && h >= 20
}

/** A saved rectangle on today's monitors: on its own monitor (followed if it
 * moved in the arrangement), else wherever it still shows, else centred on
 * its monitor or, that gone, on the primary one. */
export function onDisplays(rect: Rectangle, saved?: Placement['display']): Rectangle {
  const displays = screen.getAllDisplays()
  const own = saved ? displays.find(d => d.id === saved.id) : undefined
  const was = parseFrame(saved?.frame)
  const r = { ...rect }
  if (own && was) { r.x += own.bounds.x - was.x; r.y += own.bounds.y - was.y }
  if (displays.some(d => reachable(r, d.workArea))) return r
  const work = (own ?? screen.getPrimaryDisplay()).workArea
  const width = Math.min(r.width, work.width), height = Math.min(r.height, work.height)
  return { x: work.x + Math.round((work.width - width) / 2), y: work.y + Math.round((work.height - height) / 2), width, height }
}

/** Put a window where its line says, before it shows. */
function restore(c: WindowController): void {
  const p = c.record.place
  // Windows has no way for a program to snap a window: it comes back free,
  // where Snap had put it.
  const want = parseFrame(p.snapped ?? p.frame)
  if (want) {
    c.base.setBounds(c.frame.boundsFor(onDisplays(want, p.display)))
    c.frame.refresh()
  }
  if (!p.maximized && !p.fullScreen) return
  // Once it shows (the interface loaded: WindowController shows it then;
  // the 'show' event doesn't always come for a window out of sight).
  settling.add(c)
  const apply = () => {
    settling.delete(c)
    if (c.base.isDestroyed()) return
    if (p.maximized) c.frame.maximize()
    // A test world on a Mac stays out of sight: full screen would take a Space.
    if (p.fullScreen && !quietTests) c.frame.setFullScreen(true)
  }
  if (c.base.isVisible()) apply()
  else c.ui.webContents.once('did-finish-load', () => setImmediate(apply))
}

model.on('window-opened', (id: string) => setImmediate(() => {
  const c = controllerFor(id)
  if (!c || c.record.shy) return
  restore(c)
  const moved = () => model.windowMoved(id)
  for (const event of ['move', 'resize', 'maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen', 'restore'] as const) {
    c.base.on(event as 'move', moved)
  }
  // Closing: what it says now, while it still can (the last window's line
  // is written after it is gone).
  c.base.on('close', () => { model.placeOf(c.record) })
}))

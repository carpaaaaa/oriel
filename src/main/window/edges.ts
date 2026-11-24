// The window's edges, watched while something waits there:
//  - peek (studio/01 §5.29-§5.30): the folded column comes out over the page
//    when the pointer touches the window's edge on its side (within 6), stays
//    out while the pointer is over it or up to 48 beyond the edge, and goes
//    back 0.065 s after the pointer left; the column draws it ({ kind: 'fold' },
//    sidebar/Fold.tsx), the main process only raises and lets go the layer;
//  - reveal (studio/01 §1.19-§1.22): in full screen the window's buttons come
//    down in a strip when the pointer touches the top of the screen, as
//    macOS brings the lights back, so a window is never left without a way
//    to close it (panel 'window.reveal', chrome/register.tsx).
// The interface hears no pointer over the page, so the main process polls
// the cursor, only while a window has its column folded or is in full screen.

import { screen } from 'electron'
import type { Rect } from '../../shared/state'
import { model } from '../model/model'
import { allControllers, type WindowController } from '../views/window'
import { benchRequest } from '../bench/server'
import { win32 } from '../win/user32'

const EDGE = 6, BEYOND = 48, GRACE = 65, SHADOW = 40
/** The strip with the window's buttons in full screen (CAPTION height). */
const STRIP = 40, STRIP_EDGE = 2, STRIP_STAY = STRIP + 12
export const REVEAL = 'window.reveal'

interface Watch { left: number | null }
const watching = new WeakMap<WindowController, Watch>()
/** The tests' pointer, in screen DIP, in place of the real one. */
let fake: { x: number; y: number } | null = null
let timer: NodeJS.Timeout | null = null

const inside = (p: { x: number; y: number }, r: Rect) => p.x >= r.x && p.y >= r.y && p.x < r.x + r.width && p.y < r.y + r.height

function pointer(): { x: number; y: number } { return fake ?? screen.getCursorScreenPoint() }

/** The window under the pointer is this one (another app in front doesn't count). */
function ours(c: WindowController): boolean {
  const w = win32()
  if (fake || !w || !c.frame.hwnd) return true
  return w.rootAt(w.cursor()) === c.frame.hwnd
}

const folded = (c: WindowController) => c.record.sidebar.folded && c.record.sidebar.layout !== 'top' && !c.base.isMinimized()
const full = (c: WindowController) => c.frame.isFullScreen() && !c.base.isMinimized()
const layer = (c: WindowController) => c.overlayLayer
const peeking = (c: WindowController) => layer(c).kind === 'fold'
const revealed = (c: WindowController) => { const l = layer(c); return l.kind === 'panel' && l.name === REVEAL }

/** The column's width out over the page (the column of icons is 52). */
function columnWidth(c: WindowController): number {
  const s = c.record.sidebar
  return s.icons || (model.pref<boolean>('sidebar.narrowIcons') && model.pref<boolean>('sidebar.narrowed')) ? 52 : s.width
}

function peekRegion(c: WindowController, v: Rect): Rect {
  const content = c.base.getContentBounds()
  const w = columnWidth(c) + SHADOW
  const right = c.record.sidebar.side === 'right'
  const x = right ? v.x + v.width - w : v.x
  return { x: x - content.x, y: v.y - content.y, width: w, height: v.height }
}

function tickOne(c: WindowController, now: number): void {
  const w = watching.get(c) ?? { left: null }
  watching.set(c, w)
  const p = pointer()
  const v = c.frame.visual()
  // full screen: the strip with the buttons
  if (full(c)) {
    const d = c.base.getBounds()
    const atTop = p.x >= d.x && p.x < d.x + d.width && p.y >= d.y && p.y < d.y + STRIP_EDGE
    const onStrip = p.x >= d.x && p.x < d.x + d.width && p.y >= d.y - BEYOND && p.y < d.y + STRIP_STAY
    if (revealed(c)) {
      if (onStrip) w.left = null
      else if (w.left == null) w.left = now
      else if (now - w.left > GRACE * 3) { w.left = null; c.sendOverlay({ kind: 'none' }) }
      return
    }
    if (atTop && layer(c).kind === 'none' && ours(c)) {
      w.left = null
      const content = c.base.getContentBounds()
      c.sendOverlay({ kind: 'panel', name: REVEAL })
      c.setOverlayRegion({ x: 0, y: 0, width: content.width, height: STRIP + 12 }, false)
      return
    }
  } else if (revealed(c)) c.sendOverlay({ kind: 'none' })
  // the folded column
  if (!folded(c)) { if (peeking(c)) c.sendOverlay({ kind: 'none' }); return }
  const right = c.record.sidebar.side === 'right'
  const fromEdge = right ? v.x + v.width - 1 - p.x : p.x - v.x
  const within = p.y >= v.y && p.y < v.y + v.height
  if (peeking(c)) {
    const stays = within && fromEdge > -BEYOND && fromEdge < columnWidth(c)
    if (stays) w.left = null
    else if (w.left == null) w.left = now
    else if (now - w.left > GRACE) { w.left = null; c.sendOverlay({ kind: 'none' }) }
    return
  }
  // Not in the strip's corner of a full screen, nor over anything else floating.
  const touch = within && fromEdge >= 0 && fromEdge < EDGE && !(full(c) && p.y < v.y + STRIP_STAY)
  if (touch && layer(c).kind === 'none' && ours(c)) {
    w.left = null
    c.sendOverlay({ kind: 'fold' })
    c.setOverlayRegion(peekRegion(c, v), false)
  }
}

function tick(): void {
  const now = Date.now()
  let busy = false
  for (const c of allControllers()) {
    if (c.base.isDestroyed()) continue
    if (folded(c) || full(c) || peeking(c) || revealed(c)) { busy = true; tickOne(c, now) }
  }
  if (!busy) stop()
}

function stop(): void { if (timer) clearInterval(timer); timer = null }

/** Watch again: a column folded, a window gone to full screen. */
export function watchEdges(): void {
  if (timer) return
  if (!allControllers().some(c => folded(c) || full(c))) return
  timer = setInterval(tick, 16)
}

model.on('window-changed', (_id: string, slices: string[]) => { if (slices.includes('sidebar')) watchEdges() })
// Full screen comes from F11, the system or a page; a slow look is enough to start.
setInterval(watchEdges, 500).unref()

// For the tests: a pointer of their own (null: the real one again), and what is out.
benchRequest('window.pointer', req => {
  fake = req.x == null ? null : { x: Number(req.x), y: Number(req.y) }
  watchEdges()
  return {}
})
benchRequest('window.edges', req => {
  const c = allControllers().find(x => !req.window || x.record.id === req.window) ?? allControllers()[0]
  return { peek: !!c && peeking(c), reveal: !!c && revealed(c), region: c?.overlay.getBounds() ?? null, watching: !!timer }
})

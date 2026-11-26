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
// the cursor, only while a window has its column folded or is in full screen:
// every 16 ms near an edge or while something is out, less often the further
// the pointer is from any edge that waits (up to 120 ms).

import { screen } from 'electron'
import type { Rect } from '../../shared/state'
import { model } from '../model/model'
import { allControllers, overlayFree, type WindowController } from '../views/window'
import { benchRequest } from '../bench/server'
import { win32 } from '../win/user32'

/** Fold.swift:348-375: the edge (10 for a column resting folded), the
 * dwell before it comes (0.15 for the strip, 0.05 for a resting column),
 * the grace before it goes. */
const EDGE = 6, HIDDEN_EDGE = 10, BEYOND = 48, GRACE = 65, SHADOW = 40, DWELL = 150, COLUMN_DWELL = 50
/** The strip with the window's buttons in full screen (CAPTION height). */
const STRIP = 40, STRIP_EDGE = 2, STRIP_STAY = STRIP + 12
export const REVEAL = 'window.reveal'

interface Watch { left: number | null; arrived: number | null; going: NodeJS.Timeout | null }
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

const folded = (c: WindowController) => c.record.sidebar.folded && !c.base.isMinimized()
const top = (c: WindowController) => c.record.sidebar.layout === 'top'
/** The tabs folded in a window: the page fills the window to its edges (chrome/Chrome.tsx `fill`),
 * so its buttons come down at the top as in full screen (carpa, 26 Nov 2026: Ctrl+S hides the tabs
 * and extends the page, in a window too, never full screen of its own). With the tabs across the top
 * the strip that comes down carries them (sidebar/Fold.tsx); otherwise the strip of buttons (panel
 * 'window.reveal'). */
const filled = (c: WindowController) => c.chrome === 'windows' && c.record.sidebar.folded && !c.frame.isFullScreen() && !c.base.isMinimized()
const full = (c: WindowController) => (c.frame.isFullScreen() && !c.base.isMinimized()) || (filled(c) && c.record.sidebar.layout !== 'top')
const layer = (c: WindowController) => c.overlayLayer
const peeking = (c: WindowController) => { const l = layer(c) as { kind: string; going?: boolean }; return l.kind === 'fold' && !l.going }
const leavingOut = (c: WindowController) => { const l = layer(c) as { kind: string; going?: boolean }; return l.kind === 'fold' && !!l.going }
const revealed = (c: WindowController) => { const l = layer(c); return l.kind === 'panel' && l.name === REVEAL }

/** The column's width out over the page (the column of icons is 52). */
function columnWidth(c: WindowController): number {
  const s = c.record.sidebar
  return s.icons || (model.pref<boolean>('sidebar.narrowIcons') && model.pref<boolean>('sidebar.narrowed')) ? 52 : s.width
}

/** The strip's height out over the page: 52, 36 with Shorter tab bar. */
const stripHeight = () => (model.pref<boolean>('tabs.compact') ? 36 : 52)

function peekRegion(c: WindowController, v: Rect): Rect {
  const content = c.base.getContentBounds()
  if (top(c)) {
    // The strip, its shadow under it; the window's buttons stay in reach.
    const controls = c.chrome === 'windows' && !c.frame.isFullScreen() && !filled(c) ? (model.pref<string>('window.buttons') === 'classic' ? 138 : 96) : 0
    return { x: v.x - content.x, y: v.y - content.y, width: Math.max(0, v.width - controls), height: stripHeight() + SHADOW }
  }
  const w = columnWidth(c) + SHADOW
  const right = c.record.sidebar.side === 'right'
  const x = right ? v.x + v.width - w : v.x
  return { x: x - content.x, y: v.y - content.y, width: w, height: v.height }
}

/** Going back takes the fold-in spring (0.13 / 1.0), Slide the column in and
 * out's ease-in 0.22, nothing with Reduce animations (Design.swift
 * Motion.folding); the overlay is let go once it has. */
function goBack(c: WindowController, w: Watch): void {
  const ms = model.pref<boolean>('motion.instant') ? 0 : model.pref<boolean>('sidebar.slides') ? 220 : 191
  if (!ms) { c.sendOverlay({ kind: 'none' }); return }
  c.sendOverlay({ kind: 'fold', going: true } as never)
  w.going = setTimeout(() => { w.going = null; if (leavingOut(c)) c.sendOverlay({ kind: 'none' }) }, ms)
}

function comeOut(c: WindowController, w: Watch, v: Rect): void {
  if (w.going) { clearTimeout(w.going); w.going = null }
  w.left = null
  w.arrived = null
  c.sendOverlay({ kind: 'fold' })
  c.setOverlayRegion(peekRegion(c, v), false)
}

function tickOne(c: WindowController, now: number, p: { x: number; y: number }): void {
  const w = watching.get(c) ?? { left: null, arrived: null, going: null }
  watching.set(c, w)
  // A video alone on the screen (a page's own full screen): nothing comes
  // over it, neither the strip with the buttons nor the column or the tabs.
  if (c.isFilling()) {
    if (revealed(c) || peeking(c) || leavingOut(c)) c.sendOverlay({ kind: 'none' })
    w.left = w.arrived = null
    return
  }
  const v = c.frame.visual()
  // full screen: the strip with the buttons
  if (full(c)) {
    // The window as people see it (a window has its clear margin round it, a full screen none).
    const d = v
    const atTop = p.x >= d.x && p.x < d.x + d.width && p.y >= d.y && p.y < d.y + STRIP_EDGE
    const onStrip = p.x >= d.x && p.x < d.x + d.width && p.y >= d.y - BEYOND && p.y < d.y + STRIP_STAY
    if (revealed(c)) {
      if (onStrip) w.left = null
      else if (w.left == null) w.left = now
      else if (now - w.left > GRACE * 3) { w.left = null; c.sendOverlay({ kind: 'none' }) }
      return
    }
    if (atTop && overlayFree(layer(c)) && ours(c)) {
      w.left = null
      const content = c.base.getContentBounds()
      c.sendOverlay({ kind: 'panel', name: REVEAL })
      c.setOverlayRegion({ x: v.x - content.x, y: v.y - content.y, width: v.width, height: STRIP + 12 }, false)
      return
    }
  } else if (revealed(c)) c.sendOverlay({ kind: 'none' })
  // the folded column, or the strip across the top
  if (!folded(c)) { if (peeking(c) || leavingOut(c)) c.sendOverlay({ kind: 'none' }); return }
  const strip = top(c)
  const right = c.record.sidebar.side === 'right'
  const fromEdge = strip ? p.y - v.y : right ? v.x + v.width - 1 - p.x : p.x - v.x
  const within = strip ? p.x >= v.x && p.x < v.x + v.width : p.y >= v.y && p.y < v.y + v.height
  const reach = strip ? stripHeight() : columnWidth(c)
  if (peeking(c)) {
    const stays = within && fromEdge > -BEYOND && fromEdge < reach
    if (stays) w.left = null
    else if (w.left == null) w.left = now
    else if (now - w.left > GRACE) { w.left = null; goBack(c, w) }
    return
  }
  // A column resting folded (Hide the column until…) has a wider edge and a
  // dwell; the strip always waits, its edge being on the way elsewhere.
  const resting = !strip && !!model.pref<boolean>('sidebar.hides')
  const edge = resting ? HIDDEN_EDGE : EDGE
  // Not in the strip's corner of a full screen, nor over anything else floating.
  const touch = within && fromEdge >= 0 && fromEdge < edge && !(!strip && full(c) && p.y < v.y + STRIP_STAY)
  if (!touch || !ours(c) || !(overlayFree(layer(c)) || leavingOut(c))) { w.arrived = null; return }
  const dwell = strip ? DWELL : resting ? COLUMN_DWELL : 0
  if (w.arrived == null) w.arrived = now
  if (now - w.arrived >= dwell) comeOut(c, w, v)
}

/** How far the pointer is from the nearest edge that waits in this window
 * (the top strip in full screen, the folded column's side or top). */
function distance(c: WindowController, p: { x: number; y: number }): number {
  const v = c.frame.visual()
  const zones: Rect[] = []
  if (full(c)) zones.push({ x: v.x, y: v.y, width: v.width, height: STRIP_EDGE })
  if (folded(c)) {
    if (top(c)) zones.push({ x: v.x, y: v.y, width: v.width, height: HIDDEN_EDGE })
    else if (c.record.sidebar.side === 'right') zones.push({ x: v.x + v.width - HIDDEN_EDGE, y: v.y, width: HIDDEN_EDGE, height: v.height })
    else zones.push({ x: v.x, y: v.y, width: HIDDEN_EDGE, height: v.height })
  }
  let near = Infinity
  for (const r of zones) {
    const dx = Math.max(r.x - p.x, 0, p.x - (r.x + r.width)), dy = Math.max(r.y - p.y, 0, p.y - (r.y + r.height))
    near = Math.min(near, Math.hypot(dx, dy))
  }
  return near
}

function tick(): void {
  timer = null
  const now = Date.now()
  const p = pointer()
  let busy = false, close = false, near = Infinity
  for (const c of allControllers()) {
    if (c.base.isDestroyed()) continue
    if (!(folded(c) || full(c) || peeking(c) || leavingOut(c) || revealed(c))) continue
    busy = true
    tickOne(c, now, p)
    const w = watching.get(c)
    // Something out, or waiting on its dwell or its grace: every frame.
    if (peeking(c) || leavingOut(c) || revealed(c) || w?.left != null || w?.arrived != null || w?.going) close = true
    else near = Math.min(near, distance(c, p))
  }
  if (!busy) return
  // A pointer crossing 6 px a millisecond reaches the edge before the next look.
  if (timer) clearTimeout(timer)
  timer = setTimeout(tick, close ? 16 : Math.min(120, Math.max(16, Math.round(near / 6))))
}

function stop(): void { if (timer) clearTimeout(timer); timer = null }

/** Watch again, at once: a column folded, a window gone to full screen. */
export function watchEdges(): void {
  if (!allControllers().some(c => folded(c) || full(c))) return
  stop()
  timer = setTimeout(tick, 16)
}

model.on('window-changed', (_id: string, slices: string[]) => { if (slices.includes('sidebar')) watchEdges() })
// Full screen comes from F11, the system or a page; a slow look is enough to start.
setInterval(() => { if (!timer) watchEdges() }, 1000).unref()

// For the tests: a pointer of their own (null: the real one again), and what is out.
benchRequest('window.pointer', req => {
  fake = req.x == null ? null : { x: Number(req.x), y: Number(req.y) }
  watchEdges()
  return {}
})
benchRequest('window.edges', req => {
  const c = allControllers().find(x => !req.window || x.record.id === req.window) ?? allControllers()[0]
  return { peek: !!c && peeking(c), going: !!c && leavingOut(c), reveal: !!c && revealed(c), region: c?.overlay.getBounds() ?? null, watching: !!timer }
})

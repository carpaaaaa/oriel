// The pointer on the window's own surfaces (studio/01 §1.12): moving the
// window from the strip and the column's empty places, double clicking the
// strip, resizing from the grips, and the clear margin around the window
// that lets clicks through.
//
// No -webkit-app-region: in a drag region the page hears nothing (no double
// click of its own, no right click, no dropped links). A press here becomes a
// move only once the pointer has travelled a few pixels; then the main process
// hands it to Windows' move loop (or moves the window by hand on a Mac).

import { state, cmd } from '../lib/store'
import type { Edge } from '../../shared/modules/window'

/** Things a click takes: never a handle for the window. The column's and the
 * strip's pieces are carried by the tabs module (sidebar/drag.ts, tabbar/). */
const TAKEN = 'button, input, textarea, select, a, [contenteditable], [data-no-drag], .row, .pin, .grip, .address-line, .caption-buttons, .card, .grips, ' +
  '.square, .tile, .group-heading, .folder-heading, .keep-line, .strip-tab, .strip-pin, .strip-group-name'
/** Surfaces that move the window. */
const MOVES = '.drag, .top-strip, .sidebar, .window'
/** Surfaces where a double click maximizes, as a title bar does. */
const STRIP = '.drag, .top-strip'
/** Windows' drag threshold (SM_CXDRAG) at 100%. */
const THRESHOLD = 4

export function isMoveSurface(target: EventTarget | null): boolean {
  const el = target as Element | null
  if (!el?.closest) return false
  return !el.closest(TAKEN) && !!el.closest(MOVES)
}

export function isStrip(target: EventTarget | null): boolean {
  const el = target as Element | null
  return !!el?.closest && !el.closest(TAKEN) && !!el.closest(STRIP)
}

const drawn = () => state.frame?.kind === 'drawn'

/** Wire moving, double click and the clear margin on the frame element. */
export function wireFrame(frame: HTMLElement): () => void {
  let press: { x: number; y: number; id: number } | null = null
  let byHand = false
  let asked: { hollow: boolean; rev: number } | null = null

  const down = (e: PointerEvent) => {
    if (!drawn() || e.button !== 0 || !isMoveSurface(e.target)) return
    press = { x: e.screenX, y: e.screenY, id: e.pointerId }
  }
  const move = (e: PointerEvent) => {
    hover(e)
    if (byHand) { void cmd({ do: 'window.moveDrag', phase: 'move', x: e.screenX, y: e.screenY }); return }
    if (!press || e.pointerId !== press.id) return
    if (Math.hypot(e.screenX - press.x, e.screenY - press.y) < THRESHOLD) return
    if (!(e.buttons & 1)) { press = null; return }
    if (state.frame?.manual) {
      byHand = true
      frame.setPointerCapture(e.pointerId)
      void cmd({ do: 'window.moveDrag', phase: 'start', x: press.x, y: press.y })
      void cmd({ do: 'window.moveDrag', phase: 'move', x: e.screenX, y: e.screenY })
    } else {
      void cmd({ do: 'window.startDrag', x: press.x, y: press.y })
    }
    press = null
  }
  const up = (e: PointerEvent) => {
    press = null
    if (byHand) {
      byHand = false
      if (frame.hasPointerCapture(e.pointerId)) frame.releasePointerCapture(e.pointerId)
      void cmd({ do: 'window.moveDrag', phase: 'end', x: e.screenX, y: e.screenY })
    }
  }
  const dbl = (e: MouseEvent) => {
    if (drawn() && e.button === 0 && isStrip(e.target)) void cmd({ do: 'window.maximize' })
  }
  // Over the clear margin the window lets clicks through; the main process
  // watches the pointer until it comes back.
  const hover = (e: PointerEvent) => {
    if (!drawn() || state.frame?.state !== 'free' || byHand || e.buttons) return
    const hollow = e.target === frame
    if (hollow === state.frame?.hollow) return
    // Ask once per state the main process sent.
    if (asked && asked.hollow === hollow && asked.rev === state.rev) return
    asked = { hollow, rev: state.rev }
    void cmd({ do: 'window.hollow', hollow })
  }

  frame.addEventListener('pointerdown', down)
  frame.addEventListener('pointermove', move)
  frame.addEventListener('pointerup', up)
  frame.addEventListener('pointercancel', up)
  frame.addEventListener('dblclick', dbl)
  return () => {
    frame.removeEventListener('pointerdown', down)
    frame.removeEventListener('pointermove', move)
    frame.removeEventListener('pointerup', up)
    frame.removeEventListener('pointercancel', up)
    frame.removeEventListener('dblclick', dbl)
  }
}

/** A press on a grip: Windows' size loop, or resizing by hand. */
export function gripDown(edge: Edge, e: PointerEvent): void {
  if (e.button !== 0) return
  e.preventDefault()
  if (!state.frame?.manualResize) {
    void cmd({ do: 'window.startResize', edge, x: e.screenX, y: e.screenY })
    return
  }
  const el = e.currentTarget as HTMLElement
  el.setPointerCapture(e.pointerId)
  void cmd({ do: 'window.resizeDrag', edge, phase: 'start', x: e.screenX, y: e.screenY })
  let last: PointerEvent | null = null
  const move = (m: PointerEvent) => {
    if (!last) requestAnimationFrame(() => {
      if (last) void cmd({ do: 'window.resizeDrag', edge, phase: 'move', x: last.screenX, y: last.screenY })
      last = null
    })
    last = m
  }
  const up = (u: PointerEvent) => {
    el.removeEventListener('pointermove', move)
    el.removeEventListener('pointerup', up)
    el.removeEventListener('pointercancel', up)
    void cmd({ do: 'window.resizeDrag', edge, phase: 'move', x: u.screenX, y: u.screenY })
    void cmd({ do: 'window.resizeDrag', edge, phase: 'end', x: u.screenX, y: u.screenY })
  }
  el.addEventListener('pointermove', move)
  el.addEventListener('pointerup', up)
  el.addEventListener('pointercancel', up)
}

export const EDGES: Edge[] = ['top', 'right', 'bottom', 'left', 'top-left', 'top-right', 'bottom-left', 'bottom-right']

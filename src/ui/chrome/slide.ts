// Ctrl+S, the column going away and coming back (studio/01 §5.29; Fold.swift
// moveColumn, Design.swift Motion.folding): it slides off the window's edge
// on the fold-in spring (0.13 / 1.0) and back on the fold-out one (0.14 /
// 0.86), or with Slide the column in and out on an ease-in 0.22 / ease-out
// 0.26; at once with Reduce animations. The page moves with it: each frame
// the card's edge is set beside the column's and measured, and the main
// process puts the page there in that same frame (layout.slots), so the two
// never part. Only the column down the side: the strip across the top stays
// as it is.

import { createComputed, createSignal, on, onCleanup, untrack } from 'solid-js'
import { state } from '../lib/store'
import { Springs, springAt, springDuration, reducedMotion, type SpringSpec } from '../../shared/spring'

/** cubic-bezier(x1, y1, x2, y2) at x (Newton on x, then y). */
function bezier(x1: number, y1: number, x2: number, y2: number, x: number): number {
  const at = (a: number, b: number, t: number) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3
  let t = x
  for (let i = 0; i < 8; i++) {
    const dx = at(x1, x2, t) - x
    const d = 3 * x1 * (1 - t) ** 2 + 6 * (x2 - x1) * t * (1 - t) + 3 * (1 - x2) * t * t
    if (Math.abs(dx) < 1e-5 || !d) break
    t = Math.max(0, Math.min(1, t - dx / d))
  }
  return at(y1, y2, t)
}

/** How far out the column is, 0 (away) to 1 (beside the page), while it
 * slides; null at rest. `frame` is called each frame once it is applied. */
export function foldSlide(frame: () => void): { out: () => number | null } {
  const [out, setOut] = createSignal<number | null>(null)
  let raf = 0
  const stop = () => { if (raf) cancelAnimationFrame(raf); raf = 0 }
  onCleanup(stop)
  // Before the interface is drawn for the change (a computed, not an
  // effect): the column stays for the frame the fold lands in.
  createComputed(on(() => state.sidebar.folded, (folded, was) => {
    if (was === undefined || folded === was) return
    const prefs = untrack(() => state.prefs) ?? {}
    if (untrack(() => state.sidebar.layout) !== 'side' || prefs['motion.instant'] || reducedMotion()) { stop(); setOut(null); return }
    const from = untrack(out) ?? (folded ? 1 : 0)
    const to = folded ? 0 : 1
    let ease: (s: number) => number, length: number
    if (prefs['sidebar.slides']) {
      length = folded ? 0.22 : 0.26
      ease = folded ? s => bezier(0.42, 0, 1, 1, s / length) : s => bezier(0, 0, 0.58, 1, s / length)
    } else {
      const spec: SpringSpec = folded ? Springs.foldIn : Springs.foldOut
      length = springDuration(spec)
      ease = s => springAt(spec, s)
    }
    stop()
    setOut(from)
    let start = 0
    const step = (now: number) => {
      if (!start) start = now
      const s = (now - start) / 1000
      const done = s >= length
      setOut(done ? null : from + (to - from) * ease(s))
      frame()
      raf = done ? 0 : requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
  }))
  return { out }
}

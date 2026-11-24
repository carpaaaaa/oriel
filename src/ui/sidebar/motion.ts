// Motion for the column (studio/02 §6.1; Design.swift `Motion`): springs
// with SwiftUI's maths, in CSS (linear()) for what CSS carries and per
// frame for what follows a moving target (the grey that glides, §5.12).

import { createMemo, createSignal, untrack } from 'solid-js'
import { Springs, springCSS, reducedMotion, lightMotion, type SpringSpec } from '../../shared/spring'
import { state } from '../lib/store'

export { Springs, reducedMotion }

/** A keyed list that keeps what leaves for a moment, at the place it had in
 * the list, so it can go where it stood while the rest close up, as SwiftUI
 * draws a removed view through its transition (Side.swift:2290,
 * TabBar.swift:1081). The same element stays on screen from live to leaving:
 * nothing is built again mid-motion. `quiet()` true lands a change at once
 * (another space's tabs, Reduce animations). Keys new in the latest change
 * are `fresh`, for their arrival. `done(key)` lets a leaving one go. */
export function keepLeaving<T>(list: () => T[], keyOf: (t: T) => string, quiet: () => boolean) {
  const [tick, setTick] = createSignal(0)
  const finished = new Set<string>()
  const items = new Map<string, T>()
  const ghosts = new Set<string>()
  let fresh = new Set<string>()
  let prev: string[] | null = null
  let wasLive = new Set<string>()
  const keys = createMemo(() => {
    const now = list()
    tick()
    const hush = untrack(quiet)
    const nowKeys = now.map(keyOf)
    const live = new Set(nowKeys)
    for (const k of finished) ghosts.delete(k)
    finished.clear()
    const before = prev ?? []
    fresh = new Set(prev && !hush ? nowKeys.filter(k => !wasLive.has(k) && !ghosts.has(k)) : [])
    if (hush) ghosts.clear()
    else for (const k of wasLive) if (!live.has(k)) ghosts.add(k)
    for (const k of [...ghosts]) if (live.has(k)) ghosts.delete(k)
    wasLive = live
    for (const t of now) items.set(keyOf(t), t)
    // Each leaving key right after the one it followed.
    const out = [...nowKeys]
    for (let i = 0; i < before.length; i++) {
      const g = before[i]
      if (!ghosts.has(g)) continue
      let at = 0
      for (let j = i - 1; j >= 0; j--) { const x = out.indexOf(before[j]); if (x >= 0) { at = x + 1; break } }
      out.splice(at, 0, g)
    }
    const shown = new Set(out)
    for (const k of [...items.keys()]) if (!shown.has(k)) items.delete(k)
    prev = out
    return out
  })
  return {
    keys,
    item: (k: string) => { keys(); return items.get(k) },
    leaving: (k: string) => { keys(); return ghosts.has(k) },
    fresh: (k: string) => fresh.has(k),
    done: (k: string) => { if (ghosts.has(k) && !finished.has(k)) { finished.add(k); setTick(n => n + 1) } },
  }
}

/** What faded out for a tab's address fading back in on glide as the field
 * goes (Side.swift:2283, TabBar.swift:1072). */
export function fadeBack(host: Element, selector: string): void {
  const { duration, easing } = curve(Springs.glide)
  if (!duration) return
  for (const e of host.querySelectorAll(selector)) e.animate([{ opacity: 0 }, { opacity: 1 }], { duration, easing })
}

/** Something that was leaving came back before it went: drawn as it was.
 * Only what was started here goes; the element's CSS transitions (its place,
 * its width) carry on. */
export function stay(el: Element): void {
  for (const a of el.getAnimations()) if (!(a instanceof CSSTransition) && !(a instanceof CSSAnimation)) a.cancel()
}

/** For keepLeaving: quiet when the space changed since it last asked (the
 * Mac's `.transaction(value: browser.spaceID)`: another space's rows come in
 * at once), with Reduce animations, or when `also()` says so. */
export function quietOn(also: () => boolean = () => false): () => boolean {
  let space = untrack(() => state.space)
  return () => {
    const now = state.space
    const switched = now !== space
    space = now
    return switched || also() || reducedMotion()
  }
}

const curves = new Map<SpringSpec, { duration: number; easing: string }>()
/** A spring as WAAPI timing: { duration, easing: linear(...) }. */
export function curve(spec: SpringSpec): { duration: number; easing: string } {
  let c = curves.get(spec)
  if (!c) { c = springCSS(spec, 48); curves.set(spec, c) }
  if (reducedMotion()) return { duration: 0, easing: 'linear' }
  // Saving power: Motion.glide and .settle are easeOut 0.16 (Design.swift).
  if (lightMotion() && (spec === Springs.glide || spec === Springs.settle)) return { duration: 160, easing: 'cubic-bezier(0, 0, .58, 1)' }
  return c
}

export interface Box { x: number; y: number; w: number; h: number }

/** A box driven toward a goal that may move each frame, keeping its
 * velocity when retargeted, as matchedGeometryEffect does. */
export class Chase {
  pos: number[]
  private vel = [0, 0, 0, 0]
  private raf = 0
  private last = 0
  constructor(private spec: SpringSpec, start: Box, private goal: () => Box | null,
    private frame: (b: Box) => void, private done: () => void) {
    this.pos = [start.x, start.y, start.w, start.h]
  }
  private timer = 0
  start(): void {
    if (reducedMotion()) { const g = this.goal(); if (g) this.frame(g); this.done(); return }
    this.last = performance.now()
    this.next()
  }
  /** The next frame; with none for 0.05 s (a window not drawn), a timer at
   * 1/30 s, as the Mac's own glide falls back (SpaceSwipe.swift). */
  private next(): void {
    this.raf = requestAnimationFrame(this.step)
    clearTimeout(this.timer)
    this.timer = window.setTimeout(() => { if (this.raf) { cancelAnimationFrame(this.raf); this.step(performance.now()) } }, 50)
  }
  stop(): void { if (this.raf) cancelAnimationFrame(this.raf); this.raf = 0; clearTimeout(this.timer) }
  private step = (now: number) => {
    clearTimeout(this.timer)
    const g = this.goal()
    if (!g) { this.stop(); this.done(); return }
    this.raf = this.raf || 1
    const goal = [g.x, g.y, g.w, g.h]
    const k = (2 * Math.PI / this.spec.response) ** 2
    const c = (4 * Math.PI * this.spec.damping) / this.spec.response
    let dt = Math.min((now - this.last) / 1000, 1 / 30)
    if (dt <= 0) dt = 1 / 120
    this.last = now
    let moving = false
    // Sub-steps keep the integration steady at 60 Hz.
    const n = Math.max(1, Math.ceil(dt / (1 / 240)))
    for (let s = 0; s < n; s++) {
      for (let i = 0; i < 4; i++) {
        const f = k * (goal[i] - this.pos[i]) - c * this.vel[i]
        this.vel[i] += (f * dt) / n
        this.pos[i] += (this.vel[i] * dt) / n
      }
    }
    for (let i = 0; i < 4; i++) {
      if (Math.abs(goal[i] - this.pos[i]) > 0.05 || Math.abs(this.vel[i]) > 0.5) moving = true
    }
    if (!moving) this.pos = goal
    this.frame({ x: this.pos[0], y: this.pos[1], w: this.pos[2], h: this.pos[3] })
    if (moving) this.next()
    else { this.raf = 0; this.done() }
  }
}

/** Arrive: scale from `scale` at the leading edge, and fade in (§5.18,
 * Side.swift:2290: 0.94 for rows, 0.8 for squares), on settle. */
export function arrive(el: Element, scale: number, origin = 'left center'): void {
  if (reducedMotion()) return
  const { duration, easing } = curve(Springs.settle)
  ;(el as HTMLElement).style.transformOrigin = origin
  el.animate([{ opacity: 0, scale: String(scale) }, { opacity: 1, scale: '1' }], { duration, easing })
}

/** Leave: the same, backwards. */
export function leave(el: Element, scale: number, then: () => void, origin = 'left center'): void {
  if (reducedMotion()) { then(); return }
  stay(el)
  const { duration, easing } = curve(Springs.settle)
  ;(el as HTMLElement).style.transformOrigin = origin
  const a = el.animate([{ opacity: 1, scale: '1' }, { opacity: 0, scale: String(scale) }], { duration, easing, fill: 'forwards' })
  a.onfinish = then
  a.oncancel = then
}

/** The space slide (SpaceSwipe.swift `SwipeGlide`, §7.21): critically
 * damped at ω = 34, starting at a gentle −0.5·ω·x0. */
export function swipe(x0: number, frame: (x: number) => void, done: () => void): () => void {
  if (reducedMotion() || !x0) { frame(0); done(); return () => {} }
  const w = 34, v0 = -0.5 * w * x0
  let start = 0, raf = 0
  const step = (now: number) => {
    if (!start) start = now
    const t = (now - start) / 1000
    let x = (x0 + (v0 + w * x0) * t) * Math.exp(-w * t)
    const v = (v0 - w * (v0 + w * x0) * t) * Math.exp(-w * t)
    if (Math.sign(x) !== Math.sign(x0) || t > 0.8 || (Math.abs(x) < 1 && Math.abs(v) < 30)) x = 0
    frame(x)
    if (x === 0) { raf = 0; done(); return }
    raf = requestAnimationFrame(step)
  }
  raf = requestAnimationFrame(step)
  return () => { if (raf) cancelAnimationFrame(raf) }
}

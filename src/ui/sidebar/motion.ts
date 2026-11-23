// Motion for the column (studio/02 §6.1; Design.swift `Motion`): springs
// with SwiftUI's maths, in CSS (linear()) for what CSS carries and per
// frame for what follows a moving target (the grey that glides, §5.12).

import { Springs, springCSS, reducedMotion, type SpringSpec } from '../../shared/spring'

export { Springs, reducedMotion }

const curves = new Map<SpringSpec, { duration: number; easing: string }>()
/** A spring as WAAPI timing: { duration, easing: linear(...) }. */
export function curve(spec: SpringSpec): { duration: number; easing: string } {
  let c = curves.get(spec)
  if (!c) { c = springCSS(spec, 48); curves.set(spec, c) }
  return reducedMotion() ? { duration: 0, easing: 'linear' } : c
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
  start(): void {
    if (reducedMotion()) { const g = this.goal(); if (g) this.frame(g); this.done(); return }
    this.last = performance.now()
    this.raf = requestAnimationFrame(this.step)
  }
  stop(): void { if (this.raf) cancelAnimationFrame(this.raf); this.raf = 0 }
  private step = (now: number) => {
    const g = this.goal()
    if (!g) { this.stop(); this.done(); return }
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
    if (moving) this.raf = requestAnimationFrame(this.step)
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

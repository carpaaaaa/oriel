// Springs as SwiftUI defines them (Design.swift `Motion`), for things CSS
// transitions can't carry: a value driven by JavaScript each frame (a page
// view's bounds, the active tab's grey following the pointer). For plain CSS
// use the linear() curves in tokens.css: they are sampled from the same maths.
//
// SwiftUI spring(response, dampingFraction): mass 1,
// stiffness (2π/response)², damping 4π·dampingFraction/response.

export interface SpringSpec { response: number; damping: number }

export const Springs = {
  /** Things that move: the active tab's grey, the column, welcome pages. */
  glide: { response: 0.34, damping: 0.82 },
  /** Things that come or go: rows, switches, panels. */
  settle: { response: 0.3, damping: 0.86 },
  /** The folded column coming out over the page. */
  foldOut: { response: 0.14, damping: 0.86 },
  /** ...and going back. */
  foldIn: { response: 0.13, damping: 1.0 },
  /** The settings rail's white. */
  rail: { response: 0.45, damping: 0.72 },
} as const satisfies Record<string, SpringSpec>

export function reducedMotion(): boolean {
  // Settings › Reduce animations (motion.instant) as well as the system's.
  if (typeof document !== 'undefined' && document.documentElement?.dataset.motion === 'instant') return true
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Saving power (motion.light): glide and settle become a short ease-out. */
export function lightMotion(): boolean {
  return typeof document !== 'undefined' && document.documentElement?.dataset.motion === 'light'
}

/** Position of a spring released at 0 toward 1 after `t` seconds. */
export function springAt(spec: SpringSpec, t: number): number {
  const w0 = (2 * Math.PI) / spec.response
  const z = spec.damping
  if (z < 1) {
    const wd = w0 * Math.sqrt(1 - z * z)
    return 1 - Math.exp(-z * w0 * t) * (Math.cos(wd * t) + ((z * w0) / wd) * Math.sin(wd * t))
  }
  return 1 - Math.exp(-w0 * t) * (1 + w0 * t)
}

/** Time for the spring to come within 0.1% of its target, to stop driving. */
export function springDuration(spec: SpringSpec): number {
  for (let t = 0.01; t < 5; t += 0.005) {
    let settled = true
    for (let u = t; u < t + 0.3; u += 0.01) if (Math.abs(1 - springAt(spec, u)) > 0.001) { settled = false; break }
    if (settled) return t
  }
  return 1
}

/** A CSS linear() easing sampled from a spring, with its duration. */
export function springCSS(spec: SpringSpec, points = 40): { duration: number; easing: string } {
  const d = springDuration(spec)
  const values: string[] = []
  for (let i = 0; i <= points; i++) values.push((i === points ? 1 : springAt(spec, (d * i) / points)).toFixed(4))
  return { duration: Math.round(d * 1000), easing: `linear(${values.join(', ')})` }
}

/** Drive numbers with a spring that keeps its velocity when retargeted, as
 * SwiftUI's do. `onFrame` gets the current values; returns a stop function. */
export class SpringDriver {
  private pos: number[]
  private vel: number[]
  private goal: number[]
  private raf = 0
  private last = 0
  constructor(private spec: SpringSpec, start: number[], private onFrame: (values: number[]) => void) {
    this.pos = [...start]
    this.vel = start.map(() => 0)
    this.goal = [...start]
  }
  set(goal: number[], instant = false) {
    this.goal = [...goal]
    if (instant || reducedMotion()) {
      this.pos = [...goal]
      this.vel = goal.map(() => 0)
      this.onFrame(this.pos)
      return
    }
    if (!this.raf) { this.last = performance.now(); this.raf = requestAnimationFrame(this.step) }
  }
  private step = (now: number) => {
    const k = (2 * Math.PI / this.spec.response) ** 2
    const c = (4 * Math.PI * this.spec.damping) / this.spec.response
    let dt = Math.min((now - this.last) / 1000, 1 / 30)
    if (dt <= 0) dt = 1 / 120
    this.last = now
    let moving = false
    for (let i = 0; i < this.pos.length; i++) {
      const f = k * (this.goal[i] - this.pos[i]) - c * this.vel[i]
      this.vel[i] += f * dt
      this.pos[i] += this.vel[i] * dt
      if (Math.abs(this.goal[i] - this.pos[i]) > 0.05 || Math.abs(this.vel[i]) > 0.5) moving = true
      else { this.pos[i] = this.goal[i]; this.vel[i] = 0 }
    }
    this.onFrame(this.pos)
    this.raf = moving ? requestAnimationFrame(this.step) : 0
  }
  stop() { if (this.raf) cancelAnimationFrame(this.raf); this.raf = 0 }
}

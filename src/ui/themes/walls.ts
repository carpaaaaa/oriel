// Ten scenic murals, drawn in code (HomeWalls.swift, studio/02 §8.2): layered
// flat silhouettes, seeded and still. Translated line for line, the calls to
// the generator in the same order, so each wall is the Mac's own.

import type { HomeTheme, RGB } from './model'
import { seed, Seeded } from './random'
import { applying, arcTo, type Ctx, ellipse, ellipseIn, fill, linear, pen, type Pen, rectIn, roundedRectIn, scaleOf, stroke } from './draw'

const night = new Set<HomeTheme>(['northernLights', 'saturnRise', 'moonscape', 'cityAtNight'])

export function paintWall(theme: HomeTheme, g: Ctx, w: number, h: number, dark: boolean): void {
  const s = new Scene(g, w, h, pen(dark, night.has(theme)), seed(theme))
  switch (theme) {
    case 'openRoad': s.openRoad(); break
    case 'desertHighway': s.desertHighway(); break
    case 'coastalCliffs': s.coastalCliffs(); break
    case 'mountainLake': s.mountainLake(); break
    case 'riceTerraces': s.riceTerraces(); break
    case 'northernLights': s.northernLights(); break
    case 'saturnRise': s.saturnRise(); break
    case 'moonscape': s.moonscape(); break
    case 'cityAtNight': s.cityAtNight(); break
    case 'monsoonForest': s.monsoonForest(); break
    default: return
  }
  s.grain()
}

type P2 = [number, number]
const PI = Math.PI

/** One canvas with its pen and generator. Coordinates are fractions of the
 * width and height unless a name says otherwise. */
class Scene {
  rng: Seeded
  constructor(public g: Ctx, public w: number, public h: number, public pen: Pen, s: bigint) { this.rng = new Seeded(s) }

  rand(lo: number, hi: number): number { return this.rng.in(lo, hi) }
  pt(x: number, y: number): P2 { return [x * this.w, y * this.h] }

  poly(pts: P2[]): Path2D {
    const p = new Path2D()
    pts.forEach(([x, y], i) => (i === 0 ? p.moveTo(x * this.w, y * this.h) : p.lineTo(x * this.w, y * this.h)))
    p.closePath()
    return p
  }

  fill(path: Path2D, c: RGB, a = 1): void { fill(this.g, path, this.pen(c, a)) }
  stroke(path: Path2D, c: RGB, width: number, a = 1): void { stroke(this.g, path, this.pen(c, a), width) }

  /** A disc; the radius is a fraction of the height. */
  disc(x: number, y: number, r: number): Path2D { const { w, h } = this; return ellipseIn(x * w - r * h, y * h - r * h, 2 * r * h, 2 * r * h) }
  oval(x: number, y: number, rx: number, ry: number): Path2D { const { w, h } = this; return ellipseIn((x - rx) * w, (y - ry) * h, 2 * rx * w, 2 * ry * h) }
  rect(x: number, y: number, rw: number, rh: number): Path2D { const { w, h } = this; return rectIn(x * w, y * h, rw * w, rh * h) }

  /** A vertical gradient across the whole canvas, evenly spaced stops. */
  sky(cols: RGB[], to = 1): void {
    const { g, w, h } = this
    fill(g, rectIn(-2, -2, w + 4, h + 4), linear(g, 0, 0, 0, h * to, cols.map(c => this.pen(c))))
  }

  /** A band filled with a vertical gradient between two heights (points). */
  band(x: number, y: number, bw: number, bh: number, y0: number, y1: number, cols: string[]): void {
    fill(this.g, rectIn(x, y, bw, bh), linear(this.g, 0, y0, 0, y1, cols))
  }

  ridgeY(u: number, base: number, amp: number, freq: number, phase: number): number {
    const a = Math.sin(u * freq * 2 * PI + phase)
    const b = Math.sin(u * freq * 5.4 * PI / 2 + phase * 1.7)
    return base + amp * (0.6 * a + 0.4 * b)
  }

  /** A rolling silhouette filled down to the bottom edge. */
  ridge(base: number, amp: number, freq: number, phase: number): Path2D {
    const { w, h } = this
    const p = new Path2D()
    p.moveTo(-4, h * 1.05)
    for (let i = 0; i <= 64; i++) {
      const u = i / 64
      p.lineTo(-4 + u * (w + 8), this.ridgeY(u, base, amp, freq, phase) * h)
    }
    p.lineTo(w + 4, h * 1.05)
    p.closePath()
    return p
  }

  stars(n: number, top: number, bottom: number): void {
    const { w, h } = this
    const k = Math.min(w, h) / 900
    for (let i = 0; i < n; i++) {
      const x = this.rand(0, 1) * w, y = this.rand(top, bottom) * h
      const r = this.rand(0.5, 1.6) * k
      this.fill(ellipseIn(x - r, y - r, r * 2, r * 2), [1, 1, 0.92], this.rand(0.4, 0.95))
    }
  }

  cloud(x: number, y: number, s: number, c: RGB, a: number): void {
    this.fill(this.oval(x, y, 0.07 * s, 0.022 * s), c, a)
    this.fill(this.oval(x - 0.03 * s, y - 0.016 * s, 0.04 * s, 0.022 * s), c, a)
    this.fill(this.oval(x + 0.03 * s, y - 0.012 * s, 0.045 * s, 0.02 * s), c, a)
  }

  pine(x: number, base: number, height: number, c: RGB): void {
    const { w, h } = this
    const tw = height * 0.16 * h / w
    this.fill(this.rect(x - tw / 2, base - height * 0.12, tw, height * 0.14), c)
    for (let k = 0; k < 3; k++) {
      const top = base - height + k * height * 0.24
      const bot = base - height * 0.1 - (2 - k) * height * 0.2
      const half = (0.22 + 0.16 * k) * height * h / w * 0.9
      this.fill(this.poly([[x, top], [x + half, bot], [x - half, bot]]), c)
    }
  }

  /** A little grain, cheap: a few hundred specks. Black and white, not penned. */
  grain(): void {
    const { w, h } = this
    const k = Math.max(0.7, Math.min(w, h) / 900)
    for (let i = 0; i < 240; i++) {
      const x = this.rand(0, 1) * w, y = this.rand(0, 1) * h
      const r = this.rand(0.4, 1.0) * k
      fill(this.g, ellipseIn(x, y, r * 2, r * 2), i % 2 === 0 ? 'rgb(0 0 0 / 0.035)' : 'rgb(255 255 255 / 0.05)')
    }
  }

  // 1. Open Road

  openRoad(): void {
    const { w, h } = this
    this.sky([[0.58, 0.78, 0.92], [0.80, 0.90, 0.94], [0.99, 0.93, 0.82]], 0.65)
    this.cloud(0.2, 0.2, 1.4, [1, 1, 1], 0.7)
    this.cloud(0.78, 0.14, 1.1, [1, 1, 1], 0.6)
    this.cloud(0.55, 0.32, 0.8, [1, 1, 1], 0.45)
    this.fill(this.ridge(0.62, 0.02, 1.3, 0.5), [0.66, 0.78, 0.68])
    this.fill(this.ridge(0.645, 0.016, 1.9, 2.0), [0.52, 0.70, 0.48])
    const hz = 0.65
    this.fill(this.rect(-0.01, hz, 1.02, 1 - hz + 0.02), [0.55, 0.72, 0.36])
    const vp = this.pt(0.5, hz)
    // Fields: stripes fanning out from the vanishing point, and bands across.
    for (let i = -12; i < 12; i++) {
      const x0 = 0.5 + i * 0.22, x1 = x0 + 0.22
      const tri = new Path2D()
      tri.moveTo(vp[0], vp[1])
      tri.lineTo(...this.pt(x0 * 1.0 + (x0 - 0.5) * 3, 1.05))
      tri.lineTo(...this.pt(x1 + (x1 - 0.5) * 3, 1.05))
      tri.closePath()
      const tones: RGB[] = [[0.62, 0.77, 0.38], [0.80, 0.74, 0.40], [0.48, 0.66, 0.34]]
      this.fill(tri, tones[((i % 3) + 3) % 3], i % 2 === 0 ? 0.9 : 0.5)
    }
    for (let k = 0; k < 9; k++) {
      const t0 = Math.pow(k / 9, 2), t1 = Math.pow((k + 0.5) / 9, 2)
      this.fill(this.rect(-0.01, hz + (1 - hz) * t0, 1.02, (1 - hz) * (t1 - t0)), [1, 1, 0.8], 0.1)
    }
    // The road.
    const road = new Path2D()
    road.moveTo(vp[0] - 0.004 * w, vp[1])
    road.lineTo(vp[0] + 0.004 * w, vp[1])
    road.lineTo(...this.pt(0.5 + 0.17, 1.02))
    road.lineTo(...this.pt(0.5 - 0.17, 1.02))
    road.closePath()
    this.fill(road, [0.42, 0.42, 0.46])
    const n = 14
    for (let k = 0; k < n; k += 2) {
      const t0 = Math.pow(k / n, 2), t1 = Math.pow((k + 1) / n, 2)
      const w0 = 0.002 + 0.007 * t0, w1 = 0.002 + 0.007 * t1
      const y0 = hz + (1.02 - hz) * t0, y1 = hz + (1.02 - hz) * t1
      this.fill(this.poly([[0.5 - w0, y0], [0.5 + w0, y0], [0.5 + w1, y1], [0.5 - w1, y1]]), [0.96, 0.9, 0.62])
    }
    // Telegraph poles and the wires between them.
    for (const side of [-1, 1]) {
      const tops: P2[] = []
      for (let j = 0; j < 7; j++) {
        const t = Math.pow((j + 1.3) / 8.2, 1.7)
        const y = hz + (1.02 - hz) * t
        const x = 0.5 + side * (0.004 + 0.166 * t + 0.03 * t + 0.008)
        const ph = 0.2 * t
        this.fill(this.rect(x - 0.0015 - 0.002 * t, y - ph, 0.003 + 0.004 * t, ph), [0.30, 0.24, 0.22])
        this.fill(this.rect(x - 0.008 * (0.4 + t), y - ph, 0.016 * (0.4 + t), 0.004 + 0.006 * t), [0.30, 0.24, 0.22])
        tops.push(this.pt(x, y - ph))
      }
      for (let j = 0; j < tops.length - 1; j++) {
        const wire = new Path2D()
        wire.moveTo(...tops[j])
        wire.quadraticCurveTo((tops[j][0] + tops[j + 1][0]) / 2, (tops[j][1] + tops[j + 1][1]) / 2 + 0.012 * h, ...tops[j + 1])
        this.stroke(wire, [0.28, 0.24, 0.24], 1, 0.7)
      }
    }
  }

  // 2. Desert Highway

  private mesa(cx: number, wd: number, ht: number, base: number): Path2D {
    const shape: P2[] = [[-0.5, 0], [-0.46, -0.55], [-0.40, -0.58], [-0.38, -1], [0.30, -1], [0.33, -0.6], [0.40, -0.55], [0.5, 0]]
    return this.poly(shape.map(([a, b]) => [cx + a * wd, base + b * ht]))
  }

  desertHighway(): void {
    const { w, h } = this
    this.sky([[0.26, 0.18, 0.44], [0.62, 0.30, 0.50], [0.94, 0.52, 0.44], [0.99, 0.76, 0.46]], 0.67)
    const hz = 0.67
    for (const [k, a] of [[1.9, 0.12], [1.45, 0.2], [0.98, 0.9]]) this.fill(this.disc(0.74, hz, 0.12 * k), [1, 0.82, 0.5], a)
    this.fill(this.disc(0.74, hz, 0.12), [1, 0.88, 0.55])
    for (const [cx, wd, ht] of [[0.12, 0.2, 0.14], [0.34, 0.14, 0.09], [0.9, 0.2, 0.15], [0.64, 0.1, 0.05]]) this.fill(this.mesa(cx, wd, ht, hz + 0.01), [0.62, 0.34, 0.50])
    for (const [cx, wd, ht] of [[0.04, 0.26, 0.2], [0.23, 0.15, 0.1], [0.97, 0.22, 0.17], [0.8, 0.12, 0.07]]) this.fill(this.mesa(cx, wd, ht, hz + 0.02), [0.74, 0.36, 0.34])
    this.band(-2, hz * h, w + 4, h, hz * h, h, [this.pen([0.72, 0.36, 0.32]), this.pen([0.40, 0.19, 0.28])])
    // The winding road, as a ribbon along a centre line.
    const centre = (t: number): P2 => [(0.5 + Math.sin(t * PI * 1.6) * 0.17 * t) * w, (hz + (1.03 - hz) * Math.pow(t, 1.6)) * h]
    const half = (t: number) => (0.003 + 0.13 * t) * w
    const left: P2[] = [], right: P2[] = []
    for (let i = 0; i <= 40; i++) {
      const t = i / 40, c = centre(t), hw = half(t)
      left.push([c[0] - hw, c[1]])
      right.push([c[0] + hw, c[1]])
    }
    const road = new Path2D()
    road.moveTo(...left[0])
    for (const q of left.slice(1)) road.lineTo(...q)
    for (const q of [...right].reverse()) road.lineTo(...q)
    road.closePath()
    this.fill(road, [0.27, 0.19, 0.30])
    for (let k = 1; k < 20; k += 2) {
      const t0 = k / 20, t1 = (k + 1) / 20
      const a = centre(t0), b = centre(t1), d0 = half(t0) * 0.07, d1 = half(t1) * 0.07
      const dash = new Path2D()
      dash.moveTo(a[0] - d0, a[1])
      dash.lineTo(a[0] + d0, a[1])
      dash.lineTo(b[0] + d1, b[1])
      dash.lineTo(b[0] - d1, b[1])
      dash.closePath()
      this.fill(dash, [0.98, 0.80, 0.50])
    }
    // Saguaro silhouettes at the edges.
    for (const [x, y, k] of [[0.07, 0.93, 1.0], [0.14, 0.86, 0.6], [0.92, 0.9, 0.8]]) {
      const c: RGB = [0.20, 0.10, 0.20]
      const bw = 0.012 * k
      this.fill(roundedRectIn((x - bw) * w, (y - 0.2 * k) * h, bw * 2 * w, 0.2 * k * h, bw * w), c)
      const arms = new Path2D()
      arms.moveTo(...this.pt(x - bw, y - 0.07 * k)); arms.lineTo(...this.pt(x - 0.035 * k, y - 0.07 * k))
      arms.lineTo(...this.pt(x - 0.035 * k, y - 0.13 * k))
      arms.moveTo(...this.pt(x + bw, y - 0.1 * k)); arms.lineTo(...this.pt(x + 0.035 * k, y - 0.1 * k))
      arms.lineTo(...this.pt(x + 0.035 * k, y - 0.16 * k))
      this.stroke(arms, c, 0.014 * w * k)
    }
  }

  // 3. Coastal Cliffs

  /** A stepped cliff face at the left (side -1) or right (side 1) edge. */
  private cliff(side: number, top: number, width: number, steps: number): Path2D {
    const x = (f: number) => (side < 0 ? f : 1 - f)
    const pts: P2[] = [[x(-0.02), 1.05], [x(-0.02), top], [x(width), top + 0.015]]
    for (let i = 1; i <= steps; i++) {
      const f = i / steps
      const jitter = this.rand(-0.02, 0.02)
      pts.push([x(width * (1 - 0.5 * f) + jitter), top + (0.94 - top) * (f - 0.5 / steps)])
      pts.push([x(width * (1 - 0.5 * f) - 0.015 + jitter), top + (0.94 - top) * f])
    }
    pts.push([x(0.04), 1.05])
    return this.poly(pts)
  }

  coastalCliffs(): void {
    const { w, h } = this
    this.sky([[0.68, 0.84, 0.95], [0.88, 0.93, 0.94], [0.99, 0.92, 0.84]], 0.56)
    this.fill(this.disc(0.58, 0.26, 0.05), [1, 0.96, 0.84], 0.7)
    this.cloud(0.3, 0.16, 1.2, [1, 1, 1], 0.7)
    this.cloud(0.8, 0.28, 0.9, [1, 1, 1], 0.55)
    const hz = 0.56
    this.band(-2, hz * h, w + 4, h, hz * h, h, [this.pen([0.46, 0.72, 0.80]), this.pen([0.20, 0.46, 0.60])])
    this.fill(this.ridge(0.55, 0.008, 2.2, 1.0), [0.62, 0.76, 0.78], 0.8)
    for (let i = 0; i < 16; i++) {
      const y = this.rand(0.6, 0.96), x = this.rand(0.1, 0.8), l = this.rand(0.03, 0.1)
      this.fill(roundedRectIn(x * w, y * h, l * w, 0.003 * h + 1, 2), [1, 1, 1], 0.28)
    }
    // Far headlands, with the lighthouse on the right.
    this.fill(this.cliff(-1, 0.52, 0.3, 4), [0.62, 0.58, 0.60])
    this.fill(this.cliff(1, 0.52, 0.27, 4), [0.62, 0.58, 0.60])
    this.fill(this.rect(0.88, 0.505, 0.12, 0.02), [0.50, 0.66, 0.44])
    const lx = 0.9, base = 0.515
    this.fill(this.poly([[lx, 0.35], [0.62, 0.37], [0.62, 0.43]]), [1, 0.95, 0.65], 0.2)
    this.fill(this.poly([[lx - 0.016, base], [lx - 0.009, 0.34], [lx + 0.009, 0.34], [lx + 0.016, base]]), [0.97, 0.95, 0.92])
    this.fill(this.poly([[lx - 0.0135, 0.4], [lx - 0.0115, 0.37], [lx + 0.0115, 0.37], [lx + 0.0135, 0.4]]), [0.84, 0.30, 0.28])
    this.fill(this.poly([[lx - 0.0155, 0.465], [lx - 0.0135, 0.435], [lx + 0.0135, 0.435], [lx + 0.0155, 0.465]]), [0.84, 0.30, 0.28])
    this.fill(this.rect(lx - 0.012, 0.325, 0.024, 0.016), [1, 0.9, 0.5])
    this.fill(this.poly([[lx - 0.013, 0.325], [lx, 0.30], [lx + 0.013, 0.325]]), [0.30, 0.28, 0.34])
    // Near cliffs, grass on top.
    this.fill(this.cliff(-1, 0.64, 0.22, 5), [0.46, 0.40, 0.42])
    this.fill(this.cliff(1, 0.7, 0.2, 5), [0.44, 0.38, 0.41])
    this.fill(this.rect(-0.01, 0.635, 0.22, 0.016), [0.44, 0.62, 0.40])
    this.fill(this.rect(0.8, 0.695, 0.21, 0.016), [0.44, 0.62, 0.40])
    for (const [x, y] of [[0.2, 0.9], [0.12, 0.96], [0.84, 0.92], [0.92, 0.97]]) this.fill(this.oval(x, y, 0.05, 0.012), [1, 1, 1], 0.5)
  }

  // 4. Mountain Lake

  private peak(cx: number, wd: number, ph: number, wh: number): Path2D {
    return this.poly([[cx - wd, wh], [cx - wd * 0.4, wh - ph * 0.62], [cx - wd * 0.12, wh - ph * 0.78], [cx, wh - ph],
      [cx + wd * 0.2, wh - ph * 0.72], [cx + wd * 0.5, wh - ph * 0.5], [cx + wd, wh]])
  }

  private cap(cx: number, wd: number, ph: number, wh: number): Path2D {
    return this.poly([[cx - wd * 0.3, wh - ph * 0.64], [cx - wd * 0.12, wh - ph * 0.78], [cx, wh - ph],
      [cx + wd * 0.2, wh - ph * 0.72], [cx + wd * 0.28, wh - ph * 0.62], [cx + wd * 0.12, wh - ph * 0.68],
      [cx, wh - ph * 0.6], [cx - wd * 0.1, wh - ph * 0.68]])
  }

  mountainLake(): void {
    const { g, w, h } = this
    const wh = 0.62
    this.sky([[0.72, 0.80, 0.95], [0.97, 0.86, 0.82], [0.99, 0.90, 0.78]], wh)
    const far: [number, number, number][] = [[0.14, 0.3, 0.3], [0.45, 0.28, 0.15], [0.8, 0.32, 0.3]]
    const near: [number, number, number][] = [[0.03, 0.28, 0.34], [0.3, 0.24, 0.2], [0.7, 0.22, 0.17], [0.96, 0.3, 0.4]]
    const farC: RGB = [0.62, 0.68, 0.84], nearC: RGB = [0.38, 0.48, 0.64]
    for (const p of far) this.fill(this.peak(p[0], p[1], p[2], wh), farC)
    for (const p of far) this.fill(this.cap(p[0], p[1], p[2], wh), [0.96, 0.96, 1])
    for (const p of near) this.fill(this.peak(p[0], p[1], p[2], wh), nearC)
    for (const p of near) this.fill(this.cap(p[0], p[1], p[2], wh), [1, 1, 1])
    // Still water, with the peaks upside down in it.
    this.band(-2, wh * h, w + 4, h, wh * h, h, [this.pen([0.58, 0.72, 0.82]), this.pen([0.32, 0.50, 0.64])])
    g.save()
    g.clip(rectIn(0, wh * h, w, h))
    g.translate(0, 2 * wh * h)
    g.scale(1, -1)
    for (const p of far) fill(g, this.peak(p[0], p[1], p[2], wh), this.pen(farC, 0.45))
    for (const p of near) fill(g, this.peak(p[0], p[1], p[2], wh), this.pen(nearC, 0.5))
    for (const p of near) fill(g, this.cap(p[0], p[1], p[2], wh), this.pen([1, 1, 1], 0.3))
    g.restore()
    for (let i = 0; i < 14; i++) {
      const y = this.rand(wh + 0.03, 0.95), x = this.rand(0.1, 0.8), l = this.rand(0.04, 0.12)
      this.fill(roundedRectIn(x * w, y * h, l * w, 0.003 * h + 1, 2), [1, 1, 1], 0.3)
    }
    // Shore and pines at the edges.
    const shore: RGB = [0.20, 0.34, 0.30]
    this.fill(this.ridge(0.94, 0.02, 1.4, 0.3), shore)
    for (const [x, hgt, b] of [[0.03, 0.34, 0.95], [0.09, 0.26, 0.96], [0.16, 0.2, 0.94], [0.22, 0.1, 0.9],
      [0.97, 0.36, 0.95], [0.9, 0.28, 0.96], [0.83, 0.2, 0.94], [0.77, 0.09, 0.9]]) this.pine(x, b, hgt, shore)
    this.pine(0.04, 0.66, 0.1, [0.28, 0.40, 0.38])
    this.pine(0.95, 0.66, 0.09, [0.28, 0.40, 0.38])
  }

  // 5. Rice Terraces

  riceTerraces(): void {
    const { w, h } = this
    this.sky([[0.84, 0.92, 0.90], [0.97, 0.95, 0.88]], 0.5)
    this.fill(this.ridge(0.30, 0.05, 1.1, 0.4), [0.74, 0.84, 0.82])
    this.fill(this.ridge(0.37, 0.05, 1.6, 2.2), [0.64, 0.78, 0.74])
    this.fill(this.ridge(0.43, 0.04, 2.1, 4.1), [0.54, 0.72, 0.62])
    const mist: RGB = [1, 1, 0.97]
    this.band(0, 0.3 * h, w, 0.24 * h, 0.3 * h, 0.54 * h, [this.pen(mist, 0), this.pen(mist, 0.5), this.pen(mist, 0)])
    const greens: RGB[] = [[0.50, 0.70, 0.40], [0.62, 0.78, 0.46], [0.42, 0.62, 0.38], [0.70, 0.80, 0.50]]
    for (let k = 0; k < 10; k++) {
      const base = 0.5 + k * 0.058, amp = 0.012 + 0.004 * k
      const path = this.ridge(base, amp, 0.9 + 0.2 * (k % 3), k * 1.3)
      this.fill(path, greens[k % 4])
      this.stroke(path, [0.86, 0.94, 0.80], 1.6, 0.6)
    }
    this.band(0, 0.46 * h, w, 0.14 * h, 0.46 * h, 0.6 * h, [this.pen(mist, 0), this.pen(mist, 0.28), this.pen(mist, 0)])
  }

  // 6. Northern Lights

  northernLights(): void {
    const { g, w, h } = this
    this.sky([[0.02, 0.05, 0.15], [0.05, 0.14, 0.26], [0.08, 0.24, 0.32]], 0.8)
    this.stars(130, 0.0, 0.6)
    const ribbons: [number, number, number, number, RGB][] = [
      [0.16, 0.1, 1.3, 0.4, [0.35, 0.95, 0.65]], [0.26, 0.12, 1.7, 2.3, [0.30, 0.85, 0.85]],
      [0.12, 0.08, 2.1, 4.4, [0.55, 0.45, 0.92]], [0.32, 0.09, 1.2, 1.1, [0.40, 0.92, 0.55]]]
    const k = Math.min(w, h) * 0.014
    // The layer's blur acts on each ribbon as it is drawn (a filter applies
    // to every drawing after it, one by one).
    g.save()
    g.filter = `blur(${k * scaleOf(g)}px)`
    {
      const l = g
      for (const [y0, ht, f, ph, c] of ribbons) {
        const p = new Path2D()
        for (let i = 0; i <= 60; i++) {
          const u = i / 60
          const y = (y0 + 0.07 * Math.sin(u * f * 2 * PI + ph)) * h
          i === 0 ? p.moveTo(u * w, y) : p.lineTo(u * w, y)
        }
        for (let i = 60; i >= 0; i--) {
          const u = i / 60
          const top = y0 + 0.07 * Math.sin(u * f * 2 * PI + ph)
          p.lineTo(u * w, (top + ht * (0.7 + 0.3 * Math.sin(u * 9 + ph))) * h)
        }
        p.closePath()
        fill(l, p, linear(l, 0, (y0 - 0.07) * h, 0, (y0 + ht + 0.07) * h, [this.pen(c, 0.0), this.pen(c, 0.6), this.pen([0.3, 0.8, 0.7], 0)]))
      }
    }
    g.restore()
    this.fill(this.ridge(0.68, 0.05, 1.2, 1.0), [0.30, 0.40, 0.56])
    this.fill(this.ridge(0.79, 0.035, 1.7, 3.2), [0.72, 0.80, 0.92])
    // The cabin on the near ridge.
    const cx = 0.8, cy = this.ridgeY(0.8, 0.79, 0.035, 1.7, 3.2)
    this.fill(this.rect(cx - 0.028, cy - 0.05, 0.056, 0.058), [0.30, 0.20, 0.20])
    this.fill(this.poly([[cx - 0.036, cy - 0.048], [cx, cy - 0.095], [cx + 0.036, cy - 0.048]]), [0.20, 0.14, 0.16])
    this.fill(this.rect(cx + 0.012, cy - 0.095, 0.01, 0.03), [0.20, 0.14, 0.16])
    this.fill(this.disc(cx - 0.005, cy - 0.028, 0.026), [1, 0.85, 0.4], 0.25)
    this.fill(this.rect(cx - 0.014, cy - 0.036, 0.018, 0.02), [1, 0.85, 0.45])
    this.pine(cx - 0.07, cy + 0.01, 0.1, [0.14, 0.22, 0.26])
    this.pine(cx + 0.075, cy + 0.01, 0.13, [0.14, 0.22, 0.26])
    this.fill(this.ridge(0.92, 0.025, 1.3, 5.0), [0.86, 0.92, 1])
  }

  // 7. Saturn Rise

  private ringPath(front: boolean, c: P2, rx: number, ry: number, tilt: number): Path2D {
    const arc = arcTo(new Path2D(), 0, 0, 1, front ? 0 : 180, front ? 180 : 360)
    return applying(arc, new DOMMatrix().translate(c[0], c[1]).rotate((tilt * 180) / PI).scale(rx, ry))
  }

  saturnRise(): void {
    const { g, h } = this
    this.sky([[0.04, 0.03, 0.14], [0.20, 0.10, 0.30], [0.52, 0.24, 0.36]], 0.82)
    this.stars(170, 0.0, 0.75)
    // A small far moon.
    this.fill(this.disc(0.16, 0.24, 0.035), [0.72, 0.68, 0.76])
    this.fill(this.disc(0.15, 0.235, 0.008), [0.55, 0.52, 0.6], 0.8)
    const c = this.pt(0.7, 0.66), r = 0.2 * h, tilt = -0.3
    const ringW = r * 0.1
    this.stroke(this.ringPath(false, c, r * 2.1, r * 0.5, tilt), [0.92, 0.82, 0.64], ringW)
    this.stroke(this.ringPath(false, c, r * 1.7, r * 0.4, tilt), [0.80, 0.68, 0.52], ringW * 0.5)
    this.fill(ellipseIn(c[0] - r, c[1] - r, 2 * r, 2 * r), [0.94, 0.80, 0.56])
    g.save()
    g.clip(ellipseIn(c[0] - r, c[1] - r, 2 * r, 2 * r))
    const offsets = [-0.6, -0.25, 0.05, 0.4]
    offsets.forEach((f, i) => fill(g, rectIn(c[0] - r, c[1] + f * r, 2 * r, r * (i % 2 === 0 ? 0.2 : 0.12)), this.pen([0.78, 0.54, 0.38], 0.45)))
    fill(g, ellipseIn(c[0] - r * 1.45, c[1] - r * 1.1, 2 * r, 2 * r), this.pen([0.2, 0.08, 0.2], 0.35))
    g.restore()
    this.stroke(this.ringPath(true, c, r * 2.1, r * 0.5, tilt), [0.92, 0.82, 0.64], ringW)
    this.stroke(this.ringPath(true, c, r * 1.7, r * 0.4, tilt), [0.80, 0.68, 0.52], ringW * 0.5)
    // Rocky horizon.
    this.fill(this.ridge(0.8, 0.03, 2.4, 0.7), [0.30, 0.14, 0.30])
    for (let i = 0; i < 14; i++) {
      const x = this.rand(0.0, 1.0), y = this.ridgeY(x, 0.8, 0.03, 2.4, 0.7), s = this.rand(0.012, 0.03)
      this.fill(this.poly([[x - s, y + 0.01], [x - s * 0.3, y - s * 1.6], [x + s * 0.5, y - s], [x + s, y + 0.01]]), [0.30, 0.14, 0.30])
    }
    this.fill(this.ridge(0.9, 0.025, 1.6, 2.5), [0.15, 0.07, 0.20])
    for (let i = 0; i < 10; i++) {
      const x = this.rand(0.0, 1.0), y = this.ridgeY(x, 0.9, 0.025, 1.6, 2.5), s = this.rand(0.015, 0.04)
      this.fill(this.poly([[x - s, y + 0.01], [x - s * 0.5, y - s * 1.2], [x + s * 0.3, y - s * 1.5], [x + s, y + 0.01]]), [0.15, 0.07, 0.20])
    }
  }

  // 8. Moonscape

  moonscape(): void {
    const { g, w, h } = this
    this.sky([[0.02, 0.03, 0.09], [0.07, 0.08, 0.18], [0.14, 0.14, 0.24]], 0.72)
    this.stars(160, 0.0, 0.66)
    const c = this.pt(0.78, 0.27), r = 0.09 * h
    const earth = ellipseIn(c[0] - r, c[1] - r, 2 * r, 2 * r)
    this.stroke(ellipseIn(c[0] - r * 1.08, c[1] - r * 1.08, 2.16 * r, 2.16 * r), [0.55, 0.75, 1], 2, 0.4)
    this.fill(earth, [0.22, 0.46, 0.84])
    g.save()
    g.clip(earth)
    for (const [dx, dy, sx, sy] of [[-0.3, -0.2, 0.5, 0.35], [0.35, 0.25, 0.4, 0.5], [-0.1, 0.45, 0.3, 0.2]]) {
      fill(g, ellipseIn(c[0] + (dx - sx / 2) * r, c[1] + (dy - sy / 2) * r, sx * r, sy * r), this.pen([0.40, 0.68, 0.40]))
    }
    for (const [dx, dy] of [[-0.1, -0.5], [0.3, 0.0], [-0.4, 0.3]]) {
      fill(g, ellipseIn(c[0] + dx * r - 0.4 * r, c[1] + dy * r - 0.1 * r, 0.8 * r, 0.2 * r), this.pen([1, 1, 1], 0.55))
    }
    fill(g, ellipseIn(c[0] - r * 1.5, c[1] - r * 0.8, 2 * r, 2 * r), this.pen([0.02, 0.03, 0.1], 0.45))
    g.restore()
    this.fill(this.ridge(0.68, 0.012, 2.6, 0.5), [0.46, 0.46, 0.52])
    fill(g, this.ridge(0.73, 0.014, 1.5, 2.2), linear(g, 0, 0.73 * h, 0, h, [this.pen([0.70, 0.70, 0.74]), this.pen([0.50, 0.50, 0.56])]))
    for (let i = 0; i < 26; i++) {
      const x = this.rand(0.02, 0.98), y = this.rand(0.76, 0.98)
      if (Math.abs(x - 0.5) < 0.2 && y < 0.86) continue
      const rx = this.rand(0.025, 0.08) * (0.6 + (y - 0.75)), ry = rx * w / h * 0.22
      this.fill(this.oval(x, y, rx, ry), [0.40, 0.40, 0.46], 0.8)
      this.fill(this.oval(x, y + ry * 0.18, rx * 0.88, ry * 0.8), [0.50, 0.50, 0.56], 0.7)
      this.stroke(this.oval(x, y, rx, ry), [0.84, 0.84, 0.88], 1.2, 0.5)
    }
  }

  // 9. City at Night

  cityAtNight(): void {
    const { g, w, h } = this
    this.sky([[0.08, 0.08, 0.28], [0.34, 0.20, 0.50], [0.80, 0.46, 0.52], [0.98, 0.66, 0.50]], 0.86)
    this.stars(70, 0.0, 0.45)
    const mc = this.pt(0.78, 0.2), mr = 0.06 * h
    this.fill(ellipseIn(mc[0] - mr * 2.2, mc[1] - mr * 2.2, mr * 4.4, mr * 4.4), [1, 0.95, 0.7], 0.1)
    // The crescent: the moon with a disc taken out of it (an inverse clip).
    g.save()
    const out = new Path2D()
    out.rect(-w, -h, 3 * w, 3 * h)
    ellipse(out, mc[0] - mr * 0.55, mc[1] - mr * 1.2, mr * 2, mr * 2)
    g.clip(out, 'evenodd')
    fill(g, ellipseIn(mc[0] - mr, mc[1] - mr, mr * 2, mr * 2), this.pen([1, 0.95, 0.72]))
    g.restore()
    const layers: [number, number, RGB, boolean][] = [
      [0.84, 0.0, [0.34, 0.26, 0.54], false], [0.90, 0.0, [0.20, 0.16, 0.38], true], [1.0, 0.0, [0.10, 0.08, 0.22], true]]
    layers.forEach((layer, li) => {
      let x = -0.01
      while (x < 1.01) {
        const bw = this.rand(0.03, 0.065)
        const edge = Math.abs(x + bw / 2 - 0.5) * 2
        const ht = (0.05 + this.rand(0.0, 0.05)) + (0.05 + this.rand(0.0, 0.2)) * edge * edge * (1.2 - li * 0.2)
        const top = layer[0] - ht
        this.fill(this.rect(x, top, bw, ht + 0.2), layer[2])
        if (this.rand(0, 1) < 0.25) this.fill(this.rect(x + bw / 2 - 0.001, top - 0.03, 0.002, 0.03), layer[2])
        if (layer[3]) {
          const cols = Math.max(1, Math.trunc(bw / 0.011)), rows = Math.max(1, Math.trunc(ht / 0.02))
          for (let cI = 0; cI < cols; cI++) {
            for (let rI = 0; rI < rows; rI++) {
              if (!(this.rand(0, 1) < 0.4)) continue
              this.fill(this.rect(x + 0.006 + cI * 0.011, top + 0.008 + rI * 0.02, 0.005, 0.01), [1, 0.86, 0.46], 0.85)
            }
          }
        }
        x += bw + this.rand(0.0, 0.004)
      }
    })
  }

  // 10. Monsoon Forest

  monsoonForest(): void {
    const { w, h } = this
    this.sky([[0.66, 0.74, 0.72], [0.84, 0.89, 0.85]], 0.6)
    const tones: RGB[] = [[0.60, 0.72, 0.66], [0.44, 0.62, 0.52], [0.32, 0.52, 0.42], [0.20, 0.38, 0.30], [0.11, 0.25, 0.20]]
    const bases = [0.44, 0.54, 0.64, 0.75, 0.88]
    const haze: RGB = [0.92, 0.96, 0.94]
    bases.forEach((base, i) => {
      const n = 26 + i * 2
      const lift = i >= 3 ? 0.3 : 0.05
      for (let j = 0; j <= n; j++) {
        const u = j / n
        const edge = Math.pow(Math.abs(u - 0.5) * 2, 2)
        const y = base - lift * edge + this.rand(-0.015, 0.015)
        const rr = this.rand(0.045, 0.085) * (0.8 + 0.1 * i)
        this.fill(this.oval(u, y, rr, rr * w / h * 0.8 * 0.9), tones[i])
      }
      this.fill(this.rect(-0.01, base + 0.02, 1.02, 1.1 - base), tones[i])
      if (i < 4) this.band(0, (base - 0.05) * h, w, 0.2 * h, (base - 0.05) * h, (base + 0.15) * h, [this.pen(haze, 0), this.pen(haze, 0.42), this.pen(haze, 0)])
    })
    for (const x of [0.05, 0.12, 0.9, 0.96]) {
      const p = new Path2D()
      p.moveTo(...this.pt(x, 0.35)); p.lineTo(...this.pt(x + this.rand(-0.02, 0.02), 1.02))
      this.stroke(p, [0.08, 0.18, 0.15], 0.012 * w, 0.8)
    }
    for (let i = 0; i < 260; i++) {
      const x = this.rand(0, 1.05) * w, y = this.rand(-0.05, 1) * h, l = this.rand(0.03, 0.06) * h
      const p = new Path2D()
      p.moveTo(x, y)
      p.lineTo(x - l * 0.16, y + l)
      this.stroke(p, [0.92, 0.96, 0.98], 0.9, 0.3)
    }
  }
}

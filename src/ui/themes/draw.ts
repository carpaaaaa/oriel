// SwiftUI's drawing, as Canvas 2D does it (studio/02 §8.2 "note di
// traduzione"). Paths are Path2D in the same y-down points; the corners of a
// rounded rectangle are SwiftUI's continuous ones (Path(roundedRect:) and
// addRoundedRect default to .continuous), curve for curve as SwiftUI emits
// them, read from Path.description on this Mac.

import type { RGB } from './model'

export type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

/** Pen (HomeTheme.swift:223-232): every colour of a theme goes through it. */
export function pen(dark: boolean, night = false) {
  return (c: RGB, alpha = 1): string => {
    let [r, g, b] = c
    if (night && !dark) { r = r * 0.9 + 0.08; g = g * 0.9 + 0.08; b = b * 0.9 + 0.08 }
    const k = dark ? (night ? 0.8 : 0.42) : 1
    return css([r * k, g * k, b * k], alpha)
  }
}
export type Pen = ReturnType<typeof pen>

export function css(c: RGB, alpha = 1): string {
  // Rounded as Core Graphics rounds to 8 bits: 0.9 × 255 is 229.49999… → 229.
  const ch = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 255)
  return `rgb(${ch(c[0])} ${ch(c[1])} ${ch(c[2])} / ${Math.max(0, Math.min(1, alpha))})`
}

export function ellipse(p: Path2D, x: number, y: number, w: number, h: number): Path2D {
  p.moveTo(x + w, y + h / 2)
  p.ellipse(x + w / 2, y + h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, Math.PI * 2)
  p.closePath()
  return p
}
export const ellipseIn = (x: number, y: number, w: number, h: number) => ellipse(new Path2D(), x, y, w, h)

export function rectIn(x: number, y: number, w: number, h: number): Path2D {
  const p = new Path2D()
  p.rect(x, y, w, h)
  return p
}

// The continuous corner, in fractions of the radius. A side shorter than
// 1.52866483 r each way gives its last curve a squeezed set of points,
// falling to (0.82, 0.96, 1) at a half side equal to r (measured: linear).
const K = { e: 1.52866483, a1: 0.86840694, a2: 1.08849296, b: 0.63149379, c: 0.07491100, d: 0.16906812, f: 0.37282383 }

/** Path(roundedRect:cornerRadius:) with style .continuous. */
export function roundedRect(p: Path2D, x: number, y: number, w: number, h: number, radius: number): Path2D {
  if (w < 0) { x += w; w = -w }
  if (h < 0) { y += h; h = -h }
  const r = Math.max(0, Math.min(radius, w / 2, h / 2))
  if (r <= 0) { p.rect(x, y, w, h); return p }
  // One side's three numbers: the near and far control points and the end.
  const side = (half: number): [number, number, number] => {
    if (half >= K.e * r) return [K.a1 * r, K.a2 * r, K.e * r]
    const t = (half / r - 1) / (K.e - 1)
    return [r * (0.82 + t * (K.a1 - 0.82)), r * (0.96 + t * (K.a2 - 0.96)), half]
  }
  const [hx1, hx2, hx] = side(w / 2)
  const [vy1, vy2, vy] = side(h / 2)
  const X = x + w, Y = y + h
  const b = K.b * r, c = K.c * r, d = K.d * r, f = K.f * r
  // From the right side's middle, down: SwiftUI's start and direction.
  p.moveTo(X, y + h / 2)
  // bottom right
  p.lineTo(X, Y - vy)
  p.bezierCurveTo(X, Y - vy2, X, Y - vy1, X - c, Y - b)
  p.bezierCurveTo(X - d, Y - f, X - f, Y - d, X - b, Y - c)
  p.bezierCurveTo(X - hx1, Y, X - hx2, Y, X - hx, Y)
  // bottom left
  p.lineTo(x + hx, Y)
  p.bezierCurveTo(x + hx2, Y, x + hx1, Y, x + b, Y - c)
  p.bezierCurveTo(x + f, Y - d, x + d, Y - f, x + c, Y - b)
  p.bezierCurveTo(x, Y - vy1, x, Y - vy2, x, Y - vy)
  // top left
  p.lineTo(x, y + vy)
  p.bezierCurveTo(x, y + vy2, x, y + vy1, x + c, y + b)
  p.bezierCurveTo(x + d, y + f, x + f, y + d, x + b, y + c)
  p.bezierCurveTo(x + hx1, y, x + hx2, y, x + hx, y)
  // top right
  p.lineTo(X - hx, y)
  p.bezierCurveTo(X - hx2, y, X - hx1, y, X - b, y + c)
  p.bezierCurveTo(X - f, y + d, X - d, y + f, X - c, y + b)
  p.bezierCurveTo(X, y + vy1, X, y + vy2, X, y + vy)
  p.closePath()
  return p
}
export const roundedRectIn = (x: number, y: number, w: number, h: number, r: number) => roundedRect(new Path2D(), x, y, w, h, r)

const rad = (deg: number) => (deg * Math.PI) / 180

/** addArc(center:radius:startAngle:endAngle:clockwise: false), in degrees. */
export function arcTo(p: Path2D, x: number, y: number, r: number, a: number, b: number): Path2D {
  p.arc(x, y, r, rad(a), rad(b), false)
  return p
}

/** A path moved by an affine transform (Path.applying). */
export function applying(p: Path2D, m: DOMMatrix): Path2D {
  const q = new Path2D()
  q.addPath(p, m)
  return q
}

export function fill(g: Ctx, path: Path2D, style: string | CanvasGradient): void {
  g.fillStyle = style
  g.fill(path)
}

/** Round caps and joins, as every stroke of the themes has them. */
export function stroke(g: Ctx, path: Path2D, style: string | CanvasGradient, width: number): void {
  g.strokeStyle = style
  g.lineWidth = width
  g.lineCap = 'round'
  g.lineJoin = 'round'
  g.stroke(path)
}

/** .linearGradient(Gradient(colors:), startPoint:, endPoint:): stops evenly spaced. */
export function linear(g: Ctx, x0: number, y0: number, x1: number, y1: number, colours: string[]): CanvasGradient {
  const grad = g.createLinearGradient(x0, y0, x1, y1)
  colours.forEach((c, i) => grad.addColorStop(colours.length === 1 ? 0 : i / (colours.length - 1), c))
  return grad
}

/** The pixel scale of a context: drawing units to device pixels. */
export function scaleOf(g: Ctx): number {
  const m = g.getTransform()
  return Math.hypot(m.a, m.b)
}

/** A layer drawn apart and laid down with a filter (drawLayer + addFilter),
 * in the device pixels of `g`; `draw` gets a context with g's transform. */
export function layer(g: Ctx, draw: (l: Ctx) => void, filter: { blur?: number; shadow?: { colour: string; blur: number; x: number; y: number } }): void {
  const canvas = g.canvas as HTMLCanvasElement | OffscreenCanvas
  const off = new OffscreenCanvas(canvas.width, canvas.height)
  const l = off.getContext('2d')!
  l.setTransform(g.getTransform())
  draw(l)
  g.save()
  g.setTransform(1, 0, 0, 1, 0, 0)
  if (filter.blur) g.filter = `blur(${filter.blur}px)`
  if (filter.shadow) {
    g.shadowColor = filter.shadow.colour
    g.shadowBlur = filter.shadow.blur
    g.shadowOffsetX = filter.shadow.x
    g.shadowOffsetY = filter.shadow.y
  }
  g.drawImage(off, 0, 0)
  g.restore()
}

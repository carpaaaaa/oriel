// Ten sticker packs, drawn in code (HomeStickers.swift, studio/02 §2.8,
// §8.2). A sticker is a few layers in a unit square around the origin; the
// die-cut white edge and its soft shadow are made from the layers. Scattered
// with the Mac's seed, slightly tilted, and kept out of the middle where the
// address field sits.

import type { HomeTuning, RGB, StickerPack } from './model'
import { seed, Seeded } from './random'
import { applying, arcTo, type Ctx, ellipseIn, fill, pen, roundedRectIn, scaleOf, stroke } from './draw'

/** One layer: a path, a colour (palette index; -1 ink, -2 white, -3 the
 * pack's ground), and a line width (0 fills). */
type Layer = { path: Path2D; colour: number; width: number }

const f = (path: Path2D, colour: number): Layer => ({ path, colour, width: 0 })
const s = (path: Path2D, colour: number, width = 0.1): Layer => ({ path, colour, width })

const disc = (x: number, y: number, r: number) => ellipseIn(x - r, y - r, r * 2, r * 2)
const oval = (x: number, y: number, rx: number, ry: number) => ellipseIn(x - rx, y - ry, rx * 2, ry * 2)
const box = (x: number, y: number, w: number, h: number, r = 0) => roundedRectIn(x - w / 2, y - h / 2, w, h, r)
/** Points as x, y, x, y...; closed when filled. */
function poly(v: number[], closed = true): Path2D {
  const p = new Path2D()
  for (let i = 0; i + 1 < v.length; i += 2) (i === 0 ? p.moveTo(v[i], v[i + 1]) : p.lineTo(v[i], v[i + 1]))
  if (closed) p.closePath()
  return p
}
function arc(x: number, y: number, r: number, a: number, b: number, close = false): Path2D {
  const p = arcTo(new Path2D(), x, y, r, a, b)
  if (close) p.closePath()
  return p
}
function star(n: number, outer: number, inner: number, cx = 0, cy = 0): Path2D {
  const p = new Path2D()
  for (let k = 0; k < n * 2; k++) {
    const a = -Math.PI / 2 + k * Math.PI / n
    const r = k % 2 === 0 ? outer : inner
    const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a)
    k === 0 ? p.moveTo(x, y) : p.lineTo(x, y)
  }
  p.closePath()
  return p
}
function sparkle(cx: number, cy: number, k: number): Path2D {
  const p = new Path2D()
  const d = 0.13 * k
  p.moveTo(cx, cy - k)
  p.quadraticCurveTo(cx + d, cy - d, cx + k, cy)
  p.quadraticCurveTo(cx + d, cy + d, cx, cy + k)
  p.quadraticCurveTo(cx - d, cy + d, cx - k, cy)
  p.quadraticCurveTo(cx - d, cy - d, cx, cy - k)
  p.closePath()
  return p
}
function rays(n: number, r0: number, r1: number): Path2D {
  const p = new Path2D()
  for (let k = 0; k < n; k++) {
    const a = k * 2 * Math.PI / n
    p.moveTo(r0 * Math.cos(a), r0 * Math.sin(a))
    p.lineTo(r1 * Math.cos(a), r1 * Math.sin(a))
  }
  return p
}
const turned = (p: Path2D, a: number) => applying(p, new DOMMatrix().rotate((a * 180) / Math.PI))

/** Ground colour and the colours its stickers are made of. */
const looks: Record<StickerPack, { ground: RGB; palette: RGB[] }> = {
  space: { ground: [0.88, 0.86, 0.97], palette: [[0.42, 0.40, 0.85], [0.98, 0.80, 0.32], [0.35, 0.66, 0.88], [0.90, 0.50, 0.72], [0.98, 0.58, 0.40]] },
  roadTrip: { ground: [0.98, 0.93, 0.82], palette: [[0.30, 0.62, 0.62], [0.97, 0.78, 0.30], [0.90, 0.40, 0.35], [0.45, 0.70, 0.45], [0.30, 0.35, 0.55]] },
  ocean: { ground: [0.84, 0.93, 0.96], palette: [[0.30, 0.60, 0.85], [0.98, 0.55, 0.50], [0.98, 0.82, 0.45], [0.35, 0.75, 0.70], [0.25, 0.35, 0.60]] },
  jungle: { ground: [0.88, 0.95, 0.84], palette: [[0.35, 0.65, 0.40], [0.20, 0.45, 0.35], [0.98, 0.82, 0.35], [0.95, 0.45, 0.35], [0.30, 0.60, 0.85]] },
  streetFood: { ground: [0.99, 0.91, 0.80], palette: [[0.97, 0.65, 0.30], [0.90, 0.35, 0.30], [0.98, 0.84, 0.50], [0.50, 0.75, 0.45], [0.60, 0.40, 0.30]] },
  retroTech: { ground: [0.92, 0.90, 0.84], palette: [[0.35, 0.65, 0.70], [0.90, 0.40, 0.60], [0.98, 0.80, 0.35], [0.55, 0.45, 0.80], [0.25, 0.28, 0.45]] },
  weather: { ground: [0.88, 0.94, 0.98], palette: [[0.50, 0.74, 0.95], [0.99, 0.80, 0.30], [0.62, 0.70, 0.82], [0.96, 0.50, 0.45], [0.40, 0.38, 0.72]] },
  music: { ground: [0.96, 0.90, 0.93], palette: [[0.92, 0.42, 0.45], [0.60, 0.45, 0.85], [0.98, 0.80, 0.35], [0.35, 0.72, 0.70], [0.25, 0.22, 0.38]] },
  wonders: { ground: [0.97, 0.92, 0.84], palette: [[0.93, 0.75, 0.45], [0.85, 0.35, 0.30], [0.30, 0.65, 0.65], [0.62, 0.60, 0.76], [0.50, 0.34, 0.26], [0.80, 0.60, 0.32]] },
  search: { ground: [0.90, 0.92, 0.98], palette: [[0.35, 0.55, 0.95], [0.98, 0.60, 0.30], [0.40, 0.80, 0.65], [0.65, 0.50, 0.90], [0.95, 0.50, 0.60], [0.80, 0.80, 0.88]] },
}
export const packGround = (pack: StickerPack): RGB => looks[pack].ground

function ringHalf(front: boolean): Path2D {
  return turned(applying(arc(0, 0, 1, front ? 0 : 180, front ? 180 : 360), new DOMMatrix().scale(1.05, 0.3)), -0.4)
}

function space(): Layer[][] {
  return [
    [s(ringHalf(false), 1, 0.13), f(disc(0, 0, 0.62), 0), s(arc(0, 0, 0.45, 200, 300), 3, 0.08), s(ringHalf(true), 1, 0.13)],
    [f(poly([-0.2, 0.55, 0, 1.1, 0.2, 0.55]), 1), f(poly([-0.35, 0.6, -0.35, -0.2, 0, -1, 0.35, -0.2, 0.35, 0.6]), -2),
      f(poly([-0.35, 0.15, -0.75, 0.75, -0.35, 0.6]), 4), f(poly([0.35, 0.15, 0.75, 0.75, 0.35, 0.6]), 4),
      f(poly([-0.35, -0.2, 0, -1, 0.35, -0.2]), 4), f(disc(0, 0, 0.2), 2), s(disc(0, 0, 0.2), 0, 0.06)],
    [f(disc(0, 0, 0.85), -2), s(disc(0, 0, 0.85), 0, 0.1), f(box(0, 0.05, 1.1, 0.7, 0.3), 0),
      f(oval(-0.3, -0.12, 0.2, 0.1), 2), f(disc(-0.95, 0.1, 0.12), 1), f(disc(0.95, 0.1, 0.12), 1)],
    [f(star(5, 1, 0.45), 1), f(disc(-0.15, -0.1, 0.07), -1), f(disc(0.15, -0.1, 0.07), -1)],
    [f(poly([0.05, -0.6, 0.6, -0.05, -0.9, 0.9]), 1), s(poly([-0.2, 0.2, 0.3, -0.3], false), 3, 0.08),
      f(disc(0.35, -0.35, 0.38), 4)],
    [f(arc(0, -0.1, 0.45, 180, 360, true), 2), f(oval(0, 0.15, 0.95, 0.3), 0), f(disc(-0.5, 0.2, 0.07), 1),
      f(disc(0, 0.28, 0.07), 1), f(disc(0.5, 0.2, 0.07), 1)],
  ]
}

function roadTrip(): Layer[][] {
  return [
    [f(box(0, 0.05, 1.8, 0.95, 0.28), 0), f(box(0, 0.32, 1.8, 0.4, 0.14), 1), f(box(-0.4, -0.15, 0.55, 0.38, 0.08), -2),
      f(box(0.35, -0.15, 0.45, 0.38, 0.08), -2), f(disc(-0.55, 0.56, 0.22), -1), f(disc(0.55, 0.56, 0.22), -1),
      f(disc(-0.55, 0.56, 0.08), -2), f(disc(0.55, 0.56, 0.08), -2)],
    [f(disc(0, -0.25, 0.6), 2), f(poly([-0.5, 0.05, 0, 0.95, 0.5, 0.05]), 2), f(disc(0, -0.25, 0.22), -2)],
    [f(box(0, 0.7, 0.12, 0.9), 4), f(poly([0, -0.95, 0.8, -0.2, 0, 0.55, -0.8, -0.2]), 1),
      s(poly([-0.3, -0.05, 0, -0.4, 0.3, -0.05], false), -1, 0.13)],
    [f(disc(0, 0, 0.5), 1), s(rays(8, 0.7, 0.97), 1, 0.15)],
    [f(box(0, 0.1, 0.42, 1.6, 0.21), 3), s(poly([-0.2, 0.2, -0.6, 0.2, -0.6, -0.25], false), 3, 0.2),
      s(poly([0.2, -0.05, 0.6, -0.05, 0.6, -0.5], false), 3, 0.2), f(box(0, 0.88, 0.7, 0.3, 0.06), 2)],
    [f(box(0, 0.1, 1.0, 1.3, 0.12), 2), s(poly([-0.35, -0.55, -0.35, -0.85, 0.1, -0.85, 0.1, -0.55], false), 2, 0.12),
      f(poly([0.3, -0.5, 0.55, -0.9, 0.75, -0.8, 0.6, -0.5]), 2),
      s(poly([-0.3, -0.2, 0.3, 0.5], false), -2, 0.12), s(poly([0.3, -0.2, -0.3, 0.5], false), -2, 0.12)],
  ]
}

function ocean(): Layer[][] {
  const wave = new Path2D()
  wave.moveTo(-0.95, 0.65)
  wave.bezierCurveTo(-0.95, -0.1, -0.4, -0.85, 0.15, -0.85)
  wave.bezierCurveTo(0.6, -0.9, 0.9, -0.55, 0.7, -0.2)
  wave.quadraticCurveTo(0.6, -0.5, 0.3, -0.4)
  wave.quadraticCurveTo(0.1, -0.1, 0.4, 0.2)
  wave.lineTo(0.95, 0.65)
  wave.closePath()
  const ribs = new Path2D()
  for (let k = 1; k <= 5; k++) {
    const a = 180 + k * 30
    ribs.moveTo(0, 0.35)
    ribs.lineTo(0.85 * Math.cos(a * Math.PI / 180), 0.35 + 0.85 * Math.sin(a * Math.PI / 180))
  }
  return [
    [f(wave, 0), s(poly([-0.75, 0.4, -0.3, 0.25, 0.1, 0.4, 0.55, 0.28, 0.85, 0.42], false), -2, 0.1)],
    [f(arc(0, 0.35, 0.9, 180, 360, true), 1), f(box(0, 0.5, 0.45, 0.3, 0.1), 1), s(ribs, -2, 0.07)],
    [f(oval(-0.1, 0, 0.7, 0.45), 3), f(poly([0.5, 0, 0.95, -0.4, 0.95, 0.4]), 3), f(poly([-0.1, -0.4, 0.1, -0.78, 0.3, -0.38]), 4),
      f(disc(-0.5, -0.1, 0.09), -2), f(disc(-0.5, -0.1, 0.045), -1), s(poly([0.1, -0.35, 0.1, 0.35], false), -2, 0.08)],
    [s(disc(0, -0.72, 0.17), 4, 0.1), s(poly([0, -0.55, 0, 0.8], false), 4, 0.14), s(poly([-0.4, -0.3, 0.4, -0.3], false), 4, 0.14),
      s(arc(0, 0.1, 0.75, 20, 160), 4, 0.14)],
    [f(poly([-0.3, 0.9, -0.2, -0.5, 0.2, -0.5, 0.3, 0.9]), -2), f(poly([-0.27, 0.35, -0.24, 0.0, 0.24, 0.0, 0.27, 0.35]), 1),
      f(box(0, -0.55, 0.6, 0.1), 4), f(box(0, -0.75, 0.3, 0.25), 2), f(poly([-0.25, -0.88, 0, -1.08, 0.25, -0.88]), 4),
      f(box(0, 0.93, 0.8, 0.14, 0.05), 4)],
    [f(star(5, 1, 0.5), 1), f(disc(0, 0, 0.1), 2), f(disc(0, -0.5, 0.06), 2), f(disc(0.45, -0.15, 0.06), 2),
      f(disc(0.28, 0.4, 0.06), 2), f(disc(-0.28, 0.4, 0.06), 2), f(disc(-0.45, -0.15, 0.06), 2)],
  ]
}

function jungle(): Layer[][] {
  const banana = new Path2D()
  banana.moveTo(-0.85, -0.3)
  banana.quadraticCurveTo(0, 1.2, 0.85, -0.6)
  banana.quadraticCurveTo(0, 0.45, -0.85, -0.3)
  const beak = new Path2D()
  beak.moveTo(-0.1, -0.6)
  beak.quadraticCurveTo(0.8, -0.7, 0.95, 0.1)
  beak.quadraticCurveTo(0.5, 0.5, -0.1, 0.25)
  beak.closePath()
  const petals = new Path2D()
  for (let k = 0; k < 5; k++) {
    const a = k * 2 * Math.PI / 5 - Math.PI / 2
    petals.addPath(disc(0.55 * Math.cos(a), 0.55 * Math.sin(a), 0.4))
  }
  return [
    [s(poly([0, 0.2, 0, 1], false), 1, 0.12), f(disc(0, -0.05, 0.9), 0), f(poly([-1, -0.35, -0.35, -0.05, -1, 0.05]), -3),
      f(poly([1, -0.35, 0.35, -0.05, 1, 0.05]), -3), f(poly([-0.95, 0.35, -0.3, 0.2, -0.75, 0.6]), -3),
      f(poly([0.95, 0.35, 0.3, 0.2, 0.75, 0.6]), -3), s(poly([0, 0.7, 0, -0.8], false), 1, 0.07)],
    [f(poly([-0.2, 0.7, -0.5, 1.1, 0.05, 1.05, 0.2, 0.7]), 2), f(oval(0, 0.1, 0.55, 0.8), 3), f(oval(-0.18, 0.2, 0.3, 0.5), 4),
      f(disc(0.15, -0.65, 0.36), 3), f(poly([0.45, -0.72, 0.85, -0.55, 0.45, -0.42]), 2), f(disc(0.22, -0.72, 0.09), -2),
      f(disc(0.24, -0.72, 0.04), -1)],
    [f(banana, 2), f(disc(-0.85, -0.3, 0.07), -1), f(disc(0.85, -0.6, 0.07), -1)],
    [f(disc(-0.4, 0, 0.6), -1), f(disc(-0.35, 0.12, 0.3), -2), f(beak, 2), s(poly([0, -0.2, 0.9, 0.0], false), 3, 0.1),
      f(disc(-0.3, -0.2, 0.12), -2), f(disc(-0.28, -0.2, 0.06), -1)],
    [f(petals, 3), f(disc(0, 0, 0.6), 3), f(disc(0, 0, 0.3), 2)],
    [f(poly([-0.4, -0.3, -0.3, -0.95, -0.1, -0.45]), 0), f(poly([-0.1, -0.4, 0, -1.05, 0.1, -0.4]), 0),
      f(poly([0.1, -0.45, 0.3, -0.95, 0.4, -0.3]), 0), f(oval(0, 0.3, 0.5, 0.68), 2),
      s(poly([-0.35, 0, 0.35, 0.7, -0.4, 0.35, 0.4, 0.05, -0.1, -0.2, 0.1, 0.95], false), 3, 0.06)],
  ]
}

function streetFood(): Layer[][] {
  const noodles = new Path2D()
  for (let k = 0; k < 4; k++) {
    const y = -0.35 + k * 0.12
    noodles.moveTo(-0.7, y)
    noodles.quadraticCurveTo(-0.35, y - 0.25, 0, y)
    noodles.quadraticCurveTo(0.35, y + 0.25, 0.7, y)
  }
  const chilli = new Path2D()
  chilli.moveTo(-0.7, -0.7)
  chilli.quadraticCurveTo(0.6, -0.8, 0.9, 0.9)
  chilli.quadraticCurveTo(-0.2, 0.5, -0.7, -0.7)
  const steam = new Path2D()
  steam.moveTo(-0.15, -0.55)
  steam.quadraticCurveTo(-0.4, -0.75, -0.15, -0.95)
  steam.moveTo(0.2, -0.55)
  steam.quadraticCurveTo(-0.05, -0.75, 0.2, -0.95)
  return [
    [f(disc(-0.6, -0.12, 0.22), 3), f(disc(-0.2, -0.28, 0.25), 1), f(disc(0.25, -0.25, 0.25), 3), f(disc(0.65, -0.12, 0.2), 1),
      f(arc(0, -0.1, 0.95, 0, 180, true), 2), s(arc(0, -0.1, 0.7, 30, 150), 0, 0.07)],
    [f(oval(0, -0.1, 0.8, 0.45), 2), s(noodles, 0, 0.05), s(poly([0.2, -0.2, 0.8, -0.95], false), 4, 0.07),
      s(poly([0.35, -0.2, 0.95, -0.8], false), 4, 0.07), f(arc(0, 0, 0.9, 0, 180, true), 1)],
    [f(poly([-0.55, -0.4, 0.55, -0.4, 0.4, 0.8, -0.4, 0.8]), 0), s(arc(0.55, 0.15, 0.3, 270, 450), 0, 0.1),
      f(oval(0, -0.4, 0.55, 0.12), 4), s(steam, 4, 0.07)],
    [f(arc(0, 0.35, 0.9, 180, 360, true), 2), f(box(0, 0.4, 1.8, 0.1, 0.05), 2),
      s(poly([-0.4, -0.3, -0.3, -0.05, -0.1, -0.5, -0.05, -0.05, 0.15, -0.55, 0.2, -0.05, 0.4, -0.4, 0.45, -0.05], false), 4, 0.05)],
    [f(chilli, 1), f(poly([-0.7, -0.7, -0.95, -0.95, -0.5, -0.85]), 3)],
    [f(box(0, 0.8, 0.18, 0.5), 4), f(box(0, -0.15, 0.8, 1.3, 0.4), 1), s(poly([-0.2, -0.5, -0.2, -0.1], false), -2, 0.1)],
  ]
}

function retroTech(): Layer[][] {
  const heart = ['-XX-XX-', 'XXXXXXX', 'XXXXXXX', '-XXXXX-', '--XXX--', '---X---']
  const pixels = new Path2D()
  heart.forEach((line, row) => [...line].forEach((ch, col) => { if (ch === 'X') pixels.rect(-0.98 + col * 0.28, -0.84 + row * 0.28, 0.28, 0.28) }))
  const corner = new Path2D()
  corner.rect(-0.7, -0.7, 0.28, 0.28)
  return [
    [f(box(0, 0, 1.7, 1.7, 0.1), 0), f(box(0.15, -0.65, 0.9, 0.5, 0.04), 4), f(box(0.35, -0.65, 0.16, 0.3), -2),
      f(box(0, 0.5, 1.2, 0.7, 0.05), -2), s(poly([-0.4, 0.35, 0.4, 0.35], false), 4, 0.06),
      s(poly([-0.4, 0.6, 0.2, 0.6], false), 4, 0.06)],
    [f(box(0, 0, 1.9, 1.2, 0.12), 1), f(box(0, -0.15, 1.5, 0.6, 0.06), -2), f(disc(-0.4, -0.15, 0.18), 4),
      f(disc(0.4, -0.15, 0.18), 4), f(box(0, 0.5, 0.9, 0.3, 0.1), 4)],
    [f(box(0, 0.65, 1.5, 0.5, 0.15), 3), s(poly([0, 0.5, 0, -0.3], false), 4, 0.16), f(disc(0, -0.5, 0.38), 1),
      f(disc(-0.5, 0.62, 0.1), 2), f(disc(0.5, 0.62, 0.1), 2)],
    [f(box(0, 0.8, 1.0, 0.2, 0.06), 0), f(box(0, -0.05, 1.8, 1.4, 0.25), 0), f(box(-0.1, -0.05, 1.3, 1.0, 0.2), -1),
      s(poly([-0.6, -0.25, -0.35, -0.05, -0.6, 0.15], false), 2, 0.07), s(poly([-0.25, 0.2, 0.05, 0.2], false), 2, 0.07),
      f(disc(0.75, -0.3, 0.1), 2), f(disc(0.75, 0, 0.1), 2)],
    [f(pixels, 1), f(corner, -2)],
    [f(box(0, 0, 1.8, 0.9, 0.4), 3), s(poly([-0.6, 0, -0.2, 0], false), 4, 0.12), s(poly([-0.4, -0.2, -0.4, 0.2], false), 4, 0.12),
      f(disc(0.3, 0.1, 0.12), 1), f(disc(0.6, -0.1, 0.12), 2)],
  ]
}

function weather(): Layer[][] {
  const flake = new Path2D()
  for (let k = 0; k < 6; k++) {
    const a = k * Math.PI / 3
    const c = Math.cos(a), sn = Math.sin(a)
    flake.moveTo(0, 0)
    flake.lineTo(0.95 * c, 0.95 * sn)
    for (const side of [-1, 1]) {
      const b = a + side * Math.PI / 5
      flake.moveTo(0.6 * c, 0.6 * sn)
      flake.lineTo(0.6 * c + 0.3 * Math.cos(b), 0.6 * sn + 0.3 * Math.sin(b))
    }
  }
  const cloud = new Path2D()
  cloud.addPath(disc(-0.5, 0.1, 0.42))
  cloud.addPath(disc(0, -0.2, 0.55))
  cloud.addPath(disc(0.5, 0.1, 0.42))
  cloud.addPath(roundedRectIn(-0.92, 0.1, 1.84, 0.52, 0.26))
  return [
    [f(cloud, 0)],
    [f(poly([0.15, -1, -0.6, 0.15, -0.1, 0.15, -0.3, 1, 0.6, -0.2, 0.05, -0.2]), 1)],
    [s(arc(0, 0.5, 0.9, 180, 360), 3, 0.2), s(arc(0, 0.5, 0.7, 180, 360), 1, 0.2), s(arc(0, 0.5, 0.5, 180, 360), 0, 0.2),
      f(oval(-0.8, 0.5, 0.2, 0.14), -2), f(oval(0.8, 0.5, 0.2, 0.14), -2)],
    [f(arc(0, 0, 0.95, 180, 360, true), 3), s(poly([0, -0.95, -0.35, 0], false), -2, 0.06),
      s(poly([0, -0.95, 0.35, 0], false), -2, 0.06), s(poly([0, 0, 0, 0.7], false), 4, 0.1),
      s(arc(-0.2, 0.7, 0.2, 0, 180), 4, 0.1)],
    [s(flake, 0, 0.12)],
    [f(disc(0, 0, 0.5), 1), s(rays(8, 0.7, 0.97), 1, 0.15)],
  ]
}

function music(): Layer[][] {
  const mic = new Path2D()
  mic.addPath(disc(0, -0.4, 0.4))
  const grid = new Path2D()
  grid.moveTo(-0.35, -0.4); grid.lineTo(0.35, -0.4)
  grid.moveTo(0, -0.78); grid.lineTo(0, -0.02)
  const pick = new Path2D()
  pick.moveTo(0, 0.95)
  pick.bezierCurveTo(-0.5, 0.55, -0.9, 0, -0.85, -0.55)
  pick.quadraticCurveTo(0, -1, 0.85, -0.55)
  pick.bezierCurveTo(0.9, 0, 0.5, 0.55, 0, 0.95)
  pick.closePath()
  return [
    [f(disc(0, 0, 0.95), 4), s(disc(0, 0, 0.72), 1, 0.04), s(disc(0, 0, 0.58), 1, 0.04), f(disc(0, 0, 0.35), 0), f(disc(0, 0, 0.06), -3)],
    [s(arc(0, 0.05, 0.75, 180, 360), 1, 0.14), f(box(-0.78, 0.25, 0.4, 0.65, 0.15), 0), f(box(0.78, 0.25, 0.4, 0.65, 0.15), 0)],
    [s(poly([-0.22, 0.6, -0.22, -0.6], false), 1, 0.1), s(poly([0.68, 0.4, 0.68, -0.8], false), 1, 0.1),
      f(poly([-0.22, -0.6, 0.68, -0.8, 0.68, -0.55, -0.22, -0.35]), 1), f(disc(-0.45, 0.6, 0.25), 1), f(disc(0.45, 0.4, 0.25), 1)],
    [f(box(0, 0, 1.2, 1.8, 0.15), 4), f(disc(0, 0.35, 0.42), 0), f(disc(0, 0.35, 0.15), 2), f(disc(0, -0.5, 0.2), 0)],
    [f(pick, 2), s(arc(0, -0.1, 0.5, 200, 280), -2, 0.08)],
    [f(poly([-0.18, -0.1, 0.18, -0.1, 0.1, 0.95, -0.1, 0.95]), 4), f(mic, 1), s(grid, -2, 0.06)],
  ]
}

function wonders(): Layer[][] {
  const dome = new Path2D()
  dome.moveTo(-0.45, 0.2)
  dome.bezierCurveTo(-0.95, -0.2, -0.2, -0.55, 0, -0.85)
  dome.bezierCurveTo(0.2, -0.55, 0.95, -0.2, 0.45, 0.2)
  dome.closePath()
  const tiers: Layer[] = []
  for (let k = 0; k < 3; k++) {
    const yb = 0.8 - k * 0.55, sh = 0.2 * k
    tiers.push(f(box(0, yb - 0.1, 0.8 - 0.2 * k, 0.3), 5))
    tiers.push(f(poly([-(0.95 - sh), yb - 0.18, 0.95 - sh, yb - 0.18, 0.7 - sh, yb - 0.42, -(0.7 - sh), yb - 0.42]), 1))
  }
  tiers.push(s(poly([0, -0.75, 0, -1.02], false), 4, 0.08))
  const arch = new Path2D()
  arch.moveTo(-0.95, 0.9); arch.lineTo(-0.95, -0.1)
  arcTo(arch, 0, -0.1, 0.95, 180, 360)
  arch.lineTo(0.95, 0.9); arch.closePath()
  const opening = new Path2D()
  opening.moveTo(-0.45, 0.9); opening.lineTo(-0.45, 0)
  arcTo(opening, 0, 0, 0.45, 180, 360)
  opening.lineTo(0.45, 0.9); opening.closePath()
  const blades = new Path2D()
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2 + 0.5
    blades.moveTo(0, -0.25)
    blades.lineTo(0.9 * Math.cos(a), -0.25 + 0.9 * Math.sin(a))
  }
  return [
    [f(poly([-0.95, 0.7, 0, -0.8, 0.95, 0.7]), 0), f(poly([0, -0.8, 0.95, 0.7, 0.2, 0.7]), 5)],
    [f(box(-0.55, 0.15, 0.16, 1.4), 1), f(box(0.55, 0.15, 0.16, 1.4), 1), f(poly([-1, -0.6, 1, -0.6, 0.8, -0.38, -0.8, -0.38]), 1),
      f(box(0, -0.15, 1.4, 0.14), 1), f(box(0, -0.64, 2, 0.1), -1)],
    [f(box(0, 0.55, 0.6, 0.8), 0), f(dome, 2), s(poly([0, -0.85, 0, -1.08], false), 1, 0.08), f(arc(0, 0.9, 0.16, 180, 360, true), 4)],
    [f(arch, 3), f(opening, -3), f(poly([-0.12, -1.04, 0.12, -1.04, 0.1, -0.6, -0.1, -0.6]), 0)],
    tiers,
    [f(poly([-0.3, 0.9, -0.2, -0.1, 0.2, -0.1, 0.3, 0.9]), 3), f(poly([-0.25, -0.1, 0, -0.38, 0.25, -0.1]), 1),
      s(blades, 1, 0.2), f(disc(0, -0.25, 0.1), 4)],
  ]
}

function search(): Layer[][] {
  return [
    [f(disc(-0.15, -0.15, 0.55), -2), s(disc(-0.15, -0.15, 0.55), 0, 0.2), s(poly([0.25, 0.25, 0.9, 0.9], false), 1, 0.26),
      s(arc(-0.15, -0.15, 0.35, 200, 260), -2, 0.07)],
    [f(box(0.3, -0.3, 1.2, 1.0, 0.12), 2), f(box(-0.2, 0.15, 1.3, 1.1, 0.12), 0), f(box(-0.65, -0.55, 0.6, 0.25, 0.1), 0),
      s(poly([-0.7, 0.0, 0.1, 0.0], false), -2, 0.09), s(poly([-0.7, 0.3, -0.1, 0.3], false), -2, 0.09)],
    [f(poly([-0.5, -0.9, -0.5, 0.7, -0.15, 0.35, 0.15, 0.95, 0.4, 0.85, 0.1, 0.25, 0.6, 0.25]), -1)],
    [f(box(0, 0.1, 1.7, 1.6, 0.3), 5), f(box(0, -0.05, 1.7, 1.5, 0.3), -2), s(poly([0.25, -0.5, -0.25, 0.4], false), -1, 0.2)],
    [f(poly([-0.55, -0.95, 0.55, -0.95, 0.55, 0.95, 0, 0.5, -0.55, 0.95]), 4), f(star(5, 0.25, 0.11, 0, -0.35), -2)],
    [f(sparkle(-0.1, -0.1, 0.9), 1), f(sparkle(0.65, 0.6, 0.35), 2)],
  ]
}

const art: Record<StickerPack, () => Layer[][]> = { space, roadTrip, ocean, jungle, streetFood, retroTech, weather, music, wonders, search }
const made = new Map<StickerPack, Layer[][]>()
const stickersOf = (pack: StickerPack) => made.get(pack) ?? (made.set(pack, art[pack]()), made.get(pack)!)

/** Where each sticker of a scatter goes, for the bench. */
export interface Placed { x: number; y: number; r: number; tilt: number; sticker: number }

/** HomeStickers.paint (HomeStickers.swift:383-443). */
export function paintStickers(g: Ctx, w: number, h: number, t: HomeTuning, dark: boolean): Placed[] {
  const p = pen(dark)
  const look = looks[t.pack]
  const layers = stickersOf(t.pack)
  const rng = new Seeded(seed('stickers.' + t.pack))
  fill(g, (() => { const q = new Path2D(); q.rect(0, 0, w, h); return q })(), p(look.ground))
  const m = Math.min(w, h)
  const area = (w * h) / (1200 * 800)
  const count = Math.max(8, Math.min(60, Math.trunc((6 + t.density * 26) * Math.max(0.5, area))))
  const base = m * (0.04 + 0.075 * t.scale)
  const placed: Placed[] = []
  const first = rng.int(layers.length)
  const px = scaleOf(g)
  const colour = (code: number) => {
    switch (code) {
      case -1: return p([0.20, 0.18, 0.24])
      case -2: return p([1, 1, 1])
      case -3: return p(look.ground)
      default: return p(look.palette[Math.min(code, look.palette.length - 1)])
    }
  }
  for (let i = 0; i < count; i++) {
    const r = base * rng.in(0.85, 1.2)
    let spot: [number, number] | null = null
    for (let k = 0; k < 60; k++) {
      const cx = rng.in(0.04, 0.96) * w
      const cy = rng.in(0.05, 0.95) * h
      // Out of the middle, where the address field is.
      const dx = (cx - w / 2) / (w * 0.3), dy = (cy - h / 2) / (h * 0.25)
      if (dx * dx + dy * dy < 1) continue
      if (placed.some(q => Math.hypot(q.x - cx, q.y - cy) < (q.r + r) * 1.35)) continue
      spot = [cx, cy]
      break
    }
    if (!spot) continue
    const sticker = (i + first) % layers.length
    const tilt = rng.in(-22, 22)
    placed.push({ x: spot[0], y: spot[1], r, tilt, sticker })
    drawSticker(g, layers[sticker], spot[0], spot[1], r, tilt, px, dark, p, colour)
  }
  return placed
}

/** One sticker: the die-cut edge, each of its strokes and fills casting its
 * own shadow (a GraphicsContext filter applies to every drawing after it,
 * one by one: where a later edge falls on an earlier one its shadow shows,
 * as on the Mac), then the sticker's layers on top. */
function drawSticker(g: Ctx, ls: Layer[], x: number, y: number, r: number, tilt: number, px: number, dark: boolean,
  p: ReturnType<typeof pen>, colour: (code: number) => string): void {
  const a = (tilt * Math.PI) / 180
  g.save()
  g.translate(x, y)
  g.rotate(a)
  g.scale(r, r)
  // Radius 0.04 and y 0.03 in the sticker's own units; canvas shadows are
  // in device pixels and ignore the transform, so they are turned here.
  g.shadowColor = `rgb(0 0 0 / ${dark ? 0.35 : 0.14})`
  g.shadowBlur = 2 * 0.04 * r * px
  g.shadowOffsetX = -Math.sin(a) * 0.03 * r * px
  g.shadowOffsetY = Math.cos(a) * 0.03 * r * px
  const white = p([1, 1, 1])
  for (const q of ls) {
    stroke(g, q.path, white, 0.34 + q.width)
    if (q.width === 0) fill(g, q.path, white)
  }
  g.shadowColor = 'transparent'
  g.shadowBlur = 0
  g.shadowOffsetX = 0
  g.shadowOffsetY = 0
  for (const q of ls) {
    if (q.width === 0) fill(g, q.path, colour(q.colour))
    else stroke(g, q.path, colour(q.colour), q.width)
  }
  g.restore()
}

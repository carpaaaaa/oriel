// A space's colour or gradient washed over the chrome (studio/02 §2.5,
// §2.6; Spaces.swift `SpaceWash`, SpaceGradient.swift). The maths are the
// Mac's, in OKLab: held, toned by strength, mixed at 24 stops.

import type { SpaceView } from '../../shared/state'
import { spaceColours } from './derive'

export interface Lab { L: number; a: number; b: number }

const linear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))

export function lab(r: number, g: number, b: number): Lab {
  const [lr, lg, lb] = [linear(r), linear(g), linear(b)]
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
  return {
    L: 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  }
}

export function fromHex(hex: string): Lab | null {
  const t = hex.trim().replace(/^#/, '')
  if (!/^[0-9a-f]{6}$/i.test(t)) return null
  const v = parseInt(t, 16)
  return lab(((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255)
}

const chroma = (c: Lab) => Math.hypot(c.a, c.b)

function linearRGB(c: Lab): [number, number, number] {
  const l = (c.L + 0.3963377774 * c.a + 0.2158037573 * c.b) ** 3
  const m = (c.L - 0.1055613458 * c.a - 0.0638541728 * c.b) ** 3
  const s = (c.L - 0.0894841775 * c.a - 1.2914855480 * c.b) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ]
}

const inGamut = (c: Lab) => linearRGB(c).every(v => v >= -1e-6 && v <= 1 + 1e-6)

/** sRGB 0-1; out of gamut it keeps lightness and hue, losing chroma. */
export function srgb(c: Lab): [number, number, number] {
  let colour = c
  if (!inGamut(c)) {
    let low = 0, high = 1
    for (let i = 0; i < 16; i++) {
      const mid = (low + high) / 2
      if (inGamut({ L: c.L, a: c.a * mid, b: c.b * mid })) low = mid; else high = mid
    }
    colour = { L: c.L, a: c.a * low, b: c.b * low }
  }
  const encode = (v: number) => { const x = Math.min(Math.max(v, 0), 1); return x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055 }
  return linearRGB(colour).map(encode) as [number, number, number]
}

/** Held to the wash's band: lightness 0.56-0.80, chroma at most 0.20. */
export function held(c: Lab): Lab {
  const L = Math.min(Math.max(c.L, 0.56), 0.8)
  const k = chroma(c) > 0.2 ? 0.2 / chroma(c) : 1
  return { L, a: c.a * k, b: c.b * k }
}

export type Strength = 'subtle' | 'rich' | 'vivid'

export function washOpacity(strength: Strength, dark: boolean): number {
  if (strength === 'rich') return dark ? 0.22 : 0.18
  if (strength === 'vivid') return dark ? 0.4 : 0.3
  return dark ? 0.11 : 0.07
}

export function tone(c: Lab, strength: Strength, dark: boolean): Lab {
  const [boost, lo, hi] = strength === 'rich' ? [1.15, 0, dark ? 0.72 : 1] : strength === 'vivid' ? [1.3, dark ? 0.48 : 0.62, dark ? 0.58 : 1] : [1, 0, 1]
  const ch = chroma(c), wanted = Math.min(ch * boost, Math.max(ch, 0.2))
  const k = ch > 1e-9 ? wanted / ch : 1
  return { L: Math.min(Math.max(c.L, lo), hi), a: c.a * k, b: c.b * k }
}

function mix(x: Lab, y: Lab, t: number): Lab {
  const out = { L: x.L + (y.L - x.L) * t, a: x.a + (y.a - x.a) * t, b: x.b + (y.b - x.b) * t }
  const wanted = chroma(x) + (chroma(y) - chroma(x)) * t
  const has = chroma(out)
  if (has > 1e-4) { out.a *= wanted / has; out.b *= wanted / has }
  return out
}

function along(colours: Lab[], t: number): Lab {
  const spot = Math.min(Math.max(t, 0), 1) * (colours.length - 1)
  const at = Math.min(Math.floor(spot), colours.length - 2)
  return mix(colours[at], colours[at + 1], spot - at)
}

const css = ([r, g, b]: [number, number, number], alpha: number) =>
  `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${+alpha.toFixed(4)})`

/** The gradient's colours as drawn: the first three that read, held. */
export function drawn(space: SpaceView): Lab[] {
  return (space.gradient?.colours ?? []).map(fromHex).filter((c): c is Lab => !!c).slice(0, 3).map(held)
}

/** The colour standing for a space: its gradient's first, or its colour. */
export function tint(space: SpaceView | undefined): string | null {
  if (!space) return null
  const lead = drawn(space)
  if (lead.length >= 2) return css(srgb(lead[0]), 1)
  const c = spaceColours[space.colour]
  return space.colour > 0 && c ? css(c, 1) : null
}

export function tintAlpha(space: SpaceView | undefined, alpha: number): string | null {
  if (!space) return null
  const lead = drawn(space)
  if (lead.length >= 2) return css(srgb(lead[0]), alpha)
  const c = spaceColours[space.colour]
  return space.colour > 0 && c ? css(c, alpha) : null
}

/** The CSS background a space washes the chrome with, or null for none. */
export function wash(space: SpaceView | undefined, dark: boolean): string | null {
  if (!space) return null
  const strength: Strength = space.strength ?? 'subtle'
  const opacity = washOpacity(strength, dark)
  const colours = drawn(space)
  if (colours.length >= 2) {
    const toned = colours.map(c => tone(c, strength, dark))
    const stops = Array.from({ length: 24 }, (_, i) => {
      const t = i / 23
      return `${css(srgb(along(toned, t)), opacity)} ${(t * 100).toFixed(2)}%`
    })
    return `linear-gradient(${space.gradient?.angle ?? 135}deg, ${stops.join(', ')})`
  }
  const c = spaceColours[space.colour]
  if (!(space.colour > 0) || !c) return null
  const toned = strength === 'subtle' ? c : srgb(tone(lab(...c), strength, dark))
  return css(toned, opacity)
}

let grainTile: string | null = null
/** The grain's tile: 128 × 128 pixels shown at 64 (SpaceGradient.swift:389). */
export function grain(): string {
  if (grainTile) return grainTile
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 128
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  const img = ctx.createImageData(128, 128)
  let s = 0x9E3779B9 >>> 0
  for (let i = 0; i < 128 * 128; i++) {
    s ^= s << 13; s >>>= 0
    s ^= s >>> 17
    s ^= s << 5; s >>>= 0
    const v = (s / 0xFFFFFFFF) * 2 - 1
    const c = v > 0 ? 255 : 0
    img.data.set([c, c, c, Math.round(Math.abs(v) * 255)], i * 4)
  }
  ctx.putImageData(img, 0, 0)
  grainTile = canvas.toDataURL()
  return grainTile
}

// HomeBackground.paint and HomeRender (HomeTheme.swift:247-446; studio/02
// §2.8, §8.2): a theme is drawn once into a picture, never per frame, at the
// box rounded up to the next 64 points and at the screen's scale, and shown
// filling the box (aspect fill, centred), as the Mac shows its NSImage. A
// preview is painted as a window 480 wide and shrunk to its size.

import { type HomeTheme, type HomeTuning, channels, walls, packs, type StickerPack } from './model'
import { type Ctx, fill, linear, pen, rectIn, css } from './draw'
import { paintWall } from './walls'
import { paintStickers, type Placed } from './stickers'
import { dayNumber } from './random'

/** Palette.ground in each look (tokens.css: #FFFFFF, #1C1C1C). */
export const groundOf = (dark: boolean) => (dark ? '#1C1C1C' : '#FFFFFF')

/** What the last painting placed, for the bench. */
export let lastPlaced: Placed[] = []

export function paint(theme: HomeTheme, t: HomeTuning, g: Ctx, w: number, h: number, dark: boolean): void {
  if (w <= 1 || h <= 1) return
  const p = pen(dark)
  const whole = rectIn(0, 0, w, h)
  switch (theme) {
    case 'stickers':
      lastPlaced = paintStickers(g, w, h, t, dark)
      break
    case 'solid':
      fill(g, whole, p(channels(t.solid)))
      break
    case 'gradient': {
      const a = (t.angle * Math.PI) / 180
      const dx = Math.cos(a), dy = Math.sin(a)
      const half = (Math.abs(w * dx) + Math.abs(h * dy)) / 2
      const mx = w / 2, my = h / 2
      fill(g, whole, linear(g, mx - dx * half, my - dy * half, mx + dx * half, my + dy * half, [p(channels(t.gradientA)), p(channels(t.gradientB))]))
      break
    }
    case 'off': case 'custom':
      break
    default:
      paintWall(theme, g, w, h, dark)
  }
  // Intensity: the theme blended toward the plain ground.
  if (t.intensity < 0.999) fill(g, whole, withAlpha(groundOf(dark), 1 - Math.max(0, t.intensity)))
}

function withAlpha(hex: string, a: number): string { return css(channels(hex), a) }

/** Today's wall: the chosen one, or with Shuffle the family's pick for this
 * date (the day number steps through the family). A date check, not a timer. */
export function today(theme: HomeTheme, tuning: HomeTuning, shuffle: boolean, thumbnail = false, day = dayNumber()): { theme: HomeTheme; tuning: HomeTuning } {
  if (!shuffle || thumbnail || !(theme === 'stickers' || walls.includes(theme))) return { theme, tuning }
  if (theme === 'stickers') return { theme, tuning: { ...tuning, pack: packs[day % packs.length][0] as StickerPack } }
  return { theme: walls[day % walls.length], tuning }
}

export const REFERENCE = 480

/** The size a theme is painted at: up to the next 64 points; a preview as a
 * window 480 wide. */
export function drawnSize(w: number, h: number, thumbnail: boolean): { w: number; h: number } {
  if (thumbnail) return w > 0 ? { w: REFERENCE, h: Math.round((REFERENCE * h) / w) } : { w, h }
  return { w: Math.ceil(w / 64) * 64, h: Math.ceil(h / 64) * 64 }
}

/** Paints into `canvas` at `scale` device pixels per point. */
export function render(canvas: HTMLCanvasElement | OffscreenCanvas, theme: HomeTheme, t: HomeTuning, w: number, h: number, scale: number, dark: boolean): void {
  const pw = Math.max(1, Math.round(w * scale)), ph = Math.max(1, Math.round(h * scale))
  if (canvas.width !== pw) canvas.width = pw
  if (canvas.height !== ph) canvas.height = ph
  const g = canvas.getContext('2d') as Ctx
  g.setTransform(1, 0, 0, 1, 0, 0)
  g.clearRect(0, 0, pw, ph)
  g.setTransform(pw / w, 0, 0, ph / h, 0, 0)
  paint(theme, t, g, w, h, dark)
}

/** The knobs a theme's painting depends on, for a key that changes only when it should. */
export function keyOf(theme: HomeTheme, t: HomeTuning, thumbnail: boolean): string {
  const i = thumbnail ? 1 : t.intensity
  switch (theme) {
    case 'stickers': return `stickers:${t.pack}:${t.density}:${t.scale}:${i}`
    case 'solid': return `solid:${t.solid}:${i}`
    case 'gradient': return `gradient:${t.gradientA}:${t.gradientB}:${t.angle}:${i}`
    default: return `${theme}:${i}`
  }
}

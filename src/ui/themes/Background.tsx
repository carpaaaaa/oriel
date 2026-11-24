// HomeBackground (HomeTheme.swift:295-399): the ground, then the theme's
// picture filling the box, or the chosen image filling it under the ground
// at 1 − intensity. Never hit, never read aloud.

import { createEffect, createSignal, onCleanup, onMount, Show } from 'solid-js'
import { type HomeTheme, type HomeTuning } from './model'
import { drawnSize, keyOf, render, today } from './paint'
import { look, picture, scale } from './live'

export function HomeBackground(p: {
  theme: HomeTheme
  tuning: HomeTuning
  image?: string
  /** A preview: drawn as a window 480 wide, at full strength. */
  thumbnail?: boolean
  shuffle?: boolean
  class?: string
}) {
  let box!: HTMLDivElement
  const [art, setArt] = createSignal<HTMLCanvasElement>()
  const [shot, setShot] = createSignal<HTMLCanvasElement>()
  const [size, setSize] = createSignal({ w: 0, h: 0 })
  const shown = () => {
    const t = today(p.theme, p.tuning, !!p.shuffle, !!p.thumbnail)
    return { theme: t.theme, tuning: p.thumbnail ? { ...t.tuning, intensity: 1 } : t.tuning }
  }
  const pic = picture(() => (shown().theme === 'custom' ? p.image ?? '' : ''))

  onMount(() => {
    const measure = () => {
      const r = box.getBoundingClientRect()
      setSize(s => (s.w === r.width && s.h === r.height ? s : { w: r.width, h: r.height }))
    }
    const ro = new ResizeObserver(measure)
    ro.observe(box)
    measure()
    onCleanup(() => ro.disconnect())
  })

  // The theme: painted again only when what it shows changes.
  createEffect(() => {
    const canvas = art()
    const { theme, tuning } = shown()
    const { w, h } = size()
    if (!canvas || theme === 'off' || theme === 'custom' || w < 1 || h < 1) return
    const d = drawnSize(w, h, !!p.thumbnail)
    const px = p.thumbnail ? (scale() * w) / d.w : scale()
    const key = `${keyOf(theme, tuning, !!p.thumbnail)}|${d.w}x${d.h}|${px}|${look()}`
    if (canvas.dataset.key === key) return
    render(canvas, theme, tuning, d.w, d.h, px, look() === 'dark')
    canvas.dataset.key = key
    canvas.dataset.drawn = `${d.w}x${d.h}`
  })

  // The picture: laid in a canvas at its own size (capped), filling the box.
  createEffect(() => {
    const canvas = shot(), bitmap = pic()
    if (!canvas || !bitmap) return
    const cap = 4096 / Math.max(bitmap.width, bitmap.height, 4096)
    canvas.width = Math.max(1, Math.round(bitmap.width * cap))
    canvas.height = Math.max(1, Math.round(bitmap.height * cap))
    const g = canvas.getContext('2d')!
    g.imageSmoothingQuality = 'high'
    g.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  })

  return (
    <div class={`home-bg ${p.class ?? ''}`} ref={box} aria-hidden="true" data-theme={shown().theme}
      data-shown={shown().theme === 'custom' ? (pic() ? 'custom' : 'off') : shown().theme}>
      <Show when={shown().theme !== 'off' && shown().theme !== 'custom'}>
        <canvas class="home-bg-art" ref={setArt} />
      </Show>
      <Show when={shown().theme === 'custom' && pic()}>
        <canvas class="home-bg-art picture" ref={setShot} />
        <div class="home-bg-veil" style={{ opacity: String(1 - Math.max(0, shown().tuning.intensity)) }} />
      </Show>
    </div>
  )
}

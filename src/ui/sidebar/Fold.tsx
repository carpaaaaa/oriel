// The folded column out over the page (studio/01 §5.29-§5.30, studio/02
// §4.8, §6.2; Fold.swift): the same column, in the overlay, sliding in on
// the fold-out spring (0.14 / 0.86) and back on the fold-in one (0.13 / 1.0),
// or on Slide the column in and out's ease-out 0.26 / ease-in 0.22, at once
// with Reduce animations (Design.swift Motion.folding); with a shadow toward
// the page (black 14%, radius 20, 4 over) falling from a ground behind it.
// With the tabs across the top it is the strip, coming down from the top.
// The window module raises the layer ({ kind: 'fold' }, then { going: true }
// while it goes back) and sizes the overlay to it (main/window/edges.ts); on
// the window drawn by Oriel its outer corners are the window's.

import { createEffect, on, onMount, Show } from 'solid-js'
import { state } from '../lib/store'
import type { OverlayLayer } from '../../shared/state'
import { Column } from './Sidebar'
import { TabBar } from '../tabbar/TabBar'
import { CaptionButtons } from '../chrome/Buttons'
import { capBand } from '../data/where'
import { curve, Springs } from './motion'
import { pref } from './derive'

export function FoldLayer(p: { layer: OverlayLayer }) {
  let el!: HTMLDivElement
  const strip = () => state.sidebar.layout === 'top'
  const width = () => (state.sidebar.icons ? 52 : state.sidebar.width)
  const height = () => (pref('tabs.compact', false) ? 36 : 52)
  const r = () => (state.frame?.kind === 'drawn' && state.frame.state === 'free' ? 17.5 : 0)
  const corners = () => (strip() ? `${r()}px ${r()}px 0 0` : state.sidebar.side === 'right' ? `0 ${r()}px ${r()}px 0` : `${r()}px 0 0 ${r()}px`)
  const away = () => (strip() ? `translateY(${-height()}px)` : `translateX(${state.sidebar.side === 'right' ? width() : -width()}px)`)
  const timing = (out: boolean) => {
    if (pref('motion.instant', false)) return { duration: 0, easing: 'linear' }
    if (pref('sidebar.slides', false)) return out ? { duration: 260, easing: 'cubic-bezier(0, 0, .58, 1)' } : { duration: 220, easing: 'cubic-bezier(.42, 0, 1, 1)' }
    return curve(out ? Springs.foldOut : Springs.foldIn)
  }
  let back: Animation | null = null
  const comeOut = () => {
    // Met on its way back (Fold.swift: it turns round): from where it is.
    const from = back ? getComputedStyle(el).transform : away()
    back?.cancel()
    back = null
    const t = timing(true)
    document.documentElement.dataset.foldOut = `${t.duration} ${t.easing.slice(0, 40)}`
    const out = el.animate([{ transform: from === 'none' ? away() : from }, { transform: 'none' }], { ...t, fill: 'none' })
    // Held at its start by a view drawing no frames, the column would stay away: past its time it is out.
    setTimeout(() => { if (out.playState !== 'finished') out.cancel() }, t.duration + 100)
  }
  onMount(comeOut)
  createEffect(on(() => !!(p.layer as { going?: boolean }).going, going => {
    if (going) {
      const t = timing(false)
      document.documentElement.dataset.foldBack = `${t.duration} ${t.easing.slice(0, 40)}`
      back = el.animate([{ transform: 'none' }, { transform: away() }], { ...t, fill: 'forwards' })
    }
    else comeOut()
  }, { defer: true }))
  return (
    <div ref={el} class="fold-out on-frame" data-tabs-ui="fold" classList={{ right: !strip() && state.sidebar.side === 'right', top: strip() }}
      style={{ width: strip() ? undefined : `${width()}px`, height: strip() ? `${height()}px` : undefined, 'border-radius': corners(), overflow: 'hidden' }}>
      <Show when={strip()} fallback={<Column />}><TabBar /></Show>
      {/* The tabs folded in a window: the page fills it, the window's buttons come down with the strip. */}
      <Show when={strip() && state.chrome === 'windows' && capBand()}><CaptionButtons /></Show>
    </div>
  )
}

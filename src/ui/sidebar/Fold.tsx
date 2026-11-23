// The folded column out over the page (studio/01 §5.29-§5.30, studio/02
// §4.8, §6.2; Fold.swift): the same column, in the overlay, sliding in on
// the fold-out spring (0.14 / 0.86), with a shadow toward the page (black
// 14%, radius 20, 4 over) falling from a ground behind it. The window
// module raises the layer ({ kind: 'fold' }) and sizes the overlay to it.

import { onMount } from 'solid-js'
import { state } from '../lib/store'
import type { OverlayLayer } from '../../shared/state'
import { Column } from './Sidebar'
import { curve, Springs } from './motion'

export function FoldLayer(_p: { layer: OverlayLayer }) {
  let el!: HTMLDivElement
  const width = () => (state.sidebar.icons ? 52 : state.sidebar.width)
  onMount(() => {
    const { duration, easing } = curve(Springs.foldOut)
    const from = state.sidebar.side === 'right' ? width() : -width()
    el.animate([{ transform: `translateX(${from}px)` }, { transform: 'translateX(0)' }], { duration, easing })
  })
  return (
    <div ref={el} class="fold-out on-frame" data-tabs-ui="fold" classList={{ right: state.sidebar.side === 'right' }} style={{ width: `${width()}px` }}>
      <Column />
    </div>
  )
}

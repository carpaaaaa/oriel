// The window module's pieces in the overlay. In full screen the window's
// buttons come down with the pointer at the top of the screen (studio/01
// §1.19-§1.22, as macOS brings the lights back; main/window/edges.ts raises
// the layer): a strip of 40 over the page with Minimize, Exit Full Screen and
// Close, so a window is never left without a way out.

import { createEffect, createRoot, on, onMount } from 'solid-js'
import { registerPanel } from '../lib/registry'
import { cmd, state } from '../lib/store'
import type { OverlayLayer } from '../../shared/state'
import { CaptionButtons, buttonStyle } from './Buttons'
import { curve, Springs } from '../sidebar/motion'

function Reveal() {
  return (
    <div class="reveal-strip" classList={{ inline: buttonStyle() === 'inline' }} data-window-ui="reveal">
      <CaptionButtons full />
    </div>
  )
}

registerPanel('window.reveal', Reveal)

/** The page's zoom, said where the Mac says it (main/window/zoom.ts): the light
 * announcement 30 above the page's foot, up on settle, rewritten while it
 * changes (never up again from nothing), gone on quick; a click on it goes
 * back to the default zoom. */
function ZoomPill(p: { layer: OverlayLayer }) {
  let el!: HTMLButtonElement
  const data = () => (p.layer as { data?: { percent: number; tab: string; going?: boolean } }).data
  const still = () => !!state.prefs?.['motion.instant']
  onMount(() => {
    if (!still()) el.animate([{ opacity: 0, transform: 'translate(-50%, 10px)' }, { opacity: 1, transform: 'translate(-50%, 0)' }], { ...curve(Springs.settle), fill: 'none' })
  })
  let fade: Animation | null = null
  createEffect(on(() => !!data()?.going, going => {
    // Changed again while it was going: it stays, rewritten.
    fade?.cancel()
    fade = going && !still() ? el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, easing: 'cubic-bezier(0, 0, .58, 1)', fill: 'forwards' }) : null
  }, { defer: true }))
  return (
    <button ref={el} class="zoom-pill" data-window-ui="zoom" title="Actual Size"
      onClick={() => void cmd({ do: 'view.zoom', reset: true, id: data()?.tab })}>{data()?.percent ?? 100}%</button>
  )
}

registerPanel('window.zoom', ZoomPill)

// Motion for both roots (Design.swift Motion): Reduce animations makes every
// transition immediate (motion.instant); Save power in Low Power Mode makes
// glide and settle a short ease-out while Windows saves power (motion.light).
createRoot(() => createEffect(() => {
  const p = state.prefs ?? {}
  const root = document.documentElement.dataset
  root.motion = p['motion.instant'] ? 'instant' : p['motion.light'] && state.power?.saving ? 'light' : ''
  // Tabs give when pressed (tabs.give, Design.swift Motion.give)
  if (p['tabs.give']) root.give = '1'; else delete root.give
  // The overlay knows the window's clear margin too: its veils cover the
  // window drawn by Oriel, never the margin round it (app.css).
  if (window.search?.root === 'overlay') {
    const m = state.frame?.margin ?? { top: 0, right: 0, bottom: 0, left: 0 }
    const s = document.documentElement.style
    for (const side of ['top', 'right', 'bottom', 'left'] as const) s.setProperty(`--m-${side}`, `${m[side]}px`)
    root.frame = state.frame?.kind ?? 'drawn'
    root.state = state.frame?.state ?? 'free'
  }
}))

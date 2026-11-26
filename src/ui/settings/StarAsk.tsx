// The star card after an update (main/settings/star.ts): one line, Star on
// GitHub and Buy me a coffee. It goes by itself after a while, never while
// the pointer is on it; the X puts it away until the next update.

import { createEffect, createSignal, on, onCleanup, onMount } from 'solid-js'
import { cmd, state } from '../lib/store'
import { Symbol } from './symbols'

const STAY = 25_000
const OUT = 160

export function StarAsk() {
  const [going, setGoing] = createSignal(false)
  let card!: HTMLDivElement
  let timer: ReturnType<typeof setTimeout> | undefined
  // Oriel's text size (Settings › Appearance): icons and the X grow with it.
  const k = () => Math.min(1.4, Math.max(1, Number(state.prefs?.['text.scale']) || 1))
  // The card sizes itself to its content; main is told how big, to size its region.
  const fit = () => { const r = card.getBoundingClientRect(); if (r.width && r.height) void cmd({ do: 'star.fit', width: Math.ceil(r.width), height: Math.ceil(r.height) }) }
  const leave = (then: 'star.later' | 'star.coffee' | 'star.open') => {
    if (going()) return
    clearTimeout(timer)
    setGoing(true)
    setTimeout(() => void cmd({ do: then }), then === 'star.later' ? OUT : 0)
  }
  const wait = () => { clearTimeout(timer); timer = setTimeout(() => leave('star.later'), STAY) }
  onMount(() => { wait(); void document.fonts.ready.then(() => requestAnimationFrame(fit)) })
  createEffect(on(k, () => requestAnimationFrame(fit), { defer: true }))
  onCleanup(() => clearTimeout(timer))
  return (
    <div class="star-card" ref={card} classList={{ going: going() }} role="dialog" aria-label="Enjoying Oriel?"
      onPointerEnter={() => clearTimeout(timer)} onPointerLeave={wait}>
      <span class="star-glyph"><Symbol name="star.fill" size={15 * k()} /></span>
      <div class="star-text">
        <div class="star-title">Enjoying Oriel?</div>
        <div class="star-line">A star on GitHub helps others find it.</div>
      </div>
      <button class="star-x" title="Not now" aria-label="Close" onClick={() => leave('star.later')}><Symbol name="xmark" size={10 * k()} weight="medium" /></button>
      <div class="star-foot">
        <button class="pill-st filled star-go" onClick={() => leave('star.open')}><Symbol name="star" size={10 * k()} weight="medium" />Star on GitHub</button>
        <button class="pill-st star-coffee" onClick={() => leave('star.coffee')}><Symbol name="cup" size={10 * k()} weight="medium" />Buy me a coffee</button>
      </div>
    </div>
  )
}

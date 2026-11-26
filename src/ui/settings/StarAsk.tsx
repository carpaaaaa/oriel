// The star card after an update (main/settings/star.ts): one line, Star on
// GitHub and Buy me a coffee. It goes by itself after a while, never while
// the pointer is on it; the X puts it away until the next update.

import { createSignal, onCleanup, onMount } from 'solid-js'
import { cmd } from '../lib/store'
import { Symbol } from './symbols'

const STAY = 25_000
const OUT = 160

export function StarAsk() {
  const [going, setGoing] = createSignal(false)
  let timer: ReturnType<typeof setTimeout> | undefined
  const leave = (then: 'star.later' | 'star.coffee' | 'star.open') => {
    if (going()) return
    clearTimeout(timer)
    setGoing(true)
    setTimeout(() => void cmd({ do: then }), then === 'star.later' ? OUT : 0)
  }
  const wait = () => { clearTimeout(timer); timer = setTimeout(() => leave('star.later'), STAY) }
  onMount(wait)
  onCleanup(() => clearTimeout(timer))
  return (
    <div class="star-card" classList={{ going: going() }} role="dialog" aria-label="Enjoying Oriel?"
      onPointerEnter={() => clearTimeout(timer)} onPointerLeave={wait}>
      <span class="star-glyph"><Symbol name="star.fill" size={15} /></span>
      <div class="star-text">
        <div class="star-title">Enjoying Oriel?</div>
        <div class="star-line">A star on GitHub helps others find it.</div>
      </div>
      <button class="star-x" title="Not now" aria-label="Close" onClick={() => leave('star.later')}><Symbol name="xmark" size={10} weight="medium" /></button>
      <div class="star-foot">
        <button class="pill-st filled star-go" onClick={() => leave('star.open')}><Symbol name="star" size={10} weight="medium" />Star on GitHub</button>
        <button class="pill-st star-coffee" onClick={() => leave('star.coffee')}><Symbol name="cup" size={10} weight="medium" />Buy me a coffee</button>
      </div>
    </div>
  )
}

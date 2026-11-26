// The star card after an update (main/settings/star.ts): one line, Star on
// GitHub and Don't ask again. It goes by itself after a while, never while
// the pointer is on it; the X puts it away until the next update.

import { createSignal, onCleanup, onMount } from 'solid-js'
import { cmd } from '../lib/store'
import { Symbol } from './symbols'

const STAY = 25_000
const OUT = 160

export function StarAsk() {
  const [going, setGoing] = createSignal(false)
  let timer: ReturnType<typeof setTimeout> | undefined
  const leave = (then: 'star.later' | 'star.never' | 'star.open') => {
    if (going()) return
    clearTimeout(timer)
    setGoing(true)
    setTimeout(() => void cmd({ do: then }), then === 'star.open' ? 0 : OUT)
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
        <button class="star-never" onClick={() => leave('star.never')}>Don't ask again</button>
      </div>
    </div>
  )
}

// The floating video's buttons (studio/06 §3.5; Float.swift Controls),
// drawn over the video in the little window: close and Minimize at the top
// left, back to the tab at the top right, back 15 seconds, play or pause and
// forward 15 seconds in the middle, a thin line along the foot that seeks.
// They show only while the pointer is over the window (:hover, or "near",
// which the main process sets from the pointer's place: Windows hands a
// draggable region no hover). Chips in the interface's own colours, so they
// follow light and dark. Owned by the pages module.

import { createSignal, Show } from 'solid-js'
import { Symbol } from '../settings/symbols'

type Told = { tuck?: boolean; tucked?: boolean; playing?: boolean; through?: number; seekable?: boolean; near?: boolean; still?: boolean }

declare global { interface Window { set?: (o: Told) => boolean } }

/** The main process hears this page through its console (oriel-float:...). */
const say = (what: string) => console.debug('oriel-float:' + what)

/** Small strokes in the symbols' own weight (one 16-unit box, round ends). */
const Glyph = (p: { d: string; size?: number; fill?: boolean }) => (
  <svg width={p.size ?? 14} height={p.size ?? 14} viewBox="0 0 16 16" fill={p.fill ? 'currentColor' : 'none'} stroke="currentColor"
    stroke-width={p.fill ? 1.4 : 1.6} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={p.d} /></svg>
)

export function FloatControls() {
  const [tuck, setTuck] = createSignal(false)
  const [tucked, setTucked] = createSignal(false)
  const [playing, setPlaying] = createSignal(true)
  const [through, setThrough] = createSignal(0)
  const [seekable, setSeekable] = createSignal(false)
  const [held, setHeld] = createSignal(false)
  const root = document.documentElement

  window.set = o => {
    if (o.tuck !== undefined) setTuck(o.tuck)
    if (o.tucked !== undefined) { setTucked(o.tucked); root.classList.toggle('tucked', o.tucked) }
    if (o.playing !== undefined) setPlaying(o.playing)
    if (o.through !== undefined && !held()) setThrough(o.through)
    if (o.seekable !== undefined) setSeekable(o.seekable)
    if (o.near !== undefined) root.classList.toggle('near', o.near)
    // Settings > Reduce animations: the buttons come and go at once.
    if (o.still !== undefined) root.dataset.motion = o.still ? 'instant' : ''
    return true
  }

  // Two fingers on a touchpad: the window is flicked or pushed along (float.ts wheel).
  let sum = { x: 0, y: 0 }, quiet: ReturnType<typeof setTimeout> | undefined
  addEventListener('wheel', e => {
    e.preventDefault(); sum.x += e.deltaX; sum.y += e.deltaY; clearTimeout(quiet)
    quiet = setTimeout(() => { const s = sum; sum = { x: 0, y: 0 }; say(`wheel,${Math.round(s.x)},${Math.round(s.y)}`) }, 120)
  }, { passive: false })

  // The window moves by its video: a press anywhere but on a chip or the line
  // holds it, and the pointer's travel is told to the main process (float.ts
  // drag), which moves the window. The page does it, not a draggable region,
  // because a region made Windows answer "title bar" over the buttons too.
  let from: { x: number; y: number } | null = null, pending: { x: number; y: number } | null = null, frame = 0
  const grab = (e: PointerEvent) => {
    if (e.button !== 0 || from || (e.target as Element).closest('button, .scrub, .group')) return
    from = { x: e.screenX, y: e.screenY }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    say('drag,start')
  }
  const carry = (e: PointerEvent) => {
    if (!from) return
    pending = { x: e.screenX - from.x, y: e.screenY - from.y }
    if (!frame) frame = requestAnimationFrame(() => { frame = 0; if (pending) { say(`drag,${pending.x},${pending.y}`); pending = null } })
  }
  const drop = () => {
    if (!from) return
    from = null
    if (frame) { cancelAnimationFrame(frame); frame = 0 }
    if (pending) { say(`drag,${pending.x},${pending.y}`); pending = null }
    say('drag,end')
  }

  // The line along the foot: a press or a drag seeks, as far as the video goes.
  let track!: HTMLDivElement
  let last = 0
  const seek = (e: PointerEvent, final: boolean) => {
    const r = track.getBoundingClientRect()
    const at = Math.min(1, Math.max(0, (e.clientX - r.left) / Math.max(r.width, 1)))
    setThrough(at)
    if (final || performance.now() - last > 80) { last = performance.now(); say(`seek,${at.toFixed(4)}`) }
  }

  return (
    <div class="float" onPointerDown={grab} onPointerMove={carry} onPointerUp={drop} onPointerCancel={drop}>
      <div class="chrome">
        <div class="group tl">
          <button id="close" class="b" title="Close" aria-label="Close" onClick={() => say('close')}><Symbol name="xmark" size={12} weight="medium" /></button>
          <button id="tuck" class="b" classList={{ off: !tuck() }} title={tucked() ? 'Restore' : 'Minimize'} aria-label={tucked() ? 'Restore' : 'Minimize'} onClick={() => say('tuck')}>
            <Show when={tucked()} fallback={<Symbol name="minus" size={12} weight="medium" />}><Symbol name="plus" size={12} weight="medium" /></Show>
          </button>
        </div>
        <div class="group tr">
          <button id="back" class="b" title="Back to the tab" aria-label="Back to the tab" onClick={() => say('back')}><Glyph d="M6 4h6v6M12 4 4.5 11.5" size={13} /></button>
        </div>
        <div class="group mid">
          <button id="rewind" class="b" title="Back 15 seconds" aria-label="Back 15 seconds" onClick={() => say('skip,-15')}><Glyph d="M3.5 8a4.5 4.5 0 1 0 1.4-3.3M4.9 2.4v2.4h2.4" /></button>
          <button id="pause" class="b big" title={playing() ? 'Pause' : 'Play'} aria-label={playing() ? 'Pause' : 'Play'} onClick={() => say('toggle')}>
            <Show when={playing()} fallback={<Glyph d="M5.8 4.2v7.6l6-3.8z" size={16} fill />}><Glyph d="M6 4.5v7M10 4.5v7" size={16} /></Show>
          </button>
          <button id="forward" class="b" title="Forward 15 seconds" aria-label="Forward 15 seconds" onClick={() => say('skip,15')}><Glyph d="M12.5 8a4.5 4.5 0 1 1-1.4-3.3M11.1 2.4v2.4H8.7" /></button>
        </div>
        <div id="line" class="scrub" classList={{ held: held(), off: !seekable() }}
          onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); setHeld(true); seek(e, true) }}
          onPointerMove={e => { if (held()) seek(e, false) }}
          onPointerUp={e => { if (held()) { seek(e, true); setHeld(false) } }}
          onPointerCancel={() => setHeld(false)}>
          <div class="track" ref={track}><i style={{ width: `${through() * 100}%` }} /></div>
        </div>
      </div>
      <div class="edge" />
    </div>
  )
}

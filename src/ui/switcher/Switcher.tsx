// The Ctrl+Tab switcher (studio/01 §3.25-§3.28; TabSwitcher.swift 399-677):
// a veil of black at 12% over the window, a panel of cards five a row (at
// most ten), each the page's picture with its mark and title under it, the
// chosen card on a grey that glides; the keys under the grid. Up only once
// Ctrl has been held 0.15 s; the model keeps which card is chosen.

import './switcher.css'
import { createEffect, createMemo, createSignal, For, on, onCleanup, Show } from 'solid-js'
import { state, cmd } from '../lib/store'
import type { TabView } from '../../shared/state'
import { label, monogram } from '../sidebar/derive'
import { Mark } from '../sidebar/Row'
import { G } from '../sidebar/glyphs'
import { Chase, Springs, type Box } from '../sidebar/motion'
import { claim, release, room } from '../menus/host'

export function Switcher() {
  const [up, setUp] = createSignal(false)
  let timer = 0
  createEffect(on(() => !!state.switcher, on => {
    clearTimeout(timer)
    if (on) timer = window.setTimeout(() => { if (state.switcher) setUp(true) }, 150)
    else if (up()) { setUp(false); release(true) }
  }))
  createEffect(on(up, u => { if (u) claim(room().w ? room() : { w: 1180, h: 780 }) }))
  onCleanup(() => clearTimeout(timer))
  return <Show when={up() && state.switcher}><Panel /></Show>
}

function Panel() {
  let panel!: HTMLDivElement
  let hi!: HTMLDivElement
  const cards = createMemo(() => (state.switcher?.cards ?? []).map(id => state.tabs.find(t => t.id === id)).filter(Boolean) as TabView[])
  const index = () => state.switcher?.index ?? 0
  const W = () => room().w || window.innerWidth
  const cols = () => Math.min(5, cards().length)
  // TabSwitcher.swift: card ≤ 176, the picture (w − 16) × 0.62, card + 39.
  const cardW = () => Math.min(176, (W() - 64 - (cols() - 1) * 8) / cols())
  const picH = () => (cardW() - 16) * 0.62
  const cardH = () => picH() + 39
  const pos = (i: number): Box => ({ x: (i % 5) * (cardW() + 8), y: Math.floor(i / 5) * (cardH() + 8), w: cardW(), h: cardH() })

  // the chosen card's grey, gliding
  let chase: Chase | null = null
  let at: Box | null = null
  createEffect(on(index, i => {
    const goal = pos(i)
    const paint = (b: Box) => { at = b; hi.style.transform = `translate(${b.x}px, ${b.y}px)`; hi.style.width = `${b.w}px`; hi.style.height = `${b.h}px` }
    if (!at) { paint(goal); return }
    chase?.stop()
    chase = new Chase(Springs.glide, at, () => pos(index()), paint, () => { chase = null })
    chase.start()
  }))
  onCleanup(() => chase?.stop())

  const step = (by: number) => { for (let n = 0; n < Math.abs(by); n++) void cmd({ do: 'tab.switch', by: by > 0 ? 1 : -1 }) }
  const choose = (i: number) => {
    const id = cards()[i]?.id
    void cmd({ do: 'tab.switchEnd', cancel: true }).then(() => id && cmd({ do: 'tab.select', id }))
  }
  const onKey = (e: KeyboardEvent) => {
    const n = cards().length
    if (e.key === 'ArrowRight') step(1)
    else if (e.key === 'ArrowLeft') step(-1)
    else if (e.key === 'ArrowUp') { if (index() >= 5) step(-5) }
    else if (e.key === 'ArrowDown') { if (index() < 5) step(Math.min(5, n - 1 - index())) }
    else if (e.key === 'Escape') void cmd({ do: 'tab.switchEnd', cancel: true })
    else if (!['Control', 'Shift', 'Tab', 'Meta'].includes(e.key)) void cmd({ do: 'tab.switchEnd', cancel: true })
    else return
    e.preventDefault()
  }
  window.addEventListener('keydown', onKey)
  onCleanup(() => window.removeEventListener('keydown', onKey))

  // The pointer picks the card under it only once it has moved 2 points.
  let origin: { x: number; y: number } | null = null
  const hover = (e: PointerEvent, i: number) => {
    if (!origin) { origin = { x: e.clientX, y: e.clientY }; return }
    if (Math.abs(e.clientX - origin.x) + Math.abs(e.clientY - origin.y) <= 2) return
    if (i !== index()) step(i - index())
  }

  const rows = () => Math.ceil(cards().length / 5)
  const width = () => 24 + cols() * cardW() + (cols() - 1) * 8
  return (
    <div class="switcher" data-tabs-ui="switcher" onPointerDown={e => { if (e.target === e.currentTarget) void cmd({ do: 'tab.switchEnd', cancel: true }) }}>
      <div ref={panel} class="switcher-panel" style={{ width: `${width()}px` }}>
        <div class="switcher-grid" style={{ height: `${rows() * cardH() + (rows() - 1) * 8}px` }}>
          <div ref={hi} class="switcher-chosen" />
          <For each={cards()}>{(t, i) => (
            <div class="card" style={{ transform: `translate(${pos(i()).x}px, ${pos(i()).y}px)`, width: `${cardW()}px`, height: `${cardH()}px` }}
              data-card={t.id} classList={{ chosen: i() === index() }}
              onPointerMove={e => hover(e, i())} onClick={() => choose(i())}>
              <div class="picture" style={{ height: `${picH()}px` }}>
                <span class="no-picture" style={{ 'font-size': '26px' }}>{t.empty ? '+' : monogram({ ...t, label: label(t) })}</span>
              </div>
              <div class="caption">
                <Show when={!t.empty}><Mark tab={{ ...t, label: label(t) }} size={13} /></Show>
                <span class="card-title">{label(t)}</span>
                <Show when={t.muted}><G.speakerSlash pt={9.5} class="card-muted" /></Show>
              </div>
            </div>
          )}</For>
        </div>
        <div class="switcher-keys">
          <span><b>Ctrl+W</b> Close</span><span><b>Ctrl+R</b> Reload</span><span><b>Ctrl+M</b> Mute</span>
        </div>
      </div>
    </div>
  )
}

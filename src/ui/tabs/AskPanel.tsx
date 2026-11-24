// Ask which space for links from other apps (LinkChooserPanel.swift; studio/01
// §7.30): the link, every space with the digit that opens it there, Always
// for its site with Send links to a space on, and the keys. On Windows it
// stands over Oriel's window, since there is no panel over another app.

import { createSignal, For, onMount, Show } from 'solid-js'
import type { OverlayLayer } from '../../shared/state'
import { cmd } from '../lib/store'

interface Row { space: string; name: string; icon: string; colour: number; digit: number | null }
interface Data { url: string; title: string; address: string; rows: Row[]; marked: number; site: string | null; alwaysShown: boolean; queued: number }

const colours = ['', '#4285F5', '#33A873', '#F59E33', '#E65466', '#9E66E6']

export function AskPanel(p: { layer: OverlayLayer }) {
  const data = () => (p.layer as { data?: Data }).data!
  const [marked, setMarked] = createSignal(data().marked)
  const [always, setAlways] = createSignal(false)
  let el!: HTMLDivElement
  const choose = (i: number) => { const r = data().rows[i]; if (r) void cmd({ do: 'link.choose', space: r.space, always: always() }) }
  const keys = (e: KeyboardEvent) => {
    const digit = /^(Digit|Numpad)(\d)$/.exec(e.code)
    if (digit) { const d = Number(digit[2]); const at = data().rows.findIndex(r => r.digit === d); if (at >= 0) { e.preventDefault(); choose(at) } return }
    if (e.key === 'Enter') { e.preventDefault(); choose(marked()) }
    else if (e.key === 'Escape') { e.preventDefault(); void cmd({ do: 'link.cancel' }) }
    else if (e.key === ' ' && data().alwaysShown) { e.preventDefault(); setAlways(!always()) }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setMarked(Math.min(data().rows.length - 1, marked() + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setMarked(Math.max(0, marked() - 1)) }
  }
  onMount(() => el.focus())
  return (
    <div class="ask-panel" ref={el} tabindex={-1} onKeyDown={keys} data-ask>
      <div class="ask-head">
        <div class="ask-title">{data().title}</div>
        <div class="ask-address">{data().address}</div>
      </div>
      <div class="ask-rows">
        <For each={data().rows}>
          {(r, i) => (
            <button class="ask-row" classList={{ marked: i() === marked() }} data-space={r.space} onClick={() => choose(i())} onMouseEnter={() => setMarked(i())}>
              <span class="ask-dot" style={{ background: r.colour ? `${colours[r.colour]}2e` : 'var(--wash)', color: r.colour ? colours[r.colour] : 'var(--muted)' }}>{r.name.slice(0, 1).toUpperCase()}</span>
              <span class="ask-name">{r.name}</span>
              <Show when={r.digit !== null}><span class="ask-digit">{r.digit}</span></Show>
            </button>
          )}
        </For>
      </div>
      <div class="ask-foot">
        <Show when={data().alwaysShown && data().site}>
          <label class="ask-always"><input type="checkbox" checked={always()} onChange={e => setAlways(e.currentTarget.checked)} /> Always open {data().site} links here</label>
        </Show>
        <div class="ask-keys">{data().alwaysShown ? '1 to 0 or Enter opens · Space: Always · Esc cancels' : '1 to 0 or Enter opens · Esc cancels'}</div>
      </div>
    </div>
  )
}

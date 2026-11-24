// Split View in the card's place: 2 to 4 pages side by side, each a card,
// with a 7 pt gutter and a divider between them (studio/01 §8.13, §8.14).
// The pages themselves are views laid over these panes by the main process.

import { createEffect, createMemo, createSignal, For, Show } from 'solid-js'
import type { SplitView } from '../../shared/state'
import { state, cmd } from '../lib/store'
import { Field } from '../field/Field'
import { outlet } from '../lib/registry'

/** PaneStage.gutter, .narrowest */
export const GUTTER = 7
export const NARROWEST = 250
/** The divider snaps to even within 15 and lets go beyond 20 (PaneStage.snap/unsnap). */
const SNAP = 15
const UNSNAP = 20

/** PaneStage.widths: the pages' widths for a space, or null when they don't
 * all fit (then the focused page shows alone). */
export function widths(space: number, sizes: number[]): number[] | null {
  const n = sizes.length
  const room = space - (n - 1) * GUTTER
  if (room < n * NARROWEST) return null
  const total = sizes.reduce((a, b) => a + b, 0) || 1
  let w = sizes.map(s => (s / total) * room)
  if (n === 2) {
    const a = Math.min(Math.max(w[0], NARROWEST), room - NARROWEST)
    return [a, room - a]
  }
  const need = w.reduce((t, x) => t + Math.max(0, NARROWEST - x), 0)
  if (need > 0) {
    const spare = w.reduce((t, x) => t + Math.max(0, x - NARROWEST), 0)
    w = w.map(x => (x < NARROWEST ? NARROWEST : x - ((x - NARROWEST) / spare) * need))
  }
  return w
}

export function Panes(p: { split: SplitView; width: number; onLaid: () => void }) {
  const [live, setLive] = createSignal<number[] | null>(null)
  const [held, setHeld] = createSignal(-1)
  const tab = (id: string) => state.tabs.find(t => t.id === id)
  const sizes = () => live() ?? p.split.sizes
  const laid = createMemo(() => {
    const w = widths(p.width, sizes())
    if (!w) {
      // Too narrow for all: the page with the keys alone, at full width.
      const focused = p.split.tabs.includes(state.activeID ?? '') ? state.activeID : p.split.focused ?? p.split.tabs[0]
      return p.split.tabs.map(id => (id === focused ? { left: 0, width: p.width } : null))
    }
    let x = 0
    return w.map(width => { const r = { left: x, width }; x += width + GUTTER; return r })
  })

  // The pages follow the panes at once, while the divider is held too.
  createEffect(() => { void laid().map(r => r && `${r.left},${r.width}`).join(); p.onLaid() })

  const startDivider = (k: number, e: PointerEvent) => {
    if (e.button !== 0) return
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)
    const start = laid().map(r => r?.width ?? 0)
    const total = start[k] + start[k + 1]
    const even = total / 2
    const x0 = e.clientX
    let snapped = Math.abs(start[k] - even) < 0.5
    setHeld(k)
    const move = (m: PointerEvent) => {
      let a = Math.min(Math.max(start[k] + m.clientX - x0, NARROWEST), total - NARROWEST)
      if (snapped) { if (Math.abs(a - even) > UNSNAP) snapped = false; else a = even }
      else if (Math.abs(a - even) < SNAP) { snapped = true; a = even }
      const w = [...start]
      w[k] = a
      w[k + 1] = total - a
      const room = w.reduce((t, x) => t + x, 0)
      setLive(w.map(x => x / room))
    }
    const up = () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      setHeld(-1)
      const next = live()
      // The split is told once, on release (PaneStage onCommit).
      if (next) void cmd({ do: 'split.resize', first: p.split.tabs[0], sizes: next }).finally(() => setLive(null))
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
  }

  /** Double click: the two pages beside the divider become even. */
  const evenOut = (k: number) => {
    const w = laid().map(r => r?.width ?? 0)
    const half = (w[k] + w[k + 1]) / 2
    w[k] = half
    w[k + 1] = half
    const room = w.reduce((t, x) => t + x, 0)
    void cmd({ do: 'split.resize', first: p.split.tabs[0], sizes: w.map(x => x / room) })
  }

  return (
    <>
      <For each={p.split.tabs}>{(id, i) => (
        <Show when={laid()[i()]}>{r => (
          <div class="pane" data-tab={id} classList={{ focused: id === state.activeID }}
            style={{ left: `${r().left}px`, width: `${r().width}px` }}>
            {/* An empty page in a split wears the blank tab's theme, as a lone
                empty tab does; the field (and Settings' door) only in the
                pane with the keys. */}
            <Show when={tab(id)?.empty}>
              <div class="empty-page">
                <For each={outlet('blank.under')}>{C => <C />}</For>
                <Show when={id === state.activeID}>
                  <Field place="page" />
                  <For each={outlet('blank.over')}>{C => <C />}</For>
                </Show>
              </div>
            </Show>
          </div>
        )}</Show>
      )}</For>
      <For each={p.split.tabs.slice(1)}>{(_, k) => (
        <Show when={laid()[k()] && laid()[k() + 1]}>
          <div class="divider" classList={{ held: held() === k() }} role="separator" aria-label="Divider between the pages"
            style={{ left: `${laid()[k()]!.left + laid()[k()]!.width}px` }}
            onPointerDown={e => startDivider(k(), e)} onDblClick={() => evenOut(k())}>
            <span class="pill" />
          </div>
        </Show>
      )}</For>
    </>
  )
}

// The page's address, always in sight (Settings › Appearance › Window ›
// Always show the address bar; studio/03 §1.6, studio/01 §4.3, §5.5;
// AddressLine.swift). A row as tall as a tab: at the top of the column, or
// before the tabs across the top (Small 220, Medium 340). The full address,
// cut in the middle, 12, grey; with nothing in the tab, what to type. A click
// brings ⌘L's field in the row itself, and its places hang under the row at
// its width (LineOffers, in the overlay). A click anywhere else puts it
// away, as Escape does. A site card's button would sit at its end; Oriel has
// no site card yet.

import { createEffect, createMemo, createSignal, on, onCleanup, onMount, Show } from 'solid-js'
import { state, cmd, activeTab } from '../lib/store'
import { Field, FieldList, listShown } from './Field'

const TIP = 'Type an address or a search   Ctrl+L'
const NOTHING = 'Search or enter address'

let ruler: CanvasRenderingContext2D | null = null
/** The width of `s` in the line's type: 12, the interface's face. */
function widthOf(s: string): number {
  ruler ??= document.createElement('canvas').getContext('2d')
  if (!ruler) return s.length * 6.5
  const face = getComputedStyle(document.documentElement).getPropertyValue('--font-ui').trim() || 'sans-serif'
  ruler.font = `12px ${face}`
  return ruler.measureText(s).width
}

/** `text` as one line of `room` px, the middle given up for an ellipsis, the
 * start and the end kept in equal parts (lineLimit(1), truncationMode(.middle)). */
export function middle(text: string, room: number): string {
  if (!text || room <= 0 || widthOf(text) <= room) return text
  const cut = (n: number) => text.slice(0, Math.ceil(n / 2)) + '…' + text.slice(text.length - Math.floor(n / 2))
  let lo = 0, hi = text.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (widthOf(cut(mid)) <= room) lo = mid; else hi = mid - 1
  }
  return cut(lo)
}

/** What the page's address says here: never the name and password in it. */
function shownAddress(url: string): string {
  try {
    const u = new URL(url)
    if (!u.username && !u.password) return url
    u.username = ''
    u.password = ''
    return u.href
  } catch { return url }
}

// The face may come after the first measure: measured again once it is in.
const [faces, setFaces] = createSignal(0)
if (typeof document !== 'undefined' && document.fonts) {
  void document.fonts.ready.then(() => setFaces(n => n + 1))
  document.fonts.addEventListener?.('loadingdone', () => setFaces(n => n + 1))
}

/** `width`: across the top, the row's own; in the column it fills its room.
 * `height`: a tab's, 28 or 36 roomy. */
export function AddressLine(p: { width?: number; height?: number }) {
  let el!: HTMLDivElement
  const [room, setRoom] = createSignal(0)
  const tab = activeTab
  const address = () => { const t = tab(); return t && !t.empty && t.url ? shownAddress(t.url) : '' }
  const shown = createMemo(() => { void faces(); return middle(address(), room()) })
  // The field is the line's when the main process says so, over a tab with a page.
  const editing = () => state.field.open && !!state.field.inline && !tab()?.empty

  const report = () => {
    const r = el.getBoundingClientRect()
    void cmd({ do: 'field.lineAnchor', rect: { x: r.x, y: r.y, width: r.width, height: r.height } })
  }

  onMount(() => {
    // The text has the row's width less its 10 at each end.
    const watch = new ResizeObserver(() => { setRoom(Math.max(0, el.clientWidth - 20)); if (editing()) report() })
    watch.observe(el)
    onCleanup(() => watch.disconnect())
  })
  // The room for the places to hang in, said as the field comes up.
  createEffect(on(editing, e => { if (e) queueMicrotask(report) }))
  // A press anywhere but the line puts the field away, as Escape does; the
  // press goes on to what it was for. Its places are another page's: a press
  // there is not heard here, and takes the keys, which the main process allows for.
  createEffect(() => {
    if (!editing()) return
    const down = (e: PointerEvent) => { if (!el.contains(e.target as Node)) void cmd({ do: 'field.close' }) }
    document.addEventListener('pointerdown', down, true)
    onCleanup(() => document.removeEventListener('pointerdown', down, true))
  })

  return (
    <div ref={el} class="address-line" classList={{ editing: editing(), empty: !address() }}
      style={{ height: p.height ? `${p.height}px` : undefined, width: p.width ? `${p.width}px` : undefined }}
      title={editing() ? undefined : TIP}
      onClick={() => { if (!editing()) void cmd({ do: 'field.line' }) }}
      onFocusOut={() => { if (editing()) void cmd({ do: 'field.lineBlur' }) }}>
      <Show when={editing()} fallback={
        <span class="address-text" aria-label={address() || NOTHING}>{address() ? shown() : NOTHING}</span>
      }>
        <Field place="line" />
      </Show>
    </div>
  )
}

/** The line's places, under its row at its width: the overlay's layer
 * (field.lineAnchor tells the main process where the row is, placeLine sizes
 * the overlay to the list). Clear room of 8 round the list for its shadow. */
export function LineOffers() {
  return (
    <div class="field-taboffers-room">
      <Show when={listShown()}><FieldList class="field-taboffers" /></Show>
    </div>
  )
}

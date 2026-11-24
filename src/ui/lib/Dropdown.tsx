// A choice from a list, drawn by Oriel instead of Windows' <select>: the
// button shows the value with a small double arrow, as the Mac's pop-up
// buttons in Search's Settings do (Settings.swift Picker .menu, studio/06
// §1.0); the list is the "rebuilt menu" of studio/02 §4.6 (SiteCard.swift
// MenuMetrics): rows 24, 5 above the first and under the last, corners 12,
// the highlight 5 in from the edge with corners of 7 (12 − 5, so the two
// curves are concentric; the Mac's 6 leaves a step), a hairline edge, the
// panels' soft shadow, a tick on the chosen one, separators 11 high.
// The highlight is the app's own grey (wash), never the system's blue.
// Opened, the chosen row lies over the button, as on the Mac, pulled back
// inside the page when it would leave it. Keys: arrows, Home, End, Enter,
// Space, Escape, Tab, and a few letters to jump to a row.
// Shared by every module (authorised exception to the folder rule).

import './dropdown.css'
import { createEffect, createSignal, For, on, onCleanup, Show, type JSX } from 'solid-js'
import { Portal } from 'solid-js/web'

export type DropdownOption<T> = [T, string] | { value: T; label: string; disabled?: boolean } | null

interface Row<T> { value: T; label: string; disabled: boolean }
const rowOf = <T,>(o: DropdownOption<T>): Row<T> | null =>
  o === null ? null : Array.isArray(o) ? { value: o[0], label: o[1], disabled: false } : { value: o.value, label: o.label, disabled: !!o.disabled }

export const DD = { ROW: 24, SEP: 11, PAD: 5, RADIUS: 12, INSET: 5, HIGHLIGHT: 7, TEXT: 22 } as const

let seq = 0

export function Dropdown<T extends string | number>(p: {
  options: DropdownOption<T>[]
  value: T
  set: (v: T) => void
  label?: string
  width?: number
  disabled?: boolean
  class?: string
  /** "small" for the 11.5 pills of plates (Bring Things Over). */
  size?: 'regular' | 'small'
}): JSX.Element {
  const id = `dd-${++seq}`
  let button!: HTMLButtonElement
  let list: HTMLDivElement | undefined
  const [open, setOpen] = createSignal(false)
  const [leaving, setLeaving] = createSignal(false)
  const [hot, setHot] = createSignal(-1)
  const [place, setPlace] = createSignal<{ x: number; y: number; w: number; maxH: number } | null>(null)
  const rows = () => p.options.map(rowOf)
  const chosen = () => rows().findIndex(r => r !== null && r.value === p.value)
  const shown = () => rows()[chosen()]?.label ?? ''
  const pickable = (i: number) => { const r = rows()[i]; return !!r && !r.disabled }

  const top = (i: number) => DD.PAD + rows().slice(0, i).reduce((h, r) => h + (r === null ? DD.SEP : DD.ROW), 0)
  const height = () => DD.PAD * 2 + rows().reduce((h, r) => h + (r === null ? DD.SEP : DD.ROW), 0)

  /** Where the list goes: its chosen row over the button, inside the page. */
  const measure = () => {
    const b = button.getBoundingClientRect()
    const room = { w: document.documentElement.clientWidth, h: document.documentElement.clientHeight }
    const margin = 8
    const w = Math.max(b.width + DD.INSET + DD.TEXT - 10 + 4, list?.offsetWidth ?? 0)
    const maxH = Math.min(height(), room.h - margin * 2)
    const at = Math.max(0, chosen())
    // The row's text lines up with the button's (the button's text is 10 in).
    let x = b.left - (DD.INSET + DD.TEXT - 10)
    let y = b.top + b.height / 2 - (top(at) + DD.ROW / 2)
    x = Math.min(Math.max(margin, x), room.w - margin - w)
    y = Math.min(Math.max(margin, y), room.h - margin - maxH)
    setPlace({ x, y, w, maxH })
  }

  let shut = 0
  /** When it opened: the release of the press that opened it doesn't pick
   * the row that came up under the pointer; a press, a drag, a release does. */
  let openedAt = 0
  const show = () => {
    // Shown, or going away: a key or a press brings it straight back.
    if (p.disabled || (open() && !leaving())) return
    openedAt = performance.now()
    clearTimeout(shut)
    setLeaving(false)
    setHot(chosen() >= 0 ? chosen() : rows().findIndex((_, i) => pickable(i)))
    setPlace(null)
    setOpen(true)
    requestAnimationFrame(() => { measure(); requestAnimationFrame(measure); scrollToHot() })
  }
  const hide = (refocus = true) => {
    if (!open() || leaving()) return
    setLeaving(true)
    clearTimeout(shut)
    shut = window.setTimeout(() => { setOpen(false); setLeaving(false) }, 140)
    if (refocus) button.focus({ preventScroll: true })
  }
  const choose = (i: number) => {
    const r = rows()[i]
    if (!r || r.disabled) return
    hide()
    if (r.value !== p.value) p.set(r.value)
  }
  const scrollToHot = () => list?.querySelector<HTMLElement>(`[data-index="${hot()}"]`)?.scrollIntoView({ block: 'nearest' })
  const step = (from: number, by: number) => {
    const n = rows().length
    for (let s = 1; s <= n; s++) { const i = from + by * s; if (i < 0 || i >= n) break; if (pickable(i)) return i }
    return from
  }

  /** n pickable rows on, or as far as there are. */
  const jump = (n: number) => { let at = hot(); for (let k = 0; k < Math.abs(n); k++) at = step(at, Math.sign(n)); return at }

  // A few letters typed quickly find the first row they begin.
  let typed = '', typedAt = 0
  const typeahead = (ch: string) => {
    const now = Date.now()
    typed = now - typedAt > 700 ? ch : typed + ch
    typedAt = now
    const n = rows().length
    const start = typed.length === 1 ? hot() + 1 : Math.max(0, hot())
    for (let s = 0; s < n; s++) {
      const i = (start + s) % n
      const r = rows()[i]
      if (r && !r.disabled && r.label.toLowerCase().startsWith(typed.toLowerCase())) return i
    }
    return -1
  }

  const onKey = (e: KeyboardEvent) => {
    if (!open() || leaving()) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); show() }
      return
    }
    const n = rows().length
    switch (e.key) {
      case 'ArrowDown': setHot(step(hot(), 1)); break
      case 'ArrowUp': setHot(step(hot() < 0 ? n : hot(), -1)); break
      case 'Home': setHot(step(-1, 1)); break
      case 'End': setHot(step(n, -1)); break
      case 'PageDown': setHot(jump(8)); break
      case 'PageUp': setHot(jump(-8)); break
      case 'Enter': case ' ': if (hot() >= 0) choose(hot()); break
      case 'Escape': hide(); break
      case 'Tab': hide(false); return
      default:
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { const i = typeahead(e.key); if (i >= 0) setHot(i); break }
        return
    }
    e.preventDefault()
    e.stopPropagation()
    scrollToHot()
  }

  // Outside the list: a press anywhere else, the page scrolling or resizing,
  // the window losing focus, all put it away.
  createEffect(on(open, isOpen => {
    if (!isOpen) return
    const down = (e: PointerEvent) => { const t = e.target as Node; if (!list?.contains(t) && !button.contains(t)) hide(false) }
    const away = (e: Event) => { if (e.target instanceof Node && list?.contains(e.target)) return; hide(false) }
    const blur = () => hide(false)
    const keys = (e: KeyboardEvent) => { if (!leaving()) onKey(e) }
    document.addEventListener('pointerdown', down, true)
    window.addEventListener('scroll', away, true)
    window.addEventListener('resize', blur)
    window.addEventListener('blur', blur)
    window.addEventListener('keydown', keys, true)
    onCleanup(() => {
      document.removeEventListener('pointerdown', down, true)
      window.removeEventListener('scroll', away, true)
      window.removeEventListener('resize', blur)
      window.removeEventListener('blur', blur)
      window.removeEventListener('keydown', keys, true)
    })
  }))
  onCleanup(() => clearTimeout(shut))

  return (
    <>
      <button ref={button} type="button" class={`dd-button ${p.class ?? ''}`} classList={{ open: open() && !leaving(), small: p.size === 'small' }}
        role="combobox" aria-haspopup="listbox" aria-expanded={open()} aria-controls={id} aria-label={p.label}
        aria-activedescendant={open() && hot() >= 0 ? `${id}-${hot()}` : undefined}
        disabled={p.disabled} style={p.width ? { width: `${p.width}px` } : undefined}
        onPointerDown={e => { if (e.button === 0) { e.preventDefault(); button.focus({ preventScroll: true }); open() && !leaving() ? hide() : show() } }}
        onKeyDown={e => { if (!open() || leaving()) onKey(e) }}>
        <span class="dd-value">{shown()}</span>
        <svg class="dd-arrows" width="8" height="12" viewBox="0 0 8 12" aria-hidden="true">
          <path d="M1.6 4.6 4 2.2l2.4 2.4M1.6 7.4 4 9.8l2.4-2.4" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
      <Show when={open()}>
        <Portal>
          <div ref={list} id={id} class="dd-list" classList={{ placed: !!place(), leaving: leaving(), small: p.size === 'small' }} role="listbox" aria-label={p.label}
            style={place() ? { left: `${place()!.x}px`, top: `${place()!.y}px`, 'min-width': `${place()!.w}px`, 'max-height': `${place()!.maxH}px` } : { left: '-9999px', top: '0px' }}
            onPointerLeave={() => setHot(-1)}>
            <For each={rows()}>{(r, i) => (
              <Show when={r} fallback={<div class="dd-sep" role="separator" />}>
                <div id={`${id}-${i()}`} class="dd-row" data-index={i()} role="option" aria-selected={i() === chosen()} aria-disabled={r!.disabled}
                  classList={{ hot: hot() === i() && !r!.disabled, chosen: i() === chosen(), off: r!.disabled }}
                  onPointerMove={() => { if (!r!.disabled && hot() !== i()) setHot(i()) }}
                  onPointerUp={e => { if (e.button === 0 && performance.now() - openedAt > 300) choose(i()) }}>
                  <Show when={i() === chosen()}>
                    <svg class="dd-tick" width="10" height="10" viewBox="0 0 16 16" aria-hidden="true">
                      <path d="m2.6 8.6 3.4 3.6 7.4-8.6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
                    </svg>
                  </Show>
                  <span class="dd-label">{r!.label}</span>
                </div>
              </Show>
            )}</For>
          </div>
        </Portal>
      </Show>
    </>
  )
}

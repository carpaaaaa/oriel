// A menu of actions from a button or a right click, in an Oriel page: the
// Mac's SwiftUI Menu and contextMenu (an extension's "…", a shortcut's Clear
// and Reset), drawn as the app's own pop-up list (lib/Dropdown.tsx, its
// dd-list look: rows 24, corners 12, the grey highlight, ticks), never
// Windows' menu. Keys: arrows, Home, End, Enter, Space, Escape, Tab.

import '../lib/dropdown.css'
import { createEffect, createSignal, For, on, onCleanup, Show, type JSX } from 'solid-js'
import { Portal } from 'solid-js/web'

export interface PopItem { label: string; act: () => void; checked?: boolean; disabled?: boolean; red?: boolean }

let seq = 0

export function PopMenu(p: {
  items: () => (PopItem | null)[]
  /** What the button says to a screen reader. */
  label: string
  face?: JSX.Element
  class?: string
  title?: string
  /** Hands over a way to open it at a point (a right click elsewhere). */
  opener?: (open: (at: { x: number; y: number }) => void) => void
}): JSX.Element {
  const id = `pm-${++seq}`
  let button: HTMLButtonElement | undefined
  let list: HTMLDivElement | undefined
  const [open, setOpen] = createSignal(false)
  const [leaving, setLeaving] = createSignal(false)
  const [hot, setHot] = createSignal(-1)
  const [at, setAt] = createSignal<{ x: number; y: number; right?: boolean } | null>(null)
  const [place, setPlace] = createSignal<{ x: number; y: number } | null>(null)
  const rows = () => (open() ? p.items() : [])
  const pickable = (i: number) => { const r = rows()[i]; return !!r && !r.disabled }

  const measure = () => {
    const a = at()
    if (!a || !list) return
    const room = { w: document.documentElement.clientWidth, h: document.documentElement.clientHeight }
    const w = list.offsetWidth, h = list.offsetHeight, margin = 8
    let x = a.right ? a.x - w : a.x
    let y = a.y
    if (y + h > room.h - margin) y = Math.max(margin, a.right && button ? button.getBoundingClientRect().top - 4 - h : room.h - margin - h)
    x = Math.min(Math.max(margin, x), room.w - margin - w)
    setPlace({ x, y })
  }

  let shut = 0
  /** When it opened, and the row a press began on: a press on the button,
   * dragged and let go of on a row, picks it; a click picks the row clicked. */
  let openedAt = 0
  let pressed = -1
  const show = (point?: { x: number; y: number }) => {
    if (open() && !leaving()) return
    clearTimeout(shut)
    openedAt = performance.now()
    pressed = -1
    setLeaving(false)
    if (point) setAt(point)
    else if (button) { const b = button.getBoundingClientRect(); setAt({ x: b.right, y: b.bottom + 4, right: true }) }
    setPlace(null)
    setOpen(true)
    setHot(-1)
    requestAnimationFrame(() => { measure(); requestAnimationFrame(measure) })
  }
  const hide = (refocus = true) => {
    if (!open() || leaving()) return
    setLeaving(true)
    clearTimeout(shut)
    shut = window.setTimeout(() => { setOpen(false); setLeaving(false) }, 140)
    if (refocus) button?.focus({ preventScroll: true })
  }
  const choose = (i: number) => {
    const r = rows()[i]
    if (!r || r.disabled || leaving()) return
    hide()
    r.act()
  }
  p.opener?.(point => show(point))

  const step = (from: number, by: number) => {
    const n = rows().length
    for (let s = 1; s <= n; s++) { const i = from + by * s; if (i < 0 || i >= n) break; if (pickable(i)) return i }
    return from
  }
  const onKey = (e: KeyboardEvent) => {
    const n = rows().length
    switch (e.key) {
      case 'ArrowDown': setHot(step(hot(), 1)); break
      case 'ArrowUp': setHot(step(hot() < 0 ? n : hot(), -1)); break
      case 'Home': setHot(step(-1, 1)); break
      case 'End': setHot(step(n, -1)); break
      case 'Enter': case ' ': if (hot() >= 0) choose(hot()); break
      case 'Escape': hide(); break
      case 'Tab': hide(false); return
      default: return
    }
    e.preventDefault()
    e.stopPropagation()
  }

  createEffect(on(open, isOpen => {
    if (!isOpen) return
    const down = (e: PointerEvent) => { const t = e.target as Node; if (!list?.contains(t) && !button?.contains(t)) hide(false) }
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
      <Show when={p.face}>
        <button ref={button} type="button" class={p.class} classList={{ open: open() && !leaving() }} title={p.title}
          aria-label={p.label} aria-haspopup="menu" aria-expanded={open()} aria-controls={id}
          onPointerDown={e => { if (e.button === 0) { e.preventDefault(); button?.focus({ preventScroll: true }); open() && !leaving() ? hide() : show() } }}
          onKeyDown={e => { if (!open() && ['ArrowDown', 'Enter', ' '].includes(e.key)) { e.preventDefault(); show(); setHot(step(-1, 1)) } }}>
          {p.face}
        </button>
      </Show>
      <Show when={open()}>
        <Portal>
          <div ref={list} id={id} class="dd-list popmenu" classList={{ placed: !!place(), leaving: leaving() }} role="menu" aria-label={p.label}
            style={place() ? { left: `${place()!.x}px`, top: `${place()!.y}px` } : { left: '-9999px', top: '0px' }}
            onPointerLeave={() => setHot(-1)} onContextMenu={e => e.preventDefault()}>
            <For each={rows()}>{(r, i) => (
              <Show when={r} fallback={<div class="dd-sep" role="separator" />}>
                <div class="dd-row" role={r!.checked !== undefined ? 'menuitemcheckbox' : 'menuitem'} aria-checked={r!.checked} aria-disabled={r!.disabled}
                  classList={{ hot: hot() === i() && !r!.disabled, off: r!.disabled, 'popmenu-red': r!.red }}
                  onPointerMove={() => { if (!r!.disabled && hot() !== i()) setHot(i()) }}
                  onPointerDown={() => (pressed = i())}
                  onPointerUp={e => { if (e.button === 0 && pressed !== i() && performance.now() - openedAt > 300) choose(i()) }}
                  onClick={() => choose(i())}>
                  <Show when={r!.checked}>
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

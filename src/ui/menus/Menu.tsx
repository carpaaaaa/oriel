// A menu as macOS lays one out (SiteCard.swift `MenuMetrics`, studio/02
// §4.6): items 24 high, separators 11 with the rule 16 in from each side,
// 5 above the first item and under the last, the highlight 5 in from the
// edge with a radius of 6, text 17 from the edge and 17 after it, corners
// of 12, a 0.5 edge. Submenus open on hover or →; the keys walk it.

import './menus.css'
import { createEffect, createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import type { Entry } from './bridge'
import { G, Glyph } from '../sidebar/glyphs'

export const ROW = 24, SEP = 11, PAD = 5

export function heightOf(entries: Entry[]): number {
  return PAD * 2 + entries.reduce((h, e) => h + (e.separator ? SEP : e.header ? 20 : ROW), 0)
}

const pickable = (e: Entry) => !e.separator && !e.header && e.enabled !== false && (!!e.act || !!e.submenu)

export function Menu(p: {
  entries: Entry[]
  at: { x: number; y: number }
  /** The parent row's right and left edges, for a submenu to hang beside. */
  beside?: { left: number; right: number }
  room: { w: number; h: number }
  pick: (e: Entry) => void
  close: (all: boolean) => void
  depth?: number
  keys?: boolean
  /** The least room kept from the view's left and top edges (4): more where
   * the view isn't the whole window, so the shadow isn't cut. */
  edge?: number
}) {
  let el!: HTMLDivElement
  const [hot, setHot] = createSignal(-1)
  const [open, setOpen] = createSignal<{ index: number; top: number; left: number; right: number } | null>(null)
  const [pos, setPos] = createSignal({ x: p.at.x, y: p.at.y })
  const [keysHere, setKeysHere] = createSignal(p.keys ?? true)
  let timer = 0

  const icons = () => p.entries.some(e => e.glyph)
  const checks = () => p.entries.some(e => e.checked !== undefined && !e.glyph)

  onMount(() => {
    // Inside the window: flipped left of the pointer or of the parent row,
    // pulled up from the bottom.
    const w = el.offsetWidth, h = el.offsetHeight
    let x = p.at.x, y = p.at.y
    const edge = p.edge ?? 4
    if (p.beside) {
      x = p.beside.right - 4
      if (x + w > p.room.w - 4) x = Math.max(edge, p.beside.left - w + 4)
      y = p.at.y - PAD
    } else if (x + w > p.room.w - 4) x = Math.max(edge, x - w)
    if (y + h > p.room.h - 4) y = Math.max(edge, p.room.h - 4 - h)
    setPos({ x, y })
  })
  onCleanup(() => clearTimeout(timer))

  const rowTop = (i: number) => PAD + p.entries.slice(0, i).reduce((h, e) => h + (e.separator ? SEP : e.header ? 20 : ROW), 0)

  const openSub = (i: number) => {
    const e = p.entries[i]
    if (!e?.submenu || e.enabled === false) { setOpen(null); return }
    const r = el.getBoundingClientRect()
    setOpen({ index: i, top: r.top + rowTop(i), left: r.left, right: r.right })
  }

  const hover = (i: number) => {
    setHot(pickable(p.entries[i]) ? i : -1)
    setKeysHere(true)
    clearTimeout(timer)
    if (p.entries[i]?.submenu) timer = window.setTimeout(() => openSub(i), 180)
    else timer = window.setTimeout(() => setOpen(null), 180)
  }

  const choose = (i: number) => {
    const e = p.entries[i]
    if (!e || !pickable(e)) return
    if (e.submenu) { openSub(i); return }
    p.pick(e)
  }

  // The keys, for the deepest menu open.
  const onKey = (k: KeyboardEvent) => {
    if (open() || !keysHere()) return
    const n = p.entries.length
    const stepTo = (from: number, by: number) => {
      for (let s = 1; s <= n; s++) { const i = (from + by * s + n * 2) % n; if (pickable(p.entries[i])) return i }
      return -1
    }
    if (k.key === 'ArrowDown') { setHot(stepTo(hot() < 0 ? -1 : hot(), 1)); k.preventDefault() }
    else if (k.key === 'ArrowUp') { setHot(stepTo(hot() < 0 ? n : hot(), -1)); k.preventDefault() }
    else if (k.key === 'ArrowRight' && hot() >= 0 && p.entries[hot()].submenu) { openSub(hot()); k.preventDefault() }
    else if (k.key === 'ArrowLeft' && (p.depth ?? 0) > 0) { p.close(false); k.preventDefault() }
    else if (k.key === 'Enter' || k.key === ' ') { if (hot() >= 0) choose(hot()); k.preventDefault() }
    else if (k.key === 'Escape') { p.close((p.depth ?? 0) === 0); k.preventDefault() }
  }
  createEffect(() => {
    if (!p.keys && (p.depth ?? 0) > 0) return
    window.addEventListener('keydown', onKey)
    onCleanup(() => window.removeEventListener('keydown', onKey))
  })

  return (
    <>
      <div ref={el} class="menu" classList={{ 'with-icons': icons(), 'with-checks': checks() }} role="menu"
        style={{ left: `${pos().x}px`, top: `${pos().y}px` }}
        onPointerLeave={() => { if (!open()) setHot(-1) }}>
        <For each={p.entries}>{(e, i) => (
          <Show when={!e.separator} fallback={<div class="menu-sep" />}>
            <Show when={!e.header} fallback={<div class="menu-header">{e.label}</div>}>
              <div class="menu-item" role="menuitem" data-label={e.label}
                classList={{ hot: hot() === i() || open()?.index === i(), off: e.enabled === false }}
                aria-disabled={e.enabled === false}
                onPointerEnter={() => hover(i())}
                onPointerUp={ev => { if (ev.button === 0 || ev.button === 2) choose(i()) }}>
                <Show when={e.checked}><G.checkmark pt={11} weight="semibold" class="menu-check" /></Show>
                <Show when={e.glyph}>
                  <span class="menu-glyph" style={{ color: e.tint ?? undefined }}><Glyph name={e.glyph!} pt={12.5} weight="regular" /></span>
                </Show>
                <span class="menu-label">{e.label}</span>
                <Show when={e.accel}><span class="menu-accel">{e.accel}</span></Show>
                <Show when={e.submenu}><G.chevronRight pt={10} weight="semibold" class="menu-more" /></Show>
              </div>
            </Show>
          </Show>
        )}</For>
      </div>
      <Show when={open()}>{o => (
        <Menu entries={p.entries[o().index].submenu!} at={{ x: o().right, y: o().top }} beside={{ left: o().left, right: o().right }}
          room={p.room} pick={p.pick} depth={(p.depth ?? 0) + 1} keys edge={p.edge}
          close={all => { if (all) p.close(true); else { setOpen(null); setKeysHere(true) } }} />
      )}</Show>
    </>
  )
}

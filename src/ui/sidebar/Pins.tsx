// The pinned squares at the top of the column (Side.swift `PinSquare`
// 1868-2010, studio/01 §5.20, §6.2): at most four a row, never over 34
// high, 4 apart; inside, everything scales off the shorter edge: radius
// 9/34, letter 12/34 medium, icon 16/34, ring 11/34. Resting on `tile`,
// live on `pinLive`, darker than a live row's grey.

import { createEffect, createMemo, For, on, onMount, Show, untrack } from 'solid-js'
import { state, cmd } from '../lib/store'
import type { TabView } from '../../shared/state'
import { Ring } from './glyphs'
import { P, label, picked, pickedAmongOthers, pinOf, monogram, pref } from './derive'
import { pinCells } from './layout'
import { Mark, RenameField } from './Row'
import { editing, setEditing, carry, squareGhost } from './ui'
import { openMenu } from '../menus/open'
import { tabMenu } from '../menus/build'
import { press } from './drag'
import { arrive, leave, stay, keepLeaving, quietOn } from './motion'

/** A page's unread count as a pin shows it, read off the front of its title
 * ("(3) WhatsApp", "(12+) …"); nothing while it sleeps (UnreadBadge.swift). */
export function unread(t: { title?: string; asleep?: boolean }): string | null {
  if (t.asleep) return null
  const m = /^\(\s*(\d{1,5})(\+?)\s*\)/.exec((t.title ?? '').trim())
  if (!m) return null
  const n = Number(m[1])
  if (!n) return null
  return n > 99 ? '99+' : m[2] ? `${n}+` : `${n}`
}

export function PinGrid(p: { squares: TabView[]; width: number; still: boolean; glidingTo: string | null }) {
  // With a tab carried over the grid, one cell more, the one it takes left open.
  const ghost = () => squareGhost()
  const order = createMemo(() => {
    const g = ghost()
    const ids = p.squares.map(t => t.id)
    const c = carry()
    if (!g) return ids
    const rest = ids.filter(id => id !== g.tab)
    const placed = [...rest]
    placed.splice(Math.min(g.index, placed.length), 0, g.tab)
    return c && !ids.includes(g.tab) ? placed : placed
  })
  const cells = () => pinCells(order().length, p.width)
  const height = () => { const c = cells(); return c.length ? Math.max(...c.map(x => x.y + x.h)) : 0 }
  // A square going stays in its cell, the same element, scaling to 0.8 as
  // it fades (Side.swift:2008); the grid's height follows on settle
  // (Side.swift:426), the rows under it with it.
  const roster = keepLeaving(() => p.squares, t => t.id, quietOn(() => p.still))
  const lastCell = new Map<string, { x: number; y: number; w: number; h: number }>()
  const cellOf = (id: string) => {
    const i = order().indexOf(id)
    const c = i >= 0 ? cells()[i] : undefined
    if (c) lastCell.set(id, c)
    return c ?? lastCell.get(id)
  }
  const ghostTab = () => { const g = ghost(); return g && !p.squares.some(t => t.id === g.tab) ? state.tabs.find(t => t.id === g.tab) : undefined }
  return (
    <div class="pins" style={{ height: `${height()}px`, 'margin-bottom': height() ? '10px' : '0' }} classList={{ still: p.still }}>
      <For each={roster.keys()}>{k => (
        <Show when={roster.item(k)}>{t => <Square tab={t()} cell={cellOf(k) ?? cells()[0]} still={p.still} gliding={p.glidingTo === k}
          fresh={roster.fresh(k)} leaving={roster.leaving(k)} done={() => { lastCell.delete(k); roster.done(k) }} />}</Show>
      )}</For>
      <Show when={ghostTab()}>{t => {
        const c = () => cellOf(t().id)
        return (
          <Show when={c()}>
            <div class="pin-ghost" style={{ transform: `translate(${c()!.x}px, ${c()!.y}px)`, width: `${c()!.w}px`, height: `${c()!.h}px`, 'border-radius': `${Math.min(c()!.w, c()!.h) * 9 / 34}px` }}>
              <Mark tab={{ ...t(), label: label(t()) }} size={Math.min(c()!.w, c()!.h) * 16 / 34} />
            </div>
          </Show>
        )
      }}</Show>
    </div>
  )
}

function Square(p: { tab: TabView; cell: { x: number; y: number; w: number; h: number }; still: boolean; gliding: boolean; fresh?: boolean; leaving?: boolean; done?: () => void }) {
  let el!: HTMLDivElement
  const t = () => p.tab
  const live = () => t().id === state.activeID
  const scale = () => Math.min(p.cell.w, p.cell.h)
  const pin = () => pinOf(t())
  const lettering = () => editing()?.kind === 'letter' && editing()?.id === t().id
  const carried = () => carry()?.key === `t:${t().id}`
  onMount(() => { if (p.fresh && !untrack(() => !!carry())) arrive(el, 0.8, 'center') })
  createEffect(on(() => !!p.leaving, (l, was) => { if (l === !!was) return; if (l) leave(el, 0.8, () => p.done?.(), 'center'); else stay(el) }))
  const letter = () => pin()?.letter || monogram({ ...t(), label: label(t()) })
  let wasLive = false

  const pos = () => {
    const c = carry()
    if (carried() && c) return `${c.x}px ${c.y}px`
    return `${p.cell.x}px ${p.cell.y}px`
  }

  return (
    <div ref={el} class="square" data-tab={p.leaving ? undefined : t().id} data-pin={t().pinID}
      classList={{ live: live(), picked: picked(t().id), asleep: t().asleep, carried: carried(), faded: carried() && !!carry()?.faded, gliding: p.gliding, leaving: !!p.leaving }}
      // `translate`, so the scale of coming and going stays in its cell.
      style={{ translate: pos(), width: `${p.cell.w}px`, height: `${p.cell.h}px`, '--r': `${scale() * 9 / 34}px` }}
      title={label(t())}
      onPointerDown={e => {
        if (e.button !== 0 || lettering()) return
        wasLive = live()
        const mods = e.ctrlKey || e.shiftKey || e.altKey || (window.search.platform === 'darwin' && e.metaKey)
        if (!mods && !live() && !pickedAmongOthers(t().id)) {
          if ((state.picked ?? []).length) void cmd({ do: 'tab.pick', id: t().id, mode: 'clear' })
          void cmd({ do: 'tab.select', id: t().id })
        }
        press(e, { key: `t:${t().id}`, kind: 'square', tab: t().id, el })
      }}
      onClick={e => {
        const ctrl = e.ctrlKey || (window.search.platform === 'darwin' && e.metaKey)
        // A pin's Ctrl-click: a new tab with ⌘-click on a pin opens a new tab, picked otherwise (§6.13).
        if (ctrl && !e.shiftKey) void cmd({ do: 'pin.commandClick', id: t().id })
        else if (ctrl || e.shiftKey) void cmd({ do: 'tab.pick', id: t().id, mode: ctrl && e.shiftKey ? 'addRange' : ctrl ? 'toggle' : 'range' })
        else if (pickedAmongOthers(t().id)) { void cmd({ do: 'tab.pick', id: t().id, mode: 'clear' }); void cmd({ do: 'tab.select', id: t().id }) }
      }}
      // The live pin's double click: home, or at home its letter (§6.9).
      onDblClick={async () => {
        if (!wasLive || !pin()) return
        const r = await cmd({ do: 'pin.home', id: pin()!.id })
        if (r === 'home') setEditing({ kind: 'letter', id: t().id })
      }}
      onAuxClick={e => { if (e.button === 1) { e.preventDefault(); void cmd({ do: 'tab.close', id: t().id }) } }}
      onMouseDown={e => { if (e.button === 1) e.preventDefault() }}
      onContextMenu={e => { e.preventDefault(); e.stopPropagation(); openMenu(tabMenu(t()), { x: e.clientX, y: e.clientY }, `tab:${t().id}`) }}>
      <div class="ground" />
      <div class="glyph" style={{ width: `${scale() * 16 / 34}px`, height: `${scale() * 16 / 34}px` }}>
        <Show when={!lettering()} fallback={
          <RenameField letter initial={letter()} class="letter-field"
            done={v => { if (v && pin()) void cmd({ do: 'pin.letter', id: pin()!.id, letter: v }); setEditing(null) }} />
        }>
          <Show when={!state.tabHints?.[t().id]} fallback={<span class="hint-number">{state.tabHints![t().id]}</span>}>
          <Show when={!t().loading} fallback={<Ring size={scale() * 11 / 34} />}>
            <Show when={P.icons() && t().favicon} fallback={
              <span class="pin-letter" style={{ 'font-size': `${+(scale() * 12 / 34).toFixed(2)}px` }}>{letter()}</span>
            }>
              <Mark tab={{ ...t(), label: label(t()) }} size={scale() * 16 / 34} dim={t().asleep} icon />
            </Show>
          </Show>
          </Show>
        </Show>
        {/* What its page counts as waiting, from its title (UnreadBadge.swift) */}
        <Show when={pref('tabs.pinCounts', true) && !lettering() && !state.tabHints?.[t().id] && unread(t())}>{c => (
          <span class="unread" style={{ 'font-size': `${Math.max(7, scale() * 16 / 34 * 0.45).toFixed(2)}px` }}>{c()}</span>
        )}</Show>
      </div>
    </div>
  )
}

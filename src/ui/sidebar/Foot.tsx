// The column's foot (Side.swift `SideFoot` 1679-1793, studio/01 §5.9,
// §7.11, §7.13): doors of 26, 2 apart, 10 in from the sides and above the
// bottom. The space's icon first (Spaces.swift `SpaceDot`): its symbol in
// the space's colour on a wash of 14% (24% under the pointer), radius 8;
// turning over the way the spaces went, and the space's name over it for
// 1.4 s after a switch. Or a button per space, centred.

import { createEffect, createSignal, For, on, onCleanup, Show } from 'solid-js'
import { Dynamic } from 'solid-js/web'
import { state, cmd } from '../lib/store'
import { outlet } from '../lib/registry'
import { Glyph } from './glyphs'
import { P, pref, spaceSymbol, currentSpace } from './derive'
import { tint, tintAlpha } from './look'
import { openMenu } from '../menus/open'
import { spaceMenu } from '../menus/build'
import { reducedMotion } from './motion'

/** The doors that always show, each 26 and 2 apart (Side.swift keptWidth,
 * 1768-1777): downloads counted whether running or not, so one starting
 * doesn't send them down; the puzzle (with extensions), the bookmark button,
 * the space's icon or a button per space. Pinned extensions aren't: up in
 * the band they give way, from the last, to what fits (upRoom). */
export function footDoors(): number {
  const ext = (state.ext?.list.length ?? 0) > 0
  return 1 + (ext && !state.prefs?.['foot.extensions.hidden'] ? 1 : 0) + (state.prefs?.['foot.bookmarks.hidden'] ? 0 : 1)
    + (P.spaces() && !P.spaceButtons() ? 1 : 0) + (P.spaceButtons() ? state.spaces.length : 0)
}

/** On the right, the window's buttons are at the band's far end on Windows:
 * the doors stop short of them (studio/01 §5.8 point 6). */
export const capRoom = () => (state.chrome === 'windows' && state.sidebar.side === 'right' ? state.controlsWidth : 0)

/** What the band has right of back, forward and reload (Side.swift beyondHelm):
 * the column less its margins, the helm, the sidebar button, 12 of air, and
 * on the right the window's buttons. */
export function beyondHelm(): number {
  const helm = ['back', 'forward', 'reload'].filter(d => !pref(`helm.${d}.hidden`, false)).length
  return state.sidebar.width - 20 - (helm * 26 + Math.max(0, helm - 1) * 4) - (P.foldButton() ? 30 : 0) - 12 - capRoom()
}

/** Buttons at the top (sidebar.doorsUp; Side.swift:196-203): up only if the
 * doors that always show fit beside the helm; never with icons only. */
export function doorsUp(): boolean {
  return pref('sidebar.doorsUp', false) && state.sidebar.layout !== 'top' && !P.iconColumn() && footDoors() * 28 - 2 <= beyondHelm()
}

/** How many pinned extensions fit up in the band beside the doors that stay
 * (SideFoot.room, up). */
export function upRoom(): number {
  return Math.max(0, Math.floor((beyondHelm() + 2 - footDoors() * 28) / 28))
}

export function Foot(p: { vertical?: boolean; up?: boolean }) {
  return (
    <div class="foot" classList={{ vertical: !!p.vertical, centred: P.spaceButtons() && !p.up, up: !!p.up }}>
      <Show when={P.spaces() && !P.spaceButtons()}><SpaceDot /></Show>
      <For each={outlet('sidebar.foot')}>{c => <Dynamic component={c} />}</For>
      <Show when={P.spaceButtons()}><SpaceButtons vertical={p.vertical} /></Show>
    </div>
  )
}

/** Which way the spaces went last: +1 to a later one, −1 back. */
const [step, setStep] = createSignal(1)
let lastSpace = ''
export function spaceStep() { return step() }

export function SpaceDot() {
  const [shown, setShown] = createSignal<{ key: string; symbol: string }[]>([])
  const [named, setNamed] = createSignal<string | null>(null)
  let el!: HTMLButtonElement
  let naming = 0
  const space = () => currentSpace()

  createEffect(on(() => state.space, (now, was) => {
    const order = state.spaces.map(s => s.id)
    if (was && now) setStep(order.indexOf(now) >= order.indexOf(was) ? 1 : -1)
    lastSpace = now
    const s = space()
    if (!s) return
    const next = { key: `${s.id}-${spaceSymbol(s)}`, symbol: spaceSymbol(s) }
    const before = shown()
    if (!was || !before.length || reducedMotion()) { setShown([next]); return }
    // The icon turns over: out one side, the next in from the other (.push, easeOut 0.22).
    setShown([before[before.length - 1], next])
    requestAnimationFrame(() => {
      const nodes = el?.querySelectorAll<HTMLElement>('.dot-symbol')
      if (!nodes || nodes.length < 2) { setShown([next]); return }
      const d = step() > 0 ? 1 : -1
      const opts = { duration: 220, easing: 'cubic-bezier(0,0,.58,1)', fill: 'forwards' as const }
      nodes[0].animate([{ transform: 'translateX(0)', opacity: 1 }, { transform: `translateX(${-26 * d}px)`, opacity: 0 }], opts)
      const a = nodes[1].animate([{ transform: `translateX(${26 * d}px)`, opacity: 0 }, { transform: 'translateX(0)', opacity: 1 }], opts)
      a.onfinish = () => setShown([next])
    })
    // Its name, over it, for 1.4 s.
    const turn = ++naming
    setNamed(s.name)
    setTimeout(() => { if (turn === naming) setNamed(null) }, 1400)
  }))
  createEffect(on(() => space() && spaceSymbol(space()!), () => {
    const s = space()
    if (s && shown().length === 1 && shown()[0].symbol !== spaceSymbol(s)) setShown([{ key: `${s.id}-${spaceSymbol(s)}`, symbol: spaceSymbol(s) }])
  }))
  onCleanup(() => { naming++ })

  return (
    <button ref={el} class="space-dot door" data-space={state.space}
      style={{ '--tint': tint(space()) ?? '', '--tint-wash': tintAlpha(space(), 0.14) ?? '', '--tint-hover': tintAlpha(space(), 0.24) ?? '' }}
      classList={{ tinted: !!tint(space()) }}
      title={`${space()?.name ?? ''}: Alt+1 to Alt+9, or two fingers sideways over the tabs, to switch`}
      onClick={e => openMenu(spaceMenu(), { x: e.clientX, y: e.clientY }, 'space')}
      onContextMenu={e => { e.preventDefault(); e.stopPropagation(); openMenu(spaceMenu(), { x: e.clientX, y: e.clientY }, 'space') }}>
      <span class="dot-clip">
        <For each={shown()}>{s => <span class="dot-symbol"><Glyph name={s.symbol} pt={12} weight="medium" /></span>}</For>
      </span>
      <Show when={named()}>{n => <span class="space-name">{n()}</span>}</Show>
    </button>
  )
}

export function SpaceButtons(p: { vertical?: boolean }) {
  return (
    <div class="space-buttons" classList={{ vertical: !!p.vertical }}>
      <For each={state.spaces}>{(s, i) => {
        const current = () => s.id === state.space
        return (
          <button class="space-button door" classList={{ current: current() }}
            style={{ '--tint': tint(s) ?? '', '--tint-wash': tintAlpha(s, 0.18) ?? '' }}
            title={`${s.name}${i() < 9 ? `   Alt+${i() + 1}` : ''}${current() ? ', click for the space’s menu' : ''}`}
            onClick={e => current() ? openMenu(spaceMenu(), { x: e.clientX, y: e.clientY }, 'space') : void cmd({ do: 'space.select', id: s.id })}>
            <Glyph name={spaceSymbol(s)} pt={11} weight="medium" />
          </button>
        )
      }}</For>
    </div>
  )
}

export { lastSpace }

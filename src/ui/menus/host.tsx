// What the tabs interface floats over the page, in the overlay: menus,
// popovers (a group's colours, a name asked for). Mounted once in the
// overlay by register.tsx; fed by the window's interface (bridge.ts).

import { createSignal, For, onCleanup, onMount, Show, type JSX } from 'solid-js'
import { Dynamic } from 'solid-js/web'
import { state, cmd } from '../lib/store'
import type { OverlayLayer } from '../../shared/state'
import type { Command } from '../../shared/commands'
import { listen, post, type Act, type Entry, type Message } from './bridge'
import { Menu } from './Menu'
import { Glyph } from '../sidebar/glyphs'
import { colourNames, spaceColours, spaceIconNames, spaceIcons } from '../sidebar/derive'

type Shown =
  | { kind: 'menu'; entries: Entry[]; at: { x: number; y: number }; source: string; room: { w: number; h: number } }
  | { kind: 'panel'; panel: string; at: { x: number; y: number }; data?: any; room: { w: number; h: number } }

const [shown, setShown] = createSignal<Shown | null>(null)
let mainLayer: OverlayLayer = { kind: 'none' }
/** The layer's name for the tabs interface's menus (main/tabs/menus.ts). */
export const MENU = 'tabs.menu'
let fading = false

export const menuShown = shown

/** The window's size, as its interface last said it. */
const [roomNow, setRoomNow] = createSignal({ w: 0, h: 0 })
export const room = roomNow
listen(m => { if (m.type === 'room' && m.window === state.windowID) setRoomNow({ w: m.w, h: m.h }) })

/** Raise the overlay over the whole window, with the keys. */
export function claim(room: { w: number; h: number }) {
  void cmd({ do: 'overlay.region', rect: { x: 0, y: 0, width: room.w, height: room.h }, focus: true })
}

/** Let the overlay go, if nothing of the main process's floats there; and
 * hand the keys back to the page (`refocus`). */
export function release(refocus: boolean) {
  if (mainLayer.kind !== 'none') return
  void cmd({ do: 'overlay.region', rect: null })
  if (refocus && !state.field.open) void cmd({ do: 'window.focusPage' })
}

export function close(refocus = true) {
  if (!shown()) return
  setShown(null)
  post({ type: 'shown', window: state.windowID, source: null })
  void cmd({ do: 'menu.close', refocus })
}

export async function run(act: Act | undefined): Promise<void> {
  if (!act) return
  if ('cmd' in act) await cmd(act.cmd).catch(e => console.warn('[menu]', e))
  else if ('cmds' in act) { for (const c of act.cmds) await cmd(c as Command).catch(e => console.warn('[menu]', e)) }
  else if ('copy' in act) await navigator.clipboard.writeText(act.copy).catch(() => {})
  else if ('ui' in act) post({ type: 'ui', window: state.windowID, act })
}

function pick(e: Entry) {
  if (fading) return
  const act = e.act
  const was = shown()
  // The pick blinks once, then the menu goes, as macOS's do.
  fading = true
  setTimeout(() => {
    fading = false
    if (act && 'ui' in act && act.ui.startsWith('panel:') && was) {
      // A popover where the menu was (Colour…, Rename…, New Space…).
      setShown({ kind: 'panel', panel: act.ui.slice(6), at: was.at, data: act.data, room: was.room })
      return
    }
    close(!(act && 'ui' in act))
    void run(act)
  }, 70)
}

/** What the main process raised (menu.open): a menu or a popover. */
function raise(l: OverlayLayer) {
  if (l.kind !== 'panel' || l.name !== MENU || !l.data) return false
  const d = l.data as { entries?: Entry[]; panel?: string; data?: unknown; at: { x: number; y: number }; source?: string; room?: { w: number; h: number } }
  const room = d.room?.w ? d.room : { w: window.innerWidth, h: window.innerHeight }
  if (d.panel) setShown({ kind: 'panel', panel: d.panel, at: d.at, data: d.data, room })
  else setShown({ kind: 'menu', entries: d.entries ?? [], at: d.at, source: d.source ?? '', room })
  post({ type: 'shown', window: state.windowID, source: d.panel ? null : d.source ?? null })
  return true
}

export function MenuHost() {
  onMount(() => {
    const off = listen((m: Message) => {
      if (m.window !== state.windowID) return
      if (m.type === 'close') close(false)
    })
    // The menu is a layer of the main process: anything else raised there
    // (the field, a panel, a question) takes its place.
    const offLayer = window.search.onOverlay(l => {
      mainLayer = l
      if (raise(l)) return
      if (shown()) { setShown(null); post({ type: 'shown', window: state.windowID, source: null }) }
    })
    void window.search.overlayNow().then(l => { if (l) { mainLayer = l; raise(l) } })
    const blur = () => close(false)
    window.addEventListener('blur', blur)
    onCleanup(() => { off(); offLayer(); window.removeEventListener('blur', blur) })
  })

  return (
    <Show when={shown()}>{s => (
      <div class="menu-host" data-tabs-ui="host">
        <div class="menu-scrim" onPointerDown={() => close(false)} onContextMenu={e => { e.preventDefault(); close(false) }} />
        <Show when={s().kind === 'menu' ? (s() as Extract<Shown, { kind: 'menu' }>) : null}>{m => (
          <Menu entries={m().entries} at={m().at} room={m().room} pick={pick} close={() => close(true)} />
        )}</Show>
        <Show when={s().kind === 'panel' ? (s() as Extract<Shown, { kind: 'panel' }>) : null}>{p => (
          <Dynamic component={panels[p().panel] ?? (() => null)} at={p().at} data={p().data} room={p().room} />
        )}</Show>
      </div>
    )}</Show>
  )
}

/** The menu the main process raises itself, once it does ({ kind: 'menu' }). */
export function MainMenuLayer(p: { layer: OverlayLayer }) {
  const l = () => p.layer as Extract<OverlayLayer, { kind: 'menu' }>
  const toEntries = (items: typeof l extends () => infer L ? L extends { items: infer I } ? I : never : never): Entry[] =>
    (items as any[]).map(i => ({
      label: i.label, enabled: i.enabled, checked: i.checked, accel: i.accelerator, separator: i.separator,
      act: i.id ? { cmd: { do: 'menu.pick', source: l().source, id: i.id } as Command } : undefined,
      submenu: i.submenu ? toEntries(i.submenu) : undefined,
    }))
  return (
    <div class="menu-host">
      <div class="menu-scrim" onPointerDown={() => void cmd({ do: 'menu.pick', source: l().source, id: '' })} />
      <Menu entries={toEntries(l().items as never)} at={l().at} room={{ w: window.innerWidth, h: window.innerHeight }}
        pick={e => void run(e.act)} close={() => void cmd({ do: 'menu.pick', source: l().source, id: '' })} />
    </div>
  )
}

// popovers

type PanelProps = { at: { x: number; y: number }; data?: any; room: { w: number; h: number } }

function place(at: { x: number; y: number }, w: number, h: number, room: { w: number; h: number }): JSX.CSSProperties {
  const x = Math.max(8, Math.min(at.x, room.w - w - 8))
  const y = Math.max(8, Math.min(at.y, room.h - h - 8))
  return { left: `${x}px`, top: `${y}px` }
}

/** SpaceGradient.presets, as the main process keeps them (model.spaceGradients). */
const gradients: Record<string, string[]> = {
  Sunrise: ['#C69612', '#E177A3'], Lagoon: ['#00B7A8', '#53A3F2'], Orchard: ['#8BAD42', '#00B7A8'],
  Dusk: ['#8696F5', '#CE7CC8', '#E0843E'], Glacier: ['#00B1CE', '#8696F5'], Ember: ['#E97871', '#C69612'],
}

/** A group's colour (ColourSwatches, §6.36): six circles of 22, 10 apart,
 * the one chosen ringed in ink at 75%, None crossed. */
function Swatches(p: PanelProps) {
  const chosen = () => p.data?.colour ?? 0
  const choose = (i: number) => {
    const c: Command = p.data.kind === 'space' ? { do: 'space.colour', id: p.data.id, colour: i } : { do: 'group.colour', id: p.data.id, colour: i }
    void cmd(c)
    close(true)
  }
  // A space also takes a ready-made gradient and a strength (SpaceLookPicker, §7.7).
  const space = () => (p.data?.kind === 'space' ? state.spaces.find(s => s.id === p.data.id) : undefined)
  const preset = () => { const g = space()?.gradient?.colours?.join(','); return Object.keys(gradients).find(k => gradients[k].join(',') === g) }
  return (
    <div class="popover" style={place(p.at, 22 * 6 + 50 + 32, p.data?.kind === 'space' ? 150 : 54, p.room)} data-tabs-ui="swatches">
      <div class="swatches">
        <For each={spaceColours}>{(c, i) => (
          <button class="swatch" classList={{ none: i() === 0, chosen: !preset() && chosen() === i() }} title={colourNames[i()]}
            style={{ background: i() ? `rgb(${c.map(v => Math.round(v * 255)).join(' ')})` : 'transparent' }}
            onClick={() => choose(i())} />
        )}</For>
      </div>
      <Show when={p.data?.kind === 'space'}>
        <div class="swatches" style={{ 'margin-top': '12px' }} data-gradients>
          <For each={Object.keys(gradients)}>{name => (
            <button class="swatch" classList={{ chosen: preset() === name }} title={name} data-gradient={name}
              style={{ background: `linear-gradient(135deg, ${gradients[name].join(', ')})` }}
              onClick={() => { void cmd({ do: 'space.gradient', id: p.data.id, preset: name }); close(true) }} />
          )}</For>
        </div>
        <div class="segmented" style={{ 'margin-top': '12px', display: 'flex', gap: '4px' }} data-strength>
          <For each={['subtle', 'rich', 'vivid'] as const}>{st => (
            <button class="pill" classList={{ chosen: (space()?.strength ?? 'subtle') === st }} data-strength-choice={st}
              onClick={() => void cmd({ do: 'space.strength', id: p.data.id, strength: st })}>{st[0].toUpperCase() + st.slice(1)}</button>
          )}</For>
        </div>
      </Show>
    </div>
  )
}

/** A name asked for (Ask.name / the new space card, §7.4, §7.5). */
function AskName(p: PanelProps) {
  let input!: HTMLInputElement
  const [text, setText] = createSignal<string>(p.data?.initial ?? '')
  const [icon, setIcon] = createSignal<string>(p.data?.icon ?? 'briefcase')
  const [picking, setPicking] = createSignal(false)
  onMount(() => setTimeout(() => { input.focus(); input.select() }, 30))
  const commit = () => {
    const name = text().trim()
    if (!name) { input.focus(); return }
    const d = p.data
    if (d.kind === 'space.rename') void cmd({ do: 'space.rename', id: d.id, name })
    else if (d.kind === 'space.new') void cmd({ do: 'space.create', name, icon: icon(), moving: d.moving })
    close(true)
  }
  return (
    <div class="popover ask" style={place(p.at, 332, 170, p.room)} data-tabs-ui="ask">
      <Show when={p.data?.kind === 'space.new'}>
        <div style={{ display: 'flex', gap: '10px', 'align-items': 'center' }}>
          <button class="icon-cell chosen" style={{ width: '44px', height: '40px', 'border-radius': '10px' }} title="Choose an icon" onClick={() => setPicking(!picking())}>
            <Glyph name={icon()} pt={20} weight="medium" />
          </button>
          <div><h2>New space</h2><p style={{ 'margin-top': '2px' }}>Its own tabs.</p></div>
        </div>
        <Show when={picking()}>
          <div class="icon-grid">
            <For each={spaceIcons}>{(name, i) => (
              <button class="icon-cell" classList={{ chosen: icon() === name }} title={spaceIconNames[i()]} onClick={() => { setIcon(name); setPicking(false) }}>
                <Glyph name={name} pt={13} weight="medium" />
              </button>
            )}</For>
          </div>
        </Show>
      </Show>
      <Show when={p.data?.kind !== 'space.new'}><h2>{p.data?.title ?? 'Rename'}</h2></Show>
      <input ref={input} value={text()} placeholder={p.data?.placeholder ?? 'Name'} onInput={e => setText(e.currentTarget.value)}
        onKeyDown={e => { if (e.key === 'Enter') commit(); else if (e.key === 'Escape') close(true) }} />
      <div class="buttons">
        <button class="pill-button" onClick={() => close(true)}>Cancel</button>
        <button class="pill-button full" onClick={commit}>{p.data?.confirm ?? 'Create'}</button>
      </div>
    </div>
  )
}

/** "Delete “Work”?" (Ask.sure, Spaces.swift:1188-1196). */
function Sure(p: PanelProps) {
  const space = () => state.spaces.find(s => s.id === p.data?.id)
  const own = () => !space()?.sharesSignIns
  const go = () => { void cmd({ do: 'space.delete', id: p.data.id }); close(true) }
  let button!: HTMLButtonElement
  onMount(() => setTimeout(() => button.focus(), 30))
  return (
    <div class="popover ask" style={place(p.at, 332, 150, p.room)} data-tabs-ui="sure"
      onKeyDown={e => { if (e.key === 'Escape') close(true) }}>
      <h2>Delete “{p.data?.name}”?</h2>
      <p style={{ 'margin-top': '-4px', 'font-size': '12px' }}>{own()
        ? 'Its tabs close, and its cookies and sign-ins are erased from this computer. History and bookmarks stay.'
        : 'Its tabs and pins close. Your sign-ins, history and bookmarks stay.'}</p>
      <div class="buttons">
        <button class="pill-button" onClick={() => close(true)}>Cancel</button>
        <button ref={button} class="pill-button full" onClick={go}>Delete</button>
      </div>
    </div>
  )
}

const panels: Record<string, (p: PanelProps) => JSX.Element> = { swatches: Swatches, ask: AskName, sure: Sure }

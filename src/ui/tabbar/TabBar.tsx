// Tabs across the top (studio/01 §4.3-§4.18, studio/02 §4.3; TabBar.swift):
// a strip of 52 on the page's white, a band of 30 in it. From the left: the
// room of the window's buttons (100 on the Mac; on Windows they are at the
// far end, so 12 as in full screen), the space's icon, the pins as squares
// of 30, the line between pins and tabs, each group's name and band, the
// tabs all one width (186, narrower in equal parts down to 36, the title
// gone under 104), + right after the last; at the far end the extensions,
// back, forward and reload. The live tab's grey glides.

import './tabbar.css'
import { createEffect, createMemo, createSignal, For, on, onCleanup, onMount, Show } from 'solid-js'
import { Dynamic } from 'solid-js/web'
import { state, cmd } from '../lib/store'
import { outlet } from '../lib/registry'
import type { GroupView, TabView } from '../../shared/state'
import { G, Ring } from '../sidebar/glyphs'
import { P, label, monogram, pinOf, picked, pref, restOf } from '../sidebar/derive'
import { Mark } from '../sidebar/Row'
import { SpaceDot, SpaceButtons } from '../sidebar/Foot'
import { Wash, groupColour } from '../sidebar/Sidebar'
import { Chase, Springs, type Box } from '../sidebar/motion'
import { openMenu } from '../menus/open'
import { tabMenu, groupMenu } from '../menus/build'
import { activeTab } from '../sidebar/ui'

const TAB = 186, MIN = 36, TITLED = 104, PIN = 30, PLUS = 30, HOLD = 40, GAP = 2

/** A group's name, measured as 12.5 medium (GroupHeading.width). */
const measure = (() => {
  let ctx: CanvasRenderingContext2D | null = null
  const cache = new Map<string, number>()
  return (text: string) => {
    if (cache.has(text)) return cache.get(text)!
    ctx ??= document.createElement('canvas').getContext('2d')
    if (!ctx) return text.length * 7
    ctx.font = '500 12.5px Inter Variable, Inter, sans-serif'
    const w = Math.ceil(ctx.measureText(text).width)
    cache.set(text, w)
    return w
  }
})()

export function TabBar() {
  let row!: HTMLDivElement
  let far!: HTMLDivElement
  let pillEl!: HTMLDivElement
  let bar!: HTMLElement
  const [width, setWidth] = createSignal(window.innerWidth)
  const [farW, setFarW] = createSignal(0)
  const [nearW, setNearW] = createSignal(0)
  const [inside, setInside] = createSignal(false)
  // Back, forward and reload on the left (toolbar.left, on by default here;
  // studio/01 §4.3, §4.4): after the room of the window's buttons (12 on
  // Windows, theirs is at the far end), before the tabs; off, at the far end.
  const onLeft = () => pref('toolbar.left', true)
  let near: HTMLDivElement | undefined
  const nearNow = () => setNearW(near?.isConnected ? near.offsetWidth + GAP : 0)
  onMount(() => {
    // The strip's own width: the window drawn by Oriel is narrower than the
    // view by its clear margin (window/frame.ts ROOM).
    const ro = new ResizeObserver(() => { setWidth(bar.clientWidth); setFarW(far.offsetWidth); nearNow() })
    ro.observe(bar)
    ro.observe(far)
    createEffect(on(onLeft, () => queueMicrotask(() => { if (near?.isConnected) ro.observe(near); nearNow() })))
    onCleanup(() => ro.disconnect())
  })

  const pins = () => state.tabs.filter(t => t.pinID)
  const groups = createMemo(() => state.groups.map(g => ({ g, tabs: state.tabs.filter(t => !t.pinID && t.groupID === g.id) })).filter(x => x.tabs.length))
  const loose = () => { const known = new Set(state.groups.map(g => g.id)); return state.tabs.filter(t => !t.pinID && !(t.groupID && known.has(t.groupID))) }
  const lights = () => (state.chrome === 'mac' && !state.fullScreen ? 100 : 12)
  const dot = () => (P.spaces() && !P.spaceButtons() ? 26 + GAP : 0)
  const controls = () => (state.chrome === 'windows' ? state.controlsWidth : 0)
  // TabBar.swift:656-690: the room, what the pins, names and bands spend, each tab's width.
  const each = createMemo(() => {
    const room = width() - controls() - lights() - (onLeft() ? nearW() : 0) - dot() - 12 - PLUS - HOLD - farW() - 3 * GAP
    const open = groups().filter(x => !x.g.folded)
    const shown = loose().length + open.reduce((n, x) => n + x.tabs.length, 0) + groups().filter(x => x.g.folded && x.tabs.some(t => t.id === state.activeID)).length
    const names = groups().reduce((w, x) => w + measure(x.g.name) + 20, 0)
    const line = pins().length && (groups().length || loose().length) ? 3 : 0
    const spend = pins().length * PIN + names + Math.max(0, pins().length + shown + groups().length - 1) * GAP + line + open.length * 8
    return Math.max(MIN, Math.min(TAB, (room - spend) / Math.max(1, shown)))
  })
  const titled = () => each() >= TITLED

  // the grey that glides between tabs (§4.9)
  const [gliding, setGliding] = createSignal<string | null>(null)
  let chase: Chase | null = null
  const rectOf = (id: string): Box | null => {
    const el = row?.querySelector<HTMLElement>(`[data-tab="${id}"]`)
    if (!el) return null
    const b = row.getBoundingClientRect(), r = el.getBoundingClientRect()
    return { x: r.left - b.left + row.scrollLeft, y: r.top - b.top, w: r.width, h: r.height }
  }
  createEffect(on(() => state.activeID, (id, prev) => {
    if (!id || !prev || id === prev) return
    queueMicrotask(() => {
      const from = rectOf(prev), to = rectOf(id)
      if (!from || !to) return
      chase?.stop()
      const paint = (b: Box) => { pillEl.style.transform = `translate(${b.x}px, ${b.y}px)`; pillEl.style.width = `${b.w}px`; pillEl.style.height = `${b.h}px` }
      paint(from)
      setGliding(id)
      chase = new Chase(Springs.glide, from, () => rectOf(state.activeID ?? ''), paint, () => { chase = null; setGliding(null) })
      chase.start()
      row.querySelector(`[data-tab="${id}"]`)?.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' })
    })
  }))
  onCleanup(() => chase?.stop())

  const tab = activeTab
  const back = () => !!tab() && !tab()!.empty && tab()!.canGoBack
  const forward = () => !!tab() && !tab()!.empty && tab()!.canGoForward

  const Helm = () => (
    <div class="strip-helm">
      <Show when={!pref('helm.back.hidden', false)}>
        <button class="door" disabled={!back()} title="Back   Alt+Left" onClick={() => void cmd({ do: 'tab.back' })}><G.chevronLeft pt={11} weight="medium" /></button>
      </Show>
      <Show when={!pref('helm.forward.hidden', false)}>
        <button class="door" disabled={!forward()} title="Forward   Alt+Right" onClick={() => void cmd({ do: 'tab.forward' })}><G.chevronRight pt={11} weight="medium" /></button>
      </Show>
      <Show when={!pref('helm.reload.hidden', false)}>
        <button class="door" disabled={!tab() || tab()!.empty} title={tab()?.loading ? 'Stop   Esc' : 'Reload   Ctrl+R'}
          onClick={() => void cmd({ do: tab()?.loading ? 'tab.stop' : 'tab.reload' })}>
          {tab()?.loading ? <G.xmark pt={11} weight="medium" /> : <G.reload pt={11} weight="medium" />}
        </button>
      </Show>
    </div>
  )

  return (
    <header ref={bar} class="tabbar drag" data-tabs-ui="strip" style={{ '--controls': `${controls()}px` }}
      onPointerEnter={() => setInside(true)} onPointerLeave={() => setInside(false)}>
      <Wash />
      <div class="strip-band">
        <div class="strip-lights" style={{ width: `${lights()}px` }} />
        <Show when={onLeft()}><div ref={near} class="strip-near"><Helm /></div></Show>
        <Show when={dot()}><SpaceDot /></Show>
        <div ref={row} class="strip-row">
          <div ref={pillEl} class="strip-pill" classList={{ on: !!gliding() }} />
          <For each={pins()}>{t => <StripPin tab={t} gliding={gliding() === t.id} />}</For>
          <Show when={pins().length && (groups().length || loose().length)}><span class="pin-line" /></Show>
          <For each={groups()}>{x => <StripGroup group={x.g} tabs={x.tabs} each={each()} titled={titled()} gliding={gliding()} />}</For>
          <For each={loose()}>{t => <StripTab tab={t} width={each()} titled={titled()} gliding={gliding() === t.id} />}</For>
          <button class="strip-plus" classList={{ shown: inside() }} title="New Tab   Ctrl+T" onClick={() => void cmd({ do: 'tab.blank' })}>
            <G.plus pt={10} weight="medium" />
          </button>
        </div>
        {/* §4.20: a double click after the + opens a tab and doesn't zoom; on the
            rest of the strip the window's frame zooms (chrome/frame.ts). */}
        <div class="strip-spring" on:dblclick={e => { if (e.button === 0) { e.stopPropagation(); void cmd({ do: 'tab.new' }) } }} />
        <div ref={far} class="strip-far">
          <For each={outlet('strip.end')}>{c => <Dynamic component={c} />}</For>
          <Show when={!onLeft()}><Helm /></Show>
          <Show when={P.spaceButtons()}><SpaceButtons /></Show>
        </div>
      </div>
    </header>
  )
}

function press(t: TabView) {
  return (e: PointerEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('.strip-x, .speaker')) return
    const ctrl = e.ctrlKey || (window.search.platform === 'darwin' && e.metaKey)
    if (ctrl || e.shiftKey) { void cmd({ do: 'tab.pick', id: t.id, mode: ctrl && e.shiftKey ? 'addRange' : ctrl ? 'toggle' : 'range' }); return }
    if (t.id === state.activeID) { void cmd({ do: 'field.open', target: 'here' }); return }
    void cmd({ do: 'tab.select', id: t.id })
  }
}

function StripTab(p: { tab: TabView; width: number; titled: boolean; gliding: boolean; grouped?: boolean }) {
  const t = () => p.tab
  const live = () => t().id === state.activeID
  const rest = () => (live() ? restOf(t()) : null)
  const speaker = () => !t().loading && (t().audible || t().muted)
  return (
    <div class="strip-tab" data-tab={t().id} style={{ width: `${p.width}px` }}
      classList={{ live: live(), titled: p.titled, picked: picked(t().id), gliding: p.gliding, 'put-away': !!p.grouped && t().asleep && !live(), loading: t().loading }}
      title={p.titled ? undefined : label(t())}
      onPointerDown={press(t())}
      onAuxClick={e => { if (e.button === 1) void cmd({ do: 'tab.close', id: t().id }) }}
      onMouseDown={e => { if (e.button === 1) e.preventDefault() }}
      onContextMenu={e => { e.preventDefault(); e.stopPropagation(); openMenu(tabMenu(t()), { x: e.clientX, y: e.clientY }, `tab:${t().id}`) }}>
      <div class="ground" />
      <Show when={!t().empty}><Mark tab={{ ...t(), label: label(t()) }} size={15} /></Show>
      <Show when={p.titled}>
        <span class="strip-title">
          <span class="title">{label(t())}</span>
          <Show when={rest()}>{r => <span class="rest"><span class="rest-name">{r().name}</span></span>}</Show>
        </span>
        <Show when={speaker()}>
          <button class="speaker" title={t().muted ? 'Unmute Tab' : 'Mute Tab'} onClick={e => { e.stopPropagation(); void cmd({ do: 'tab.mute', id: t().id, muted: !t().muted }) }}>
            {t().muted ? <G.speakerSlash pt={8} /> : <G.speaker pt={8} />}
          </button>
        </Show>
        <span class="strip-slot"><Show when={t().loading}><Ring /></Show></span>
      </Show>
      <Show when={p.titled || live()}>
        <button class="strip-x" title={p.grouped && !t().asleep ? 'Put Away' : 'Close Tab'} onPointerDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); void cmd({ do: 'tab.close', id: t().id }) }}>
          <span class="disc">{p.grouped ? <G.minus pt={8} weight="semibold" /> : <G.xmark pt={8} weight="semibold" />}</span>
        </button>
      </Show>
    </div>
  )
}

function StripPin(p: { tab: TabView; gliding: boolean }) {
  const t = () => p.tab
  const pin = () => pinOf(t())
  return (
    <div class="strip-pin" data-tab={t().id} classList={{ live: t().id === state.activeID, asleep: t().asleep, gliding: p.gliding, picked: picked(t().id) }}
      title={label(t())} onPointerDown={press(t())}
      onDblClick={() => { if (t().id === state.activeID && pin()) void cmd({ do: 'pin.home', id: pin()!.id }) }}
      onAuxClick={e => { if (e.button === 1) void cmd({ do: 'tab.close', id: t().id }) }}
      onContextMenu={e => { e.preventDefault(); e.stopPropagation(); openMenu(tabMenu(t()), { x: e.clientX, y: e.clientY }, `tab:${t().id}`) }}>
      <div class="ground" />
      <Show when={!t().loading} fallback={<Ring size={11} />}>
        <Show when={P.icons() && t().favicon} fallback={<span class="pin-letter">{pin()?.letter || monogram({ ...t(), label: label(t()) })}</span>}>
          <Mark tab={{ ...t(), label: label(t()) }} size={16} icon dim={t().asleep} />
        </Show>
      </Show>
    </div>
  )
}

/** A group across the top (GroupBand, §6.49): its name, then a band of its
 * colour (or the pins' grey) from the name to its last tab; 10 after it. */
function StripGroup(p: { group: GroupView; tabs: TabView[]; each: number; titled: boolean; gliding: string | null }) {
  const shown = () => (p.group.folded ? p.tabs.filter(t => t.id === state.activeID) : p.tabs)
  return (
    <div class="strip-group" classList={{ open: !p.group.folded }} style={{ '--band': p.group.colour ? groupColour(p.group.colour) : 'var(--g-tile)' }}>
      <div class="strip-group-name" style={{ width: `${measure(p.group.name) + 20}px` }}
        onClick={() => void cmd({ do: 'group.fold', id: p.group.id })}
        onContextMenu={e => { e.preventDefault(); e.stopPropagation(); openMenu(groupMenu(p.group.id), { x: e.clientX, y: e.clientY }, `group:${p.group.id}`) }}>
        {p.group.name}
      </div>
      <For each={shown()}>{t => <StripTab tab={t} width={p.each} titled={p.titled} gliding={p.gliding === t.id} grouped />}</For>
    </div>
  )
}

// The column: the doors at the top (Back, Forward, Reload), pins as squares,
// then the tabs as rows with the grey of the active one gliding between them
// (studio/01 §5, studio/02 §4.2).

import './sidebar.css'
import { createEffect, createSignal, For, Show } from 'solid-js'
import { state, cmd, activeTab } from '../lib/store'
import { Back, Forward, Reload, Stop, Close, Globe, Speaker, SpeakerOff } from '../lib/icons'
import type { TabView, PinView } from '../../shared/state'
import { outlet } from '../lib/registry'
import { Dynamic } from 'solid-js/web'

export function Sidebar() {
  let list!: HTMLDivElement
  const [grey, setGrey] = createSignal<{ y: number; h: number } | null>(null)

  createEffect(() => {
    const id = state.activeID
    void state.tabs.length
    queueMicrotask(() => {
      const row = list?.querySelector<HTMLElement>(`[data-tab="${id}"]`)
      setGrey(row ? { y: row.offsetTop, h: row.offsetHeight } : null)
    })
  })

  const loose = () => state.tabs.filter(t => !t.pinID)
  const tab = activeTab

  const startResize = (e: PointerEvent) => {
    const start = e.clientX, width = state.sidebar.width
    const move = (m: PointerEvent) => void cmd({ do: 'sidebar.resize', width: width + (m.clientX - start) })
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <aside class="sidebar" style={{ width: `${state.sidebar.width}px` }}>
      <div class="helm drag">
        <button class="door" disabled={!tab()?.canGoBack} onClick={() => cmd({ do: 'tab.back' })} title="Back"><Back size={14} /></button>
        <button class="door" disabled={!tab()?.canGoForward} onClick={() => cmd({ do: 'tab.forward' })} title="Forward"><Forward size={14} /></button>
        <button class="door" disabled={!tab() || tab()!.empty} onClick={() => cmd({ do: tab()?.loading ? 'tab.stop' : 'tab.reload' })} title="Reload">
          {tab()?.loading ? <Stop size={14} /> : <Reload size={14} />}
        </button>
      </div>

      <button class="address-line" onClick={() => cmd({ do: 'field.open', target: 'here' })}>
        <span>{tab() && !tab()!.empty ? hostOf(tab()!.url) : 'Search or type an address'}</span>
      </button>

      <Show when={state.pins.length}>
        <div class="pins">
          <For each={state.pins}>{pin => <Pin pin={pin} />}</For>
        </div>
      </Show>

      <div class="rows" ref={list} onDblClick={e => { if (e.target === list) void cmd({ do: 'tab.new' }) }}>
        <Show when={grey()}>{g => <div class="grey" style={{ transform: `translateY(${g().y}px)`, height: `${g().h}px` }} />}</Show>
        <For each={loose()}>{t => <Row tab={t} />}</For>
      </div>

      <For each={outlet('sidebar.afterPins')}>{c => <Dynamic component={c} />}</For>
      <div class="foot">
        <For each={outlet('sidebar.foot')}>{c => <Dynamic component={c} />}</For>
        <For each={state.spaces}>{s => (
          <button class="door space-dot" classList={{ on: s.id === state.space }} title={s.name} onClick={() => cmd({ do: 'space.select', id: s.id })}>
            <span class="dot" />
          </button>
        )}</For>
      </div>
      <div class="grip" onPointerDown={startResize} />
    </aside>
  )
}

function Row(p: { tab: TabView }) {
  const t = () => p.tab
  return (
    <div class="row" data-tab={t().id} classList={{ active: t().id === state.activeID, asleep: t().asleep }}
      onPointerDown={e => { if (e.button === 0 && !(e.target as HTMLElement).closest('.x')) void cmd({ do: 'tab.select', id: t().id }) }}
      onAuxClick={e => { if (e.button === 1) void cmd({ do: 'tab.close', id: t().id }) }}
      onContextMenu={e => { e.preventDefault(); void cmd({ do: 'tab.menu', id: t().id, x: e.clientX, y: e.clientY }) }}>
      <Mark url={t().url} favicon={t().favicon} loading={t().loading} />
      <span class="title">{t().name || t().title || (t().empty ? 'New Tab' : hostOf(t().url))}</span>
      <Show when={t().audible || t().muted}>
        <button class="speaker" onClick={() => cmd({ do: 'tab.mute', id: t().id, muted: !t().muted })}>
          {t().muted ? <SpeakerOff size={12} /> : <Speaker size={12} />}
        </button>
      </Show>
      <button class="x" onClick={() => cmd({ do: 'tab.close', id: t().id })} title="Close Tab"><Close size={11} /></button>
    </div>
  )
}

function Pin(p: { pin: PinView }) {
  return (
    <button class="pin" classList={{ active: !!p.pin.tabID && p.pin.tabID === state.activeID, open: !!p.pin.tabID }}
      title={p.pin.title}
      onClick={() => p.pin.tabID ? cmd({ do: 'tab.select', id: p.pin.tabID }) : cmd({ do: 'pin.open', id: p.pin.id })}>
      <Mark url={p.pin.home} favicon={p.pin.favicon} size={16} />
    </button>
  )
}

export function Mark(p: { url: string; favicon?: string; loading?: boolean; size?: number }) {
  const [broken, setBroken] = createSignal(false)
  createEffect(() => { void p.favicon; setBroken(false) })
  const size = () => p.size ?? 15
  return (
    <span class="mark" style={{ width: `${size()}px`, height: `${size()}px` }}>
      <Show when={p.loading} fallback={
        <Show when={p.favicon && !broken()} fallback={<Letter url={p.url} />}>
          <img src={p.favicon} width={size()} height={size()} onError={() => setBroken(true)} draggable={false} />
        </Show>
      }>
        <svg class="ring" viewBox="0 0 12 12" width="10" height="10"><circle cx="6" cy="6" r="5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-dasharray="24.5 31.4" /></svg>
      </Show>
    </span>
  )
}

function Letter(p: { url: string }) {
  const h = () => hostOf(p.url)
  return <Show when={h()} fallback={<Globe size={13} />}><span class="letter">{h()[0]?.toUpperCase()}</span></Show>
}

export function hostOf(url: string): string {
  try { return new URL(url).host.replace(/^www\./, '') } catch { return '' }
}

// A tab as a line in the column (Side.swift `SideRow` 2020-2325, studio/01
// §5.11-§5.18, studio/02 §4.2): 28 high (36 roomier), radius 9, the site's
// mark 15 and the title 12.5 eight apart, 10 in from either side; under the
// pointer a cross on a disc of 15, 7 from the end, the title fading out
// under it (16 of gradient, 26 clear) rather than cut shorter.

import { createEffect, createSignal, on, onMount, Show } from 'solid-js'
import { state, cmd } from '../lib/store'
import type { TabView } from '../../shared/state'
import { G, Ring } from './glyphs'
import { P, label, monogram, restOf, markSize, picked, pickedAmongOthers, pinOf } from './derive'
import { editing, setEditing, reading } from './ui'
import { openMenu } from '../menus/open'
import { tabMenu } from '../menus/build'
import { press } from './drag'
import { fadeBack } from './motion'
import { TabField } from '../field/TabField'

/** Icons asked of the data module, once per address. */
const asked = new Map<string, Promise<string | null>>()
function keptIcon(url: string, shy: boolean): Promise<string | null> {
  const key = `${shy ? 'shy:' : ''}${url}`
  let got = asked.get(key)
  if (!got) {
    got = Promise.resolve(cmd({ do: 'data.icon', url, shy })).then(v => (typeof v === 'string' ? v : null)).catch(() => null)
    asked.set(key, got)
    // Learnt later (the page loads, its icon is kept): ask again next time.
    void got.then(v => { if (!v) setTimeout(() => asked.delete(key), 5000) })
  }
  return got
}

/** The site's mark (Icons.swift `Mark` 752-794): its icon with a radius of
 * 22%, or its letter at 56% on ink at 6%. */
export function Mark(p: { tab: { url: string; favicon?: string; internal?: string; label?: string; title?: string; empty?: boolean; shy?: boolean }; size: number; dim?: boolean; icon?: boolean }) {
  const [broken, setBroken] = createSignal(false)
  // Before the page says its own, or when its own doesn't load (a site's
  // /favicon.ico that isn't there): the icon kept for its site (data.icon).
  const [ownFailed, setOwnFailed] = createSignal(false)
  const [kept, setKept] = createSignal<string | null>(null)
  const ask = (url: string) => {
    if (!url || p.tab.internal || p.tab.empty || !(p.icon ?? P.icons())) return
    void keptIcon(url, !!p.tab.shy).then(i => { if (p.tab.url === url) setKept(i) })
  }
  createEffect(on(() => [p.tab.favicon, p.tab.url] as const, ([own, url]) => {
    setBroken(false)
    setOwnFailed(false)
    setKept(null)
    if (!own) ask(url)
  }))
  const src = () => (p.tab.favicon && !ownFailed() ? p.tab.favicon : kept()) || undefined
  const icon = () => (p.icon ?? P.icons()) && !!src() && !broken()
  const failed = () => {
    if (p.tab.favicon && !ownFailed()) { setOwnFailed(true); if (!kept()) ask(p.tab.url) }
    else setBroken(true)
  }
  return (
    <span class="mark" classList={{ dim: !!p.dim }} style={{ width: `${p.size}px`, height: `${p.size}px`, 'border-radius': `${p.size * 0.22}px` }}>
      <Show when={icon()} fallback={
        <span class="letter" style={{ 'font-size': `${+(p.size * 0.56).toFixed(2)}px` }}>{monogram(p.tab)}</span>
      }>
        <img src={src()} width={p.size} height={p.size} draggable={false} onError={failed} />
      </Show>
    </span>
  )
}

/** The site at rest, on the tab you're on (AtRestLine.swift). */
function RestLine(p: { tab: TabView }) {
  const rest = () => restOf(p.tab)
  return (
    <Show when={rest()}>{r => (
      <span class="rest">
        <Show when={r().kind === 'notSecure'}><span class="rest-dim">Not secure  </span></Show>
        <Show when={r().lead}><span class="rest-lead"><bdi>{r().lead}</bdi></span></Show>
        <span class="rest-name" classList={{ plain: r().kind === 'file' || r().kind === 'other' }}>{r().name}</span>
        <Show when={r().tail}><span class="rest-dim">{r().tail}</span></Show>
      </span>
    )}</Show>
  )
}

export function Row(p: { tab: TabView; grouped?: boolean; pinned?: boolean }) {
  let el!: HTMLDivElement
  const t = () => p.tab
  const live = () => t().id === state.activeID
  const loading = () => t().loading
  const speaker = () => !loading() && (t().audible || t().muted)
  const status = () => loading() || speaker()
  // A pin already put down has nothing to put down (#1050).
  const closable = () => !(t().pinID && t().asleep)
  // A grouped tab's page, open: its cross is a minus that puts it away.
  const putsAway = () => !!p.grouped && !t().asleep && !t().empty && !!t().url
  const putAway = () => !!p.grouped && t().asleep && !live()
  const dim = () => P.dimSleeping() && t().asleep && !live() && !putAway()
  const isEditing = () => editing()?.kind === 'tab' && editing()?.id === t().id
  // Its address typed in the row itself (the field module's TabField).
  const addressing = () => state.tabEdit?.id === t().id
  // Kept while the address is typed: the title fades as it was (below).
  const rest = () => (live() && !isEditing() ? restOf(t()) : null)
  let wasLive = false

  // The site comes in over the title as the tab becomes the one you're on.
  createEffect(on(() => !!rest(), (on, was) => {
    if (on && was === false && el) el.querySelector('.rest')?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: 'cubic-bezier(.42,0,.58,1)' })
  }))

  const onDown = (e: PointerEvent) => {
    if (e.button !== 0 || isEditing() || addressing()) return
    if ((e.target as HTMLElement).closest('.x, .speaker')) return
    wasLive = live()
    const mods = e.ctrlKey || e.shiftKey || (window.search.platform === 'darwin' && e.metaKey) || e.altKey
    // Pressed, a tab is gone to at once (TabPress); picked among others it
    // waits, so a carry takes them all.
    if (!mods && !live() && !pickedAmongOthers(t().id)) {
      if ((state.picked ?? []).length) void cmd({ do: 'tab.pick', id: t().id, mode: 'clear' })
      void cmd({ do: 'tab.select', id: t().id })
    }
    press(e, { key: `t:${t().id}`, kind: 'row', tab: t().id, el })
  }

  const onClick = (e: MouseEvent) => {
    if (isEditing() || addressing() || (e.target as HTMLElement).closest('.x, .speaker')) return
    const ctrl = e.ctrlKey || (window.search.platform === 'darwin' && e.metaKey)
    if (ctrl && !e.shiftKey && t().pinID) { void cmd({ do: 'pin.commandClick', id: t().id }); return }
    if (ctrl || e.shiftKey) {
      void cmd({ do: 'tab.pick', id: t().id, mode: ctrl && e.shiftKey ? 'addRange' : ctrl ? 'toggle' : 'range' })
      return
    }
    if (pickedAmongOthers(t().id)) {
      void cmd({ do: 'tab.pick', id: t().id, mode: 'clear' })
      void cmd({ do: 'tab.select', id: t().id })
      return
    }
    // A click on the tab you're on edits its address, in the row (§5.18, §3.48).
    if (wasLive) void cmd({ do: 'field.editTab', id: t().id })
  }

  const close = () => { if (closable()) void cmd({ do: 'tab.close', id: t().id }) }

  // The address coming in on glide (Side.swift:2283): the mark and the title
  // fade where they stood as the field fades in over them; given back, they
  // fade in again.
  createEffect(on(addressing, (a, was) => { if (!a && was) fadeBack(el, '.body > .mark, .body > .titles') }))

  return (
    <div ref={el} class="row" data-tab={t().id}
      classList={{
        live: live(), picked: picked(t().id), status: status() && !addressing(), closable: closable() && !isEditing() && !addressing(),
        dim: dim(), 'put-away': putAway(), editing: isEditing() || addressing(), addressing: addressing(), 'at-rest': !!rest(), empty: t().empty,
      }}
      onPointerDown={onDown}
      onClick={onClick}
      onAuxClick={e => { if (e.button === 1) { e.preventDefault(); close() } }}
      onMouseDown={e => { if (e.button === 1) e.preventDefault() }}
      onContextMenu={e => { e.preventDefault(); e.stopPropagation(); openMenu(tabMenu(t()), { x: e.clientX, y: e.clientY }, `tab:${t().id}`) }}>
      <div class="ground">
        <Show when={live() && P.reading() && reading()?.id === t().id}>
          <div class="reading" style={{ width: `${Math.round((reading()?.fraction ?? 0) * 100)}%` }} />
        </Show>
      </div>
      <div class="body">
        <Show when={!t().empty}><Mark tab={{ ...t(), label: label(t()) }} size={markSize()} dim={putAway() || dim()} /></Show>
        <Show when={t().shy}><G.eyeSlash pt={9} class="sign" /></Show>
        <Show when={t().capturing}><G.record pt={10} class="sign rec" /></Show>
        <Show when={isEditing()} fallback={<>
          <span class="titles" style={addressing() ? { left: `${18 + markSize()}px` } : undefined}>
            <span class="title">{label(t())}</span>
            <Show when={rest()}><RestLine tab={t()} /></Show>
          </span>
          <Show when={addressing()}><TabField /></Show>
        </>}>
          <RenameField initial={t().name || label(t())} done={name => { if (name !== null) void cmd({ do: 'tab.rename', id: t().id, name: name || null }); setEditing(null) }} />
        </Show>
        {/* Ctrl held: the number Ctrl+1-9 gives it (Side.swift:2181), 28 from the end */}
        <Show when={!addressing() && state.tabHints?.[t().id]}>{n => <span class="hint-number" classList={{ beside: status() }}>{n()}</span>}</Show>
        <Show when={status() && !addressing()}>
          <span class="state">
            <Show when={loading()} fallback={
              <button class="speaker" title={t().muted ? 'Unmute Tab' : 'Mute Tab'}
                onClick={e => { e.stopPropagation(); void cmd({ do: 'tab.mute', id: t().id, muted: !t().muted }) }}>
                {t().muted ? <G.speakerSlash pt={8} /> : <G.speaker pt={8} />}
              </button>
            }><Ring /></Show>
          </span>
        </Show>
      </div>
      <Show when={closable() && !isEditing() && !addressing()}>
        <button class="x" title={p.pinned || (putsAway() && !t().asleep) ? (p.pinned ? 'Put Down' : 'Put Away') : 'Close Tab'}
          onPointerDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); close() }}>
          <span class="disc">{p.pinned || putsAway() ? <G.minus pt={8} weight="semibold" /> : <G.xmark pt={8} weight="semibold" />}</span>
        </button>
      </Show>
    </div>
  )
}

/** A name typed in place: Enter keeps it, Escape leaves it as it was. */
export function RenameField(p: { initial: string; placeholder?: string; done: (name: string | null) => void; class?: string; letter?: boolean }) {
  let input!: HTMLInputElement
  let finished = false
  const finish = (v: string | null) => { if (finished) return; finished = true; p.done(v) }
  onMount(() => { input.focus(); input.select() })
  return (
    <input ref={input} class={p.class ?? 'rename'} value={p.initial} placeholder={p.placeholder} maxLength={p.letter ? 2 : undefined}
      onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}
      onKeyDown={e => {
        e.stopPropagation()
        if (e.key === 'Enter' || (p.letter && e.key === 'Tab')) { e.preventDefault(); finish(input.value.trim()) }
        else if (e.key === 'Escape') { e.preventDefault(); finish(null) }
      }}
      onInput={() => { if (p.letter && input.value.trim()) { const v = input.value.trim(); input.value = v[v.length - 1].toUpperCase(); input.select() } }}
      onBlur={() => finish(p.letter ? input.value.trim() : input.value.trim())} />
  )
}

export { pinOf }

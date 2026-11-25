// Tabs across the top (studio/01 §4.3-§4.18, studio/02 §4.3; TabBar.swift):
// a strip of 52 on the page's white, a band of 30 in it. From the left: the
// room of the window's buttons (100 on the Mac; on Windows they are at the
// far end, so 12 as in full screen), the space's icon, the pins as squares
// of 30, the line between pins and tabs, each group's name and band, the
// tabs all one width (186, narrower in equal parts down to 36, the title
// gone under 104), + right after the last; at the far end the extensions,
// back, forward and reload. The live tab's grey glides.

import './tabbar.css'
import { createEffect, createMemo, createSignal, For, on, onCleanup, onMount, Show, untrack } from 'solid-js'
import { Dynamic } from 'solid-js/web'
import { state, cmd } from '../lib/store'
import { outlet } from '../lib/registry'
import type { GroupView, TabView } from '../../shared/state'
import { G, Ring } from '../sidebar/glyphs'
import { P, label, monogram, pinOf, picked, pickedAmongOthers, pref, restOf, pairSlot, type PairSlot } from '../sidebar/derive'
import { Mark } from '../sidebar/Row'
import { SpaceDot, SpaceButtons } from '../sidebar/Foot'
import { Wash, groupColour } from '../sidebar/Sidebar'
import { Chase, Springs, curve, keepLeaving, quietOn, stay, fadeBack, type Box } from '../sidebar/motion'
import { openMenu } from '../menus/open'
import { tabMenu, groupMenu } from '../menus/build'
import { activeTab, reading, dropTarget } from '../sidebar/ui'
import { TabField, tabFieldText, fieldTextWidth } from '../field/TabField'
import { AddressLine } from '../field/AddressLine'
import { press as carryPress, lifted, stripMark } from './drag'

const TAB = 186, MIN = 36, TITLED = 104, PIN = 30, PLUS = 30, HOLD = 40, GAP = 2, AFTER = 8

/** What comes into the strip or goes from it, started together once the row
 * has its new widths (TabBar.swift:1081, :338): a tab scales from 0.9 at its
 * leading edge as it fades, where it stands, while the rest move and widen
 * on settle. The row is laid out by flex, so the room a tab takes or gives
 * back is its right margin, eased on the same curve as the widths: every
 * edge in the row then moves on settle. A tab coming or going is held where
 * it is drawn at the end (coming) or at the start (going) against the tabs
 * before it moving, as SwiftUI draws an inserted or removed view at its own
 * frame. */
class StripMotion {
  row: HTMLElement | null = null
  private queued = false
  private jobs = new Map<HTMLElement, { kind: 'enter' | 'leave'; scale: number; done?: () => void }>()

  add(el: HTMLElement, kind: 'enter' | 'leave', scale: number, done?: () => void): void {
    this.jobs.set(el, { kind, scale, done })
    if (!this.queued) { this.queued = true; queueMicrotask(() => this.run()) }
  }

  private run(): void {
    this.queued = false
    const jobs = this.jobs
    this.jobs = new Map()
    // The tokens' settle, the very curve the widths take in CSS (app.css), so
    // margins and widths add up to the same edge every frame.
    const root = getComputedStyle(document.documentElement)
    const ms = root.getPropertyValue('--dur-settle').trim()
    const duration = ms.endsWith('ms') ? parseFloat(ms) : parseFloat(ms) * 1000 || 0
    const easing = root.getPropertyValue('--ease-settle').trim() || curve(Springs.settle).easing
    const row = this.row
    if (!row || !duration) { for (const j of jobs.values()) j.done?.(); return }
    const gap = parseFloat(getComputedStyle(row).columnGap) || GAP
    const els = [...row.querySelectorAll<HTMLElement>('.strip-pin, .strip-tab, .strip-group')]
    // How much room each one takes in the row changes from now to the end.
    const change = new Map<HTMLElement, number>()
    const plan = new Map<HTMLElement, { m0: number; m1: number }>()
    for (const el of els) {
      const cs = getComputedStyle(el)
      const w = parseFloat(cs.width) || 0, m = parseFloat(cs.marginRight) || 0
      const job = jobs.get(el)
      if (job?.kind === 'leave') { const m1 = -(w + gap); plan.set(el, { m0: m, m1 }); change.set(el, m1 - m) }
      else if (job?.kind === 'enter') { const m0 = m - (w + gap); plan.set(el, { m0, m1: m }); change.set(el, m - m0) }
      else {
        // A width on its way (its transition has only begun), a margin on its way.
        let d = !el.classList.contains('strip-group') && el.style.width ? parseFloat(el.style.width) - w : 0
        if (el.dataset.marginTo) d += parseFloat(el.dataset.marginTo) - m
        change.set(el, d)
      }
    }
    for (const [el, job] of jobs) {
      const p = plan.get(el)
      if (!p) { job.done?.(); continue }
      let shift = 0
      for (const o of els) {
        if (o === el) break
        if (!o.contains(el)) shift += change.get(o) ?? 0
      }
      el.style.transformOrigin = 'left center'
      el.dataset.marginTo = String(p.m1)
      const scale = String(job.scale)
      const a = job.kind === 'leave'
        ? el.animate([{ marginRight: `${p.m0}px`, translate: '0px', scale: '1', opacity: 1 },
          { marginRight: `${p.m1}px`, translate: `${-shift}px`, scale, opacity: 0 }], { duration, easing, fill: 'forwards' })
        : el.animate([{ marginRight: `${p.m0}px`, translate: `${shift}px`, scale, opacity: 0 },
          { marginRight: `${p.m1}px`, translate: '0px', scale: '1', opacity: 1 }], { duration, easing })
      const end = () => { delete el.dataset.marginTo; job.done?.() }
      a.onfinish = end
      a.oncancel = end
    }
  }
}

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
  const motion = new StripMotion()
  // Back, forward and reload on the left (toolbar.left, on by default here;
  // studio/01 §4.3, §4.4): after the room of the window's buttons (12 on
  // Windows, theirs is at the far end), before the tabs; off, at the far end.
  const onLeft = () => pref('toolbar.left', true)
  let near: HTMLDivElement | undefined
  const nearNow = () => setNearW(near?.isConnected ? near.offsetWidth + GAP : 0)
  onMount(() => {
    // The strip's own width: the window drawn by Oriel is narrower than the
    // view by its clear margin (window/frame.ts ROOM).
    // The window resized: the tabs follow it at once, not on settle.
    let resting = 0
    const read = () => {
      bar.classList.add('resizing')
      clearTimeout(resting)
      resting = window.setTimeout(() => bar.classList.remove('resizing'), 200)
      setWidth(bar.clientWidth); setFarW(far.offsetWidth); nearNow()
    }
    const ro = new ResizeObserver(read)
    ro.observe(bar)
    ro.observe(far)
    // Read at once too: a window that draws no frame yet (covered, asleep)
    // delivers no ResizeObserver, and the tabs were sized for the view.
    read()
    createEffect(on(onLeft, () => queueMicrotask(() => { if (near?.isConnected) ro.observe(near); read() })))
    onCleanup(() => { ro.disconnect(); clearTimeout(resting) })
  })

  const pins = () => state.tabs.filter(t => t.pinID)
  const groups = createMemo(() => state.groups.map(g => ({ g, tabs: state.tabs.filter(t => !t.pinID && t.groupID === g.id) })).filter(x => x.tabs.length))
  const loose = () => { const known = new Set(state.groups.map(g => g.id)); return state.tabs.filter(t => !t.pinID && !(t.groupID && known.has(t.groupID))) }
  const lights = () => (state.chrome === 'mac' && !state.fullScreen ? 100 : 12)
  const dot = () => (P.spaces() && !P.spaceButtons() ? 26 + GAP : 0)
  // Always show the address bar (address.shown): its row, Small 220 or Medium
  // 340, before the tabs, 8 and the band's gap after (AddressLine.after, §4.3).
  const addressShown = () => pref('address.shown', false)
  const addressWidth = () => (pref<string>('address.width', 'small') === 'medium' ? 340 : 220)
  const addressRoom = () => (addressShown() ? addressWidth() + AFTER + GAP : 0)
  const controls = () => (state.chrome === 'windows' ? state.controlsWidth : 0)
  // TabBar.swift:656-690: the room, what the pins, names and bands spend, each tab's width.
  const each = createMemo(() => {
    // + is 29 wide and has the row's gap before it (the Mac's 30 left the row 1 over).
    const room = width() - controls() - lights() - (onLeft() ? nearW() : 0) - addressRoom() - dot() - 12 - (PLUS - 1 + GAP) - HOLD - farW() - 3 * GAP
    const open = groups().filter(x => !x.g.folded)
    const shown = loose().length + open.reduce((n, x) => n + x.tabs.length, 0) + groups().filter(x => x.g.folded && x.tabs.some(t => t.id === state.activeID)).length
    const names = groups().reduce((w, x) => w + measure(x.g.name) + 20, 0)
    // The line between pins and tabs: 1 and its margins, and the row's gap after it.
    const line = pins().length && (groups().length || loose().length) ? 3 + GAP : 0
    const spend = pins().length * PIN + names + Math.max(0, pins().length + shown + groups().length - 1) * GAP + line + open.length * 8
    return Math.max(MIN, Math.min(TAB, (room - spend) / Math.max(1, shown)))
  })
  const titled = () => each() >= TITLED
  // The room a tab's address may take (TabBar.swift:468: strip − lights − leading − 12).
  const fieldRoom = () => width() - controls() - lights() - (onLeft() ? nearW() : 0) - addressRoom() - 12

  // The tab whose address is typed in it kept in sight as it widens: the run
  // follows its far edge frame by frame rather than leaving it cut off past
  // the strip's end when the tabs fill the row (TabBar.swift reveal).
  createEffect(on(() => state.tabEdit?.id, id => {
    if (!id) return
    queueMicrotask(() => {
      const el = row?.querySelector<HTMLElement>(`.strip-tab[data-tab="${id}"]`)
      if (!el) return
      const until = performance.now() + curve(Springs.glide).duration + 150
      const follow = () => {
        if (!el.isConnected || state.tabEdit?.id !== id) return
        const r = el.getBoundingClientRect(), v = row.getBoundingClientRect()
        if (r.right > v.right + 0.5) row.scrollLeft += r.right - v.right
        else if (r.left < v.left - 0.5) row.scrollLeft -= v.left - r.left
        if (performance.now() < until) requestAnimationFrame(follow)
      }
      requestAnimationFrame(follow)
    })
  }, { defer: true }))

  // Tabs, pins and groups that come and go (TabBar.swift:1081): kept where
  // they were while they go; another space's come in at once (:331).
  let ready = false
  onMount(() => requestAnimationFrame(() => { ready = true }))
  const pinRoster = keepLeaving(pins, t => t.id, quietOn(() => !ready))
  const groupRoster = keepLeaving(groups, x => x.g.id, quietOn(() => !ready))
  const looseRoster = keepLeaving(loose, t => t.id, quietOn(() => !ready))

  // the grey that glides between tabs (§4.9)
  const [gliding, setGliding] = createSignal<string | null>(null)
  let chase: Chase | null = null
  const rectOf = (id: string): Box | null => {
    const el = row?.querySelector<HTMLElement>(`[data-tab="${id}"]`) ?? row?.querySelector<HTMLElement>(`[data-ghost-tab="${id}"]`)
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
    <header ref={bar} class="tabbar drag" data-tabs-ui="strip" classList={{ compact: pref('tabs.compact', false), contrast: P.contrast() }} style={{ '--controls': `${controls()}px` }}
      onPointerEnter={() => setInside(true)} onPointerLeave={() => setInside(false)}>
      <Wash />
      <div class="strip-band">
        <div class="strip-lights" style={{ width: `${lights()}px` }} />
        <Show when={onLeft()}><div ref={near} class="strip-near"><Helm /></div></Show>
        <Show when={addressShown()}><AddressLine width={addressWidth()} /></Show>
        <Show when={dot()}><SpaceDot /></Show>
        <div ref={el => { row = el; motion.row = el }} class="strip-row">
          <div ref={pillEl} class="strip-pill" classList={{ on: !!gliding() }} />
          <For each={pinRoster.keys()}>{k => (
            <Show when={pinRoster.item(k)}>{t => <StripPin tab={t()} gliding={gliding() === k} motion={motion}
              fresh={pinRoster.fresh(k)} leaving={pinRoster.leaving(k)} done={() => pinRoster.done(k)} />}</Show>
          )}</For>
          <Show when={pins().length && (groups().length || loose().length)}><span class="pin-line" /></Show>
          <For each={groupRoster.keys()}>{k => (
            <Show when={groupRoster.item(k)}>{x => <StripGroup group={x().g} tabs={x().tabs} each={each()} titled={titled()} gliding={gliding()} motion={motion} room={fieldRoom()}
              fresh={groupRoster.fresh(k)} leaving={groupRoster.leaving(k)} done={() => groupRoster.done(k)} />}</Show>
          )}</For>
          <For each={looseRoster.keys()}>{k => (
            <Show when={looseRoster.item(k)}>{t => <StripTab tab={t()} width={each()} titled={titled()} gliding={gliding() === k} motion={motion} room={fieldRoom()}
              pair={pairSlot(loose(), k)} fresh={looseRoster.fresh(k)} leaving={looseRoster.leaving(k)} done={() => looseRoster.done(k)} />}</Show>
          )}</For>
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
    if (ctrl && !e.shiftKey && t.pinID) { void cmd({ do: 'pin.commandClick', id: t.id }); return }
    const pick = () => void cmd({ do: 'tab.pick', id: t.id, mode: ctrl && e.shiftKey ? 'addRange' : ctrl ? 'toggle' : 'range' })
    // A pin stays where it is; any other tab can be carried. With Ctrl or
    // Shift the pick waits for the button up, as a carry may follow (Shift
    // held on another tab splits the two).
    if (ctrl || e.shiftKey) {
      if (t.pinID) pick()
      else carryPress(e, t.id, pick)
      return
    }
    // On a tab picked among others a click lets the rest go and goes there,
    // a carry keeps them all; on any other the picks let go at the press (§3.18).
    if (pickedAmongOthers(t.id)) {
      const go = () => { void cmd({ do: 'tab.pick', id: t.id, mode: 'clear' }); void cmd({ do: 'tab.select', id: t.id }) }
      if (t.pinID) go()
      else carryPress(e, t.id, go)
      return
    }
    if ((state.picked ?? []).length) void cmd({ do: 'tab.pick', id: t.id, mode: 'clear' })
    // A press on the tab you're on edits its address, in the tab (§5.18),
    // once the button is up, so a carry from it doesn't open the field.
    if (t.id === state.activeID) {
      if (state.tabEdit?.id === t.id) return
      const edit = () => void cmd({ do: 'field.editTab', id: t.id })
      if (t.pinID) edit()
      else carryPress(e, t.id, edit)
      return
    }
    void cmd({ do: 'tab.select', id: t.id })
    if (!t.pinID) carryPress(e, t.id, null)
  }
}

interface Coming { motion?: StripMotion; fresh?: boolean; leaving?: boolean; done?: () => void }

/** Its arrival on mount, its leaving when it starts (StripMotion). */
function comeAndGo(el: () => HTMLElement, p: Coming, scale: number): void {
  onMount(() => { if (p.fresh && p.motion) p.motion.add(el(), 'enter', scale) })
  createEffect(on(() => !!p.leaving, (l, was) => {
    if (l === !!was) return
    if (!l) { stay(el()); return }
    if (p.motion) p.motion.add(el(), 'leave', scale, p.done); else p.done?.()
  }))
}

/** A value held as it was once leaving: a tab going keeps its width. */
function held<T>(leaving: () => boolean, value: () => T): () => T {
  return createMemo<T | undefined>(prev => (leaving() && prev !== undefined ? prev : value()), undefined) as () => T
}

function StripTab(p: { tab: TabView; width: number; titled: boolean; gliding: boolean; grouped?: boolean; room?: number; pair?: PairSlot | null } & Coming) {
  let el!: HTMLDivElement
  const t = () => p.tab
  const live = () => t().id === state.activeID
  const rest = () => (live() ? restOf(t()) : null)
  const speaker = () => !t().loading && (t().audible || t().muted)
  // Its address typed in the tab itself, never past 340 or the strip's room
  // (TabBar.swift:991 `min(340, room)`), on glide (:337, :1072): the rest
  // move aside on it rather than jump; its mark and title fade where they
  // stood as the field fades in. As wide as the address needs (its 11 each
  // side and a little air), never narrower than the tab was: a short one
  // like oriel://settings no longer opens 340 wide (carpa, 24 Nov 2026).
  const addressing = () => state.tabEdit?.id === t().id
  const fits = () => {
    const most = Math.min(340, p.room ?? 340)
    const need = Math.ceil(fieldTextWidth(tabFieldText()) + 11 * 2 + 14)
    return Math.max(Math.min(p.width, most), Math.min(most, need))
  }
  const width = held(() => !!p.leaving, () => (addressing() ? fits() : p.width))
  const titled = held(() => !!p.leaving, () => p.titled)
  let wasAddressing = untrack(addressing)
  const glides = createMemo(() => { void p.width; const a = addressing(); const g = a !== wasAddressing; wasAddressing = a; return g })
  comeAndGo(() => el, p, 0.9)
  createEffect(on(addressing, (a, was) => { if (!a && was) fadeBack(el, ':scope > .mark, :scope > .strip-title') }))
  return (
    <div ref={el} class="strip-tab" data-tab={p.leaving ? undefined : t().id} data-ghost-tab={p.leaving ? t().id : undefined}
      style={{
        width: `${width()}px`, transition: glides() ? 'width var(--dur-glide) var(--ease-glide)' : undefined,
        translate: lifted()?.id === t().id ? `${lifted()!.dx}px ${lifted()!.dy}px` : undefined,
      }}
      classList={{
        live: live() && !p.leaving, titled: titled() || addressing(), addressing: addressing(), picked: picked(t().id), gliding: p.gliding, 'put-away': !!p.grouped && t().asleep && !live(), loading: t().loading, leaving: !!p.leaving,
        'split-target': dropTarget() === `s:${t().id}`, carried: lifted()?.id === t().id, faded: lifted()?.id === t().id && lifted()!.faded,
        'in-pair': !!p.pair, 'pair-first': p.pair?.index === 0, 'pair-last': !!p.pair && p.pair.index === p.pair.count - 1, 'pair-live': !!p.pair?.live,
      }}
      title={titled() ? undefined : label(t())}
      onPointerDown={press(t())}
      onAuxClick={e => { if (e.button === 1) void cmd({ do: 'tab.close', id: t().id }) }}
      onMouseDown={e => { if (e.button === 1) e.preventDefault() }}
      onContextMenu={e => { e.preventDefault(); e.stopPropagation(); openMenu(tabMenu(t()), { x: e.clientX, y: e.clientY }, `tab:${t().id}`) }}>
      <div class="ground">
        {/* How far down its page you've read (tabs.reading, §2.17, §4.11): not on a tab down to its mark */}
        <Show when={live() && P.reading() && titled() && reading()?.id === t().id}>
          <div class="reading" style={{ width: `${Math.round((reading()?.fraction ?? 0) * 100)}%` }} />
        </Show>
      </div>
      <Show when={stripMark()?.id === t().id}><span class="strip-drop" classList={{ after: stripMark()!.after }} /></Show>
      <Show when={!t().empty}><Mark tab={{ ...t(), label: label(t()) }} size={15} /></Show>
      <Show when={addressing()}><TabField /></Show>
      {/* A private tab (§2.35): the column's eye, here too. */}
      <Show when={t().shy && titled() && !addressing()}><G.eyeSlash pt={9} class="sign" /></Show>
      <Show when={titled()}>
        <span class="strip-title">
          <span class="title">{label(t())}</span>
          <Show when={rest()}>{r => <span class="rest"><span class="rest-name">{r().name}</span></span>}</Show>
        </span>
      </Show>
      <Show when={titled() && !addressing()}>
        <Show when={speaker()}>
          <button class="speaker" title={t().muted ? 'Unmute Tab' : 'Mute Tab'} onClick={e => { e.stopPropagation(); void cmd({ do: 'tab.mute', id: t().id, muted: !t().muted }) }}>
            {t().muted ? <G.speakerSlash pt={8} /> : <G.speaker pt={8} />}
          </button>
        </Show>
        <span class="strip-slot"><Show when={t().loading}><Ring /></Show></span>
      </Show>
      <Show when={(titled() || live()) && !addressing()}>
        <button class="strip-x" title={p.grouped && !t().asleep ? 'Put Away' : 'Close Tab'} onPointerDown={e => e.stopPropagation()}
          onClick={e => {
            e.stopPropagation()
            // Picked among others, its X closes all of them (§3.19).
            if (pickedAmongOthers(t().id)) void cmd({ do: 'tab.closeMany', ids: [...(state.picked ?? [])] })
            else void cmd({ do: 'tab.close', id: t().id })
          }}>
          <span class="disc">{p.grouped ? <G.minus pt={8} weight="semibold" /> : <G.xmark pt={8} weight="semibold" />}</span>
        </button>
      </Show>
    </div>
  )
}

function StripPin(p: { tab: TabView; gliding: boolean } & Coming) {
  let el!: HTMLDivElement
  const t = () => p.tab
  const pin = () => pinOf(t())
  comeAndGo(() => el, p, 0.9)
  return (
    <div ref={el} class="strip-pin" data-tab={p.leaving ? undefined : t().id} data-ghost-tab={p.leaving ? t().id : undefined}
      classList={{ live: t().id === state.activeID && !p.leaving, asleep: t().asleep, gliding: p.gliding, picked: picked(t().id), leaving: !!p.leaving }}
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
function StripGroup(p: { group: GroupView; tabs: TabView[]; each: number; titled: boolean; gliding: string | null; room?: number } & Coming) {
  let el!: HTMLDivElement
  const shown = () => (p.group.folded ? p.tabs.filter(t => t.id === state.activeID) : p.tabs)
  const each = held(() => !!p.leaving, () => p.each)
  const titled = held(() => !!p.leaving, () => p.titled)
  // A group comes and goes as a whole on SwiftUI's default, a fade (TabGroups.swift:323).
  comeAndGo(() => el, p, 1)
  const tabs = keepLeaving(shown, t => t.id, quietOn(() => !!p.leaving))
  return (
    <div ref={el} class="strip-group" classList={{ open: !p.group.folded, leaving: !!p.leaving }} style={{ '--band': p.group.colour ? groupColour(p.group.colour) : 'var(--g-tile)' }}>
      <div class="strip-group-name" style={{ width: `${measure(p.group.name) + 20}px` }}
        onClick={() => void cmd({ do: 'group.fold', id: p.group.id })}
        onContextMenu={e => { e.preventDefault(); e.stopPropagation(); openMenu(groupMenu(p.group.id), { x: e.clientX, y: e.clientY }, `group:${p.group.id}`) }}>
        {p.group.name}
      </div>
      <For each={tabs.keys()}>{k => (
        <Show when={tabs.item(k)}>{t => <StripTab tab={t()} width={each()} titled={titled()} gliding={p.gliding === k} grouped motion={p.motion} room={p.room}
          pair={pairSlot(shown(), k)} fresh={tabs.fresh(k)} leaving={tabs.leaving(k)} done={() => tabs.done(k)} />}</Show>
      )}</For>
    </div>
  )
}

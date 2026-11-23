// Settings' own controls, drawn by hand as the Mac draws them
// (Settings.swift:1246-1702, Plate.swift; studio/02 §4.6, studio/06 §1.0).

import { createEffect, createSignal, For, onMount, Show, type JSX } from 'solid-js'
import { Symbol } from './symbols'

/** On or off, in ink rather than in blue: 30 × 18 (Settings.swift:1598). */
export function Switch(p: { on: boolean; set: (on: boolean) => void; disabled?: boolean; label?: string }) {
  return (
    <button class="sw" classList={{ on: p.on }} role="switch" aria-checked={p.on} aria-label={p.label} disabled={p.disabled}
      onClick={() => p.set(!p.on)}>
      <span class="sw-knob" />
    </button>
  )
}

/** A small capsule that does one thing; filled in ink when it is the thing
 * you came here to press (Settings.swift:1676). */
export function Pill(p: { title: string; filled?: boolean; red?: boolean; disabled?: boolean; act: () => void; help?: string }) {
  return (
    <button class="pill-st" classList={{ filled: p.filled, red: p.red }} disabled={p.disabled} title={p.help} onClick={() => p.act()}>{p.title}</button>
  )
}

/** A row of choices in a grey track; the white slides to the one picked
 * (Settings.swift:1541). `wide` shares the width evenly. */
export function Segmented<T extends string | boolean>(p: { options: [T, string][]; value: T; set: (v: T) => void; wide?: boolean; max?: number }) {
  let track!: HTMLDivElement
  const [knob, setKnob] = createSignal<{ x: number; w: number } | null>(null)
  const [moved, setMoved] = createSignal(false)
  const place = () => {
    const i = p.options.findIndex(([v]) => v === p.value)
    const el = track?.children[i + 1] as HTMLElement | undefined
    if (el) setKnob({ x: el.offsetLeft, w: el.offsetWidth })
  }
  onMount(() => { place(); new ResizeObserver(place).observe(track); requestAnimationFrame(() => setMoved(true)) })
  createEffect(() => { void p.value; place() })
  return (
    <div class="seg" classList={{ wide: p.wide }} ref={track} style={p.max ? { 'max-width': `${p.max}px` } : undefined} role="radiogroup">
      <span class="seg-knob" classList={{ moved: moved() }} style={knob() ? { transform: `translateX(${knob()!.x - 2}px)`, width: `${knob()!.w}px` } : { opacity: 0 }} />
      <For each={p.options}>{([v, label]) => (
        <button class="seg-item" classList={{ on: v === p.value }} role="radio" aria-checked={v === p.value} onClick={() => p.set(v)}>{label}</button>
      )}</For>
    </div>
  )
}

/** Choices as small pictures, a ring around the one picked (Settings.swift:1353). */
export function Pictures<T>(p: { options: [T, string, () => JSX.Element][]; value: T; set: (v: T) => void }) {
  return (
    <div class="pics" role="radiogroup">
      <For each={p.options}>{([v, label, picture]) => (
        <button class="pic" classList={{ on: v === p.value }} role="radio" aria-checked={v === p.value} aria-label={label} onClick={() => p.set(v)}>
          <span class="pic-ring"><span class="pic-frame">{picture()}</span></span>
          <span class="pic-label">{label}</span>
        </button>
      )}</For>
    </div>
  )
}

/** A few things each shown or not, side by side (Settings.swift:1584). */
export function Ticks(p: { items: [string, boolean, (on: boolean) => void][] }) {
  return (
    <div class="ticks">
      <For each={p.items}>{([label, on, set]) => (
        <label class="tick"><input type="checkbox" checked={on} onChange={e => set(e.currentTarget.checked)} />{label}</label>
      )}</For>
    </div>
  )
}

/** − value +, one stop at a time; the value itself takes it home (Settings.swift:1619). */
export function Steps(p: { stops: number[]; value: number; home: number; label: (v: number) => string; set: (v: number) => void }) {
  const below = () => [...p.stops].reverse().find(s => s < p.value - 0.001)
  const above = () => p.stops.find(s => s > p.value + 0.001)
  return (
    <div class="steps">
      <button class="step" disabled={below() === undefined} onClick={() => below() !== undefined && p.set(below()!)} aria-label="Smaller"><Symbol name="minus" size={9} weight="semibold" /></button>
      <button class="steps-value" title={`Back to ${p.label(p.home)}`} onClick={() => p.set(p.home)}>{p.label(p.value)}</button>
      <button class="step" disabled={above() === undefined} onClick={() => above() !== undefined && p.set(above()!)} aria-label="Larger"><Symbol name="plus" size={9} weight="semibold" /></button>
    </div>
  )
}

/** For a feature that is simply there: a quiet word (Settings.swift:1339). */
export function Always(p: { text?: string }) {
  return <span class="always">{p.text ?? 'Always on'}</span>
}

/** A menu-style picker, its label hidden, as wide as its words. */
export function Menu<T extends string | number>(p: { options: ([T, string] | null)[]; value: T; set: (v: T) => void; label?: string; width?: number }) {
  return (
    <select class="menu" aria-label={p.label} style={p.width ? { width: `${p.width}px` } : undefined}
      onChange={e => { const raw = e.currentTarget.value; const o = p.options.find(x => x && String(x[0]) === raw); if (o) p.set(o[0]) }}>
      <For each={p.options}>{o => (o ? <option value={String(o[0])} selected={o[0] === p.value}>{o[1]}</option> : <option disabled>──────────</option>)}</For>
    </select>
  )
}

/** A group of rows, hairline between them (Plate.swift Card). */
export function Card(p: { children: JSX.Element; class?: string }) {
  return <div class={`card-st ${p.class ?? ''}`}>{p.children}</div>
}

export function Nothing(p: { text: string }) {
  return <div class="nothing">{p.text}</div>
}

/** A section's group: its small heading with an icon, then its card (Settings.swift:1246). */
export function GroupBlock(p: { title: string; icon: string; children: JSX.Element; id?: string }) {
  return (
    <section class="group" data-group={p.id}>
      <h3 class="group-head"><Symbol name={p.icon} size={10.5} weight="semibold" />{p.title.toUpperCase()}</h3>
      {p.children}
    </section>
  )
}

/** One setting: its icon in a soft tile, its words, the rest behind its (i),
 * its control (Settings.swift:1270). A wide control goes under the words. */
export function SettingRow(p: { id?: string; icon: string; title: string; detail: string; more?: string; wide?: boolean; lit?: boolean; dim?: boolean; control?: JSX.Element; after?: JSX.Element }) {
  const [open, setOpen] = createSignal(false)
  return (
    <div class="sr" classList={{ lit: p.lit, dim: p.dim }} data-row={p.id} aria-disabled={p.dim}>
      <div class="sr-main">
        <span class="sr-tile"><Symbol name={p.icon} size={12} weight="medium" /></span>
        <div class="sr-words">
          <div class="sr-title">
            <span>{p.title}</span>
            <Show when={p.more}>
              <button class="sr-info" title={p.more} aria-label={`More about ${p.title}`} onClick={() => setOpen(!open())}>
                <Symbol name={open() ? 'info.circle.fill' : 'info.circle'} size={10.5} weight="regular" />
              </button>
            </Show>
          </div>
          <Show when={p.detail}><div class="sr-detail">{p.detail}</div></Show>
          <Show when={open() && p.more}><div class="sr-more">{p.more}</div></Show>
        </div>
        <Show when={!p.wide && p.control}><div class="sr-control">{p.control}</div></Show>
      </div>
      <Show when={p.wide && p.control}><div class="sr-wide">{p.control}</div></Show>
    </div>
  )
}

/** A line with words and a control (Plate.swift Line). */
export function Line(p: { title: string; detail?: string; children?: JSX.Element; class?: string }) {
  return (
    <div class={`line ${p.class ?? ''}`}>
      <div class="line-words"><div class="line-title">{p.title}</div><Show when={p.detail}><div class="line-detail">{p.detail}</div></Show></div>
      <div class="line-control">{p.children}</div>
    </div>
  )
}

export function Caption(p: { text: string }) { return <div class="caption">{p.text}</div> }

/** The small grey capsule button of the lists (Plate.swift Quick). */
export function Quick(p: { title: string; act: () => void; red?: boolean; disabled?: boolean; help?: string }) {
  return <button class="quick" classList={{ red: p.red }} disabled={p.disabled} title={p.help} onClick={() => p.act()}>{p.title}</button>
}

/** Searching a list (Plate.swift Hunt). */
export function Hunt(p: { value: string; set: (v: string) => void; prompt?: string; ref?: (el: HTMLInputElement) => void }) {
  return (
    <div class="hunt">
      <Symbol name="magnifyingglass" size={11} weight="medium" />
      <input value={p.value} placeholder={p.prompt ?? 'Search'} aria-label={p.prompt ?? 'Search'} ref={p.ref}
        onInput={e => p.set(e.currentTarget.value)} onKeyDown={e => { if (e.key === 'Escape') { p.set(''); e.preventDefault() } }} />
      <Show when={p.value}><button class="hunt-clear" aria-label="Clear" onClick={() => p.set('')}><Symbol name="xmark.circle.fill" size={11} /></button></Show>
    </div>
  )
}

/** Oriel's pages that aren't Settings: the Plate in a tab (Plate.swift:41). */
export function PlatePage(p: { title: string; width?: number; children: JSX.Element; foot?: JSX.Element }) {
  return (
    <div class="plate-scroll">
      <div class="plate-page" style={{ 'max-width': `${p.width ?? 560}px` }}>
        <h1 class="plate-title">{p.title}</h1>
        {p.children}
        <Show when={p.foot}><div class="plate-foot">{p.foot}</div></Show>
        <div style={{ height: '12px' }} />
      </div>
    </div>
  )
}

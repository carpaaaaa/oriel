// Small pieces the extensions' places share: an extension's icon (its
// action's for the tab in front, its initial when there is none), the badge,
// and the symbols the Mac takes from SF Symbols (pin, gearshape, storefront,
// folder, ellipsis), drawn like the interface's own (lib/icons.tsx).

import { createSignal, createEffect, Show, type JSX } from 'solid-js'
import type { ExtView } from '../../shared/modules/extensions'
import type { Rect } from '../../shared/state'

type P = { size?: number; class?: string }
const svg = (d: () => JSX.Element) => (p: P) => (
  <svg width={p.size ?? 16} height={p.size ?? 16} viewBox="0 0 16 16" fill="none" stroke="currentColor"
    stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class={p.class} aria-hidden="true">{d()}</svg>
)

export const PinIcon = svg(() => <><path d="M6.2 2.5h3.6l-.5 4 2.2 2.2v1H4.5v-1l2.2-2.2z" /><path d="M8 9.7v3.8" /></>)
export const PinFill = (p: P) => (
  <svg width={p.size ?? 16} height={p.size ?? 16} viewBox="0 0 16 16" class={p.class} aria-hidden="true">
    <path d="M6.2 2.5h3.6l-.5 4 2.2 2.2v1H4.5v-1l2.2-2.2z" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
    <path d="M8 9.7v3.8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
  </svg>
)
export const Gear = svg(() => <><circle cx="8" cy="8" r="2.1" /><path d="M8 1.9v1.6M8 12.5v1.6M1.9 8h1.6M12.5 8h1.6M3.7 3.7l1.1 1.1M11.2 11.2l1.1 1.1M3.7 12.3l1.1-1.1M11.2 4.8l1.1-1.1" /></>)
export const Store = svg(() => <><path d="M2.6 6.4 3.6 3h8.8l1 3.4" /><path d="M2.6 6.4c0 1 .8 1.6 1.8 1.6s1.8-.6 1.8-1.6c0 1 .8 1.6 1.8 1.6s1.8-.6 1.8-1.6c0 1 .8 1.6 1.8 1.6s1.8-.6 1.8-1.6" /><path d="M3.6 8v5h8.8V8" /></>)
export const Folder = svg(() => <path d="M2.5 4.5c0-.6.4-1 1-1h3l1.4 1.5h4.6c.6 0 1 .4 1 1v6c0 .6-.4 1-1 1h-9c-.6 0-1-.4-1-1z" />)
export const Ellipsis = svg(() => <><circle cx="3.6" cy="8" r=".6" fill="currentColor" /><circle cx="8" cy="8" r=".6" fill="currentColor" /><circle cx="12.4" cy="8" r=".6" fill="currentColor" /></>)
export const ReloadIcon = svg(() => <><path d="M12.6 6.4A4.9 4.9 0 1 0 12.8 9" /><path d="M12.9 3.4v3.2H9.7" /></>)

/** Icon 15 in a 19 box on a button, 16 in a row (studio/04 §2.9). */
export function ExtIcon(p: { ext: ExtView; size: number }) {
  const [broken, setBroken] = createSignal(false)
  createEffect(() => { void p.ext.icon; setBroken(false) })
  return (
    <span class="ext-icon" classList={{ off: !p.ext.enabled }} style={{ width: `${p.size + 4}px`, height: `${p.size + 4}px` }}>
      <Show when={p.ext.icon && !broken()} fallback={
        <span class="ext-initial" style={{ width: `${p.size}px`, height: `${p.size}px`, 'font-size': `${p.size * 0.62}px`, 'border-radius': `${p.size * 0.28}px` }}>
          {(p.ext.name.trim()[0] ?? '?').toUpperCase()}
        </span>
      }>
        <img src={p.ext.icon!} width={p.size} height={p.size} draggable={false} onError={() => setBroken(true)} alt="" />
      </Show>
    </span>
  )
}

export function Badge(p: { ext: ExtView }) {
  return (
    <Show when={p.ext.badge?.text}>
      <span class="ext-badge" style={p.ext.badge?.colour ? { background: p.ext.badge.colour, color: '#FFFFFF' } : {}}>{p.ext.badge!.text}</span>
    </Show>
  )
}

export const rectOf = (el: Element): Rect => {
  const r = el.getBoundingClientRect()
  return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) }
}

/** The arrow of a card, inside the overlay's region (which starts `room`
 * before the card on every side). */
export function Arrow(p: { side: 'top' | 'bottom' | 'left' | 'right'; at: number; card: Rect; room: number }) {
  const along = () => (p.side === 'top' || p.side === 'bottom' ? p.at - p.card.x : p.at - p.card.y)
  const style = (): JSX.CSSProperties => {
    const a = Math.max(18, Math.min(along(), (p.side === 'top' || p.side === 'bottom' ? p.card.width : p.card.height) - 18))
    switch (p.side) {
      case 'top': return { left: `${p.room + a - 7}px`, top: `${p.room - 7}px` }
      case 'bottom': return { left: `${p.room + a - 7}px`, top: `${p.room + p.card.height - 7}px` }
      case 'left': return { left: `${p.room - 7}px`, top: `${p.room + a - 7}px` }
      default: return { left: `${p.room + p.card.width - 7}px`, top: `${p.room + a - 7}px` }
    }
  }
  return <span class="ext-arrow" style={style()} />
}

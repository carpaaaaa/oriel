// A tab carried from the column over the page (studio/01 §8.17; SplitView.swift
// SplitDropHint, SplitDropPreview; TabDrag.swift): two faint bands at the
// page's left and right edges, the only places where letting go splits it;
// in a band, the page as it would be, the carried page marked with its
// title. The column measures (splitHintAt) and carries on; the overlay,
// over the page, draws.

import { For, Show } from 'solid-js'
import type { OverlayLayer, TabView } from '../../shared/state'
import type { SplitDropHint } from '../../shared/modules/window'
import { state } from '../lib/store'
import { label } from '../sidebar/derive'

/** TabSplit.most: a split holds 4 pages at most (main/window/split.ts). */
const MOST = 4
/** TabDrag.band, .bandShare, .slack */
const BAND = 120
const SHARE = 0.24
const SLACK = 20

/** Whether `carried` can stand beside the ordinary tab `target`: not itself,
 * not a pin, not an empty page, both private or neither, and not in the
 * target's split already or past its 4 pages (Shift-drag onto a tab, drag.ts). */
export function canSplitWith(carried: TabView, target: TabView): boolean {
  if (carried.id === target.id || carried.pinID || carried.empty || target.pinID || target.empty || !!carried.shy !== !!target.shy) return false
  const split = state.splits.find(s => s.tabs.includes(target.id))
  return !(split && (split.tabs.includes(carried.id) || split.tabs.length >= MOST))
}

/** The bands and the side the point is in, over the page's card; null when
 * the point isn't over the card or the carried tab can't stand beside the
 * page in front ("a page can't be split with itself"). `was`: the side shown
 * before, kept 20 more before it gives (hysteresis). */
export function splitHintAt(x: number, y: number, carried: TabView, was: 'left' | 'right' | null, page?: string | null): SplitDropHint | null {
  const card = document.querySelector<HTMLElement>('.card')
  const active = page ?? state.activeID
  const target = state.tabs.find(t => t.id === active)
  if (!card || !target || target.id === carried.id) return null
  if (carried.pinID || carried.empty || target.empty || !!carried.shy !== !!target.shy) return null
  const split = state.splits.find(s => s.tabs.includes(target.id))
  if (split && (split.tabs.includes(carried.id) || split.tabs.length >= MOST)) return null
  const r = card.getBoundingClientRect()
  if (x < r.left || x > r.right || y < r.top || y > r.bottom) return null
  const band = Math.min(r.width / 2, Math.max(BAND, r.width * SHARE))
  let side: 'left' | 'right' | null = x < r.left + band ? 'left' : x > r.right - band ? 'right' : null
  if (!side && was === 'left' && x < r.left + band + SLACK) side = 'left'
  if (!side && was === 'right' && x > r.right - band - SLACK) side = 'right'
  const pages = (split?.tabs ?? [target.id]).map(id => state.tabs.find(t => t.id === id)).filter((t): t is TabView => !!t)
  const title = (t: TabView) => label(t) || 'New Tab'
  const panes = pages.map(t => ({ title: title(t), carried: false }))
  const mine = { title: title(carried), carried: true }
  return {
    rect: { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) },
    band: Math.round(band),
    side,
    panes: side === 'left' ? [mine, ...panes] : side === 'right' ? [...panes, mine] : panes,
    page: target.id,
  }
}

/** The overlay's panel. */
export function SplitDrop(p: { layer: OverlayLayer }) {
  const hint = () => (p.layer.kind === 'panel' ? (p.layer.data as SplitDropHint | undefined) : undefined)
  return (
    <Show when={hint()}>{h => (
      <div class="split-drop" data-window-ui="split-drop">
        <Show when={h().side} fallback={<>
          <div class="split-band left" style={{ width: `${h().band - 12}px` }}><BandIcon /></div>
          <div class="split-band right" style={{ width: `${h().band - 12}px` }}><BandIcon /></div>
        </>}>
          <div class="split-preview">
            <For each={h().panes}>{pane => (
              <div class="split-half" classList={{ carried: pane.carried }}><span>{pane.title}</span></div>
            )}</For>
          </div>
        </Show>
      </div>
    )}</Show>
  )
}

/** rectangle.split.2x1, 15 pt. */
function BandIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3">
      <rect x="1.5" y="3" width="13" height="10" rx="2" /><path d="M8 3v10" />
    </svg>
  )
}

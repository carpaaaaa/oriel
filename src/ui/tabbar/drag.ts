// A tab carried along the strip (studio/01 §4.22-§4.24, §8.17; TabBar.swift,
// TabDrag.swift): after 5 points it lifts and follows the pointer; over the
// tabs a mark shows where it would land, among the tabs of its own block (the
// loose ones, or its group's); let go, it lands there. With Shift held over
// another tab, that tab is marked instead, and letting go puts the two side
// by side (carpa, 25 Nov 2026), Shift pressed or let go mid-carry as the mark
// follows it. With Settings › Tabs › Split View without Shift on (tabs.splitDrop),
// the middle half of a tab is the target with no key held. Over the page the bands of Split View show, as for a tab carried
// from the column (drag.ts there). Escape while held puts it back. Pointer
// events, never HTML5 drag.

import { createSignal, batch } from 'solid-js'
import { state, cmd } from '../lib/store'
import type { TabView } from '../../shared/state'
import type { SplitDropHint } from '../../shared/modules/window'
import { splitHintAt, canSplitWith } from '../chrome/SplitDrop'
import { setDropTarget } from '../sidebar/ui'
import { pref } from '../sidebar/derive'

/** The tab lifted, and how far it hangs from where it stood. */
export const [lifted, setLifted] = createSignal<{ id: string; dx: number; dy: number; faded: boolean } | null>(null)
/** The tab the carried one would land beside, and on which side. */
export const [stripMark, setStripMark] = createSignal<{ id: string; after: boolean } | null>(null)

const THRESHOLD = 5

let held: {
  id: string
  el: HTMLElement
  x0: number; y0: number
  pointer: number
  carrying: boolean
  shift: boolean
  last: { x: number; y: number }
  /** The page in front before the press opened the carried tab. */
  cameFrom: string | null
  broughtBack: boolean
  split: SplitDropHint | null
  /** Shift held on another tab: let go, it splits with that tab. */
  onto: string | null
  /** Where it lands in the row (tab.move's place), when shown. */
  to: number | null
  /** What a press with Ctrl or Shift does, kept for the button up unless a carry starts. */
  after: (() => void) | null
} | null = null

/** A press on a tab of the strip that can be carried (not a pin). */
export function press(e: PointerEvent, id: string, after: (() => void) | null): void {
  if (e.button !== 0) return
  held = {
    id, el: e.currentTarget as HTMLElement, x0: e.clientX, y0: e.clientY, pointer: e.pointerId, carrying: false,
    shift: e.shiftKey, last: { x: e.clientX, y: e.clientY }, cameFrom: state.activeID ?? null, broughtBack: false,
    split: null, onto: null, to: null, after,
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onCancel)
  window.addEventListener('keydown', onKey, true)
  window.addEventListener('keyup', onKey, true)
}

function onMove(e: PointerEvent): void {
  if (!held) return
  held.shift = e.shiftKey
  held.last = { x: e.clientX, y: e.clientY }
  follow()
}

/** The carry at the pointer's last place: on every move, and when Shift comes or goes. */
function follow(): void {
  if (!held) return
  const { x, y } = held.last
  const dx = x - held.x0, dy = y - held.y0
  if (!held.carrying) {
    if (Math.hypot(dx, dy) < THRESHOLD) return
    held.carrying = true
    try { held.el.setPointerCapture(held.pointer) } catch { /* a synthetic pointer */ }
    document.documentElement.classList.add('carrying')
  }
  const tab = state.tabs.find(t => t.id === held!.id)
  if (!tab) { end(); return }
  if (overPage(tab, x, y, dx, dy)) return
  const hang = (faded: boolean) => setLifted({ id: tab.id, dx, dy: Math.max(-6, Math.min(6, dy)), faded })
  const bar = document.querySelector('.tabbar')?.getBoundingClientRect()
  const inStrip = !!bar && y >= bar.top && y <= bar.bottom
  const others = inStrip ? tabRects(tab.id) : []
  // Shift held on another tab (or, tabs.splitDrop on, its middle): that tab
  // is the target, nothing makes room. Its edges are for moving among the tabs.
  const inMiddle = (o: Rect) => { const w = o.right - o.left; return x >= o.left + w * 0.25 && x <= o.right - w * 0.25 }
  const target = others.find(o => x >= o.left && x <= o.right && canSplitWith(tab, o.tab) && (held!.shift || (pref('tabs.splitDrop', false) && inMiddle(o))))
  held.onto = target?.tab.id ?? null
  if (target) {
    held.to = null
    batch(() => { hang(false); setStripMark(null); setDropTarget(`s:${target.tab.id}`) })
    return
  }
  const slot = inStrip && !tab.pinID ? slotAt(tab, others, x) : null
  held.to = slot?.to ?? null
  batch(() => { hang(false); setDropTarget(null); setStripMark(slot?.mark ?? null) })
}

// over the page: the bands at its edges (studio/01 §8.17)

function overPage(tab: TabView, x: number, y: number, dx: number, dy: number): boolean {
  if (!held) return false
  // The press opened the carried tab: over the page, the page from before
  // comes back, to be split with (TabDrag.bringBack, §8.17).
  const opened = state.activeID === tab.id
  const page = opened && held.cameFrom && held.cameFrom !== tab.id ? held.cameFrom : state.activeID ?? null
  const hint = splitHintAt(x, y, tab, held.split?.side ?? null, page)
  if (hint && opened && page && page !== tab.id && !held.broughtBack) { held.broughtBack = true; void cmd({ do: 'tab.select', id: page }) }
  const was = held.split
  held.split = hint
  if (!hint) {
    if (was) void cmd({ do: 'split.dropHint', hint: null })
    return false
  }
  if (!was || was.side !== hint.side || was.rect.width !== hint.rect.width || was.rect.x !== hint.rect.x) void cmd({ do: 'split.dropHint', hint })
  held.onto = null
  held.to = null
  batch(() => { setLifted({ id: tab.id, dx, dy: Math.max(-6, Math.min(6, dy)), faded: true }); setStripMark(null); setDropTarget(null) })
  return true
}

// where it lands

interface Rect { tab: TabView; left: number; right: number }

/** The other tabs of the strip as drawn, by the tab's own rectangle. */
function tabRects(except: string): Rect[] {
  const out: Rect[] = []
  for (const el of document.querySelectorAll<HTMLElement>('.strip-row .strip-tab[data-tab]')) {
    const tab = state.tabs.find(t => t.id === el.dataset.tab)
    if (!tab || tab.id === except) continue
    const r = el.getBoundingClientRect()
    out.push({ tab, left: r.left, right: r.right })
  }
  return out
}

/** The tabs of the block `t` stands in: its group's, or the loose ones. */
function blockOf(t: TabView): TabView[] {
  const known = new Set(state.groups.map(g => g.id))
  return t.groupID && known.has(t.groupID)
    ? state.tabs.filter(x => !x.pinID && x.groupID === t.groupID)
    : state.tabs.filter(x => !x.pinID && !(x.groupID && known.has(x.groupID)))
}

/** A split goes as one, from either of its pages (Model.moveTab). */
const unitOf = (t: TabView): Set<string> => new Set(state.splits.find(s => s.tabs.includes(t.id))?.tabs ?? [t.id])

/** The place among the block's other tabs for a point: before the first
 * whose middle is past it, a split counted as one tab; and the mark that
 * shows it. */
function slotAt(tab: TabView, drawn: Rect[], x: number): { to: number; mark: { id: string; after: boolean } | null } | null {
  const unit = unitOf(tab)
  const block = blockOf(tab).filter(t => !unit.has(t.id))
  const known = new Set(state.groups.map(g => g.id))
  // The drawn ones of the block, with the room a split's pages take together.
  const mine = drawn.filter(r => block.some(b => b.id === r.tab.id))
  const units: { first: Rect; last: Rect }[] = []
  for (const r of mine) {
    const split = state.splits.find(s => s.tabs.includes(r.tab.id))
    const prev = units[units.length - 1]
    if (prev && split && split.tabs.includes(prev.last.tab.id)) prev.last = r
    else units.push({ first: r, last: r })
  }
  const at = units.findIndex(u => x < (u.first.left + u.last.right) / 2)
  let index: number, mark: { id: string; after: boolean } | null = null
  if (at < 0) {
    const end = units[units.length - 1]
    index = end ? block.findIndex(b => b.id === end.last.tab.id) + 1 : block.length
    mark = end ? { id: end.last.tab.id, after: true } : null
  } else {
    index = block.findIndex(b => b.id === units[at].first.tab.id)
    mark = { id: units[at].first.tab.id, after: false }
  }
  if (index < 0) return null
  // The row is the pins, each group's tabs in the groups' order, then the loose ones.
  const grouped = (g: string) => state.tabs.filter(t => !t.pinID && t.groupID === g && !unit.has(t.id)).length
  let before = 0
  if (tab.groupID && known.has(tab.groupID)) {
    for (const g of state.groups) { if (g.id === tab.groupID) break; before += grouped(g.id) }
  } else before = state.groups.reduce((n, g) => n + grouped(g.id), 0)
  const pins = state.tabs.filter(t => t.pinID).length
  return { to: pins + before + index, mark }
}

// letting go

function onUp(): void {
  if (!held) return
  const h = held
  end()
  if (!h.carrying) { h.after?.(); return }
  // The click that ends a carry isn't a click.
  const swallow = (e: Event) => { e.stopPropagation(); e.preventDefault() }
  window.addEventListener('click', swallow, { capture: true, once: true })
  setTimeout(() => window.removeEventListener('click', swallow, true), 0)
  // Shift held over another tab: the two side by side, the carried one on the right.
  if (h.onto) { void cmd({ do: 'split.pair', id: h.id, side: 'right', target: h.onto }); return }
  // Let go in a band: beside the page; over the page elsewhere, nothing.
  if (h.split) { if (h.split.side) void cmd({ do: 'split.pair', id: h.id, side: h.split.side, target: h.split.page }); return }
  if (h.to !== null) void cmd({ do: 'tab.move', id: h.id, to: h.to })
}

function onCancel(): void { if (held) end() }
function onKey(e: KeyboardEvent): void {
  if (!held?.carrying) return
  if (e.key === 'Escape' && e.type === 'keydown') { e.preventDefault(); e.stopPropagation(); end() }
  // Shift pressed or let go with the pointer still: the mark follows it.
  else if (e.key === 'Shift' && held.shift !== (e.type === 'keydown')) { held.shift = e.type === 'keydown'; follow() }
}

function end(): void {
  if (held?.split) void cmd({ do: 'split.dropHint', hint: null })
  held = null
  window.removeEventListener('pointermove', onMove)
  window.removeEventListener('pointerup', onUp)
  window.removeEventListener('pointercancel', onCancel)
  window.removeEventListener('keydown', onKey, true)
  window.removeEventListener('keyup', onKey, true)
  document.documentElement.classList.remove('carrying')
  batch(() => { setLifted(null); setStripMark(null); setDropTarget(null) })
}

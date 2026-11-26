// Split View: 2 to 4 pages side by side in the card's place (studio/01 §8.12,
// §8.13, §8.14, §8.19, §8.24, §8.26). The split lives in the window's record
// (record.splits, SplitView of shared/state); the interface lays the pages
// out and sends one slot per page (layout.slots); the page with the keys is
// the window's active tab.

import type { SplitView } from '../../shared/state'
import { SPLIT_DROP } from '../../shared/modules/window'
import { handle } from '../router'
import { model, type WindowRecord } from '../model/model'
import { need } from '../context'
import { allControllers, overlayFree, type WindowController } from '../views/window'

/** TabSplit.most */
export const MOST = 4

const even = (n: number) => Array.from({ length: n }, () => 1 / n)

/** TabSplit.clamp: shares of at least 0.2 with two pages, 0.1 with more. */
export function clampSizes(sizes: number[]): number[] {
  const n = sizes.length
  const least = n === 2 ? 0.2 : 0.1
  const total = sizes.reduce((a, b) => a + b, 0) || 1
  let s = sizes.map(x => Math.max(least, x / total))
  const sum = s.reduce((a, b) => a + b, 0)
  s = s.map(x => x / sum)
  return s
}

export function splitOf(win: WindowRecord, id: string | null | undefined): SplitView | undefined {
  return id ? win.splits.find(s => s.tabs.includes(id)) : undefined
}

function touch(win: WindowRecord): void { model.touch(win, ['splits']) }

/** §8.19: on a single page, an empty page beside it with the keys; on a
 * split, separate it (the page with the keys stays in front). */
export function toggleSplit(c: WindowController): void {
  const win = c.record
  const id = win.active[win.space]
  if (!id) return
  const split = splitOf(win, id)
  if (split) {
    win.splits = win.splits.filter(s => s !== split)
    touch(win)
    return
  }
  const tab = model.tabs.get(id)
  if (!tab || tab.empty) return
  const fresh = model.addTab(win, { empty: true, after: id, groupID: tab.groupID })
  win.splits = [...win.splits, { tabs: [id, fresh.id], axis: 'horizontal', sizes: even(2), focused: fresh.id }]
  touch(win)
  c.ui.webContents.focus()
}

/** The page with the keys, remembered by its split (§8.12). */
export function noteFocus(win: WindowRecord, id: string): void {
  const split = splitOf(win, id)
  if (!split || split.focused === id) return
  win.splits = win.splits.map(s => (s === split ? { ...s, focused: id } : s))
  touch(win)
}

model.on('selected', (win: WindowRecord, id: string) => noteFocus(win, id))

// Model.close leaves the split without saying so ('splits' isn't touched):
// send the splits again whenever a tab goes (asked of the tabs module).
model.on('tab-closed', () => { for (const c of allControllers()) c.mark('splits') })

/** §8.24: the page on the left or right, one at a time, not wrapping;
 * "other" goes round (Focus Other Page). */
function focusBeside(c: WindowController, side: 'left' | 'right' | 'other'): void {
  const win = c.record
  const split = splitOf(win, win.active[win.space])
  if (!split) return
  const i = split.tabs.indexOf(win.active[win.space]!)
  const next = side === 'other' ? split.tabs[(i + 1) % split.tabs.length] : split.tabs[i + (side === 'left' ? -1 : 1)]
  if (!next) return
  model.selectTab(win, next)
  c.focusPage()
}

/** §8.27: Swap Pages (two pages trade places, the shares with them). */
function swap(c: WindowController): void {
  const win = c.record
  const split = splitOf(win, win.active[win.space])
  if (!split) return
  win.splits = win.splits.map(s => (s === split ? { ...s, tabs: [...s.tabs].reverse(), sizes: [...s.sizes].reverse() } : s))
  touch(win)
}

/** §8.27: Separate: every page a tab again, the one with the keys in front. */
function separate(c: WindowController): void {
  const win = c.record
  const split = splitOf(win, win.active[win.space])
  if (!split) return
  win.splits = win.splits.filter(s => s !== split)
  touch(win)
}

handle('split.toggle', (_a, ctx) => toggleSplit(need(ctx)))
handle('split.focus', ({ side }, ctx) => focusBeside(need(ctx), side))
handle('split.swap', (_a, ctx) => swap(need(ctx)))
handle('split.separate', (_a, ctx) => separate(need(ctx)))
// A tab carried from the column over the page (§8.17): the bands and the
// preview are drawn in the overlay, over the page, where the interface
// can't draw; the pointer stays the column's until it is let go.

const showingDrop = (c: WindowController) => c.overlayLayer.kind === 'panel' && c.overlayLayer.name === SPLIT_DROP

handle('split.dropHint', ({ hint }, ctx) => {
  const c = need(ctx)
  if (!hint) { if (showingDrop(c)) c.sendOverlay({ kind: 'none' }); return }
  // Something else over the page (the field, a menu) goes first.
  if (!overlayFree(c.overlayLayer) && !showingDrop(c)) return
  c.sendOverlay({ kind: 'panel', name: SPLIT_DROP, data: hint })
  c.setOverlayRegion(hint.rect, false)
})

/** Browser.pair: the carried tab leaves a split of its own, goes in the row
 * right beside the page it was let go on, takes that page's group, joins its
 * split (shares made even) or makes a pair with it, and takes the keys. */
export function pair(c: WindowController, id: string, side: 'left' | 'right', page?: string): boolean {
  const win = c.record
  const target = page && model.spaceTabs(win).includes(page) ? page : win.active[win.space]
  const t = model.tabs.get(id), g = target ? model.tabs.get(target) : undefined
  if (!t || !g || !target || id === target || t.pinID || t.empty || g.empty || !!t.shy !== !!g.shy) return false
  const into = splitOf(win, target)
  if (into?.tabs.includes(id) || (into && into.tabs.length >= MOST)) return false
  // Out of a split of its own first.
  win.splits = win.splits.flatMap(s => {
    if (!s.tabs.includes(id)) return [s]
    const tabs = s.tabs.filter(x => x !== id)
    if (tabs.length < 2) return []
    const sizes = s.sizes.filter((_, i) => s.tabs[i] !== id)
    const sum = sizes.reduce((a, b) => a + b, 0) || 1
    return [{ ...s, tabs, sizes: sizes.map(x => x / sum), focused: s.focused === id ? tabs[0] : s.focused }]
  })
  if ((t.groupID ?? null) !== (g.groupID ?? null)) model.moveToGroup(win, [id], g.groupID ?? null)
  // In the row beside the page (beside the split's end on that side).
  const pages = splitOf(win, target)?.tabs ?? [target]
  const row = model.spaceTabs(win).filter(x => x !== id)
  const at = side === 'left' ? row.indexOf(pages[0]) : row.indexOf(pages[pages.length - 1]) + 1
  if (at >= 0) model.moveTab(win, id, at)
  const now = splitOf(win, target)
  if (now) {
    const tabs = side === 'left' ? [id, ...now.tabs] : [...now.tabs, id]
    win.splits = win.splits.map(s => (s === now ? { ...s, tabs, sizes: even(tabs.length), focused: id } : s))
  } else {
    win.splits = [...win.splits, { tabs: side === 'left' ? [id, target] : [target, id], axis: 'horizontal', sizes: even(2), focused: id }]
  }
  touch(win)
  model.selectTab(win, id)
  c.focusPage()
  return true
}

handle('split.pair', ({ id, side, target }, ctx) => {
  const c = need(ctx)
  if (showingDrop(c)) c.sendOverlay({ kind: 'none' })
  return { paired: pair(c, id, side === 'left' ? 'left' : 'right', typeof target === 'string' ? target : undefined) }
})

handle('split.resize', ({ first, sizes }, ctx) => {
  const win = need(ctx).record
  const split = win.splits.find(s => s.tabs[0] === first)
  if (!split || sizes.length !== split.tabs.length) return
  win.splits = win.splits.map(s => (s === split ? { ...s, sizes: clampSizes(sizes) } : s))
  touch(win)
})


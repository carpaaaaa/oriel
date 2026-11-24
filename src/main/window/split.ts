// Split View: 2 to 4 pages side by side in the card's place (studio/01 §8.12,
// §8.13, §8.14, §8.19, §8.24, §8.26). The split lives in the window's record
// (record.splits, SplitView of shared/state); the interface lays the pages
// out and sends one slot per page (layout.slots); the page with the keys is
// the window's active tab.

import type { SplitView } from '../../shared/state'
import { handle } from '../router'
import { model, type WindowRecord } from '../model/model'
import { need } from '../context'
import { allControllers, type WindowController } from '../views/window'

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
handle('split.resize', ({ first, sizes }, ctx) => {
  const win = need(ctx).record
  const split = win.splits.find(s => s.tabs[0] === first)
  if (!split || sizes.length !== split.tabs.length) return
  win.splits = win.splits.map(s => (s === split ? { ...s, sizes: clampSizes(sizes) } : s))
  touch(win)
})


// The sign's menu (TranslateMenu, studio/03 §6.3): a small card hanging
// under the sign, in the overlay: what the translation is doing, Show
// Original, and "Translated on this PC. Nothing is sent anywhere." It goes
// when the page goes, on Show Original, or when anything else floats.
// Owned by the translate module.

import { handle } from '../router'
import { need } from '../context'
import { model } from '../model/model'
import { controllerFor, type WindowController } from '../views/window'
import type { ID } from '../../shared/state'
import type { TranslateTab } from '../../shared/modules/translate'

export const MENU = { width: 270, room: 14, full: 116, failed: 58 }

/** Per window: the tab whose menu is open. */
const open = new Map<ID, ID>()
let markOf: (tab: ID) => TranslateTab | null = () => null

const mine = (c: WindowController) => c.overlayLayer.kind === 'panel' && c.overlayLayer.name === 'translate.menu'

export function menuOpenFor(tab: ID): boolean { return [...open.values()].includes(tab) }

export function hideMenu(tab: ID): void {
  for (const [win, t] of open) {
    if (t !== tab) continue
    open.delete(win)
    const c = controllerFor(win)
    if (c && !c.base.isDestroyed() && mine(c)) c.sendOverlay({ kind: 'none' })
  }
}

function show(c: WindowController, tab: ID, anchor: { x: number; y: number }): void {
  const mark = markOf(tab)
  if (!mark) return
  const b = c.base.getContentBounds()
  // Inside the window drawn, not in the clear margin its shadow lies in;
  // the card's own room for its shadow may go over the edge.
  const m = c.frame.margin()
  const height = mark.phase === 'failed' ? MENU.failed : MENU.full
  const width = MENU.width + MENU.room * 2
  const x = Math.max(m.left + 8 - MENU.room, Math.min(b.width - m.right - 8 + MENU.room - width, Math.round(anchor.x - width / 2)))
  const y = Math.max(0, Math.round(anchor.y + 4 - MENU.room))
  open.set(c.record.id, tab)
  c.sendOverlay({ kind: 'panel', name: 'translate.menu', data: { tab } })
  c.setOverlayRegion({ x, y, width, height: height + MENU.room * 2 }, true)
}

export function setupMenu(marks: (tab: ID) => TranslateTab | null): void { markOf = marks }

handle('translate.menu', ({ anchor }, ctx) => {
  const c = need(ctx)
  const tab = c.record.active[c.record.space]
  if (!tab) return { open: false }
  if (open.get(c.record.id) === tab && mine(c)) { hideMenu(tab); return { open: false } }
  show(c, tab, anchor ?? { x: 120, y: 40 })
  return { open: true }
})

handle('translate.menuClose', (_a, ctx) => {
  const c = need(ctx)
  const tab = open.get(c.record.id)
  if (tab) hideMenu(tab)
})

// The card goes when another tab comes to the front, or anything else takes
// the overlay's place.
model.on('window-changed', (id: ID) => {
  const tab = open.get(id)
  const c = controllerFor(id)
  if (!tab || !c) return
  if (!mine(c) || c.record.active[c.record.space] !== tab) {
    open.delete(id)
    if (mine(c)) c.sendOverlay({ kind: 'none' })
  }
})

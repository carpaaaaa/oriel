// The address line: Settings › Appearance › Window › Always show the address
// bar (`address.shown`; studio/03 §1.6, studio/01 §4.3, §5.5; AddressLine.swift).
// A row as tall as a tab shows the page's address; a click on it, or Ctrl+L
// with it in sight, brings ⌘L's own field in that row, and its places hang
// under the row at its width. A click anywhere else puts it away, as Escape
// does. The row is the interface's (ui/field/AddressLine.tsx); the field and
// its list are the field module's (commands.ts, `inline`). Owned by the field module.

import { handle } from '../router'
import { model } from '../model/model'
import { controllerFor, type WindowController } from '../views/window'
import { need } from '../context'
import { blankInFront, dismiss, edit, mem, putAway } from './commands'

/** The places' rows: 9 above and below a line of 16, as Field.tsx's. */
const ROW = 34
/** Clear room round the list for its shadow, as the tab's list has (tabedit.ts). */
const ROOM = 8

/** Whether the line is on screen for this window: the setting, the column or
 * strip not folded away, and not the column of icons, which has no room for it
 * (Side.swift:277 sits in the titled column only). */
export function lineShown(c: WindowController): boolean {
  if (!model.pref<boolean>('address.shown')) return false
  const sb = c.record.sidebar
  if (sb.folded) return false
  if (sb.layout === 'top') return true
  return !(sb.icons || (model.pref<boolean>('sidebar.narrowIcons') && model.pref<boolean>('sidebar.narrowed')))
}

/** Ctrl+L (⌘L): with the line in sight its field, in the line; else the
 * field over the page. A peek in front keeps the field over the page. */
export function openAddress(c: WindowController): void {
  const peek = c.overlayLayer.kind === 'panel' && c.overlayLayer.name === 'pages.peek'
  edit(c, lineShown(c) && !peek)
}

/** A click on the line (AddressLine.onTapGesture): its field, unless one is
 * up already. On a blank tab the line says what to type and the tab's own
 * field takes the keys. */
function begin(c: WindowController): void {
  if (mem(c).editing && !blankInFront(c)) return
  edit(c, true)
}

/** The places hang under the row at its width, in an overlay sized to them
 * (Omnibox listOnly, AddressLine: 4 under the line); nothing to show, none. */
export function placeLine(c: WindowController): void {
  const m = mem(c)
  const layer = c.overlayLayer.kind as string
  const rows = m.offers.length + (m.offer ? 1 : 0)
  if (!m.inline || !m.editing || !m.anchor || !rows) {
    if (layer === 'lineOffers') c.sendOverlay({ kind: 'none' })
    return
  }
  if (layer !== 'none' && layer !== 'lineOffers') return
  const ui = c.ui.getBounds()
  const a = m.anchor
  const { width: winW, height: winH } = c.base.getContentBounds()
  const width = Math.round(a.width) + 2 * ROOM
  const x = Math.round(Math.max(0, Math.min(ui.x + a.x - ROOM, winW - width)))
  const y = Math.round(ui.y + a.y + a.height + 4 - ROOM)
  const height = Math.round(Math.min(rows * ROW + 12 + 2 + 2 * ROOM + ROOM, winH - y))
  const was = c.overlay.getBounds()
  if (layer === 'lineOffers' && was.x === x && was.y === y && was.width === width && was.height === height) return
  if (layer !== 'lineOffers') c.sendOverlay({ kind: 'lineOffers' } as never)
  c.setOverlayRegion({ x, y, width, height }, false)
}

// commands

handle('field.line', (_a, ctx) => begin(need(ctx)))

handle('field.lineAnchor', ({ rect }, ctx) => {
  const c = need(ctx)
  mem(c).anchor = rect
  placeLine(c)
})

/** When each window last lost the keys to another program. */
const left = new WeakMap<WindowController, number>()
model.on('window-opened', (id: string) => setImmediate(() => {
  const c = controllerFor(id)
  if (c) c.base.on('blur', () => left.set(c, Date.now()))
}))

/** The line's input let go of the keys: a click on the page or on the
 * interface puts the field away as Escape does, after a beat so a click on
 * one of its places, which takes the keys too, lands first. Going to another
 * program is not a click: the field stays as it was, as the Mac's monitor of
 * clicks leaves it. */
handle('field.lineBlur', (_a, ctx) => {
  const c = need(ctx)
  const m = mem(c)
  if (!m.inline || !m.editing) return
  setTimeout(() => {
    if (c.base.isDestroyed() || !m.inline || !m.editing) return
    if (c.ui.webContents.isFocused() || c.overlay.webContents.isFocused()) return
    if (Date.now() - (left.get(c) ?? 0) < 600) return
    dismiss(c)
  }, 150)
})

// The line gone from the window (the column or strip folded, the setting
// turned off) with its field up: the field goes too.
model.on('window-changed', (id: string, slices: string[]) => {
  if (!slices.includes('sidebar') && !slices.includes('prefs')) return
  const c = controllerFor(id)
  if (!c) return
  const m = mem(c)
  if (m.inline && m.editing && !lineShown(c)) putAway(c)
})

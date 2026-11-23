// An extension's popup (studio/04 §2.4): Oriel's own view of the popup page,
// in the profile's session, on top of the window and hung from the button
// that was pressed; the overlay draws its card and arrow behind it.
//   - Size as Chrome: the page's preferred size within 25..800 x 25..600.
//     It loads unseen, shows once measured (or after 5 s at the last size,
//     360 x 240 the first time); for 2 s it follows the page both ways, then
//     only grows.
//   - White behind the page, as in Chrome. Escape, a click elsewhere, the
//     button again or window.close() close it.
//   - A link that opens a window opens a tab in front instead, and closes it
//     (Raindrop's "Sign in").

import { WebContentsView, type Session } from 'electron'
import type { Rect } from '../../shared/state'
import { CARD_ROOM } from '../../shared/modules/extensions'
import type { WindowController } from '../views/window'
import { run } from '../router'

const MIN = 25, MAX_W = 800, MAX_H = 600
const FIRST = { width: 360, height: 240 }
/** Room around the card for its shadow and arrow. */
export const POP_ROOM = CARD_ROOM
export const POP_RADIUS = 12
const GAP = 6

export interface Popup {
  id: string
  c: WindowController
  view: WebContentsView
  anchor: Rect
  size: { width: number; height: number }
  shown: boolean
  opened: number
  placed: { rect: Rect; arrow: { side: 'top' | 'bottom' | 'left' | 'right'; at: number } } | null
}

const open = new Map<WindowController, Popup>()
const lastSize = new Map<string, { width: number; height: number }>()
/** Closed by a click elsewhere: if that click was on its own button, the
 * press that follows must not open it again (within 1.5 s, as on the Mac). */
const blurred = new Map<WindowController, { id: string; at: number }>()
const watched = new WeakSet<WindowController>()

export function closedRecently(c: WindowController, id: string): boolean {
  const b = blurred.get(c)
  blurred.delete(c)
  return !!b && b.id === id && Date.now() - b.at < 1500
}
let changed: (c: WindowController) => void = () => {}
export function onPopupChange(f: (c: WindowController) => void): void { changed = f }

export function popupOf(c: WindowController): Popup | undefined { return open.get(c) }
export function popupByContents(wc: Electron.WebContents): Popup | undefined {
  for (const p of open.values()) if (p.view.webContents === wc) return p
}

/** Where the card goes: beside the column's foot, toward the page, or under
 * a button at the top; always inside the window. */
export function placeBeside(c: WindowController, anchor: Rect, size: { width: number; height: number }): Popup['placed'] {
  const { width: W, height: H } = c.base.getContentBounds()
  const w = Math.min(size.width, W - 16), h = Math.min(size.height, H - 16)
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, hi))
  const sb = c.record.sidebar
  const cx = anchor.x + anchor.width / 2, cy = anchor.y + anchor.height / 2
  if (sb.layout === 'side' && cy > H / 2) {
    const left = sb.side === 'left'
    const x = left ? anchor.x + anchor.width + GAP : anchor.x - GAP - w
    const y = clamp(cy - h / 2, 8, H - h - 8)
    return { rect: { x: Math.round(clamp(x, 8, W - w - 8)), y: Math.round(y), width: w, height: h }, arrow: { side: left ? 'left' : 'right', at: Math.round(cy) } }
  }
  const below = anchor.y + anchor.height + GAP
  const up = below + h > H - 8
  const x = clamp(cx - w / 2, 8, W - w - 8)
  const y = up ? Math.max(8, anchor.y - GAP - h) : below
  return { rect: { x: Math.round(x), y: Math.round(y), width: w, height: h }, arrow: { side: up ? 'bottom' : 'top', at: Math.round(cx) } }
}

function place(p: Popup): void {
  if (p.view.webContents.isDestroyed()) return
  p.placed = placeBeside(p.c, p.anchor, p.size)
  const r = p.placed!.rect
  p.view.setBounds(r)
  if (p.shown) {
    p.c.setOverlayRegion({ x: r.x - POP_ROOM, y: r.y - POP_ROOM, width: r.width + POP_ROOM * 2, height: r.height + POP_ROOM * 2 }, false)
  }
  changed(p.c)
}

function show(p: Popup): void {
  if (p.shown || p.view.webContents.isDestroyed()) return
  p.shown = true
  p.c.sendOverlay({ kind: 'panel', name: 'ext.popup' })
  place(p)
  p.view.setVisible(true)
  p.view.webContents.focus()
}

export function closePopup(c: WindowController): void {
  const p = open.get(c)
  if (!p) return
  open.delete(c)
  lastSize.set(p.id, p.size)
  try { c.base.contentView.removeChildView(p.view) } catch { /* window gone */ }
  if (!p.view.webContents.isDestroyed()) p.view.webContents.close()
  if (c.overlayLayer.kind === 'panel' && c.overlayLayer.name === 'ext.popup') c.sendOverlay({ kind: 'none' })
  changed(c)
}

export function openPopup(c: WindowController, profile: Session, id: string, url: string, anchor: Rect): void {
  closePopup(c)
  const view = new WebContentsView({
    webPreferences: { session: profile, sandbox: true, contextIsolation: true, nodeIntegration: false, enablePreferredSizeMode: true, backgroundThrottling: false },
  })
  view.setBackgroundColor('#FFFFFF')
  view.setBorderRadius(POP_RADIUS)
  view.setVisible(false)
  const p: Popup = { id, c, view, anchor, size: { width: MIN, height: MIN }, shown: false, opened: Date.now(), placed: null }
  open.set(c, p)
  c.base.contentView.addChildView(view)
  const wc = view.webContents
  place(p)

  wc.on('preferred-size-changed', (_e, s) => {
    const width = Math.max(MIN, Math.min(MAX_W, Math.ceil(s.width)))
    const height = Math.max(MIN, Math.min(MAX_H, Math.ceil(s.height)))
    const early = Date.now() - p.opened < 2000
    p.size = early ? { width, height } : { width: Math.max(width, p.size.width), height: Math.max(height, p.size.height) }
    if (open.get(c) !== p) return
    place(p)
    show(p)
  })
  setTimeout(() => {
    if (open.get(c) !== p || p.shown) return
    p.size = lastSize.get(id) ?? FIRST
    show(p)
  }, 5000)

  wc.setWindowOpenHandler(({ url: target }) => {
    if (/^https?:|^chrome-extension:/i.test(target)) void run({ do: 'tab.new', url: target } as never, { window: c })
    closePopup(c)
    return { action: 'deny' }
  })
  wc.on('before-input-event', (_e, input) => { if (input.type === 'keyDown' && input.key === 'Escape') closePopup(c) })
  wc.on('blur', () => {
    // A click elsewhere in the window; not the moment it opens.
    if (Date.now() - p.opened > 400 && c.base.isFocused() && open.get(c) === p) {
      blurred.set(c, { id, at: Date.now() })
      closePopup(c)
    }
  })
  wc.on('destroyed', () => { if (open.get(c) === p) closePopup(c) })
  if (!watched.has(c)) {
    watched.add(c)
    c.base.once('closed', () => open.delete(c))
    c.base.on('resize', () => { const now = open.get(c); if (now) place(now) })
  }
  void wc.loadURL(url).catch(() => {})
}

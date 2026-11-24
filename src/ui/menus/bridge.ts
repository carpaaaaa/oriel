// Menus drawn by Oriel instead of Windows' own (studio/02 §4.6, §5 M4;
// SiteCard.swift `MenuMetrics`). A menu is built in the window's interface,
// where the column is, and drawn in the overlay, the only view above the
// page. Until the main process can raise a menu layer itself (asked for in
// the tabs module's report: `menu.open`), the two roots of one window talk
// over a BroadcastChannel: same page, same origin, one channel per window.

import type { Command } from '../../shared/commands'

/** What picking an entry does. `cmd`/`cmds` run in the overlay; `ui` is sent
 * back to the window's interface (an inline rename, a popover); `copy`
 * writes the clipboard. */
export type Act =
  | { cmd: Command }
  | { cmds: Command[] }
  | { ui: string; id?: string; data?: unknown }
  | { copy: string }

export interface Entry {
  label?: string
  act?: Act
  enabled?: boolean
  checked?: boolean
  /** A key shown at the end, as macOS menus show key equivalents. */
  accel?: string
  /** A symbol before the label (a space's icon) and its colour. */
  glyph?: string
  tint?: string | null
  submenu?: Entry[]
  separator?: boolean
  /** A section's name, not to be picked. */
  header?: boolean
}

export type Message =
  | { type: 'menu'; window: string; entries: Entry[]; at: { x: number; y: number }; source: string }
  | { type: 'panel'; window: string; panel: string; at: { x: number; y: number }; data?: unknown }
  | { type: 'close'; window: string }
  | { type: 'ui'; window: string; act: { ui: string; id?: string; data?: unknown } }
  | { type: 'shown'; window: string; source: string | null }
  /** The window's size, from its interface: the overlay is 0 × 0 at rest. */
  | { type: 'room'; window: string; w: number; h: number }

let channel: BroadcastChannel | null = null
const listeners = new Set<(m: Message) => void>()

function open(): BroadcastChannel {
  if (!channel) {
    channel = new BroadcastChannel('oriel-tabs-ui')
    channel.onmessage = e => { for (const l of listeners) l(e.data as Message) }
  }
  return channel
}

export function post(m: Message): void { open().postMessage(m) }
export function listen(f: (m: Message) => void): () => void { open(); listeners.add(f); return () => listeners.delete(f) }

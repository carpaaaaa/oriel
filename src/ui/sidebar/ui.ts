// The column's own state, which the main process doesn't hold: what is
// being renamed in place, what is carried, the grey's glide.

import { createSignal } from 'solid-js'
import { cmd, state } from '../lib/store'
import { onPick } from '../menus/open'

/** Something renamed where it stands (Rename, Rename Group, Rename Folder,
 * Change Letter; §3.49, §6.11, §6.35, §6.26). */
export type Editing = { kind: 'tab' | 'group' | 'folder' | 'letter'; id: string } | null
export const [editing, setEditing] = createSignal<Editing>(null)

/** The tab carried, its target, for the rows to make room (drag.ts). */
export interface Carry {
  key: string
  /** Where the carried line is drawn, in the rows' space. */
  y: number
  x: number
  /** Over a block that would take it as something else: faded (§6.16). */
  faded: boolean
  /** The other pages of its split, hung from it: line key → how far under it (§8.18). */
  with?: Record<string, number>
}
export const [carry, setCarry] = createSignal<Carry | null>(null)

/** Lines moved out of the way of what is carried: key → y. */
export const [shifted, setShifted] = createSignal<Record<string, number>>({})

/** A mark where a pinned row would land among folders (PinFolderMark). */
export const [dropMark, setDropMark] = createSignal<{ key: string; after: boolean } | null>(null)
/** A group's or folder's heading lit as the target of a drop. */
export const [dropTarget, setDropTarget] = createSignal<string | null>(null)
/** Squares: the cell left open for a tab carried over the grid. */
export const [squareGhost, setSquareGhost] = createSignal<{ index: number; tab: string } | null>(null)
/** Rows: a ghost row where a carried pin or tab will land. */
export const [rowGhost, setRowGhost] = createSignal<{ before: string | null; block: 'listed' | 'loose' | string; tab: string } | null>(null)

/** The reading fill of the tab in front (Tab.meter, §2.17). */
export const [reading, setReading] = createSignal<{ id: string; fraction: number } | null>(null)

let wired = false
/** What picks in the drawn menus ask of the column. */
export function wireMenuPicks(): void {
  if (wired) return
  wired = true
  onPick('rename', id => id && setEditing({ kind: 'tab', id }))
  onPick('letter', id => id && setEditing({ kind: 'letter', id }))
  onPick('group.rename', id => id && setEditing({ kind: 'group', id }))
  onPick('folder.rename', id => id && setEditing({ kind: 'folder', id }))
  onPick('group.new', async (_id, data) => {
    const made = await cmd({ do: 'group.new', ids: data as string[] }) as string | null
    if (made) setEditing({ kind: 'group', id: made })
  })
  onPick('folder.new', async (_id, data) => {
    const d = (data ?? {}) as { pin?: string; parent?: string }
    const made = await cmd({ do: 'pinFolder.new', pin: d.pin, parent: d.parent ?? null }) as string | null
    if (made) setEditing({ kind: 'folder', id: made })
  })
  window.search.onReading(v => setReading(v))
}

export const activeTab = () => state.tabs.find(t => t.id === state.activeID) ?? null

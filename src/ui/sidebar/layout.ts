// Where each line of the column's scrolling block goes, worked out as the
// Mac sums it (Side.swift `rowsHeight` 950-973, `rows` 1620): pinned rows
// (with their folders), then the groups, the keep line, the loose tabs, and
// the "New tab" row. Every line is laid at its y; moving a line is moving
// its y, which CSS carries on the settle spring.

import type { GroupView, PinFolderView, TabView } from '../../shared/state'
import { state } from '../lib/store'
import { P, parts, folderLines, foldersShown, rowHeight, spaceColours, type Move } from './derive'

export const GAP = 2
export const INDENT = 14
export const GROUP_INSET = 4

export type Item =
  | { key: string; kind: 'row'; tab: TabView; y: number; h: number; x: number; r: number; group?: GroupView; pinned?: boolean; depth?: number }
  | { key: string; kind: 'folder'; folder: PinFolderView; y: number; h: number; x: number; r: number; depth: number }
  | { key: string; kind: 'group'; group: GroupView; y: number; h: number; x: number; r: number }
  | { key: string; kind: 'wash'; group: GroupView; y: number; h: number; x: number; r: number }
  | { key: string; kind: 'keep'; y: number; h: number; x: number; r: number; clears: boolean }
  | { key: string; kind: 'new'; y: number; h: number; x: number; r: number }

export interface Layout { items: Item[]; height: number; squares: TabView[] }

/** The keep line: with pinned rows on, something kept above (a pin of this
 * space or a group) and a page below (Side.swift:1040-1056). */
function showsLine(kept: number, listed: number, loose: number): boolean {
  return P.pinRows() && kept > 0 && listed + loose > 0
}

export function layout(move?: Move | null): Layout {
  const icons = P.iconColumn()
  const row = rowHeight()
  const heading = icons ? 18 : 24
  const { squares, listed, groups, loose } = parts(move)
  const items: Item[] = []
  let y = 0

  // the pinned rows
  if (listed.length) {
    if (foldersShown() && !icons) {
      const lines = folderLines(listed, state.pinFolders, state.activeID)
      lines.forEach((line, i) => {
        if (i) y += GAP
        if (line.kind === 'folder') {
          items.push({ key: `f:${line.folder.id}`, kind: 'folder', folder: line.folder, y, h: row, x: 0, r: 0, depth: line.depth })
          y += row
        } else {
          items.push({ key: `t:${line.tab.id}`, kind: 'row', tab: line.tab, y, h: row, x: line.depth * INDENT, r: 0, pinned: true, depth: line.depth })
          y += row
        }
      })
    } else {
      listed.forEach((t, i) => {
        if (i) y += GAP
        items.push({ key: `t:${t.id}`, kind: 'row', tab: t, y, h: row, x: 0, r: 0, pinned: true })
        y += row
      })
    }
    y += GAP
  }

  // the loose block: groups, the line, the loose tabs, 2 between each
  let first = true
  const next = () => { if (!first) y += GAP; first = false }
  for (const { group, members } of groups) {
    next()
    const top = y
    const coloured = !!group.colour && group.colour > 0 && group.colour < spaceColours.length
    const inset = !icons && coloured ? GROUP_INSET : 0
    items.push({ key: `g:${group.id}`, kind: 'group', group, y, h: heading, x: 0, r: 0 })
    y += heading
    for (const t of members) {
      y += GAP
      items.push({ key: `t:${t.id}`, kind: 'row', tab: t, y, h: row, x: icons ? 0 : INDENT, r: inset, group })
      y += row
    }
    if (coloured) items.push({ key: `w:${group.id}`, kind: 'wash', group, y: top, h: y - top, x: 0, r: 0 })
  }
  const kept = squares.length + listed.length + groups.length
  if (!icons && showsLine(kept, listed.length, loose.filter(t => !t.empty).length)) {
    next()
    items.push({ key: 'keep', kind: 'keep', y, h: 18, x: 0, r: 0, clears: loose.length > 0 })
    y += 18
  }
  for (const t of loose) {
    next()
    items.push({ key: `t:${t.id}`, kind: 'row', tab: t, y, h: row, x: 0, r: 0 })
    y += row
  }

  // New tab, 2 above
  y += GAP
  items.push({ key: 'new', kind: 'new', y, h: row, x: 0, r: 0 })
  y += row
  return { items, height: y, squares }
}

/** The pinned squares' cells (Side.swift `pinCells`): at most four a row,
 * as even as they go with the fuller rows first; each row splits the room;
 * every row as tall as its narrowest cell allows, never over 34. */
export function pinCells(count: number, width: number): { x: number; y: number; w: number; h: number }[] {
  if (count <= 0) return []
  const room = width - 20
  const gap = 4, square = 34
  const fits = Math.floor((room + gap) / (square + gap))
  const most = Math.min(4, Math.max(1, fits))
  const n = Math.ceil(count / most)
  const base = Math.floor(count / n), extra = count % n
  const rows = Array.from({ length: n }, (_, i) => (i < extra ? base + 1 : base))
  const slots = rows.map(r => (rows.length === 1 ? Math.max(r, Math.min(3, fits)) : r))
  const widths = slots.map(s => Math.max(20, (room - (s - 1) * gap) / s))
  const h = Math.min(square, ...widths)
  const cells: { x: number; y: number; w: number; h: number }[] = []
  rows.forEach((r, ri) => {
    for (let c = 0; c < r; c++) cells.push({ x: c * (widths[ri] + gap), y: ri * (h + gap), w: widths[ri], h })
  })
  return cells
}

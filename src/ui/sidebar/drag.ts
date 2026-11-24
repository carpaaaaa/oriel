// Carrying in the column (studio/01 §4.22-4.24, §6.15-6.17, §6.27-6.28,
// §6.42-6.43; Side.swift `Carried`, `PinCarried`, PinDrop.swift): after 5
// points a line or a square comes off, follows the pointer exactly, rises
// with a shadow; the others make room on settle as it passes their middle.
// Over another block it fades and a ghost shows where it lands. Let go, it
// lands; Escape while held puts it back. Pointer events, never HTML5 drag.

import { batch, createRoot, createEffect } from 'solid-js'
import { state, cmd } from '../lib/store'
import type { TabView } from '../../shared/state'
import { layout, pinCells, type Item, GAP } from './layout'
import { P, parts, folderLines, foldersShown, pinOf, type Move } from './derive'
import { setCarry, setShifted, setDropMark, setDropTarget, setSquareGhost, setRowGhost, carry } from './ui'
import { splitHintAt } from '../chrome/SplitDrop'
import type { SplitDropHint } from '../../shared/modules/window'

export interface Pressed {
  key: string
  kind: 'row' | 'square' | 'folder'
  tab?: string
  folder?: string
  el: HTMLElement
}

/** The column's measures, given by the column itself. */
interface Column {
  body: HTMLElement
  scroller: HTMLElement
  width: () => number
  /** The rows' top within the body, scrolled. */
  rowsTop: () => number
  gridHeight: () => number
}
let column: Column | null = null
export function setColumn(c: Column | null): void { column = c }

const THRESHOLD = 5

let held: {
  p: Pressed
  x0: number; y0: number
  itemX: number; itemY: number
  pointer: number
  carrying: boolean
  move: Move | null
  /** Where a pinned row lands among folders, or a folder goes. */
  place: { anchor: string | null; after: boolean; folder: string | null } | null
  group: string | null
  out: boolean
  /** Over the page: the bands shown, and the side the pointer is in (§8.17). */
  split: SplitDropHint | null
  /** The page in front before the press opened the carried tab (Browser.cameFrom). */
  cameFrom: string | null
  broughtBack: boolean
} | null = null

/** A press on a line or a square: a click, or the start of a carry. */
export function press(e: PointerEvent, p: Pressed): void {
  if (e.button !== 0 || !column) return
  const item = itemOf(p.key)
  const sq = p.kind === 'square' ? squareCell(p.tab!) : null
  held = {
    p, x0: e.clientX, y0: e.clientY, itemX: sq?.x ?? 0, itemY: sq?.y ?? item?.y ?? 0,
    pointer: e.pointerId, carrying: false, move: null, place: null, group: null, out: false, split: null,
    cameFrom: state.activeID ?? null, broughtBack: false,
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onCancel)
  window.addEventListener('keydown', onKey, true)
}

function itemOf(key: string): Item | undefined { return layout().items.find(i => i.key === key) }
function squareCell(tab: string) {
  const { squares } = parts()
  const i = squares.findIndex(t => t.id === tab)
  return i < 0 ? null : pinCells(squares.length, column!.width())[i]
}

function onMove(e: PointerEvent): void {
  if (!held || !column) return
  const dx = e.clientX - held.x0, dy = e.clientY - held.y0
  if (!held.carrying) {
    if (Math.hypot(dx, dy) < THRESHOLD) return
    held.carrying = true
    try { held.p.el.setPointerCapture(held.pointer) } catch { /* a synthetic pointer */ }
    document.documentElement.classList.add('carrying')
  }
  const body = column.body.getBoundingClientRect()
  const px = e.clientX - body.left, py = e.clientY - body.top
  if (overPage(e)) return
  if (held.p.kind === 'square') carrySquare(px, py, dx, dy)
  else carryLine(px, py, dy)
}

// over the page: the bands at its edges (studio/01 §8.17)

/** A tab carried over the page: the bands, or the preview of a side, and
 * nothing moves in the column meanwhile. False when the point is elsewhere. */
function overPage(e: PointerEvent): boolean {
  if (!held || held.p.kind !== 'row') return false
  const tab = state.tabs.find(t => t.id === held!.p.tab)
  // The press opened the carried tab: over the page, the page from before
  // comes back, to be split with (TabDrag.bringBack, §8.17).
  const opened = !!tab && state.activeID === tab.id
  const page = opened && held.cameFrom && held.cameFrom !== tab!.id ? held.cameFrom : state.activeID ?? null
  const hint = tab ? splitHintAt(e.clientX, e.clientY, tab, held.split?.side ?? null, page) : null
  if (hint && opened && page && page !== tab!.id && !held.broughtBack) { held.broughtBack = true; void cmd({ do: 'tab.select', id: page }) }
  const was = held.split
  held.split = hint
  if (!hint) {
    if (was) void cmd({ do: 'split.dropHint', hint: null })
    return false
  }
  if (!was || was.side !== hint.side || was.rect.width !== hint.rect.width || was.rect.x !== hint.rect.x) void cmd({ do: 'split.dropHint', hint })
  held.move = null
  held.place = null
  held.group = null
  batch(() => {
    setCarry({ key: held!.p.key, y: held!.itemY + (e.clientY - held!.y0), x: 0, faded: true })
    setShifted({})
    setDropMark(null)
    setDropTarget(null)
    setSquareGhost(null)
    setRowGhost(null)
  })
  return true
}

// what a point is over

type Zone = 'grid' | 'listed' | 'loose' | { group: string } | 'none'

function zoneAt(py: number, tab: TabView | undefined): Zone {
  if (!column) return 'none'
  const gridBottom = column.gridHeight()
  const L = layout()
  const rowsTop = column.rowsTop()
  // Above the grid's bottom edge, or above the column with no grid: the squares (PinDrop.zone).
  if (py < gridBottom + 5 && tab && !tab.shy) return 'grid'
  const y = py - rowsTop
  const listed = L.items.filter(i => i.kind === 'folder' || (i.kind === 'row' && i.pinned))
  if (P.pinRows() && listed.length && y <= listed[listed.length - 1].y + listed[listed.length - 1].h + 1) return 'listed'
  for (const g of L.items.filter(i => i.kind === 'group') as Extract<Item, { kind: 'group' }>[]) {
    const members = L.items.filter(i => i.kind === 'row' && i.group?.id === g.group.id)
    const bottom = members.length ? members[members.length - 1].y + members[members.length - 1].h : g.y + g.h
    if (y >= g.y && y <= bottom) return { group: g.group.id }
  }
  if (P.pinRows() && !listed.length && tab?.pinID && y < 0) return 'listed'
  return 'loose'
}

/** The place among a list's lines (without the carried one) for a point:
 * before the first whose middle is past it (PinDrop.rowSlot, RowCarry). */
function slotAmong(ids: string[], y: number): number {
  const L = layout()
  let i = 0
  for (const id of ids) {
    const it = L.items.find(x => x.key === `t:${id}`)
    if (it && y > it.y + it.h / 2) i++
  }
  return i
}

function carryLine(px: number, py: number, dy: number): void {
  if (!held || !column) return
  const tab = state.tabs.find(t => t.id === held!.p.tab)
  const rowsTop = column.rowsTop()
  const y = held.itemY + dy
  const zone = held.p.kind === 'folder' ? 'listed' : zoneAt(py, tab)
  let move: Move | null = null
  let place: typeof held.place = null
  let group: string | null = null
  const pts = parts()
  const ry = py - rowsTop
  let faded = false
  if (held.p.kind === 'folder') {
    place = folderPlace(ry, held.p.folder!)
  } else if (tab) {
    const from: Zone = tab.pinID ? (P.pinRows() && tab.listed ? 'listed' : 'grid')
      : tab.groupID && state.groups.some(g => g.id === tab.groupID) ? { group: tab.groupID } : 'loose'
    if (zone === 'grid') {
      const cells = pinCells(pts.squares.length + (from === 'grid' ? 0 : 1), column.width())
      move = { tab: tab.id, to: 'squares', index: nearest(cells, px - 10, py) }
      faded = from !== 'grid'
    } else if (zone === 'listed') {
      if (foldersShown() && !tab.empty) place = pinPlace(ry, tab.id)
      else move = { tab: tab.id, to: 'listed', index: slotAmong(pts.listed.filter(t => t.id !== tab.id).map(t => t.id), ry) }
      faded = from !== 'listed'
    } else if (typeof zone === 'object') {
      const g = state.groups.find(x => x.id === zone.group)
      const same = typeof from === 'object' && from.group === zone.group
      if (same && !g?.folded) {
        const members = pts.groups.find(x => x.group.id === zone.group)?.members.filter(t => t.id !== tab.id) ?? []
        move = { tab: tab.id, to: `group:${zone.group}`, index: slotAmong(members.map(t => t.id), ry) }
      } else {
        group = zone.group
        if (tab.pinID) {
          const members = pts.groups.find(x => x.group.id === zone.group)?.members ?? []
          move = { tab: tab.id, to: `group:${zone.group}`, index: members.length }
          faded = true
        }
      }
    } else if (zone === 'loose') {
      const loose = pts.loose.filter(t => t.id !== tab.id)
      move = { tab: tab.id, to: 'loose', index: slotAmong(loose.map(t => t.id), ry) }
      faded = from !== 'loose'
    }
    if (tab.shy && move?.to !== 'loose' && !move?.to.startsWith('group')) { move = null; faded = true }
  }
  held.move = move
  held.place = place
  held.group = group
  const moved = move ? layout(move) : null
  const L = layout()
  batch(() => {
    setCarry({ key: held!.p.key, y, x: 0, faded })
    setShifted(moved ? Object.fromEntries(moved.items.filter(i => i.key !== held!.p.key).map(i => [i.key, i.y])) : {})
    setDropTarget(group ? `g:${group}` : place && place.folder && !place.anchor ? `f:${place.folder}` : null)
    setDropMark(place && place.anchor ? { key: place.anchor, after: place.after } : null)
    // The ghost: where the carried line will land, when that is another block.
    if (move && faded && move.to !== 'squares') {
      const it = moved!.items.find(i => i.key === held!.p.key)
      setRowGhost(it ? { before: null, block: String(it.y), tab: tab!.id } : null)
    } else setRowGhost(null)
    setSquareGhost(move && move.to === 'squares' && faded ? { index: move.index, tab: tab!.id } : null)
  })
  void L
}

function carrySquare(px: number, py: number, dx: number, dy: number): void {
  if (!held || !column) return
  const tab = state.tabs.find(t => t.id === held!.p.tab)
  if (!tab) return
  const zone = zoneAt(py, tab)
  const pts = parts()
  let move: Move | null = null
  let faded = false
  let group: string | null = null
  const ry = py - column.rowsTop()
  if (zone === 'grid') {
    const cells = pinCells(pts.squares.length, column.width())
    move = { tab: tab.id, to: 'squares', index: nearest(cells, held.itemX + dx + cells[0].w / 2, held.itemY + dy + cells[0].h / 2, true) }
  } else if (zone === 'listed' && P.pinRows()) {
    move = foldersShown() ? null : { tab: tab.id, to: 'listed', index: slotAmong(pts.listed.map(t => t.id), ry) }
    if (foldersShown()) held.place = pinPlace(ry, tab.id)
    faded = true
  } else if (typeof zone === 'object') {
    group = zone.group
    move = { tab: tab.id, to: `group:${zone.group}`, index: (pts.groups.find(x => x.group.id === zone.group)?.members.length ?? 0) }
    faded = true
  } else {
    move = { tab: tab.id, to: 'loose', index: slotAmong(pts.loose.map(t => t.id), ry) }
    faded = true
  }
  held.move = move
  held.group = group
  const moved = move ? layout(move) : null
  batch(() => {
    setCarry({ key: held!.p.key, y: held!.itemY + dy, x: held!.itemX + dx, faded })
    setShifted(moved ? Object.fromEntries(moved.items.map(i => [i.key, i.y])) : {})
    setDropTarget(group ? `g:${group}` : null)
    setDropMark(held!.place?.anchor ? { key: held!.place.anchor, after: held!.place.after } : null)
    if (move && faded) {
      const it = moved!.items.find(i => i.key === held!.p.key)
      setRowGhost(it ? { before: null, block: String(it.y), tab: tab.id } : null)
    } else setRowGhost(null)
    setSquareGhost(move && move.to === 'squares' ? { index: move.index, tab: tab.id } : null)
  })
}

/** The nearest cell's index, by distance between centres (PinCarried.target). */
function nearest(cells: { x: number; y: number; w: number; h: number }[], x: number, y: number, centre = false): number {
  let best = 0, d = Infinity
  cells.forEach((c, i) => {
    const cx = c.x + c.w / 2, cy = c.y + c.h / 2
    const dist = centre ? Math.hypot(cx - x, cy - y) : Math.hypot(cx - x, cy - y)
    if (dist < d) { d = dist; best = i }
  })
  return best
}

/** Where a pinned row let go among folders goes (PinTree.place, §6.27):
 * over a heading, into that folder; over a pin, beside it in its folder,
 * before in its upper half, after in its lower; above all, first at the top;
 * below all, last at the top. */
function pinPlace(y: number, carried: string): { anchor: string | null; after: boolean; folder: string | null } | null {
  const lines = folderLines(parts().listed, state.pinFolders, state.activeID)
  const L = layout()
  const at = (key: string) => L.items.find(i => i.key === key)
  for (const line of lines) {
    const key = line.kind === 'folder' ? `f:${line.folder.id}` : `t:${line.tab.id}`
    const it = at(key)
    if (!it || y < it.y || y > it.y + it.h) continue
    if (line.kind === 'folder') return line.folder.live ? null : { anchor: null, after: false, folder: line.folder.id }
    if (line.tab.id === carried) return null
    const pin = pinOf(line.tab)
    return { anchor: key, after: y > it.y + it.h / 2, folder: pin?.folder ?? null }
  }
  const first = lines[0], last = lines[lines.length - 1]
  if (first && y < (at(first.kind === 'folder' ? `f:${first.folder.id}` : `t:${first.tab.id}`)?.y ?? 0)) {
    const top = lines.find(l => l.kind === 'pin' && l.depth === 0)
    return { anchor: top && top.kind === 'pin' ? `t:${top.tab.id}` : null, after: false, folder: null }
  }
  if (last) return { anchor: last.kind === 'pin' ? `t:${last.tab.id}` : `f:${last.folder.id}`, after: true, folder: null }
  return null
}

/** Where a folder carried by its heading goes (PinTree.folderPlace, §6.28). */
function folderPlace(y: number, carried: string): { anchor: string | null; after: boolean; folder: string | null } | null {
  const L = layout()
  for (const it of L.items) {
    if (y < it.y || y > it.y + it.h) continue
    if (it.kind === 'folder') {
      if (it.folder.id === carried) return null
      // the top third: before it (as a sibling); lower: into it
      if (y < it.y + it.h / 3) return { anchor: it.key, after: false, folder: it.folder.parent ?? null }
      return { anchor: null, after: false, folder: it.folder.id }
    }
    if (it.kind === 'row' && it.pinned) return { anchor: null, after: false, folder: pinOf(it.tab)?.folder ?? null }
  }
  return { anchor: null, after: false, folder: null }
}

// letting go

function onUp(): void {
  if (!held) return
  const h = held
  end()
  if (!h.carrying) return
  // The click that ends a carry isn't a click.
  window.addEventListener('click', swallow, { capture: true, once: true })
  setTimeout(() => window.removeEventListener('click', swallow, true), 0)
  // Let go in a band: beside the page; over the page elsewhere, nothing.
  if (h.split) { if (h.split.side && h.p.tab) void cmd({ do: 'split.pair', id: h.p.tab, side: h.split.side, target: h.split.page }); return }
  void land(h)
}

const swallow = (e: Event) => { e.stopPropagation(); e.preventDefault() }

function onCancel(): void { if (held) { end(); } }
function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape' && held?.carrying) { e.preventDefault(); e.stopPropagation(); end() }
}

function end(): void {
  if (held?.split) void cmd({ do: 'split.dropHint', hint: null })
  held = null
  window.removeEventListener('pointermove', onMove)
  window.removeEventListener('pointerup', onUp)
  window.removeEventListener('pointercancel', onCancel)
  window.removeEventListener('keydown', onKey, true)
  document.documentElement.classList.remove('carrying')
  batch(() => {
    setCarry(null)
    setShifted({})
    setDropMark(null)
    setDropTarget(null)
    setSquareGhost(null)
    setRowGhost(null)
  })
}

export const carrying = () => carry() !== null

/** Wait for the state to say so (a pin made has its id), or give up. */
export function until<T>(read: () => T | undefined | null | false, within = 1500): Promise<T | null> {
  return new Promise(resolve => {
    const now = read()
    if (now) { resolve(now as T); return }
    createRoot(dispose => {
      const timer = setTimeout(() => { dispose(); resolve(null) }, within)
      createEffect(() => {
        const v = read()
        if (v) { clearTimeout(timer); queueMicrotask(dispose); resolve(v as T) }
      })
    })
  })
}

/** Index of `id` in a pin's own list (pins.json's order: squares, then rows),
 * once the carried pin is out of it. */
function ownIndex(tabs: TabView[], carriedPin: string | undefined, before: number): number {
  void carriedPin
  return before
}

async function land(h: NonNullable<typeof held>): Promise<void> {
  const id = h.p.tab
  if (h.p.kind === 'folder') {
    const place = h.place
    if (place && h.p.folder) {
      const target = place.folder ?? null
      const f = state.pinFolders.find(x => x.id === h.p.folder)
      if (f && (f.parent ?? null) !== target) await cmd({ do: 'pinFolder.move', id: h.p.folder, parent: target })
    }
    return
  }
  const tab = state.tabs.find(t => t.id === id)
  if (!tab) return
  const pts = parts()
  const pin = tab.pinID ? pinOf(tab) : undefined
  const shared = (p: TabView) => !!pinOf(p)?.everywhere
  const move = h.move

  // into a group, let go over it (§6.42): where let go, or at its end
  if (h.group && (!move || move.to.startsWith('group:') || tab.pinID)) {
    const g = state.groups.find(x => x.id === h.group)
    if (!g) return
    if (tab.pinID) await cmd({ do: 'tab.unpin', id: tab.id })
    await cmd({ do: 'tab.group', ids: [tab.id], group: g.id })
    return
  }

  // among the pinned rows with folders (§6.27)
  if (h.place && foldersShown()) {
    if (!tab.pinID) {
      await cmd({ do: 'tab.pinRow', id: tab.id })
      const made = await until(() => state.tabs.find(t => t.id === tab.id)?.pinID)
      if (!made) return
    } else if (!tab.listed) {
      await cmd({ do: 'pin.listed', id: tab.pinID, listed: true })
    }
    const now = state.tabs.find(t => t.id === tab.id)
    const pinID = now?.pinID
    if (!pinID) return
    const own = state.tabs.filter(t => t.pinID && !shared(t) && t.id !== tab.id)
    let to = own.length
    if (h.place.anchor) {
      const anchor = own.findIndex(t => `t:${t.id}` === h.place!.anchor)
      if (anchor >= 0) to = anchor + (h.place.after ? 1 : 0)
    } else if (h.place.folder) {
      const inside = own.map((t, i) => [t, i] as const).filter(([t]) => pinOf(t)?.folder === h.place!.folder)
      to = inside.length ? inside[inside.length - 1][1] + 1 : own.filter(t => !t.listed).length
    }
    await cmd({ do: 'pin.move', id: pinID, to, folder: h.place.folder })
    return
  }

  if (!move) return
  if (move.to === 'loose') {
    if (tab.pinID) await cmd({ do: 'tab.unpin', id: tab.id })
    else if (tab.groupID && state.groups.some(g => g.id === tab.groupID)) await cmd({ do: 'tab.group', ids: [tab.id], group: null })
    const pins = state.tabs.filter(t => t.pinID && t.id !== tab.id).length
    const grouped = pts.groups.reduce((n, g) => n + state.tabs.filter(t => !t.pinID && t.groupID === g.group.id && t.id !== tab.id).length, 0)
    await cmd({ do: 'tab.move', id: tab.id, to: pins + grouped + move.index })
  } else if (move.to.startsWith('group:')) {
    const gid = move.to.slice(6)
    if (tab.groupID !== gid) await cmd({ do: 'tab.group', ids: [tab.id], group: gid })
    const pins = state.tabs.filter(t => t.pinID && t.id !== tab.id).length
    let before = 0
    for (const g of state.groups) {
      if (g.id === gid) break
      before += state.tabs.filter(t => !t.pinID && t.groupID === g.id && t.id !== tab.id).length
    }
    await cmd({ do: 'tab.move', id: tab.id, to: pins + before + move.index })
  } else if (move.to === 'squares') {
    let pinID = tab.pinID
    if (!pinID) {
      await cmd({ do: 'tab.pin', id: tab.id })
      pinID = (await until(() => state.tabs.find(t => t.id === tab.id)?.pinID)) ?? undefined
    } else if (tab.listed && P.pinRows()) await cmd({ do: 'pin.listed', id: pinID, listed: false })
    if (!pinID) return
    // Shared pins first: an own square lands after them (pinSlot).
    const sharedSquares = pts.squares.filter(t => t.id !== tab.id && shared(t)).length
    const to = pin?.everywhere ? move.index : Math.max(0, move.index - sharedSquares)
    await cmd({ do: 'pin.move', id: pinID, to: ownIndex(state.tabs, pinID, to) })
  } else if (move.to === 'listed') {
    let pinID = tab.pinID
    if (!pinID) {
      await cmd({ do: 'tab.pinRow', id: tab.id })
      pinID = (await until(() => state.tabs.find(t => t.id === tab.id)?.pinID)) ?? undefined
    } else if (!tab.listed) await cmd({ do: 'pin.listed', id: pinID, listed: true })
    if (!pinID) return
    const everywhere = !!pinOf(state.tabs.find(t => t.id === tab.id)!)?.everywhere
    const squares = state.tabs.filter(t => t.pinID && t.id !== tab.id && !t.listed && shared(t) === everywhere).length
    const sharedRows = everywhere ? 0 : pts.listed.filter(t => t.id !== tab.id && shared(t)).length
    await cmd({ do: 'pin.move', id: pinID, to: squares + Math.max(0, move.index - sharedRows) })
  }
}

export { GAP }

// Folders among the pinned rows (PinFolders.swift, PinTree; studio/01
// §6.24-6.26). Pure, so the tests can hold it.

import type { PinDef, PinFolder } from './formats'

/** A folder, in a folder, in a folder: no deeper. */
export const maxDepth = 3

/** The folders as they can be trusted: duplicates out, a parent that is gone,
 * itself or live puts it at the top, cycles cut, too deep moved up. */
export function sanitized(folders: PinFolder[]): PinFolder[] {
  const seen = new Set<string>()
  const out = folders.filter(f => !seen.has(f.id) && !!seen.add(f.id)).map(f => ({ ...f }))
  const ids = new Set(out.map(f => f.id))
  const live = new Set(out.filter(f => f.feed).map(f => f.id))
  for (const f of out) {
    if (f.parent && (!ids.has(f.parent) || f.parent === f.id || live.has(f.parent))) delete f.parent
  }
  for (const f of out) {
    const visited = new Set([f.id])
    let current = f.parent
    while (current) {
      const at = out.find(x => x.id === current)
      if (!at) break
      if (visited.has(current)) { delete f.parent; break }
      visited.add(current)
      current = at.parent
    }
  }
  for (const f of out) {
    let chain = ancestors(f.id, out)
    while (chain.length >= maxDepth) {
      chain = chain.slice(1)
      f.parent = chain[0]
      if (!f.parent) delete f.parent
    }
  }
  return out
}

/** The folders above one, nearest first. */
export function ancestors(id: string, folders: PinFolder[]): string[] {
  const chain: string[] = []
  let current = folders.find(f => f.id === id)?.parent
  while (current && !chain.includes(current)) {
    const found = folders.find(f => f.id === current)
    if (!found) break
    chain.push(current)
    current = found.parent
  }
  return chain
}

export function depth(id: string, folders: PinFolder[]): number {
  return ancestors(id, folders).length + 1
}

/** Levels a folder and what it holds take: 1 for one holding no folder. */
export function height(id: string, folders: PinFolder[]): number {
  let best = 1
  const stack: [string, number][] = [[id, 1]]
  const seen = new Set<string>()
  while (stack.length) {
    const [current, level] = stack.pop()!
    if (seen.has(current)) continue
    seen.add(current)
    best = Math.max(best, level)
    for (const child of folders) if (child.parent === current) stack.push([child.id, level + 1])
  }
  return best
}

export const isLive = (id: string | undefined, folders: PinFolder[]) => !!id && folders.some(f => f.id === id && !!f.feed)

export function canMove(id: string, parent: string | undefined, folders: PinFolder[]): boolean {
  if (!parent) return true
  if (isLive(parent, folders)) return false
  if (parent === id || ancestors(parent, folders).includes(id)) return false
  return depth(parent, folders) + height(id, folders) <= maxDepth
}

export function canMake(parent: string | undefined, folders: PinFolder[]): boolean {
  if (!parent) return true
  return folders.some(f => f.id === parent) && !isLive(parent, folders) && depth(parent, folders) < maxDepth
}

/** A folder taken away: what it held goes up into the folder above. */
export function removing(id: string, folders: PinFolder[], pins: PinDef[]): { folders: PinFolder[]; pins: PinDef[] } {
  const gone = folders.find(f => f.id === id)
  if (!gone) return { folders, pins }
  const kept = folders.filter(f => f.id !== id).map(f => (f.parent === id ? withParent(f, gone.parent) : f))
  const moved = pins.map(p => (p.folder === id ? withFolder(p, gone.parent) : p))
  return { folders: kept, pins: moved }
}

function withParent(f: PinFolder, parent?: string): PinFolder {
  const out = { ...f, parent }
  if (!parent) delete out.parent
  return out
}
function withFolder(p: PinDef, folder?: string): PinDef {
  const out = { ...p, folder }
  if (!folder) delete out.folder
  return out
}

export type Line =
  | { kind: 'folder'; folder: PinFolder; depth: number }
  | { kind: 'pin'; id: string; depth: number }
  | { kind: 'item'; item: { id: string; title: string; link: string }; folder: string; depth: number }

/** The pinned rows as drawn: each level's folders, each followed by what it
 * holds unless folded, then that level's pins. `showing` is drawn even in a
 * folded folder. */
export function lines(pins: { id: string; folder?: string }[], folders: PinFolder[], showing?: string): Line[] {
  const clean = sanitized(folders)
  const ids = new Set(clean.filter(f => !f.feed).map(f => f.id))
  const home = (folder?: string) => (folder && ids.has(folder) ? folder : undefined)
  const out: Line[] = []
  const walk = (parent: string | undefined, d: number, folded: boolean) => {
    for (const folder of clean.filter(f => f.parent === parent)) {
      if (!folded) out.push({ kind: 'folder', folder, depth: d })
      if (folder.feed) {
        if (!folded && !folder.collapsed) for (const item of folder.items ?? []) out.push({ kind: 'item', item, folder: folder.id, depth: d + 1 })
        continue
      }
      walk(folder.id, d + 1, folded || folder.collapsed)
    }
    for (const pin of pins) if (home(pin.folder) === parent && (!folded || pin.id === showing)) out.push({ kind: 'pin', id: pin.id, depth: d })
  }
  walk(undefined, 0, false)
  return out
}

/** Every pin, each once, in the order the folders draw them opened. */
export function orderedIDs(pins: { id: string; folder?: string }[], folders: PinFolder[]): string[] {
  const open = folders.map(f => ({ ...f, collapsed: false }))
  return lines(pins, open).flatMap(l => (l.kind === 'pin' ? [l.id] : []))
}

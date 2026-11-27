// Every space saved to a file: Export Spaces… in Settings › Bring things over
// (and Settings › Shortcuts, where it can take a key; Oriel has no File menu).
// Search 1.0.22, SpacesExport.swift. Two kinds of file:
//
//  - a bookmarks page (.html), the Netscape format every browser imports: a
//    folder per space holding its pins, its folders of rows nested as they
//    are, then its open tabs in a folder of their own, their tab groups as
//    folders in it; the pins every space shows in a folder of their own, first;
//  - Search's own spaces file (.json), the same and what a bookmarks page
//    can't hold: each space's colour, icon and gradient, which pins are rows
//    and which are squares, its profile. Bring Things Over › File… reads it
//    back as spaces (import/spacesfile.ts), Oriel's and Search's alike.
//
// Nothing secret is in either: addresses and names, no cookies, no
// passwords, no history.

import { dialog } from 'electron'
import path from 'node:path'
import { brand } from '../../shared/brand'
import { handle } from '../router'
import { need } from '../context'
import { probe } from '../paths'
import { model, internalScheme } from '../model/model'
import { decodeShape, emptyShape, sessionFile, type PinDef, type SessionShape } from '../model/formats'
import { readJSON, writeFileAtomic } from '../model/persist'
import { downloadsFolder } from '../settings/prefs'

/** What the .json says it is, to be told from any other JSON file. */
export const FORMAT = 'search-spaces'
export const VERSION = 1

export interface Pin { title: string; url: string; listed: boolean; folder?: string }
export interface Link { title: string; url: string }
export interface Folder { id: string; name: string; parent?: string; feed?: string; items?: Link[] }
export interface Tab { title: string; url: string; group?: string }
export interface Group { id: string; name: string }
export interface Space {
  name: string; colour: number; icon?: string; gradient?: { colours: string[]; angle?: number; grain?: boolean }
  pins: Pin[]; folders: Folder[]; tabs: Tab[]; groups: Group[]
}
export interface Profile { name: string; everySpace: Pin[]; spaces: Space[] }
export interface Bundle { format: string; version: number; exported: string; profiles: Profile[] }

// gathering

/** An address worth a bookmark: one with a scheme, not an empty tab nor an
 * Oriel page (oriel://settings means nothing to another browser). */
function kept(text: string): boolean {
  const m = /^([a-z][a-z0-9+.-]*):/i.exec(text ?? '')
  return !!m && !['about', 'javascript', 'data', 'blob', internalScheme].includes(m[1].toLowerCase())
}

function pinOf(def: PinDef): Pin {
  const name = def.name?.trim()
  return { title: name || def.title, url: def.home, listed: def.listed === true }
}

/** Each space's open tabs: the row a window holds (the oldest first), else
 * its session file, as the session was last written. */
function rows(): Map<string, SessionShape> {
  const out = new Map<string, SessionShape>()
  const wins = [...model.windows.values()].filter(w => !w.shy)
  const first = model.primary()
  for (const w of wins) {
    for (const s of model.spaces) {
      if (out.has(s.id)) continue
      if (w.loaded.has(s.id)) out.set(s.id, model.shapeOf(w, s.id))
      else if (w !== first && w.saved[s.id]) out.set(s.id, w.saved[s.id])
    }
  }
  for (const s of model.spaces) if (!out.has(s.id)) out.set(s.id, readJSON(sessionFile(s.id), emptyShape(), decodeShape))
  return out
}

function gatherSpace(id: string, row: SessionShape): Space {
  const s = model.spaceOf(id)!
  const folders: Folder[] = (model.folders.get(id) ?? []).map(f => ({
    id: f.id, name: f.name, ...(f.parent ? { parent: f.parent } : {}),
    ...(f.feed ? { feed: f.feed, items: (f.items ?? []).map(i => ({ title: i.title, url: i.link })) } : {}),
  }))
  const known = new Set(folders.map(f => f.id))
  const pins = (model.pinsBySpace.get(id) ?? []).map(def => {
    const pin = pinOf(def)
    if (def.folder && known.has(def.folder)) pin.folder = def.folder
    return pin
  })
  const groups = (row.groups ?? []).map(g => ({ id: g.id, name: g.name }))
  const grouped = new Set(groups.map(g => g.id))
  const tabs: Tab[] = row.tabs.filter(e => e.pin === undefined && kept(e.url)).map(e => ({
    title: e.name || e.title, url: e.url, ...(e.groupID && grouped.has(e.groupID) ? { group: e.groupID } : {}),
  }))
  const used = new Set(tabs.map(t => t.group).filter(Boolean))
  return {
    name: s.name, colour: s.colour ?? 0, ...(s.icon ? { icon: s.icon } : {}), ...(s.gradient ? { gradient: s.gradient } : {}),
    pins, folders, tabs, groups: groups.filter(g => used.has(g.id)),
  }
}

/** Every space as it is now: Oriel has one profile, Personal. */
export function gather(): Bundle {
  const found = rows()
  const profile: Profile = {
    name: 'Personal',
    everySpace: model.sharedPins.map(pinOf),
    spaces: model.spaces.map(s => gatherSpace(s.id, found.get(s.id) ?? emptyShape())),
  }
  return {
    format: FORMAT, version: VERSION, exported: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
    profiles: [profile].filter(p => p.spaces.length || p.everySpace.length),
  }
}

// the bookmarks page

export const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** The Netscape bookmarks page: a folder per space, the shared pins in one
 * of their own before them (SpacesExport.html). */
export function html(bundle: Bundle): string {
  let out = '<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<!-- This is an automatically generated file.\n     It will be read and overwritten.\n     DO NOT EDIT! -->\n'
    + '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n<TITLE>Bookmarks</TITLE>\n<H1>Spaces</H1>\n<DL><p>\n'
  const several = bundle.profiles.length > 1
  const line = (depth: number, text: string) => { out += '    '.repeat(depth) + text + '\n' }
  const link = (depth: number, title: string, url: string) => line(depth, `<DT><A HREF="${escape(url)}">${escape(title || url)}</A>`)
  const folder = (depth: number, name: string, body: () => void) => {
    line(depth, `<DT><H3>${escape(name)}</H3>`)
    line(depth, '<DL><p>')
    body()
    line(depth, '</DL><p>')
  }
  for (const p of bundle.profiles) {
    if (!p.everySpace.length) continue
    folder(1, several ? `Every Space (${p.name})` : 'Every Space', () => { for (const pin of p.everySpace) link(2, pin.title, pin.url) })
  }
  for (const p of bundle.profiles) {
    for (const space of p.spaces) {
      folder(1, space.name, () => {
        // The squares first, as they sit above the rows.
        for (const pin of space.pins) if (!pin.listed) link(2, pin.title, pin.url)
        const known = new Set(space.folders.map(f => f.id))
        // The rows, folders first in each, as they are drawn.
        const inner = (parent: string, depth: number, seen: Set<string>) => {
          for (const f of space.folders) {
            if (f.parent !== parent || seen.has(f.id)) continue
            folder(depth, f.name, () => {
              inner(f.id, depth + 1, new Set([...seen, f.id]))
              for (const item of f.items ?? []) link(depth + 1, item.title, item.url)
            })
          }
          for (const pin of space.pins) if (pin.listed && pin.folder === parent) link(depth, pin.title, pin.url)
        }
        // A folder whose parent is gone sits at the top, as PinTree has it.
        for (const top of space.folders.filter(f => !f.parent || !known.has(f.parent))) {
          folder(2, top.name, () => {
            inner(top.id, 3, new Set([top.id]))
            for (const item of top.items ?? []) link(3, item.title, item.url)
          })
        }
        for (const pin of space.pins) if (pin.listed && (!pin.folder || !known.has(pin.folder))) link(2, pin.title, pin.url)
        if (space.tabs.length) {
          folder(2, 'Open Tabs', () => {
            for (const g of space.groups) folder(3, g.name, () => { for (const t of space.tabs) if (t.group === g.id) link(4, t.title, t.url) })
            for (const t of space.tabs) if (!t.group) link(3, t.title, t.url)
          })
        }
      })
    }
  }
  return out + '</DL><p>\n'
}

// Search's own file

/** Keys sorted, as Search's JSONEncoder writes them (.sortedKeys). */
function sorted(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sorted)
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map(k => [k, sorted((v as Record<string, unknown>)[k])]))
  return v
}
export const json = (bundle: Bundle) => JSON.stringify(sorted(bundle), null, 2) + '\n'

// writing

/** Writes the file, as .json when its name says so, else as a bookmarks
 * page; says what it wrote (Browser.exportSpaces(to:)). */
export function exportSpaces(file: string): { said: string; ok: boolean } {
  const bundle = gather()
  const text = path.extname(file).toLowerCase() === '.json' ? json(bundle) : html(bundle)
  try {
    writeFileAtomic(file, text)
  } catch (e) {
    return { said: `Couldn't save the spaces: ${(e as Error).message}`, ok: false }
  }
  const count = bundle.profiles.reduce((n, p) => n + p.spaces.length, 0)
  return { said: count === 1 ? '1 space exported' : `${count} spaces exported`, ok: true }
}

/** What was written last, for the bench. */
export const exported: { file: string; said: string }[] = []

/** Export Spaces…: Windows' save dialog, the kind of file chosen by its type
 * (the Mac's format menu); a test world names its file instead. */
handle('spaces.export', async ({ path: given }, ctx) => {
  const c = need(ctx)
  let file: string | null
  if (probe) file = typeof given === 'string' && given ? given : null
  else {
    const r = await dialog.showSaveDialog(c.base as never, {
      title: 'Export Spaces',
      defaultPath: path.join(downloadsFolder(), `${brand.name} Spaces.html`),
      buttonLabel: 'Export',
      filters: [
        { name: 'Bookmarks file (HTML), for any browser', extensions: ['html'] },
        { name: `${brand.name} spaces file (JSON), keeps colours and icons`, extensions: ['json'] },
      ],
      properties: ['createDirectory', 'showOverwriteConfirmation'],
    })
    file = r.canceled ? null : r.filePath ?? null
  }
  if (!file) return null
  const r = exportSpaces(file)
  exported.push({ file, said: r.said })
  if (exported.length > 10) exported.shift()
  return { said: r.said, file }
})

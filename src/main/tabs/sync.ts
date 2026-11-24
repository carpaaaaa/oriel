// Settings › General › Sync with your other computers (`sync.folder`;
// Sync.swift, SyncMerge.swift; studio/05 §4.2, §4.5.2): a folder the user
// picks (in OneDrive, Dropbox, iCloud Drive for Windows, a shared disk) and
// whatever moves that folder between computers does the rest. The files are
// the Mac's, so Oriel and Search on a Mac sync with each other too.
//
// In the folder, "Search Sync/<scope>/<device>.json", one file per computer
// per scope, written only by that computer: "app" for the settings below,
// "profile-<Personal's id>" for the spaces, pins, pin folders and bookmarks
// (Oriel has Personal alone). Each file is the whole merged view as that
// computer last had it, item by item with stamps and tombstones; the merge
// is SyncMerge's to the letter (latest stamp, then device id, then a
// deletion, then the larger text; a computer joining stamps 0 so the
// folder wins; a whole kind gone at once is not a deletion; items not
// understood travel untouched). Never history, passwords, cookies, open
// tabs that aren't pinned, groups, private windows, extensions, the
// downloads folder or window sizes.
//
// A pass a second after turning on, two seconds after anything synced
// changes, when a file in the folder changes, and every half minute.
// Turned off, this computer's files leave the folder and what it agreed is
// forgotten; what is in the browser stays.

import { mkdirSync, readFileSync, renameSync, rmSync, statSync, watch, writeFileSync, promises as fsp, type FSWatcher } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { brand } from '../../shared/brand'
import type { BookmarkNode } from '../../shared/modules/data'
import { model, newID, type SpaceRecord } from '../model/model'
import { personalProfileID, uuid, type PinDef, type PinFolder } from '../model/formats'
import { dataFile } from '../paths'
import { bookmarks } from '../data/store'
import { moreFacts, setKey } from '../settings/prefs'
import { tellPages } from '../settings/internal'
import { benchRequest } from '../bench/server'
import { controllerFor } from '../views/window'

// MARK: - the merge (SyncMerge.swift)

/** An item's value as one computer last agreed it; no v is a deletion. */
interface Entry { v?: string; t: number; d: string }
type Items = Map<string, Entry>
type Live = Map<string, string>

const FORMAT = 1
const TOMBSTONE_LIFE = 365 * 24 * 60 * 60
const INSIDE = 'Search Sync'

/** Sorted keys and no empty optionals, as JSONEncoder(.sortedKeys) writes. */
function canon(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canon)
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(v as object).sort()) {
      const x = (v as Record<string, unknown>)[k]
      if (x !== undefined && x !== null) out[k] = canon(x)
    }
    return out
  }
  return v
}
/** A value as an item's text: the same value always the same text. */
export const text = (v: unknown) => JSON.stringify(canon(v))
function value(t: string | undefined): unknown {
  if (t === undefined) return undefined
  try { return JSON.parse(t) } catch { return undefined }
}

function wins(a: Entry, b: Entry): boolean {
  if (a.t !== b.t) return a.t > b.t
  if (a.d !== b.d) return a.d > b.d
  if (a.v === undefined && b.v === undefined) return false
  if (a.v === undefined) return true
  if (b.v === undefined) return false
  return a.v > b.v
}

function merge(maps: Items[]): Items {
  const out: Items = new Map()
  for (const map of maps) for (const [key, entry] of map) {
    const held = out.get(key)
    if (held && !wins(entry, held)) continue
    out.set(key, entry)
  }
  return out
}

const wholeKinds = ['bm:', 'kids:', 'pin:', 'order:pins:', 'title:pin:', 'space:', 'pinfolder:']
const wholeKindFloor = 5
const lostWith: [string, string][] = [['infolder:', 'pin:'], ['pinfolders:', 'pinfolder:']]

function stamp(current: Live, base: Items, device: string, now: number, joining: boolean): Items {
  let latest = 0
  for (const e of base.values()) latest = Math.max(latest, e.t)
  const clock = joining ? 0 : Math.max(now, latest + 0.001)
  const out: Items = new Map(base)
  for (const [key, v] of current) if (base.get(key)?.v !== v) out.set(key, { v, t: clock, d: device })
  const keys = [...current.keys()]
  const lost = new Set(wholeKinds.filter(kind => !keys.some(k => k.startsWith(kind))
    && [...base].filter(([k, e]) => k.startsWith(kind) && e.v !== undefined).length >= wholeKindFloor))
  for (const [kind, w] of lostWith) if (lost.has(w)) lost.add(kind)
  for (const [key, entry] of base) {
    if (entry.v === undefined || current.has(key) || !understood(key, entry.v) || [...lost].some(k => key.startsWith(k))) continue
    out.set(key, { t: clock, d: device })
  }
  return out
}

function prune(map: Items, now: number): Items {
  return new Map([...map].filter(([, e]) => e.v !== undefined || e.t >= now - TOMBSTONE_LIFE))
}

function passMaps(current: Live, base: Items | null, theirs: Items[], device: string, now: number): Items {
  const mine = stamp(current, base ?? new Map(), device, now, base === null && theirs.length > 0)
  return prune(merge([mine, ...theirs]), now)
}

const liveOf = (map: Items): Live => new Map([...map].flatMap(([k, e]) => (e.v === undefined ? [] : [[k, e.v] as [string, string]])))

function sameLive(a: Live, b: Live): boolean {
  if (a.size !== b.size) return false
  for (const [k, v] of a) if (b.get(k) !== v) return false
  return true
}
function sameItems(a: Items, b: Items): boolean {
  if (a.size !== b.size) return false
  for (const [k, e] of a) { const f = b.get(k); if (!f || f.v !== e.v || f.t !== e.t || f.d !== e.d) return false }
  return true
}

/** Entries as a file writes them; a deletion has no v. */
function entriesOut(map: Items): Record<string, Entry> {
  const out: Record<string, Entry> = {}
  for (const k of [...map.keys()].sort()) { const e = map.get(k)!; out[k] = e.v === undefined ? { d: e.d, t: e.t } as Entry : { d: e.d, t: e.t, v: e.v } }
  return out
}

/** A map's entries as read, or null when one won't read (JSONDecoder fails
 * the whole of it); entries with a stamp that is no time are left out. */
function entriesIn(raw: unknown): Items | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const out: Items = new Map()
  for (const [k, e] of Object.entries(raw as Record<string, unknown>)) {
    if (!e || typeof e !== 'object') return null
    const { v, t, d } = e as Record<string, unknown>
    if (typeof t !== 'number' || typeof d !== 'string' || (v !== undefined && v !== null && typeof v !== 'string')) return null
    if (!Number.isFinite(t) || t < 0 || !d) continue
    out.set(k, typeof v === 'string' ? { v, t, d } : { t, d })
  }
  return out
}

interface SyncFile { device: string; name?: string; items: Items }

/** Another computer's file, if this one can read it for this scope. */
function decodeFile(data: string, scope: string): SyncFile | null {
  let raw: Record<string, unknown>
  try { raw = JSON.parse(data) } catch { return null }
  if (!raw || typeof raw !== 'object') return null
  if (raw.format !== FORMAT || raw.scope !== scope || typeof raw.device !== 'string' || !raw.device || typeof raw.written !== 'number') return null
  if (raw.name !== undefined && raw.name !== null && typeof raw.name !== 'string') return null
  const items = entriesIn(raw.items)
  if (!items) return null
  return { device: raw.device, name: typeof raw.name === 'string' ? raw.name : undefined, items }
}

/** A list's order applied to the ids that are there (SyncMerge.ordered). */
function ordered(ids: Set<string>, order: string[], fallback: string[] = []): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const id of [...order, ...fallback]) if (ids.has(id) && !seen.has(id)) { out.push(id); seen.add(id) }
  return [...out, ...[...ids].filter(id => !seen.has(id)).sort()]
}

// MARK: - what each kind of thing is, as items (SyncItems)

interface SyncedSpace { name: string; colour: number; icon?: string; sharesSignIns?: boolean }
interface SyncedPin { letter: string; home: string; name?: string; listed?: boolean }
interface SyncedPinFolder { name: string; parent?: string; feed?: string }
interface SyncedBookmark { title: string; url?: string }

const isStr = (v: unknown): v is string => typeof v === 'string'
const optional = (v: unknown, test: (x: unknown) => boolean) => v === undefined || v === null || test(v)
const strings = (t?: string): string[] | null => { const v = value(t); return Array.isArray(v) && v.every(isStr) ? v : null }
const aString = (t?: string): string | null => { const v = value(t); return isStr(v) ? v : null }

function asSpace(t?: string): SyncedSpace | null {
  const v = value(t) as Record<string, unknown> | undefined
  if (!v || typeof v !== 'object' || !isStr(v.name) || !Number.isInteger(v.colour)) return null
  if (!optional(v.icon, isStr) || !optional(v.sharesSignIns, x => typeof x === 'boolean')) return null
  return { name: v.name, colour: v.colour as number, ...(isStr(v.icon) ? { icon: v.icon } : {}), ...(typeof v.sharesSignIns === 'boolean' ? { sharesSignIns: v.sharesSignIns } : {}) }
}
function asPin(t?: string): SyncedPin | null {
  const v = value(t) as Record<string, unknown> | undefined
  if (!v || typeof v !== 'object' || !isStr(v.letter) || !isStr(v.home)) return null
  if (!optional(v.name, isStr) || !optional(v.listed, x => typeof x === 'boolean')) return null
  return { letter: v.letter, home: v.home, ...(isStr(v.name) ? { name: v.name } : {}), ...(typeof v.listed === 'boolean' ? { listed: v.listed } : {}) }
}
function asPinFolder(t?: string): SyncedPinFolder | null {
  const v = value(t) as Record<string, unknown> | undefined
  if (!v || typeof v !== 'object' || !isStr(v.name)) return null
  if (!optional(v.parent, x => !!uuid(x)) || !optional(v.feed, x => isStr(x) && x.length > 0)) return null
  return { name: v.name, ...(uuid(v.parent) ? { parent: uuid(v.parent) } : {}), ...(isStr(v.feed) ? { feed: v.feed } : {}) }
}
function asBookmark(t?: string): SyncedBookmark | null {
  const v = value(t) as Record<string, unknown> | undefined
  if (!v || typeof v !== 'object' || !isStr(v.title) || !optional(v.url, isStr)) return null
  return { title: v.title, ...(isStr(v.url) ? { url: v.url } : {}) }
}
/** SpaceGradient never fails to read; usable with two colours that read. */
function asGradient(t?: string): { colours: string[]; angle: number; grain: boolean } | null {
  const v = value(t) as Record<string, unknown> | undefined
  if (v === undefined) return null
  const o = v && typeof v === 'object' ? v : {}
  const colours = Array.isArray(o.colours) && o.colours.every(isStr) ? o.colours as string[] : []
  const angle = typeof o.angle === 'number' && Number.isFinite(o.angle) ? o.angle : 135
  return { colours, angle, grain: o.grain === true }
}
const usable = (g: { colours: string[] } | null | undefined) => !!g && g.colours.filter(c => /^#?[0-9a-f]{6}$/i.test(c)).slice(0, 3).length >= 2
const strengths = ['subtle', 'rich', 'vivid']

/** Whether an item reads here: only those can be found missing and deleted. */
function understood(key: string, t: string): boolean {
  if (key.startsWith('space:')) return !!asSpace(t)
  if (key.startsWith('gradient:')) return usable(asGradient(t))
  if (key.startsWith('strength:')) return strengths.includes(aString(t) ?? '')
  if (key.startsWith('pin:')) return !!asPin(t)
  if (key.startsWith('bm:')) return !!asBookmark(t)
  if (key.startsWith('order:') || key.startsWith('kids:')) return !!strings(t)
  if (key.startsWith('title:pin:')) return aString(t) !== null
  if (key.startsWith('pinfolder:')) return !!asPinFolder(t)
  if (key.startsWith('pinfolders:')) return !!strings(t)
  if (key.startsWith('infolder:')) return !!uuid(aString(t))
  if (key.startsWith('set:')) return key.slice(4) in settings
  return false
}

// settings (SyncSettings.all): how Oriel looks and behaves, never what
// belongs to this computer.

const bools = ['search.suggest', 'spaces', 'pins.list', 'pins.home', 'tabs.shortcuts', 'shield', 'privacy.clickIDs', 'privacy.gpc', 'bookmarks.bar', 'bookmarks.side', 'quit.confirm']
const oneOf = (list: unknown[], fallback: unknown) => ({ read: (v: unknown) => (list.includes(v) ? v : fallback), ok: (v: unknown) => list.includes(v) })
const settings: Record<string, { read: (v: unknown) => unknown; ok: (v: unknown) => boolean }> = {
  look: oneOf(['light', 'dark', 'system'], 'system'),
  glyph: oneOf(['letters', 'icons'], 'letters'),
  'search.engine': oneOf(['google', 'duckduckgo', 'bing', 'ecosia', 'startpage', 'kagi', 'brave', 'qwant', 'custom'], 'google'),
  'search.custom': { read: v => (isStr(v) ? v : ''), ok: isStr },
  'search.keywords': {
    read: v => {
      const list = isStr(v) ? value(v) : v
      return Array.isArray(list) ? list.filter(k => k && isStr(k.keyword) && isStr(k.template)).map(k => ({ id: uuid(k.id) ?? '', keyword: k.keyword, template: k.template })) : []
    },
    ok: v => Array.isArray(v) && v.every(k => k && uuid(k.id) && isStr(k.keyword) && isStr(k.template)),
  },
  'tabs.close.after': oneOf([0, 12, 24, 168, 720], 0),
  'tabs.newPlace': oneOf(['next', 'top', 'end'], 'next'),
  ...Object.fromEntries(bools.map(k => [k, { read: (v: unknown) => v === true, ok: (v: unknown) => typeof v === 'boolean' }])),
}

function settingItems(): Live {
  // A site shortcut with no id (one made before ids) gets one, as the Mac's all have.
  const kw = model.pref<unknown>('search.keywords')
  const list = isStr(kw) ? value(kw) : kw
  if (Array.isArray(list) && list.some(k => k && !uuid(k.id))) setKey('search.keywords', list.map(k => (k && !uuid(k.id) ? { ...k, id: newID() } : k)))
  const out: Live = new Map()
  for (const [key, s] of Object.entries(settings)) {
    const raw = key === 'tabs.close.after' ? Number(model.pref(key) ?? 0) : model.pref(key)
    out.set('set:' + key, text(s.read(raw)))
  }
  return out
}

function applySettings(live: Live): void {
  for (const [key, s] of Object.entries(settings)) {
    const v = value(live.get('set:' + key))
    if (v === undefined || !s.ok(v)) continue
    const raw = key === 'tabs.close.after' ? Number(model.pref(key) ?? 0) : model.pref(key)
    if (text(v) !== text(s.read(raw))) setKey(key, v)
  }
}

// a profile's things: spaces, pins, pin folders, bookmarks

const profileScope = 'profile-' + personalProfileID
const SHARED = 'shared'

function spaceItems(base: Live): Live {
  const out: Live = new Map()
  for (const s of model.spaces) {
    const agreed = asSpace(base.get('space:' + s.id))
    const shares = agreed ? agreed.sharesSignIns : s.sharesSignIns
    out.set('space:' + s.id, text({ name: s.name, colour: s.colour, icon: s.icon, sharesSignIns: shares }))
    const g = s.gradient as { colours: string[]; angle?: number; grain?: boolean } | undefined
    if (g && usable(g)) out.set('gradient:' + s.id, text({ colours: g.colours, angle: g.angle ?? 135, grain: g.grain === true }))
    if (s.strength && s.strength !== 'subtle') out.set('strength:' + s.id, text(s.strength))
  }
  if (model.spaces.length) out.set('order:spaces', text(model.spaces.map(s => s.id)))
  return out
}

function applySpaces(live: Live, local: SpaceRecord[], home: string): SpaceRecord[] {
  const found = new Map<string, SyncedSpace>()
  for (const [key, t] of live) {
    if (!key.startsWith('space:')) continue
    const id = uuid(key.slice(6)); const s = asSpace(t)
    if (id && s) found.set(id, s)
  }
  const ids = new Set(found.keys())
  for (const s of local) if (s.id === home || (live.has('space:' + s.id) && !asSpace(live.get('space:' + s.id)))) ids.add(s.id)
  const order = (strings(live.get('order:spaces')) ?? []).map(x => uuid(x) ?? x)
  return ordered(ids, order, local.map(s => s.id)).map(id => {
    const mine = local.find(s => s.id === id)
    const space: SpaceRecord = mine ? { ...mine } : { id, name: '', colour: 0 }
    const synced = found.get(id)
    if (synced) {
      space.name = synced.name
      space.colour = synced.colour
      if (synced.icon) space.icon = synced.icon; else delete space.icon
      if (!mine) { if (synced.sharesSignIns !== undefined) space.sharesSignIns = synced.sharesSignIns }
      const g = asGradient(live.get('gradient:' + id))
      if (g && usable(g)) space.gradient = { colours: g.colours, angle: g.angle, ...(g.grain ? { grain: true } : {}) } as SpaceRecord['gradient']
      else delete space.gradient
      const st = aString(live.get('strength:' + id))
      if (st === 'rich' || st === 'vivid') space.strength = st; else delete space.strength
    }
    if (!space.name) space.name = 'Space'
    return space
  })
}

function pinItems(base: Live): Live {
  const out: Live = new Map()
  const add = (defs: PinDef[], space: string, folders: boolean) => {
    for (const d of defs) {
      out.set(`pin:${space}:${d.id}`, text({ letter: d.letter, home: d.home, name: d.name, listed: d.listed }))
      out.set('title:pin:' + d.id, base.get('title:pin:' + d.id) ?? text(d.title))
      if (folders && d.folder) out.set('infolder:' + d.id, text(d.folder))
    }
    if (defs.length) out.set('order:pins:' + space, text(defs.map(d => d.id)))
  }
  for (const s of model.spaces) { const defs = model.pinsBySpace.get(s.id) ?? []; if (defs.length) add(defs, s.id, true) }
  add(model.sharedPins, SHARED, false)
  return out
}

function applyPins(live: Live, spaces: string[], local: Map<string, PinDef[]>, localShared: PinDef[]): { bySpace: Map<string, PinDef[]>; shared: PinDef[] } {
  const known = [...[...local.values()].flat(), ...localShared]
  const defs = (space: string, fallback: PinDef[]): PinDef[] => {
    const prefix = `pin:${space}:`
    const found = new Map<string, SyncedPin>()
    for (const [key, t] of live) {
      if (!key.startsWith(prefix)) continue
      const id = uuid(key.slice(prefix.length)); const pin = asPin(t)
      if (id && pin) found.set(id, pin)
    }
    const order = (strings(live.get('order:pins:' + space)) ?? []).map(x => uuid(x) ?? x)
    return ordered(new Set(found.keys()), order, fallback.map(d => d.id)).map(id => {
      const pin = found.get(id)!
      const mine = known.find(d => d.id === id)
      const def: PinDef = {
        id, letter: pin.letter, home: pin.home, title: aString(live.get('title:pin:' + id)) ?? mine?.title ?? pin.home,
        ...(pin.name !== undefined ? { name: pin.name } : {}), ...(pin.listed !== undefined ? { listed: pin.listed } : {}),
      }
      if (space !== SHARED) {
        const t = live.get('infolder:' + id)
        const folder = t === undefined ? undefined : uuid(aString(t)) ?? mine?.folder
        if (folder) def.folder = folder
      }
      if (mine?.titled) def.titled = mine.titled
      if (mine?.pair) def.pair = mine.pair
      return def
    })
  }
  const shared = defs(SHARED, localShared)
  const sharedIDs = new Set(shared.map(d => d.id))
  const bySpace = new Map<string, PinDef[]>()
  for (const space of spaces) {
    const own = defs(space, local.get(space) ?? []).filter(d => !sharedIDs.has(d.id))
    if (own.length) bySpace.set(space, own)
  }
  return { bySpace, shared }
}

function pinFolderItems(): Live {
  const out: Live = new Map()
  for (const s of model.spaces) {
    const folders = model.folders.get(s.id) ?? []
    if (!folders.length) continue
    for (const f of folders) out.set(`pinfolder:${s.id}:${f.id}`, text({ name: f.name, parent: f.parent, feed: f.feed }))
    out.set('pinfolders:' + s.id, text(folders.map(f => f.id)))
  }
  return out
}

function applyPinFolders(live: Live, space: string, local: PinFolder[]): PinFolder[] {
  const prefix = `pinfolder:${space}:`
  const found = new Map<string, SyncedPinFolder>()
  for (const [key, t] of live) {
    if (!key.startsWith(prefix)) continue
    const id = uuid(key.slice(prefix.length)); const f = asPinFolder(t)
    if (id && f) found.set(id, f)
  }
  const order = (strings(live.get('pinfolders:' + space)) ?? []).map(x => uuid(x) ?? x)
  return ordered(new Set(found.keys()), order, local.map(f => f.id)).map(id => {
    const synced = found.get(id)!
    const mine = local.find(f => f.id === id)
    const folder: PinFolder = { id, name: synced.name, collapsed: mine?.collapsed ?? false }
    if (synced.parent) folder.parent = synced.parent
    if (synced.feed) folder.feed = synced.feed
    if (synced.feed && mine?.feed === synced.feed && mine.items) folder.items = mine.items
    return folder
  })
}

function bookmarkItems(): Live {
  const out: Live = new Map()
  const walk = (nodes: BookmarkNode[], folder: string) => {
    if (nodes.length) out.set('kids:' + folder, text(nodes.map(n => n.id)))
    for (const n of nodes) {
      out.set('bm:' + n.id, text({ title: n.title, url: n.url ?? undefined }))
      if (n.url == null) walk(n.children ?? [], n.id)
    }
  }
  walk(bookmarks().roots, 'root')
  return out
}

/** The tree the items say; a bookmark no folder lists goes at the end of
 * the top level rather than being lost. */
function applyBookmarks(live: Live): BookmarkNode[] {
  const nodes = new Map<string, SyncedBookmark>()
  for (const [key, t] of live) {
    if (!key.startsWith('bm:')) continue
    const id = uuid(key.slice(3)); const b = asBookmark(t)
    if (id && b) nodes.set(id, b)
  }
  const placed = new Set<string>()
  const kids = (folder: string) => (strings(live.get('kids:' + folder)) ?? []).map(x => uuid(x) ?? x)
  const node = (id: string, b: SyncedBookmark): BookmarkNode =>
    (b.url === undefined ? { id, title: b.title, children: build(id) } : { id, title: b.title, url: b.url })
  const build = (folder: string): BookmarkNode[] => kids(folder).flatMap(id => {
    const b = nodes.get(id)
    if (!b || placed.has(id)) return []
    placed.add(id)
    return [node(id, b)]
  })
  const roots = build('root')
  for (const id of [...nodes.keys()].sort()) {
    if (placed.has(id)) continue
    placed.add(id)
    roots.push(node(id, nodes.get(id)!))
  }
  return roots
}

function profileItems(base: Live): Live {
  return new Map([...spaceItems(base), ...pinItems(base), ...pinFolderItems(), ...bookmarkItems()])
}

/** Spaces first, so pins have their space; then each space's folders, so
 * pins land in theirs at once; then the pins; then the bookmarks. */
function applyProfile(live: Live): void {
  const local = model.spaces.map(s => ({ ...s }))
  const spaces = applySpaces(live, local, model.homeSpace)
  const win = model.primary() ?? [...model.windows.values()][0]
  for (const gone of local) if (!spaces.some(s => s.id === gone.id) && win) model.deleteSpace(win, gone.id)
  const kept = spaces.filter(s => model.spaces.some(x => x.id === s.id) || !local.some(x => x.id === s.id))
  if (text(kept) !== text(model.spaces)) {
    if (!model.pref<boolean>('spaces.orderKept')) model.setPref('spaces.orderKept', true)
    model.spaces = kept
    model.saveSpaces()
  }

  let foldersChanged = false
  for (const s of model.spaces) {
    const mine = model.folders.get(s.id) ?? []
    const next = applyPinFolders(live, s.id, mine)
    if (text(next) === text(mine)) continue
    if (next.length) model.folders.set(s.id, next); else model.folders.delete(s.id)
    foldersChanged = true
  }
  if (foldersChanged) model.saveFolders()

  const ids = model.spaces.map(s => s.id)
  const localPins = new Map(ids.map(id => [id, model.pinsBySpace.get(id) ?? []] as [string, PinDef[]]))
  const pins = applyPins(live, ids, localPins, model.sharedPins)
  let pinsChanged = text(pins.shared) !== text(model.sharedPins)
  for (const id of ids) {
    const next = pins.bySpace.get(id) ?? []
    if (text(next) === text(model.pinsBySpace.get(id) ?? [])) continue
    if (next.length) model.pinsBySpace.set(id, next); else model.pinsBySpace.delete(id)
    pinsChanged = true
  }
  if (pinsChanged) {
    model.sharedPins = pins.shared
    model.savePins()
    model.reconcileAll(SHARED)
  }

  const roots = applyBookmarks(live)
  if (text(roots) !== text(bookmarks().roots)) bookmarks().adopt(roots)
}

// MARK: - the folder and the passes (Sync.swift)

let folder: string | null = null
let lastSynced: number | null = null
let problem: string | null = null
let others: string[] = []
let running = false
let again = false
let generation = 0
let pending: NodeJS.Timeout | null = null
let timer: NodeJS.Timeout | null = null
const watchers = new Map<string, FSWatcher>()

/** This computer's id in the folder: made once, kept with the settings, so
 * each test world is a computer of its own. */
function device(): string {
  const kept = model.pref<string>('sync.device')
  if (isStr(kept) && kept) return kept
  const made = newID()
  model.setPref('sync.device', made)
  return made
}

const machineName = () => os.hostname().replace(/\.local$/i, '') || 'Computer'
const scopes = () => ['app', profileScope]
const stateFile = (scope: string) => dataFile(`sync-${scope}.json`)
const root = () => (folder ? path.join(folder, INSIDE) : null)

function writeAtomic(file: string, data: string): void {
  const temp = `${file}.${process.pid}.tmp`
  writeFileSync(temp, data)
  renameSync(temp, file)
}

function turnOn(chosen: string): void {
  stop()
  // Always as a computer joining: what it agreed with another folder, or
  // with this one long ago, says nothing about what is there now.
  for (const scope of scopes()) rmSync(stateFile(scope), { force: true })
  folder = chosen
  begin()
}

function turnOff(): void {
  const r = root()
  if (r) for (const scope of scopes()) rmSync(path.join(r, scope, device() + '.json'), { force: true })
  for (const scope of scopes()) rmSync(stateFile(scope), { force: true })
  stop()
  folder = null
  lastSynced = null
  problem = null
  others = []
  tell()
}

function begin(): void {
  generation++
  timer = setInterval(() => void pass(), 30_000)
  schedule(1000)
}

function stop(): void {
  generation++
  if (timer) clearInterval(timer)
  if (pending) clearTimeout(pending)
  timer = pending = null
  for (const w of watchers.values()) w.close()
  watchers.clear()
}

/** A pass a moment from now; anything else that changes meanwhile joins it. */
function schedule(delay = 2000): void {
  if (!folder) return
  if (running) { again = true; return }
  if (pending) clearTimeout(pending)
  pending = setTimeout(() => { pending = null; void pass() }, delay)
}

function isFolder(p: string): boolean {
  try { return statSync(p).isDirectory() } catch { return false }
}

async function pass(): Promise<void> {
  const chosen = folder
  if (!chosen || running) { if (running) again = true; return }
  if (pending) { clearTimeout(pending); pending = null }
  // A folder not there (a disk not plugged in, OneDrive not running) is no
  // reason to think everything was deleted: nothing happens.
  if (!isFolder(chosen)) { problem = 'The folder isn’t there'; tell(); return }
  running = true
  const gen = generation
  try {
    const seen = new Set<string>()
    for (const n of await run('app', gen, () => settingItems(), applySettings)) seen.add(n)
    for (const n of await run(profileScope, gen, profileItems, applyProfile)) seen.add(n)
    if (gen !== generation) return
    others = [...seen].sort()
    if (!problem) lastSynced = Date.now()
  } finally {
    running = false
    tell()
    if (again) { again = false; schedule() }
  }
}

/** One scope: stamped, merged with the other computers' files, applied,
 * written. The names of the other computers read. */
async function run(scope: string, gen: number, current: (base: Live) => Live, apply: (live: Live) => void): Promise<string[]> {
  const r = root()
  if (!r || gen !== generation) return []
  const dir = path.join(r, scope)
  try { mkdirSync(dir, { recursive: true }) } catch {
    problem = `${brand.name} can’t write in that folder`
    return []
  }
  problem = null
  watchFolder(dir, scope)
  const me = device()
  let state: Items | null = null
  try { state = entriesIn(JSON.parse(readFileSync(stateFile(scope), 'utf8'))) } catch { state = null }
  const base = state ?? new Map()
  const theirs: Items[] = []
  const names: string[] = []
  const own = path.join(dir, me + '.json')
  let listing: string[] = []
  try { listing = await fsp.readdir(dir) } catch {}
  for (const name of listing) {
    // A file a cloud folder has let go of (iCloud's ".<name>.json.icloud")
    // is skipped; OneDrive's on-demand files arrive when read.
    if (!name.endsWith('.json') || name.startsWith('.') || name === me + '.json') continue
    try {
      const p = path.join(dir, name)
      const st = await fsp.stat(p)
      if (!st.isFile() || st.size >= 32 << 20) continue
      const file = decodeFile(await fsp.readFile(p, 'utf8'), scope)
      if (!file || file.device === me) continue
      theirs.push(file.items)
      names.push(file.name ?? 'Another computer')
    } catch {}
  }
  if (gen !== generation) return []
  const now = Date.now() / 1000
  const here = current(liveOf(base))
  const merged = passMaps(here, state, theirs, me, now)
  const live = liveOf(merged)
  if (!sameLive(live, here)) apply(live)
  if (!state || !sameItems(merged, base)) {
    try { writeAtomic(stateFile(scope), JSON.stringify(entriesOut(merged))) } catch {}
  }
  // This computer's file, only when it says something new.
  let written: SyncFile | null = null
  try { written = decodeFile(readFileSync(own, 'utf8'), scope) } catch {}
  if (!written || !sameItems(written.items, merged) || written.name !== machineName()) {
    const file = { device: me, format: FORMAT, items: entriesOut(merged), name: machineName(), scope, written: now }
    try { writeAtomic(own, JSON.stringify(file)) } catch { problem = `${brand.name} can’t write in that folder` }
  }
  return names
}

/** A file of another computer arriving or changing: a pass soon. Oriel's
 * own writes come back here too and find nothing new. */
function watchFolder(dir: string, scope: string): void {
  if (watchers.has(scope)) return
  try {
    const w = watch(dir, (_e, name) => { if (!name || String(name).endsWith('.json')) schedule() })
    w.on('error', () => { w.close(); watchers.delete(scope) })
    watchers.set(scope, w)
  } catch {}
}

// MARK: - when

let started = false
model.on('window-opened', (id: string) => setImmediate(() => {
  // Oriel coming forward (Sync.swift: didBecomeActive): a pass soon.
  controllerFor(id)?.base.on('focus', () => schedule())
  if (started) return
  started = true
  const kept = model.pref<string>('sync.folder')
  if (isStr(kept) && kept) { folder = kept; begin() }
  const store = bookmarks()
  const before = store.onChange
  store.onChange = () => { before(); schedule() }
}))

model.on('window-changed', (_id: string, slices: string[]) => {
  if (slices.includes('prefs')) {
    const chosen = model.pref<string>('sync.folder') || null
    if (chosen !== folder && started) { if (chosen) turnOn(chosen); else turnOff(); return }
  }
  if (folder && slices.some(s => s === 'spaces' || s === 'pins' || s === 'pinFolders' || s === 'prefs')) schedule()
})

// MARK: - for Settings

/** Where, and with whom, in a line. */
function summary(): string {
  if (!folder) return ''
  const home = os.homedir()
  const clouds: [string | undefined, string][] = [
    [process.env.OneDrive, 'OneDrive'], [process.env.OneDriveConsumer, 'OneDrive'], [process.env.OneDriveCommercial, 'OneDrive'],
    [path.join(home, 'iCloudDrive'), 'iCloud Drive'], [path.join(home, 'Library', 'Mobile Documents', 'com~apple~CloudDocs'), 'iCloud Drive'],
  ]
  let place = folder
  for (const [at, name] of clouds) if (at && (place === at || place.startsWith(at + path.sep))) { place = name + place.slice(at.length); break }
  if (place.startsWith(home)) place = '~' + place.slice(home.length)
  if (problem) return `${place}: ${problem.startsWith(brand.name) ? problem : problem[0].toLowerCase() + problem.slice(1)}`
  if (!lastSynced || !others.length) return place
  return `${place}, with ${others.join(', ')}`
}

function tell(): void { tellPages('sync', summary(), 'settings') }
moreFacts.sync = summary

benchRequest('settingsb.sync', () => ({ on: !!folder, folder, device: device(), name: machineName(), others, problem, lastSynced, summary: summary() }))
benchRequest('settingsb.syncPass', async () => {
  for (let i = 0; running && i < 200; i++) await new Promise(r => setTimeout(r, 25))
  await pass()
  return { problem, others, summary: summary() }
})

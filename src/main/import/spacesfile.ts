// A spaces file read back (Search 1.0.22, SpacesExport.sidebar and
// Browser.takeArc): Bring Things Over › File… given the .json Export Spaces…
// writes, Oriel's or Search's, brings its spaces in. Each space becomes a
// space here, the one of the same name if there is one, with its colour, icon
// and gradient; its squares its pins, its rows and folders its pinned rows
// (rows only with Pinned rows on, folders only with folders in them on; what
// can't be a row comes as tabs, a folder's as a group of its name); its open
// tabs asleep at the end of its row, in their groups. The pins every space
// showed are shared again where shared pins show (Spaces on), else each
// space's own. A lone space with Spaces off comes into the one there is; more
// than one turns Spaces on. Nothing twice: a pin or a page already there
// isn't added again. Oriel has one profile: another profile's spaces come
// into it too, its shared pins as pins of each of them.

import { model, newID, monogram, spaceIcons, type WindowRecord } from '../model/model'
import { firstSpaceID, decodeShape, emptyShape, encodeShape, sessionFile, type PinDef, type PinFolder, type SessionShape } from '../model/formats'
import { readJSON, writeJSONNow } from '../model/persist'
import type { GroupView } from '../../shared/state'
import { setKey } from '../settings/prefs'
import { FORMAT, type Bundle, type Pin, type Space } from '../data/spaces'

/** The size no spaces file comes near (SpacesExport.limit). */
export const LIMIT = 32 << 20

/** A spaces file, or null for any other JSON (SpacesExport.bundle). */
export function readBundle(text: string): Bundle | null {
  let raw: unknown
  try { raw = JSON.parse(text.replace(/^﻿/, '')) } catch { return null }
  const o = raw as Partial<Bundle> | null
  if (!o || typeof o !== 'object' || o.format !== FORMAT || !Array.isArray(o.profiles)) return null
  const str = (v: unknown) => (typeof v === 'string' ? v : '')
  const pins = (v: unknown): Pin[] => (Array.isArray(v) ? v : []).filter(p => p && typeof p.url === 'string')
    .map(p => ({ title: str(p.title), url: p.url, listed: p.listed === true, ...(typeof p.folder === 'string' ? { folder: p.folder } : {}) }))
  return {
    format: FORMAT, version: Number(o.version) || 1, exported: str(o.exported),
    profiles: o.profiles.filter(p => p && typeof p === 'object').map(p => ({
      name: str(p.name),
      everySpace: pins(p.everySpace),
      spaces: (Array.isArray(p.spaces) ? p.spaces : []).filter(s => s && typeof s.name === 'string' && s.name.trim()).map(s => ({
        name: s.name.trim(),
        colour: Number.isInteger(s.colour) && s.colour >= 0 && s.colour <= 5 ? s.colour : 0,
        ...(typeof s.icon === 'string' ? { icon: s.icon } : {}),
        ...(s.gradient && Array.isArray(s.gradient.colours) && s.gradient.colours.every((c: unknown) => typeof c === 'string') ? { gradient: s.gradient } : {}),
        pins: pins(s.pins),
        folders: (Array.isArray(s.folders) ? s.folders : []).filter(f => f && typeof f.id === 'string')
          .map(f => ({ id: f.id, name: str(f.name) || 'Folder', ...(typeof f.parent === 'string' ? { parent: f.parent } : {}),
            ...(typeof f.feed === 'string' ? { feed: f.feed } : {}), ...(Array.isArray(f.items) ? { items: f.items.filter((i: { url?: unknown }) => i && typeof i.url === 'string') } : {}) })),
        tabs: (Array.isArray(s.tabs) ? s.tabs : []).filter(t => t && typeof t.url === 'string')
          .map(t => ({ title: str(t.title), url: t.url, ...(typeof t.group === 'string' ? { group: t.group } : {}) })),
        groups: (Array.isArray(s.groups) ? s.groups : []).filter(g => g && typeof g.id === 'string').map(g => ({ id: g.id, name: str(g.name) || 'Group' })),
      })),
    })),
  }
}

/** A page worth bringing: http(s) or a file, as Arc.page takes it. */
function page(url: string): string | null {
  try { const u = new URL(url); return /^(https?|file):$/.test(u.protocol) ? u.href : null } catch { return null }
}

const host = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase() } catch { return '' } }
const bare = (url: string) => url.replace(/#.*$/, '').replace(/\/+$/, '').toLowerCase()
/** A pin already here for that page: the same address, or its site's home
 * answered further in (Gmail pinned at mail.google.com, Browser.samePin). */
function samePin(def: PinDef, url: string): boolean {
  if (bare(def.home) === bare(url)) return true
  try {
    const a = new URL(def.home), b = new URL(url)
    return host(def.home) === host(url) && (a.pathname === '/' || b.pathname === '/')
  } catch { return false }
}

function pinDef(title: string, url: string, more: Partial<PinDef> = {}): PinDef {
  return { id: newID(), letter: monogram(url), home: url, title: title || host(url) || url, titled: true, ...more }
}

/** A page to bring in as a tab, and the group it goes in (by name). */
interface Opened { title: string; url: string; group?: string }

/** The space's row as the files or a window hold it: the addresses in it. */
function rowURLs(space: string): { win: WindowRecord | null; urls: Set<string> } {
  const wins = [...model.windows.values()].filter(w => !w.shy)
  const win = wins.find(w => w.loaded.has(space)) ?? null
  if (win) return { win, urls: new Set(model.spaceTabs(win, space).map(id => bare(model.tabs.get(id)?.url ?? ''))) }
  const shape = readJSON<SessionShape>(sessionFile(space), emptyShape(), decodeShape)
  return { win: null, urls: new Set(shape.tabs.map(t => bare(t.url))) }
}

/** Asleep at the end of the space's row, a grouped one in the group of that
 * name, made if missing and folded (Browser.takeAsleep). */
function takeAsleep(pages: Opened[], space: string): number {
  const { win, urls } = rowURLs(space)
  const fresh = pages.filter(p => { const k = bare(p.url); if (urls.has(k)) return false; urls.add(k); return true })
  if (!fresh.length) return 0
  if (win) {
    const groups = (win.groupsBy[space] ??= [])
    const groupNamed = (name: string): GroupView => {
      let g = groups.find(x => x.name.toLowerCase() === name.toLowerCase())
      if (!g) { g = { id: newID(), name, colour: 0, folded: true }; groups.push(g) }
      return g
    }
    for (const p of fresh) {
      const tab = model.addTab(win, { url: p.url, title: p.title, asleep: true, empty: false, space, background: true })
      const row = model.spaceTabs(win, space)
      row.splice(row.indexOf(tab.id), 1)
      row.push(tab.id)
      if (p.group) tab.groupID = groupNamed(p.group).id
    }
    model.arrangeGroups(win, space)
    model.touch(win, ['tabs', 'groups'])
    model.sessionSoon(win, space)
  } else {
    const shape = readJSON<SessionShape>(sessionFile(space), emptyShape(), decodeShape)
    const groups = (shape.groups ??= [])
    const empty = !shape.tabs.length
    for (const p of fresh) {
      let groupID: string | undefined
      if (p.group) {
        let g = groups.find(x => x.name.toLowerCase() === p.group!.toLowerCase())
        if (!g) { g = { id: newID(), name: p.group, collapsed: true }; groups.push(g) }
        groupID = g.id
      }
      shape.tabs.push({ url: p.url, title: p.title, muted: false, ...(groupID ? { groupID } : {}) })
    }
    if (empty) shape.active = -1
    writeJSONNow(sessionFile(space), encodeShape(shape))
  }
  return fresh.length
}

/** A space's pins and rows into its defs and folders; what can't be a row
 * comes back as pages for its row. */
function takePins(space: Space, favourites: Pin[], defs: PinDef[], folders: PinFolder[]): { pins: number; pages: Opened[] } {
  const had = [...defs]
  const fresh = (url: string) => !had.some(d => samePin(d, url)) && !defs.some(d => d.home === url)
  let pins = 0
  for (const f of favourites) {
    const url = page(f.url)
    if (!url || !fresh(url)) continue
    defs.push(pinDef(f.title, url))
    pins++
  }
  const lists = !!model.pref<boolean>('pins.list')
  const nests = lists && !!model.pref<boolean>('pins.folders')
  const known = new Map(space.folders.map(f => [f.id, f]))
  // The folders a row is in, made here only once something lands in them,
  // nested as they were; one of the same name under the same parent is used.
  const made = new Map<string, string>()
  const folderFor = (id: string, seen = new Set<string>()): string | undefined => {
    const f = known.get(id)
    if (!f || seen.has(id) || seen.size > 64) return undefined
    if (made.has(id)) return made.get(id)
    const parent = f.parent && known.has(f.parent) ? folderFor(f.parent, new Set([...seen, id])) : undefined
    let here = folders.find(x => x.name.toLowerCase() === f.name.toLowerCase() && (x.parent ?? undefined) === parent)
    if (!here) {
      here = { id: newID(), name: f.name, collapsed: false, ...(parent ? { parent } : {}) }
      folders.push(here)
    }
    made.set(id, here.id)
    return here.id
  }
  const pages: Opened[] = []
  const rows: { title: string; url: string; folder?: string }[] = [
    ...space.pins.filter(p => p.listed).map(p => ({ title: p.title, url: p.url, folder: p.folder && known.has(p.folder) ? p.folder : undefined })),
    // A live folder's posts as last fetched: pages of that folder.
    ...space.folders.flatMap(f => (f.items ?? []).map(i => ({ title: i.title, url: i.url, folder: f.id }))),
  ]
  for (const r of rows) {
    const url = page(r.url)
    if (!url) continue
    if (nests || (lists && !r.folder)) {
      if (!fresh(url)) continue
      const folder = nests && r.folder ? folderFor(r.folder) : undefined
      defs.push(pinDef(r.title, url, { listed: true, ...(folder ? { folder } : {}) }))
      pins++
    } else {
      pages.push({ title: r.title, url, ...(r.folder ? { group: known.get(r.folder)!.name } : {}) })
    }
  }
  return { pins, pages }
}

/** The bundle brought in: what came, counted (spaces made, pins, tabs). */
export function takeSpaces(bundle: Bundle): { spaces: number; pins: number; tabs: number } {
  let made = 0, pins = 0, tabs = 0
  const all = bundle.profiles.flatMap((p, index) => p.spaces.map(space => ({ space, index, shared: index > 0 ? p.everySpace : [] })))
  const everySpace = bundle.profiles[0]?.everySpace ?? []
  const targets: { id: string; space: Space; favourites: Pin[]; fresh: boolean }[] = []
  if (all.length > 1 || (model.spacesOn() && all.length)) {
    if (!model.spacesOn()) setKey('spaces', true)
    for (const a of all) {
      const same = model.spaces.find(s => s.name.toLowerCase() === a.space.name.toLowerCase())
        ?? targets.find(t => t.fresh && t.space.name.toLowerCase() === a.space.name.toLowerCase())
      targets.push({ id: same?.id ?? newID(), space: a.space, favourites: [...a.shared, ...a.space.pins.filter(p => !p.listed)], fresh: !same })
    }
  } else if (all.length === 1) {
    const home = model.spaceOf(model.homeSpace)
    targets.push({ id: model.homeSpace, space: all[0].space, favourites: [...all[0].shared, ...all[0].space.pins.filter(p => !p.listed)], fresh: false })
    // The one space there is takes the space's name and look while it still
    // has the ones it started with.
    if (home && home.id === firstSpaceID && home.name === 'Personal' && !home.icon && !home.colour) {
      home.name = all[0].space.name
      if (all[0].space.icon && spaceIcons.includes(all[0].space.icon)) home.icon = all[0].space.icon
      home.colour = all[0].space.colour
      if (all[0].space.gradient) home.gradient = all[0].space.gradient
      model.saveSpaces()
    }
  }
  // The pins every space showed: shared again where shared pins show.
  const shares = everySpace.length > 0 && model.spacesOn()
  const used = new Set(model.spaces.map(s => s.icon))
  const news: typeof model.spaces = []
  for (const t of targets) {
    const defs = [...(model.pinsBySpace.get(t.id) ?? [])]
    const folders = [...(model.folders.get(t.id) ?? [])]
    const favourites = (!shares && all.find(a => a.space === t.space)?.index === 0 ? everySpace : []).concat(t.favourites)
    const r = takePins(t.space, favourites, defs, folders)
    pins += r.pins
    if (defs.length) model.pinsBySpace.set(t.id, defs)
    if (folders.length) model.folders.set(t.id, folders)
    const groupName = (id?: string) => (id ? t.space.groups.find(g => g.id === id)?.name : undefined)
    const opened = [...r.pages, ...t.space.tabs.map(x => ({ title: x.title, url: page(x.url) ?? '', group: groupName(x.group) }))].filter(x => x.url)
    // A new space's row is written before the space is there, so whatever
    // brings rows up finds it whole.
    tabs += takeAsleep(opened, t.id)
    if (t.fresh && !model.spaceOf(t.id) && !news.some(s => s.id === t.id)) {
      const icon = t.space.icon && spaceIcons.includes(t.space.icon) ? t.space.icon : spaceIcons.find(i => !used.has(i)) ?? 'briefcase'
      used.add(icon)
      news.push({ id: t.id, name: t.space.name, colour: t.space.colour, icon, sharesSignIns: true, ...(t.space.gradient ? { gradient: t.space.gradient } : {}) })
      made++
    }
  }
  if (shares) {
    for (const p of everySpace) {
      const url = page(p.url)
      if (!url || model.sharedPins.some(d => samePin(d, url))) continue
      model.sharedPins.push(pinDef(p.title, url))
      pins++
    }
  }
  if (news.length) { model.spaces.push(...news); model.saveSpaces() }
  model.savePins()
  model.saveFolders()
  for (const t of targets) model.reconcileAll(t.id)
  if (shares) model.reconcileAll('shared')
  model.touchAll(['spaces', 'pins', 'pinFolders', 'tabs', 'groups'])
  return { spaces: made, pins, tabs }
}

/** What Bring Things Over says after (Browser.takeSpacesFile). */
export function spacesSaid(r: { spaces: number; pins: number; tabs: number }): string {
  const count = (n: number, one: string) => (n === 1 ? `1 ${one}` : `${n.toLocaleString('en-US')} ${one}s`)
  return r.spaces + r.pins + r.tabs === 0 ? 'Those spaces were all here already'
    : `${count(r.spaces, 'new space')}, ${count(r.pins, 'pin')}, ${count(r.tabs, 'tab')}`
}

// The files, exactly as Search on the Mac writes them (studio/01 §6.51, §7.3,
// §9.4, §9.11): same names, same keys, UUIDs in capitals, dates in seconds
// since 2001. Read as leniently as Session.swift, Pins.swift, PinFolders.swift
// and Windows.swift read them: a newer field that makes no sense is dropped,
// an old required one that is missing makes the file unreadable (quarantine).

export const firstSpaceID = '00000000-0000-0000-0000-000000000001'
export const personalProfileID = '00000000-0000-0000-0000-0000000000A1'

const uuidShape = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function uuid(v: unknown): string | undefined {
  return typeof v === 'string' && uuidShape.test(v) ? v.toUpperCase() : undefined
}
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
const int = (v: unknown): number | undefined => (Number.isInteger(v) ? (v as number) : undefined)
const bool = (v: unknown): boolean | undefined => (typeof v === 'boolean' ? v : undefined)
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null)
/** decodeIfPresent of a String: absent or null is nothing, anything else but a string throws. */
class Unreadable extends Error {}
function optString(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined
  if (typeof v !== 'string') throw new Unreadable()
  return v
}
function reqString(v: unknown): string {
  if (typeof v !== 'string') throw new Unreadable()
  return v
}

/** Drop undefined keys, keeping the order given (JSONEncoder's encodeIfPresent). */
function compact<T extends object>(o: T): T {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v
  return out as T
}

// session.json, session-<UUID>.json (Session.swift)

export interface SessionEntry {
  url: string
  title: string
  pin?: string
  name?: string
  home?: string
  groupID?: string
  pinID?: string
  touched?: number
  letGo?: number
  listed?: boolean
  muted: boolean
  twinID?: string
  lifted?: string
}

export interface SessionGroup { id: string; name: string; collapsed: boolean; colour?: number }
export interface SessionSplit { tabs: number[]; axis: 'horizontal' | 'vertical'; sizes: number[]; focused?: number }
export interface SessionShape { tabs: SessionEntry[]; active: number; groups?: SessionGroup[]; splits: SessionSplit[] }

export const emptyShape = (): SessionShape => ({ tabs: [], active: 0, splits: [] })

export function sessionFile(space: string): string {
  return space.toUpperCase() === firstSpaceID ? 'session.json' : `session-${space.toUpperCase()}.json`
}

function decodeEntry(raw: unknown): SessionEntry {
  const o = obj(raw)
  if (!o) throw new Unreadable()
  return compact({
    url: reqString(o.url),
    title: reqString(o.title),
    pin: optString(o.pin),
    name: optString(o.name),
    home: optString(o.home),
    groupID: uuid(o.groupID),
    pinID: uuid(o.pinID),
    touched: num(o.touched),
    letGo: num(o.letGo),
    listed: bool(o.listed),
    muted: bool(o.muted) ?? false,
    twinID: uuid(o.twinID),
    lifted: uuid(o.lifted),
  })
}

export function decodeGroup(raw: unknown): SessionGroup {
  const o = obj(raw)
  if (!o) throw new Unreadable()
  const id = uuid(o.id)
  if (!id) throw new Unreadable()
  return compact({ id, name: reqString(o.name), collapsed: bool(o.collapsed) ?? false, colour: int(o.colour) })
}

function even(n: number): number[] { return Array.from({ length: n }, () => 1 / n) }

function decodeSplit(raw: unknown): SessionSplit {
  const o = obj(raw)
  if (!o) throw new Unreadable()
  let tabs: number[], sizes: number[]
  if (Array.isArray(o.tabs) && o.tabs.every(Number.isInteger)) {
    tabs = o.tabs as number[]
    sizes = Array.isArray(o.sizes) && o.sizes.every(x => typeof x === 'number') ? (o.sizes as number[]) : even(tabs.length)
  } else {
    // The first shape on main: a left, a right and a fraction.
    const left = int(o.left), right = int(o.right)
    if (left === undefined || right === undefined) throw new Unreadable()
    const fraction = num(o.fraction) ?? 0.5
    tabs = [left, right]
    sizes = [fraction, 1 - fraction]
  }
  const axis = o.axis === 'vertical' ? 'vertical' : 'horizontal'
  return compact({ tabs, axis, sizes, focused: int(o.focused) })
}

/** A session file's shape, or null when it won't decode (quarantine). */
export function decodeShape(raw: unknown): SessionShape | null {
  try {
    const o = obj(raw)
    if (!o || !Array.isArray(o.tabs)) return null
    const active = int(o.active)
    if (active === undefined) return null
    const tabs = o.tabs.map(decodeEntry)
    let groups: SessionGroup[] | undefined
    if (o.groups !== undefined && o.groups !== null) {
      try { groups = Array.isArray(o.groups) ? o.groups.map(decodeGroup) : undefined } catch { groups = undefined }
    }
    let splits: SessionSplit[] = []
    try { splits = Array.isArray(o.splits) ? o.splits.map(decodeSplit) : [] } catch { splits = [] }
    return compact({ tabs, active, groups, splits })
  } catch {
    return null
  }
}

export function encodeShape(s: SessionShape): unknown {
  return compact({
    tabs: s.tabs.map(e => compact({
      url: e.url, title: e.title, pin: e.pin, name: e.name, home: e.home, groupID: e.groupID, pinID: e.pinID,
      touched: e.touched, letGo: e.letGo, listed: e.listed, muted: e.muted, twinID: e.twinID, lifted: e.lifted,
    })),
    active: s.active,
    groups: s.groups?.map(g => compact({ id: g.id, name: g.name, collapsed: g.collapsed, colour: g.colour })),
    splits: s.splits.map(p => compact({ tabs: p.tabs, axis: p.axis, sizes: p.sizes, focused: p.focused })),
  })
}

/** Start with a fresh window (Session.fresh, §9.13): pins, named tabs and the
 * tabs of groups stay, with their groups; nothing in front. */
export function freshShape(shape: SessionShape): SessionShape {
  const groups = shape.groups ?? []
  const grouped = new Set(groups.map(g => g.id))
  const places = new Map<number, number>()
  const tabs: SessionEntry[] = []
  shape.tabs.forEach((e, i) => {
    const kept = e.pin !== undefined || e.name !== undefined || (e.groupID !== undefined && grouped.has(e.groupID))
    if (!kept) return
    places.set(i, tabs.length)
    tabs.push(e)
  })
  const keptGroups = groups.filter(g => tabs.some(t => t.groupID === g.id))
  const splits = shape.splits.flatMap(p => {
    const moved = p.tabs.map(i => places.get(i)).filter((i): i is number => i !== undefined)
    if (moved.length !== p.tabs.length) return []
    return [compact({ ...p, tabs: moved, focused: p.focused === undefined ? undefined : places.get(p.focused) })]
  })
  return compact({ tabs, active: -1, groups: keptGroups.length ? keptGroups : undefined, splits })
}

// pins.json (Pins.swift)

export interface PinDef {
  id: string
  letter: string
  home: string
  title: string
  name?: string
  listed?: boolean
  folder?: string
  pair?: string
  titled?: boolean
}

function decodePin(raw: unknown): PinDef {
  const o = obj(raw)
  if (!o) throw new Unreadable()
  const id = uuid(o.id)
  if (!id) throw new Unreadable()
  // Synthesized Codable: a wrong type anywhere fails the whole file.
  const listed = o.listed === undefined || o.listed === null ? undefined : bool(o.listed)
  if (o.listed !== undefined && o.listed !== null && listed === undefined) throw new Unreadable()
  const titled = o.titled === undefined || o.titled === null ? undefined : bool(o.titled)
  if (o.titled !== undefined && o.titled !== null && titled === undefined) throw new Unreadable()
  const folder = o.folder === undefined || o.folder === null ? undefined : uuid(o.folder)
  if (o.folder !== undefined && o.folder !== null && !folder) throw new Unreadable()
  const pair = o.pair === undefined || o.pair === null ? undefined : uuid(o.pair)
  if (o.pair !== undefined && o.pair !== null && !pair) throw new Unreadable()
  return compact({ id, letter: reqString(o.letter), home: reqString(o.home), title: reqString(o.title), name: optString(o.name), listed, folder, pair, titled })
}

export interface PinsFile {
  /** Each space's own pins, by space id. */
  bySpace: Map<string, PinDef[]>
  /** Personal's pins every space shows. */
  shared: PinDef[]
  /** Other profiles' shared lists, kept as they are ("shared:<UUID>"). */
  others: Map<string, PinDef[]>
}

export function decodePins(raw: unknown): PinsFile | null {
  const o = obj(raw)
  if (!o) return null
  try {
    const file: PinsFile = { bySpace: new Map(), shared: [], others: new Map() }
    for (const [key, list] of Object.entries(o)) {
      if (!Array.isArray(list)) return null
      const defs = list.map(decodePin)
      if (key === 'shared') file.shared = defs
      else if (key.startsWith('shared:')) { const id = uuid(key.slice(7)); if (id) file.others.set(id, defs) }
      else { const id = uuid(key); if (id) file.bySpace.set(id, defs) }
    }
    return file
  } catch {
    return null
  }
}

export function encodePins(f: PinsFile): unknown {
  const out: Record<string, unknown> = {}
  const def = (p: PinDef) => compact({ id: p.id, letter: p.letter, home: p.home, title: p.title, name: p.name, listed: p.listed, folder: p.folder, pair: p.pair, titled: p.titled })
  for (const [space, defs] of f.bySpace) if (defs.length) out[space] = defs.map(def)
  if (f.shared.length) out.shared = f.shared.map(def)
  for (const [profile, defs] of f.others) if (defs.length) out[`shared:${profile}`] = defs.map(def)
  return out
}

// pin-folders.json (PinFolders.swift)

export interface FeedItem { id: string; title: string; link: string }
export interface PinFolder {
  id: string
  name: string
  parent?: string
  collapsed: boolean
  feed?: string
  items?: FeedItem[]
}

function decodeFolder(raw: unknown): PinFolder {
  const o = obj(raw)
  if (!o) throw new Unreadable()
  const id = uuid(o.id)
  if (!id) throw new Unreadable()
  const feed = typeof o.feed === 'string' ? o.feed : undefined
  let items: FeedItem[] | undefined
  if (feed && Array.isArray(o.items)) {
    try {
      items = o.items.map(x => {
        const i = obj(x)
        const iid = i && uuid(i.id)
        if (!i || !iid || typeof i.title !== 'string' || typeof i.link !== 'string') throw new Unreadable()
        return { id: iid, title: i.title, link: i.link }
      })
    } catch { items = undefined }
  }
  return compact({ id, name: reqString(o.name), parent: uuid(o.parent), collapsed: bool(o.collapsed) ?? false, feed, items })
}

/** Leniently: a space whose list won't read is a space with no folders. */
export function decodeFolders(raw: unknown): Map<string, PinFolder[]> | null {
  const o = obj(raw)
  if (!o) return null
  const out = new Map<string, PinFolder[]>()
  for (const [key, list] of Object.entries(o)) {
    const id = uuid(key)
    if (!id || !Array.isArray(list)) continue
    try { out.set(id, list.map(decodeFolder)) } catch { /* that space: none */ }
  }
  return out
}

export function encodeFolders(m: Map<string, PinFolder[]>): unknown {
  const out: Record<string, unknown> = {}
  for (const [space, list] of m) {
    if (!list.length) continue
    out[space] = list.map(f => compact({ id: f.id, name: f.name, parent: f.parent, collapsed: f.collapsed, feed: f.feed, items: f.items }))
  }
  return out
}

// spaces.json (Spaces.swift)

export interface SpaceFile {
  id: string
  name: string
  colour: number
  icon?: string
  sharesSignIns?: boolean
  downloads?: string
  profile?: string
  gradient?: { colours: string[]; angle?: number; grain?: boolean }
  strength?: 'subtle' | 'rich' | 'vivid'
}

function decodeSpace(raw: unknown): SpaceFile {
  const o = obj(raw)
  if (!o) throw new Unreadable()
  const id = uuid(o.id)
  const colour = int(o.colour)
  if (!id || colour === undefined) throw new Unreadable()
  const g = obj(o.gradient)
  // SpaceGradient's decoder never fails: what it can't read is no gradient.
  const gradient = g && Array.isArray(g.colours) && g.colours.every(c => typeof c === 'string')
    ? compact({ colours: g.colours as string[], angle: num(g.angle), grain: bool(g.grain) }) : undefined
  const strength = o.strength === 'subtle' || o.strength === 'rich' || o.strength === 'vivid' ? o.strength : undefined
  if (o.strength !== undefined && o.strength !== null && !strength) throw new Unreadable()
  return compact({
    id, name: reqString(o.name), colour, icon: optString(o.icon),
    sharesSignIns: bool(o.sharesSignIns), downloads: optString(o.downloads), profile: uuid(o.profile),
    gradient, strength,
  })
}

export function decodeSpaces(raw: unknown): SpaceFile[] | null {
  if (!Array.isArray(raw)) return null
  try { return raw.map(decodeSpace) } catch { return null }
}

export function encodeSpaces(list: SpaceFile[]): unknown {
  return list.map(s => compact({
    id: s.id, name: s.name, colour: s.colour, icon: s.icon, sharesSignIns: s.sharesSignIns,
    downloads: s.downloads, profile: s.profile, gradient: s.gradient && compact({ ...s.gradient }), strength: s.strength,
  }))
}

// windows.json (Windows.swift)

export interface WindowFile {
  id: string
  /** NSStringFromRect: "{{x, y}, {width, height}}". */
  frame?: string
  space: string
  rows: Record<string, SessionShape>
  merge?: string
  tucked?: boolean
  folded?: boolean
  /** Windows only: maximized when it closed. A Mac reads past it. */
  maximized?: boolean
}

export function decodeWindows(raw: unknown): WindowFile[] {
  if (!Array.isArray(raw)) return []
  const out: WindowFile[] = []
  for (const x of raw) {
    const o = obj(x)
    if (!o) return [] // [WindowRecord] fails whole: no windows
    const rows: Record<string, SessionShape> = {}
    const r = obj(o.rows)
    let rowsOK = !!r || o.rows === undefined
    if (r) for (const [k, v] of Object.entries(r)) {
      const shape = decodeShape(v)
      if (!shape) { rowsOK = false; break }
      rows[k.toUpperCase()] = shape
    }
    out.push(compact({
      id: uuid(o.id) ?? crypto.randomUUID().toUpperCase(),
      frame: typeof o.frame === 'string' ? o.frame : undefined,
      space: uuid(o.space) ?? firstSpaceID,
      rows: rowsOK ? rows : {},
      merge: uuid(o.merge), tucked: bool(o.tucked), folded: bool(o.folded), maximized: bool(o.maximized),
    }))
  }
  return out
}

export function encodeWindows(list: WindowFile[]): unknown {
  return list.map(w => {
    const rows: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(w.rows)) rows[k] = encodeShape(v)
    return compact({ id: w.id, frame: w.frame, space: w.space, rows, merge: w.merge, tucked: w.tucked, folded: w.folded, maximized: w.maximized })
  })
}

export function frameString(r: { x: number; y: number; width: number; height: number }): string {
  return `{{${Math.round(r.x)}, ${Math.round(r.y)}}, {${Math.round(r.width)}, ${Math.round(r.height)}}}`
}

/** NSRectFromString, valid only when wider and taller than 100 (Windows.swift). */
export function parseFrame(s?: string): { x: number; y: number; width: number; height: number } | null {
  const m = s?.match(/\{\{\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\}\s*,\s*\{\s*([\d.]+)\s*,\s*([\d.]+)\s*\}\}/)
  if (!m) return null
  const [x, y, width, height] = m.slice(1).map(Number)
  return width > 100 && height > 100 ? { x, y, width, height } : null
}

// profiles.json (Profiles.swift): only Personal's home is ours to write.

export interface ProfileFile { id: string; name: string; home: string }

export function decodeProfiles(raw: unknown): ProfileFile[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap(x => {
    const o = obj(x)
    const id = o && uuid(o.id), home = o && uuid(o.home)
    return o && id && home && typeof o.name === 'string' ? [{ id, name: o.name, home }] : []
  })
}

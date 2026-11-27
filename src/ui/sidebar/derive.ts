// What the column draws, read from the window's state (studio/01 §5.5,
// §6.2, §6.4, §6.24, §6.48; Side.swift `pinned`, `listed`, `loose`).
// Pure functions of the state, so tests and the top strip share them.

import { state } from '../lib/store'
import type { GroupView, PinFolderView, PinView, SpaceView, TabView } from '../../shared/state'

// Settings as the Mac names them, with its defaults (Prefs.swift). The
// settings module owns the keys; these are read here only.
/** The spaces' key: Alt+1-9, or Ctrl+1-9 with Settings › Spaces & Pins ›
 * Ctrl+1 to Ctrl+9 switch spaces (main/tabs/wiring.ts). */
export const spaceKeyMod = (): 'Ctrl' | 'Alt' => (pref('spaces.commandNumbers', false) ? 'Ctrl' : 'Alt')

export const pref = <T,>(key: string, fallback: T): T => {
  const v = state.prefs?.[key]
  return (v === undefined || v === null ? fallback : v) as T
}

export const P = {
  /** Letters or the site's icon (Settings › Appearance › Tabs › Tabs show). */
  icons: () => pref<string>('glyph', 'icons') === 'icons',
  /** The address on the tab you're on (§5.17). */
  address: () => pref('tabs.address', true),
  roomy: () => pref('tabs.roomier', false) || pref('sidebar.roomy', false),
  contrast: () => pref('tabs.highContrast', false),
  dimSleeping: () => pref('tabs.sleep.dim', false),
  reading: () => pref('tabs.reading', false),
  pinRows: () => pref('pins.list', false) && state.sidebar.layout === 'side',
  pinFolders: () => pref('pins.folders', true),
  spaces: () => !!(state.spacesOn ?? pref('spaces', false)),
  spaceButtons: () => P.spaces() && pref('spaces.buttons', false),
  foldButton: () => pref('sidebar.foldButton', false),
  narrowIcons: () => pref('sidebar.narrowIcons', false),
  /** The column of icons: Icons only, or the strip under 200 (§5.4, §5.23). */
  iconColumn: () => state.sidebar.icons || (P.narrowIcons() && pref('sidebar.narrowed', false)),
}

export const rowHeight = () => (P.iconColumn() ? 32 : P.roomy() ? 36 : 28)
export const titleSize = () => (P.roomy() ? 14 : 12.5)
export const markSize = () => (P.roomy() ? 17 : 15)

/** A tab's words (Tab.label, §2.8): the model's label, its title, its site. */
export function label(t: TabView): string {
  return t.name || t.label || t.title || (t.empty ? 'New Tab' : prettyURL(t.url)) || 'New Tab'
}

export function prettyURL(url: string): string {
  try {
    const u = new URL(url)
    if (u.protocol === 'http:' || u.protocol === 'https:') return u.host.replace(/^www\./, '') + (u.pathname === '/' ? '' : u.pathname)
    return url
  } catch { return url }
}

/** The letter standing for a site (Tab.monogram, §2.11). */
export function monogram(t: { url: string; internal?: string; label?: string; title?: string }): string {
  if (t.internal) return ((t.label || t.title || '•')[0] ?? '•').toUpperCase()
  try {
    const u = new URL(t.url)
    if (u.protocol === 'file:') {
      const name = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() ?? '').replace(/^[/.]+|[/.]+$/g, '')
      return name ? name[0].toUpperCase() : '•'
    }
    const host = u.hostname.replace(/^www\./, '')
    return host ? host[0].toUpperCase() : '•'
  } catch { return '•' }
}

/** The site as the tab you're on says it at rest (AtRest.swift, §5.17). */
export interface AtRest { kind: 'secure' | 'notSecure' | 'file' | 'other'; lead: string; name: string; tail: string }

const restCache = new Map<string, AtRest | null>()
export function atRest(url: string, site?: string): AtRest | null {
  if (restCache.has(url)) return restCache.get(url)!
  const made = makeRest(url, site)
  if (restCache.size > 256) restCache.clear()
  restCache.set(url, made)
  return made
}

function makeRest(url: string, site?: string): AtRest | null {
  let u: URL
  try { u = new URL(url) } catch { return null }
  const scheme = u.protocol.slice(0, -1).toLowerCase()
  if (scheme === 'http' || scheme === 'https') {
    const ascii = u.hostname.replace(/^\[|\]$/g, '')
    if (!ascii) return null
    const ip = /^[\d.]+$/.test(ascii) && ascii.split('.').length === 4 || ascii.includes(':')
    const bare = !ip && ascii.startsWith('www.') && ascii.split('.').length > 2 ? ascii.slice(4) : ascii
    // The domain comes from main's Public Suffix List (TabView.site).
    const domain = ip ? bare : (site ?? bare)
    const count = domain.split('.').length
    const labels = bare.split('.')
    let name: string, lead = ''
    if (ip) name = ascii.includes(':') ? `[${ascii}]` : ascii
    else if (labels.length > count) { name = labels.slice(-count).join('.'); lead = labels.slice(0, -count).join('.') + '.' }
    else name = bare
    const tail = u.port ? `:${u.port}` : ''
    const local = ascii === 'localhost' || ascii === '127.0.0.1' || ascii === '::1' || ascii.endsWith('.localhost')
    return { kind: scheme === 'https' || local ? 'secure' : 'notSecure', lead, name, tail }
  }
  if (scheme === 'file') {
    const file = decodeURIComponent(u.pathname.split('/').pop() ?? '')
    return { kind: 'file', lead: '', name: file || 'File', tail: '' }
  }
  if (scheme === 'about' || scheme === 'oriel' || scheme === 'search' || scheme === '') return null
  if (scheme === 'chrome-extension') return { kind: 'other', lead: '', name: 'Extension page', tail: '' }
  return { kind: 'other', lead: '', name: 'Not a website', tail: '' }
}

/** What the tab says at rest: everything with the setting on, only a warning
 * (plain http, a punycode name) with it off. */
export function restOf(t: TabView): AtRest | null {
  if (t.empty || t.internal) return null
  const rest = atRest(t.url, t.site)
  if (!rest) return null
  const warns = rest.kind === 'notSecure' || (rest.kind === 'secure' && (rest.lead + rest.name).split('.').some(p => p.startsWith('xn--')))
  return P.address() || warns ? rest : null
}

// the column's parts

export interface Parts {
  squares: TabView[]
  listed: TabView[]
  groups: { group: GroupView; members: TabView[] }[]
  loose: TabView[]
}

/** The pages of the split `t` is in, in their order (itself alone if none; a pin has none). */
export function splitMates(t: TabView): TabView[] {
  const split = t.pinID ? undefined : state.splits.find(s => s.tabs.includes(t.id))
  if (!split) return [t]
  const pages = split.tabs.map(id => state.tabs.find(x => x.id === id)).filter((x): x is TabView => !!x && !x.pinID)
  return pages.includes(t) ? pages : [t]
}

/** A tab carried to another place, as the column would draw it there. */
export interface Move { tab: string; to: 'squares' | 'listed' | 'loose' | `group:${string}`; index: number }

/** The row cut into the column's blocks: pins as squares, pins as rows,
 * each group's tabs (folded: only the tab in front), the loose tabs. With
 * `move`, as they'd be with one tab carried elsewhere. */
export function parts(move?: Move | null): Parts {
  const tabs = state.tabs
  const rows = P.pinRows()
  const known = new Set(state.groups.map(g => g.id))
  const carried = move ? tabs.find(t => t.id === move.tab) : undefined
  // A split goes as one among the loose tabs and the groups' (Model.moveTab);
  // made a pin, one page leaves it.
  const unit = carried ? (move!.to === 'loose' || move!.to.startsWith('group:') ? splitMates(carried) : [carried]) : []
  const rest = carried ? tabs.filter(t => !unit.includes(t)) : tabs
  const squares = rest.filter(t => t.pinID && !(rows && t.listed))
  const listed = rest.filter(t => t.pinID && rows && t.listed)
  const groups = state.groups.map(group => {
    const all = rest.filter(t => !t.pinID && t.groupID === group.id)
    const members = group.folded ? all.filter(t => t.id === state.activeID) : all
    return { group, members, all }
  })
  const loose = rest.filter(t => !t.pinID && !(t.groupID && known.has(t.groupID)))
  if (move && carried) {
    const put = (list: TabView[]) => list.splice(Math.max(0, Math.min(move.index, list.length)), 0, ...unit)
    if (move.to === 'squares') put(squares)
    else if (move.to === 'listed') put(listed)
    else if (move.to === 'loose') put(loose)
    else { const g = groups.find(x => x.group.id === move.to.slice(6)); if (g) { put(g.all); if (!g.group.folded) put(g.members) } }
  }
  return {
    squares, listed, loose,
    groups: groups.filter(g => g.all.length > 0).map(({ group, members }) => ({ group, members })),
  }
}

export const pinOf = (t: TabView): PinView | undefined => state.pins.find(p => p.tabID === t.id || p.id === t.pinID)

// pin folders (PinTree.lines, PinFolders.swift)

export type Line =
  | { kind: 'folder'; folder: PinFolderView; depth: number }
  | { kind: 'pin'; tab: TabView; depth: number }

/** The pinned rows as drawn with folders: each level's folders, each followed
 * by what it holds unless folded, then that level's pins. The tab in front
 * is drawn even in a folded folder. */
export function folderLines(listed: TabView[], folders: PinFolderView[], showing: string | null): Line[] {
  const live = new Set(folders.filter(f => f.live).map(f => f.id))
  const ids = new Set(folders.filter(f => !f.live).map(f => f.id))
  const home = (t: TabView) => {
    const p = pinOf(t)
    return p && !p.everywhere && p.folder && ids.has(p.folder) ? p.folder : undefined
  }
  const out: Line[] = []
  const walk = (parent: string | undefined, d: number, folded: boolean) => {
    for (const folder of folders.filter(f => (f.parent ?? undefined) === parent)) {
      if (!folded) out.push({ kind: 'folder', folder, depth: d })
      if (live.has(folder.id)) continue
      walk(folder.id, d + 1, folded || !folder.open)
    }
    for (const t of listed) if (home(t) === parent && (!folded || t.id === showing)) out.push({ kind: 'pin', tab: t, depth: d })
  }
  walk(undefined, 0, false)
  return out
}

export const foldersShown = () => P.pinRows() && P.pinFolders() && state.pinFolders.length > 0

/** Folders entries for a "Move to Folder" list: four spaces a level. */
export function folderEntries(folders: PinFolderView[]): { folder: PinFolderView; title: string }[] {
  const out: { folder: PinFolderView; title: string }[] = []
  const walk = (parent: string | undefined, d: number) => {
    for (const f of folders.filter(x => (x.parent ?? undefined) === parent)) {
      if (f.live) continue
      out.push({ folder: f, title: '    '.repeat(d) + f.name })
      walk(f.id, d + 1)
    }
  }
  walk(undefined, 0)
  return out
}

export function folderDepth(id: string): number {
  let d = 1, f = state.pinFolders.find(x => x.id === id)
  const seen = new Set<string>()
  while (f?.parent && !seen.has(f.parent)) { seen.add(f.parent); d++; f = state.pinFolders.find(x => x.id === f!.parent) }
  return d
}

export function folderHeight(id: string): number {
  let best = 1
  const stack: [string, number][] = [[id, 1]]
  while (stack.length) {
    const [cur, lv] = stack.pop()!
    best = Math.max(best, lv)
    for (const c of state.pinFolders) if (c.parent === cur) stack.push([c.id, lv + 1])
  }
  return best
}

export const canMakeIn = (parent?: string) => !parent || (!!state.pinFolders.find(f => f.id === parent && !f.live) && folderDepth(parent) < 3)
export function canMoveFolder(id: string, parent?: string): boolean {
  if (!parent) return true
  const p = state.pinFolders.find(f => f.id === parent)
  if (!p || p.live || parent === id) return false
  let cur: string | undefined = parent
  const seen = new Set<string>()
  while (cur && !seen.has(cur)) { if (cur === id) return false; seen.add(cur); cur = state.pinFolders.find(f => f.id === cur)?.parent }
  return folderDepth(parent) + folderHeight(id) <= 3
}

// spaces (Spaces.swift)

/** sRGB 0-1 of the six space colours; the first is none, never drawn. */
export const spaceColours: [number, number, number][] = [
  [0.45, 0.47, 0.52], [0.26, 0.52, 0.96], [0.20, 0.66, 0.45], [0.96, 0.62, 0.20], [0.90, 0.33, 0.40], [0.62, 0.40, 0.90],
]
export const colourNames = ['None', 'Blue', 'Green', 'Orange', 'Red', 'Violet']

export const spaceIcons = [
  'briefcase', 'building.2', 'desktopcomputer', 'laptopcomputer', 'chevron.left.forwardslash.chevron.right', 'terminal',
  'sparkles', 'brain.head.profile', 'lightbulb', 'gamecontroller', 'beach.umbrella', 'cup.and.saucer',
  'music.note', 'film', 'paintpalette', 'camera', 'house', 'book',
  'graduationcap', 'cart', 'airplane', 'dumbbell', 'leaf', 'heart',
]
export const spaceIconNames = [
  'Work', 'Office', 'Desktop', 'Laptop', 'Code', 'Terminal',
  'AI', 'Thinking', 'Ideas', 'Games', 'Leisure', 'Café',
  'Music', 'Film', 'Art', 'Photos', 'Home', 'Reading',
  'Studies', 'Shopping', 'Travel', 'Sport', 'Nature', 'Personal',
]

const FIRST_SPACE = '00000000-0000-0000-0000-000000000001'
/** A space's symbol: its own, house for the first, briefcase otherwise. */
export const spaceSymbol = (s: SpaceView) =>
  s.icon && spaceIcons.includes(s.icon) ? s.icon : s.id === FIRST_SPACE ? 'house' : 'briefcase'

export const currentSpace = (): SpaceView | undefined => state.spaces.find(s => s.id === state.space)

/** Picked with Ctrl or Shift (§3.18). */
export const picked = (id: string) => (state.picked ?? []).includes(id)
export const pickedAmongOthers = (id: string) => (state.picked ?? []).length > 1 && picked(id)

// a split in the tab list (studio/01 §8.29)

/** Where a tab stands in a split drawn as one object: the pages of a split
 * that lie side by side in the list, first to last. */
export interface PairSlot {
  /** The run's first page: the same for every page of it. */
  key: string
  /** This page's place in the run, and how many pages the run has. */
  index: number
  count: number
  /** One of its pages has the keys: the whole run is lit. */
  live: boolean
}

/** The run of a split `id` stands in within `list` (a block of the list as
 * drawn: the loose tabs, a group's), or null when it stands alone there: not
 * in a split, its partner in another block, folded away, or pinned (a pin
 * leaves its split, but one may be read before the state says so). */
export function pairSlot(list: TabView[], id: string): PairSlot | null {
  if (!state.splits.length) return null
  const split = state.splits.find(s => s.tabs.includes(id))
  if (!split || split.tabs.length < 2) return null
  const at = list.findIndex(t => t.id === id)
  if (at < 0) return null
  const mine = (i: number) => !!list[i] && !list[i].pinID && split.tabs.includes(list[i].id)
  if (!mine(at)) return null
  let from = at, to = at
  while (mine(from - 1)) from--
  while (mine(to + 1)) to++
  if (to === from) return null
  return { key: list[from].id, index: at - from, count: to - from + 1, live: list.slice(from, to + 1).some(t => t.id === state.activeID) }
}

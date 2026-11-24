// The model: spaces, pins, windows and their rows of tabs. It knows nothing of
// views; views (views/) follow it and tell it what pages do. Every change says
// which windows' slices it touched, and those windows send patches.
//
// Mirrors Browser.swift, Pins.swift, Spaces.swift, Session.swift and
// Windows.swift on the Mac (studio/01 §2, §3, §6, §7, §9). Files keep the
// Mac's names and keys (formats.ts).

import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import type { FieldState, GroupView, ID, PinFolderView, PinView, SidebarState, SpaceView, SplitView, TabView } from '../../shared/state'
import { defaults, defaultOf, moduleDefaults, type PrefKey } from '../../shared/prefs'
import { readJSON, writeJSON, writeJSONNow, removeFile, fileExists, toAppleDate, fromAppleDate, onFlush } from './persist'
import {
  firstSpaceID, personalProfileID, sessionFile, decodeShape, encodeShape, emptyShape, freshShape,
  decodePins, encodePins, decodeFolders, encodeFolders, decodeSpaces, encodeSpaces, decodeWindows, encodeWindows,
  decodeProfiles, placementOf, type SessionShape, type SessionEntry, type SessionGroup, type PinDef, type PinFolder,
  type SpaceFile, type WindowFile, type Placement,
} from './formats'
import * as tree from './pintree'

export { firstSpaceID }
export type { Placement }

/** Ids that go into files: capitals, as Foundation's UUID writes them. */
export const newID = () => randomUUID().toUpperCase()

/** A page's history, kept while it sleeps or for ⇧⌘T (Tab.keepsake, §2.43). */
export interface Keepsake { entries: Electron.NavigationEntry[]; index: number }

export interface TabRecord extends TabView {
  /** A pin's own page. */
  home?: string
  touched?: number
  letGo?: number
  /** The window and space whose row holds it. */
  win: ID
  space: ID
  popup?: boolean
  /** Opened by a script (bench): never selected for you, never kept. */
  bench?: boolean
  /** A private tab's store, shared with the links it opens (§2.35). */
  store?: string
  letter?: string
  pinTitle?: string
  everywhere?: boolean
  pinFolder?: ID
  /** Page deaths in the last minute (CrashCount, §2.32). */
  crashes?: number[]
  /** Gave up after crashes: the message waits for Try again. */
  dead?: boolean
  /** Its page died behind: reloaded when you go back to it. */
  stale?: boolean
  /** What was typed in an empty tab and not sent (§2.41). */
  draft?: string
  downloads?: number
}

export interface Ghost {
  id: ID
  url: string
  title: string
  index: number
  groupID?: ID
  partner?: ID
  onLeft: boolean
  was: ID
  batch?: ID
  kind: 'clear' | 'group' | 'tabs'
  front: boolean
  muted: boolean
  at: number
  favicon?: string
}

interface ClosedWindow {
  at: number
  file: WindowFile
  keeps: Map<string, Keepsake[]>
}

/** A Mac test world's prefs, and the tabs module's own defaults (studio/06). */
export const tabDefaults: Record<string, unknown> = {
  spaces: false,
  'spaces.commandNumbers': false,
  'tabs.newPlace': 'next', // next | top | end
  'tabs.frontBeside': false,
  'tabs.lazy': false,
  'tabs.switcherBehindFirst': false,
  'tabs.switcherLeavesOutPins': false,
  'tabs.sleep': true,
  'tabs.sleep.pace': 'normal', // later | normal | sooner
  'pins.home': true,
  'pins.peek': true,
  'pins.list': false,
  'pins.folders': false,
}

const internalTitles: Record<string, string> = {
  settings: 'Settings', history: 'History', downloads: 'Downloads', bookmarks: 'Bookmarks',
  passwords: 'Passwords', archive: 'Archived Tabs', import: 'Bring Things Over', 'release-notes': "What's New",
}

// TODO(brand): brand.scheme from src/shared/brand.ts once merged.
export const internalScheme = 'oriel'

/** oriel://settings/privacy → "settings", or null. A Mac's search:// pages,
 * in files brought over, are the same pages. */
export function internalKind(url: string): string | null {
  const m = /^(?:oriel|search):\/\/([^/?#]+)/i.exec(url)
  return m && internalTitles[m[1].toLowerCase()] ? m[1].toLowerCase() : null
}

/** A page's own address in this app's scheme. */
export function internalURL(url: string): string {
  return url.replace(/^search:\/\//i, `${internalScheme}://`)
}

export function hostOf(url?: string): string {
  try { return url ? new URL(url).hostname.replace(/^www\./, '') : '' } catch { return '' }
}

/** Address.pretty: the host without www., then the path unless it is "/". */
export function pretty(url: string): string {
  try {
    const u = new URL(url)
    if (!u.host) return url
    const bare = u.host.replace(/^www\./, '')
    return u.pathname && u.pathname !== '/' ? bare + u.pathname : bare
  } catch { return url }
}

/** Equal but for trailing slashes (Browser.samePage). */
export function samePage(a?: string, b?: string): boolean {
  if (!a || !b) return false
  const t = (s: string) => s.replace(/\/+$/, '')
  return t(a) === t(b)
}

/** Tab.monogram (§6.1). */
export function monogram(url: string, internal?: string): string {
  if (internal) return (internalTitles[internal] ?? '•').slice(0, 1)
  try {
    const u = new URL(url)
    if (u.protocol === 'file:') {
      const name = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() ?? '').replace(/^[/.]+|[/.]+$/g, '')
      return name ? name[0].toUpperCase() : '•'
    }
    const host = u.hostname.replace('www.', '')
    return host ? host[0].toUpperCase() : '•'
  } catch { return '•' }
}

const kept = (t: TabRecord) => !t.shy && !t.bench && !t.empty && (/^(https?|file):/i.test(t.url) || !!t.internal)

/** One browser window's rows: a row of tabs for each space it has been in. */
export class WindowRecord {
  space: ID = firstSpaceID
  /** Each space's row, in order: pins first, then groups, then loose tabs. */
  tabs: Record<ID, ID[]> = {}
  active: Record<ID, ID | null> = {}
  groupsBy: Record<ID, GroupView[]> = {}
  splitsBy: Record<ID, SplitView[]> = {}
  /** Rows brought up this run; the rest are still only in the files. */
  loaded = new Set<ID>()
  /** A window after the first keeps its rows in windows.json (§9.11). */
  saved: Record<ID, SessionShape> = {}
  sidebar: SidebarState
  field: FieldState = { open: false, target: 'new', text: '', suggestions: [], selected: 0, refused: 0 }
  shy: boolean
  /** Where it is and in what state, as windows.json keeps it (§1.2, §1.4):
   * from the file at first, then whatever the window last said. */
  place: Placement = {}
  /** Tabs closed here, for ⇧⌘T: twelve steps (§9.15). */
  ghosts: Ghost[] = []
  closedGroups = new Map<ID, { group: GroupView; at: number }>()
  /** Tabs left, latest first; with the links opened behind (TabSwitcher). */
  recent: ID[] = []
  used: ID[] = []
  linkRun: { opener: ID; last: ID; opened: Set<ID> } | null = null
  picked: ID[] = []
  anchor: ID | null = null
  batching: { id: ID; kind: Ghost['kind'] } | null = null
  lastClear: { batch: ID; blank: ID | null } | null = null
  switcher: { cards: ID[]; index: number } | null = null
  dirty = new Set<ID>()
  sessionTimer: NodeJS.Timeout | null = null

  constructor(readonly id: ID, shy: boolean, sidebar: SidebarState) {
    this.shy = shy
    this.sidebar = sidebar
  }

  get groups(): GroupView[] { return (this.groupsBy[this.space] ??= []) }
  set groups(v: GroupView[]) { this.groupsBy[this.space] = v }
  get splits(): SplitView[] { return (this.splitsBy[this.space] ??= []) }
  set splits(v: SplitView[]) { this.splitsBy[this.space] = v }
}

export type Slice = 'tabs' | 'pins' | 'spaces' | 'space' | 'activeID' | 'sidebar' | 'field' | 'groups' | 'splits'
  | 'prefs' | 'pinFolders' | 'picked' | 'reopen' | 'switcher' | 'spacesOn'

export type SpaceRecord = SpaceView & { downloads?: string }

class Model extends EventEmitter {
  tabs = new Map<ID, TabRecord>()
  windows = new Map<ID, WindowRecord>()
  /** Personal's spaces, in their order. */
  spaces: SpaceRecord[] = []
  /** Other profiles' spaces, kept as the file has them. */
  private foreignSpaces: SpaceFile[] = []
  prefs: Record<string, unknown> = {}
  /** Each space's own pins, and the ones every space shows (pins.json). */
  pinsBySpace = new Map<ID, PinDef[]>()
  sharedPins: PinDef[] = []
  private otherShared = new Map<ID, PinDef[]>()
  folders = new Map<ID, PinFolder[]>()
  /** Histories held for tabs whose page is gone (asleep, or brought back). */
  keeps = new Map<ID, Keepsake>()
  closedWindows: ClosedWindow[] = []
  private pendingWindows: WindowFile[] = []
  private reopening: ClosedWindow | null = null
  private restoredOnce = false
  quitting = false
  /** A page view is being made: selections asked meanwhile are ignored. */
  making = 0
  homeSpace: ID = firstSpaceID
  /** The window in front, for pages that come from outside (§1.5). */
  front: ID | null = null

  /** Set by the views: what they alone know. */
  hooks = {
    /** A tab's history now, if its page is up and not still arriving. */
    keepsake: (_id: ID): Keepsake | undefined => undefined,
    /** Whether its page is in memory. */
    live: (_id: ID): boolean => false,
    /** Where a window is now (its frame, state and monitor); null when it
     * can't say (gone, minimized): the last it said is kept. */
    frame: (_win: ID): Placement | null => null,
  }

  // MARK: load

  load(): void {
    this.prefs = { ...defaults, ...tabDefaults, ...moduleDefaults, ...readJSON<Record<string, unknown>>('prefs.json', {}) }
    this.readSpaces()
    this.readPins()
    this.folders = readJSON('pin-folders.json', new Map<string, PinFolder[]>(), decodeFolders)
    this.pendingWindows = readJSON<WindowFile[]>('windows.json', [], raw => decodeWindows(raw))
    if (this.pref<boolean>('start.fresh')) this.startFresh()
    onFlush(final => (final ? this.flush() : this.saveAll()))
  }

  pref<T = unknown>(key: PrefKey): T {
    return (this.prefs[key] ?? tabDefaults[key] ?? defaultOf(key)) as T
  }

  /** A key's default: the tabs module's own, a module's, or Prefs.swift's. */
  private defaultFor(key: string): unknown {
    return key in tabDefaults ? tabDefaults[key] : defaultOf(key)
  }

  /** undefined takes the key away; a value equal to its default never
   * reaches the file either (prefsFile, studio/06 §1.17). */
  setPref(key: string, value: unknown): void {
    const was = this.prefs[key]
    this.prefs[key] = value
    this.savePrefs()
    this.touchAll(['prefs'])
    if (key === 'spaces' && !!was !== !!value) this.spacesToggled()
    if ((key === 'pins.folders' || key === 'pins.list') && was !== value) for (const s of this.spaces) this.reconcileAll(s.id)
  }

  spacesOn(): boolean { return this.pref<boolean>('spaces') === true }

  /** prefs.json holds only what differs from its default, as Prefs.swift
   * writes it (studio/06 §1.17): a default changed later reaches whoever
   * never touched the row. Keys it doesn't know (a Mac's) stay as read. */
  prefsFile(): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(this.prefs)) {
      if (value === undefined) continue
      const fallback = this.defaultFor(key)
      if (fallback !== undefined && JSON.stringify(value) === JSON.stringify(fallback)) continue
      out[key] = value
    }
    return out
  }

  private savePrefs(): void { writeJSON('prefs.json', () => this.prefsFile()) }

  // MARK: spaces.json (§7.2, §7.3)

  private readSpaces(): void {
    const profiles = readJSON('profiles.json', [], raw => decodeProfiles(raw))
    const personal = profiles.find(p => p.id === personalProfileID)
    this.homeSpace = personal?.home ?? firstSpaceID
    const saved = readJSON<SpaceFile[]>('spaces.json', [], decodeSpaces)
    let foundFirst = false
    const all = saved.filter(s => {
      if (s.id !== firstSpaceID) return true
      if (foundFirst) return false
      foundFirst = true
      delete s.profile
      return true
    })
    this.foreignSpaces = all.filter(s => s.profile && s.profile !== personalProfileID)
    let mine = all.filter(s => !s.profile || s.profile === personalProfileID)
    if (!mine.some(s => s.id === firstSpaceID) && (this.homeSpace === firstSpaceID || !mine.some(s => s.id === this.homeSpace))) {
      mine = [{ id: firstSpaceID, name: 'Personal', colour: 0 }, ...mine]
    }
    if (!mine.some(s => s.id === this.homeSpace)) this.homeSpace = mine[0].id
    // Home first, unless the order was kept (a move marks it).
    const orderKept = this.pref<boolean>('spaces.orderKept') || mine[0]?.id !== this.homeSpace
    if (!orderKept) mine = [...mine.filter(s => s.id === this.homeSpace), ...mine.filter(s => s.id !== this.homeSpace)]
    this.spaces = mine.map(s => ({ ...s }))
  }

  saveSpaces(): void {
    const mine: SpaceFile[] = this.spaces.map(s => {
      const { id, name, colour, icon, sharesSignIns, downloads, gradient, strength } = s
      return { id, name, colour, icon, sharesSignIns, downloads, gradient, strength } as SpaceFile
    })
    writeJSONNow('spaces.json', encodeSpaces([...this.foreignSpaces, ...mine]))
    this.touchAll(['spaces'])
  }

  private writeHome(): void {
    const profiles = readJSON('profiles.json', [], raw => decodeProfiles(raw))
    const at = profiles.findIndex(p => p.id === personalProfileID)
    if (at >= 0) profiles[at].home = this.homeSpace
    else profiles.unshift({ id: personalProfileID, name: 'Personal', home: this.homeSpace })
    writeJSONNow('profiles.json', profiles)
  }

  spaceOf(id: ID): SpaceRecord | undefined { return this.spaces.find(s => s.id === id) }

  /** Whose cookies a space uses: the profile's for the home and for one
   * signed in with it; its own otherwise (Spaces.ownsStore, §7.26). */
  ownsStore(space: ID): boolean {
    const s = this.spaceOf(space)
    if (!s || space === firstSpaceID || space === this.homeSpace) return false
    return s.sharesSignIns !== true
  }

  /** The space a window shows: its own with spaces on, the home otherwise. */
  shownSpace(win: WindowRecord): ID {
    return this.spacesOn() && this.spaceOf(win.space) ? win.space : this.homeSpace
  }

  // MARK: pins.json, pin-folders.json (§6.51)

  private readPins(): void {
    const file = readJSON('pins.json', null, decodePins)
    if (file) {
      this.pinsBySpace = file.bySpace
      this.sharedPins = file.shared
      this.otherShared = file.others
      return
    }
    // Before there is a pins.json: the pins of the session files.
    for (const space of this.spaces) {
      const shape = this.readShape(space.id)
      const defs = shape.tabs.flatMap(e => (e.pin === undefined ? [] : [{
        id: e.pinID ?? newID(), letter: e.pin, home: e.home ?? e.url, title: e.title, ...(e.name ? { name: e.name } : {}),
        ...(e.listed ? { listed: true } : {}),
      } as PinDef]))
      if (defs.length) this.pinsBySpace.set(space.id, defs)
    }
    if (this.pinsBySpace.size) this.savePins()
  }

  savePins(): void {
    writeJSONNow('pins.json', encodePins({ bySpace: this.pinsBySpace, shared: this.sharedPins, others: this.otherShared }))
  }

  saveFolders(): void {
    for (const [space, list] of this.folders) this.folders.set(space, tree.sanitized(list))
    writeJSONNow('pin-folders.json', encodeFolders(this.folders))
    this.touchAll(['pinFolders'])
  }

  /** The bench's view: every pin with its space. */
  get pins(): (PinDef & { space: ID; everywhere?: boolean })[] {
    return [
      ...this.sharedPins.map(p => ({ ...p, space: 'shared', everywhere: true })),
      ...[...this.pinsBySpace].flatMap(([space, defs]) => defs.map(p => ({ ...p, space }))),
    ]
  }

  /** What a space's row holds: the shared pins, then its own (Pins.row). */
  pinRow(space: ID): PinDef[] {
    const own = this.pinsBySpace.get(space) ?? []
    if (!this.spacesOn()) return own
    const ids = new Set(this.sharedPins.map(p => p.id))
    return [...this.sharedPins, ...own.filter(p => !ids.has(p.id))]
  }

  findPin(id: ID): { def: PinDef; space: ID | 'shared' } | null {
    const s = this.sharedPins.find(p => p.id === id)
    if (s) return { def: s, space: 'shared' }
    for (const [space, defs] of this.pinsBySpace) { const d = defs.find(p => p.id === id); if (d) return { def: d, space } }
    return null
  }

  private setOwnPins(space: ID, defs: PinDef[]): void {
    if (defs.length) this.pinsBySpace.set(space, defs); else this.pinsBySpace.delete(space)
  }

  // MARK: windows

  /** The oldest window still open: the one whose rows are the session files. */
  primary(): WindowRecord | null {
    for (const w of this.windows.values()) if (!w.shy) return w
    return null
  }

  newWindow(options: { shy?: boolean; restore?: boolean } = {}): WindowRecord {
    const sidebar: SidebarState = {
      layout: this.pref<string>('tabs.layout') === 'top' ? 'top' : 'side',
      width: this.pref<number>('sidebar.width'),
      folded: false,
      side: this.pref<string>('sidebar.side') === 'right' ? 'right' : 'left',
      icons: false,
    }
    const shy = !!options.shy
    let from: WindowFile | null = null
    let keeps: Map<string, Keepsake[]> | null = null
    const firstOfRun = !shy && !this.restoredOnce && !this.primary()
    if (!shy && this.reopening) {
      from = this.reopening.file
      keeps = this.reopening.keeps
      this.reopening = null
    } else if (!shy && !firstOfRun && options.restore && this.pendingWindows.length) {
      from = this.pendingWindows.shift()!
    }
    const win = new WindowRecord(from?.id && !this.windows.has(from.id) ? from.id : newID(), shy, sidebar)
    const frontWin = this.front ? this.windows.get(this.front) : null
    win.space = from?.space ?? (frontWin && !frontWin.shy ? frontWin.space : this.homeSpace)
    if (!this.spaceOf(win.space)) win.space = this.homeSpace
    if (from) {
      win.place = placementOf(from)
      if (from.folded) win.sidebar.folded = true
    }
    this.windows.set(win.id, win)
    if (firstOfRun) {
      // The first window of a run is the oldest: its rows are the session
      // files, always read (trimmed first by Start with a fresh window).
      this.restoredOnce = true
      // Its line in windows.json holds its frame and space.
      const mine = this.pendingWindows.shift()
      if (mine) { win.place = placementOf(mine); win.space = this.spaceOf(mine.space) ? mine.space : win.space; if (mine.folded) win.sidebar.folded = true }
      // Not asked to restore: last time's other windows don't come back.
      if (!options.restore && !this.pref<boolean>('start.fresh')) this.pendingWindows = []
    } else if (from) {
      win.saved = from.rows
    } else {
      // A new window starts every space empty.
      win.loaded = new Set(this.spaces.map(s => s.id))
    }
    if (shy) win.loaded = new Set(this.spaces.map(s => s.id))
    const shown = this.shownSpace(win)
    win.space = shown
    this.loadRow(win, shown, keeps)
    if (!this.spaceTabs(win).length || !win.active[shown]) this.frontBlank(win, shown)
    this.emit('window-opened', win.id)
    if (firstOfRun && this.pendingWindows.length) setImmediate(() => this.emit('restore-windows', this.pendingWindows.length))
    this.saveWindowsSoon()
    return win
  }

  /** The window's frame changed: windows.json a moment from now. */
  windowMoved(_id: ID): void { this.saveWindowsSoon() }

  /** Where a window is: what it says now, else the last it said. */
  placeOf(win: WindowRecord): Placement {
    const now = this.hooks.frame(win.id)
    if (now) win.place = now
    return win.place
  }

  removeWindow(id: ID): void {
    const win = this.windows.get(id)
    if (!win) return
    if (!this.quitting && !win.shy) {
      const others = [...this.windows.values()].filter(w => w !== win && !w.shy)
      const wasPrimary = this.primary() === win
      if (!others.length) {
        // The last window: its rows are next launch's, written now.
        this.writeAllRows(win, true)
        this.writeWindows(true, [win])
      } else {
        this.rememberWindow(win)
        if (win.sessionTimer) clearTimeout(win.sessionTimer)
        this.windows.delete(id)
        if (wasPrimary) this.takeFiles(others[0])
        this.writeWindows(true)
      }
    }
    if (win.sessionTimer) clearTimeout(win.sessionTimer)
    for (const ids of Object.values(win.tabs)) for (const t of ids) this.dropTab(t)
    this.windows.delete(id)
    if (this.front === id) this.front = this.primary()?.id ?? null
  }

  /** The oldest window closed: the next one's rows become the session files,
   * an empty row where it has none (becomePrimary, takeFiles). */
  private takeFiles(win: WindowRecord): void {
    for (const s of this.spaces) {
      const shape = win.loaded.has(s.id) ? this.shapeOf(win, s.id) : win.saved[s.id] ?? emptyShape()
      writeJSONNow(sessionFile(s.id), encodeShape(shape))
      win.loaded.add(s.id)
    }
    win.saved = {}
  }

  private rememberWindow(win: WindowRecord): void {
    const keeps = new Map<string, Keepsake[]>()
    const rows: Record<string, SessionShape> = {}
    for (const s of this.spaces) {
      if (win.loaded.has(s.id)) {
        const list: Keepsake[] = []
        rows[s.id] = this.shapeOf(win, s.id, list)
        keeps.set(s.id, list)
      } else if (win.saved[s.id]) rows[s.id] = win.saved[s.id]
    }
    const file: WindowFile = { id: win.id, space: win.space, rows, folded: win.sidebar.folded || undefined, ...this.placeOf(win) }
    this.closedWindows.push({ at: Date.now(), file, keeps })
    if (this.closedWindows.length > 10) this.closedWindows.shift()
  }

  /** ⇧⌘T after a window closed: the window, with its tabs (§9.18). */
  reopenWindow(): boolean {
    const last = this.closedWindows.pop()
    if (!last) return false
    this.reopening = last
    this.emit('open-window')
    return true
  }

  /** Windows brought back at launch, after the first (restoreOnce). */
  pendingWindowCount(): number { return this.pendingWindows.length }

  windowOf(tabID: ID): WindowRecord | null {
    const t = this.tabs.get(tabID)
    return t ? this.windows.get(t.win) ?? null : null
  }

  spaceTabs(win: WindowRecord, space = win.space): ID[] {
    return (win.tabs[space] ??= [])
  }

  activeTab(win: WindowRecord): TabRecord | null {
    const id = win.active[win.space]
    return id ? this.tabs.get(id) ?? null : null
  }

  spaceOfTab(_win: WindowRecord, id: ID): ID {
    return this.tabs.get(id)?.space ?? _win.space
  }

  /** On screen: the tab in front of its window's space on screen. */
  onScreen(id: ID): boolean {
    const t = this.tabs.get(id)
    const win = t && this.windows.get(t.win)
    if (!t || !win || win.space !== t.space) return false
    if (win.active[win.space] === id) return true
    return win.splits.some(s => s.tabs.includes(id) && s.tabs.includes(win.active[win.space] ?? ''))
  }

  // MARK: rows from the files (§9.8, §9.9)

  private readShape(space: ID): SessionShape {
    return readJSON(sessionFile(space), emptyShape(), decodeShape)
  }

  /** A row brought up: from the session files for the oldest window, from
   * its record otherwise; then the pins as pins.json has them. */
  loadRow(win: WindowRecord, space: ID, keeps: Map<string, Keepsake[]> | null = null): void {
    if (!win.loaded.has(space)) {
      win.loaded.add(space)
      const shape = this.primary() === win ? this.readShape(space) : win.saved[space] ?? emptyShape()
      delete win.saved[space]
      this.restoreShape(win, space, shape, keeps?.get(space))
    }
    this.reconcile(win, space)
  }

  private restoreShape(win: WindowRecord, space: ID, shape: SessionShape, keeps?: Keepsake[]): void {
    const now = Date.now()
    const goHome = this.pref<boolean>('pins.home')
    const groups = (shape.groups ?? []).filter(g => shape.tabs.some(t => t.groupID === g.id))
    const ids: ID[] = []
    shape.tabs.forEach((e, i) => {
      const internal = internalKind(e.url) ?? undefined
      const pin = e.pin !== undefined
      const home = pin ? e.home ?? e.url : undefined
      const atHome = pin && goHome && home && !samePage(home, e.url)
      const tab = this.makeTab(win, space, {
        url: atHome ? home! : internal ? internalURL(e.url) : e.url,
        title: atHome ? '' : internal ? internalTitles[internal] : e.title,
        name: e.name || undefined,
        muted: e.muted,
        asleep: !internal,
        empty: false,
        internal,
        pinID: pin ? e.pinID ?? undefined : undefined,
        letter: e.pin,
        home,
        listed: pin && e.listed ? true : undefined,
        groupID: !pin && e.groupID && groups.some(g => g.id === e.groupID) ? e.groupID : undefined,
        touched: e.touched !== undefined ? Math.min(fromAppleDate(e.touched), now) : undefined,
        letGo: !pin && e.letGo !== undefined ? Math.min(fromAppleDate(e.letGo), now) : undefined,
      })
      const keep = keeps?.[i]
      if (keep) this.keeps.set(tab.id, keep)
      ids.push(tab.id)
    })
    win.tabs[space] = ids
    win.groupsBy[space] = groups.map(g => ({ id: g.id, name: g.name, colour: g.colour ?? 0, folded: g.collapsed }))
    const taken = new Set<number>()
    win.splitsBy[space] = shape.splits.flatMap(p => {
      if (p.tabs.length < 2 || p.tabs.length > 4 || p.tabs.some(i => !ids[i] || taken.has(i))) return []
      p.tabs.forEach(i => taken.add(i))
      return [{ tabs: p.tabs.map(i => ids[i]), axis: p.axis, sizes: p.sizes, focused: p.focused === undefined ? undefined : ids[p.focused] }]
    })
    let active: ID | null = null
    if (shape.active >= 0 && ids.length) {
      active = ids[shape.active] ?? ids.find(id => !this.tabs.get(id)?.pinID) ?? ids[0]
    }
    win.active[space] = active
  }

  /** A window or space with nothing in front: an empty tab beside the pins. */
  private frontBlank(win: WindowRecord, space: ID): void {
    const row = this.spaceTabs(win, space)
    const blank = [...row].reverse().map(id => this.tabs.get(id)!).find(t => t?.empty && !t.shy && !this.groupOf(win, t, space))
    if (blank) { win.active[space] = blank.id; return }
    const tab = this.makeTab(win, space, { empty: true })
    row.splice(this.placeForFront(win, space), 0, tab.id)
    win.active[space] = tab.id
  }

  private startFresh(): void {
    for (const s of this.spaces) {
      if (!fileExists(sessionFile(s.id))) continue
      const shape = this.readShape(s.id)
      const left = freshShape(shape)
      if (left.tabs.length !== shape.tabs.length || shape.active >= 0) writeJSONNow(sessionFile(s.id), encodeShape(left))
    }
    if (this.pendingWindows.length > 1) {
      this.pendingWindows = this.pendingWindows.slice(0, 1)
      writeJSONNow('windows.json', encodeWindows(this.pendingWindows))
    }
  }

  // MARK: tabs

  private makeTab(win: WindowRecord, space: ID, init: Partial<TabRecord>): TabRecord {
    const tab: TabRecord = {
      id: randomUUID(),
      url: '',
      title: '',
      loading: false,
      audible: false,
      muted: false,
      asleep: false,
      empty: !init.url,
      canGoBack: false,
      canGoForward: false,
      ...stripUndefined(init),
      win: win.id,
      space,
    }
    if (win.shy) tab.shy = true
    this.tabs.set(tab.id, tab)
    return tab
  }

  /** Gone from the model, its page with it; no ⇧⌘T. */
  private dropTab(id: ID): void {
    if (!this.tabs.has(id)) return
    this.tabs.delete(id)
    this.keeps.delete(id)
    this.emit('tab-closed', id)
  }

  private removeFromRow(win: WindowRecord, id: ID): number {
    const t = this.tabs.get(id)
    const space = t?.space ?? win.space
    const row = this.spaceTabs(win, space)
    const index = row.indexOf(id)
    if (index >= 0) row.splice(index, 1)
    this.leaveSplit(win, space, id)
    win.picked = win.picked.filter(x => x !== id)
    return index
  }

  label(t: TabRecord): string {
    if (t.name) return t.name
    if (t.internal) return internalTitles[t.internal] ?? t.title
    if (t.pinID && t.asleep && t.pinTitle && samePage(t.url, t.home)) return t.pinTitle
    if (t.popup) { const h = hostOf(t.url); if (h) return h }
    if (t.title) return t.title
    if (t.url) return pretty(t.url)
    return 'New Tab'
  }

  /** The row as the interface draws it. */
  tabViews(win: WindowRecord): TabView[] {
    return this.spaceTabs(win).flatMap(id => {
      const t = this.tabs.get(id)
      if (!t) return []
      const view: TabView = {
        id: t.id, url: t.url, title: t.title, label: this.label(t), loading: t.loading, audible: t.audible, muted: t.muted,
        asleep: t.asleep, empty: t.empty, canGoBack: t.canGoBack, canGoForward: t.canGoForward,
      }
      for (const k of ['name', 'favicon', 'crashed', 'error', 'pinID', 'listed', 'groupID', 'shy', 'internal', 'capturing', 'resting', 'opener', 'awake'] as const) {
        if (t[k] !== undefined && t[k] !== false) (view as any)[k] = t[k]
      }
      return [view]
    })
  }

  /** Runtime news from a page (views/tabs.ts). */
  updateTab(id: ID, patch: Partial<TabRecord>): void {
    const tab = this.tabs.get(id)
    if (!tab) return
    let changed = false
    for (const [k, v] of Object.entries(patch)) {
      if ((tab as any)[k] !== v) {
        if (v === undefined) delete (tab as any)[k]; else (tab as any)[k] = v
        changed = true
      }
    }
    if (!changed) return
    const win = this.windows.get(tab.win)
    if (win) {
      this.touch(win, ['tabs'])
      // An address or a mute changed saves the row; a title doesn't (§9.6).
      if ('url' in patch || 'muted' in patch || 'name' in patch) this.sessionSoon(win, tab.space)
      if (tab.pinID && ('title' in patch || 'url' in patch || 'asleep' in patch)) this.settlePinTitle(tab)
      if ('favicon' in patch && tab.pinID) this.touch(win, ['pins'])
    }
    this.emit('tab-changed', tab, patch)
  }

  // MARK: places (Browser.placeFor*, §3.2, §3.31)

  pinnedCount(win: WindowRecord, space = win.space): number {
    return this.spaceTabs(win, space).filter(id => this.tabs.get(id)?.pinID).length
  }

  private newPlace(): 'next' | 'top' | 'end' {
    const p = this.pref<string>('tabs.newPlace')
    return p === 'top' || p === 'end' ? p : 'next'
  }

  private afterSplit(win: WindowRecord, space: ID, index: number): number {
    const row = this.spaceTabs(win, space)
    const split = win.splitsBy[space]?.find(s => s.tabs.includes(row[index]))
    if (!split) return index
    return Math.max(index, ...split.tabs.map(id => row.indexOf(id)))
  }

  placeForNew(win: WindowRecord, space = win.space): number {
    const row = this.spaceTabs(win, space)
    const place = this.newPlace()
    if (place === 'top') return this.pinnedCount(win, space)
    if (place === 'end') return row.length
    const here = row.indexOf(win.active[space] ?? '')
    if (here < 0) return row.length
    return Math.max(this.afterSplit(win, space, here) + 1, this.pinnedCount(win, space))
  }

  placeForFront(win: WindowRecord, space = win.space): number {
    return this.newPlace() === 'top' ? this.pinnedCount(win, space) : this.spaceTabs(win, space).length
  }

  private frontLinksBeside(): boolean {
    return this.pref<boolean>('tabs.frontBeside') && this.newPlace() === 'next'
  }

  placeForLink(win: WindowRecord, sourceID: ID | undefined, space = win.space): number {
    const row = this.spaceTabs(win, space)
    const source = this.tabs.get(sourceID ?? '') && row.includes(sourceID!) ? sourceID! : win.active[space]
    const here = source ? row.indexOf(source) : -1
    if (here < 0) return this.placeForNew(win, space)
    let anchor = here
    const run = win.linkRun
    if (run && run.opener === source) {
      const last = this.frontLinksBeside()
        ? Math.max(-1, ...row.map((id, i) => (run.opened.has(id) ? i : -1)))
        : row.indexOf(run.last)
      if (last > here && this.tabs.get(row[last])?.groupID === this.tabs.get(source)?.groupID) anchor = last
    }
    return Math.max(this.afterSplit(win, space, anchor) + 1, this.pinnedCount(win, space))
  }

  private noteLink(win: WindowRecord, id: ID, source?: ID): void {
    win.used = [id, ...win.used.filter(x => x !== id)]
    if (!source || !this.spaceTabs(win).includes(source)) return
    const earlier = win.linkRun?.opener === source ? win.linkRun.opened : new Set<ID>()
    win.linkRun = { opener: source, last: id, opened: new Set([...earlier, id]) }
  }

  /** Never inside a split: after its last page. */
  private safeIndex(win: WindowRecord, space: ID, proposed: number): number {
    const row = this.spaceTabs(win, space)
    const index = Math.min(Math.max(0, proposed), row.length)
    if (index >= row.length) return index
    const split = win.splitsBy[space]?.find(s => s.tabs.includes(row[index]))
    if (!split || split.tabs[0] === row[index]) return index
    return Math.max(...split.tabs.map(id => row.indexOf(id))) + 1
  }

  // MARK: selecting (§3.9)

  selectTab(win: WindowRecord, id: ID, options: { unfoldGroup?: boolean } = {}): void {
    // A page being made is never thereby gone to (the extensions' tab store
    // calls its new tabs active).
    if (this.making) return
    const tab = this.tabs.get(id)
    if (!tab || tab.win !== win.id) return
    if (tab.space !== win.space) this.switchSpace(win, tab.space)
    if (tab.space !== win.space) return
    const space = win.space
    if (options.unfoldGroup !== false && tab.groupID) {
      const g = win.groups.find(x => x.id === tab.groupID)
      if (g?.folded) { g.folded = false; this.touch(win, ['groups']); this.sessionNow(win, space) }
    }
    const prior = win.active[space]
    if (prior === id) return
    const now = Date.now()
    const left = prior ? this.tabs.get(prior) : undefined
    if (left) {
      if (left.empty) left.draft = win.field.text
      left.touched = now
      win.recent = [left.id, ...win.recent.filter(x => x !== left.id && this.tabs.has(x))]
      win.used = [left.id, ...win.used.filter(x => x !== left.id && this.tabs.has(x))]
    }
    // The run of links ends on another tab, unless it is one of the run with
    // links opened in front beside their page (§3.31).
    const run = win.linkRun
    if (run && !(this.frontLinksBeside() && (id === run.opener || run.opened.has(id)) && (prior === run.opener || run.opened.has(prior ?? '')))) win.linkRun = null
    win.picked = []
    win.active[space] = id
    tab.touched = now
    if (tab.stale) this.emit('tab-revive', id)
    this.touch(win, ['activeID', 'tabs', 'picked'])
    this.sessionSoon(win, space)
    this.emit('selected', win, id)
  }

  /** The tab left last that is still in the row, other than `id`. */
  tabBefore(win: WindowRecord, id: ID): ID | null {
    const row = new Set(this.spaceTabs(win))
    return win.recent.find(x => x !== id && row.has(x)) ?? null
  }

  // MARK: opening (§3.1, §3.7, §3.39)

  /** ⌘T (Browser.newTab): an empty tab reused, or made at the front place. */
  newTab(win: WindowRecord): TabRecord {
    const active = this.activeTab(win)
    if (active?.shy && !win.shy) return this.newShyTab(win)
    const space = win.space
    const row = this.spaceTabs(win, space)
    const blank = [...row].reverse().map(id => this.tabs.get(id)!)
      .find(t => t && t.empty && !t.bench && !t.shy && !this.inSplit(win, t.id) && !this.groupOf(win, t))
    if (blank) {
      const from = row.indexOf(blank.id)
      const to = this.placeForFront(win, space)
      row.splice(from, 1)
      row.splice(from < to ? to - 1 : to, 0, blank.id)
      blank.draft = ''
      this.selectTab(win, blank.id)
      this.touch(win, ['tabs'])
      return blank
    }
    const tab = this.makeTab(win, space, { empty: true })
    row.splice(this.placeForFront(win, space), 0, tab.id)
    this.selectTab(win, tab.id)
    this.touch(win, ['tabs', 'activeID'])
    return tab
  }

  /** ⇧⌘N (Browser.newShyTab): never two empty private tabs. */
  newShyTab(win: WindowRecord): TabRecord {
    const space = win.space
    const row = this.spaceTabs(win, space)
    const blank = [...row].reverse().map(id => this.tabs.get(id)!).find(t => t?.empty && t.shy && !this.inSplit(win, t.id))
    if (blank) {
      const from = row.indexOf(blank.id)
      const to = this.placeForFront(win, space)
      row.splice(from, 1)
      row.splice(from < to ? to - 1 : to, 0, blank.id)
      this.selectTab(win, blank.id)
      this.touch(win, ['tabs'])
      return blank
    }
    const tab = this.makeTab(win, space, { empty: true, shy: true, store: newID() })
    row.splice(this.placeForFront(win, space), 0, tab.id)
    this.selectTab(win, tab.id)
    this.touch(win, ['tabs', 'activeID'])
    return tab
  }

  /** Browser.open: a page in a new tab, placed by how it came (§3.39). */
  open(win: WindowRecord, url: string, o: { foreground?: boolean; atEnd?: boolean; from?: ID; mayWait?: boolean; link?: boolean; loose?: boolean; opener?: ID; popup?: boolean; title?: string } = {}): TabRecord {
    const internal = internalKind(url)
    if (internal) return this.showInternal(win, url, internal)
    const space = win.space
    const source = o.from ? this.tabs.get(o.from) : undefined
    const shy = !!source?.shy || win.shy
    const tab = this.makeTab(win, space, {
      url, title: o.title ?? '', empty: false, shy: shy || undefined, store: shy ? source?.store ?? (win.shy ? undefined : newID()) : undefined,
      opener: o.opener, popup: o.popup || undefined,
    })
    const groups = win.groupsBy[space] ?? []
    if (!o.loose && !shy && source?.groupID && groups.some(g => g.id === source.groupID)) tab.groupID = source.groupID
    const apart = o.loose && !!source && !!this.groupOf(win, source)
    const row = this.spaceTabs(win, space)
    const at = o.atEnd ? row.length : o.link ? this.placeForLink(win, o.from, space) : apart ? this.placeForFront(win, space) : this.placeForNew(win, space)
    row.splice(at, 0, tab.id)
    if (o.link && !o.atEnd && (!o.foreground || this.frontLinksBeside())) this.noteLink(win, tab.id, o.from)
    this.arrangeGroups(win, space)
    if (o.mayWait && !o.foreground && this.pref<boolean>('tabs.lazy')) {
      tab.asleep = true
    } else {
      this.emit('tab-go', tab.id, url)
    }
    if (o.foreground) this.selectTab(win, tab.id)
    this.touch(win, ['tabs', 'activeID'])
    this.sessionSoon(win, space)
    return tab
  }

  /** A page that opened a new one: target=_blank, window.open, or a link
   * clicked with a modifier (§3.30-§3.32). */
  openFromPage(win: WindowRecord, opener: ID, url: string, disposition: string): TabRecord {
    const source = this.tabs.get(opener)
    const behind = disposition === 'background-tab'
    if (behind) return this.open(win, url, { foreground: false, from: opener, link: true, mayWait: true })
    const beside = this.frontLinksBeside()
    const tab = this.open(win, url, { foreground: false, from: opener, link: beside, opener, popup: disposition === 'new-window' })
    // In front, a link joins the group of its page, which opens.
    if (!beside) {
      const row = this.spaceTabs(win, tab.space)
      row.splice(row.indexOf(tab.id), 1)
      const g = tab.groupID
      row.splice(g ? this.endOfGroup(win, tab.space, g) : this.placeForFront(win, tab.space), 0, tab.id)
      const group = g ? (win.groupsBy[tab.space] ?? []).find(x => x.id === g) : undefined
      if (group) group.folded = false
    }
    void source
    this.selectTab(win, tab.id)
    this.touch(win, ['tabs', 'groups'])
    return tab
  }

  /** One of Search's own pages: one tab of each kind (show, §2.10). */
  showInternal(win: WindowRecord, address: string, kind: string): TabRecord {
    const url = internalURL(address)
    const space = win.space
    const row = this.spaceTabs(win, space)
    const existing = row.map(id => this.tabs.get(id)!).find(t => t?.internal === kind)
    if (existing) {
      if (existing.url !== url) this.updateTab(existing.id, { url })
      this.selectTab(win, existing.id)
      return existing
    }
    const active = this.activeTab(win)
    // An empty tab with nothing typed takes it (§3.3).
    if (active?.empty && !active.shy && !active.pinID && !win.field.text) {
      this.updateTab(active.id, { url, title: internalTitles[kind], internal: kind, empty: false })
      this.sessionSoon(win, space)
      return active
    }
    const tab = this.makeTab(win, space, { url, title: internalTitles[kind], internal: kind, empty: false })
    row.splice(this.placeForNew(win, space), 0, tab.id)
    this.selectTab(win, tab.id)
    this.touch(win, ['tabs'])
    this.sessionSoon(win, space)
    return tab
  }

  /** The skeleton's way in (field, extensions): a record at the new tab's
   * place, its page loaded by the caller. */
  addTab(win: WindowRecord, init: Partial<TabRecord> & { after?: ID; background?: boolean; space?: ID }): TabRecord {
    const space = init.space ?? win.space
    const { after, background, space: _s, ...rest } = init
    const source = after ? this.tabs.get(after) : this.activeTab(win) ?? undefined
    const tab = this.makeTab(win, space, { ...rest, empty: rest.empty ?? !rest.url })
    if (source?.shy) { tab.shy = true; tab.store = source.store }
    const row = this.spaceTabs(win, space)
    const apart = source && this.groupOf(win, source)
    const at = after ? this.placeForLink(win, after, space) : apart ? this.placeForFront(win, space) : this.placeForNew(win, space)
    row.splice(at, 0, tab.id)
    if (!background) this.selectTab(win, tab.id)
    this.touch(win, ['tabs', 'activeID'])
    this.sessionSoon(win, space)
    return tab
  }

  /** A tab of a space not on screen closed by Oriel (Closing.closeParked):
   * out of its row and the row written; not offered to ⇧⌘T, which would
   * reopen it in the space on screen with that space's sign-ins. */
  closeParked(win: WindowRecord, id: ID): void {
    const t = this.tabs.get(id)
    if (!t) return
    const space = t.space
    const row = this.spaceTabs(win, space)
    this.removeFromRow(win, id)
    this.dropTab(id)
    this.removeEmptyGroup(win, space, t.groupID)
    if (win.active[space] === id) win.active[space] = row.find(x => !this.tabs.get(x)?.pinID) ?? row[0] ?? null
    this.sessionNow(win, space)
  }

  /** ⌘-click on a pin with pins.commandNewTab (Browser.commandClickPin,
   * §6.13): at home, its page in a new tab behind; wandered, the wandered
   * page kept as a loose tab and the pin a fresh tab at home. */
  commandClickPin(win: WindowRecord, id: ID): TabRecord | null {
    const t = this.tabs.get(id)
    if (!t?.pinID || t.win !== win.id) return null
    win.picked = []
    const home = t.home ?? t.url
    const wandered = !!t.home && !!t.url && !samePage(t.home, t.url)
    if (!wandered) return this.open(win, home, { foreground: false, from: t.id })
    const space = t.space
    const row = this.spaceTabs(win, space)
    const fresh = this.makeTab(win, space, {
      url: home, title: t.pinTitle ?? '', empty: false, pinID: t.pinID, letter: t.letter, home, listed: t.listed,
      everywhere: t.everywhere, pinFolder: t.pinFolder, name: t.name, pinTitle: t.pinTitle,
    })
    row[row.indexOf(id)] = fresh.id
    for (const k of ['pinID', 'letter', 'home', 'listed', 'pinFolder', 'pinTitle', 'everywhere', 'name', 'resting'] as const) delete t[k]
    t.letGo = Date.now()
    row.splice(this.pinnedCount(win, space), 0, id)
    this.emit('tab-go', fresh.id, home)
    if (win.active[space] === id) this.selectTab(win, fresh.id)
    this.reconcile(win, space)
    this.touch(win, ['tabs', 'pins', 'activeID', 'picked'])
    this.sessionNow(win, space)
    return fresh
  }

  /** A sized pop-up as a tab (tabs.popupWindows off, §3.35): in front at the
   * end, in its opener's group, named by its site; its page is the one
   * Chromium made for it, so the opener can still talk to it. */
  popupTab(win: WindowRecord, opener: ID, url: string): TabRecord {
    const source = this.tabs.get(opener)
    const space = source?.space ?? win.space
    const tab = this.makeTab(win, space, {
      url, empty: false, popup: true, opener, shy: source?.shy || undefined, store: source?.shy ? source.store : undefined,
    })
    const g = source && this.groupOf(win, source, space)
    if (g) tab.groupID = g
    const row = this.spaceTabs(win, space)
    row.splice(g ? this.endOfGroup(win, space, g) : this.placeForFront(win, space), 0, tab.id)
    this.selectTab(win, tab.id)
    this.touch(win, ['tabs', 'activeID'])
    this.sessionSoon(win, space)
    return tab
  }

  duplicate(win: WindowRecord, id: ID): TabRecord | null {
    const t = this.tabs.get(id)
    if (!t || t.empty || t.internal || !/^(https?|file):/i.test(t.url)) return null
    const space = t.space
    const copy = this.makeTab(win, space, { url: t.url, title: t.title, empty: false, shy: t.shy, store: t.store, groupID: t.pinID ? undefined : t.groupID })
    const row = this.spaceTabs(win, space)
    if (win.active[space] !== id) this.selectTab(win, id)
    row.splice(this.placeForNew(win, space), 0, copy.id)
    this.arrangeGroups(win, space)
    this.emit('tab-go', copy.id, t.url)
    this.selectTab(win, copy.id)
    this.sessionSoon(win, space)
    return copy
  }

  // MARK: closing (§3.10-§3.19)

  /** ⌘W: the picked tabs, or the tab in front. */
  closeFront(win: WindowRecord): void {
    if (win.picked.length) { this.closePicked(win); return }
    const id = win.active[win.space]
    if (id) this.closeTab(win, id)
  }

  /** Close Tab as a hand asks: a grouped page is put away (§3.11). */
  closeTab(win: WindowRecord, id: ID): void {
    const t = this.tabs.get(id)
    if (!t) return
    if (this.putsAway(win, t)) this.putAway(win, t)
    else this.close(win, id)
  }

  putsAway(win: WindowRecord, t: TabRecord): boolean {
    return !!this.groupOf(win, t, t.space) && !t.asleep && !t.empty && !t.bench && !!t.url
  }

  /** A page let go where it stands: its row stays (§6.39). */
  putAway(win: WindowRecord, t: TabRecord): void {
    this.leaveSplit(win, t.space, t.id)
    // Off it first, so the window no longer wants its page.
    if (win.active[t.space] === t.id) this.leave(win, t)
    this.rest(t)
    this.sessionNow(win, t.space)
  }

  /** The page let go without its history (Tab.rest, §2.30). */
  rest(t: TabRecord, at?: string): void {
    this.keeps.delete(t.id)
    this.emit('tab-rest', t.id)
    const moved = at && !samePage(at, t.url)
    this.updateTab(t.id, {
      asleep: true, resting: true, loading: false, audible: false, canGoBack: false, canGoForward: false,
      url: at ?? t.url, title: moved ? hostOf(at) : t.title, error: undefined, crashed: undefined, dead: undefined, stale: undefined,
    })
  }

  /** Off a pin or a tab put away, onto the tab looked at last (Browser.leave). */
  private leave(win: WindowRecord, t: TabRecord): void {
    const others = this.spaceTabs(win, t.space).map(id => this.tabs.get(id)!).filter(x => x && x.id !== t.id && !x.asleep)
    const loose = others.filter(x => !x.pinID)
    const pool = loose.length ? loose : others
    const back = pool.reduce<TabRecord | null>((best, x) => (!best || (x.touched ?? 0) > (best.touched ?? 0) ? x : best), null)
    if (back) this.selectTab(win, back.id)
    else this.newTab(win)
  }

  /** Browser.close. `goingBack`: lands on the tab viewed before. */
  close(win: WindowRecord, id: ID, goingBack = false): void {
    const tab = this.tabs.get(id)
    if (!tab) return
    const space = tab.space
    const row = this.spaceTabs(win, space)
    const index = row.indexOf(id)
    if (index < 0) return
    const split = (win.splitsBy[space] ?? []).find(s => s.tabs.includes(id))
    const partner = split?.tabs.find(x => x !== id)
    const onLeft = split ? split.tabs.indexOf(id) < split.tabs.indexOf(partner ?? '') : false

    // A pin is put down, not closed (§6.7).
    if (tab.pinID) {
      const home = this.pref<boolean>('pins.home') || this.pref<boolean>('pins.peek') ? tab.home : undefined
      if (win.active[space] === id) this.leave(win, tab)
      this.rest(tab, home)
      this.sessionNow(win, space)
      return
    }

    if (row.length === 1) {
      if (tab.empty) { this.emit('close-window', win.id); return }
      this.remember(win, tab, 0)
      this.removeFromRow(win, id)
      this.dropTab(id)
      this.removeEmptyGroup(win, space, tab.groupID)
      const fresh = this.makeTab(win, space, { empty: true })
      row.push(fresh.id)
      win.active[space] = fresh.id
      fresh.touched = Date.now()
      this.touch(win, ['tabs', 'activeID', 'groups'])
      this.sessionSoon(win, space)
      return
    }

    const kept = (x: TabRecord) => !!x.pinID || !!this.groupOf(win, x, space)
    const others = row.filter(x => x !== id).map(x => this.tabs.get(x)!).filter(Boolean)
    const besideGroups = others.some(x => !x.pinID && this.groupOf(win, x, space))
    const onlyPins = this.pref<boolean>('tabs.newAfterLast') && !others.some(x => !x.pinID)
    const onlyKept = besideGroups && !kept(tab) && !others.some(x => !kept(x))
    if (win.active[space] === id && (onlyPins || onlyKept)) {
      if (tab.empty) {
        if (besideGroups) { tab.draft = ''; win.field = { ...win.field, text: '' }; this.touch(win, ['field']) }
        else this.emit('close-window', win.id)
        return
      }
      this.remember(win, tab, index, partner, onLeft)
      const fresh = this.makeTab(win, space, { empty: true })
      row[index] = fresh.id
      this.leaveSplit(win, space, id)
      this.dropTab(id)
      win.active[space] = fresh.id
      fresh.touched = Date.now()
      this.removeEmptyGroup(win, space, tab.groupID)
      this.touch(win, ['tabs', 'activeID', 'groups'])
      this.sessionSoon(win, space)
      return
    }

    this.remember(win, tab, index, partner, onLeft)
    const wasActive = win.active[space] === id
    const back = wasActive ? this.tabBefore(win, id) : null
    this.removeFromRow(win, id)
    this.dropTab(id)
    this.removeEmptyGroup(win, space, tab.groupID)
    if (wasActive) {
      win.active[space] = null
      const before = goingBack || this.pref<boolean>('tabs.closeGoesBack') || tab.internal ? back : back && back === tab.opener ? back : null
      const next = (partner && row.includes(partner) ? partner : null) ?? before ?? row[Math.min(index, row.length - 1)]
      if (next) this.selectTab(win, next)
    }
    this.touch(win, ['tabs', 'activeID', 'groups', 'picked'])
    this.sessionSoon(win, space)
  }

  /** A closed tab kept for ⇧⌘T (Browser.remember, §9.15). */
  private remember(win: WindowRecord, t: TabRecord, index: number, partner?: ID, onLeft = false): void {
    if (t.shy || t.empty || !t.url) return
    const keep = this.hooks.keepsake(t.id) ?? this.keeps.get(t.id)
    const ghost: Ghost = {
      id: newID(), url: t.url, title: t.title, index, groupID: t.groupID, partner, onLeft, was: t.id,
      batch: win.batching?.id, kind: win.batching?.kind ?? 'clear', front: false, muted: t.muted, at: Date.now(), favicon: t.favicon,
    }
    if (keep) this.keeps.set(`ghost:${ghost.id}`, keep)
    win.ghosts.push(ghost)
    // Twelve steps back, a bulk close counting as one.
    const steps = new Set<string>()
    let count = 0
    for (const g of win.ghosts) { if (!g.batch) count++; else if (!steps.has(g.batch)) { steps.add(g.batch); count++ } }
    if (count > 12) {
      const oldest = win.ghosts[0]
      const gone = oldest.batch ? win.ghosts.filter(g => g.batch === oldest.batch) : [oldest]
      win.ghosts = win.ghosts.filter(g => !gone.includes(g))
      for (const g of gone) this.keeps.delete(`ghost:${g.id}`)
    }
    for (const id of [...win.closedGroups.keys()]) if (!win.ghosts.some(g => g.groupID === id)) win.closedGroups.delete(id)
    this.touch(win, ['reopen'])
    // ⌘Z's to undo while closing stays the last thing done (Browser.lastClose,
    // §9.19): the row is read once the close is through.
    const mark = { win: win.id, ghost: ghost.id, scene: null as string | null }
    this.lastClose = mark
    setImmediate(() => { if (this.lastClose === mark) mark.scene = this.scene(win) })
  }

  /** ⌘Z reopens a closed tab (tabs.undoReopens): the close still the last
   * thing done, in any window. */
  lastClose: { win: ID; ghost: ID; scene: string | null } | null = null

  /** The tab in front and the row, to tell whether anything moved since. */
  scene(win: WindowRecord): string {
    return `${win.space}|${win.active[win.space] ?? ''}|${this.spaceTabs(win).join(',')}`
  }

  /** Something else done: ⌘Z undoes as before. */
  forgetClose(): void { this.lastClose = null }

  /** ⌘Z right after a close: the tab back, as ⇧⌘T would. False when it isn't
   * the last thing done (the key then goes where it was going). */
  undoClose(win: WindowRecord): boolean {
    const last = this.lastClose
    if (!this.pref<boolean>('tabs.undoReopens') || !last || last.win !== win.id) return false
    const ghost = win.ghosts.find(g => g.id === last.ghost)
    if (!ghost || (last.scene !== null && last.scene !== this.scene(win))) { this.lastClose = null; return false }
    this.lastClose = null
    this.reopenGhost(win, ghost.id)
    return true
  }

  /** Tabs closed as one act: one ⇧⌘T brings them back. */
  private closingTogether(win: WindowRecord, kind: Ghost['kind'], f: (batch: ID) => void): void {
    const batch = newID(), was = win.active[win.space]
    win.batching = { id: batch, kind }
    try { f(batch) } finally {
      win.batching = null
      const front = [...win.ghosts].reverse().find(g => g.batch === batch && g.was === was)
      if (front) front.front = true
    }
  }

  /** The tabs on screen: the one in front and its split. */
  private visibleIDs(win: WindowRecord): Set<ID> {
    const a = win.active[win.space]
    const split = win.splits.find(s => s.tabs.includes(a ?? ''))
    return new Set(split ? split.tabs : a ? [a] : [])
  }

  closeOthers(win: WindowRecord, keepIDs: ID[]): void {
    const keep = keepIDs.filter(id => this.spaceTabs(win).includes(id))
    if (!keep.length) return
    const kept = new Set(keep.flatMap(id => win.splits.find(s => s.tabs.includes(id))?.tabs ?? [id]))
    const front = keep.find(id => id === win.active[win.space]) ?? keep[0]
    this.selectTab(win, front)
    for (const id of this.spaceTabs(win).filter(x => !kept.has(x))) this.close(win, id)
    this.selectTab(win, front)
  }

  tabsBelow(win: WindowRecord, id: ID): ID[] {
    const row = this.spaceTabs(win)
    const index = row.indexOf(id)
    if (index < 0) return []
    const end = this.afterSplit(win, win.space, index)
    return row.slice(end + 1).filter(x => !this.tabs.get(x)?.pinID)
  }

  closeBelow(win: WindowRecord, id: ID): void {
    const going = this.tabsBelow(win, id)
    if (!going.length) return
    this.closingTogether(win, 'tabs', () => {
      if (going.includes(win.active[win.space] ?? '')) this.selectTab(win, id)
      for (const page of [...going].reverse()) {
        const t = this.tabs.get(page)
        const g = t && this.groupOf(win, t)
        if (g && this.spaceTabs(win).filter(x => this.tabs.get(x)?.groupID === g).length === 1) {
          const at = win.groups.findIndex(x => x.id === g)
          win.closedGroups.set(g, { group: { ...win.groups[at] }, at })
        }
        this.close(win, page)
      }
    })
  }

  /** ⌘W with tabs picked: each as ⌘W closes it, all as one (§3.19). */
  closePicked(win: WindowRecord, ids = win.picked): void {
    const row = this.spaceTabs(win)
    const going = row.filter(id => ids.includes(id))
    if (!going.length) return
    const onScreen = this.visibleIDs(win)
    win.picked = []
    this.closingTogether(win, 'tabs', () => {
      for (const id of going) if (!onScreen.has(id)) this.closeTab(win, id)
      for (const id of going) if (onScreen.has(id)) this.closeTab(win, id)
    })
    this.touch(win, ['picked'])
  }

  // MARK: ⇧⌘T (§9.15-§9.18)

  reopenTitle(win: WindowRecord): string {
    const last = win.ghosts[win.ghosts.length - 1]
    const lastWindow = this.closedWindows[this.closedWindows.length - 1]?.at ?? 0
    if (!last || !last.batch || lastWindow > last.at) return 'Reopen Closed Tab'
    return `Reopen ${this.closedTitle(win, last)}`
  }

  closedTitle(win: WindowRecord, g: Ghost): string {
    if (!g.batch) return g.title || pretty(g.url)
    const count = win.ghosts.filter(x => x.batch === g.batch).length
    if (g.kind === 'group') return 'Closed Group'
    if (g.kind === 'clear') return count === 1 ? 'Cleared Tab' : `${count} Cleared Tabs`
    return count === 1 ? 'Closed Tab' : `${count} Closed Tabs`
  }

  /** History › Recently Closed: a bulk close once, latest first, ten at most. */
  recentlyClosed(win: WindowRecord): Ghost[] {
    const batches = new Set<string>()
    return [...win.ghosts].reverse().filter(g => !g.batch || (!batches.has(g.batch) && !!batches.add(g.batch))).slice(0, 10)
  }

  reopen(win: WindowRecord): TabRecord | null {
    const last = win.ghosts[win.ghosts.length - 1]
    const lastWindow = this.closedWindows[this.closedWindows.length - 1]
    if (lastWindow && lastWindow.at > (last?.at ?? 0) && this.reopenWindow()) return null
    if (!last) return null
    return this.reopenGhost(win, last.id)
  }

  reopenGhost(win: WindowRecord, ghostID: ID): TabRecord | null {
    const ghost = win.ghosts.find(g => g.id === ghostID)
    if (!ghost) return null
    if (ghost.batch) { this.reopenBatch(win, ghost.batch); return null }
    win.ghosts = win.ghosts.filter(g => g.id !== ghost.id)
    const keep = this.keeps.get(`ghost:${ghost.id}`)
    this.keeps.delete(`ghost:${ghost.id}`)
    const internal = internalKind(ghost.url)
    if (internal) return this.showInternal(win, ghost.url, internal)
    const space = win.space
    const group = this.regroup(win, ghost)
    const tab = this.makeTab(win, space, { url: ghost.url, title: ghost.title, empty: false, muted: ghost.muted, groupID: group.id, favicon: ghost.favicon })
    const row = this.spaceTabs(win, space)
    row.splice(this.safeIndex(win, space, ghost.index), 0, tab.id)
    if (group.back) this.arrangeGroups(win, space)
    if (keep) { this.keeps.set(tab.id, keep); tab.asleep = true }
    else this.emit('tab-go', tab.id, ghost.url)
    if (ghost.partner && row.includes(ghost.partner) && !this.inSplit(win, ghost.partner)) {
      win.splits.push({ tabs: ghost.onLeft ? [tab.id, ghost.partner] : [ghost.partner, tab.id], axis: 'horizontal', sizes: [0.5, 0.5], focused: tab.id })
    }
    this.selectTab(win, tab.id)
    this.touch(win, ['tabs', 'groups', 'splits', 'reopen'])
    this.sessionSoon(win, space)
    return tab
  }

  private reopenBatch(win: WindowRecord, batch: ID): void {
    const members = win.ghosts.filter(g => g.batch === batch)
    win.ghosts = win.ghosts.filter(g => g.batch !== batch)
    const space = win.space
    const row = this.spaceTabs(win, space)
    const back = new Map<ID, ID>()
    let front: ID | null = null
    let regrouped = false
    for (const ghost of [...members].reverse()) {
      const keep = this.keeps.get(`ghost:${ghost.id}`)
      this.keeps.delete(`ghost:${ghost.id}`)
      const internal = internalKind(ghost.url)
      if (internal && row.some(id => this.tabs.get(id)?.internal === internal)) continue
      const group = this.regroup(win, ghost)
      regrouped ||= group.back
      const tab = this.makeTab(win, space, {
        url: ghost.url, title: ghost.title, empty: false, muted: ghost.muted, groupID: group.id, favicon: ghost.favicon,
        asleep: !internal, internal: internal ?? undefined,
      })
      if (keep) this.keeps.set(tab.id, keep)
      row.splice(this.safeIndex(win, space, ghost.index), 0, tab.id)
      back.set(ghost.was, tab.id)
      if (ghost.front) front = tab.id
      const partner = ghost.partner && back.get(ghost.partner)
      if (partner) {
        const s = win.splits.find(x => x.tabs.includes(partner))
        if (s) { if (s.tabs.length < 4) { const i = s.tabs.indexOf(partner); s.tabs.splice(ghost.onLeft ? i : i + 1, 0, tab.id); s.sizes = s.tabs.map(() => 1 / s.tabs.length) } }
        else win.splits.push({ tabs: ghost.onLeft ? [tab.id, partner] : [partner, tab.id], axis: 'horizontal', sizes: [0.5, 0.5] })
      }
    }
    if (regrouped) this.arrangeGroups(win, space)
    if (front) this.selectTab(win, front)
    const clear = win.lastClear
    if (clear?.batch === batch && clear.blank) {
      const blank = this.tabs.get(clear.blank)
      if (blank?.empty && !blank.draft && win.active[space] !== blank.id && !win.field.text) this.close(win, blank.id)
    }
    if (win.lastClear?.batch === batch) win.lastClear = null
    this.touch(win, ['tabs', 'groups', 'splits', 'activeID', 'reopen'])
    this.sessionSoon(win, space)
  }

  private regroup(win: WindowRecord, ghost: Ghost): { id?: ID; back: boolean } {
    let back = false
    if (ghost.groupID && !win.groups.some(g => g.id === ghost.groupID)) {
      const closed = win.closedGroups.get(ghost.groupID)
      if (closed) {
        win.closedGroups.delete(ghost.groupID)
        win.groups.splice(Math.min(closed.at, win.groups.length), 0, { ...closed.group, folded: false })
        back = true
      }
    }
    const id = ghost.groupID && win.groups.some(g => g.id === ghost.groupID) ? ghost.groupID : undefined
    return { id, back }
  }

  // MARK: moving in the row

  moveTab(win: WindowRecord, id: ID, to: number): void {
    const t = this.tabs.get(id)
    if (!t) return
    const row = this.spaceTabs(win, t.space)
    const from = row.indexOf(id)
    if (from < 0) return
    row.splice(from, 1)
    const pins = this.pinnedCount(win, t.space)
    // A pin among the pins, a tab among the tabs (§4.23).
    const lo = t.pinID ? 0 : pins
    const hi = t.pinID ? pins : row.length
    row.splice(Math.max(lo, Math.min(to, hi)), 0, id)
    if (t.pinID) this.pinsFromRow(win, t.space)
    this.arrangeGroups(win, t.space)
    this.touch(win, ['tabs'])
    this.sessionSoon(win, t.space)
  }

  // MARK: picking (§3.18)

  pick(win: WindowRecord, id: ID, mode: 'toggle' | 'range' | 'addRange' | 'clear'): void {
    if (mode === 'clear') { win.picked = []; win.anchor = null; this.touch(win, ['picked']); return }
    const shown = this.shownTabs(win)
    if (!shown.includes(id)) return
    const active = win.active[win.space]
    if (mode === 'toggle') {
      if (!win.picked.length && active && active !== id && shown.includes(active)) win.picked = [active]
      win.picked = win.picked.includes(id) ? win.picked.filter(x => x !== id) : [...win.picked, id]
      win.anchor = id
    } else {
      const anchor = win.anchor && shown.includes(win.anchor) ? win.anchor : active && shown.includes(active) ? active : id
      const [a, b] = [shown.indexOf(anchor), shown.indexOf(id)].sort((x, y) => x - y)
      const range = shown.slice(a, b + 1)
      win.picked = mode === 'addRange' ? [...new Set([...win.picked, ...range])] : range
    }
    this.touch(win, ['picked'])
  }

  // MARK: the row as shown, ⌘1-⌘9, steps (§3.22, §3.24, §6.50)

  /** The row without the tabs folded away in a group. */
  shownTabs(win: WindowRecord): ID[] {
    const row = this.spaceTabs(win)
    const active = win.active[win.space]
    return row.filter(id => {
      const t = this.tabs.get(id)
      if (!t) return false
      const g = this.groupOf(win, t)
      if (!g) return true
      return !win.groups.find(x => x.id === g)?.folded || id === active
    })
  }

  shortcutTargets(win: WindowRecord): ID[] {
    const row = this.spaceTabs(win)
    const active = win.active[win.space]
    const tabs = row.map(id => this.tabs.get(id)!).filter(Boolean)
    const out: ID[] = tabs.filter(t => t.pinID).map(t => t.id)
    for (const g of win.groups) {
      const members = tabs.filter(t => !t.pinID && t.groupID === g.id)
      if (!g.folded) { out.push(...members.filter(t => !t.asleep || t.id === active).map(t => t.id)); continue }
      const current = members.find(t => t.id === active)
      if (!current && !members.some(t => !t.asleep)) continue
      const pick = current ?? members.reduce((a, b) => ((b.touched ?? 0) > (a.touched ?? 0) ? b : a))
      out.push(pick.id)
    }
    out.push(...tabs.filter(t => !t.pinID && !this.groupOf(win, t)).map(t => t.id))
    return out
  }

  /** ⌘1-⌘8 a place, ⌘9 the last; a pin's number again goes back. */
  nth(win: WindowRecord, n: number): void {
    const targets = this.shortcutTargets(win)
    const id = n === 9 ? targets[targets.length - 1] : targets[n - 1]
    if (!id) return
    const t = this.tabs.get(id)!
    if (t.pinID && win.active[win.space] === id) {
      const back = this.tabBefore(win, id)
      if (back) { this.selectTab(win, back); return }
    }
    this.selectTab(win, id, { unfoldGroup: false })
  }

  step(win: WindowRecord, by: 1 | -1): void {
    const shown = new Set(this.shownTabs(win))
    const row = this.spaceTabs(win)
    const anchor = win.active[win.space]
    const here = row.indexOf(anchor ?? '')
    if (here < 0 || !(shown.size > 1 || (shown.size === 1 && !shown.has(anchor!)))) return
    for (let n = 1; n < row.length; n++) {
      const next = row[(((here + by * n) % row.length) + row.length) % row.length]
      if (shown.has(next)) { this.selectTab(win, next); return }
    }
  }

  // MARK: ⌃Tab (§3.25-§3.27)

  switcherRow(win: WindowRecord): ID[] {
    const current = win.active[win.space]
    const leavesOutPins = this.pref<boolean>('tabs.switcherLeavesOutPins')
    return this.spaceTabs(win).filter(id => {
      const t = this.tabs.get(id)
      if (!t) return false
      if (leavesOutPins && t.pinID && id !== current) return false
      if (id === current || !t.asleep) return true
      return !t.pinID && !this.groupOf(win, t)
    })
  }

  switcherOrder(win: WindowRecord): ID[] {
    const row = this.switcherRow(win)
    const valid = new Set(row)
    const current = win.active[win.space]
    const back = this.pref<boolean>('tabs.switcherBehindFirst') ? [] : win.recent.filter(x => x !== current && valid.has(x)).slice(0, 1)
    const seen = new Set<ID>()
    return [...(current ? [current] : []), ...back, ...win.used, ...row].filter(id => valid.has(id) && !seen.has(id) && !!seen.add(id)).slice(0, 10)
  }

  switchStep(win: WindowRecord, by: 1 | -1): void {
    if (!win.switcher) {
      const cards = this.switcherOrder(win)
      if (cards.length < 2 || cards[0] !== win.active[win.space]) return
      win.switcher = { cards, index: by === 1 ? 1 : cards.length - 1 }
    } else {
      const n = win.switcher.cards.length
      win.switcher = { ...win.switcher, index: (win.switcher.index + by + n) % n }
    }
    this.touch(win, ['switcher'])
  }

  switchEnd(win: WindowRecord, cancel = false): void {
    const s = win.switcher
    if (!s) return
    win.switcher = null
    this.touch(win, ['switcher'])
    if (!cancel && s.cards[s.index]) this.selectTab(win, s.cards[s.index])
  }

  // MARK: groups (§6.34-§6.41, §6.50)

  /** The group a tab is shown in: none for a pin, or a group not in its row. */
  groupOf(win: WindowRecord, t: TabRecord, space = t.space): ID | undefined {
    if (t.pinID || !t.groupID) return undefined
    return (win.groupsBy[space] ?? []).some(g => g.id === t.groupID) ? t.groupID : undefined
  }

  private endOfGroup(win: WindowRecord, space: ID, id: ID): number {
    const row = this.spaceTabs(win, space)
    let last = -1
    row.forEach((x, i) => { const t = this.tabs.get(x); if (t && !t.pinID && t.groupID === id) last = i })
    if (last >= 0) return last + 1
    const firstLoose = row.findIndex(x => !this.tabs.get(x)?.pinID)
    return firstLoose >= 0 ? firstLoose : row.length
  }

  /** Pins, each group's tabs in the groups' order, then the rest. */
  arrangeGroups(win: WindowRecord, space: ID): void {
    const row = this.spaceTabs(win, space)
    const groups = win.groupsBy[space] ?? []
    const tabs = row.map(id => this.tabs.get(id)!).filter(Boolean)
    const pins = tabs.filter(t => t.pinID)
    const buckets = new Map<ID | undefined, TabRecord[]>()
    for (const t of tabs) if (!t.pinID) {
      const g = this.groupOf(win, t, space)
      buckets.set(g, [...(buckets.get(g) ?? []), t])
    }
    let order = [...pins, ...groups.flatMap(g => buckets.get(g.id) ?? []), ...(buckets.get(undefined) ?? [])].map(t => t.id)
    // A split stays together, under its first page.
    const splits = win.splitsBy[space] ?? []
    if (splits.length) {
      const lefts = new Map(splits.map(s => [s.tabs[0], s.tabs]))
      const inSplit = new Set(splits.flatMap(s => s.tabs.slice(1)))
      order = order.flatMap(id => (lefts.has(id) ? lefts.get(id)!.filter(x => row.includes(x)) : inSplit.has(id) ? [] : [id]))
    }
    if (order.length === row.length && order.every((id, i) => id === row[i])) return
    win.tabs[space] = order
  }

  private removeEmptyGroup(win: WindowRecord, space: ID, id?: ID): void {
    if (!id) return
    if (this.spaceTabs(win, space).some(x => this.tabs.get(x)?.groupID === id)) return
    win.groupsBy[space] = (win.groupsBy[space] ?? []).filter(g => g.id !== id)
  }

  /** Move to Group › New Group: "Group N", open (§6.34). */
  newGroup(win: WindowRecord, ids: ID[]): ID | null {
    const id = newID()
    win.groups.push({ id, name: `Group ${win.groups.length + 1}`, colour: 0, folded: false })
    this.moveToGroup(win, ids, id)
    this.removeEmptyGroup(win, win.space, id)
    this.touch(win, ['groups', 'tabs'])
    this.sessionNow(win, win.space)
    return win.groups.some(g => g.id === id) ? id : null
  }

  moveToGroup(win: WindowRecord, ids: ID[], group: ID | null): void {
    if (group && !win.groups.some(g => g.id === group)) return
    const space = win.space
    const now = Date.now()
    const previous = new Set<ID>()
    for (const id of ids) {
      const t = this.tabs.get(id)
      if (!t || t.space !== space || t.pinID || t.shy || t.bench || (t.groupID ?? null) === group) continue
      const partners = win.splits.find(s => s.tabs.includes(id))?.tabs ?? [id]
      for (const p of partners) {
        const pt = this.tabs.get(p)
        if (!pt) continue
        if (pt.groupID) previous.add(pt.groupID)
        if (group) pt.groupID = group
        else { delete pt.groupID; pt.letGo = now }
      }
    }
    for (const g of previous) this.removeEmptyGroup(win, space, g)
    if (group) { const g = win.groups.find(x => x.id === group); if (g) g.folded = false }
    this.arrangeGroups(win, space)
    this.touch(win, ['groups', 'tabs'])
    this.sessionNow(win, space)
  }

  renameGroup(win: WindowRecord, id: ID, name: string): void {
    const g = win.groups.find(x => x.id === id)
    const trimmed = name.trim()
    if (!g || !trimmed) return
    g.name = trimmed
    this.touch(win, ['groups'])
    this.sessionNow(win, win.space)
  }

  colourGroup(win: WindowRecord, id: ID, colour: number): void {
    const g = win.groups.find(x => x.id === id)
    if (!g || !Number.isInteger(colour) || colour < 0 || colour > 5 || g.colour === colour) return
    g.colour = colour
    this.touch(win, ['groups'])
    this.sessionNow(win, win.space)
  }

  foldGroup(win: WindowRecord, id: ID, folded?: boolean): void {
    const g = win.groups.find(x => x.id === id)
    if (!g) return
    g.folded = folded ?? !g.folded
    this.touch(win, ['groups', 'tabs'])
    this.sessionNow(win, win.space)
  }

  foldAllGroups(win: WindowRecord, folded: boolean): void {
    if (!win.groups.some(g => g.folded !== folded)) return
    for (const g of win.groups) g.folded = folded
    this.touch(win, ['groups', 'tabs'])
    this.sessionNow(win, win.space)
  }

  /** Ungroup Tabs: the group goes, its tabs stay, loose (§6.41). */
  ungroup(win: WindowRecord, id: ID): void {
    if (!win.groups.some(g => g.id === id)) return
    const now = Date.now()
    for (const x of this.spaceTabs(win)) { const t = this.tabs.get(x); if (t?.groupID === id) { delete t.groupID; t.letGo = now } }
    win.groups = win.groups.filter(g => g.id !== id)
    this.arrangeGroups(win, win.space)
    this.touch(win, ['groups', 'tabs'])
    this.sessionNow(win, win.space)
  }

  /** Close Group: every tab, remembered as one (§6.40). */
  closeGroup(win: WindowRecord, id: ID): void {
    const at = win.groups.findIndex(g => g.id === id)
    if (at < 0) return
    win.closedGroups.set(id, { group: { ...win.groups[at] }, at })
    const going = this.spaceTabs(win).filter(x => this.tabs.get(x)?.groupID === id)
    const onScreen = this.visibleIDs(win)
    this.closingTogether(win, 'group', () => {
      for (const x of going) if (!onScreen.has(x)) this.close(win, x)
      for (const x of going) if (onScreen.has(x)) this.close(win, x)
    })
    if (win.groups.some(g => g.id === id)) this.ungroup(win, id)
    this.touch(win, ['groups', 'tabs'])
    this.sessionNow(win, win.space)
  }

  newTabInGroup(win: WindowRecord, id: ID): TabRecord | null {
    const g = win.groups.find(x => x.id === id)
    if (!g || win.shy) return null
    g.folded = false
    const tab = this.makeTab(win, win.space, { empty: true, groupID: id })
    this.spaceTabs(win).splice(this.endOfGroup(win, win.space, id), 0, tab.id)
    this.selectTab(win, tab.id)
    this.touch(win, ['tabs', 'groups'])
    this.sessionNow(win, win.space)
    return tab
  }

  // MARK: splits (kept for the Split View module: §8.32)

  inSplit(win: WindowRecord, id: ID): boolean {
    const t = this.tabs.get(id)
    return !!t && (win.splitsBy[t.space] ?? []).some(s => s.tabs.includes(id))
  }

  private leaveSplit(win: WindowRecord, space: ID, id: ID): void {
    const list = win.splitsBy[space]
    if (!list) return
    win.splitsBy[space] = list.flatMap(s => {
      if (!s.tabs.includes(id)) return [s]
      const tabs = s.tabs.filter(x => x !== id)
      if (tabs.length < 2) return []
      const sizes = s.sizes.filter((_, i) => s.tabs[i] !== id)
      const sum = sizes.reduce((a, b) => a + b, 0) || 1
      return [{ ...s, tabs, sizes: sizes.map(x => x / sum), focused: s.focused === id ? tabs[0] : s.focused }]
    })
  }

  // MARK: pins (§6.1-§6.23)

  /** This window's tab for each pin of the space, in order; one made asleep
   * at its home for a pin new here, the tab of a pin taken away closed
   * (Browser.reconcilePins, §6.18). */
  reconcile(win: WindowRecord, space: ID): void {
    if (!win.loaded.has(space) || win.shy) return
    const shared = this.spacesOn() ? new Set(this.sharedPins.map(p => p.id)) : new Set<string>()
    const defs = this.pinRow(space)
    const row = this.spaceTabs(win, space)
    const tabs = row.map(id => this.tabs.get(id)!).filter(Boolean)
    let pinned = tabs.filter(t => t.pinID || t.letter)
    const loose = tabs.filter(t => !(t.pinID || t.letter))
    const out: TabRecord[] = []
    for (const def of defs) {
      const found = pinned.find(t => t.pinID === def.id)
        ?? pinned.find(t => !t.pinID && t.letter === def.letter && (t.home ?? '') === def.home)
        ?? pinned.find(t => !t.pinID)
      let tab: TabRecord
      if (found) {
        pinned = pinned.filter(t => t !== found)
        tab = found
      } else {
        tab = this.makeTab(win, space, { url: def.home, title: def.title, name: def.name, asleep: true, empty: false })
      }
      tab.pinID = def.id
      tab.letter = def.letter
      tab.everywhere = shared.has(def.id) || undefined
      if (def.name) tab.name = def.name; else delete tab.name
      if (def.titled) tab.pinTitle = def.title; else delete tab.pinTitle
      if (def.listed) tab.listed = true; else delete tab.listed
      if (def.folder && def.listed && !tab.everywhere) tab.pinFolder = def.folder; else delete tab.pinFolder
      tab.home = def.home
      delete tab.groupID
      out.push(tab)
    }
    for (const gone of pinned) this.dropTab(gone.id)
    let pins = [...out.filter(t => !t.listed), ...out.filter(t => t.listed)]
    if (this.pref<boolean>('pins.folders')) {
      const own = pins.filter(t => t.listed && !t.everywhere)
      const order = tree.orderedIDs(own.map(t => ({ id: t.id, folder: t.pinFolder })), this.folders.get(space) ?? [])
      pins = [...pins.filter(t => !t.listed), ...pins.filter(t => t.listed && t.everywhere), ...order.map(id => own.find(t => t.id === id)!)]
    }
    win.tabs[space] = [...pins.map(t => t.id), ...loose.map(t => t.id)]
    const active = win.active[space]
    if (active && !this.tabs.has(active)) {
      win.active[space] = loose[0]?.id ?? pins[0]?.id ?? null
      if (!win.active[space] && win.space === space) this.frontBlank(win, space)
    }
    if (win.splitsBy[space]) win.splitsBy[space] = win.splitsBy[space].filter(s => s.tabs.every(id => this.tabs.has(id)))
    this.touch(win, ['tabs', 'pins', 'activeID'])
  }

  /** Every window's row for the space follows its pins. */
  reconcileAll(space: ID | 'shared'): void {
    for (const win of this.windows.values()) {
      if (space === 'shared') { for (const s of win.loaded) this.reconcile(win, s) }
      else this.reconcile(win, space)
    }
  }

  /** The pins' order as a row now has it (a pin dragged among the pins). */
  private pinsFromRow(win: WindowRecord, space: ID): void {
    const order = this.spaceTabs(win, space).map(id => this.tabs.get(id)?.pinID).filter((x): x is string => !!x)
    const own = this.pinsBySpace.get(space) ?? []
    const sorted = [...own].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))
    this.setOwnPins(space, [...sorted.filter(p => !p.listed), ...sorted.filter(p => p.listed)])
    const shared = [...this.sharedPins].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))
    this.sharedPins = shared
    this.savePins()
    this.reconcileAll(space)
  }

  pinTab(win: WindowRecord, id: ID, listed = false): void {
    const t = this.tabs.get(id)
    if (!t || t.shy || t.internal || t.pinID || t.empty || !t.url || win.shy) return
    const space = t.space
    const prevGroup = t.groupID
    delete t.groupID
    this.removeEmptyGroup(win, space, prevGroup)
    this.leaveSplit(win, space, id)
    const def: PinDef = { id: newID(), letter: monogram(t.url, t.internal), home: t.url, title: t.title }
    if (listed && this.pref<boolean>('pins.list')) def.listed = true
    const own = [...(this.pinsBySpace.get(space) ?? [])]
    // A square after the squares, a row after the rows.
    const squares = own.filter(p => !p.listed).length
    own.splice(def.listed ? own.length : squares, 0, def)
    this.setOwnPins(space, own)
    t.pinID = def.id
    t.letter = def.letter
    t.home = def.home
    delete t.letGo
    this.savePins()
    this.reconcileAll(space)
    this.touch(win, ['groups'])
    this.sessionNow(win, space)
  }

  /** Unpin: back to the head of the loose tabs; gone from every space and
   * every other window (§6.6). */
  unpinTab(win: WindowRecord, id: ID): void {
    const t = this.tabs.get(id)
    if (!t?.pinID) return
    const pinID = t.pinID
    const where = this.findPin(pinID)
    if (where?.space === 'shared') this.sharedPins = this.sharedPins.filter(p => p.id !== pinID)
    else if (where) this.setOwnPins(where.space, (this.pinsBySpace.get(where.space) ?? []).filter(p => p.id !== pinID))
    for (const k of ['pinID', 'letter', 'home', 'listed', 'pinFolder', 'pinTitle', 'everywhere', 'resting'] as const) delete t[k]
    t.letGo = Date.now()
    const row = this.spaceTabs(win, t.space)
    row.splice(row.indexOf(id), 1)
    row.splice(this.pinnedCount(win, t.space), 0, id)
    this.savePins()
    this.reconcileAll(where?.space === 'shared' ? 'shared' : t.space)
    this.sessionNow(win, t.space)
  }

  /** Delete: unpinned and closed, ⇧⌘T brings it back as a tab (§6.6). */
  deletePin(win: WindowRecord, pinID: ID): void {
    const tabID = this.spaceTabs(win).find(x => this.tabs.get(x)?.pinID === pinID)
    if (tabID) { this.unpinTab(win, tabID); this.close(win, tabID); return }
    const where = this.findPin(pinID)
    if (!where) return
    if (where.space === 'shared') this.sharedPins = this.sharedPins.filter(p => p.id !== pinID)
    else this.setOwnPins(where.space, (this.pinsBySpace.get(where.space) ?? []).filter(p => p.id !== pinID))
    this.savePins()
    this.reconcileAll(where.space)
  }

  private editPin(pinID: ID, f: (def: PinDef, list: PinDef[]) => PinDef[] | void): void {
    const where = this.findPin(pinID)
    if (!where) return
    const list = where.space === 'shared' ? this.sharedPins : [...(this.pinsBySpace.get(where.space) ?? [])]
    const out = f(where.def, list) ?? list
    if (where.space === 'shared') this.sharedPins = out
    else this.setOwnPins(where.space, out)
    this.savePins()
    this.reconcileAll(where.space)
    for (const win of this.windows.values()) this.sessionSoon(win, win.space)
  }

  /** Show as Row / Show as Square: to the nearer end of its new kind (§6.5). */
  setListed(pinID: ID, listed: boolean): void {
    this.editPin(pinID, (def, list) => {
      if (!!def.listed === listed) return
      const rest = list.filter(p => p.id !== def.id)
      const moved = { ...def }
      if (listed) moved.listed = true; else { delete moved.listed; delete moved.folder }
      const squares = rest.filter(p => !p.listed).length
      rest.splice(squares, 0, moved)
      return rest
    })
  }

  setLetter(pinID: ID, letter: string): void {
    const l = [...letter.trim()][0]
    if (!l) return
    this.editPin(pinID, def => { def.letter = l.toUpperCase() })
  }

  renamePin(pinID: ID, name: string | null): void {
    this.editPin(pinID, def => { if (name) def.name = name; else delete def.name })
  }

  /** Replace Pinned Page with Current URL (§6.10). */
  rehome(win: WindowRecord, pinID: ID): void {
    const tab = this.spaceTabs(win).map(x => this.tabs.get(x)!).find(t => t?.pinID === pinID)
    if (!tab || !/^(https?|file):/i.test(tab.url) || samePage(tab.home, tab.url)) return
    this.editPin(pinID, def => {
      def.home = tab.url
      if (tab.title) { def.title = tab.title; def.titled = true }
    })
  }

  /** Back to the pinned page, or the letter to change when already there (§6.9). */
  goHome(win: WindowRecord, pinID: ID): 'went' | 'home' | null {
    const tab = this.spaceTabs(win).map(x => this.tabs.get(x)!).find(t => t?.pinID === pinID)
    if (!tab?.home) return null
    if (samePage(tab.home, tab.url)) return 'home'
    if (tab.asleep) { this.updateTab(tab.id, { url: tab.home, title: '' }); this.keeps.delete(tab.id) }
    else this.emit('tab-go', tab.id, tab.home)
    this.sessionSoon(win, tab.space)
    return 'went'
  }

  /** Keep in Every Space / Only in This Space (§6.19). */
  sharePin(win: WindowRecord, pinID: ID, everywhere: boolean): void {
    if (!this.spacesOn()) return
    const where = this.findPin(pinID)
    if (!where) return
    if (everywhere && where.space !== 'shared') {
      const own = (this.pinsBySpace.get(where.space) ?? []).filter(p => p.id !== pinID)
      const moved = { ...where.def }
      delete moved.folder
      // The shared list first: in between the pin is in both, counted once.
      this.sharedPins = [...this.sharedPins, moved]
      this.setOwnPins(where.space, own)
    } else if (!everywhere && where.space === 'shared') {
      this.sharedPins = this.sharedPins.filter(p => p.id !== pinID)
      this.setOwnPins(win.space, [where.def, ...(this.pinsBySpace.get(win.space) ?? [])])
    } else return
    this.savePins()
    this.reconcileAll('shared')
  }

  /** Pins reordered among their own kind (`to` among the space's pins). */
  movePin(win: WindowRecord, pinID: ID, to: number, folder?: ID | null): void {
    const where = this.findPin(pinID)
    if (!where) return
    const list = where.space === 'shared' ? [...this.sharedPins] : [...(this.pinsBySpace.get(where.space) ?? [])]
    const from = list.findIndex(p => p.id === pinID)
    const [def] = list.splice(from, 1)
    if (folder !== undefined && where.space !== 'shared') {
      const folders = this.folders.get(where.space) ?? []
      if (folder && def.listed && folders.some(f => f.id === folder && !f.feed)) def.folder = folder
      else delete def.folder
    }
    list.splice(Math.max(0, Math.min(to, list.length)), 0, def)
    const tiered = [...list.filter(p => !p.listed), ...list.filter(p => p.listed)]
    if (where.space === 'shared') this.sharedPins = tiered
    else this.setOwnPins(where.space, tiered)
    this.savePins()
    this.reconcileAll(where.space)
    this.sessionNow(win, win.space)
  }

  /** Move to Folder / Remove from Folder: own rows only (§6.24). */
  pinToFolder(pinID: ID, folder: ID | null): void {
    const where = this.findPin(pinID)
    if (!where || where.space === 'shared' || !where.def.listed || where.def.pair) return
    const folders = this.folders.get(where.space) ?? []
    const target = folder && folders.some(f => f.id === folder && !f.feed) ? folder : undefined
    this.editPin(pinID, (def, list) => {
      const rest = list.filter(p => p.id !== def.id)
      const moved = { ...def }
      if (target) moved.folder = target; else delete moved.folder
      rest.push(moved)
      return [...rest.filter(p => !p.listed), ...rest.filter(p => p.listed)]
    })
  }

  /** A pin's own title, from its page only while it has none worth keeping. */
  private settlePinTitle(t: TabRecord): void {
    if (!t.pinID || t.asleep || !t.title || !t.home || !samePage(t.home, t.url)) return
    const had = t.pinTitle ?? ''
    if (had && had !== hostOf(t.home) && had !== t.home) return
    if (had === t.title) return
    const where = this.findPin(t.pinID)
    if (!where) return
    where.def.title = t.title
    where.def.titled = true
    t.pinTitle = t.title
    this.savePins()
    for (const win of this.windows.values()) {
      for (const id of win.tabs[t.space] ?? []) { const x = this.tabs.get(id); if (x?.pinID === t.pinID) x.pinTitle = t.title }
      this.touch(win, ['pins', 'tabs'])
    }
  }

  pinViews(win: WindowRecord): PinView[] {
    return this.spaceTabs(win).flatMap(id => {
      const t = this.tabs.get(id)
      if (!t?.pinID) return []
      const view: PinView = { id: t.pinID, title: t.pinTitle || t.title || hostOf(t.home), home: t.home ?? '', letter: t.letter, tabID: t.id }
      if (t.favicon) view.favicon = t.favicon
      if (t.pinFolder) view.folder = t.pinFolder
      if (t.everywhere) view.everywhere = true
      if (t.listed) view.listed = true
      if (t.name) view.name = t.name
      return [view]
    })
  }

  // MARK: pin folders (§6.24-§6.26)

  folderViews(win: WindowRecord): PinFolderView[] {
    const list = tree.sanitized(this.folders.get(win.space) ?? [])
    return list.map(f => {
      const v: PinFolderView = { id: f.id, name: f.name, open: !f.collapsed, depth: tree.depth(f.id, list) }
      if (f.parent) v.parent = f.parent
      if (f.feed) v.live = true
      return v
    })
  }

  newFolder(win: WindowRecord, o: { pin?: ID; parent?: ID | null; name?: string }): ID | null {
    const space = win.space
    const folders = [...(this.folders.get(space) ?? [])]
    const def = o.pin ? this.findPin(o.pin) : null
    if (o.pin && (!def || def.space === 'shared' || !def.def.listed || def.def.pair)) return null
    const asked = !!o.parent
    let parent: ID | undefined = o.parent ?? def?.def.folder ?? undefined
    if (parent && !folders.some(f => f.id === parent)) parent = undefined
    if (parent && !tree.canMake(parent, folders)) {
      if (asked) return null
      parent = folders.find(f => f.id === parent)?.parent
    }
    if (!tree.canMake(parent, folders)) return null
    const name = (o.name ?? '').trim() || 'New Folder'
    const made: PinFolder = { id: newID(), name, collapsed: false }
    if (parent) made.parent = parent
    folders.push(made)
    this.folders.set(space, folders)
    this.saveFolders()
    if (o.pin) this.pinToFolder(o.pin, made.id)
    else this.reconcileAll(space)
    return made.id
  }

  renameFolder(win: WindowRecord, id: ID, name: string): void {
    const f = (this.folders.get(win.space) ?? []).find(x => x.id === id)
    const trimmed = name.trim()
    if (!f || !trimmed) return
    f.name = trimmed.slice(0, 200)
    this.saveFolders()
  }

  foldFolder(win: WindowRecord, id: ID, folded?: boolean): void {
    const f = (this.folders.get(win.space) ?? []).find(x => x.id === id)
    if (!f) return
    f.collapsed = folded ?? !f.collapsed
    this.saveFolders()
  }

  deleteFolder(win: WindowRecord, id: ID): void {
    const space = win.space
    const folders = this.folders.get(space) ?? []
    if (!folders.some(f => f.id === id)) return
    const out = tree.removing(id, folders, this.pinsBySpace.get(space) ?? [])
    this.folders.set(space, out.folders)
    this.setOwnPins(space, out.pins)
    this.saveFolders()
    this.savePins()
    this.reconcileAll(space)
  }

  moveFolder(win: WindowRecord, id: ID, parent: ID | null): void {
    const folders = this.folders.get(win.space) ?? []
    const f = folders.find(x => x.id === id)
    if (!f || (f.parent ?? null) === parent || !tree.canMove(id, parent ?? undefined, folders)) return
    if (parent) f.parent = parent; else delete f.parent
    this.saveFolders()
    this.reconcileAll(win.space)
  }

  // MARK: spaces (§7)

  createSpace(win: WindowRecord, o: { name: string; icon?: string; signedOut?: boolean; moving?: ID[] }): ID | null {
    const name = o.name.trim()
    if (!name) return null
    const used = new Set(this.spaces.map(s => s.icon))
    const icon = o.icon ?? spaceIcons.find(i => !used.has(i)) ?? 'briefcase'
    const id = newID()
    this.spaces.push({ id, name, colour: 0, icon, sharesSignIns: !o.signedOut })
    this.saveSpaces()
    for (const w of this.windows.values()) w.loaded.add(id)
    if (o.moving?.length) this.moveToSpace(win, o.moving, id)
    this.switchSpace(win, id)
    return id
  }

  renameSpace(id: ID, name: string): void {
    const s = this.spaceOf(id)
    const trimmed = name.trim()
    if (!s || !trimmed) return
    s.name = trimmed
    this.saveSpaces()
  }

  setSpaceIcon(id: ID, icon: string): void {
    const s = this.spaceOf(id)
    if (!s || !spaceIcons.includes(icon)) return
    s.icon = icon
    this.saveSpaces()
  }

  /** A colour takes the gradient's place (§7.7). */
  setSpaceColour(id: ID, colour: number): void {
    const s = this.spaceOf(id)
    if (!s || !Number.isInteger(colour) || colour < 0 || colour > 5) return
    s.colour = colour
    delete s.gradient
    this.saveSpaces()
  }

  /** Move Left / Move Right (§7.10). */
  orderSpace(id: ID, by: 1 | -1): void {
    const at = this.spaces.findIndex(s => s.id === id)
    const to = at + by
    if (at < 0 || to < 0 || to >= this.spaces.length) return
    const [s] = this.spaces.splice(at, 1)
    this.spaces.splice(to, 0, s)
    this.prefs['spaces.orderKept'] = true
    this.savePrefs()
    this.saveSpaces()
  }

  /** Any space, the home too, as long as one is left (§7.9). */
  deleteSpace(win: WindowRecord, id: ID): boolean {
    if (this.spaces.length < 2 || !this.spaceOf(id)) return false
    const ownStore = this.ownsStore(id)
    const next = this.spaces.find(s => s.id !== id)!.id
    const wasHome = id === this.homeSpace
    for (const w of this.windows.values()) if (w.space === id) this.switchSpace(w, wasHome ? next : this.homeSpace, true)
    if (wasHome) {
      const n = this.spaceOf(next)!
      if (n.sharesSignIns === undefined) n.sharesSignIns = false
      this.homeSpace = next
      this.writeHome()
    }
    this.spaces = this.spaces.filter(s => s.id !== id)
    this.saveSpaces()
    if (id === firstSpaceID) writeJSONNow(sessionFile(id), encodeShape(emptyShape()))
    else removeFile(sessionFile(id))
    for (const w of this.windows.values()) {
      for (const t of w.tabs[id] ?? []) this.dropTab(t)
      delete w.tabs[id]; delete w.active[id]; delete w.groupsBy[id]; delete w.splitsBy[id]; delete w.saved[id]
      w.loaded.delete(id)
    }
    this.pinsBySpace.delete(id)
    this.folders.delete(id)
    this.savePins()
    writeJSONNow('pin-folders.json', encodeFolders(this.folders))
    this.saveWindowsSoon()
    if (ownStore) this.emit('space-erased', id)
    void win
    return true
  }

  /** Spaces turned off: every window back home, the others' tabs let go,
   * their files kept (§7.1). Turned on: rows come up as they are gone to. */
  private spacesToggled(): void {
    const on = this.spacesOn()
    for (const win of this.windows.values()) {
      if (!on) {
        for (const space of Object.keys(win.tabs)) {
          if (space === this.homeSpace) continue
          if (this.primary() !== win) win.saved[space] = this.shapeOf(win, space)
          else this.writeRow(win, space, true)
          for (const t of win.tabs[space]) this.dropTab(t)
          delete win.tabs[space]; delete win.active[space]
          win.loaded.delete(space)
        }
        win.space = this.homeSpace
        this.loadRow(win, win.space)
      }
      this.reconcile(win, win.space)
      if (!win.active[win.space]) this.frontBlank(win, win.space)
      this.touch(win, ['space', 'spacesOn', 'tabs', 'pins', 'activeID', 'groups', 'splits', 'pinFolders'])
    }
  }

  /** The common change of space (Browser.enter, §7.15). */
  switchSpace(win: WindowRecord, id: ID, force = false): void {
    if ((!this.spacesOn() && !force) || win.space === id || !this.spaceOf(id)) return
    const leaving = win.space
    const now = Date.now()
    const front = win.active[leaving]
    if (front) { const t = this.tabs.get(front); if (t) t.touched = now }
    this.writeRow(win, leaving, false)
    win.switcher = null
    win.picked = []
    win.space = id
    this.loadRow(win, id)
    // Back on the tab in front; gone, the first loose one; nothing, an empty tab.
    const row = this.spaceTabs(win, id)
    let active = win.active[id]
    if (active && !row.includes(active)) active = row.find(x => !this.tabs.get(x)?.pinID) ?? row[0] ?? null
    win.active[id] = active ?? null
    if (!active) this.frontBlank(win, id)
    const shown = win.active[id]
    if (shown) { const t = this.tabs.get(shown); if (t) { t.touched = now; if (t.stale) this.emit('tab-revive', shown) } }
    this.touch(win, ['space', 'tabs', 'pins', 'activeID', 'groups', 'splits', 'pinFolders', 'picked', 'switcher'])
    this.emit('space-changed', win, id)
  }

  /** Move to Space: the tabs go to the end of that space's row; the space on
   * screen stays (§7.31). Pins become that space's pins. */
  moveToSpace(win: WindowRecord, ids: ID[], space: ID): void {
    if (!this.spaceOf(space)) return
    this.loadRow(win, space)
    const from = win.space
    const row = this.spaceTabs(win, from)
    const going = row.filter(id => ids.includes(id)).map(id => this.tabs.get(id)!).filter(t => t && !t.bench && !t.everywhere && t.space !== space)
    if (!going.length) return
    const wasActive = going.some(t => t.id === win.active[from])
    const firstIndex = row.indexOf(going[0].id)
    const target = this.spaceTabs(win, space)
    const pins: PinDef[] = []
    for (const t of going) {
      this.removeFromRow(win, t.id)
      if (t.groupID) { const g = t.groupID; delete t.groupID; this.removeEmptyGroup(win, from, g) }
      if (t.pinID) {
        const where = this.findPin(t.pinID)
        if (where && where.space !== 'shared') {
          this.setOwnPins(where.space, (this.pinsBySpace.get(where.space) ?? []).filter(p => p.id !== t.pinID))
          const moved = { ...where.def }
          delete moved.folder
          pins.push(moved)
        }
      }
      const restore = this.ownsStore(from) !== this.ownsStore(space) || (this.ownsStore(from) && from !== space)
      t.space = space
      target.push(t.id)
      if (restore && !t.shy) this.emit('tab-rehome', t.id)
    }
    if (pins.length) {
      const own = [...(this.pinsBySpace.get(space) ?? [])]
      for (const p of pins) {
        const squares = own.filter(x => !x.listed).length
        own.splice(p.listed ? own.length : squares, 0, p)
      }
      this.setOwnPins(space, own)
      this.savePins()
      this.reconcileAll(space)
      this.reconcileAll(from)
    }
    if (!win.active[space]) win.active[space] = going[0].id
    if (wasActive) {
      const left = this.spaceTabs(win, from)
      const next = left[Math.min(firstIndex, left.length - 1)]
      win.active[from] = null
      if (next) this.selectTab(win, next); else this.frontBlank(win, from)
    }
    this.arrangeGroups(win, space)
    this.touch(win, ['tabs', 'activeID', 'groups', 'pins'])
    this.sessionNow(win, from)
    this.sessionNow(win, space)
  }

  /** Move Group to Space: whole, after the groups there (§7.31). */
  moveGroupToSpace(win: WindowRecord, groupID: ID, space: ID): void {
    const g = win.groups.find(x => x.id === groupID)
    if (!g || space === win.space || !this.spaceOf(space)) return
    const ids = this.spaceTabs(win).filter(x => this.tabs.get(x)?.groupID === groupID)
    this.loadRow(win, space)
    const from = win.space
    this.moveToSpace(win, ids, space)
    for (const id of ids) { const t = this.tabs.get(id); if (t) t.groupID = groupID }
    win.groupsBy[from] = (win.groupsBy[from] ?? []).filter(x => x.id !== groupID)
    win.groupsBy[space] = [...(win.groupsBy[space] ?? []), { ...g }]
    this.arrangeGroups(win, space)
    this.touch(win, ['groups', 'tabs'])
    this.sessionNow(win, from)
    this.sessionNow(win, space)
  }

  // MARK: the session files (§9.4-§9.7, §9.11)

  /** A row as the file has it (Browser.session). `keeps` collects each
   * written tab's history, for a window ⇧⌘T may bring back. */
  shapeOf(win: WindowRecord, space: ID, keeps?: Keepsake[]): SessionShape {
    const row = this.spaceTabs(win, space).map(id => this.tabs.get(id)!).filter(Boolean)
    const activeID = win.active[space]
    const onScreen = win.space === space ? this.visibleIDs(win) : new Set<ID>()
    const entries: SessionEntry[] = []
    const indices = new Map<ID, number>()
    let active = activeID ? 0 : -1
    for (const t of row) {
      if (!kept(t)) continue
      if (t.id === activeID) active = entries.length
      indices.set(t.id, entries.length)
      const pin = !!t.pinID
      const e: SessionEntry = { url: t.url, title: t.title, muted: t.muted }
      if (pin) e.pin = t.letter ?? monogram(t.url)
      if (t.name) e.name = t.name
      if (pin && t.home) e.home = t.home
      if (!pin && t.groupID) e.groupID = t.groupID
      if (pin) e.pinID = t.pinID
      const touched = onScreen.has(t.id) ? Date.now() : t.touched
      if (touched !== undefined) e.touched = toAppleDate(touched)
      if (!pin && t.letGo !== undefined) e.letGo = toAppleDate(t.letGo)
      if (pin && t.listed) e.listed = true
      entries.push(e)
      if (keeps) keeps.push((this.hooks.keepsake(t.id) ?? this.keeps.get(t.id))!)
    }
    if (activeID && !indices.has(activeID)) {
      const at = row.findIndex(t => t.id === activeID)
      const t = row[at]
      active = t && t.empty && !t.shy ? -1 : Math.max(0, row.slice(0, Math.max(0, at)).filter(kept).length - 1)
    }
    const groups: SessionGroup[] = (win.groupsBy[space] ?? [])
      .filter(g => entries.some(e => e.groupID === g.id))
      .map(g => ({ id: g.id, name: g.name, collapsed: g.folded, ...(g.colour ? { colour: g.colour } : {}) }))
    const splits = (win.splitsBy[space] ?? []).flatMap(s => {
      const places = s.tabs.map(id => indices.get(id)).filter((i): i is number => i !== undefined)
      if (places.length < 2 || places.some((p, i) => p !== places[0] + i)) return []
      const sizes = places.length === s.tabs.length ? s.sizes : places.map(() => 1 / places.length)
      return [{ tabs: places, axis: s.axis, sizes, ...(s.focused && indices.has(s.focused) ? { focused: indices.get(s.focused)! } : {}) }]
    })
    return { tabs: entries, active, groups, splits }
  }

  /** The oldest window's rows are the session files; any other's are its
   * line in windows.json (writeRow). */
  writeRow(win: WindowRecord, space: ID, now: boolean): void {
    if (win.shy || !win.loaded.has(space) || !this.windows.has(win.id)) return
    if (this.primary() === win) writeJSONNow(sessionFile(space), encodeShape(this.shapeOf(win, space)))
    else if (now) this.writeWindows(true); else this.saveWindowsSoon()
  }

  private writeAllRows(win: WindowRecord, now: boolean): void {
    if (win.sessionTimer) { clearTimeout(win.sessionTimer); win.sessionTimer = null }
    win.dirty.clear()
    for (const space of win.loaded) if (this.spaceOf(space)) this.writeRow(win, space, now)
  }

  /** 1.2 s after the first change, not the last (rememberSession, §9.6). */
  sessionSoon(win: WindowRecord, space = win.space): void {
    if (win.shy) return
    win.dirty.add(space)
    if (win.sessionTimer) return
    win.sessionTimer = setTimeout(() => {
      win.sessionTimer = null
      const spaces = [...win.dirty]
      win.dirty.clear()
      for (const s of spaces) this.writeRow(win, s, false)
    }, 1200)
  }

  sessionNow(win: WindowRecord, space = win.space): void {
    if (win.shy) return
    win.dirty.delete(space)
    this.writeRow(win, space, true)
  }

  private windowsTimer: NodeJS.Timeout | null = null

  saveWindowsSoon(): void {
    if (this.windowsTimer) return
    this.windowsTimer = setTimeout(() => { this.windowsTimer = null; this.writeWindows(false) }, 1000)
  }

  /** windows.json: the oldest window's frame and space first, then every
   * other window whole; last time's not yet brought back kept (§9.11). */
  writeWindows(_now: boolean, only?: WindowRecord[]): void {
    if (this.windowsTimer) { clearTimeout(this.windowsTimer); this.windowsTimer = null }
    const wins = (only ?? [...this.windows.values()]).filter(w => !w.shy)
    if (!wins.length) return
    const records: WindowFile[] = wins.map((w, i) => {
      const rows: Record<string, SessionShape> = {}
      if (i > 0) {
        for (const s of this.spaces) {
          if (w.loaded.has(s.id)) { const shape = this.shapeOf(w, s.id); if (shape.tabs.length) rows[s.id] = shape }
          else if (w.saved[s.id]) rows[s.id] = w.saved[s.id]
        }
      }
      const r: WindowFile = { id: w.id, space: w.space, rows, ...this.placeOf(w) }
      if (w.sidebar.folded) r.folded = true
      return r
    })
    const seen = new Set(records.map(r => r.id))
    const carried = only ? [] : this.pendingWindows.filter(r => !seen.has(r.id))
    writeJSONNow('windows.json', encodeWindows([...records, ...carried]))
  }

  /** Every row and windows.json now, the app going on: Windows asked
   * whether it may end the session, and may still be told no (§9.7). */
  saveAll(): void {
    if (this.quitting) return
    for (const w of this.windows.values()) if (!w.shy) this.writeAllRows(w, true)
    this.writeWindows(true)
  }

  /** Quitting: every row and windows.json, now (§9.7). */
  flush(): void {
    if (this.quitting && !this.windows.size) return
    this.quitting = true
    const wins = [...this.windows.values()].filter(w => !w.shy)
    if (!wins.length) return
    for (const w of wins) this.writeAllRows(w, true)
    this.writeWindows(true)
  }

  // MARK: change notification

  /** Each listener on its own: one that throws (another module's) neither
   * stops the others nor the change that was being made. */
  override emit(event: string | symbol, ...args: unknown[]): boolean {
    const listeners = this.rawListeners(event)
    for (const f of listeners) {
      try { (f as (...a: unknown[]) => void).apply(this, args) } catch (error) {
        console.warn(`[model] ${String(event)} listener:`, (error as Error)?.message ?? error)
      }
    }
    return listeners.length > 0
  }

  touch(win: WindowRecord, slices: Slice[]): void {
    this.emit('window-changed', win.id, slices)
  }

  touchAll(slices: Slice[]): void {
    for (const win of this.windows.values()) this.touch(win, slices)
  }
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  const out: Partial<T> = {}
  for (const [k, v] of Object.entries(o)) if (v !== undefined) (out as any)[k] = v
  return out
}

/** The icons a space can wear, in Spaces.icons' order (§7.2). */
export const spaceIcons = [
  'briefcase', 'building.2', 'desktopcomputer', 'laptopcomputer', 'chevron.left.forwardslash.chevron.right', 'terminal',
  'sparkles', 'brain.head.profile', 'lightbulb', 'gamecontroller', 'beach.umbrella', 'cup.and.saucer',
  'music.note', 'film', 'paintpalette', 'camera', 'house', 'book',
  'graduationcap', 'cart', 'airplane', 'dumbbell', 'leaf', 'heart',
]

export const model = new Model()
model.setMaxListeners(100)

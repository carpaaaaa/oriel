// The model: spaces, pins, windows and their tabs. It knows nothing of views;
// views (views/) follow it and tell it what pages do. Every change says which
// windows' slices it touched, and those windows send patches.
//
// Mirrors Shared + Browser on the Mac (studio/01 §0.5). Files keep the Mac's
// names and keys (spaces.json, pins.json, session.json, session-<id>.json).

import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import type { FieldState, GroupView, ID, PinView, SidebarState, SpaceView, SplitView, TabView } from '../../shared/state'
import { readJSON, writeJSON, toAppleDate, fromAppleDate } from './persist'
import { defaults, type PrefKey } from '../../shared/prefs'

export const firstSpaceID = '00000000-0000-0000-0000-000000000001'

export interface TabRecord extends TabView {
  /** A pin's own page. */
  home?: string
  touched?: number
  letGo?: number
}

export interface PinRecord {
  id: ID
  title: string
  home: string
  favicon?: string
  space: ID
  folder?: ID
  everywhere?: boolean
  listed?: boolean
}

export interface WindowRecord {
  id: ID
  space: ID
  /** Ordinary tabs (and open pins) of each space, in order. */
  tabs: Record<ID, ID[]>
  active: Record<ID, ID | null>
  groups: GroupView[]
  splits: SplitView[]
  sidebar: SidebarState
  field: FieldState
  shy: boolean
  /** Tabs closed here, newest last, for Ctrl+Shift+T. */
  closed: { url: string; title: string; space: ID; index: number }[]
}

export type Slice = keyof Pick<import('../../shared/state').WindowState,
  'tabs' | 'pins' | 'spaces' | 'space' | 'activeID' | 'sidebar' | 'field' | 'groups' | 'splits' | 'prefs' | 'pinFolders'>

interface SessionEntry {
  url: string; title: string; pin?: string; name?: string; home?: string; groupID?: string
  pinID?: string; touched?: number; letGo?: number; listed?: boolean; muted: boolean
}
interface SessionShape { tabs: SessionEntry[]; active: number; groups?: GroupView[]; splits: unknown[] }

class Model extends EventEmitter {
  tabs = new Map<ID, TabRecord>()
  windows = new Map<ID, WindowRecord>()
  spaces: SpaceView[] = []
  pins: PinRecord[] = []
  prefs: Record<string, unknown> = {}

  load(): void {
    this.prefs = { ...defaults, ...readJSON<Record<string, unknown>>('prefs.json', {}) }
    this.spaces = readJSON<SpaceView[]>('spaces.json', [])
    if (!this.spaces.length) this.spaces = [{ id: firstSpaceID, name: 'Personal', colour: 0 }]
    this.pins = readJSON<PinRecord[]>('pins.json', [])
  }

  pref<T = unknown>(key: PrefKey): T {
    return (this.prefs[key] ?? defaults[key]) as T
  }

  setPref(key: string, value: unknown): void {
    this.prefs[key] = value
    writeJSON('prefs.json', () => this.prefs)
    this.touchAll(['prefs'])
  }

  // windows

  newWindow(options: { shy?: boolean; restore?: boolean } = {}): WindowRecord {
    const space = this.spaces[0].id
    const win: WindowRecord = {
      id: randomUUID(),
      space,
      tabs: {},
      active: {},
      groups: [],
      splits: [],
      sidebar: {
        layout: this.pref<string>('tabs.layout') === 'top' ? 'top' : 'side',
        width: this.pref<number>('sidebar.width'),
        folded: false,
        side: this.pref<string>('sidebar.side') === 'right' ? 'right' : 'left',
        icons: false,
      },
      field: { open: false, target: 'new', text: '', suggestions: [], selected: 0, refused: 0 },
      shy: !!options.shy,
      closed: [],
    }
    this.windows.set(win.id, win)
    if (options.restore && !options.shy) this.restoreSessions(win)
    if (!this.spaceTabs(win).length) this.addTab(win, { empty: true })
    return win
  }

  removeWindow(id: ID): void {
    const win = this.windows.get(id)
    if (!win) return
    for (const ids of Object.values(win.tabs)) for (const t of ids) this.tabs.delete(t)
    this.windows.delete(id)
  }

  spaceTabs(win: WindowRecord, space = win.space): ID[] {
    return (win.tabs[space] ??= [])
  }

  activeTab(win: WindowRecord): TabRecord | null {
    const id = win.active[win.space]
    return id ? this.tabs.get(id) ?? null : null
  }

  windowOf(tabID: ID): WindowRecord | null {
    for (const win of this.windows.values()) for (const ids of Object.values(win.tabs)) if (ids.includes(tabID)) return win
    return null
  }

  // tabs

  addTab(win: WindowRecord, init: Partial<TabRecord> & { after?: ID; background?: boolean; space?: ID }): TabRecord {
    const space = init.space ?? win.space
    const tab: TabRecord = {
      id: randomUUID(),
      url: init.url ?? '',
      title: init.title ?? '',
      loading: false,
      audible: false,
      muted: init.muted ?? false,
      asleep: init.asleep ?? false,
      empty: init.empty ?? !init.url,
      canGoBack: false,
      canGoForward: false,
      shy: win.shy || undefined,
      ...pick(init, ['name', 'pinID', 'listed', 'groupID', 'home', 'touched', 'letGo', 'favicon']),
    }
    this.tabs.set(tab.id, tab)
    const list = this.spaceTabs(win, space)
    const at = init.after ? list.indexOf(init.after) + 1 : list.length
    list.splice(at > 0 ? at : list.length, 0, tab.id)
    if (!init.background) win.active[space] = tab.id
    this.touch(win, ['tabs', 'activeID'])
    this.saveSession(win, space)
    return tab
  }

  updateTab(id: ID, patch: Partial<TabRecord>): void {
    const tab = this.tabs.get(id)
    if (!tab) return
    let changed = false
    for (const [k, v] of Object.entries(patch)) if ((tab as any)[k] !== v) { (tab as any)[k] = v; changed = true }
    if (!changed) return
    const win = this.windowOf(id)
    if (win) {
      this.touch(win, ['tabs'])
      if ('url' in patch || 'title' in patch || 'name' in patch || 'muted' in patch) this.saveSession(win, this.spaceOfTab(win, id))
    }
    this.emit('tab-changed', tab, patch)
  }

  spaceOfTab(win: WindowRecord, id: ID): ID {
    for (const [space, ids] of Object.entries(win.tabs)) if (ids.includes(id)) return space
    return win.space
  }

  selectTab(win: WindowRecord, id: ID): void {
    const space = this.spaceOfTab(win, id)
    const prior = win.active[space]
    if (prior === id && win.space === space) return
    if (prior) this.updateTab(prior, { touched: Date.now() })
    win.space = space
    win.active[space] = id
    this.updateTab(id, { touched: Date.now(), asleep: false })
    this.touch(win, ['activeID', 'space', 'tabs'])
    this.saveSession(win, space)
    this.emit('selected', win, id)
  }

  /** Close a tab (studio/01 §3.12-3.14). The last tab with a page becomes an
   * empty one; the last empty tab closes the window ('close-window'). The
   * finer rules (pins beside, groups, the tab it was opened from) belong to
   * the tabs module. */
  closeTab(win: WindowRecord, id: ID): void {
    const tab = this.tabs.get(id)
    if (!tab) return
    const space = this.spaceOfTab(win, id)
    const list = this.spaceTabs(win, space)
    const index = list.indexOf(id)
    if (list.length === 1 && tab.empty) { this.emit('close-window', win.id); return }
    if (tab.url && !tab.empty && !tab.shy) win.closed.push({ url: tab.url, title: tab.title, space, index })
    list.splice(index, 1)
    this.tabs.delete(id)
    this.emit('tab-closed', id)
    if (win.active[space] === id) {
      const loose = list.filter(t => !this.tabs.get(t)?.pinID)
      const onlyPins = list.length > 0 && loose.length === 0
      if (!list.length || (onlyPins && this.pref<boolean>('tabs.newAfterLast'))) {
        win.active[space] = null
        this.addTab(win, { empty: true, space })
        return
      }
      const next = list[Math.min(index, list.length - 1)]
      win.active[space] = next
      this.selectTab(win, next)
    }
    this.touch(win, ['tabs', 'activeID'])
    this.saveSession(win, space)
  }

  moveTab(win: WindowRecord, id: ID, to: number): void {
    const list = this.spaceTabs(win, this.spaceOfTab(win, id))
    const from = list.indexOf(id)
    if (from < 0) return
    list.splice(from, 1)
    list.splice(Math.max(0, Math.min(to, list.length)), 0, id)
    this.touch(win, ['tabs'])
    this.saveSession(win, this.spaceOfTab(win, id))
  }

  reopen(win: WindowRecord): TabRecord | null {
    const last = win.closed.pop()
    if (!last) return null
    const list = this.spaceTabs(win, last.space)
    const tab = this.addTab(win, { url: last.url, title: last.title, space: last.space, empty: false })
    list.splice(list.indexOf(tab.id), 1)
    list.splice(Math.min(last.index, list.length), 0, tab.id)
    this.selectTab(win, tab.id)
    return tab
  }

  // pins

  pinsFor(space: ID): PinRecord[] {
    return this.pins.filter(p => p.everywhere || p.space === space)
  }

  pinTab(win: WindowRecord, id: ID): void {
    const tab = this.tabs.get(id)
    if (!tab || tab.pinID) return
    const pin: PinRecord = { id: randomUUID(), title: tab.title, home: tab.url, favicon: tab.favicon, space: win.space }
    this.pins.push(pin)
    this.updateTab(id, { pinID: pin.id, home: tab.url })
    this.savePins()
  }

  unpinTab(win: WindowRecord, id: ID): void {
    const tab = this.tabs.get(id)
    if (!tab?.pinID) return
    this.pins = this.pins.filter(p => p.id !== tab.pinID)
    this.updateTab(id, { pinID: undefined, home: undefined, letGo: Date.now() })
    this.savePins()
  }

  savePins(): void {
    writeJSON('pins.json', () => this.pins)
    this.touchAll(['pins'])
  }

  // spaces

  saveSpaces(): void {
    writeJSON('spaces.json', () => this.spaces)
    this.touchAll(['spaces'])
  }

  // sessions, as Session.swift writes them

  private sessionFile(space: ID): string {
    return space === firstSpaceID ? 'session.json' : `session-${space.toUpperCase()}.json`
  }

  saveSession(win: WindowRecord, space: ID): void {
    if (win.shy) return
    // Only the first window's tabs are the session, as on the Mac.
    if ([...this.windows.values()].find(w => !w.shy) !== win) return
    writeJSON(this.sessionFile(space), (): SessionShape => {
      const ids = this.spaceTabs(win, space).filter(id => {
        const t = this.tabs.get(id)
        return t && !t.shy && !t.empty && /^(https?|file|search):/.test(t.url)
      })
      const active = Math.max(0, ids.indexOf(win.active[space] ?? ''))
      return {
        tabs: ids.map(id => {
          const t = this.tabs.get(id)!
          const pin = t.pinID ? this.pins.find(p => p.id === t.pinID) : undefined
          return {
            url: t.url, title: t.title, name: t.name, muted: t.muted,
            pinID: t.pinID?.toUpperCase(), home: t.home, listed: pin?.listed,
            groupID: t.groupID?.toUpperCase(),
            touched: t.touched ? toAppleDate(t.touched) : undefined,
            letGo: t.letGo ? toAppleDate(t.letGo) : undefined,
          }
        }),
        active,
        groups: win.groups,
        splits: [],
      }
    })
  }

  private restoreSessions(win: WindowRecord): void {
    for (const space of this.spaces) {
      const shape = readJSON<SessionShape | null>(this.sessionFile(space.id), null)
      if (!shape?.tabs?.length) continue
      const ids: ID[] = []
      for (const e of shape.tabs) {
        const tab: TabRecord = {
          id: randomUUID(), url: e.url, title: e.title, name: e.name, muted: !!e.muted,
          loading: false, audible: false, asleep: true, empty: false, canGoBack: false, canGoForward: false,
          pinID: e.pinID?.toLowerCase(), home: e.home, listed: e.listed, groupID: e.groupID?.toLowerCase(),
          touched: e.touched != null ? fromAppleDate(e.touched) : undefined,
          letGo: e.letGo != null ? fromAppleDate(e.letGo) : undefined,
        }
        this.tabs.set(tab.id, tab)
        ids.push(tab.id)
      }
      win.tabs[space.id] = ids
      win.active[space.id] = ids[Math.min(shape.active, ids.length - 1)] ?? null
      if (shape.groups) win.groups.push(...shape.groups)
    }
  }

  // change notification

  touch(win: WindowRecord, slices: Slice[]): void {
    this.emit('window-changed', win.id, slices)
  }

  touchAll(slices: Slice[]): void {
    for (const win of this.windows.values()) this.touch(win, slices)
  }

  pinViews(win: WindowRecord): PinView[] {
    const open = new Map<ID, ID>()
    for (const id of this.spaceTabs(win)) { const t = this.tabs.get(id); if (t?.pinID) open.set(t.pinID, id) }
    return this.pinsFor(win.space).map(p => ({
      id: p.id, title: p.title, home: p.home, favicon: p.favicon, folder: p.folder,
      everywhere: p.everywhere, listed: p.listed, tabID: open.get(p.id),
    }))
  }
}

function pick<T extends object, K extends keyof T>(from: T, keys: K[]): Partial<T> {
  const out: Partial<T> = {}
  for (const k of keys) if (from[k] !== undefined) out[k] = from[k]
  return out
}

export const model = new Model()
model.setMaxListeners(100)

// What the main process tells a window's interface. The main process owns the
// model; each window's interface only draws the slice below and sends
// commands back (see commands.ts). Owned by the orchestrator: ask before
// changing it (see PIANO.md, "Regole per gli agenti paralleli").
//
// The slice travels as patches: { rev, set } where `set` holds whole
// top-level keys that changed. The interface merges each key with Solid's
// reconcile, so a tab that didn't change isn't drawn again.

export type ID = string

/** Where the window is drawn: Windows controls on the right, or the Mac's
 * lights on the left. Development on a Mac can force "windows". */
export type Chrome = 'windows' | 'mac'

export type Look = 'light' | 'dark'

export interface Rect { x: number; y: number; width: number; height: number }

export interface TabView {
  id: ID
  /** What the address shows: the page's, or the one being typed toward. */
  url: string
  title: string
  /** The name the user gave the tab, when there is one. */
  name?: string
  /** data: or https: icon of the site, when known. */
  favicon?: string
  loading: boolean
  audible: boolean
  muted: boolean
  /** No page in memory: it comes back on a click (Sleep.swift). */
  asleep: boolean
  /** Empty tab: nothing loaded yet, the field shows in the page's place. */
  empty: boolean
  canGoBack: boolean
  canGoForward: boolean
  crashed?: boolean
  error?: { code: number; description: string; url: string }
  /** Set when the tab is a pin (its identity in pins.json). */
  pinID?: ID
  /** A pin kept as a row instead of a square. */
  listed?: boolean
  groupID?: ID
  /** Private ("shy") tab: nothing kept. */
  shy?: boolean
  /** Internal page, search://<kind>. */
  internal?: string
  /** Camera, microphone or screen in use. */
  capturing?: boolean
}

export interface PinView {
  id: ID
  title: string
  /** The page it was pinned at. */
  home: string
  favicon?: string
  folder?: ID
  /** Pinned in every space. */
  everywhere?: boolean
  listed?: boolean
  /** The open tab wearing this pin in this window, if any. */
  tabID?: ID
}

export interface PinFolderView { id: ID; name: string; open: boolean; parent?: ID }

export interface GroupView { id: ID; name: string; colour: number; folded: boolean }

export interface SplitView { tabs: ID[]; axis: 'horizontal' | 'vertical'; sizes: number[]; focused?: ID }

export interface SpaceView {
  id: ID
  name: string
  /** Index in the space colours, 0 for none. */
  colour: number
  icon?: string
  profile?: ID
  sharesSignIns?: boolean
  gradient?: { colours: string[]; angle?: number }
  strength?: 'subtle' | 'rich' | 'vivid'
}

export interface Suggestion {
  kind: 'url' | 'search' | 'history' | 'bookmark' | 'tab' | 'command' | 'engine'
  title: string
  detail?: string
  url: string
  favicon?: string
  /** Switch to this open tab instead of opening the address. */
  tabID?: ID
}

export interface FieldState {
  open: boolean
  /** Where a committed address goes. */
  target: 'new' | 'here'
  text: string
  suggestions: Suggestion[]
  selected: number
  /** The field was refused (shake). Bumped each time. */
  refused: number
}

export interface SidebarState {
  /** Sidebar layout (the default) or tabs across the top. */
  layout: 'side' | 'top'
  width: number
  /** Folded away; comes out over the page with the pointer at the edge. */
  folded: boolean
  side: 'left' | 'right'
  /** Narrowed to a column of icons. */
  icons: boolean
}

export interface ExtensionActionView {
  id: ID
  name: string
  icon?: string
  badge?: { text: string; colour?: string }
  pinned: boolean
}

export interface DownloadView {
  id: ID
  name: string
  url: string
  received: number
  total: number
  state: 'progressing' | 'completed' | 'cancelled' | 'interrupted'
  path?: string
}

/** The interface's whole picture of one window. */
export interface WindowState {
  rev: number
  windowID: ID
  chrome: Chrome
  look: Look
  focused: boolean
  maximized: boolean
  fullScreen: boolean
  /** Width of the window's own buttons on the right (Windows), 0 on a Mac. */
  controlsWidth: number
  space: ID
  spaces: SpaceView[]
  /** The ordinary tabs of the space on screen, in order. Pins open as tabs
   * are in `tabs` too, with `pinID`. */
  tabs: TabView[]
  pins: PinView[]
  pinFolders: PinFolderView[]
  groups: GroupView[]
  splits: SplitView[]
  activeID: ID | null
  sidebar: SidebarState
  field: FieldState
  extensions: ExtensionActionView[]
  downloads: DownloadView[]
  prefs: Record<string, unknown>
}

export type WindowPatch = { rev: number; set: Partial<WindowState> }

/** The overlay view: what floats over the page right now. */
export type OverlayLayer =
  | { kind: 'none' }
  | { kind: 'field' }
  | { kind: 'switcher' }
  | { kind: 'menu'; items: MenuItem[]; at: { x: number; y: number }; source: string }
  | { kind: 'fold' }
  | { kind: 'panel'; name: string; data?: unknown }

export interface MenuItem {
  id?: string
  label?: string
  accelerator?: string
  enabled?: boolean
  checked?: boolean
  separator?: boolean
  submenu?: MenuItem[]
}

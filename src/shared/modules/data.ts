// The data module's commands and its part of the window's state: bookmarks,
// history, passwords, bringing things over from another browser (studio/05).
// Owned by the data module.

import type { ID, Rect } from '../state'

/** The app's name where the interface says it. TODO(brand): brand.name from
 * src/shared/brand.ts once main is merged. */
export const appName = 'Oriel'

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
type None = {}

/** A bookmark or a folder, as bookmarks.json keeps it on the Mac
 * (Bookmarks.swift: id, title, url?, children?). A folder has no url. */
export interface BookmarkNode {
  id: string
  title: string
  url?: string
  children?: BookmarkNode[]
}

/** One kept password as a list needs it: never the secret (Vault.Kept). */
export interface KeptLogin {
  host: string
  user: string
  /** Last used, ms since 1970. */
  used?: number
  /** Saved from a page sent over plain http. */
  clear?: boolean
}

/** The accounts hanging under a sign-in box (Browser.Suggesting). */
export interface FillList {
  tab: ID
  host: string
  accounts: KeptLogin[]
  /** The row the arrow keys are on, none until an arrow is pressed. */
  lit: number | null
  /** Hung from a first step's name box: a pick puts in the name alone. */
  nameOnly: boolean
  /** Where the list's rows start being the site's other hosts' accounts. */
  othersFrom: number | null
  domain: string
}

/** The question after a sign-in that took (PageQuestions.PasswordOffer). */
export interface SaveQuestion {
  tab: ID
  host: string
  user: string
  /** The account is kept with another password: Update. */
  changed: boolean
}

export interface ImportProfileView { id: string; name: string }

export interface ImportPreview {
  bookmarks: number
  places: number
  passwords: number
  /** Chromium on Windows: how many are readable (v10) and how many are
   * locked to their browser (v20, App-Bound Encryption). */
  passwordsReadable?: number
  passwordsLocked?: number
  extensions: string[]
  /** Extensions from another browser's own store (Opera's add-ons), by name:
   * not in the Chrome Web Store under the same id. */
  extensionsElsewhere?: string[]
}

export interface ImportSourceView {
  id: string
  name: string
  family: 'chromium' | 'gecko'
  profiles: ImportProfileView[]
  /** The profile used last, proposed first. */
  usual: string | null
  /** What the row under the name says it can bring. */
  canBring: string
  /** How passwords come from it: read here, only by its CSV, or not at all. */
  passwords: 'read' | 'consent' | 'csv' | 'none'
  /** Where it keeps its export, for the guided CSV steps. */
  exportAt?: string
  record?: ImportRecordView
}

export interface ImportRecordView { date: number; bookmarks: number; places: number; passwords: number; recorded: boolean }

export interface ImportSaid { ok: boolean; text: string }

/** Bring Things Over, as the panel draws it (ImportPanel.swift). */
export interface ImportPanelState {
  looking: boolean
  sources: ImportSourceView[]
  pick: string | null
  /** The profile chosen per source: a folder's name, '' for all. */
  chosen: Record<string, string>
  previews: Record<string, ImportPreview>
  wants: { passwords: boolean; bookmarks: boolean; history: boolean; extensions: boolean; replace: boolean }
  /** Said yes to reading this source's passwords on this PC. */
  consent: Record<string, boolean>
  bringing: boolean
  brought: ImportSaid[] | null
  /** The CSV steps are open for this source. */
  how: string | null
  /** A file just brought in that holds passwords in the clear. */
  clearFile?: string | null
}

/** One line of the bookmark button's list (BookmarkOutline.Shown): a site or
 * a folder at its depth, or the "Empty" under an open folder holding nothing. */
export interface BookmarkLine {
  id: string
  depth: number
  title: string
  url?: string
  folder: boolean
  open: boolean
  /** Sites in a folder, folders inside counted through. */
  count: number
  /** The site's icon (a data: URL), or null for its letter. */
  icon: string | null
  letter: string
  /** No name: it reads as its address, a shade lighter. */
  unnamed: boolean
  empty?: boolean
}

/** The card for one bookmark, as ⇧⌘B opens it off the button (BookmarkCard). */
export interface BookmarkCardView {
  id: string
  title: string
  /** What the lists read when the name is emptied: its address. */
  placeholder: string
  folder: string | null
  folderName: string
  folders: { id: string; title: string; depth: number }[]
}

/** A question the list asks in its place, from a row's right-click menu
 * (Bookmarks.askRename, askNewFolder, askRemove; Spaces.swift Ask). */
export interface BookmarkAskView {
  kind: 'rename' | 'folder' | 'remove'
  id: string
  folder: boolean
  /** The name it has (Rename…, Remove's question). */
  title: string
  /** What the field reads empty: its name or address, "Folder name". */
  placeholder: string
  /** Remove on a folder: the sites in it, counted through. */
  count: number
}

/** What hangs off the bookmark button (BookmarkDoor's popover): the list, or
 * the card, or a question. `rect` and `arrow` in window coordinates; the
 * overlay is the card's rect grown by `room` on every side, and with a row's
 * right-click menu up, on to the window's right and bottom edges. */
export interface BookmarksPopover {
  rect: Rect
  arrow: { side: 'top' | 'bottom' | 'left' | 'right'; at: number }
  room: number
  lines: BookmarkLine[]
  listHeight: number
  /** The page in front is kept: Edit This Bookmark… instead of Add This Page. */
  kept: boolean
  /** The page in front can be kept (a web page). */
  keepable: boolean
  card: BookmarkCardView | null
  ask: BookmarkAskView | null
  /** A row's right-click menu is up: the overlay reaches the window's edges. */
  menu: boolean
}

export interface DataState {
  /** The page in front is one of the bookmarks. */
  bookmarked: boolean
  fill: FillList | null
  save: SaveQuestion | null
  import: ImportPanelState | null
  /** The bookmark button's list or card, open in this window. */
  popover?: BookmarksPopover | null
  /** The bookmarks bar (Settings › Appearance › Show the bookmarks bar): the
   * top level, left to right; null while it is off. */
  bar?: BookmarkLine[] | null
}

declare module '../commands' {
  interface Commands {
    /** The icon kept for a page's site (a data: URL), or null: what a tab
     * shows before its page says its own (studio/01 §2.12). */
    'data.icon': { url: string; shy?: boolean }
    // bookmarks (studio/05 §3.2)
    'bookmark.add': { url?: string; title?: string; folder?: ID | null }
    'bookmark.toggle': { id?: ID }
    'bookmark.remove': { id: ID }
    'bookmark.move': { id: ID; folder: ID | null; index?: number }
    'bookmark.rename': { id: ID; title: string }
    'bookmark.folder': { title: string; parent?: ID | null }
    'bookmark.list': { query?: string }
    /** The bookmark button (BookmarkDoor, Browser.toggleBookmarks): its
     * list, opened or closed; `anchor` is the button in window coordinates. */
    'bookmark.popover': { anchor: Rect; folder?: ID }
    'bookmark.popoverClose': None
    /** A folder opened or closed in the button's list. */
    'bookmark.popoverFold': { id: ID }
    /** A bookmark picked in the list (Browser.pickBookmark): in the empty tab
     * in front or a new one in front; `newTab` behind, the list staying. */
    'bookmark.pick': { url: string; newTab?: boolean }
    /** ⇧⌘B, Add This Page, Edit This Bookmark… (Browser.bookmarkCurrent):
     * the page kept and the card off the button, or its card if kept. */
    'bookmarks.add': None
    /** A row's right-click menu in the list, up or put away (BookmarkOutline.Row
     * contextMenu): the overlay grows for it; the folders it can move to back. */
    'bookmark.menu': { open: boolean }
    /** Rename…, New Folder Inside…, Remove from that menu: the question in the
     * list's place; Remove on a bookmark or an empty folder goes at once. */
    'bookmark.ask': { id: ID; kind: 'rename' | 'folder' | 'remove' }
    /** The question answered (the name typed) or put away. */
    'bookmark.answer': { title?: string }
    'bookmark.askClose': None
    /** Move to in that menu (Bookmarks.move): the next page kept doesn't follow. */
    'bookmark.moveTo': { id: ID; folder: ID | null }
    // history (studio/05 §3.5)
    'history.list': { query?: string }
    'history.forget': { url: string }
    'history.clear': None
    // passwords (studio/05 §2)
    'passwords.list': { query?: string }
    'passwords.add': { host: string; user: string; password: string }
    'passwords.remove': { host: string; user: string }
    'passwords.removeAll': { query?: string }
    'passwords.reveal': { host: string; user: string }
    'passwords.copy': { host: string; user: string }
    'passwords.forgetNever': None
    'fill.pick': { index: number; byKey?: boolean }
    'fill.dismiss': None
    'save.answer': { answer: 'save' | 'notNow' | 'never' }
    // bringing things over (studio/05 §1)
    'import.open': { source?: string; extensions?: boolean }
    'import.close': None
    'import.pick': { source: string }
    'import.profile': { source: string; profile: string }
    'import.option': { key: 'passwords' | 'bookmarks' | 'history' | 'extensions' | 'replace'; on: boolean }
    'import.consent': { source: string; on: boolean }
    'import.how': { source: string | null }
    'import.run': None
    'import.file': { path?: string }
    'import.trashFile': { path: string }
  }
}

declare module '../state' {
  interface WindowState { data?: DataState }
}

export {}

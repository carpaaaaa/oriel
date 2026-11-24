// The settings module's commands and its part of the window's state:
// Settings and Oriel's other pages, site permissions, downloads (studio/06).
// Owned by the settings module.

import type { ID } from '../state'

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
type None = {}

/** What a site asks for (CaptureChoices.Kind, studio/06 §1.16). The key
 * suffix is the Mac's: 0 camera, 1 microphone, 2 both. */
export type PermissionKind = 'camera' | 'microphone' | 'cameraAndMicrophone' | 'location' | 'notifications'

/** The question rising from the page's foot (CaptureQuestion, 06 §2.6). */
export interface PermissionAsk {
  id: string
  tab: ID
  /** Who asks: the site's host, or an extension's name. */
  host: string
  /** "camera", "microphone", "camera and microphone", "location", "notifications". */
  wants: string
  /** Location: Allow once, with Always allow beside it unless private. */
  once: boolean
  keeps: boolean
  /** When it came up (ms): clicks in the first half second don't count. */
  shown: number
}

/** A saved answer, as Settings › Privacy lists them. */
export interface SavedPermission {
  origin: string
  kind: PermissionKind
  choice: 'allow' | 'refuse' | 'different'
  /** Saved under a default port's spelling (https://x:443). */
  alternativeSpelling: boolean
}

/** One download, as the list draws it (Recall.swift, Loot.swift). */
export interface DownloadEntry {
  id: ID
  name: string
  /** The page address it came from (never for a private tab). */
  url?: string
  /** Host it came from, for "<host> · <when>". */
  from: string
  path?: string
  received: number
  total: number
  state: 'downloading' | 'pausing' | 'paused' | 'resuming' | 'failed' | 'completed'
  canResume: boolean
  canRetry: boolean
  error?: string
  /** ms since 1970. */
  date: number
  /** Completed: the file is still where it was saved. */
  there?: boolean
}

/** A key as the page read it (KeyboardEvent). */
export interface KeyPress { key: string; code: string; ctrl: boolean; shift: boolean; alt: boolean; meta: boolean; altGraph?: boolean }

/** One command in Settings › Shortcuts, its key as Windows writes it. */
export interface ShortcutLine {
  id: string
  title: string
  /** Its key now, or null for none. */
  key: string | null
  /** Windows' other keys for it (Close Tab: Ctrl+F4 too). */
  also: string[]
  changed: boolean
  /** Shown, not changed here. */
  fixed?: boolean
  /** The extension a command comes from. */
  detail?: string
}

export interface ShortcutsView {
  sections: { name: string; lines: ShortcutLine[] }[]
  /** The tab numbers' line, in Tabs. */
  numbers: { keys: string; note: string }
  extensions: ShortcutLine[]
  /** Keys that are always these (keys.ts's fixed ones). */
  fixed: ShortcutLine[]
  /** Something to reset: a key changed, or the peek's click. */
  changed: boolean
}

export interface SettingsState {
  asking: PermissionAsk | null
  /** The downloads card floating by the button. */
  downloadsOpen: boolean
  /** Something is coming in, or the list holds something, or Always show. */
  downloadsButton: boolean
  /** Fraction of what is coming in, null when unknown, -1 when nothing. */
  downloadsProgress: number | null
  /** Bumped when a download starts: the button swells (Fetching.swift:745). */
  downloadsStarted: number
  /** The update popup in this window, at launch (updates.dismissed puts it away). */
  update?: { version: string; notes?: string; ready: boolean; fetching: boolean } | null
}

declare module '../commands' {
  interface Commands {
    // Settings (studio/06 §1)
    'settings.open': { page?: string; find?: string }
    'settings.values': None
    /** A row's control: a key, or a merged row (tabs.layout, tabs.sleep...). */
    'settings.set': { id: string; value: unknown }
    /** A row's button (Make default, Clear, Set Up...). */
    'settings.do': { id: string; arg?: unknown }
    // Oriel's own pages
    'internal.open': { url: string }
    /** A part of the window's state, for an Oriel page allowed to read it (allowPage). */
    'internal.state': { slice: string }
    // site permissions (06 §2.6)
    'permission.answer': { answer: 'allow' | 'once' | 'always' | 'deny' }
    'permission.list': None
    'permission.set': { origin: string; kind: PermissionKind; value: boolean | null }
    'permission.forget': None
    // downloads (06 §3)
    'download.list': None
    'download.pause': { id: ID }
    'download.resume': { id: ID }
    'download.retry': { id: ID }
    'download.remove': { id: ID }
    'download.clear': None
    'download.copy': { id: ID }
    'download.folder': None
    // updates (06 §4) and What's New
    'update.check': None
    'update.install': None
    'update.relaunch': None
    'update.state': None
    'update.notes': None
    /** The popup's X: not again for this version (updates.dismissed). */
    'update.dismiss': None
    /** Update and Restart: fetched, put in place, opened. */
    'update.now': None
    // keys.ts's table: Settings… (Ctrl+,), Passwords… (Alt+Shift+L),
    // Show History… (Ctrl+H), Downloads… (Ctrl+J), Clear Browsing Data…
    'app.settings': None
    'app.passwords': None
    'history.show': None
    'history.clearData': None
    /** Where Settings › Open Downloads says; the button toggles (Browser.showDownloads). */
    'downloads.show': { toggle?: boolean; anchor?: { x: number; y: number } }
    // Keyboard & Mouse › Shortcuts (ShortcutsPage.swift, studio/03 §4.2)
    'settings.shortcuts': None
    /** A key pressed in a command's box; `again`: the key pressed once
     * already, another command's, which now moves here. */
    'settings.shortcutKey': { id: string; chord: KeyPress; again?: string }
    'settings.shortcutClear': { id: string }
    'settings.shortcutReset': { id: string }
    'settings.shortcutResetAll': None
    /** A box is reading a key: Oriel's own keys stand aside for this page. */
    'settings.recordKeys': { on: boolean }
  }
}

declare module '../state' {
  interface WindowState { settings?: SettingsState }
}

export {}

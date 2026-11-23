// The extensions module's commands and its part of the window's state: the
// puzzle button and the pinned buttons, their list, the popup, the side
// panel and the page that manages extensions (studio/04 §2).
// Owned by the extensions module.

import type { ID, Rect } from '../state'

/** One installed extension as the interface draws it. */
export interface ExtView {
  id: string
  name: string
  version: string
  /** crx://extension-icon/... for the tab in front; none for a disabled one. */
  icon: string | null
  enabled: boolean
  pinned: boolean
  /** It has a button (action or browser_action). */
  action: boolean
  title: string
  badge: { text: string; colour?: string } | null
  /** From the Chrome Web Store, or a folder (Load Unpacked). */
  fromStore: boolean
  folder?: string
  options: boolean
  /** Couldn't start, or can't do what it's for. */
  problem?: string
}

export interface ExtState {
  /** Installed, in the order they were added. */
  list: ExtView[]
  /** The puzzle's list is open, hanging from this rectangle. */
  menu: { anchor: Rect } | null
  /** A popup is open in this window: where its page sits. */
  popup: { id: string; rect: Rect; arrow: { side: 'top' | 'bottom' | 'left' | 'right'; at: number } } | null
  /** Being installed (ids). */
  busy: string[]
  /** The last thing said about installing or removing. */
  said: { text: string; bad?: boolean } | null
  /** The page that manages extensions is open. */
  manage: boolean
  /** The side panel of an extension, beside the page. */
  panel: { id: string; side: 'left' | 'right'; width: number } | null
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
type None = {}

declare module '../commands' {
  interface Commands {
    /** The puzzle: open or close its list (studio/04 §2.3). */
    'ext.menu': { anchor: Rect }
    'ext.menuClose': None
    /** An extension's button: its popup, its side panel or action.onClicked. */
    'ext.press': { id: string; anchor?: Rect }
    'ext.popupClose': None
    'ext.pin': { id: string; pinned: boolean }
    /** Right click on a button or a row of the list. */
    'ext.context': { id: string; x: number; y: number }
    'ext.options': { id: string }
    'ext.remove': { id: string; ask?: boolean }
    'ext.enable': { id: string; on: boolean }
    /** A link to the Chrome Web Store or an id (studio/04 §2.2, 3). */
    'ext.install': { text: string }
    'ext.store': None
    'ext.loadUnpacked': { path?: string }
    'ext.reload': { id: string }
    'ext.manage': { open: boolean }
    'ext.panelClose': None
    'ext.panelWidth': { width: number }
  }
}

declare module '../state' {
  interface WindowState { ext?: ExtState }
}

export type { ID }
export {}

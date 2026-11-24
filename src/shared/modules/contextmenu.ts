// The page's own right-click menu (studio/01 §2.48, §3.38; studio/06 §2.3,
// §5.2, §5.3): Electron has none, so Oriel builds it in the main process from
// the page's context-menu params and draws it in the overlay, as the tabs'
// menus are drawn (ui/menus/Menu.tsx). Owned by the contextmenu module.

import type { ID } from '../state'
import type { Command } from '../commands'

/** The overlay layer's name: { kind: 'panel', name: CTX_MENU, data: PageMenuData }. */
export const CTX_MENU = 'ctx.menu'

/** One row, in the shape ui/menus/Menu draws (its Entry). */
export interface PageMenuEntry {
  label?: string
  act?: { cmd: Command }
  enabled?: boolean
  checked?: boolean
  /** The key, grey at the end ("Ctrl+C"). */
  accel?: string
  submenu?: PageMenuEntry[]
  separator?: boolean
}

export interface PageMenuData {
  entries: PageMenuEntry[]
  /** The click, in the window's coordinates. */
  at: { x: number; y: number }
  /** The window's visible size: the menu stays inside it. */
  room: { w: number; h: number }
  /** What was under the click: 'editable', 'link', 'image', 'selection', 'page'... */
  context: string[]
  seq: number
}

/** Where a link opens from the menu (§3.38). */
export type OpenWhere = 'tab' | 'window' | 'private' | 'split'

declare module '../commands' {
  interface Commands {
    /** Open Link/Image in New Tab (behind, after its page), New Window,
     * Private Window, Split View (§3.38, 06 §5.3). */
    'ctx.open': { url: string; where: OpenWhere; from?: ID }
    /** Copy Link, Copy Clean Link (CleanLink.swift, 06 §2.3), Copy Image
     * Address, Copy Link to Highlight, Copy Email Address. */
    'ctx.copy': { text: string; clean?: boolean }
    /** Search "words" with the chosen engine, or the one named (Search With);
     * `image`: the picture's address to Google Lens or Bing. */
    'ctx.search': { text: string; engine?: string; image?: boolean; from?: ID }
    /** The page's own editing, as Chromium does it for the focused frame. */
    'ctx.edit': { id: ID; action: 'undo' | 'redo' | 'cut' | 'copy' | 'paste' | 'pasteAndMatchStyle' | 'selectAll' }
    /** A spelling guess put in, or the word added to the dictionary. */
    'ctx.spell': { id: ID; replace?: string; learn?: string }
    /** Windows' emoji panel (Win+.), for the field with the caret. */
    'ctx.emoji': { id: ID }
    /** Copy Image: the picture under the click, as an image (06 §5.3). */
    'ctx.copyImage': { id: ID; x: number; y: number }
    /** Download Linked File (straight to Downloads), or Save Image As… /
     * Save Video As… (`ask`: Windows' Save dialog first). */
    'ctx.save': { id: ID; url: string; ask?: boolean }
    /** Save Page As…, Print…, View Page Source, Inspect (06 §5.2). */
    'ctx.page': { id: ID; action: 'save' | 'print' | 'source' | 'inspect'; x?: number; y?: number }
    /** An extension's item (chrome.contextMenus), by the key it had in the menu. */
    'ctx.extension': { key: string }
    /** The menu is gone; `refocus` gives the page its keys back, `at` (a
     * right click outside it) opens the page's menu there instead. `seq`:
     * only that menu (a late close never takes a newer one away). */
    'ctx.close': { refocus?: boolean; at?: { x: number; y: number }; seq?: number }
  }
}

export {}

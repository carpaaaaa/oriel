// The field module's commands and state (studio/03 §1, §4, §6.1).

import type { ID } from '../state'

/** What Return in the field does, said by its placeholder (studio/03 §1.1). */
export type FieldMode = 'blank' | 'newTab' | 'thisTab' | 'switcher'

/** A site whose search the field offers, or that Tab put in it (§1.9). */
export interface SiteView { name: string; host: string; icon?: string }

/** The Mac's own kinds of row (Suggestion.Kind), for how a row is drawn. */
export type RowKind = 'visited' | 'known' | 'bookmark' | 'open' | 'search' | 'suggested' | 'searched' | 'command'

export interface FindState {
  open: boolean
  text: string
  matchCase: boolean
  wholeWords: boolean
  /** "3 of 17", "No matches"... or null while nothing is asked. */
  status: string | null
  missed: boolean
  /** Bumped when the find field should take the keys and select all. */
  focus: number
}

/** The address being typed in the tab itself (Browser.editingTab, tabDraft,
 * tabOffers, tabPicked). */
export interface TabEditState {
  id: ID
  /** What the field in the tab is to show when `sync` moves. */
  shown: string
  offers: import('../state').Suggestion[]
  selected: number
  sync: number
  /** Bumped when Return found nowhere to go: the tab shakes. */
  refused: number
}

declare module '../state' {
  interface Suggestion {
    /** The Mac's kind, finer than `kind`. */
    how?: RowKind
    /** A pin open as this row's tab. */
    pinned?: boolean
  }
  interface FieldState {
    mode?: FieldMode
    /** The rest of the address the field is finishing, grey and selected. */
    ending?: string | null
    /** What the field shows: what was typed, the row walked to, or the
     * completion. The interface writes it into its input when `sync` moves. */
    shown?: string
    /** Bumped when the main process changed the text (not by typing). */
    sync?: number
    /** Bumped when the field should take the keys. */
    focus?: number
    /** Where the selection starts after a sync; null selects everything. */
    selectFrom?: number | null
    /** "Search Reddit", first in the list, Tab away. */
    offer?: SiteView | null
    /** The site Tab put in the field. */
    chip?: SiteView | null
    /** ⌘K's quiet line when it has no page to offer. */
    note?: string | null
    placeholder?: string
    label?: string
    /** Over a page, centred on the whole window and 24% down (Settings ›
     * The field in the middle of the window, Omnibox.swift:68-71). */
    high?: boolean
    /** The field is the address line's, in its row and not over the page; its
     * places hang under the row (studio/03 §1.6, AddressLine.swift). */
    inline?: boolean
    /** Bumped when the menu of the field over the page is to close (Escape). */
    menuClose?: number
  }
  interface WindowState {
    /** Sent by the field module (registerSlice), so optional here. */
    find?: FindState
    /** The address typed in the tab itself, or null. */
    tabEdit?: TabEditState | null
  }
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
type None = {}

declare module '../commands' {
  interface Commands {
    /** ⌘K: the field as a switcher of open tabs (§1.5). */
    'field.summon': None
    /** Tab and Shift+Tab in the field (§1.4, §1.9). */
    'field.tab': { back?: boolean }
    /** Escape in the field or over the page (§4.4 point 6). Returns whether it did something. */
    'field.escape': None
    /** Backspace on an empty field: the site chip goes. */
    'field.unchip': None
    /** The "Search Reddit" row clicked. */
    'field.lock': None
    /** A row clicked (not walked to). */
    'field.take': { index: number }
    /** The interface's input has the keys: keys held for it are let go. */
    'field.focused': None
    /** Find on Page (§6.1). */
    'find.open': None
    'find.close': None
    'find.input': { text: string }
    'find.step': { forward: boolean }
    'find.options': { matchCase?: boolean; wholeWords?: boolean }
    /** The find bar's options menu, at a point of the overlay. */
    'find.menu': { x: number; y: number }
  }
}

declare module '../commands' {
  interface Commands {
    /** A key typed in the field: answers with the ending to show, grey and
     * selected after the caret. `deleting`: a deleting key, which never gets
     * an ending back (Omnibox.swift:683-686). */
    'field.type': { text: string; deleting?: boolean }
    /** Return. `text`: what the input shows, to catch a key typed before the
     * last answer came. `newTab`: Alt+Return, a new tab behind; with `front`
     * (Alt+Shift+Return) in front (§1.4, §13.2). */
    'field.submit': { text?: string; newTab?: boolean; front?: boolean }
    /** Shift+Return: what was typed, as it is, to the Shift-Return engine;
     * Return when none is chosen (§1.4). */
    'field.shiftSubmit': { text?: string }
    /** The address in the tab itself (studio/01 §5.18). */
    'field.editTab': { id: ID }
    'field.tabType': { text: string; deleting?: boolean }
    'field.tabMove': { by: number }
    'field.tabCommit': { text?: string }
    'field.tabCancel': None
    'field.tabTake': { index: number }
    'field.tabAnchor': { rect: { x: number; y: number; width: number; height: number } }
    'field.tabBlur': { text?: string }
    /** A click on the address line (studio/03 §1.6): ⌘L's field, in place. */
    'field.line': None
    /** The line's place in the interface, for its places to hang under. */
    'field.lineAnchor': { rect: { x: number; y: number; width: number; height: number } }
    /** The line's field let go of the keys: a click elsewhere puts it away. */
    'field.lineBlur': None
    /** An address field's right-click menu (Search 1.0.22): the website's
     * address on the clipboard, for Paste and Go, or null. */
    'field.clip': None
    /** Paste and Go: the clipboard's website, from the window's field or the
     * address in the tab (`tab`). */
    'field.pasteGo': { where?: 'field' | 'tab' }
    /** An editing row of the menu, done in the view whose field it is. */
    'field.edit': { action: 'undo' | 'redo' | 'cut' | 'copy' | 'paste' | 'selectAll'; where: 'ui' | 'overlay' }
    /** The field over the page has its menu up: Escape closes the menu first. */
    'field.menuUp': { up: boolean }
    /** The keys back to the interface, to its field, once a menu is gone. */
    'field.focusUI': None
  }
}

export type { ID }

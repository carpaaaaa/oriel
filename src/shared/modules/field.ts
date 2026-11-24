// The field module's commands and state (studio/03 §1, §4, §6.1).

import type { ID } from '../state'

/** The sites the field can search with Tab (SiteSearch.swift:34-55), in the
 * Mac's order. Unlike the Mac, each is off until turned on in Settings ›
 * Browsing › Site shortcuts (the user's decision): `search.sites` lists
 * the names turned on. */
export const searchSiteList: { name: string; host: string }[] = [
  { name: 'Google', host: 'google.com' }, { name: 'Reddit', host: 'reddit.com' }, { name: 'YouTube', host: 'youtube.com' },
  { name: 'X', host: 'x.com' }, { name: 'ChatGPT', host: 'chatgpt.com' }, { name: 'Claude', host: 'claude.ai' },
  { name: 'Perplexity', host: 'perplexity.ai' }, { name: 'Wikipedia', host: 'wikipedia.org' }, { name: 'GitHub', host: 'github.com' },
  { name: 'Stack Overflow', host: 'stackoverflow.com' }, { name: 'MDN', host: 'developer.mozilla.org' }, { name: 'Amazon', host: 'amazon' },
  { name: 'Google Maps', host: 'google.com/maps' }, { name: 'IMDb', host: 'imdb.com' }, { name: 'Spotify', host: 'open.spotify.com' },
  { name: 'Figma Community', host: 'figma.com/community' },
]

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
  }
}

export type { ID }

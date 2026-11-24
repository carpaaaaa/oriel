// Hide Elements (studio/01 §10.38-§10.41; Curtain.swift, Hidden.swift): what
// you point at goes, and stays gone on that site. Owned by the hide module.

import type { ID } from '../state'

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
type None = {}

/** One thing taken off a site (Curtain.swift Veil). */
export interface Veil {
  selector: string
  /** What it was, in words ("Navigation", "We use cookies OK"). */
  label: string
  /** Its size and corner when it was hidden ("1280×120 · bottom centre"). */
  note?: string
  /** Seconds since 1 January 2001, as the Mac writes hidden.json. */
  date: number
}

/** The overlay's panel names. */
export const HIDE_BAR = 'hide.bar'
export const HIDE_LIST = 'hide.list'

/** The line at the page's foot: the hint while pointing, and what was said. */
export interface HideBarData {
  hint: string | null
  said: string | null
  /** Changes with every announcement, so the same words rise again. */
  n: number
}

/** Hidden on This Site… (HiddenPanel). */
export interface HideListData {
  /** The site, or "This page". */
  title: string
  veils: { selector: string; label: string; note?: string }[]
  /** Where the card sits in the window: from the top and from the right. */
  at: { top: number; right: number }
  /** Hide Elements…'s key now, for the pill's help ("Ctrl+Shift+H"). */
  key: string | null
}

declare module '../commands' {
  interface Commands {
    /** Hide Elements… (Ctrl+Shift+H): pointing on in the tab in front, or off. */
    'view.hide': None
    /** Hidden on This Site… (Ctrl+Shift+U): the list, or away. */
    'view.hidden': None
    /** The page menu's Hide Element: what is under the right click, at
     * once (the page's own coordinates, as the menu got them). */
    'hide.element': { id: ID; x: number; y: number }
    /** A row of the list: back on the page for good. */
    'hide.restore': { selector: string }
    'hide.restoreAll': None
    /** The pointer resting on a row: that one thing shown, outlined. */
    'hide.peek': { selector: string }
    'hide.unpeek': None
    'hide.close': None
    /** The line at the foot measured itself: the overlay is made that size. */
    'hide.barSize': { width: number; height: number }
    /** A press on the line: the keys back to the page, for ↑ and ↓. */
    'hide.focus': None
  }
}

export {}

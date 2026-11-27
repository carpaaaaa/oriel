// The pages module's commands and its part of the window's state (studio/08
// area C: video, pages, reading, blocking, mouse, developer). Owned by the
// pages module.

import type { ID, Rect } from '../state'

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
type None = {}

/** A peek over the page (Peek.swift, studio/01 §10.19-§10.22). */
export interface PeekState {
  /** The tab it was opened from. */
  from: ID
  url: string
  title: string
  loading: boolean
  /** Shown: with Peek stays with its tab, hidden while that tab is away. */
  shown: boolean
  /** Where the panel's page is, in the overlay (the source page's rect). */
  panel: Rect
  /** Split View is there: the knob that keeps it beside the page. */
  beside: boolean
}

/** The floating video (Float.swift, studio/06 §3.5). */
export interface FloatState {
  tab: ID
  tucked: boolean
}

/** What a tab's menu offers for its site, as the Mac's site card does
 * (Search 1.0.22): by the tabs of the window's space. */
export interface SiteTools {
  /** Developer Mode (DevMode.swift): on or off, for every http(s) page. */
  dev: Record<ID, boolean>
  /** Developer Mode's key now ("Shift+F12"), shown at the item's end. */
  devKey: string | null
  /** Don't Float Videos Here: ticked or not, only where it is offered. */
  nofloat: Record<ID, boolean>
}

declare module '../commands' {
  interface Commands {
    // Peek (studio/01 §10.21, §10.22)
    'pages.peek.close': { id?: ID }
    'pages.peek.keep': { beside?: boolean }
    // View menu (keys.ts's table: Float Video, Capture…, Edit Site Style…)
    'view.float': { id?: ID }
    'view.capture': { mode?: 'area' | 'element' | 'page'; rect?: Rect }
    'view.style': { id?: ID }
    'view.reader': None
    // Edit Site Style… (SiteStyles.swift)
    'pages.style.set': { host: string; css: string }
    'pages.style.close': None
    // The floating window's buttons (Float.swift Controls)
    'pages.float.land': None
    'pages.float.close': None
    'pages.float.toggle': None
    'pages.float.skip': { seconds: number }
    'pages.float.tuck': None
    // Block Ads and Trackers for one site (Shield.pause; the Mac's site card,
    // Oriel's tab menu): the page reloads.
    'pages.shield.site': { id: ID; on: boolean }
    /** A tab's menu › Allow Copying on This Site, or off again (copy.sites). */
    'pages.copy.site': { id: ID; on: boolean }
    /** A tab's menu › Don't Float Videos Here, or off again (nofloat.<host>, Search 1.0.22). */
    'pages.nofloat': { id: ID; on: boolean }
    /** Web Inspector (F12, Ctrl+Shift+I): Chromium's Developer Tools for the page in front, or away. */
    'view.inspector': { id?: ID }
    /** Developer Mode for the site in front, or the tab's (Search 1.0.22, Shift+F12). */
    'view.developerMode': { id?: ID }
  }
}

declare module '../state' {
  interface WindowState {
    peek?: PeekState | null
    float?: FloatState | null
    siteTools?: SiteTools | null
  }
}

export {}

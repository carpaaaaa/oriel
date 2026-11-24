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
  style: 'search' | 'system'
  tucked: boolean
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
    // Edit Site Style… (SiteStyles.swift)
    'pages.style.set': { host: string; css: string }
    'pages.style.close': None
    // The floating window's buttons (Float.swift Controls)
    'pages.float.land': None
    'pages.float.close': None
    'pages.float.toggle': None
    'pages.float.skip': { seconds: number }
    'pages.float.tuck': None
  }
}

declare module '../state' {
  interface WindowState {
    peek?: PeekState | null
    float?: FloatState | null
  }
}

export {}

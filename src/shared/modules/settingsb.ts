// Commands and state of Settings' area B (studio/08 B): tabs, spaces, pins,
// links and the app. Owned by the tabs module.

import type { ID } from '../state'

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
type None = {}

declare module '../commands' {
  interface Commands {
    /** Quit Oriel, asking first with Confirm before quitting. */
    'app.quit': None
    /** A pin's ⌘-click: a new tab with pins.commandNewTab, picked otherwise. */
    'pin.commandClick': { id: ID }
    /** History › Archived Tabs… (oriel://archive) and its page's commands. */
    'history.archive': None
    'archive.list': { query?: string }
    'archive.reopen': { id: ID }
    'archive.remove': { id: ID }
    'archive.clear': None
    /** A link from another app (Links.take): where the rows send it. */
    'link.arrive': { url: string; sender?: string }
    /** Ask which space: the space chosen, and Always for its site. */
    'link.choose': { space: ID; always?: boolean }
    'link.cancel': None
    /** Always Open <site> in <space>, Stop Opening (space null). */
    'spaces.route': { url: string; space: ID | null }
    /** A space's ready-made gradient (Sunrise, Lagoon...) and how strong it washes (§7.7). */
    'space.gradient': { id: ID; preset: string }
    'space.strength': { id: ID; strength: 'subtle' | 'rich' | 'vivid' }
    /** Keep This Site Awake, from a tab's menu. */
    'tab.keepAwake': { id: ID; on: boolean }
  }
}

declare module '../state' {
  interface WindowState {
    /** The Home bookmarks a blank tab shows, with home.grid on (HomeGrid.swift). */
    homeSites?: { id: ID; title: string; url: string }[]
  }
  interface TabView {
    /** A private tab's own Keep This Site Awake (an ordinary tab's is in
     * the prefs, tabs.awakeSites). */
    awake?: boolean
  }
}

export {}

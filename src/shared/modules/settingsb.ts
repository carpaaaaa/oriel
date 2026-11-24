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
    /** Keep This Site Awake, from a tab's menu. */
    'tab.keepAwake': { id: ID; on: boolean }
  }
}

declare module '../state' {
  interface TabView {
    /** A private tab's own Keep This Site Awake (an ordinary tab's is in
     * the prefs, tabs.awakeSites). */
    awake?: boolean
  }
}

export {}

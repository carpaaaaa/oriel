// The tabs module's commands and state, beside the skeleton's (studio/01
// §2, §3, §6, §7, §9). Owned by the tabs module.

import type { ID } from '../state'

declare module '../commands' {
  interface Commands {
    // tabs (§3)
    /** ⌘T's tab: an empty one reused, or made (§3.1). */
    'tab.blank': {}
    /** ⇧⌘N: a private tab, its own store (§3.7). */
    'tab.newPrivate': {}
    /** Open an address the way Browser.open does (§3.39). */
    'tab.open': { url: string; foreground?: boolean; from?: ID; link?: boolean; atEnd?: boolean; mayWait?: boolean; loose?: boolean }
    /** ⌘W: what is in front, the picked tabs, or the tab (§3.10). */
    'tab.closeFront': {}
    'tab.closeOthers': { id: ID }
    'tab.closeBelow': { id: ID }
    /** Close Tabs with tabs picked, or any list: one ⇧⌘T brings them back (§3.19). */
    'tab.closeMany': { ids: ID[] }
    /** ⌘-click, ⇧-click on a tab (§3.18). */
    'tab.pick': { id: ID; mode: 'toggle' | 'range' | 'addRange' | 'clear' }
    /** ⌘1-⌘9 (§3.22): 1-8 a place, 9 the last. */
    'tab.nth': { n: number }
    /** ⇧⌘] ⇧⌘[ (§3.24). */
    'tab.step': { by: 1 | -1 }
    /** ⌃Tab: the cards, the second picked; again moves on; done on release (§3.25-3.27). */
    'tab.switch': { by: 1 | -1 }
    'tab.switchEnd': { cancel?: boolean }
    /** Put to Sleep, as the tab menu asks: the reason it stays awake, if any (§9.29). */
    'tab.putToSleep': { id: ID }
    /** Try again on a page that didn't load or kept crashing (§2.32, §2.33). */
    'tab.tryAgain': { id: ID }
    'tab.reopenGhost': { id: ID }
    /** Move to Group (null: Remove from Group) (§6.34, §6.41). */
    'tab.group': { ids: ID[]; group: ID | null }
    /** Move to Space (§7.31). */
    'tab.toSpace': { ids: ID[]; space: ID }
    // pins (§6)
    'tab.pinRow': { id: ID }
    'pin.listed': { id: ID; listed: boolean }
    'pin.letter': { id: ID; letter: string }
    'pin.rehome': { id: ID }
    'pin.share': { id: ID; everywhere: boolean }
    'pin.folder': { id: ID; folder: ID | null }
    'pinFolder.new': { pin?: ID; parent?: ID | null; name?: string }
    'pinFolder.rename': { id: ID; name: string }
    'pinFolder.fold': { id: ID; folded?: boolean }
    'pinFolder.delete': { id: ID }
    'pinFolder.move': { id: ID; parent: ID | null }
    // groups (§6.34-6.41)
    'group.new': { ids: ID[] }
    'group.rename': { id: ID; name: string }
    'group.colour': { id: ID; colour: number }
    'group.fold': { id: ID; folded?: boolean }
    'group.foldAll': { folded: boolean }
    'group.ungroup': { id: ID }
    'group.close': { id: ID }
    'group.newTab': { id: ID }
    'group.toSpace': { id: ID; space: ID }
    // spaces (§7)
    'space.create': { name: string; icon?: string; signedOut?: boolean; moving?: ID[] }
    'space.rename': { id: ID; name: string }
    'space.icon': { id: ID; icon: string }
    'space.colour': { id: ID; colour: number }
    'space.order': { id: ID; by: 1 | -1 }
    'space.delete': { id: ID }
    /** The player at the column's foot (Player.swift): pause what plays in a
     * tab out of sight, remembered, or play again what it paused. */
    'tab.media': { id: ID; play: boolean }
    // drawn menus (studio/02 §4.6; studio/01 §4.35-§4.37, §6.25, §7.12)
    /** A drawn menu (`entries`) or popover (`panel`) over the page: the main
     * process raises the overlay over the window with the keys, as the
     * layer { kind: 'panel', name: 'tabs.menu', data }. `room` is the
     * window's size as its interface measures it. */
    'menu.open': { entries?: unknown[]; panel?: string; data?: unknown; at: { x: number; y: number }; source?: string; room: { w: number; h: number } }
    /** The menu or popover is gone; `refocus` gives the keys back to the page. */
    'menu.close': { refocus?: boolean }
  }
}

declare module '../state' {
  interface WindowState {
    /** Ctrl held with Settings › Show tab numbers while Ctrl is held: the
     * number Ctrl+1-9 gives each tab (TabShortcutHint.swift), else null. */
    tabHints?: Record<ID, number> | null
  }
  interface TabView {
    /** What the tab says, in Tab.label's order (§2.8). */
    label?: string
    /** Its page let go: a pin put down, a grouped tab put away (§6.7, §6.39). */
    resting?: boolean
    /** The tab a page opened this one from (target=_blank, window.open). */
    opener?: ID
  }
  interface PinView {
    letter?: string
    name?: string
  }
  interface PinFolderView {
    depth?: number
    live?: boolean
  }
  // Optional, so an interface built against the skeleton's state still holds.
  interface WindowState {
    /** Tabs picked with ⌘- or ⇧-click (§3.18). */
    picked?: ID[]
    /** ⇧⌘T's title, "Reopen Closed Tab" or "Reopen 3 Closed Tabs", and
     * History › Recently Closed (§9.17). */
    reopen?: { title: string; can: boolean; recent: { id: ID; title: string; url: string }[] }
    /** ⌃Tab's cards while ⌃ is held, the picked one at `index` (§3.25). */
    switcher?: { cards: ID[]; index: number } | null
    /** Spaces on (Settings › Spaces & Pins › Spaces, §7.1). */
    spacesOn?: boolean
  }
}

export {}

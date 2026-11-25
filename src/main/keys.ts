// Keyboard shortcuts on Windows (studio/03 §4, §13; studio/01 §1.43).
//
// ⌘ becomes Ctrl; the spaces' ⌃1-9 move to Alt+1-9 so they don't fight the
// tabs' Ctrl+1-9; Windows' own habits that don't collide are added (Ctrl+F4,
// Ctrl+PageUp/PageDown, Alt+F4, F5, F6, Alt+D, F3, F11, F12, Alt+Left/Right).
// Letters are read by the character they type (event.key, or the key's place
// on a layout that doesn't type Latin), digits and punctuation by the key's
// place (event.code), and Ctrl+Alt is never a shortcut: on European layouts
// it is AltGr, which types [ ] @ € ł ń. So no shortcut here uses Ctrl+Alt;
// where the Mac has ⌥⌘ Windows gets Alt+Shift, a function key, or none.
//
// "first" keys are Search's before the page sees them (Chrome keeps the same
// ones, and the Mac's pageFirst never gives them: ⌘T ⌘W ⌘K ⇧⌘N ⇧⌘[ ⇧⌘]
// ⌘1-9); "later" ones only when the page leaves them alone (studio/03 §4.4
// point 19). An action answers `false` to leave the key where it was going.
//
// The table is Command.all (Shortcuts.swift:207-358) in its order, every
// command, with a key or without; the keys changed in Settings are kept as
// differences only, under `shortcuts` (§4.1).

import type { WebContents } from 'electron'
import { handled, run } from './router'
import type { Command } from '../shared/commands'
import type { WindowController } from './views/window'
import { model } from './model/model'
import { addDefaults } from '../shared/prefs'
import { controlUp, edit, escape as fieldEscape, fieldShowing, holdKey, launch, mem, putAway, searchTabsKey } from './field/commands'
import { closeFind, findIsOpen, openFind, step as findStep } from './field/find'
import { cancelTabEdit, tabEditing } from './field/tabedit'

export interface Chord { ctrl: boolean; shift: boolean; alt: boolean; meta: boolean; key: string; code: string; altGraph?: boolean }

export interface KeyContext {
  /** The key came from a page (false: the interface or the overlay). */
  fromPage: boolean
  repeat: boolean
  /** The chord pressed, as chordName spells it (a command's own key or one
   * given to it in Settings › Shortcuts). */
  chord?: string
}

/** A command to run, true for "taken" (done here), false to leave the key. */
export type Action = (c: WindowController, k: KeyContext) => Command | boolean | null | void

export type Section = 'Search' | 'File' | 'Edit' | 'View' | 'Tabs' | 'Spaces' | 'Profiles' | 'Bookmarks' | 'History' | 'Fixed'

export interface Binding {
  /** The Mac's command id (Command.all), or a name for a fixed key. */
  id: string
  title: string
  section: Section
  /** The Mac's key, for the record ('' for none). */
  mac: string
  /** Windows chords as chordName writes them; empty for none. */
  keys: string[]
  phase: 'first' | 'later'
  action?: Action
  /** The command another module is to add; the key is live once it exists. */
  needs?: Command
  /** Held down, it does nothing more (⌘T, ⌘L: their repeats would toggle). */
  once?: boolean
  /** Fixed: not changeable in Settings (the Mac's ⌘Q, ⌃⌘F, tab numbers, Esc). */
  fixed?: boolean
}

const activeID = (c: WindowController) => c.record.active[c.record.space] ?? null

function step(c: WindowController, by: number): Command | null {
  const ids = model.spaceTabs(c.record)
  if (!ids.length) return null
  const i = ids.indexOf(activeID(c) ?? '')
  return { do: 'tab.select', id: ids[(i + by + ids.length) % ids.length] }
}

function nth(c: WindowController, n: number): Command | null {
  const ids = model.spaceTabs(c.record)
  const id = n < 0 ? ids[ids.length - 1] : ids[n]
  return id ? { do: 'tab.select', id } : null
}

/** ⌘W: the field raised over a page goes first, the page staying
 * (Browser.closeFront); otherwise the tab. */
function closeFront(c: WindowController): Command | boolean {
  const m = mem(c)
  const tab = model.activeTab(c.record)
  if (m.editing && tab && !tab.empty) { putAway(c); c.focusPage(); return true }
  const id = activeID(c)
  return id ? { do: 'tab.close', id } : true
}

/** Escape, Search's part of the chain (App.swift take): the field, then Find.
 * Anything else, and the key is the page's (where it stops loading). */
function escapeKey(c: WindowController): boolean {
  const m = mem(c)
  const tab = model.activeTab(c.record)
  // The address in the tab itself first, as the Mac's chain begins (App.swift take).
  if (tabEditing(c)) { cancelTabEdit(c); return true }
  // The field over the page has the keys and is in front of Find.
  if (m.editing && tab && !tab.empty) return fieldEscape(c)
  if (findIsOpen(c)) return closeFind(c)
  // Tabs picked with Ctrl or Shift: Escape lets them go (§3.18), and only
  // then is it the page's.
  if (c.record.picked.length && !fieldShowing(c)) { model.pick(c.record, '', 'clear'); return true }
  return fieldEscape(c)
}

type Spec = Omit<Binding, 'id' | 'title' | 'section' | 'mac' | 'keys' | 'phase'> & { phase?: 'first' | 'later' }
const b = (id: string, title: string, section: Section, mac: string, keys: string[], spec: Spec = {}): Binding =>
  ({ id, title, section, mac, keys, phase: spec.phase ?? 'later', ...spec })
/** A command of another module: its key works once that command exists. */
const later = (name: string, args: Record<string, unknown> = {}): Spec => ({ needs: { do: name, ...args } as never })
const first = (spec: Spec): Spec => ({ ...spec, phase: 'first' })
const none: Spec = {}

/** The whole table, Mac → Windows. */
export const bindings: Binding[] = [
  // Search
  b('app.settings', 'Settings…', 'Search', '⌘,', ['Ctrl+,'], later('app.settings')),
  b('app.welcome', 'Welcome…', 'Search', '', [], later('app.welcome')),
  // ⌥⌘L: Ctrl+Alt+L is AltGr+L (ł in Polish); Ctrl+Shift+L is the password managers'.
  b('app.passwords', 'Passwords…', 'Search', '⌥⌘L', ['Alt+Shift+L'], later('app.passwords')),
  // ⌘Q is the Mac's own; Ctrl+Shift+Q as Firefox, never Ctrl+Q beside Ctrl+W and Ctrl+A.
  b('app.quit', 'Quit Oriel', 'Search', '⌘Q', ['Ctrl+Shift+Q'], first({ ...later('app.quit'), fixed: true })),
  // File
  b('file.newWindow', 'New Window', 'File', '⌘N', ['Ctrl+N'], first({ action: () => ({ do: 'window.new' }) })),
  // With New tab in a floating field on, over a page: the field, no tab yet (studio/01 §3.5).
  b('file.newTab', 'New Tab', 'File', '⌘T', ['Ctrl+T'], first({ once: true, action: c => (launch(c) ? true : { do: 'tab.new' }) })),
  // A private tab until the tabs module has one; a private window meanwhile.
  b('file.newPrivateTab', 'New Private Tab', 'File', '⇧⌘N', ['Ctrl+Shift+N'], first({ action: () => (handled().includes('tab.newPrivate' as never) ? { do: 'tab.newPrivate' } as never : { do: 'window.new', shy: true }) })),
  b('file.reopen', 'Reopen Closed Tab', 'File', '⇧⌘T', ['Ctrl+Shift+T'], first({ action: () => ({ do: 'tab.reopen' }) })),
  b('file.openAddress', 'Open Address…', 'File', '⌘L', ['Ctrl+L', 'Alt+D', 'F6'], first({ once: true, action: c => { edit(c); return true } })),
  b('file.openFile', 'Open File…', 'File', '⌘O', ['Ctrl+O'], later('file.open')),
  b('file.closeTab', 'Close Tab', 'File', '⌘W', ['Ctrl+W', 'Ctrl+F4'], first({ action: closeFront })),
  b('file.closeWindow', 'Close Window', 'File', '⇧⌘W', ['Ctrl+Shift+W'], first({ action: () => ({ do: 'window.close' }) })),
  b('file.import', 'Bring Things Over…', 'File', '', [], later('file.import')),
  b('file.share', 'Share…', 'File', '', [], later('page.share')),
  // Ctrl+S is Hide Sidebar, as ⌘S: no key for saving a page, as on the Mac.
  b('file.savePage', 'Save Page As…', 'File', '', [], later('page.save')),
  b('file.exportPDF', 'Export as PDF…', 'File', '', [], later('page.exportPDF')),
  b('file.print', 'Print…', 'File', '⌘P', ['Ctrl+P'], later('page.print')),
  // ⌃⌥⌘.: Ctrl+Alt is AltGr; Shift instead.
  b('file.stopAgent', 'Stop Agent', 'File', '⌃⌥⌘.', ['Ctrl+Shift+.'], first(later('agent.stop'))),
  // Edit
  // ⌥⇧⌘V: in a text box Ctrl+Shift+V already pastes plain text on Windows.
  b('edit.pasteMatchStyle', 'Paste and Match Style', 'Edit', '⌥⇧⌘V', [], later('edit.pasteMatchStyle')),
  b('edit.find', 'Find on Page…', 'Edit', '⌘F', ['Ctrl+F'], { action: c => openFind(c) }),
  b('edit.findNext', 'Find Next', 'Edit', '⌘G', ['Ctrl+G', 'F3'], { action: c => findStep(c, true) || openFind(c) }),
  b('edit.findPrevious', 'Find Previous', 'Edit', '⇧⌘G', ['Ctrl+Shift+G', 'Shift+F3'], { action: c => findStep(c, false) }),
  b('edit.copyCleanLink', 'Copy Clean Link', 'Edit', '⌥⇧⌘C', ['Alt+Shift+C'], later('address.copyClean')),
  // View
  b('view.sidebar', 'Show Tabs in Sidebar', 'View', '⇧⌘S', ['Ctrl+Shift+S'], later('sidebar.layout')),
  b('view.fold', 'Hide Sidebar or Tab Bar', 'View', '⌘S', ['Ctrl+S'], { action: () => ({ do: 'sidebar.toggle' }) }),
  // ⌥⌘[ ⌥⌘]: Ctrl+Alt+[ is AltGr+è on an Italian keyboard, which types [.
  b('view.foldGroups', 'Fold All Groups', 'View', '⌥⌘[', [], later('groups.fold', { folded: true })),
  b('view.unfoldGroups', 'Unfold All Groups', 'View', '⌥⌘]', [], later('groups.fold', { folded: false })),
  b('view.reload', 'Reload Page', 'View', '⌘R', ['Ctrl+R', 'F5'], { action: () => ({ do: 'tab.reload' }) }),
  b('view.reloadOrigin', 'Reload Page From Origin', 'View', '⌥⌘R', ['Ctrl+F5', 'Shift+F5'], { action: () => ({ do: 'tab.reload', hard: true }) }),
  // Chrome's hard reload; Search's Reading Mode, kept (studio/03 §13.1).
  b('view.reader', 'Reading Mode', 'View', '⇧⌘R', ['Ctrl+Shift+R'], later('view.reader')),
  b('view.float', 'Float Video', 'View', '⇧⌘P', ['Ctrl+Shift+P'], later('view.float')),
  b('view.sitePanel', 'Show Side Panel', 'View', '', [], later('view.sidePanel')),
  b('view.dusk', 'Darken This Site', 'View', '⇧⌘D', ['Ctrl+Shift+D'], later('view.dusk')),
  b('view.duskPause', 'Pause Darkening', 'View', '⌥⇧⌘D', ['Alt+Shift+D'], later('view.duskPause')),
  b('view.summarize', 'Summarize Page', 'View', '', [], later('ai.summarize')),
  b('view.ask', 'Ask About This Page…', 'View', '', [], later('ai.ask')),
  b('view.capture', 'Capture…', 'View', '', [], later('view.capture')),
  b('view.hide', 'Hide Elements…', 'View', '⇧⌘H', ['Ctrl+Shift+H'], later('view.hide')),
  b('view.hidden', 'Hidden on This Site…', 'View', '⇧⌘U', ['Ctrl+Shift+U'], later('view.hidden')),
  b('view.style', 'Edit Site Style…', 'View', '', [], later('view.style')),
  b('view.zoomIn', 'Zoom In', 'View', '⌘+', ['Ctrl+=', 'Ctrl+Shift+=', 'Ctrl++', 'Ctrl+Shift++'], later('view.zoom', { by: 1.1 })),
  b('view.zoomOut', 'Zoom Out', 'View', '⌘-', ['Ctrl+-'], later('view.zoom', { by: 1 / 1.1 })),
  b('view.actualSize', 'Actual Size', 'View', '⌘0', ['Ctrl+0'], first(later('view.zoom', { reset: true }))),
  // ⌥⌘I ⌥⌘J: Chrome's own keys for its tools, taken before the page as Chrome does.
  b('view.inspector', 'Web Inspector', 'View', '⌥⌘I', ['F12', 'Ctrl+Shift+I'], first(later('view.inspector'))),
  b('view.console', 'JavaScript Console', 'View', '⌥⌘J', ['Ctrl+Shift+J'], first(later('view.console'))),
  // ⌥⌘C: Chrome's Ctrl+Shift+C is Copy Address here, Ctrl+Alt+C is AltGr.
  b('view.inspect', 'Inspect Element', 'View', '⌥⌘C', [], later('view.inspect')),
  b('view.fullScreen', 'Enter Full Screen', 'View', '⌃⌘F', ['F11'], first({ ...later('window.fullScreen'), fixed: true })),
  // Tabs
  b('tabs.back', 'Back', 'Tabs', '⌘[  ⌘←', ['Alt+Left', 'Ctrl+['], { action: () => ({ do: 'tab.back' }) }),
  b('tabs.forward', 'Forward', 'Tabs', '⌘]  ⌘→', ['Alt+Right', 'Ctrl+]'], { action: () => ({ do: 'tab.forward' }) }),
  b('tabs.next', 'Next Tab', 'Tabs', '⇧⌘]', ['Ctrl+PageDown', 'Ctrl+Shift+]'], first({ action: c => step(c, 1) })),
  // The recent-use switcher is the tabs module's; until it is there, the next tab.
  b('tabs.recent', 'Switch to Recent Tab', 'Tabs', '⌃Tab', ['Ctrl+Tab'], first({ action: c => step(c, 1) })),
  b('tabs.recentBack', 'Switch to Recent Tab, Back', 'Fixed', '⌃⇧Tab', ['Ctrl+Shift+Tab'], first({ action: c => step(c, -1) })),
  b('tabs.previous', 'Previous Tab', 'Tabs', '⇧⌘[', ['Ctrl+PageUp', 'Ctrl+Shift+['], first({ action: c => step(c, -1) })),
  // Always Search's, never the page's (#238).
  b('tabs.search', 'Search Tabs…', 'Tabs', '⌘K', ['Ctrl+K'], first({ action: (c, k) => { if (!k.repeat || mem(c).summonHeld) searchTabsKey(c, true); return true } })),
  b('tabs.split', 'Split Current Page', 'Tabs', '⌥⌘N', ['Alt+Shift+N'], later('split.toggle')),
  // ⌃⌘← ⌃⌘→: Ctrl+Win+arrows change desktops, Ctrl+Alt+arrows turn some screens.
  b('tabs.focusLeftPane', 'Focus Left Page', 'Tabs', '⌃⌘←', ['Alt+Shift+Left'], first(later('split.focus', { side: 'left' }))),
  b('tabs.focusRightPane', 'Focus Right Page', 'Tabs', '⌃⌘→', ['Alt+Shift+Right'], first(later('split.focus', { side: 'right' }))),
  b('tabs.focusOtherPane', 'Focus Other Page', 'Tabs', '', [], later('split.focus', { side: 'other' })),
  b('tabs.swapSplit', 'Swap Pages', 'Tabs', '', [], later('split.swap')),
  b('tabs.separateSplit', 'Separate Split Tabs', 'Tabs', '', [], later('split.separate')),
  b('tabs.pin', 'Pin Tab', 'Tabs', '', [], { action: c => { const id = activeID(c); const t = id && model.tabs.get(id); return t && !t.empty ? (t.pinID ? { do: 'tab.unpin', id } : { do: 'tab.pin', id }) : false } }),
  b('tabs.pinRow', 'Pin Tab as Row', 'Tabs', '', [], later('tab.pinRow')),
  // F2, Windows' key for renaming.
  b('tabs.rename', 'Rename Tab', 'Tabs', '', ['F2'], later('tab.beginRename')),
  b('tabs.duplicate', 'Duplicate Tab', 'Tabs', '⌘D', ['Ctrl+D'], { action: c => { const id = activeID(c); const t = id && model.tabs.get(id); return t && !t.empty ? { do: 'tab.duplicate', id } : false } }),
  b('tabs.copyAddress', 'Copy Address', 'Tabs', '⇧⌘C', ['Ctrl+Shift+C'], later('address.copy')),
  b('tabs.copyMarkdown', 'Copy as Markdown Link', 'Tabs', '', [], later('address.copyMarkdown')),
  b('tabs.pasteAndGo', 'Paste and Go', 'Tabs', '⇧⌘V', ['Ctrl+Shift+V'], later('address.pasteAndGo')),
  b('tabs.closeOthers', 'Close Other Tabs', 'Tabs', '', [], later('tab.closeOthers')),
  b('tabs.mute', 'Stop Sound in Tab', 'Tabs', '⇧⌘M', ['Ctrl+Shift+M'], later('tab.stopSound')),
  // Bookmarks
  b('bookmarks.add', 'Add This Page', 'Bookmarks', '⇧⌘B', ['Ctrl+Shift+B'], later('bookmarks.add')),
  b('bookmarks.show', 'Show Bookmarks…', 'Bookmarks', '', ['Ctrl+Shift+O'], later('bookmarks.show')),
  b('bookmarks.bar', 'Show Bookmarks Bar', 'Bookmarks', '', [], later('bookmarks.bar')),
  // History
  // ⌘Y: Ctrl+Y is Redo in every Windows text box.
  b('history.show', 'Show History…', 'History', '⌘Y', ['Ctrl+H'], later('history.show')),
  // ⇧⌘J: Ctrl+J as Chrome; Ctrl+Shift+J is the console.
  b('history.downloads', 'Downloads…', 'History', '⇧⌘J', ['Ctrl+J'], later('downloads.show')),
  b('history.archive', 'Archived Tabs…', 'History', '', [], later('history.archive')),
  b('history.clearData', 'Clear Browsing Data…', 'History', '⇧⌘⌫', ['Ctrl+Shift+Delete'], first(later('history.clearData'))),
  b('history.clear', 'Clear History', 'History', '', [], later('history.clear')),
  // Spaces: ⌃1-⌃9 on the Mac, Alt+1-9 here (Ctrl+1-9 are the tabs').
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => b(`spaces.${n}`, `Space ${n}`, 'Spaces', `⌃${n}`, [`Alt+${n}`], first({
    action: () => { const s = model.spaces[n - 1]; return s && model.spaces.length > 1 ? { do: 'space.select', id: s.id } : false },
  }))),
  b('spaces.next', 'Next Space', 'Spaces', '', [], { action: () => (model.spaces.length > 1 ? { do: 'space.step', by: 1 } : false) }),
  b('spaces.previous', 'Previous Space', 'Spaces', '', [], { action: () => (model.spaces.length > 1 ? { do: 'space.step', by: -1 } : false) }),
  b('profiles.next', 'Next Profile', 'Profiles', '', [], later('profile.step', { by: 1 })),
  b('profiles.previous', 'Previous Profile', 'Profiles', '', [], later('profile.step', { by: -1 })),
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => b(`profiles.${n}`, `Profile ${n}`, 'Profiles', '', [], later('profile.select', { index: n - 1 }))),
  // Fixed keys (studio/03 §13.2)
  ...[1, 2, 3, 4, 5, 6, 7, 8].map(n => b(`tab.${n}`, `Tab ${n}`, 'Fixed', `⌘${n}`, [`Ctrl+${n}`], first({ fixed: true, action: c => nth(c, n - 1) }))),
  b('tab.last', 'Last Tab', 'Fixed', '⌘9', ['Ctrl+9'], first({ fixed: true, action: c => nth(c, -1) })),
  b('escape', 'Escape', 'Fixed', 'Esc', ['Escape'], first({ fixed: true, action: c => escapeKey(c) })),
  // Escape the page left alone: stop loading, else out of full screen (the
  // way out a window with no buttons in sight needs, studio/01 §1.19).
  b('stop', 'Stop Loading', 'Fixed', '', ['Escape'], { fixed: true, action: c => (c.frame.isFullScreen() && !model.activeTab(c.record)?.loading ? { do: 'window.fullScreen', on: false } : { do: 'tab.stop' }) }),
  // Windows closes a window on Alt+F4 whatever the page says; on the last
  // window that is quitting, so Confirm before quitting asks (settings/quit.ts).
  b('window.close', 'Close Window', 'Fixed', '', ['Alt+F4'], first({ fixed: true, action: () => ({ do: 'window.closeByKey' }) })),
  // Alt+Home is Chrome's home page; Search has none but a pin's own page.
  b('pin.home', 'Back to the Pinned Page', 'Fixed', '', ['Alt+Home'], { fixed: true, action: c => { const id = activeID(c); const t = id && model.tabs.get(id); return t && t.pinID ? { do: 'pin.home', id: t.pinID } : false } }),
]
void none

// Settings › Shortcuts keeps only what was changed (ShortcutStore): { id: { keys } }.
addDefaults({ shortcuts: {} })

type Changed = Record<string, { keys: string[] | null }>
const changedKeys = (): Changed => model.pref<Changed>('shortcuts') ?? {}

/** A chord as chordName spells it, its modifiers Ctrl, Shift, Alt: the
 * table writes Alt+Shift+L, a key pressed reads Shift+Alt+L. */
export function canonical(name: string): string {
  const parts = name.split('+')
  const key = parts.pop() ?? ''
  if (!key && name.endsWith('+')) return name // Ctrl++ (the + key)
  return [parts.includes('Ctrl') && 'Ctrl', parts.includes('Shift') && 'Shift', parts.includes('Alt') && 'Alt', key].filter(Boolean).join('+')
}

/** The keys a command has now: Settings' if changed there, else the table's;
 * never one Windows keeps, whatever the file says (ShortcutStore.init). */
export function keysOf(binding: Binding): string[] {
  if (binding.fixed) return binding.keys
  const changed = changedKeys()[binding.id]
  return (changed ? changed.keys ?? [] : binding.keys).filter(k => !reserved(canonical(k)))
}

/** Whether a command has this key now (`name` as chordName spells it). */
export const hasKey = (binding: Binding, name: string) => keysOf(binding).some(k => canonical(k) === name)

/** A key given to a command in Settings: it wins over a module's own for
 * the same chord, as the Mac's custom keys come before the menus (studio/03
 * §4.4 point 13). */
function changedOwner(name: string, phase: 'first' | 'later'): Binding | undefined {
  const changed = changedKeys()
  return bindings.find(x => !x.fixed && x.phase === phase && changed[x.id] && hasKey(x, name) && live(x))
}

/** A key the table had that no command has now: the page's again, unless
 * Settings gave it to an extension (ShortcutStore.isFreed). */
function freed(name: string): boolean {
  const changed = changedKeys()
  return bindings.some(x => changed[x.id] && x.keys.some(k => canonical(k) === name)) && !bindings.some(x => hasKey(x, name))
}

/** Settings is reading a key in this page (KeyBox): every key goes to it
 * (studio/03 §4.4 point 3). Until it stops, or the page goes. */
const recorders = new WeakSet<WebContents>()
const watched = new WeakSet<WebContents>()
export function standAside(wc: WebContents, on: boolean): void {
  if (!on) { recorders.delete(wc); return }
  recorders.add(wc)
  if (watched.has(wc)) return
  watched.add(wc)
  wc.on('did-start-navigation', () => recorders.delete(wc))
}

/** Never shortcuts on Windows (studio/03 §13.3, Shortcuts.isReserved): the
 * text keys, the system's, Escape with anything, Tab alone or with Shift,
 * the tab numbers, and Ctrl+Alt (AltGr). */
export function reserved(name: string): boolean {
  const fixed = new Set(['Ctrl+C', 'Ctrl+V', 'Ctrl+X', 'Ctrl+A', 'Ctrl+Z', 'Ctrl+Y', 'Ctrl+Shift+Z', 'Alt+F4', 'Alt+Tab', 'Alt+Escape',
    'Alt+Space', 'Ctrl+Escape', 'Ctrl+Shift+Escape', 'F10', 'Tab', 'Shift+Tab'])
  if (fixed.has(name)) return true
  if (/(^|\+)Escape$/.test(name) && name !== 'Escape') return true
  if (/^Ctrl\+[1-9]$/.test(name)) return true
  return /Ctrl\+(Shift\+)?Alt\+/.test(name) || name.includes('Meta+') || name.includes('Win+')
}

/** [chord, action, given in Settings or by an extension rather than a
 * module's own way of doing a table command]. */
const extra: { first: [string, Action, boolean][]; later: [string, Action, boolean][] } = { first: [], later: [] }

/** Modules add shortcuts from their own files. A module's own wins over the
 * table's for the same chord, unless Settings moved that chord. `given`:
 * a key an extension has, not a module's own way of doing a table command. */
export function shortcut(name: string, phase: 'first' | 'later', action: Action, given = false): void {
  const list = extra[phase]
  const at = list.findIndex(([n]) => n === name)
  if (at >= 0) list.splice(at, 1)
  list.unshift([name, action, given])
}

/** Takes back a module's shortcut: the chord is free again (for the page or
 * the table). With `action`, only if that is still the one bound. */
export function unshortcut(name: string, action?: Action): void {
  for (const list of [extra.first, extra.later]) {
    const at = list.findIndex(([n, a]) => n === name && (!action || a === action))
    if (at >= 0) list.splice(at, 1)
  }
}

/** Whether a binding's command exists now. */
export function live(binding: Binding): boolean {
  if (binding.action) return true
  return !!binding.needs && handled().includes(binding.needs.do)
}

export function findBinding(name: string, phase: 'first' | 'later'): Binding | undefined {
  return bindings.find(x => x.phase === phase && hasKey(x, name) && live(x))
}

/** A table command's action: a module's own for its first key if there is
 * one (the tabs module's Ctrl+W), else the table's. */
function actionOf(binding: Binding, phase: 'first' | 'later'): Action {
  for (const k of binding.keys.map(canonical)) {
    const own = extra[phase].find(([n, , g]) => n === k && !g)?.[1]
    if (own) return own
  }
  return binding.action ?? (() => binding.needs!)
}

export function findAction(name: string, phase: 'first' | 'later'): Action | undefined {
  const mine = changedOwner(name, phase)
  if (mine) return actionOf(mine, phase)
  if (freed(name)) return extra[phase].find(([n, , g]) => n === name && g)?.[1]
  const own = extra[phase].find(([n]) => n === name)?.[1]
  if (own) return own
  const found = findBinding(name, phase)
  if (!found) return undefined
  return found.action ?? (() => found.needs!)
}

/** Digits and punctuation by the key's place. */
const places: Record<string, string> = {
  Digit1: '1', Digit2: '2', Digit3: '3', Digit4: '4', Digit5: '5', Digit6: '6', Digit7: '7', Digit8: '8', Digit9: '9', Digit0: '0',
  Numpad1: '1', Numpad2: '2', Numpad3: '3', Numpad4: '4', Numpad5: '5', Numpad6: '6', Numpad7: '7', Numpad8: '8', Numpad9: '9', Numpad0: '0',
  BracketLeft: '[', BracketRight: ']', Comma: ',', Period: '.', Slash: '/', Backslash: '\\', Semicolon: ';', Quote: "'", Backquote: '`',
  Minus: '-', Equal: '=', NumpadAdd: '+', NumpadSubtract: '-',
}
const names: Record<string, string> = { ArrowLeft: 'Left', ArrowRight: 'Right', ArrowUp: 'Up', ArrowDown: 'Down', ' ': 'Space', Esc: 'Escape' }

/** "Ctrl+Shift+T" for a chord, or null when it can't be a shortcut. */
export function chordName(k: Chord): string | null {
  if (k.altGraph) return null
  if (['Control', 'Shift', 'Alt', 'Meta', 'AltGraph', 'CapsLock', 'Process', 'Dead', 'Unidentified', ''].includes(k.key)) return null
  const ctrl = process.platform === 'darwin' ? k.meta || k.ctrl : k.ctrl
  // Ctrl+Alt is AltGr on Windows: it types, it is never a shortcut.
  if (ctrl && k.alt) return null
  // Alt with the keypad's digits types a character by its code (Alt+0233 é).
  if (k.alt && /^Numpad[0-9]$/.test(k.code)) return null
  let key: string
  if (['+', '-', '='].includes(k.key)) key = k.key // zoom keys wherever they sit (+ is on ] in Italian and German)
  else if (places[k.code]) key = places[k.code]
  else if (k.key.length === 1 && /[a-z]/i.test(k.key)) key = k.key.toUpperCase()
  else if (/^Key[A-Z]$/.test(k.code)) key = k.code.slice(3) // a layout that doesn't type Latin
  else key = names[k.key] ?? (k.key.length === 1 ? k.key.toUpperCase() : k.key)
  return [ctrl && 'Ctrl', k.shift && 'Shift', k.alt && 'Alt', key].filter(Boolean).join('+')
}

function perform(c: WindowController, name: string, phases: ('first' | 'later')[], k: KeyContext): boolean {
  for (const phase of phases) {
    const action = findAction(name, phase)
    if (!action) continue
    const found = findBinding(name, phase)
    if (k.repeat && found?.once) return true
    const result = action(c, { ...k, chord: name })
    if (result === false) continue
    if (result && typeof result === 'object') void run(result as never, { window: c }).catch(e => console.warn('[keys]', e))
    return true
  }
  return false
}

/** Modules that watch every key of a window, taken or not (tabs/hints.ts). */
export const inputWatchers: ((c: WindowController, input: Electron.Input) => void)[] = []

/** before-input-event of a page or of the interface. True when Search took the key. */
export function onInput(c: WindowController, input: Electron.Input, fromPage: boolean, from?: WebContents): boolean {
  for (const w of inputWatchers) w(c, input)
  if (input.type === 'keyUp') {
    // Ctrl let go of after ⌘K walked the list: go there.
    if (input.key === 'Control' || (process.platform === 'darwin' && input.key === 'Meta')) controlUp(c)
    return false
  }
  if (input.type !== 'keyDown' || input.isComposing) return false
  if (from && recorders.has(from)) return false
  if (from && holdKey(c, input, from)) return true
  const name = chordName({ ctrl: input.control, shift: input.shift, alt: input.alt, meta: input.meta, key: input.key, code: input.code })
  if (!name) return false
  return perform(c, name, fromPage ? ['first'] : ['first', 'later'], { fromPage, repeat: input.isAutoRepeat })
}

/** A key the page didn't use (reported by the page preload). */
export function onLeftover(c: WindowController, k: Chord): void {
  const name = chordName(k)
  if (name) perform(c, name, ['later'], { fromPage: true, repeat: false })
}

export function wireKeys(c: WindowController, wc: WebContents, fromPage: boolean): void {
  wc.on('before-input-event', (event, input) => { if (onInput(c, input, fromPage, wc)) event.preventDefault() })
}

export { fieldShowing }

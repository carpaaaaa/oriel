// Keyboard shortcuts on Windows (studio/03 §4, §13; studio/01 §1.43).
//
// ⌘ becomes Ctrl; the spaces' ⌃1-9 move to Alt+1-9 so they don't fight the
// tabs' Ctrl+1-9; Windows' own habits that don't collide are added (Ctrl+F4,
// Ctrl+PageUp/PageDown, Alt+F4, F5, F6, Alt+D, F3, F12, Alt+Left/Right).
// Letters are read by the character they type (event.key, or the key's place
// on a layout that doesn't type Latin), digits and punctuation by the key's
// place (event.code), and Ctrl+Alt is never a shortcut: on European layouts
// it is AltGr, which types [ ] @ € ł ń. So no shortcut here uses Ctrl+Alt;
// where the Mac has ⌥⌘ Windows gets Alt+Shift or a function key.
//
// "first" keys are Search's before the page sees them (Chrome keeps the same
// ones, and the Mac's pageFirst never gives them: ⌘T ⌘W ⌘K ⇧⌘N ⇧⌘[ ⇧⌘]
// ⌘1-9); "later" ones only when the page leaves them alone (studio/03 §4.4
// point 19). An action answers `false` to leave the key where it was going.

import type { WebContents } from 'electron'
import { handled, run } from './router'
import type { Command } from '../shared/commands'
import type { WindowController } from './views/window'
import { model } from './model/model'
import { controlUp, edit, escape as fieldEscape, fieldShowing, holdKey, mem, putAway, searchTabsKey } from './field/commands'
import { closeFind, findIsOpen, openFind, step as findStep } from './field/find'

export interface Chord { ctrl: boolean; shift: boolean; alt: boolean; meta: boolean; key: string; code: string; altGraph?: boolean }

export interface KeyContext {
  /** The key came from a page (false: the interface or the overlay). */
  fromPage: boolean
  repeat: boolean
}

/** A command to run, true for "taken" (done here), false to leave the key. */
export type Action = (c: WindowController, k: KeyContext) => Command | boolean | null | void

export interface Binding {
  /** The Mac's command id (Shortcuts.swift Command.all) or a name for a fixed key. */
  id: string
  title: string
  /** The Mac's key, for the record. */
  mac: string
  /** Windows chords, as chordName writes them. */
  keys: string[]
  phase: 'first' | 'later'
  action?: Action
  /** The command another module is to add; the key is live once it exists. */
  needs?: Command
  /** Held down, it does nothing more (⌘T, ⌘L: their repeats would toggle). */
  once?: boolean
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
  // The field over the page has the keys and is in front of Find.
  if (m.editing && tab && !tab.empty) return fieldEscape(c)
  if (findIsOpen(c)) return closeFind(c)
  return fieldEscape(c)
}

const D = (n: number) => String(n)

/** The whole table: Command.all and the fixed keys, Mac → Windows. */
export const bindings: Binding[] = [
  // Search
  { id: 'app.settings', title: 'Settings…', mac: '⌘,', keys: ['Ctrl+,'], phase: 'later', needs: { do: 'app.settings' } as never },
  { id: 'app.passwords', title: 'Passwords…', mac: '⌥⌘L', keys: ['Alt+Shift+L'], phase: 'later', needs: { do: 'app.passwords' } as never },
  { id: 'app.quit', title: 'Quit Search', mac: '⌘Q', keys: ['Ctrl+Shift+Q'], phase: 'first', needs: { do: 'app.quit' } as never },
  // File
  { id: 'file.newWindow', title: 'New Window', mac: '⌘N', keys: ['Ctrl+N'], phase: 'first', action: () => ({ do: 'window.new' }) },
  { id: 'file.newTab', title: 'New Tab', mac: '⌘T', keys: ['Ctrl+T'], phase: 'first', once: true, action: () => ({ do: 'tab.new' }) },
  { id: 'file.newPrivateTab', title: 'New Private Tab', mac: '⇧⌘N', keys: ['Ctrl+Shift+N'], phase: 'first', action: () => ({ do: 'window.new', shy: true }) },
  { id: 'file.reopen', title: 'Reopen Closed Tab', mac: '⇧⌘T', keys: ['Ctrl+Shift+T'], phase: 'first', action: () => ({ do: 'tab.reopen' }) },
  { id: 'file.openAddress', title: 'Open Address…', mac: '⌘L', keys: ['Ctrl+L', 'Alt+D', 'F6'], phase: 'first', once: true, action: c => { edit(c); return true } },
  { id: 'file.openFile', title: 'Open File…', mac: '⌘O', keys: ['Ctrl+O'], phase: 'later', needs: { do: 'file.open' } as never },
  { id: 'file.closeTab', title: 'Close Tab', mac: '⌘W', keys: ['Ctrl+W', 'Ctrl+F4'], phase: 'first', action: closeFront },
  { id: 'file.closeWindow', title: 'Close Window', mac: '⇧⌘W', keys: ['Ctrl+Shift+W', 'Alt+F4'], phase: 'first', action: () => ({ do: 'window.close' }) },
  { id: 'file.print', title: 'Print…', mac: '⌘P', keys: ['Ctrl+P'], phase: 'later', needs: { do: 'page.print' } as never },
  { id: 'file.stopAgent', title: 'Stop Agent', mac: '⌃⌥⌘.', keys: ['Ctrl+Shift+.'], phase: 'first', needs: { do: 'agent.stop' } as never },
  // Edit
  { id: 'edit.find', title: 'Find on Page…', mac: '⌘F', keys: ['Ctrl+F'], phase: 'later', action: c => openFind(c) },
  { id: 'edit.findNext', title: 'Find Next', mac: '⌘G', keys: ['Ctrl+G', 'F3'], phase: 'later', action: c => findStep(c, true) || openFind(c) },
  { id: 'edit.findPrevious', title: 'Find Previous', mac: '⇧⌘G', keys: ['Ctrl+Shift+G', 'Shift+F3'], phase: 'later', action: c => findStep(c, false) },
  { id: 'edit.copyCleanLink', title: 'Copy Clean Link', mac: '⌥⇧⌘C', keys: ['Alt+Shift+C'], phase: 'later', needs: { do: 'address.copyClean' } as never },
  // View
  { id: 'view.sidebar', title: 'Show Tabs in Sidebar', mac: '⇧⌘S', keys: ['Ctrl+Shift+S'], phase: 'later', needs: { do: 'sidebar.layout' } as never },
  { id: 'view.fold', title: 'Hide Sidebar or Tab Bar', mac: '⌘S', keys: ['Ctrl+S'], phase: 'later', action: () => ({ do: 'sidebar.toggle' }) },
  { id: 'view.reload', title: 'Reload Page', mac: '⌘R', keys: ['Ctrl+R', 'F5'], phase: 'later', action: () => ({ do: 'tab.reload' }) },
  { id: 'view.reloadOrigin', title: 'Reload Page From Origin', mac: '⌥⌘R', keys: ['Ctrl+F5', 'Shift+F5'], phase: 'later', action: () => ({ do: 'tab.reload', hard: true }) },
  { id: 'view.reader', title: 'Reading Mode', mac: '⇧⌘R', keys: ['Ctrl+Shift+R'], phase: 'later', needs: { do: 'view.reader' } as never },
  { id: 'view.float', title: 'Float Video', mac: '⇧⌘P', keys: ['Ctrl+Shift+P'], phase: 'later', needs: { do: 'view.float' } as never },
  { id: 'view.dusk', title: 'Darken This Site', mac: '⇧⌘D', keys: ['Ctrl+Shift+D'], phase: 'later', needs: { do: 'view.dusk' } as never },
  { id: 'view.duskPause', title: 'Pause Darkening', mac: '⌥⇧⌘D', keys: ['Alt+Shift+D'], phase: 'later', needs: { do: 'view.duskPause' } as never },
  { id: 'view.hide', title: 'Hide Elements…', mac: '⇧⌘H', keys: ['Ctrl+Shift+H'], phase: 'later', needs: { do: 'view.hide' } as never },
  { id: 'view.hidden', title: 'Hidden on This Site…', mac: '⇧⌘U', keys: ['Ctrl+Shift+U'], phase: 'later', needs: { do: 'view.hidden' } as never },
  { id: 'view.zoomIn', title: 'Zoom In', mac: '⌘+', keys: ['Ctrl+=', 'Ctrl+Shift+=', 'Ctrl++', 'Ctrl+Shift++'], phase: 'later', needs: { do: 'view.zoom', by: 1.1 } as never },
  { id: 'view.zoomOut', title: 'Zoom Out', mac: '⌘-', keys: ['Ctrl+-'], phase: 'later', needs: { do: 'view.zoom', by: 1 / 1.1 } as never },
  { id: 'view.actualSize', title: 'Actual Size', mac: '⌘0', keys: ['Ctrl+0'], phase: 'first', needs: { do: 'view.zoom', reset: true } as never },
  { id: 'view.inspector', title: 'Web Inspector', mac: '⌥⌘I', keys: ['F12', 'Ctrl+Shift+I'], phase: 'first', needs: { do: 'view.inspector' } as never },
  { id: 'view.console', title: 'JavaScript Console', mac: '⌥⌘J', keys: ['Ctrl+Shift+J'], phase: 'first', needs: { do: 'view.console' } as never },
  { id: 'view.fullScreen', title: 'Enter Full Screen', mac: '⌃⌘F', keys: ['F11'], phase: 'first', needs: { do: 'window.fullScreen' } as never },
  // Tabs
  { id: 'tabs.back', title: 'Back', mac: '⌘[  ⌘←', keys: ['Alt+Left', 'Ctrl+['], phase: 'later', action: () => ({ do: 'tab.back' }) },
  { id: 'tabs.forward', title: 'Forward', mac: '⌘]  ⌘→', keys: ['Alt+Right', 'Ctrl+]'], phase: 'later', action: () => ({ do: 'tab.forward' }) },
  { id: 'tabs.next', title: 'Next Tab', mac: '⇧⌘]', keys: ['Ctrl+PageDown', 'Ctrl+Shift+]'], phase: 'first', action: c => step(c, 1) },
  { id: 'tabs.previous', title: 'Previous Tab', mac: '⇧⌘[', keys: ['Ctrl+PageUp', 'Ctrl+Shift+['], phase: 'first', action: c => step(c, -1) },
  { id: 'tabs.recent', title: 'Switch to Recent Tab', mac: '⌃Tab', keys: ['Ctrl+Tab'], phase: 'first', action: c => step(c, 1) },
  { id: 'tabs.recentBack', title: 'Switch to Recent Tab (back)', mac: '⌃⇧Tab', keys: ['Ctrl+Shift+Tab'], phase: 'first', action: c => step(c, -1) },
  { id: 'tabs.search', title: 'Search Tabs…', mac: '⌘K', keys: ['Ctrl+K'], phase: 'first', action: (c, k) => { if (!k.repeat || mem(c).summonHeld) searchTabsKey(c, true); return true } },
  { id: 'tabs.split', title: 'Split Current Page', mac: '⌥⌘N', keys: ['Alt+Shift+N'], phase: 'later', needs: { do: 'split.toggle' } as never },
  { id: 'tabs.focusLeftPane', title: 'Focus Left Page', mac: '⌃⌘←', keys: ['Alt+Shift+Left'], phase: 'first', needs: { do: 'split.focus', side: 'left' } as never },
  { id: 'tabs.focusRightPane', title: 'Focus Right Page', mac: '⌃⌘→', keys: ['Alt+Shift+Right'], phase: 'first', needs: { do: 'split.focus', side: 'right' } as never },
  { id: 'tabs.rename', title: 'Rename Tab', mac: '', keys: ['F2'], phase: 'later', needs: { do: 'tab.beginRename' } as never },
  { id: 'tabs.duplicate', title: 'Duplicate Tab', mac: '⌘D', keys: ['Ctrl+D'], phase: 'later', action: c => { const id = activeID(c); const t = id && model.tabs.get(id); return t && !t.empty ? { do: 'tab.duplicate', id } : false } },
  { id: 'tabs.copyAddress', title: 'Copy Address', mac: '⇧⌘C', keys: ['Ctrl+Shift+C'], phase: 'later', needs: { do: 'address.copy' } as never },
  { id: 'tabs.pasteAndGo', title: 'Paste and Go', mac: '⇧⌘V', keys: ['Ctrl+Shift+V'], phase: 'later', needs: { do: 'address.pasteAndGo' } as never },
  { id: 'tabs.mute', title: 'Stop Sound in Tab', mac: '⇧⌘M', keys: ['Ctrl+Shift+M'], phase: 'later', needs: { do: 'tab.stopSound' } as never },
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((n): Binding => ({ id: `tabs.${n}`, title: `Tab ${n}`, mac: `⌘${n}`, keys: [`Ctrl+${D(n)}`], phase: 'first', action: c => nth(c, n - 1) })),
  { id: 'tabs.last', title: 'Last Tab', mac: '⌘9', keys: ['Ctrl+9'], phase: 'first', action: c => nth(c, -1) },
  // Bookmarks
  { id: 'bookmarks.add', title: 'Add This Page', mac: '⇧⌘B', keys: ['Ctrl+Shift+B'], phase: 'later', needs: { do: 'bookmarks.add' } as never },
  { id: 'bookmarks.show', title: 'Show Bookmarks…', mac: '', keys: ['Ctrl+Shift+O'], phase: 'later', needs: { do: 'bookmarks.show' } as never },
  // History
  { id: 'history.show', title: 'Show History…', mac: '⌘Y', keys: ['Ctrl+H'], phase: 'later', needs: { do: 'history.show' } as never },
  { id: 'history.downloads', title: 'Downloads…', mac: '⇧⌘J', keys: ['Ctrl+J'], phase: 'later', needs: { do: 'downloads.show' } as never },
  { id: 'history.clearData', title: 'Clear Browsing Data…', mac: '⇧⌘⌫', keys: ['Ctrl+Shift+Delete'], phase: 'first', needs: { do: 'history.clearData' } as never },
  // Spaces: ⌃1-⌃9 on the Mac, Alt+1-9 here (Ctrl+1-9 are the tabs')
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n): Binding => ({
    id: `spaces.${n}`, title: `Space ${n}`, mac: `⌃${n}`, keys: [`Alt+${D(n)}`], phase: 'first',
    action: () => { const s = model.spaces[n - 1]; return s && model.spaces.length > 1 ? { do: 'space.select', id: s.id } : false },
  })),
  // Fixed keys
  { id: 'escape', title: 'Escape', mac: 'Esc', keys: ['Escape'], phase: 'first', action: c => escapeKey(c) },
  { id: 'stop', title: 'Stop Loading', mac: '', keys: ['Escape'], phase: 'later', action: () => ({ do: 'tab.stop' }) },
  { id: 'pin.home', title: 'Back to the Pinned Page', mac: '', keys: ['Alt+Home'], phase: 'later', action: c => { const id = activeID(c); const t = id && model.tabs.get(id); return t && t.pinID ? { do: 'pin.home', id: t.pinID } : false } },
]

const extra: { first: [string, Action][]; later: [string, Action][] } = { first: [], later: [] }

/** Modules add shortcuts from their own files. A module's own wins over the
 * table's for the same chord. */
export function shortcut(name: string, phase: 'first' | 'later', action: Action): void {
  const list = extra[phase]
  const at = list.findIndex(([n]) => n === name)
  if (at >= 0) list.splice(at, 1)
  list.unshift([name, action])
}

/** Whether a binding's command exists now. */
export function live(b: Binding): boolean {
  if (b.action) return true
  return !!b.needs && handled().includes(b.needs.do)
}

export function findBinding(name: string, phase: 'first' | 'later'): Binding | undefined {
  return bindings.find(b => b.phase === phase && b.keys.includes(name) && live(b))
}

export function findAction(name: string, phase: 'first' | 'later'): Action | undefined {
  const own = extra[phase].find(([n]) => n === name)?.[1]
  if (own) return own
  const b = findBinding(name, phase)
  if (!b) return undefined
  return b.action ?? (() => b.needs!)
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
    const b = findBinding(name, phase)
    if (k.repeat && b?.once) return true
    const result = action(c, k)
    if (result === false) continue
    if (result && typeof result === 'object') void run(result as never, { window: c }).catch(e => console.warn('[keys]', e))
    return true
  }
  return false
}

/** before-input-event of a page or of the interface. True when Search took the key. */
export function onInput(c: WindowController, input: Electron.Input, fromPage: boolean, from?: WebContents): boolean {
  if (input.type === 'keyUp') {
    // Ctrl let go of after ⌘K walked the list: go there.
    if (input.key === 'Control' || (process.platform === 'darwin' && input.key === 'Meta')) controlUp(c)
    return false
  }
  if (input.type !== 'keyDown' || input.isComposing) return false
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

/** For the field: whether it is up, without importing the field from elsewhere. */
export { fieldShowing }

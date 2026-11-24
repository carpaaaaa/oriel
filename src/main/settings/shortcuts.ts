// Settings › Keyboard & Mouse › Shortcuts (ShortcutsPage.swift, Shortcuts.swift
// ShortcutStore; studio/03 §4.1, §4.2): every command of keys.ts's table with
// its Windows key, a card to a menu; a key pressed in a command's box moves
// there from whichever command had it, after "press again"; Clear, Reset,
// Reset All. Only differences from the table are kept, under `shortcuts`,
// as keys.ts reads them: { id: { keys: [chord] | null } }. Extensions'
// commands are kept the same way as "ext:<extension>:<command>".

import { bindings, canonical, chordName, hasKey, keysOf, live, reserved, standAside, type Binding } from '../keys'
import { extensionCommands, rebindAll } from '../extensions/commands'
import type { ShortcutLine, ShortcutsView } from '../../shared/modules/settings'
import { model } from '../model/model'
import { handle } from '../router'
import { need } from '../context'
import { runtimes } from '../views/tabs'
import { pref, setKey } from './prefs'

/** Command.Section, in the menus' order. */
const SECTIONS = ['Search', 'File', 'Edit', 'View', 'Tabs', 'Spaces', 'Profiles', 'Bookmarks', 'History'] as const
const AI = new Set(['view.summarize', 'view.ask'])
const DUSK = new Set(['view.dusk', 'view.duskPause'])
/** A command whose other keys are the same key spelled otherwise: ⌘+ is
 * ⇧⌘= on some keyboards (KeyCombo.init), so a new key takes all their place. */
const SAME_KEY = new Set(['view.zoomIn'])
/** Never an extension's: closing, a new tab or window (KeyCombo.isBrowserOnly). */
const BROWSER_ONLY = /^Ctrl\+(Shift\+)?(Alt\+)?[WTN]$/

type Changed = Record<string, { keys: string[] | null }>
const changed = (): Changed => ({ ...(pref<Changed>('shortcuts') ?? {}) })
function save(c: Changed): void {
  setKey('shortcuts', c)
  // A key moved among Oriel's can free or take an extension's.
  rebindAll()
}

/** A chord as Windows writes it: Ctrl, Alt, Shift, then the key. */
export function display(chord: string): string {
  const c = canonical(chord)
  const plus = c.endsWith('++')
  const parts = (plus ? c.slice(0, -2) : c).split('+').filter(Boolean)
  const key = plus ? '+' : parts.pop() ?? ''
  return [parts.includes('Ctrl') && 'Ctrl', parts.includes('Alt') && 'Alt', parts.includes('Shift') && 'Shift', key].filter(Boolean).join('+')
}
const keyOf = (name: string) => (name.endsWith('++') ? '+' : name.split('+').pop() ?? '')

const swapped = () => !!pref('spaces') && !!pref('spaces.commandNumbers')
/** Not changed here: the Mac's own (Quit, Full Screen) and keys.ts's fixed
 * section (Escape, Alt+F4, Ctrl+Shift+Tab...). Not listed either, as the
 * Mac's Command.all hasn't them; only Tab 1 to 9 is shown (FixedKey). */
const fixed = (b: Binding) => !!b.fixed || b.section === 'Fixed'

/** In the list, as the Mac's ShortcutsPage.shown: what has nothing behind it
 * here, or belongs to a feature turned off, isn't listed. */
function shown(b: Binding): boolean {
  if (fixed(b) || !live(b)) return false
  if (b.section === 'Spaces' && !pref('spaces')) return false
  if (b.section === 'Profiles' || AI.has(b.id)) return false
  if (DUSK.has(b.id) && !pref('pages.dusk')) return false
  if (b.id === 'history.archive' && !(Number(pref('tabs.close.after') ?? 0) > 0)) return false
  if (b.id === 'view.capture' && !pref('pages.capture')) return false
  if (b.id === 'view.style' && !pref('sites.styles')) return false
  return true
}

function lineOf(b: Binding, c: Changed): ShortcutLine {
  // Swapped (Spaces & Pins), a space's own key is Ctrl+n (tabs/wiring.ts).
  const own = keysOf(b)
  const keys = (swapped() && !c[b.id] && /^spaces\.[1-9]$/.test(b.id) ? own.map(k => k.replace(/^Alt\+/, 'Ctrl+')) : own).map(display)
  return { id: b.id, title: b.title, key: keys[0] ?? null, also: keys.slice(1), changed: !!c[b.id] }
}

/** An extension's command's key unless changed: its manifest's, while that
 * isn't one Oriel keeps (ShortcutStore.defaultKey). */
function extDefault(manifestKey: string | null): string[] {
  if (!manifestKey || BROWSER_ONLY.test(manifestKey) || reserved(manifestKey)) return []
  return bindings.some(b => hasKey(b, manifestKey)) ? [] : [manifestKey]
}

function view(): ShortcutsView {
  const c = changed()
  const sections = SECTIONS.map(name => ({ name, lines: bindings.filter(b => b.section === name && shown(b)).map(b => lineOf(b, c)) }))
  const note = pref('spaces') && swapped()
    ? 'The ninth is the last. Ctrl+1 to Ctrl+9 switch spaces: Settings › Spaces & Pins'
    : pref('spaces') ? 'The ninth is the last. To switch spaces with them instead: Settings › Spaces & Pins'
      : 'The ninth is the last. With spaces on, they can switch spaces instead'
  return {
    sections,
    numbers: { keys: swapped() ? 'Alt+1 to Alt+9' : 'Ctrl+1 to Ctrl+9', note },
    extensions: extensionCommands().map(e => ({ id: e.id, title: e.title, detail: e.extension, key: e.key ? display(e.key) : null, also: [], changed: !!c[e.id] })),
    changed: Object.keys(c).length > 0 || (pref<string>('links.peekClick') ?? 'shift') !== 'shift',
  }
}

// the store (ShortcutStore)

const isExt = (id: string) => id.startsWith('ext:')

function defaultsOf(id: string): string[] {
  if (isExt(id)) return extDefault(extensionCommands().find(e => e.id === id)?.manifestKey ?? null)
  return bindings.find(b => b.id === id)?.keys.map(canonical) ?? []
}

function keysNow(c: Changed, id: string): string[] {
  if (c[id]) return (c[id].keys ?? []).map(canonical)
  if (isExt(id)) { const k = extensionCommands().find(e => e.id === id)?.key; return k ? [k] : [] }
  return defaultsOf(id)
}

/** Windows' other keys for a command (Close Tab's Ctrl+F4, Reload's F5),
 * kept beside a new key: the ones it has now, or, after Clear Shortcut,
 * the table's that no other command has taken. */
function extrasOf(c: Changed, id: string): string[] {
  if (isExt(id) || SAME_KEY.has(id)) return []
  if (c[id] && !c[id].keys) return defaultsOf(id).slice(1).filter(k => !owner(k, id))
  return keysNow(c, id).slice(1)
}

/** Only a difference from the default is kept. */
function setFor(c: Changed, id: string, keys: string[]): void {
  const d = defaultsOf(id)
  if (keys.length === d.length && keys.every((k, i) => k === d[i])) delete c[id]
  else c[id] = { keys: keys.length ? keys : null }
}

/** The command already on `name`, other than `except`: Oriel's or an extension's. */
function owner(name: string, except: string): { id: string; title: string } | null {
  for (const b of bindings) if (!fixed(b) && b.id !== except && hasKey(b, name)) return { id: b.id, title: b.title }
  for (const e of extensionCommands()) if (e.id !== except && e.key && canonical(e.key) === name) return { id: e.id, title: e.title }
  return null
}

const fixedKey = (name: string) => bindings.some(b => fixed(b) && hasKey(b, name))

handle('settings.shortcuts', () => view())

handle('settings.shortcutKey', ({ id, chord, again }) => {
  const known = isExt(id) ? extensionCommands().some(e => e.id === id) : bindings.some(b => b.id === id && !fixed(b))
  if (!known) throw new Error(`no command ${id}`)
  const name = chordName(chord)
  // Ctrl+Alt is AltGr on Windows: it types (keys.ts chordName).
  if (!name) return { problem: chord.ctrl && chord.alt && !chord.meta ? 'Ctrl+Alt types characters on many keyboards' : null }
  const mods = name.split('+').slice(0, -1)
  const key = keyOf(name)
  const usable = mods.includes('Ctrl') || mods.includes('Alt') || /^F([1-9]|1[0-2])$/.test(key)
  if (!usable) return { problem: 'Add Ctrl or Alt' }
  // The keys that pick a tab move all together, with their switch.
  if ((swapped() ? /^Alt\+[1-9]$/ : /^Ctrl\+[1-9]$/).test(name)) return { problem: pref('spaces') ? 'Picks a tab, see Spaces & Pins' : 'Picks a tab' }
  if (reserved(name) || fixedKey(name)) return { problem: "Can't be changed" }
  // The switcher stays up while its key's Ctrl or Alt is held.
  if (id === 'tabs.recent' && !mods.includes('Ctrl') && !mods.includes('Alt')) return { problem: 'Hold Ctrl or Alt with it' }
  // An extension's command takes a key as its manifest would.
  if (isExt(id) && (key.length !== 1 || BROWSER_ONLY.test(name))) return { problem: 'Not for an extension' }
  const other = owner(name, id)
  if (other && again !== name) return { owner: other.title, name: display(name), again: name }
  const c = changed()
  if (other) setFor(c, other.id, keysNow(c, other.id).filter(k => k !== name))
  // The key in the box changes; Windows' other keys for it stay.
  setFor(c, id, [name, ...extrasOf(c, id).filter(k => k !== name)])
  save(c)
  return { done: true, said: other ? `${display(name)} moved from ${other.title}` : null }
})

handle('settings.shortcutClear', ({ id }) => {
  const c = changed()
  setFor(c, id, [])
  save(c)
})

/** Its default back, taken from whichever command had it since. */
handle('settings.shortcutReset', ({ id }) => {
  const c = changed()
  for (const k of defaultsOf(id)) {
    const other = owner(k, id)
    if (other) setFor(c, other.id, keysNow(c, other.id).filter(x => x !== k))
  }
  delete c[id]
  save(c)
})

/** Reset All to Defaults: the peek's click back to Shift too. */
handle('settings.shortcutResetAll', () => {
  save({})
  setKey('links.peekClick', 'shift')
})

handle('settings.recordKeys', ({ on }, ctx) => {
  const c = need(ctx)
  const ids = model.spaceTabs(c.record)
  const active = c.record.active[c.record.space]
  const id = active && model.tabs.get(active)?.internal === 'settings' ? active : ids.find(t => model.tabs.get(t)?.internal === 'settings')
  const wc = id ? runtimes.get(id)?.contents : null
  if (wc && !wc.isDestroyed()) standAside(wc, !!on)
})

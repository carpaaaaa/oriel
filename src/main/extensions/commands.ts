// chrome.commands (studio/04 §2.3 "Comandi da tastiera delle estensioni",
// checklist B P0): each command of the manifest with a suggested key gets it
// (the "windows" one, else "default") unless the key is Oriel's own, one the
// system keeps, Ctrl+W, Ctrl+T, Ctrl+N or their Shift and Alt variants, or
// already another extension's; then it stays without a key, as on the Mac.
// A key given in Settings › Shortcuts wins over the manifest's, kept as a
// difference under `shortcuts` as "ext:<extension>:<command>" (Shortcuts.swift
// ShortcutStore.adopt). Keys go through keys.ts like Oriel's own, before the
// page, as in Chrome, and are given back when the extension goes. getAll
// answers with the key given; onCommand reaches the extension through
// electron-chrome-extensions' event channel, whose preload defines
// chrome.commands. _execute_action presses the extension's button.

import type { ElectronChromeExtensions } from 'electron-chrome-extensions'
import { shortcut, unshortcut, findAction, reserved, type Action } from '../keys'
import { model } from '../model/model'
import type { WindowController } from '../views/window'
import { handleApi, sendEvent, activeTab, tabDetails } from './lib'
import { localize } from './ask'
import { press } from './ui'

interface Command { name: string; description: string; shortcut: string; chord: string | null }

const EXECUTE = new Set(['_execute_action', '_execute_browser_action', '_execute_page_action'])
const KEPT = /^Ctrl\+(Shift\+)?(Alt\+)?[WTN]$/

/** Bound chords: "Ctrl+Shift+Y" → which extension's command, and the action
 * put in keys.ts for it. */
const bound = new Map<string, { extensionId: string; command: string; action: Action }>()
const byExtension = new Map<string, Command[]>()
const loaded = new Map<string, Electron.Extension>()

const KEYS: Record<string, string> = {
  Comma: ',', Period: '.', Space: 'Space', Up: 'Up', Down: 'Down', Left: 'Left', Right: 'Right',
  Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown', Insert: 'Insert', Delete: 'Delete',
  MediaNextTrack: 'MediaTrackNext', MediaPrevTrack: 'MediaTrackPrevious', MediaPlayPause: 'MediaPlayPause', MediaStop: 'MediaStop',
}

/** "Alt+Shift+P" (Chrome's spelling) → "Shift+Alt+P" (keys.ts' chordName). */
export function toChord(suggested: string): string | null {
  const parts = suggested.split('+').map(s => s.trim())
  const key = parts.pop() ?? ''
  let ctrl = false, shift = false, alt = false
  for (const m of parts) {
    if (m === 'Ctrl' || m === 'Command' || m === 'MacCtrl') ctrl = true
    else if (m === 'Shift') shift = true
    else if (m === 'Alt') alt = true
    else return null
  }
  let name: string
  if (/^[A-Za-z0-9]$/.test(key)) name = key.toUpperCase()
  else if (key in KEYS) name = KEYS[key]
  else if (/^F([1-9]|1[0-2])$/.test(key)) name = key
  else return null
  const media = name.startsWith('Media')
  if (!media && !ctrl && !alt) return null // Chrome wants Ctrl or Alt
  return [ctrl && 'Ctrl', shift && 'Shift', alt && 'Alt', name].filter(Boolean).join('+')
}

/** "Shift+Alt+P" → "Alt+Shift+P", as Chrome's getAll writes a key. */
function chromeSpelling(chord: string): string {
  const parts = chord.split('+')
  const key = parts.pop()!
  return [parts.includes('Ctrl') && 'Ctrl', parts.includes('Alt') && 'Alt', parts.includes('Shift') && 'Shift', key].filter(Boolean).join('+')
}

/** The id Settings › Shortcuts knows an extension's command by. */
export const commandId = (extensionId: string, command: string) => `ext:${extensionId}:${command}`

/** The key Settings gave this command: a chord, null for none, undefined
 * when it was never changed there. */
function given(extensionId: string, command: string): string | null | undefined {
  const o = (model.pref<Record<string, { keys: string[] | null }>>('shortcuts') ?? {})[commandId(extensionId, command)]
  return o ? o.keys?.[0] ?? null : undefined
}

let library: ElectronChromeExtensions | null = null

function run(chord: string, c: WindowController): boolean {
  const b = bound.get(chord)
  if (!b || !library) return false
  if (EXECUTE.has(b.command)) press(c, b.extensionId)
  else sendEvent(library, b.extensionId, 'commands.onCommand', b.command, tabDetails(library, activeTab(library)))
  return true
}

export function bindCommands(ext: Electron.Extension): void {
  loaded.set(ext.id, ext)
  const commands = (ext.manifest as { commands?: Record<string, { suggested_key?: Record<string, string>; description?: string }> }).commands ?? {}
  const list: Command[] = []
  for (const [name, cmd] of Object.entries(commands)) {
    const suggested = cmd?.suggested_key?.windows ?? cmd?.suggested_key?.default
    const yours = given(ext.id, name)
    let chord: string | null
    let free: boolean
    if (yours !== undefined) {
      // Checked when it was given (settings/shortcuts.ts): only another
      // extension holding it now, or a key Windows keeps, stops it.
      chord = yours
      free = !!chord && !reserved(chord) && !bound.has(chord)
    } else {
      chord = suggested ? toChord(suggested) : null
      free = !!chord && !KEPT.test(chord) && !reserved(chord) && !bound.has(chord) && !findAction(chord, 'first') && !findAction(chord, 'later')
    }
    let text = ''
    if (chord && free) {
      const key = chord
      const action: Action = c => run(key, c)
      bound.set(key, { extensionId: ext.id, command: name, action })
      shortcut(key, 'first', action, true)
      text = chromeSpelling(key)
    }
    list.push({ name, description: localize(ext.path, ext.manifest as never, cmd?.description), shortcut: text, chord: chord && free ? chord : null })
  }
  byExtension.set(ext.id, list)
}

export function unbindCommands(ext: Electron.Extension): void {
  byExtension.delete(ext.id)
  loaded.delete(ext.id)
  for (const [chord, b] of [...bound]) if (b.extensionId === ext.id) {
    bound.delete(chord)
    unshortcut(chord, b.action)
  }
}

/** Every extension's commands bound again, after a key changed in Settings. */
export function rebindAll(): void {
  const all = [...loaded.values()]
  for (const ext of all) unbindCommands(ext)
  for (const ext of all) bindCommands(ext)
}

/** The commands extensions bring, for Settings › Shortcuts: each with its
 * key now and the one its manifest asks for (ShortcutStore.extensionCommands). */
export function extensionCommands(): { id: string; extension: string; title: string; key: string | null; manifestKey: string | null }[] {
  return [...byExtension].sort(([a], [b]) => a.localeCompare(b)).flatMap(([extensionId, list]) => {
    const ext = loaded.get(extensionId)
    const commands = (ext?.manifest as { commands?: Record<string, { suggested_key?: Record<string, string> }> } | undefined)?.commands ?? {}
    return list.map(c => {
      const suggested = commands[c.name]?.suggested_key?.windows ?? commands[c.name]?.suggested_key?.default
      return {
        id: commandId(extensionId, c.name),
        extension: ext?.name ?? extensionId,
        title: c.description || (EXECUTE.has(c.name) ? 'Activate the extension' : c.name),
        key: c.chord,
        manifestKey: suggested ? toChord(suggested) : null,
      }
    })
  })
}

export function setupCommands(e: ElectronChromeExtensions): void {
  library = e
  handleApi(e, 'commands.getAll', extension => (byExtension.get(extension.id) ?? []).map(({ name, description, shortcut: s }) => ({ name, description, shortcut: s })))
}

/** For the bench. */
export function boundCommands(): Record<string, { extensionId: string; command: string }> {
  return Object.fromEntries([...bound].map(([k, v]) => [k, { extensionId: v.extensionId, command: v.command }]))
}

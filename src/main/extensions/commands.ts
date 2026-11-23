// chrome.commands (studio/04 §2.3 "Comandi da tastiera delle estensioni",
// checklist B P0): each command of the manifest with a suggested key gets it
// (the "windows" one, else "default") unless the key is Oriel's own, one the
// system keeps, Ctrl+W, Ctrl+T, Ctrl+N or their Shift and Alt variants, or
// already another extension's; then it stays without a key, as on the Mac.
// Keys go through keys.ts like Oriel's own, before the page, as in Chrome,
// and are given back when the extension goes. getAll answers with the key
// given; onCommand reaches the extension through electron-chrome-extensions'
// event channel, whose preload defines chrome.commands. _execute_action
// presses the extension's button.

import type { ElectronChromeExtensions } from 'electron-chrome-extensions'
import { shortcut, unshortcut, findAction, reserved, type Action } from '../keys'
import type { WindowController } from '../views/window'
import { handleApi, sendEvent, activeTab, tabDetails } from './lib'
import { localize } from './ask'
import { press } from './ui'

interface Command { name: string; description: string; shortcut: string }

const EXECUTE = new Set(['_execute_action', '_execute_browser_action', '_execute_page_action'])
const KEPT = /^Ctrl\+(Shift\+)?(Alt\+)?[WTN]$/

/** Bound chords: "Ctrl+Shift+Y" → which extension's command, and the action
 * put in keys.ts for it. */
const bound = new Map<string, { extensionId: string; command: string; action: Action }>()
const byExtension = new Map<string, Command[]>()

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

let library: ElectronChromeExtensions | null = null

function run(chord: string, c: WindowController): boolean {
  const b = bound.get(chord)
  if (!b || !library) return false
  if (EXECUTE.has(b.command)) press(c, b.extensionId)
  else sendEvent(library, b.extensionId, 'commands.onCommand', b.command, tabDetails(library, activeTab(library)))
  return true
}

export function bindCommands(ext: Electron.Extension): void {
  const commands = (ext.manifest as { commands?: Record<string, { suggested_key?: Record<string, string>; description?: string }> }).commands ?? {}
  const list: Command[] = []
  for (const [name, cmd] of Object.entries(commands)) {
    const suggested = cmd?.suggested_key?.windows ?? cmd?.suggested_key?.default
    let given = ''
    const chord = suggested ? toChord(suggested) : null
    const free = chord && !KEPT.test(chord) && !reserved(chord) && !bound.has(chord) && !findAction(chord, 'first') && !findAction(chord, 'later')
    if (chord && free) {
      const action: Action = c => run(chord, c)
      bound.set(chord, { extensionId: ext.id, command: name, action })
      shortcut(chord, 'first', action)
      given = suggested!
    }
    list.push({ name, description: localize(ext.path, ext.manifest as never, cmd?.description), shortcut: given })
  }
  byExtension.set(ext.id, list)
}

export function unbindCommands(ext: Electron.Extension): void {
  byExtension.delete(ext.id)
  for (const [chord, b] of [...bound]) if (b.extensionId === ext.id) {
    bound.delete(chord)
    unshortcut(chord, b.action)
  }
}

export function setupCommands(e: ElectronChromeExtensions): void {
  library = e
  handleApi(e, 'commands.getAll', extension => byExtension.get(extension.id) ?? [])
}

/** For the bench. */
export function boundCommands(): Record<string, { extensionId: string; command: string }> {
  return Object.fromEntries([...bound].map(([k, v]) => [k, { extensionId: v.extensionId, command: v.command }]))
}

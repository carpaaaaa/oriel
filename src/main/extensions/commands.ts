// chrome.commands (studio/04 §2.3 "Comandi da tastiera delle estensioni",
// checklist B P0): each command of the manifest with a suggested key gets it
// (the "windows" one, else "default") unless the key is Search's own, a
// reserved one (Ctrl+W, Ctrl+T, Ctrl+N and their Shift and Alt variants) or
// already another extension's; then it stays without a key, as on the Mac.
// Keys go through keys.ts like Search's own, before the page, as in Chrome.
// getAll answers with the key given; onCommand reaches the extension through
// electron-chrome-extensions' event channel, whose preload defines
// chrome.commands. _execute_action presses the extension's button.

import fs from 'node:fs'
import path from 'node:path'
import type { ElectronChromeExtensions } from 'electron-chrome-extensions'
import { shortcut, findAction } from '../keys'
import type { WindowController } from '../views/window'
import { handleApi, sendEvent, activeTab, tabDetails, pressAction } from './lib'

interface Command { name: string; description: string; shortcut: string }

const EXECUTE = new Set(['_execute_action', '_execute_browser_action', '_execute_page_action'])
const RESERVED = /^Ctrl\+(Shift\+)?(Alt\+)?[WTN]$/

/** Bound chords: "Ctrl+Shift+Y" → which extension's command. */
const bound = new Map<string, { extensionId: string; command: string }>()
/** Chords this module put in keys.ts (keys.ts has no removal yet). */
const ours = new Set<string>()
const byExtension = new Map<string, Command[]>()

const KEYS: Record<string, string> = {
  Comma: ',', Period: '.', Space: ' ', Up: 'ArrowUp', Down: 'ArrowDown', Left: 'Left', Right: 'Right',
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

/** "__MSG_name__" in the extension's default language. */
function localize(ext: Electron.Extension, text: string | undefined): string {
  const m = /^__MSG_(\w+)__$/.exec(text ?? '')
  if (!m) return text ?? ''
  const locale = (ext.manifest as { default_locale?: string }).default_locale ?? 'en'
  try {
    const messages = JSON.parse(fs.readFileSync(path.join(ext.path, '_locales', locale, 'messages.json'), 'utf8'))
    const entry = Object.entries(messages).find(([k]) => k.toLowerCase() === m[1].toLowerCase())?.[1] as { message?: string } | undefined
    return entry?.message ?? ''
  } catch { return '' }
}

let library: ElectronChromeExtensions | null = null

function run(chord: string, c: WindowController): null {
  const b = bound.get(chord)
  if (!b || !library) return null
  const tab = activeTab(library)
  if (EXECUTE.has(b.command)) {
    // No button on screen yet: the popup hangs from the window's top right,
    // the Mac's fallback (studio/04 §2.4).
    const { width } = c.base.getContentBounds()
    if (tab) pressAction(library, b.extensionId, tab.id, { x: width - 60, y: 40, width: 1, height: 1 })
  } else {
    sendEvent(library, b.extensionId, 'commands.onCommand', b.command, tabDetails(library, tab))
  }
  return null
}

export function bindCommands(ext: Electron.Extension): void {
  const commands = (ext.manifest as { commands?: Record<string, { suggested_key?: Record<string, string>; description?: string }> }).commands ?? {}
  const list: Command[] = []
  for (const [name, cmd] of Object.entries(commands)) {
    const suggested = cmd?.suggested_key?.windows ?? cmd?.suggested_key?.default
    let given = ''
    const chord = suggested ? toChord(suggested) : null
    const free = chord && !RESERVED.test(chord) && !bound.has(chord)
      && (ours.has(chord) || (!findAction(chord, 'first') && !findAction(chord, 'later')))
    if (chord && free) {
      bound.set(chord, { extensionId: ext.id, command: name })
      if (!ours.has(chord)) { ours.add(chord); shortcut(chord, 'first', c => run(chord, c)) }
      given = suggested!
    }
    list.push({ name, description: localize(ext, cmd?.description), shortcut: given })
  }
  byExtension.set(ext.id, list)
}

export function unbindCommands(ext: Electron.Extension): void {
  byExtension.delete(ext.id)
  for (const [chord, b] of bound) if (b.extensionId === ext.id) bound.delete(chord)
}

export function setupCommands(e: ElectronChromeExtensions): void {
  library = e
  handleApi(e, 'commands.getAll', extension => byExtension.get(extension.id) ?? [])
}

/** For the bench. */
export function boundCommands(): Record<string, { extensionId: string; command: string }> {
  return Object.fromEntries(bound)
}

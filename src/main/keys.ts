// Keyboard shortcuts. On Windows ⌘ becomes Ctrl (studio/03 table "Mac →
// Windows"); spaces move to Alt+1-9 so they don't fight Ctrl+1-9.
// Letters are read by the character they type (event.key), digits and
// punctuation by the key's place (event.code), and AltGr is never a shortcut,
// so Italian and other European layouts keep their brackets and €.
//
// Search takes a few keys before the page (as Chrome does: Ctrl+T, Ctrl+W,
// Ctrl+L, Ctrl+N, Ctrl+Tab...); the rest only when the page leaves them alone
// (the page preload reports those: "page first", studio/03 §1.41).

import type { WebContents } from 'electron'
import { run } from './router'
import type { Command } from '../shared/commands'
import type { WindowController } from './views/window'
import { model } from './model/model'

export interface Chord { ctrl: boolean; shift: boolean; alt: boolean; meta: boolean; key: string; code: string; altGraph?: boolean }

type Action = (c: WindowController) => Command | null | void

const first: [string, Action][] = [
  ['Ctrl+T', () => ({ do: 'tab.new' })],
  ['Ctrl+N', () => ({ do: 'window.new' })],
  ['Ctrl+Shift+N', () => ({ do: 'window.new', shy: true })],
  ['Ctrl+W', c => { const id = c.record.active[c.record.space]; return id ? { do: 'tab.close', id } : null }],
  ['Ctrl+F4', c => { const id = c.record.active[c.record.space]; return id ? { do: 'tab.close', id } : null }],
  ['Ctrl+Shift+T', () => ({ do: 'tab.reopen' })],
  ['Ctrl+L', () => ({ do: 'field.open', target: 'here' })],
  ['Alt+D', () => ({ do: 'field.open', target: 'here' })],
  ['F6', () => ({ do: 'field.open', target: 'here' })],
  ['Ctrl+Tab', c => step(c, 1)],
  ['Ctrl+Shift+Tab', c => step(c, -1)],
  ['Ctrl+PageDown', c => step(c, 1)],
  ['Ctrl+PageUp', c => step(c, -1)],
  ['Ctrl+S', () => ({ do: 'sidebar.toggle' })],
]

const later: [string, Action][] = [
  ['Ctrl+R', () => ({ do: 'tab.reload' })],
  ['F5', () => ({ do: 'tab.reload' })],
  ['Ctrl+Shift+R', () => ({ do: 'tab.reload', hard: true })],
  ['Ctrl+F5', () => ({ do: 'tab.reload', hard: true })],
  ['Alt+Left', () => ({ do: 'tab.back' })],
  ['Alt+Right', () => ({ do: 'tab.forward' })],
  ['Ctrl+[', () => ({ do: 'tab.back' })],
  ['Ctrl+]', () => ({ do: 'tab.forward' })],
  ['Escape', c => (c.record.field.open ? { do: 'field.close' } : { do: 'tab.stop' })],
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((n): [string, Action] => [`Ctrl+${n}`, c => nth(c, n - 1)]),
  ['Ctrl+9', c => nth(c, -1)],
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n): [string, Action] => [`Alt+${n}`, () => { const s = model.spaces[n - 1]; return s ? { do: 'space.select', id: s.id } : null }]),
]

function step(c: WindowController, by: number): Command | null {
  const ids = model.spaceTabs(c.record)
  if (!ids.length) return null
  const i = ids.indexOf(c.record.active[c.record.space] ?? '')
  return { do: 'tab.select', id: ids[(i + by + ids.length) % ids.length] }
}

function nth(c: WindowController, n: number): Command | null {
  const ids = model.spaceTabs(c.record)
  const id = n < 0 ? ids[ids.length - 1] : ids[n]
  return id ? { do: 'tab.select', id } : null
}

const digits: Record<string, string> = { Digit1: '1', Digit2: '2', Digit3: '3', Digit4: '4', Digit5: '5', Digit6: '6', Digit7: '7', Digit8: '8', Digit9: '9', Digit0: '0', BracketLeft: '[', BracketRight: ']' }

/** "Ctrl+Shift+T" for a chord, or null when it can't be a shortcut. */
export function chordName(k: Chord): string | null {
  if (k.altGraph) return null
  let key = digits[k.code] ?? k.key
  if (key.length === 1) key = key.toUpperCase()
  if (key === 'ArrowLeft') key = 'Left'
  if (key === 'ArrowRight') key = 'Right'
  if (['Control', 'Shift', 'Alt', 'Meta', 'AltGraph'].includes(key)) return null
  const ctrl = process.platform === 'darwin' ? k.meta || k.ctrl : k.ctrl
  return [ctrl && 'Ctrl', k.shift && 'Shift', k.alt && 'Alt', key].filter(Boolean).join('+')
}

export function findAction(name: string, phase: 'first' | 'later'): Action | undefined {
  return (phase === 'first' ? first : later).find(([n]) => n === name)?.[1]
}

/** before-input-event of a page or of the interface. Returns true when
 * Search took the key. */
export function onInput(c: WindowController, input: Electron.Input, fromPage: boolean): boolean {
  if (input.type !== 'keyDown') return false
  const name = chordName({ ctrl: input.control, shift: input.shift, alt: input.alt, meta: input.meta, key: input.key, code: input.code })
  if (!name) return false
  const action = findAction(name, 'first') ?? (fromPage ? undefined : findAction(name, 'later'))
  if (!action) return false
  const command = action(c)
  if (command) void run(command as never, { window: c }).catch(e => console.warn('[keys]', e))
  return true
}

/** A key the page didn't use (reported by the page preload). */
export function onLeftover(c: WindowController, k: Chord): void {
  const name = chordName(k)
  const action = name && findAction(name, 'later')
  const command = action && action(c)
  if (command) void run(command as never, { window: c }).catch(e => console.warn('[keys]', e))
}

export function wireKeys(c: WindowController, wc: WebContents, fromPage: boolean): void {
  wc.on('before-input-event', (event, input) => { if (onInput(c, input, fromPage)) event.preventDefault() })
}

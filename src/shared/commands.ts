// Every action the interface can ask of the main process. One name, one
// argument object, one reply. Owned by the orchestrator: a module that needs
// a new command asks for it, and its handler lives in the module
// (main/router.ts registers handlers by name).

import type { ID, Rect } from './state'

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
type None = {}

export interface Commands {
  // tabs
  'tab.select': { id: ID }
  'tab.close': { id: ID }
  'tab.new': { url?: string; background?: boolean; after?: ID }
  'tab.go': { id?: ID; input: string }
  'tab.back': { id?: ID }
  'tab.forward': { id?: ID }
  'tab.reload': { id?: ID; hard?: boolean }
  'tab.stop': { id?: ID }
  'tab.move': { id: ID; to: number }
  'tab.pin': { id: ID }
  'tab.unpin': { id: ID }
  'tab.mute': { id: ID; muted: boolean }
  'tab.rename': { id: ID; name: string | null }
  'tab.duplicate': { id: ID }
  'tab.reopen': None
  'tab.sleep': { id: ID }
  'tab.menu': { id: ID; x: number; y: number }
  // pins
  'pin.open': { id: ID }
  'pin.home': { id: ID }
  'pin.remove': { id: ID }
  'pin.move': { id: ID; to: number; folder?: ID | null }
  // spaces
  'space.select': { id: ID }
  'space.step': { by: 1 | -1 }
  'space.new': { name?: string }
  // the field
  'field.open': { target: 'new' | 'here' }
  'field.input': { text: string }
  'field.move': { by: number }
  'field.commit': { index?: number; text?: string; newTab?: boolean }
  'field.close': None
  // the column
  'sidebar.resize': { width: number }
  'sidebar.toggle': None
  'sidebar.fold': { folded: boolean }
  // the window
  'window.minimize': None
  'window.maximize': None
  'window.close': None
  'window.new': { shy?: boolean }
  'window.startDrag': { x: number; y: number }
  'window.menu': { x: number; y: number }
  // layout: where pages go, measured by the interface
  'layout.slots': { slots: { id: ID; rect: Rect; radius: number }[] }
  'overlay.region': { rect: Rect | null; focus?: boolean }
  // menus drawn by the interface
  'menu.pick': { source: string; id: string }
  // settings
  'prefs.set': { key: string; value: unknown }
  // extensions
  'extension.click': { id: ID; anchor: Rect }
  'extension.pin': { id: ID; pinned: boolean }
  // downloads
  'download.open': { id: ID }
  'download.reveal': { id: ID }
  'download.cancel': { id: ID }
  // internal pages ask for data
  'page.data': { kind: string; query?: unknown }
}

export type CommandName = keyof Commands
export type Command = { [K in CommandName]: { do: K } & Commands[K] }[CommandName]

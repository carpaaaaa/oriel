// The window's interface side of the drawn menus: open one, hear what a
// pick asks of this side (an inline rename), know which menu is up.

import { createSignal } from 'solid-js'
import { state } from '../lib/store'
import { listen, post, type Entry } from './bridge'

const [openFor, setOpenFor] = createSignal<string | null>(null)
/** The source of the menu up now ("tab:<id>", "column"...), or null. */
export const menuFor = openFor

let wired = false
const handlers = new Map<string, (id?: string, data?: unknown) => void>()

function wire() {
  if (wired) return
  wired = true
  listen(m => {
    if (m.window !== state.windowID) return
    if (m.type === 'shown') setOpenFor(m.source)
    else if (m.type === 'ui') handlers.get(m.act.ui)?.(m.act.id, m.act.data)
  })
}

const room = () => ({ w: window.innerWidth, h: window.innerHeight })

export function openMenu(entries: Entry[], at: { x: number; y: number }, source: string): void {
  wire()
  setOpenFor(source)
  post({ type: 'menu', window: state.windowID, entries, at, source, room: room() } as never)
}

export function openPanel(panel: string, at: { x: number; y: number }, data?: unknown): void {
  wire()
  post({ type: 'panel', window: state.windowID, panel, at, data, room: room() } as never)
}

/** What a pick sends back here ({ ui: name }). */
export function onPick(name: string, f: (id?: string, data?: unknown) => void): void {
  wire()
  handlers.set(name, f)
}

/** Tell the overlay the window's size, now and as it changes. */
export function sayRoom(): void {
  const say = () => post({ type: 'room', window: state.windowID, w: window.innerWidth, h: window.innerHeight })
  say()
  window.addEventListener('resize', say)
  listen(m => { if (m.type === 'close' && m.window === state.windowID) say() })
}

// Press Esc twice to leave full screen (studio/06 §1.5 #82; FullScreenEscape.swift),
// as in Arc: with the switch on, the first Escape on a page that fills the
// screen, or in the window's own full screen, is kept from the page and from
// Chromium and a reminder comes up over it; a second within two seconds,
// by the keys' own clock, leaves. A key held down sends Escape again and
// again: each is kept and none counts. Leaving full screen another way takes
// the reminder with it. Off: one press leaves a page's full screen, and the
// window's full screen stays, as Search's does with the switch off.

import type { WebContents } from 'electron'
import { model } from '../model/model'
import { allControllers, controllerFor, type WindowController } from '../views/window'
import { pref } from './facts'

export const WITHIN = 2000

/** Pages filling the screen (Chromium's HTML full screen). */
const filling = new Set<WebContents>()
let waiting: { wc: WebContents; until: number; timer: NodeJS.Timeout } | null = null
/** The key-up of a press kept from the page is kept too. */
const keepUp = new WeakSet<WebContents>()

/** Whether the reminder is up, for the bench. */
export const reminder = { showing: false, shown: 0 }

function windowOf(wc: WebContents): WindowController | undefined {
  return allControllers().find(c => c.base.contentView.children.some(v => (v as Electron.WebContentsView).webContents === wc))
}

function tell(wc: WebContents, show: boolean): void {
  reminder.showing = show
  if (show) reminder.shown++
  if (!wc.isDestroyed()) wc.send('pages:esc-reminder', show)
}

function endWait(): void {
  if (!waiting) return
  clearTimeout(waiting.timer)
  tell(waiting.wc, false)
  waiting = null
}

function onKey(wc: WebContents, event: Electron.Event, input: Electron.Input): void {
  if (input.key !== 'Escape' || input.control || input.alt || input.meta || input.shift) return
  if (input.type === 'keyUp') {
    if (keepUp.has(wc)) { keepUp.delete(wc); event.preventDefault() }
    return
  }
  if (input.type !== 'keyDown' || !pref<boolean>('fullscreen.escapeTwice')) return
  const page = filling.has(wc)
  const c = windowOf(wc)
  const win = !page && !!c?.frame.isFullScreen()
  if (!page && !win) return
  if (input.isAutoRepeat) { event.preventDefault(); keepUp.add(wc); return }
  const now = Date.now()
  if (waiting && waiting.wc === wc && now < waiting.until) {
    endWait()
    // The second press: a page's full screen is Chromium's to leave on it.
    if (win) { event.preventDefault(); c!.frame.setFullScreen(false) }
    return
  }
  endWait()
  event.preventDefault()
  keepUp.add(wc)
  waiting = { wc, until: now + WITHIN, timer: setTimeout(() => endWait(), WITHIN) }
  tell(wc, true)
}

const wired = new WeakSet<WebContents>()

/** Every page, once (page.ts calls this as a page's preload first asks). */
export function watchEscape(wc: WebContents): void {
  if (wired.has(wc)) return
  wired.add(wc)
  wc.on('before-input-event', (event, input) => onKey(wc, event, input))
  wc.on('enter-html-full-screen', () => filling.add(wc))
  wc.on('leave-html-full-screen', () => {
    filling.delete(wc)
    if (waiting?.wc === wc) endWait()
  })
  wc.once('destroyed', () => { filling.delete(wc); if (waiting?.wc === wc) endWait() })
}

// The window's own full screen left another way (F11, the menu).
model.on('window-opened', (id: string) => setImmediate(() => {
  controllerFor(id)?.base.on('leave-full-screen', () => { if (waiting && !filling.has(waiting.wc)) endWait() })
}))

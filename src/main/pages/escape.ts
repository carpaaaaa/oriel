// Press Esc twice to leave full screen (studio/06 §1.5 #82; FullScreenEscape.swift),
// as in Arc: with the switch on, the first Escape on a page that fills the
// screen, or in the window's own full screen, doesn't leave and a reminder
// comes up over it; a second within two seconds leaves. A key held down
// sends Escape again and again: none counts. Leaving full screen another way
// takes the reminder with it. Off: one press leaves a page's full screen,
// and the window's full screen stays, as Search's does with the switch off.
//
// The window's full screen (F11): the key is kept from the page, as on the
// Mac. A page's full screen: Electron leaves it on Escape before any of the
// app's hooks hears the key (only its key-up comes through), so the first
// press is undone instead: the page is put back in full screen at once, on
// the element it had, and the reminder comes up. The page sees full screen
// go and come back; the video plays on. A page leaving by itself
// (document.exitFullscreen, told by the preload) is never put back.

import { ipcMain, type WebContents } from 'electron'
import { model } from '../model/model'
import { allControllers, controllerFor, type WindowController } from '../views/window'
import { pref } from './facts'

export const WITHIN = 2000
/** The preload's own world in every page (Electron's isolated world). */
const PRELOAD_WORLD = 999

/** Pages filling the screen (Chromium's HTML full screen). */
const filling = new Set<WebContents>()
/** Pages about to leave full screen by their own hand. */
const byPage = new WeakSet<WebContents>()
let waiting: { wc: WebContents; until: number; timer: NodeJS.Timeout } | null = null
/** The key-up of a press kept from the page is kept too. */
const keepUp = new WeakSet<WebContents>()

/** Whether the reminder is up, for the bench. */
export const reminder = { showing: false, shown: 0, putBack: 0 }

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

function wait(wc: WebContents): void {
  endWait()
  waiting = { wc, until: Date.now() + WITHIN, timer: setTimeout(() => endWait(), WITHIN) }
}

const second = (wc: WebContents) => !!waiting && waiting.wc === wc && Date.now() < waiting.until

/** The window's own full screen: the key is the app's to keep. */
function onKey(wc: WebContents, event: Electron.Event, input: Electron.Input): void {
  if (input.key !== 'Escape' || input.control || input.alt || input.meta || input.shift) return
  if (input.type === 'keyUp') {
    if (keepUp.has(wc)) { keepUp.delete(wc); event.preventDefault() }
    return
  }
  if (input.type !== 'keyDown' || !pref<boolean>('fullscreen.escapeTwice') || filling.has(wc)) return
  const c = windowOf(wc)
  if (!c?.frame.isFullScreen()) return
  event.preventDefault()
  keepUp.add(wc)
  if (input.isAutoRepeat) return
  if (second(wc)) { endWait(); c.frame.setFullScreen(false); return }
  wait(wc)
  tell(wc, true)
}

/** A page's full screen left: by an Escape unless the page said it was its own doing. */
function left(wc: WebContents): void {
  filling.delete(wc)
  const own = byPage.has(wc)
  byPage.delete(wc)
  if (!pref<boolean>('fullscreen.escapeTwice') || own || second(wc)) { if (waiting?.wc === wc) endWait(); return }
  wait(wc)
  reminder.putBack++
  // Back in at once, with the user's gesture it came from; then the reminder.
  wc.executeJavaScriptInIsolatedWorld(PRELOAD_WORLD, [{ code: 'globalThis.__orielFullAgain ? globalThis.__orielFullAgain() : false' }], true)
    .then(back => { if (back && waiting?.wc === wc) tell(wc, true); else if (!back && waiting?.wc === wc) endWait() })
    .catch(() => { if (waiting?.wc === wc) endWait() })
}

ipcMain.on('pages:fs-own', event => { byPage.add(event.sender); event.returnValue = true })

const wired = new WeakSet<WebContents>()

/** Every page, once (page.ts calls this as a page's preload first asks). */
export function watchEscape(wc: WebContents): void {
  if (wired.has(wc)) return
  wired.add(wc)
  wc.on('before-input-event', (event, input) => onKey(wc, event, input))
  wc.on('enter-html-full-screen', () => filling.add(wc))
  wc.on('leave-html-full-screen', () => left(wc))
  wc.once('destroyed', () => { filling.delete(wc); if (waiting?.wc === wc) endWait() })
}

// The window's own full screen left another way (F11, the menu).
model.on('window-opened', (id: string) => setImmediate(() => {
  controllerFor(id)?.base.on('leave-full-screen', () => { if (waiting && !filling.has(waiting.wc)) endWait() })
}))

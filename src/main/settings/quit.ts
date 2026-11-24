// Quit Oriel (Ctrl+Shift+Q, the menu's Quit) and Settings › General ›
// Confirm before quitting (`quit.confirm`, studio/01 §1.11, §9.7): with it
// on, "Quit Oriel?" asks first, Cancel being what Return and Escape press.
// Alt+F4 is how Windows quits a program: on the last window it asks too, as
// ⌘Q does on the Mac; on another window it only closes that one. Closing
// the last window with its button quits without asking, as the Mac's red
// button closes a window without asking.

import { app, dialog } from 'electron'
import { brand } from '../../shared/brand'
import { handle } from '../router'
import { model } from '../model/model'
import { probe } from '../paths'
import { allControllers, focusedController, type WindowController } from '../views/window'
import { benchRequest } from '../bench/server'

/** A test world's answers, in place of the question on someone's screen. */
const answers: string[] = []
let asked = 0

/** Whether quitting may go on. */
export function mayQuit(): boolean {
  if (!model.pref<boolean>('quit.confirm')) return true
  asked++
  if (probe) return (answers.shift() ?? 'cancel') === 'quit'
  const options: Electron.MessageBoxSyncOptions = {
    type: 'question',
    message: `Quit ${brand.name}?`,
    detail: 'Your windows and tabs will close.',
    buttons: ['Quit', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  }
  const c = focusedController()
  const choice = c && !c.base.isDestroyed() ? dialog.showMessageBoxSync(c.base as never, options) : dialog.showMessageBoxSync(options)
  return choice === 0
}

handle('app.quit', () => {
  if (!mayQuit()) return { quit: false }
  setImmediate(() => app.quit())
  return { quit: true }
})

/** When an Alt+F4 on the last window was answered Cancel. Windows may close
 * the window on the same press by itself (WM_SYSCOMMAND after the key): that
 * close is held back too. */
let keptAt = -Infinity
const watched = new WeakSet<WindowController>()

function holdNativeClose(c: WindowController): void {
  if (watched.has(c)) return
  watched.add(c)
  c.base.on('close', e => { if (Date.now() - keptAt < 600) e.preventDefault() })
}

handle('window.closeByKey', (_a, ctx) => {
  const c = ctx.window ?? focusedController()
  if (!c || c.base.isDestroyed()) return { closed: false }
  holdNativeClose(c)
  const last = allControllers().filter(x => !x.base.isDestroyed()).length <= 1
  if (last && !mayQuit()) { keptAt = Date.now(); return { closed: false } }
  c.base.close()
  return { closed: true }
})

benchRequest('settingsb.quitAnswer', req => { answers.push(String(req.answer)); return {} })
benchRequest('settingsb.quitAsked', () => ({ asked }))

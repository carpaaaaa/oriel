// Quit Oriel (Ctrl+Shift+Q, the menu's Quit) and Settings › General ›
// Confirm before quitting (`quit.confirm`, studio/01 §1.11, §9.7): with it
// on, "Quit Oriel?" asks first, Cancel being what Return and Escape press.
// Closing the last window quits without asking, as the Mac's red button
// closes a window without asking.

import { app, dialog } from 'electron'
import { brand } from '../../shared/brand'
import { handle } from '../router'
import { model } from '../model/model'
import { probe } from '../paths'
import { focusedController } from '../views/window'
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

benchRequest('settingsb.quitAnswer', req => { answers.push(String(req.answer)); return {} })
benchRequest('settingsb.quitAsked', () => ({ asked }))

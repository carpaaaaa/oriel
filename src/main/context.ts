// Helpers every command module uses: the window a command is for, a tab's
// runtime, opening windows. Owned by the orchestrator.

import { model } from './model/model'
import { controllerFor, focusedController, WindowController } from './views/window'
import { runtimeFor } from './views/tabs'
import type { Context } from './router'
import { wireKeys } from './keys'
import { testEnv } from './testhooks'

export function need(ctx: Context): WindowController {
  const c = ctx.window ?? focusedController()
  if (!c) throw new Error('no window')
  return c
}

export function tabRuntime(c: WindowController, id?: string) {
  const tabID = id ?? c.record.active[c.record.space]
  return tabID ? runtimeFor(tabID, c.pageSession) : null
}

let pageSessionFor: (shy: boolean, windowID: string) => Electron.Session = () => { throw new Error('sessions not set') }
export function setSessions(f: typeof pageSessionFor): void { pageSessionFor = f }

/** Test worlds on a Mac stay out of sight: no Dock icon, no focus taken, an
 * invisible window that lets clicks through. Pages still draw (it is not
 * hidden, only transparent), so pictures and timings stay true.
 * SEARCH_SHOW=1 shows them, for a person to use a test world. */
export const quietTests = process.platform === 'darwin' && !!testEnv('SEARCH_PROBE') && testEnv('SEARCH_SHOW') !== '1'

function quiet(c: WindowController): void {
  const base = c.base
  base.setOpacity(0)
  base.setIgnoreMouseEvents(true)
  base.show = () => base.showInactive()
  base.focus = () => {}
}

let browserOpened = false

export function openWindow(options: { shy?: boolean; restore?: boolean } = {}): WindowController {
  if (!options.shy) browserOpened = true
  const record = model.newWindow(options)
  const c = new WindowController(record, pageSessionFor(!!options.shy, record.id))
  if (quietTests) quiet(c)
  wireKeys(c, c.ui.webContents, false)
  wireKeys(c, c.overlay.webContents, false)
  return c
}

/** A browser window, the one in front, else made. A link from another app
 * can start Oriel with its small window alone (main/index.ts, tabs/little.ts;
 * studio/01 §10.27 keepWindowsAway): the first browser window of that run
 * then brings last time's back, as a plain launch would (start.fresh). */
export function someWindow(): WindowController {
  const front = model.front ? model.windows.get(model.front) : undefined
  const win = front && !front.shy ? front : [...model.windows.values()].find(w => !w.shy)
  const c = win ? controllerFor(win.id) : undefined
  if (c && !c.base.isDestroyed()) return c
  return openWindow({ restore: browserOpened ? false : !model.pref<boolean>('start.fresh') })
}

/** No browser window has opened yet in this run (only small windows, if any). */
export const browserYet = () => browserOpened

model.on('close-window', (id: string) => controllerFor(id)?.base.close())

// The window: shape, controls, dragging, menus, Split View, floating windows (studio/01 §1, 8, 10).
// Owned by the window module.

import { app, BaseWindow } from 'electron'
import './commands'
import './split'
import './zoom'
import './pagefull'
import './edges'
import './power'
import './column'
import './dusk'
import '../../shared/modules/window'
import { registerSlice } from '../views/window'
import { addDefaults } from '../../shared/prefs'
import { model } from '../model/model'
import { benchRequest } from '../bench/server'
import { allControllers, controllerFor, focusedController } from '../views/window'
import { testEnv } from '../testhooks'

// In a test world on Windows, a window covered by another (a console on the
// test machine) keeps drawing, so pictures and layout stay true.
if (process.platform === 'win32' && testEnv('SEARCH_PROBE')) app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion')

// Windows' own frame instead of ours, a hidden setting (read when a window opens).
addDefaults({ 'window.nativeFrame': false, 'window.buttons': 'inline' })

registerSlice('frame', c => c.frame.view())
// Full screen or borderless chosen in Settings: the window drawn again at once.
model.on('window-changed', (id: string, slices: string[]) => { if (slices?.includes('prefs')) controllerFor(id)?.mark('frame') })
registerSlice('room', c => c.sideRoom())


const pick = (id?: unknown) => {
  const c = typeof id === 'string' ? controllerFor(id) : focusedController()
  if (!c) throw new Error('no window')
  return c
}

// For the tests: what the frame is, and putting the window somewhere.
benchRequest('window.frame', req => ({ frame: pick(req.window).frame.diagnose(), windows: allControllers().length, focused: BaseWindow.getFocusedWindow() !== null }))
benchRequest('window.place', req => {
  const c = pick(req.window)
  const r = { x: Number(req.x), y: Number(req.y), width: Number(req.width), height: Number(req.height) }
  c.frame.release()
  c.base.setBounds(req.visual ? c.frame.boundsFor(r) : r)
  c.frame.refresh()
  return { bounds: c.base.getBounds(), visual: c.frame.visual() }
})
// For the tests: every place a page view is put, with the time (ui_motion.py,
// Ctrl+S sliding the page with the column).
benchRequest('window.pageTrace', req => {
  const c = pick(req.window)
  const trace = c.pageTrace ?? []
  c.pageTrace = req.on ? [] : null
  return { trace }
})
benchRequest('window.trace', req => {
  const c = pick(req.window)
  const trace = c.frame.trace
  c.frame.tracing = !!req.on
  c.frame.trace = []
  return { trace }
})
// Room beside the page, as the extensions' side panel asks for it.
const placed = new Map<string, unknown>()
benchRequest('window.room', req => {
  const c = pick(req.window)
  const key = c.record.id
  if (req.width === undefined) return { rect: placed.get(key) ?? null }
  if (req.width === null) { c.setSideRoom(null); return { rect: null } }
  c.setSideRoom({ side: req.side === 'left' ? 'left' : 'right', width: Number(req.width), place: r => placed.set(key, r) })
  return { rect: null }
})
benchRequest('window.focus', req => { const c = pick(req.window); c.base.focus(); return {} })
benchRequest('window.restore', req => { const c = pick(req.window); c.base.restore(); return {} })
// A press, a few moves with the button held, a release, as the interface's
// view gets them from a person (globalX/Y give the events their screen place).
benchRequest('window.drag', async req => {
  const c = pick(req.window)
  const wc = c.ui.webContents
  // The path is fixed on the screen, like a real pointer's: while the window
  // moves under it, the point inside the window changes.
  const origin = c.base.getContentBounds()
  // A point may carry keys held at that step: [x, y, ['shift']] (Shift-drag onto a tab).
  const path = req.path as ([number, number] | [number, number, string[]])[]
  const at = ([x, y]: [number, number, ...unknown[]]) => {
    const now = c.base.getContentBounds()
    const gx = origin.x + x, gy = origin.y + y
    return { x: gx - now.x, y: gy - now.y, globalX: gx, globalY: gy }
  }
  type Mod = NonNullable<Electron.InputEvent['modifiers']>[number]
  const keys = (p: (typeof path)[number]): Mod[] => (p[2] as Mod[] | undefined) ?? []
  wc.sendInputEvent({ type: 'mouseMove', modifiers: keys(path[0]), ...at(path[0]) })
  wc.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, modifiers: keys(path[0]), ...at(path[0]) })
  // A pointer at rest sends no move: a point the same as the one before only
  // lets the time pass (a key pressed meanwhile is then the only event).
  let sent = JSON.stringify([at(path[0]).x, at(path[0]).y, keys(path[0])])
  for (const p of path.slice(1)) {
    await new Promise(r => setTimeout(r, 16))
    const where = at(p)
    const key = JSON.stringify([where.x, where.y, keys(p)])
    if (key === sent) continue
    sent = key
    wc.sendInputEvent({ type: 'mouseMove', modifiers: ['leftbuttondown', ...keys(p)], ...where })
  }
  await new Promise(r => setTimeout(r, 16))
  wc.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, modifiers: keys(path[path.length - 1]), ...at(path[path.length - 1]) })
  await new Promise(r => setTimeout(r, 100))
  return { bounds: c.base.getBounds() }
})

// The window: shape, controls, dragging, menus, Split View, floating windows (studio/01 §1, 8, 10).
// Owned by the window module.

import { app, BaseWindow } from 'electron'
import './commands'
import './split'
import '../../shared/modules/window'
import { registerSlice } from '../views/window'
import { shortcut } from '../keys'
import { addDefaults } from '../../shared/prefs'
import { benchRequest } from '../bench/server'
import { allControllers, controllerFor, focusedController } from '../views/window'

// In a test world on Windows, a window covered by another (a console on the
// test machine) keeps drawing, so pictures and layout stay true.
if (process.platform === 'win32' && process.env.SEARCH_PROBE) app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion')

// Windows' own frame instead of ours, a hidden setting (read when a window opens).
addDefaults({ 'window.nativeFrame': false })

registerSlice('frame', c => c.frame.view())

// studio/01 §1.19: F11 on Windows (⌃⌘F on the Mac).
shortcut('F11', 'first', () => ({ do: 'window.fullScreen' }))

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
benchRequest('window.focus', req => { const c = pick(req.window); c.base.focus(); return {} })
benchRequest('window.restore', req => { const c = pick(req.window); c.base.restore(); return {} })
// A press, a few moves with the button held, a release, as the interface's
// view gets them from a person (globalX/Y give the events their screen place).
benchRequest('window.drag', async req => {
  const c = pick(req.window)
  const wc = c.ui.webContents
  const origin = c.base.getContentBounds()
  const path = req.path as [number, number][]
  const at = ([x, y]: [number, number]) => ({ x, y, globalX: origin.x + x, globalY: origin.y + y })
  wc.sendInputEvent({ type: 'mouseMove', ...at(path[0]) })
  wc.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...at(path[0]) })
  for (const p of path.slice(1)) {
    await new Promise(r => setTimeout(r, 16))
    wc.sendInputEvent({ type: 'mouseMove', modifiers: ['leftbuttondown'], ...at(p) })
  }
  await new Promise(r => setTimeout(r, 16))
  wc.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...at(path[path.length - 1]) })
  await new Promise(r => setTimeout(r, 100))
  return { bounds: c.base.getBounds() }
})

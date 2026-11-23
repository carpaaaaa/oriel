// The window, the column's size and folding, layout. Owned by the window module.

import { handle } from '../router'
import { model } from '../model/model'
import { need, openWindow } from '../context'

// the column

handle('sidebar.resize', ({ width }, ctx) => {
  const c = need(ctx)
  const w = Math.max(176, Math.min(440, Math.round(width)))
  c.record.sidebar = { ...c.record.sidebar, width: w }
  model.touch(c.record, ['sidebar'])
  model.setPref('sidebar.width', w)
})
handle('sidebar.toggle', (_a, ctx) => {
  const c = need(ctx)
  c.record.sidebar = { ...c.record.sidebar, folded: !c.record.sidebar.folded }
  model.touch(c.record, ['sidebar'])
})
handle('sidebar.fold', ({ folded }, ctx) => {
  const c = need(ctx)
  c.record.sidebar = { ...c.record.sidebar, folded }
  model.touch(c.record, ['sidebar'])
})

// the window

handle('window.minimize', (_a, ctx) => need(ctx).base.minimize())
handle('window.maximize', (_a, ctx) => { const b = need(ctx).base; b.isMaximized() ? b.unmaximize() : b.maximize() })
handle('window.close', (_a, ctx) => need(ctx).base.close())
handle('window.new', ({ shy }) => { openWindow({ shy }) })
handle('window.startDrag', () => { /* win/drag.ts (koffi) on Windows; the CSS drag region elsewhere */ })
handle('window.menu', () => {})

// layout

handle('layout.slots', ({ slots }, ctx) => need(ctx).setSlots(slots))
handle('overlay.region', ({ rect, focus }, ctx) => need(ctx).setOverlayRegion(rect, focus))
handle('prefs.set', ({ key, value }) => model.setPref(key, value))
handle('page.data', () => null)
handle('menu.pick', () => {})

// The window, the column's size and folding, layout. Owned by the window module.

import { handle } from '../router'
import { model } from '../model/model'
import { need, openWindow } from '../context'
import { allControllers } from '../views/window'

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
  const s = c.record.sidebar
  // Settings › Ctrl+S makes the column icons only (sidebar.foldIcons): the
  // column goes to icons only and back, never away (Fold.swift toggleFold,
  // `shrinks`); narrowed to the strip by its edge, the titles come back.
  if (model.pref<boolean>('sidebar.foldIcons') && s.layout === 'side' && !model.pref<boolean>('sidebar.hides') && !s.folded) {
    if (model.pref<boolean>('sidebar.narrowIcons') && model.pref<boolean>('sidebar.narrowed')) { model.setPref('sidebar.narrowed', false); return }
    const icons = !model.pref<boolean>('sidebar.icons')
    model.setPref('sidebar.icons', icons)
    for (const x of allControllers()) { x.record.sidebar = { ...x.record.sidebar, icons }; model.touch(x.record, ['sidebar']) }
    return
  }
  // Ctrl+S hides the tabs and the page fills the window, as it is: a window, maximized or full
  // screen (the interface does it, chrome/Chrome.tsx `fill`); never full screen of its own.
  c.record.sidebar = { ...s, folded: !s.folded }
  model.touch(c.record, ['sidebar'])
})
handle('sidebar.fold', ({ folded }, ctx) => {
  const c = need(ctx)
  c.record.sidebar = { ...c.record.sidebar, folded }
  model.touch(c.record, ['sidebar'])
})

// the window (studio/01 §1.12, §1.19; the frame in frame.ts)

handle('window.minimize', (_a, ctx) => need(ctx).base.minimize())
handle('window.maximize', (_a, ctx) => need(ctx).frame.toggleMaximize())
handle('window.fullScreen', ({ on }, ctx) => need(ctx).frame.setFullScreen(on))
handle('window.close', (_a, ctx) => need(ctx).base.close())
handle('window.focusPage', (_a, ctx) => need(ctx).focusPage())
handle('window.new', ({ shy }) => { openWindow({ shy }) })
handle('window.startDrag', ({ x, y }, ctx) => need(ctx).frame.startDrag({ x, y }))
handle('window.startResize', ({ edge }, ctx) => need(ctx).frame.startResize(edge))
handle('window.moveDrag', ({ phase, x, y }, ctx) => need(ctx).frame.moveDrag(phase, x, y))
handle('window.resizeDrag', ({ edge, phase, x, y }, ctx) => need(ctx).frame.resizeDrag(edge, phase, x, y))
handle('window.hollow', ({ hollow }, ctx) => need(ctx).frame.setHollow(hollow))
handle('window.room', ({ rect }, ctx) => need(ctx).placeRoom(rect))
handle('window.menu', () => {})

// layout

handle('layout.slots', ({ slots }, ctx) => need(ctx).setSlots(slots))
handle('overlay.region', ({ rect, focus }, ctx) => need(ctx).setOverlayRegion(rect, focus))
handle('prefs.set', ({ key, value }) => model.setPref(key, value))
handle('page.data', () => null)
handle('menu.pick', () => {})

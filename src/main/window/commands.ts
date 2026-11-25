// The window, the column's size and folding, layout. Owned by the window module.

import { handle } from '../router'
import { model } from '../model/model'
import { need, openWindow } from '../context'
import { allControllers } from '../views/window'

/** Windows Ctrl+S put in full screen, to take out of it when the tabs come back. */
const foldedFull = new Set<string>()

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
  const folding = !s.folded
  c.record.sidebar = { ...s, folded: folding }
  model.touch(c.record, ['sidebar'])
  // Ctrl+S takes the page full screen with the tabs gone, as the Mac's page
  // card fills the window, and gives the window back with them (fold.fullScreen).
  // Full screen put on by something else (F11, a video) is left alone.
  if (model.pref<boolean>('fold.fullScreen') !== false) {
    const id = c.record.id
    if (folding) {
      // Already full screen (F11, Borderless window): it stays, and is drawn edge to edge while folded.
      if (c.frame.isFullScreen()) { c.frame.edgeToEdge = true; c.mark('frame') }
      else { foldedFull.add(id); c.frame.edgeToEdge = true; c.frame.setFullScreen(true) }
    } else {
      if (foldedFull.delete(id) && c.frame.isFullScreen()) c.frame.setFullScreen(false)
      else { c.frame.edgeToEdge = false; c.mark('frame') }
    }
  }
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

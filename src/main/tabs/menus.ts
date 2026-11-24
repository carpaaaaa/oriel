// The drawn menus and popovers of the tabs interface as a layer of the main
// process (studio/02 §4.6): one thing floats over the page at a time, so a
// menu waits behind nothing and the field, a panel or a question that comes
// takes its place. The overlay draws it (ui/menus/host.tsx).

import { handle } from '../router'
import { need } from '../context'

export const MENU = 'tabs.menu'

handle('menu.open', (a, ctx) => {
  const c = need(ctx)
  const { width, height } = c.base.getContentBounds()
  c.sendOverlay({ kind: 'panel', name: MENU, data: a })
  c.setOverlayRegion({ x: 0, y: 0, width, height }, true)
})

handle('menu.close', ({ refocus }, ctx) => {
  const c = need(ctx)
  const up = c.overlayLayer.kind === 'panel' && c.overlayLayer.name === MENU
  if (up) c.sendOverlay({ kind: 'none' })
  if (refocus && (up || c.overlayLayer.kind === 'none')) c.focusPage()
})

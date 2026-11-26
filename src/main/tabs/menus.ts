// The drawn menus and popovers of the tabs interface as a layer of the main
// process (studio/02 §4.6): one thing floats over the page at a time, so a
// menu waits behind nothing and the field, a panel or a question that comes
// takes its place. The overlay draws it (ui/menus/host.tsx).

import { handle } from '../router'
import { need } from '../context'
import { runtimes } from '../views/tabs'
import { overlayFree } from '../views/window'

export const MENU = 'tabs.menu'

handle('menu.open', (a, ctx) => {
  const c = need(ctx)
  const { width, height } = c.base.getContentBounds()
  c.sendOverlay({ kind: 'panel', name: MENU, data: a })
  c.setOverlayRegion({ x: 0, y: 0, width, height }, true)
})

// What's playing in other tabs (sidebar.player, Player.swift): the pause is
// two lines run in Oriel's own world when pressed, never before; what it
// paused, and only that, plays again.
const STILL = `(() => { const held = []; document.querySelectorAll('audio, video').forEach(el => { if (!el.paused) { held.push(el); el.pause() } }); window.__orielStilled = held; return held.length })()`
const AGAIN = `(() => { const held = window.__orielStilled || []; window.__orielStilled = null; held.forEach(el => { if (el.paused && el.isConnected) el.play().catch(() => {}) }); return held.length })()`
handle('tab.media', async ({ id, play }) => {
  const wc = runtimes.get(id)?.contents
  if (!wc) return 0
  return wc.executeJavaScriptInIsolatedWorld(1003, [{ code: play ? AGAIN : STILL }]).catch(() => 0)
})

handle('menu.close', ({ refocus }, ctx) => {
  const c = need(ctx)
  const up = c.overlayLayer.kind === 'panel' && c.overlayLayer.name === MENU
  if (up) c.sendOverlay({ kind: 'none' })
  if (refocus && (up || overlayFree(c.overlayLayer))) c.focusPage()
})

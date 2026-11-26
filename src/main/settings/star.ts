// A star on GitHub, or a coffee for its maker, asked once after each update: a
// small card in the page's lower right corner, never on a fresh install, never
// twice for one version. It takes no focus and gives way to anything else that
// wants the overlay (overlayFree in views/window.ts). Star on GitHub and Buy me
// a coffee each open their page and end it for good (star.done); the X, or
// nothing done for a while, put it away until the next update.

import { app } from 'electron'
import { model, textScale } from '../model/model'
import { handle, run } from '../router'
import { probe } from '../paths'
import { benchRequest } from '../bench/server'
import { allControllers, controllerFor, yielding, overlayFree, type WindowController } from '../views/window'
import { runtimes } from '../views/tabs'
import { hidePanel, showPanel } from './slice'
import { setKey } from './prefs'
import { testEnv } from '../testhooks'

export const STAR_PANEL = 'settings.star'
export const REPO_URL = 'https://github.com/carpaaaaa/oriel'
export const COFFEE_URL = 'https://buymeacoffee.com/charstudio'
const WIDTH = 320, HEIGHT = 124, MARGIN = 12

yielding.add(STAR_PANEL)

let shownIn: string | null = null
let asked = 0
/** Where the card's corner is (the region's right and bottom edges): the card fits its content, and the region fits the card. */
let corner: { right: number; bottom: number; pageWidth: number } | null = null
/** The size the card measured, kept for as long as the text size is the same: placed again, it starts at that size. */
let last: { s: number; width: number; height: number } | null = null

const isStar = (c: WindowController) => c.overlayLayer.kind === 'panel' && c.overlayLayer.name === STAR_PANEL

function place(tries = 0): void {
  const c = allControllers()[0]
  if (!c) { if (tries < 40) setTimeout(() => place(tries + 1), 500); return }
  // Something else floats there (the update, a question, a menu): wait it out, a while.
  if (!overlayFree(c.overlayLayer) || c.base.isMinimized()) { if (tries < 60) setTimeout(() => place(tries + 1), 1000); return }
  const id = c.record.active[c.record.space]
  const page = id ? runtimes.get(id)?.view : null
  const b = c.base.getContentBounds()
  const r = page && !page.webContents.isDestroyed() ? page.getBounds() : { x: 0, y: 0, width: b.width, height: b.height }
  // Bigger with Oriel's text size.
  const s = textScale(), width = Math.round(WIDTH * s), height = Math.round(HEIGHT * s)
  if (r.width < width + 2 * MARGIN || r.height < height + 2 * MARGIN) return
  shownIn = c.record.id
  asked++
  corner = { right: r.x + r.width - MARGIN, bottom: r.y + r.height - MARGIN, pageWidth: r.width }
  // A first guess; the card tells its true size once drawn (star.fit).
  const known = last && last.s === s ? { width: last.width + 2 * MARGIN, height: last.height + 2 * MARGIN } : { width, height }
  showPanel(c, STAR_PANEL, { x: corner.right - known.width, y: corner.bottom - known.height, ...known })
}

function hide(): void {
  const c = shownIn ? controllerFor(shownIn) : null
  if (c && isStar(c)) {
    hidePanel(c, STAR_PANEL)
    // A click on the card gave the overlay the keys: back to the page (never on the quiet timeout).
    if (!c.overlay.webContents.isDestroyed() && c.overlay.webContents.isFocused()) c.focusPage()
  }
  shownIn = null
}

/** A page of ours opened from the card, which then goes for good. */
async function openFrom(url: string, ctx: { window?: WindowController | null }): Promise<void> {
  setKey('star.done', true)
  hide()
  const c = ctx.window ?? allControllers()[0]
  if (c) await run({ do: 'tab.new', url } as never, { window: c })
}
handle('star.open', (_args, ctx) => openFrom(REPO_URL, ctx))
handle('star.coffee', (_args, ctx) => openFrom(COFFEE_URL, ctx))
handle('star.later', () => hide())
// The card's own size, in whatever text size and type it is drawn: the region
// is that and its margin, anchored at the corner, so nothing empty over the page
// takes the clicks and the card is never clipped.
handle('star.fit', ({ width, height }) => {
  const c = shownIn ? controllerFor(shownIn) : null
  if (!c || !isStar(c) || !corner) return
  const w = Math.ceil(Number(width)) + 2 * MARGIN, h = Math.ceil(Number(height)) + 2 * MARGIN
  if (!(w > 2 * MARGIN) || !(h > 2 * MARGIN) || w > corner.pageWidth) return
  last = { s: textScale(), width: w - 2 * MARGIN, height: h - 2 * MARGIN }
  c.setOverlayRegion({ x: corner.right - w, y: corner.bottom - h, width: w, height: h }, false)
})

// Read at launch, before What's New marks this version seen (updater.ts):
// a version seen before and not this one means Oriel was just updated.
// (setImmediate: after index.ts has loaded the model.)
app.whenReady().then(() => setImmediate(() => {
  const seen = model.pref<string>('whatsnew.seen')
  const updated = !!seen && seen !== app.getVersion()
  if (model.pref<boolean>('star.done')) return
  // A test world asks only when told: ORIEL_STAR=1 always, =update as an installed copy would.
  const told = probe ? testEnv('ORIEL_STAR') : 'update'
  if (!(told === '1' || (told === 'update' && updated))) return
  setTimeout(() => place(), probe ? 800 : 6000)
}))

benchRequest('settings.star', req => {
  if (req.show) place()
  const c = shownIn ? controllerFor(shownIn) : null
  return { shown: !!c && isStar(c), asked, done: !!model.pref<boolean>('star.done'), region: c && isStar(c) ? c.overlay.getBounds() : null }
})

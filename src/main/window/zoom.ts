// Page zoom, kept for each site (studio/01 §2.22). Ctrl+= / Ctrl+- and
// Ctrl+wheel (a precision touchpad's pinch arrives as Ctrl+wheel; Electron
// only reports it, `zoom-changed`, and leaves the zooming to us) go a step at a
// time along Chrome's levels, the user's choice over the Mac's times 1.1;
// Ctrl+0 goes back to the default (pref pageZoom). A wheel or a pinch sends a
// run of events: the close ones count as one step, so a notch never jumps
// three levels. The zoom of a host is the pref zoom.<host>, as on the Mac;
// one equal to the default is forgotten, private tabs read it but never write
// it. It is applied at every main-frame navigation and when a page comes on
// screen.
//
// A step glides (the user's choice; the Mac's jumps): the factor follows the
// fold-in spring (0.13 / 1.0: critically damped, about 190 ms, never past the
// level) from where it is to the level, in log space so a level up is as long
// as a level down. Another step on the way goes on from the level it was
// heading for, keeping its speed, and the glide always lands exactly on the
// level. The level is kept for the site and said at once. Reduce animations,
// or saving power: at once.
//
// Each change says its level in a capsule over the page, where the Mac's says
// it (Browser.swift:7637, the line that rises from the page's foot): the
// light "announcement" (studio/02 §4.6 Avviso: ground, hairline, 12, 15 / 9,
// black 10% radius 18 y 6), centred 30 above the page's foot, up on settle,
// rewritten while it changes, gone on quick 1.2 s after the last; a click on
// it goes back to the default. Drawn in the overlay over the page's card
// (chrome/register.tsx), never over the column.

import type { WebContents } from 'electron'
import { handle } from '../router'
import { model } from '../model/model'
import { need, tabRuntime } from '../context'
import { addDefaults } from '../../shared/prefs'
import { controllerFor, pageAttached, type WindowController } from '../views/window'
import { runtimes } from '../views/tabs'
import { benchRequest } from '../bench/server'
import { Springs } from '../../shared/spring'
import { savingPower } from './power'

/** Chrome's levels (and Edge's): what Ctrl+wheel and Ctrl+= / Ctrl+- go through. */
export const STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5]
/** Changes under this are ignored (Tab.swift: 0.004). */
const NOTHING = 0.004
/** Wheel events closer than this to the last step are part of it. */
const RUN = 150
/** The capsule stays this long after the last change, then goes on quick. */
const STAY = 1200, QUICK = 140
export const ZOOM_PILL = 'window.zoom'

addDefaults({ pageZoom: 1 })

const defaultZoom = () => {
  const z = Number(model.pref<number>('pageZoom'))
  return z > 0 ? z : 1
}

export function hostOf(url: string): string {
  try {
    const u = new URL(url)
    return /^https?:$/.test(u.protocol) ? u.host.replace(/^www\./, '') : ''
  } catch { return '' }
}

export function zoomFor(url: string): number {
  const host = hostOf(url)
  const kept = host ? Number(model.pref<number>(`zoom.${host}`)) : NaN
  return kept > 0 ? kept : defaultZoom()
}

function apply(wc: WebContents): void {
  if (wc.isDestroyed()) return
  stopGlide(wc)
  const z = zoomFor(wc.getURL())
  if (Math.abs(wc.getZoomFactor() - z) >= NOTHING) wc.setZoomFactor(z)
}

// the glide

const GLIDE = Springs.foldIn
/** Close enough to land, in log space (0.01%), and slow enough. */
const LANDED = 1e-4, STILL = 0.05
const FRAME = 1000 / 60

interface Glide { at: number; speed: number; to: number; last: number; timer: NodeJS.Timeout | null; landed: Array<(z: number) => void> }
const glides = new WeakMap<WebContents, Glide>()

/** The level a page is heading for, or is at. */
function levelOf(wc: WebContents): number {
  const g = glides.get(wc)
  return g?.timer ? g.to : wc.getZoomFactor()
}

/** Ends a glide where it is (a navigation, the page gone). */
function stopGlide(wc: WebContents): void {
  const g = glides.get(wc)
  if (!g?.timer) return
  clearTimeout(g.timer)
  g.timer = null
  for (const f of g.landed.splice(0)) f(wc.isDestroyed() ? g.to : wc.getZoomFactor())
}

/** Glides the page's factor to `to`; resolves once it is there. */
function glideTo(wc: WebContents, to: number): Promise<number> {
  if (model.pref<boolean>('motion.instant') || savingPower()) {
    stopGlide(wc)
    wc.setZoomFactor(to)
    return Promise.resolve(to)
  }
  let g = glides.get(wc)
  if (!g) {
    g = { at: 0, speed: 0, to, last: 0, timer: null, landed: [] }
    glides.set(wc, g)
    wc.once('destroyed', () => stopGlide(wc))
  }
  const glide = g
  glide.to = to
  if (!glide.timer) {
    glide.at = Math.log(wc.getZoomFactor())
    glide.speed = 0
    glide.last = performance.now()
    glide.timer = setTimeout(() => frame(wc, glide), FRAME)
  }
  return new Promise(resolve => glide.landed.push(resolve))
}

function frame(wc: WebContents, g: Glide): void {
  if (wc.isDestroyed()) { g.timer = null; return }
  const now = performance.now()
  const goal = Math.log(g.to)
  // SwiftUI's spring (spring.ts), in 1 ms steps so a late frame stays true.
  const k = (2 * Math.PI / GLIDE.response) ** 2, c = (4 * Math.PI * GLIDE.damping) / GLIDE.response
  const steps = Math.max(1, Math.min(100, Math.round(now - g.last)))
  const dt = Math.min(now - g.last, 100) / 1000 / steps
  for (let i = 0; i < steps; i++) {
    g.speed += (k * (goal - g.at) - c * g.speed) * dt
    g.at += g.speed * dt
  }
  g.last = now
  if (Math.abs(goal - g.at) < LANDED && Math.abs(g.speed) < STILL) {
    g.timer = null
    wc.setZoomFactor(g.to) // exactly Chrome's level
    for (const f of g.landed.splice(0)) f(g.to)
    return
  }
  wc.setZoomFactor(Math.exp(g.at))
  g.timer = setTimeout(() => frame(wc, g), FRAME)
}

/** The next level up or down from `now` (a zoom between levels goes to the next one). */
export function nextStep(now: number, up: boolean): number {
  return up ? (STEPS.find(s => s > now + 0.001) ?? STEPS[STEPS.length - 1]) : ([...STEPS].reverse().find(s => s < now - 0.001) ?? STEPS[0])
}

/** `by` times the zoom, on the level nearest to it the way it goes (Ctrl+= is
 * by 1.1: always the next level; by 1.25 from 100% is 125%). */
export function stepBy(now: number, by: number): number {
  const ways = STEPS.filter(s => (by > 1 ? s > now + 0.001 : s < now - 0.001))
  if (!ways.length) return by > 1 ? STEPS[STEPS.length - 1] : STEPS[0]
  const target = now * by
  return ways.reduce((a, s) => (Math.abs(s - target) < Math.abs(a - target) ? s : a))
}

const runs = new WeakMap<WebContents, { at: number; up: boolean }>()

/** A page the window shows: its site's zoom now and at each navigation. */
export function watchZoom(id: string, wc: WebContents): void {
  apply(wc)
  wc.on('did-navigate', () => apply(wc))
  wc.on('zoom-changed', (_e, direction) => {
    const up = direction === 'in', now = Date.now()
    const last = runs.get(wc)
    if (last && last.up === up && now - last.at < RUN) { last.at = now; return }
    runs.set(wc, { at: now, up })
    void zoomTab(id, wc, nextStep(levelOf(wc), up))
  })
}

/** Glides to the level (kept for the site and said at once); resolves with it once there. */
async function zoomTab(id: string, wc: WebContents, to?: number, reset = false): Promise<number> {
  const before = levelOf(wc)
  const next = reset ? defaultZoom() : to ?? before
  if (Math.abs(next - before) < NOTHING) return before
  const landed = glideTo(wc, next)
  const host = hostOf(wc.getURL())
  const tab = model.tabs.get(id)
  if (host && !tab?.shy) model.setPref(`zoom.${host}`, Math.abs(next - defaultZoom()) < 0.01 ? undefined : Math.round(next * 1000) / 1000)
  say(id, next)
  return landed
}

// the capsule

const hush = new WeakMap<WindowController, NodeJS.Timeout>()
const isPill = (c: WindowController) => { const l = c.overlayLayer; return l.kind === 'panel' && l.name === ZOOM_PILL }

function say(id: string, zoom: number): void {
  const win = model.windowOf(id)
  const c = win && controllerFor(win.id)
  const page = runtimes.get(id)?.view
  if (!c || !page || !model.onScreen(id)) return
  // Something else floats over the page (the field, a menu, a question): it keeps its place.
  if (c.overlayLayer.kind !== 'none' && !isPill(c)) return
  const r = page.getBounds()
  const width = 140, height = 32 + 24 + 30
  c.sendOverlay({ kind: 'panel', name: ZOOM_PILL, data: { percent: Math.round(zoom * 100), tab: id } })
  c.setOverlayRegion({ x: Math.round(r.x + r.width / 2 - width / 2), y: r.y + r.height - height, width, height }, false)
  clearTimeout(hush.get(c))
  hush.set(c, setTimeout(() => {
    if (!isPill(c)) return
    const quick = model.pref<boolean>('motion.instant') ? 0 : QUICK
    c.sendOverlay({ kind: 'panel', name: ZOOM_PILL, data: { percent: Math.round(zoom * 100), tab: id, going: true } })
    hush.set(c, setTimeout(() => { if (isPill(c)) c.sendOverlay({ kind: 'none' }) }, quick))
  }, STAY))
}

pageAttached.push(watchZoom)

handle('view.zoom', ({ by, reset, id }, ctx) => {
  const c = need(ctx)
  const tabID = id ?? c.record.active[c.record.space]
  const wc = tabID ? tabRuntime(c, tabID)?.contents : null
  if (!tabID || !wc || wc.isDestroyed()) return null
  return zoomTab(tabID, wc, by === undefined || by === 1 ? undefined : stepBy(levelOf(wc), by), !!reset)
})

// For the tests: Ctrl+wheel on the page in front, `count` events `gap` ms apart.
// Chromium turns Ctrl+wheel into zoom-changed everywhere but on a Mac (where
// the OS pinches instead, WebContentsImpl::HandleWheelEvent): there the bench
// raises what Windows would, one zoom-changed for each notch.
benchRequest('window.wheel', async req => {
  const c = [...runtimes.entries()].find(([id]) => model.onScreen(id))
  const wc = c?.[1].contents
  if (!wc) return { ok: false }
  const { x = 200, y = 200, deltaY = 120, count = 1, gap = 0 } = req as { x?: number; y?: number; deltaY?: number; count?: number; gap?: number }
  for (let i = 0; i < Number(count); i++) {
    if (process.platform === 'darwin') wc.emit('zoom-changed', {}, Number(deltaY) > 0 ? 'in' : 'out')
    else wc.sendInputEvent({ type: 'mouseWheel', x: Number(x), y: Number(y), deltaX: 0, deltaY: Number(deltaY), wheelTicksY: Math.sign(Number(deltaY)), canScroll: true, modifiers: ['control'] } as Electron.MouseWheelInputEvent)
    if (gap) await new Promise(r => setTimeout(r, Number(gap)))
  }
  return { ok: true }
})

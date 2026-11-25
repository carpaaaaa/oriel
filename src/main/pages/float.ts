// The floating video (studio/06 §1.5 #78-#81, §3.5; Float.swift,
// Browser.swift lift/land/appLeft). A video keeps playing in a small window
// above everything when you go somewhere else, if Settings' Floating video
// is on (float.enabled; the Mac's choice between Search's window and
// macOS's picture in picture is gone, Chromium's own can't wear Oriel's
// look). The page itself moves. Everything but the video is made invisible,
// the video fills the page, and the tab's whole view goes into a small
// frameless window that stays on top; the video never stops, it only
// changed windows. Its buttons (src/ui/float.html, themed as the interface)
// show while the pointer is on it: close, back to the tab, play/pause, 15 s
// back and on, a thin line that seeks, and, with Minimize the floating
// video, a button that tucks it small. Two fingers on a touchpad flick it
// to the corner they point at.
// On its own (Float the video on its own): leaving a tab (float.leave, on)
// or Oriel (float.away) floats a video that is playing and heard, from a
// site whose video is the point of the site (Players.knows); coming back to
// the tab, or to Oriel for one lifted that way, lands it. Ctrl+Shift+P
// floats any playing video by hand, or lands it. A site's own picture in
// picture button floats its video the same way (preload/page/float.ts); off,
// it is refused.
// See through (float.fade, Oriel's own): away from the pointer it lets what
// is behind show through, as much as Settings' slider says.

import { dirname, join } from 'node:path'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { BaseWindow, WebContentsView, ipcMain, screen, type WebContents } from 'electron'
import { iconOption } from '../win/icon'
import type { ID, Rect } from '../../shared/state'
import { model, type WindowRecord } from '../model/model'
import { handle } from '../router'
import { need } from '../context'
import { quietTests } from '../context'
import { probe } from '../paths'
import { runtimes } from '../views/tabs'
import { allControllers, controllerFor, registerSlice } from '../views/window'
import { pref } from './facts'
import { keepOnPage } from '../views/guard'
import { win32 } from '../win/user32'

/** The buttons' own page (src/ui/float.html), built beside the interface's. */
const controlsPage = join(dirname(fileURLToPath(import.meta.url)), '../ui/float.html')

const PRELOAD_WORLD = 999

/** Sites with a player worth following into the little window (Players.known). */
const players: [string, string | null][] = [
  ['youtube.com', null], ['youtu.be', null], ['netflix.com', null], ['primevideo.com', null], ['amazon.com', '/gp/video'],
  ['amazon.fr', '/gp/video'], ['amazon.co.uk', '/gp/video'], ['amazon.de', '/gp/video'], ['disneyplus.com', null], ['tv.apple.com', null],
  ['twitch.tv', null], ['vimeo.com', null], ['dailymotion.com', null], ['max.com', null], ['hbomax.com', null], ['canalplus.com', null],
  ['mycanal.fr', null], ['arte.tv', null], ['france.tv', null], ['tf1.fr', null], ['6play.fr', null], ['crunchyroll.com', null], ['plex.tv', null],
  ['peacocktv.com', null], ['hulu.com', null], ['paramountplus.com', null], ['molotov.tv', null], ['ocs.fr', null], ['mubi.com', null],
  ['criterionchannel.com', null], ['ted.com', null], ['nebula.tv', null], ['curiositystream.com', null],
]

export function knownPlayer(address: string): boolean {
  let u: URL
  try { u = new URL(address) } catch { return false }
  const host = u.hostname.toLowerCase()
  if (probe) {
    const extra = model.pref<unknown>('test.playerHosts')
    if (Array.isArray(extra) && extra.includes(host)) return true
  }
  const path = u.pathname.toLowerCase()
  return players.some(([h, p]) => (host === h || host.endsWith('.' + h)) && (!p || path.startsWith(p)))
}

interface Floating {
  tab: ID
  win: ID
  view: WebContentsView
  base: BaseWindow
  controls: WebContentsView
  /** Lifted because Oriel was left: lands when Oriel comes back. */
  away: boolean
  tuckedFrom: Rect | null
  /** The pointer is over it, as the main process sees it: its buttons show. */
  near: boolean
  ticker: NodeJS.Timeout
  watcher: NodeJS.Timeout
}

let floating: Floating | null = null
let liftedAway = false

/** Settings › Floating video (float.enabled, on as it comes). Off, nothing
 * floats: not by hand, not on its own, not from a site's own button. The
 * Mac's float.style (Search's window or macOS's picture in picture) held
 * two kinds of "on"; whichever a prefs file still has, it means on. */
export const floatEnabled = () => pref<boolean>('float.enabled') !== false

const isolated = (wc: WebContents, code: string, gesture = false): Promise<unknown> =>
  wc.executeJavaScriptInIsolatedWorld(PRELOAD_WORLD, [{ code: `(globalThis.__orielFloat ? (${code}) : null)` }], gesture)

registerSlice('float', c => (floating && floating.win === c.record.id ? { tab: floating.tab, tucked: !!floating.tuckedFrom } : null))

function markAll(): void { for (const c of allControllers()) c.mark('float') }

// where the little window goes

const SIZE = { width: 440, height: 247 }

function remembered(): Rect | null {
  const v = model.pref<unknown>('float.frame')
  if (typeof v !== 'string') return null
  const [x, y, width, height] = v.split(',').map(Number)
  if (![x, y, width, height].every(Number.isFinite) || width < 100 || height < 60) return null
  const r = { x, y, width, height }
  return screen.getAllDisplays().some(d => { const a = d.workArea; return r.x < a.x + a.width && r.x + r.width > a.x && r.y < a.y + a.height && r.y + r.height > a.y }) ? r : null
}

function firstSpot(): Rect {
  const a = screen.getPrimaryDisplay().workArea
  return remembered() ?? { x: a.x + a.width - SIZE.width - 24, y: a.y + a.height - SIZE.height - 24, ...SIZE }
}

/** Float.corner: where a flick sends the window, a margin in from the edges. */
export function corner(frame: Rect, area: Rect, way: { dx: number; dy: number }, margin = 12): { x: number; y: number } {
  const left = area.x + margin, right = area.x + area.width - margin - frame.width
  const top = area.y + margin, bottom = area.y + area.height - margin - frame.height
  const across = Math.abs(way.dx), up = Math.abs(way.dy)
  const x = way.dx > 0 ? right : left, y = way.dy > 0 ? bottom : top
  const midX = frame.x + frame.width / 2, midY = frame.y + frame.height / 2
  if (Math.min(across, up) >= 0.4 * Math.max(across, up)) return { x, y }
  if (across >= up) return { x, y: midY > area.y + area.height / 2 ? bottom : top }
  return { x: midX > area.x + area.width / 2 ? right : left, y }
}


function layoutInside(f: Floating): void {
  const { width, height } = f.base.getContentBounds()
  f.view.setBounds({ x: 0, y: 0, width, height })
  f.controls.setBounds({ x: 0, y: 0, width, height })
}

function tell(f: Floating, o: Record<string, unknown>): void {
  if (!f.controls.webContents.isDestroyed()) f.controls.webContents.executeJavaScript(`window.set ? set(${JSON.stringify(o)}) : false`).catch(() => {})
}

function openWindow(tab: ID, win: ID, view: WebContentsView, away: boolean): Floating {
  const spot = firstSpot()
  const base = new BaseWindow({
    ...spot, frame: false, show: false, alwaysOnTop: true, skipTaskbar: true, resizable: true, minimizable: false, maximizable: false,
    fullscreenable: false, minWidth: 260, minHeight: 146, backgroundColor: '#000000', title: 'Floating video', hasShadow: true, ...iconOption(),
    ...(process.platform === 'darwin' ? { visibleOnAllWorkspaces: true } : {}),
  } as Electron.BaseWindowConstructorOptions)
  base.setAlwaysOnTop(true, 'floating')
  if (quietTests) { base.setOpacity(0); base.setIgnoreMouseEvents(true) }
  const controls = new WebContentsView({ webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, javascript: true } })
  controls.setBackgroundColor('#00000000')
  keepOnPage(controls.webContents)
  base.contentView.addChildView(view)
  base.contentView.addChildView(controls)
  view.setBorderRadius(0)
  const f: Floating = { tab, win, view, base, controls, away, tuckedFrom: null, near: false, ticker: setInterval(() => tick(), 500), watcher: setInterval(() => hover(f), HOVER_TICK) }
  layoutInside(f)
  controls.webContents.loadFile(controlsPage).catch(() => {})
  controls.webContents.once('did-finish-load', () => tell(f, { tuck: !!pref<boolean>('float.minimize'), still: !!pref<boolean>('motion.instant'), playing: true }))
  controls.webContents.on('console-message', e => { const m = e.message ?? ''; if (m.startsWith('oriel-float:')) heard(f, m.slice(12)) })
  base.on('resize', () => layoutInside(f))
  for (const e of ['moved', 'resized'] as const) base.on(e as 'moved', () => keepFrame(f))
  base.on('closed', () => { if (floating === f) land() })
  base.showInactive()
  alpha = 1
  solidUntil = Date.now() + SOLID_FIRST
  setImmediate(fadeWatch)
  // Solid for its first moments, then it fades: the fade watch rests while it
  // is solid, so it is woken when they are over.
  setTimeout(fadeWatch, SOLID_FIRST + 60).unref?.()
  return f
}

/** Where the window was when the video was taken hold of: the pointer's travel is added to it. */
let held: Rect | null = null

function keepFrame(f: Floating): void {
  // Not at every step of a drag: once, when it is put down.
  if (held || f.tuckedFrom || f.base.isDestroyed()) return
  const b = f.base.getBounds()
  model.setPref('float.frame', `${b.x},${b.y},${b.width},${b.height}`)
}

/** A button, or two fingers, in the little window. */
function heard(f: Floating, what: string): void {
  const [name, a, b] = what.split(',')
  if (name === 'close') { land(); return }
  if (name === 'back') { goBack(); return }
  if (name === 'tuck') { tuck(f); return }
  // The window follows the pointer while the video is held (FloatControls.tsx).
  if (name === 'drag') {
    if (f.base.isDestroyed()) return
    if (a === 'start') { held = f.base.getBounds(); return }
    if (a === 'end') { held = null; keepFrame(f); markAll(); return }
    if (held && Number.isFinite(Number(a)) && Number.isFinite(Number(b))) {
      f.base.setBounds({ x: Math.round(held.x + Number(a)), y: Math.round(held.y + Number(b)), width: held.width, height: held.height })
    }
    return
  }
  if (name === 'toggle') { void isolated(f.view.webContents, 'globalThis.__orielFloat.toggle()', true).then(p => tell(f, { playing: !!p })); return }
  if (name === 'skip') { void isolated(f.view.webContents, `globalThis.__orielFloat.skip(${Number(a) || 0})`); return }
  // The line along the foot: a fraction of the video's length.
  if (name === 'seek') { if (Number.isFinite(Number(a))) void isolated(f.view.webContents, `globalThis.__orielFloat.seek(${Number(a)})`); return }
  if (name === 'wheel') wheel(f, Number(a) || 0, Number(b) || 0)
}

/** Two fingers: a flick goes to the corner it points at (float.flicks, on
 * unless turned off); a slower push, or with flicks off, moves it along. */
function wheel(f: Floating, dx: number, dy: number): void {
  if (f.base.isDestroyed()) return
  const frame = f.base.getBounds()
  const area = screen.getDisplayMatching(frame).workArea
  if (pref<boolean>('float.flicks') !== false && Math.hypot(dx, dy) > 120) {
    const to = corner(frame, area, { dx, dy })
    f.base.setPosition(Math.round(to.x), Math.round(to.y))
  } else {
    f.base.setPosition(Math.round(Math.min(Math.max(area.x, frame.x + dx), area.x + area.width - frame.width)),
      Math.round(Math.min(Math.max(area.y, frame.y + dy), area.y + area.height - frame.height)))
  }
  keepFrame(f)
  markAll()
}

/** Minimize the floating video: 220 wide in its corner, and back. */
function tuck(f: Floating): void {
  if (!pref<boolean>('float.minimize') && !f.tuckedFrom) return
  const frame = f.base.getBounds()
  if (f.tuckedFrom) {
    const home = f.tuckedFrom
    f.tuckedFrom = null
    f.base.setMinimumSize(260, 146)
    f.base.setBounds(home)
    tell(f, { tucked: false })
  } else {
    if (frame.width <= 230) return
    f.tuckedFrom = frame
    const wide = 220, tall = Math.round(wide * frame.height / Math.max(frame.width, 1))
    const area = screen.getDisplayMatching(frame).workArea
    f.base.setMinimumSize(wide, tall)
    f.base.setBounds({
      x: Math.min(Math.max(area.x, frame.x + frame.width - wide), area.x + area.width - wide),
      y: Math.min(Math.max(area.y, frame.y + frame.height - tall), area.y + area.height - tall),
      width: wide, height: tall,
    })
    tell(f, { tucked: true })
  }
  markAll()
}

function tick(): void {
  const f = floating
  if (!f || f.view.webContents.isDestroyed()) return
  void isolated(f.view.webContents, '[globalThis.__orielFloat.where(), globalThis.__orielFloat.gone()]').then(r => {
    if (floating !== f || !Array.isArray(r)) return
    const [[through, playing, seekable], gone] = r as [[number, boolean, boolean], boolean]
    tell(f, { through, playing, seekable })
    if (gone) land()
  }).catch(() => {})
}

/** Its buttons show while the pointer is over the window. The page has
 * :hover for that, but Windows hands a draggable region no hover at all, and
 * the whole window is one: so the main process says where the pointer is. */
const HOVER_TICK = 80
function hover(f: Floating): void {
  if (!f || f.base.isDestroyed()) return
  const on = pointerOn(f.base)
  if (on === f.near) return
  f.near = on
  tell(f, { near: on })
  // The pointer came or went: the see-through follows.
  fadeWatch()
}

// lifting and landing

/** Lift the playing video of `tab` (Browser.lift). quietly: on its own. */
export const lifts: string[] = []
export async function lift(tab: ID, quietly: boolean, away = false): Promise<string> {
  const r = await lifting(tab, quietly, away)
  lifts.push(r)
  if (lifts.length > 20) lifts.shift()
  return r
}

async function lifting(tab: ID, quietly: boolean, away: boolean): Promise<string> {
  if (!floatEnabled()) return 'off'
  if (floating) return 'busy'
  const t = model.tabs.get(tab)
  const rt = runtimes.get(tab)
  const wc = rt?.contents
  const win = model.windowOf(tab)
  if (!t || !rt?.view || !wc || !win || t.empty || t.internal) return 'no page'
  if (quietly && !knownPlayer(wc.getURL())) return 'not a player'
  if (quietly && !t.audible) return 'silent'
  const found = await isolated(wc, `globalThis.__orielFloat.on(${quietly})`).catch(() => null)
  if (found !== 'floating') return `found ${found}`
  // Its tab in front again meanwhile, or another video out, or the switch
  // turned off: nothing moves.
  if (floating || !floatEnabled() || model.onScreen(tab) || rt.view !== runtimes.get(tab)?.view) { void isolated(wc, 'globalThis.__orielFloat.off()'); return 'none' }
  floating = openWindow(tab, win.id, rt.view, away)
  liftedAway = away
  markAll()
  return 'floating'
}

/** Float the video of `tab` by hand: the one playing, or the one its page's
 * own button named. False when there is none, or another is out by now. */
async function floatByHand(tab: ID, win: ID): Promise<boolean> {
  const rt = runtimes.get(tab)
  const wc = rt?.contents
  if (!rt?.view || !wc) return false
  const found = await isolated(wc, 'globalThis.__orielFloat.on(false)').catch(() => null)
  if (found !== 'floating') return false
  if (floating || !floatEnabled() || rt.view !== runtimes.get(tab)?.view) { void isolated(wc, 'globalThis.__orielFloat.off()'); return false }
  // Its tab may be in front: its window lets go of the page, for good until it lands.
  controllerFor(win)?.hold(tab)
  floating = openWindow(tab, win, rt.view, false)
  markAll()
  return true
}

/** Back into its tab (Browser.land): the little window closes whatever else is true. */
export function land(): void {
  const f = floating
  if (!f) return
  floating = null
  liftedAway = false
  held = null
  clearInterval(f.ticker)
  clearInterval(f.watcher)
  const kids = f.base.isDestroyed() ? [] : f.base.contentView.children
  if (kids.includes(f.view)) f.base.contentView.removeChildView(f.view)
  if (!f.controls.webContents.isDestroyed()) f.controls.webContents.close()
  if (!f.base.isDestroyed()) f.base.destroy()
  const wc = f.view.webContents
  // On screen again: its window takes the page back, at the page's own size first.
  const c = controllerFor(f.win)
  c?.release(f.tab)
  const back = !!c && model.onScreen(f.tab)
  if (back) c.placePages()
  // The page lets go of its floating look only once it is back at its own
  // size: done while it was still the little window's size, it laid itself out
  // small (a player's mini layout) and again at full size, and the return to
  // the video stuttered. A moment for the window to place it first.
  if (!wc.isDestroyed()) {
    if (back) setTimeout(() => { if (!wc.isDestroyed() && floating?.view !== f.view) void isolated(wc, 'globalThis.__orielFloat.off()') }, 60)
    else void isolated(wc, 'globalThis.__orielFloat.off()')
  }
  markAll()
}

/** Back to the tab it came from, in front (Float onReturn). */
function goBack(): void {
  const f = floating
  if (!f) return
  const win = model.windows.get(f.win)
  land()
  const c = controllerFor(f.win)
  if (win && model.tabs.has(f.tab)) { model.selectTab(win, f.tab); c?.base.show(); c?.base.focus(); c?.focusPage() }
}

// see through, away from the pointer (float.fade)

/** At the slider's end a fifth of the window stays. */
const FADE_MOST = 0.8
/** A tick of the fade: about 30 a second, only while something floats. */
const FADE_TICK = 33
/** Just out, it stays solid this long, so you see where it went: with the
 * slider at its end it came out at a fifth, over a dark page, and seemed
 * not to come out at all (carpa, 24 Nov 2026). */
const SOLID_FIRST = 2500
let solidUntil = 0

const fadeLevel = () => { const v = Number(pref('float.fade')); return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0 }
let alpha = 1
let fader: NodeJS.Timeout | null = null
/** Where a test world says the pointer is (its window is invisible and lets
 * clicks through, so the real pointer is never on it): null, the real one. */
let pointerSaid: boolean | null = null
export function setFloatPointer(on: boolean | null): void { pointerSaid = on }

/** The pointer inside the little window, which stays on top of everything,
 * so inside is on it; Windows' own window-under-a-point answers past
 * Electron's little window, to whatever is behind it. */
function pointerOn(base: BaseWindow | null): boolean {
  if (pointerSaid !== null) return pointerSaid
  if (!base || quietTests) return false
  const w = win32()
  if (w) {
    const p = w.cursor(), r = w.windowRect(w.hwnd(base.getNativeWindowHandle()))
    return p.x >= r.left && p.x < r.right && p.y >= r.top && p.y < r.bottom
  }
  const p = screen.getCursorScreenPoint(), b = base.getBounds()
  return p.x >= b.x && p.y >= b.y && p.x < b.x + b.width && p.y < b.y + b.height
}

/** A test world's window stays at no opacity at all: the number is kept, never applied. */
function setAlpha(base: BaseWindow, a: number): void {
  if (!quietTests) base.setOpacity(a)
}

/** One step towards solid (the pointer on it) or see-through (away). */
function fadeStep(): void {
  const base = floating && !floating.base.isDestroyed() ? floating.base : null
  if (!base) { stopFade(); return }
  const target = pointerOn(base) || Date.now() < solidUntil ? 1 : 1 - FADE_MOST * fadeLevel()
  if (Math.abs(target - alpha) < 0.005 && target === 1 && fadeLevel() === 0) { alpha = 1; setAlpha(base, 1); stopFade(); return }
  const next = Math.abs(target - alpha) < 0.01 ? target : alpha + (target - alpha) * 0.3
  // Arrived: nothing more to do until the pointer comes or goes (hover wakes
  // it) or the first solid moments pass. Left running it asked Windows for
  // the pointer thirty times a second for as long as the video floated.
  if (next === alpha) { if (Date.now() >= solidUntil) stopFade(); return }
  alpha = next
  setAlpha(base, alpha)
}

function stopFade(): void {
  if (fader) clearInterval(fader)
  fader = null
}

/** Watching starts while something floats and the slider isn't at 0, and
 * goes on until the window is solid again. */
function fadeWatch(): void {
  if (fader || !floating) return
  if (fadeLevel() === 0 && alpha === 1) return
  fader = setInterval(fadeStep, FADE_TICK)
}

// on its own

model.on('selected', (win: WindowRecord, id: ID) => {
  // The tab just left: selectTab puts it first in `used`, touched at the
  // same moment as the one now in front.
  const now = model.tabs.get(id)
  const was = win.used[0] ? model.tabs.get(win.used[0]) : undefined
  const left = was && now && was.touched === now.touched ? was.id : undefined
  if (floating?.tab === id || floating?.win === win.id && model.onScreen(floating.tab)) land()
  if (left && left !== id && pref<boolean>('float.leave') !== false && model.tabs.has(left) && !model.onScreen(left)) {
    void lift(left, true).catch(() => {})
  }
})

model.on('tab-closed', (id: ID) => { if (floating?.tab === id) land() })

/** Oriel left for another app: float.away lifts the video in front. */
function appLeft(win: ID): void {
  if (!floatEnabled() || !pref<boolean>('float.away') || floating) return
  const w = model.windows.get(win)
  const id = w?.active[w.space]
  if (!w || !id) return
  // Lifted from a tab still on screen: its view leaves the window for the little one.
  const c = controllerFor(win)
  const view = runtimes.get(id)?.view
  if (!c || !view) return
  void (async () => {
    const t = model.tabs.get(id)
    const wc = runtimes.get(id)?.contents
    if (!t || !wc || !knownPlayer(wc.getURL()) || !t.audible) return
    const found = await isolated(wc, 'globalThis.__orielFloat.on(true)').catch(() => null)
    if (found !== 'floating' || floating || !floatEnabled() || anyFocused()) { if (found === 'floating') void isolated(wc, 'globalThis.__orielFloat.off()'); return }
    c.hold(id)
    floating = openWindow(id, win, view, true)
    liftedAway = true
    markAll()
  })()
}

/** Back in Oriel, on the tab it came from: into the tab again (appBack). */
function appBack(win: ID): void {
  if (!liftedAway) return
  liftedAway = false
  const w = model.windows.get(win)
  const id = w?.active[w.space]
  if (floating && floating.away && floating.tab === id) land()
}

const anyFocused = () => allControllers().some(c => !c.base.isDestroyed() && c.base.isFocused())

model.on('window-opened', (id: string) => setImmediate(() => {
  const c = controllerFor(id)
  if (!c) return
  c.base.on('blur', () => setTimeout(() => { if (!anyFocused()) appLeft(id) }, 50))
  c.base.on('focus', () => appBack(id))
}))

// Settings moving under it: Floating video turned off lands what floats,
// Minimize appears or goes at once, and the slider's see-through shows on
// the floating video as it moves.
model.on('window-changed', (_id: string, slices: string[]) => {
  if (slices.includes('prefs')) fadeWatch()
  if (!slices.includes('prefs') || !floating) return
  if (!floatEnabled()) { land(); return }
  const on = !!pref<boolean>('float.minimize')
  tell(floating, { tuck: on, still: !!pref<boolean>('motion.instant') })
  if (!on && floating.tuckedFrom) tuck(floating)
})

// Ctrl+Shift+P, Float Video (keys.ts's table): lands one that floats, or
// floats the video playing in front, by hand. Off in Settings, nothing.
handle('view.float', async ({ id }, ctx) => {
  const c = need(ctx)
  if (!floatEnabled()) return { said: 'The floating video is off in Settings' }
  if (floating) { land(); return { landed: true } }
  const tab = id ?? c.record.active[c.record.space]
  if (!tab || !(await floatByHand(tab, c.record.id))) return { said: 'Nothing is playing here' }
  return { floating: true }
})

// A site's own picture in picture button, or its player's: the page asks
// (preload/page/float.ts) and the video floats here instead, or lands if it
// already floats. Off in Settings the page never asks: the button is refused.
ipcMain.on('float:request', event => {
  if (event.senderFrame !== event.sender.mainFrame || !floatEnabled()) return
  const rt = [...runtimes.values()].find(r => r.contents === event.sender)
  const win = rt && model.windowOf(rt.id)
  if (!rt || !win) return
  if (floating?.tab === rt.id) { land(); return }
  if (!model.onScreen(rt.id)) return
  if (floating) land()
  void floatByHand(rt.id, win.id)
})

handle('pages.float.land', () => land())
handle('pages.float.close', () => land())
handle('pages.float.toggle', () => { if (floating) heard(floating, 'toggle') })
handle('pages.float.skip', ({ seconds }) => { if (floating) heard(floating, `skip,${seconds}`) })
handle('pages.float.tuck', () => { if (floating) tuck(floating) })

/** For the bench: what the fade sees under the pointer. */
function fadeProbe(): Record<string, unknown> {
  const w = win32()
  const base = floating && !floating.base.isDestroyed() ? floating.base : null
  if (!w || !base) return {}
  return { pointer: w.cursor(), on: pointerOn(base) }
}

/** For the bench. */
export function floatInfo() {
  const f = floating
  return {
    enabled: floatEnabled(),
    floating: f ? { tab: f.tab, win: f.win, bounds: f.base.getBounds(), tucked: !!f.tuckedFrom, away: f.away, holdsPage: f.base.contentView.children.includes(f.view), controls: f.controls.webContents.id, near: f.near } : null,
    fade: { level: fadeLevel(), alpha, watching: !!fader, ...fadeProbe() },
    lifts: lifts.slice(-5),
  }
}
export function floatControls(): WebContents | null { return floating && !floating.controls.webContents.isDestroyed() ? floating.controls.webContents : null }
export function floatWheel(dx: number, dy: number): void { if (floating) wheel(floating, dx, dy) }

/** Runs in the buttons' page (it has a canvas): lays the pictures out. */
function compose(parts: { b: { x: number; y: number; width: number; height: number }; png: string }[], width: number, height: number): Promise<string> {
  const canvas = document.createElement('canvas')
  const scale = devicePixelRatio
  canvas.width = width * scale
  canvas.height = height * scale
  const g = canvas.getContext('2d')!
  return parts.reduce((p, part) => p.then(() => new Promise<void>(done => {
    const img = new Image()
    img.onload = () => { g.drawImage(img, part.b.x * scale, part.b.y * scale, part.b.width * scale, part.b.height * scale); done() }
    img.onerror = () => done()
    img.src = 'data:image/png;base64,' + part.png
  })), Promise.resolve()).then(() => canvas.toDataURL('image/png').split(',')[1])
}

/** For the bench: a picture of the floating window, its video and its
 * buttons each at its place (the window itself is invisible in a test world). */
export async function floatShot(file: string): Promise<{ width: number; height: number } | null> {
  const f = floating
  if (!f || f.base.isDestroyed() || f.controls.webContents.isDestroyed()) return null
  const { width, height } = f.base.getContentBounds()
  const parts = await Promise.all([f.view, f.controls].map(async v => ({ b: v.getBounds(), png: (await v.webContents.capturePage()).toPNG().toString('base64') })))
  const data: string = await f.controls.webContents.executeJavaScript(`(${compose.toString()})(${JSON.stringify(parts)}, ${width}, ${height})`, true)
  writeFileSync(file, Buffer.from(data, 'base64'))
  return { width, height }
}

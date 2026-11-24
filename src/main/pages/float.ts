// The floating video (studio/06 §1.5 #78-#81, §3.5; Float.swift, NativePiP.swift,
// Browser.swift lift/land/appLeft). A video keeps playing in a small window
// above everything when you go somewhere else.
//  - Oriel's window (float.style "search", the default): the page itself
//    moves. Everything but the video is made invisible, the video fills the
//    page, and the tab's whole view goes into a small frameless window that
//    stays on top; the video never stops, it only changed windows. Buttons
//    on hover: close, back to the tab, play/pause, 15 s back and on, and,
//    with Minimize the floating video, a button that tucks it small.
//    Two fingers on a touchpad flick it to the corner they point at.
//  - Picture in picture ("system"): Chromium's own, with its controls.
// On its own (Float the video on its own): leaving a tab (float.leave, on)
// or Oriel (float.away) floats a video that is playing and heard, from a
// site whose video is the point of the site (Players.knows); coming back to
// the tab, or to Oriel for one lifted that way, lands it. Ctrl+Shift+P
// floats any playing video by hand, or lands it.
// See through (float.fade, Oriel's own): away from the pointer either one
// lets what is behind show through, as much as Settings' slider says.

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
  ticker: NodeJS.Timeout
}

let floating: Floating | null = null
/** The tab whose video is in Chromium's picture in picture. */
let pictured: ID | null = null
let liftedAway = false

const isolated = (wc: WebContents, code: string, gesture = false): Promise<unknown> =>
  wc.executeJavaScriptInIsolatedWorld(PRELOAD_WORLD, [{ code: `(globalThis.__orielFloat ? (${code}) : null)` }], gesture)

registerSlice('float', c => (floating && floating.win === c.record.id ? { tab: floating.tab, style: 'search', tucked: !!floating.tuckedFrom }
  : pictured && model.windowOf(pictured)?.id === c.record.id ? { tab: pictured, style: 'system', tucked: false } : null))

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

// the buttons over the video: a page with no preload that speaks through
// its console (oriel-float:close), read in console-message.

const glyph = (d: string, size: number) => `<svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`
const CONTROLS = `<!doctype html><meta charset="utf-8"><style>
html,body{margin:0;height:100%;overflow:hidden;background:transparent;-webkit-app-region:drag;user-select:none;cursor:default}
.scrim{position:fixed;inset:0;background:linear-gradient(rgba(0,0,0,.45),rgba(0,0,0,0) 28%,rgba(0,0,0,0) 66%,rgba(0,0,0,.5));opacity:0;transition:opacity .15s}
button{-webkit-app-region:no-drag;position:fixed;border:0;border-radius:50%;background:rgba(26,26,26,.55);display:grid;place-items:center;padding:0;opacity:0;transition:opacity .15s}
body:hover .scrim,body:hover button,body:hover #line,body.near .scrim,body.near button,body.near #line{opacity:1}
#close{left:14px;top:14px;width:30px;height:30px}#tuck{left:52px;top:14px;width:30px;height:30px}#back{right:14px;top:14px;width:30px;height:30px}
#pause{left:calc(50% - 25px);top:calc(50% - 25px);width:50px;height:50px}
#rewind{left:calc(50% - 79px);top:calc(50% - 19px);width:38px;height:38px}#forward{left:calc(50% + 41px);top:calc(50% - 19px);width:38px;height:38px}
#line{position:fixed;left:0;right:0;bottom:0;height:3px;background:rgba(255,255,255,.22);opacity:0}#line i{display:block;height:100%;width:0;background:rgba(255,255,255,.85)}
body.tucked #rewind,body.tucked #pause,body.tucked #forward,body.tucked #line{display:none}.off{display:none}
</style><div class="scrim"></div>
<button id="close" title="Close" aria-label="Close">${glyph('<path d="m5 5 6 6m0-6-6 6"/>', 11)}</button>
<button id="tuck" class="off" title="Minimize" aria-label="Minimize">${glyph('<path d="M4.5 8h7"/>', 11)}</button>
<button id="back" title="Back to the tab" aria-label="Back to the tab">${glyph('<path d="M6 4h6v6M12 4 4.5 11.5"/>', 12)}</button>
<button id="rewind" title="Back 15 seconds" aria-label="Back 15 seconds">${glyph('<path d="M3.5 8a4.5 4.5 0 1 0 1.4-3.3M4.9 2.4v2.4h2.4"/>', 15)}</button>
<button id="pause" title="Pause" aria-label="Pause">${glyph('<path d="M6 4.5v7M10 4.5v7"/>', 17)}</button>
<button id="forward" title="Forward 15 seconds" aria-label="Forward 15 seconds">${glyph('<path d="M12.5 8a4.5 4.5 0 1 1-1.4-3.3M11.1 2.4v2.4H8.7"/>', 15)}</button>
<div id="line"><i></i></div>
<script>
const say = w => console.debug('oriel-float:' + w);
for (const [id, w] of [['close','close'],['tuck','tuck'],['back','back'],['rewind','skip,-15'],['pause','toggle'],['forward','skip,15']]) document.getElementById(id).onclick = () => say(w);
let sum = { x: 0, y: 0 }, quiet = null;
addEventListener('wheel', e => {
  e.preventDefault(); sum.x += e.deltaX; sum.y += e.deltaY; clearTimeout(quiet);
  quiet = setTimeout(() => { const s = sum; sum = { x: 0, y: 0 }; say('wheel,' + Math.round(s.x) + ',' + Math.round(s.y)); }, 120);
}, { passive: false });
const pauseIcon = document.getElementById('pause').innerHTML;
const playIcon = '${glyph('<path d="M5.5 4v8l6.5-4z" fill="#fff"/>', 17).replace(/"/g, '\\"')}';
window.set = o => {
  if ('tuck' in o) document.getElementById('tuck').classList.toggle('off', !o.tuck);
  if ('tucked' in o) { document.body.classList.toggle('tucked', o.tucked); document.getElementById('tuck').innerHTML = o.tucked ? '${glyph('<path d="M8 4.5v7M4.5 8h7"/>', 11)}' : '${glyph('<path d="M4.5 8h7"/>', 11)}'; }
  if ('playing' in o) { const b = document.getElementById('pause'); b.innerHTML = o.playing ? pauseIcon : playIcon; b.title = o.playing ? 'Pause' : 'Play'; }
  if ('through' in o) document.querySelector('#line i').style.width = (o.through * 100) + '%';
  if ('near' in o) document.body.classList.toggle('near', o.near);
  return true;
};
</script>`

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
  const f: Floating = { tab, win, view, base, controls, away, tuckedFrom: null, ticker: setInterval(() => tick(), 500) }
  layoutInside(f)
  controls.webContents.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(CONTROLS)).catch(() => {})
  controls.webContents.once('did-finish-load', () => tell(f, { tuck: !!pref<boolean>('float.minimize'), playing: true }))
  controls.webContents.on('console-message', e => { const m = e.message ?? ''; if (m.startsWith('oriel-float:')) heard(f, m.slice(12)) })
  base.on('resize', () => layoutInside(f))
  for (const e of ['moved', 'resized'] as const) base.on(e as 'moved', () => keepFrame(f))
  base.on('closed', () => { if (floating === f) land() })
  base.showInactive()
  alpha = 1
  setImmediate(fadeWatch)
  return f
}

function keepFrame(f: Floating): void {
  if (f.tuckedFrom || f.base.isDestroyed()) return
  const b = f.base.getBounds()
  model.setPref('float.frame', `${b.x},${b.y},${b.width},${b.height}`)
}

/** A button, or two fingers, in the little window. */
function heard(f: Floating, what: string): void {
  const [name, a, b] = what.split(',')
  if (name === 'close') { land(); return }
  if (name === 'back') { goBack(); return }
  if (name === 'tuck') { tuck(f); return }
  if (name === 'toggle') { void isolated(f.view.webContents, 'globalThis.__orielFloat.toggle()', true).then(p => tell(f, { playing: !!p })); return }
  if (name === 'skip') { void isolated(f.view.webContents, `globalThis.__orielFloat.skip(${Number(a) || 0})`); return }
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
    const [[through, playing], gone] = r as [[number, boolean], boolean]
    tell(f, { through, playing })
    if (gone) land()
  }).catch(() => {})
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
  if (floating) return 'busy'
  const t = model.tabs.get(tab)
  const rt = runtimes.get(tab)
  const wc = rt?.contents
  const win = model.windowOf(tab)
  if (!t || !rt?.view || !wc || !win || t.empty || t.internal) return 'no page'
  if (quietly && !knownPlayer(wc.getURL())) return 'not a player'
  if (quietly && !t.audible) return 'silent'
  if (pref<string>('float.style') === 'system') return picture(tab, quietly, false)
  const found = await isolated(wc, `globalThis.__orielFloat.on(${quietly})`).catch(() => null)
  if (found !== 'floating') return `found ${found}`
  // Its tab in front again meanwhile, or another video out: nothing moves.
  if (floating || model.onScreen(tab) || rt.view !== runtimes.get(tab)?.view) { void isolated(wc, 'globalThis.__orielFloat.off()'); return 'none' }
  floating = openWindow(tab, win.id, rt.view, away)
  liftedAway = away
  markAll()
  return 'floating'
}

/** Back into its tab (Browser.land): the little window closes whatever else is true. */
export function land(): void {
  const f = floating
  if (!f) return
  floating = null
  liftedAway = false
  clearInterval(f.ticker)
  const kids = f.base.isDestroyed() ? [] : f.base.contentView.children
  if (kids.includes(f.view)) f.base.contentView.removeChildView(f.view)
  if (!f.controls.webContents.isDestroyed()) f.controls.webContents.close()
  if (!f.base.isDestroyed()) f.base.destroy()
  const wc = f.view.webContents
  if (!wc.isDestroyed()) void isolated(wc, 'globalThis.__orielFloat.off()')
  // On screen again: its window takes the page back.
  const c = controllerFor(f.win)
  if (c && model.onScreen(f.tab)) c.placePages()
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

const fadeLevel = () => { const v = Number(pref('float.fade')); return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0 }
let alpha = 1
let fader: NodeJS.Timeout | null = null
/** Chromium's picture in picture window, once found. */
let pipWindow = 0

/** The little window's handle, and the picture in picture's (found the
 * first time: this process's always-on-top Chromium window that is none of
 * Electron's). */
function fadingWindows(): { base: BaseWindow | null; hwnds: number[] } {
  const w = win32()
  const base = floating && !floating.base.isDestroyed() ? floating.base : null
  const hwnds: number[] = []
  if (base && w) hwnds.push(w.hwnd(base.getNativeWindowHandle()))
  if (pictured && w) {
    if (pipWindow && !w.isWindow(pipWindow)) pipWindow = 0
    if (!pipWindow) {
      const ours = BaseWindow.getAllWindows().filter(b => !b.isDestroyed()).map(b => w.hwnd(b.getNativeWindowHandle()))
      pipWindow = w.topmostOf(process.pid, ours)[0] ?? 0
    }
    if (pipWindow) hwnds.push(pipWindow)
  }
  return { base, hwnds }
}

/** The pointer inside one of them. Both stay on top of everything, so
 * inside is on it; Windows' own window-under-a-point answers past Electron's
 * little window, to whatever is behind it. */
function pointerOn(base: BaseWindow | null, hwnds: number[]): boolean {
  const w = win32()
  if (w) {
    const p = w.cursor()
    return hwnds.some(h => { const r = w.windowRect(h); return p.x >= r.left && p.x < r.right && p.y >= r.top && p.y < r.bottom })
  }
  if (!base) return false
  const p = screen.getCursorScreenPoint(), b = base.getBounds()
  return p.x >= b.x && p.y >= b.y && p.x < b.x + b.width && p.y < b.y + b.height
}

function setAlpha(base: BaseWindow | null, hwnds: number[], a: number): void {
  if (base) base.setOpacity(a)
  const w = win32()
  if (w) for (const h of hwnds) if (h === pipWindow) w.setAlpha(h, a)
}

/** One step towards solid (the pointer on it) or see-through (away). */
function fadeStep(): void {
  if (quietTests) return
  const { base, hwnds } = fadingWindows()
  if (!base && !hwnds.length) { if (!floating && !pictured) stopFade(); return }
  const target = pointerOn(base, hwnds) ? 1 : 1 - FADE_MOST * fadeLevel()
  if (Math.abs(target - alpha) < 0.005 && target === 1 && fadeLevel() === 0) { setAlpha(base, hwnds, 1); stopFade(); return }
  const next = Math.abs(target - alpha) < 0.01 ? target : alpha + (target - alpha) * 0.3
  if (next === alpha) return
  alpha = next
  setAlpha(base, hwnds, alpha)
}

function stopFade(): void {
  if (fader) clearInterval(fader)
  fader = null
}

/** Watching starts while something floats and the slider isn't at 0, and
 * goes on until the window is solid again. */
function fadeWatch(): void {
  if (fader || quietTests || (!floating && !pictured)) return
  if (fadeLevel() === 0 && alpha === 1) return
  fader = setInterval(fadeStep, FADE_TICK)
}

// The page's video in and out of picture in picture, by Oriel or by the
// page's own button (preload/page/float.ts).
ipcMain.on('float:pip', (event, on: unknown) => {
  if (event.senderFrame !== event.sender.mainFrame) return
  const rt = [...runtimes.values()].find(r => r.contents === event.sender)
  if (!rt) return
  if (on === true) { pictured = rt.id; pipWindow = 0; alpha = 1; setImmediate(fadeWatch) }
  else if (pictured === rt.id) { pictured = null; pipWindow = 0 }
  markAll()
})

/** Chromium's picture in picture (Browser.picture). */
async function picture(tab: ID, quietly: boolean, toggle: boolean): Promise<string> {
  const wc = runtimes.get(tab)?.contents
  if (!wc) return 'none'
  const answer = String(await isolated(wc, `globalThis.__orielFloat.pip(${quietly}, ${toggle})`, true).catch(() => 'none'))
  if (answer === 'in') pictured = tab
  if (answer === 'out' && pictured === tab) pictured = null
  markAll()
  return answer
}

function unpicture(): void {
  const id = pictured
  pictured = null
  const wc = id ? runtimes.get(id)?.contents : null
  if (wc) void isolated(wc, 'globalThis.__orielFloat.pipOff()')
  markAll()
}

// on its own

model.on('selected', (win: WindowRecord, id: ID) => {
  // The tab just left: selectTab puts it first in `used`, touched at the
  // same moment as the one now in front.
  const now = model.tabs.get(id)
  const was = win.used[0] ? model.tabs.get(win.used[0]) : undefined
  const left = was && now && was.touched === now.touched ? was.id : undefined
  if (floating?.tab === id || floating?.win === win.id && model.onScreen(floating.tab)) land()
  if (pictured === id) unpicture()
  if (left && left !== id && pref<boolean>('float.leave') !== false && model.tabs.has(left) && !model.onScreen(left)) {
    void lift(left, true).catch(() => {})
  }
})

model.on('tab-closed', (id: ID) => { if (floating?.tab === id) land(); if (pictured === id) pictured = null })

/** Oriel left for another app: float.away lifts the video in front. */
function appLeft(win: ID): void {
  if (!pref<boolean>('float.away') || floating || pictured) return
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
    if (pref<string>('float.style') === 'system') { if (await picture(id, true, false) === 'in') liftedAway = true; return }
    const found = await isolated(wc, 'globalThis.__orielFloat.on(true)').catch(() => null)
    if (found !== 'floating' || floating || anyFocused()) { if (found === 'floating') void isolated(wc, 'globalThis.__orielFloat.off()'); return }
    if (c.base.contentView.children.includes(view)) c.base.contentView.removeChildView(view)
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
  if (pictured && pictured === id) unpicture()
}

const anyFocused = () => allControllers().some(c => !c.base.isDestroyed() && c.base.isFocused())

model.on('window-opened', (id: string) => setImmediate(() => {
  const c = controllerFor(id)
  if (!c) return
  c.base.on('blur', () => setTimeout(() => { if (!anyFocused()) appLeft(id) }, 50))
  c.base.on('focus', () => appBack(id))
}))

// Settings moving under it: Minimize appears or goes at once, and the
// slider's see-through shows on the floating video as it moves.
model.on('window-changed', (_id: string, slices: string[]) => {
  if (slices.includes('prefs')) fadeWatch()
  if (!slices.includes('prefs') || !floating) return
  const on = !!pref<boolean>('float.minimize')
  tell(floating, { tuck: on })
  if (!on && floating.tuckedFrom) tuck(floating)
})

// Ctrl+Shift+P, Float Video (keys.ts's table): lands one that floats, or
// floats the video playing in front, by hand.
handle('view.float', async ({ id }, ctx) => {
  const c = need(ctx)
  if (floating) { land(); return { landed: true } }
  const tab = id ?? c.record.active[c.record.space]
  if (!tab) return { said: 'Nothing is playing here' }
  if (pref<string>('float.style') === 'system') {
    const r = await picture(tab, false, true)
    return r === 'none' ? { said: 'Nothing is playing here' } : r === 'refused' ? { said: 'This page keeps its video to itself' } : { picture: r }
  }
  const rt = runtimes.get(tab)
  const wc = rt?.contents
  if (!rt?.view || !wc) return { said: 'Nothing is playing here' }
  const found = await isolated(wc, 'globalThis.__orielFloat.on(false)').catch(() => null)
  if (found !== 'floating') return { said: 'Nothing is playing here' }
  if (c.base.contentView.children.includes(rt.view)) c.base.contentView.removeChildView(rt.view)
  floating = openWindow(tab, c.record.id, rt.view, false)
  markAll()
  return { floating: true }
})

handle('pages.float.land', () => land())
handle('pages.float.close', () => land())
handle('pages.float.toggle', () => { if (floating) heard(floating, 'toggle') })
handle('pages.float.skip', ({ seconds }) => { if (floating) heard(floating, `skip,${seconds}`) })
handle('pages.float.tuck', () => { if (floating) tuck(floating) })

/** For the bench: what the fade sees under the pointer. */
function fadeProbe(): Record<string, unknown> {
  const w = win32()
  if (!w || (!floating && !pictured)) return {}
  const { base, hwnds } = fadingWindows()
  const at = w.cursor()
  return { pointer: at, hwnds, on: pointerOn(base, hwnds) }
}

/** For the bench. */
export function floatInfo() {
  const f = floating
  return {
    floating: f ? { tab: f.tab, win: f.win, bounds: f.base.getBounds(), tucked: !!f.tuckedFrom, away: f.away, holdsPage: f.base.contentView.children.includes(f.view), controls: f.controls.webContents.id } : null,
    pictured,
    fade: { level: fadeLevel(), alpha, watching: !!fader, pipWindow: pipWindow ? win32()?.title(pipWindow) ?? '' : null, ...fadeProbe() },
    lifts: lifts.slice(-5),
  }
}
export function floatControls(): WebContents | null { return floating && !floating.controls.webContents.isDestroyed() ? floating.controls.webContents : null }
export function floatWheel(dx: number, dy: number): void { if (floating) wheel(floating, dx, dy) }

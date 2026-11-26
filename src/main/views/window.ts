// One browser window: a BaseWindow with three layers of views.
//   1. the interface (column, bar, empty tab's field), full size, at the bottom;
//   2. the pages on screen, at the rectangles the interface measured for them;
//   3. the overlay, transparent, sized to whatever floats over the pages right
//      now and zero otherwise, so clicks elsewhere reach the page.
// The model is the truth; this sends the window's slice to both interface
// roots as patches.

import { BaseWindow, WebContentsView, nativeTheme, screen, session as electronSession, type Session } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ID, OverlayLayer, Rect, WindowState } from '../../shared/state'
import { IPC } from '../../shared/ipc'
import { model, type Slice, type WindowRecord } from '../model/model'
import { chromeKind } from '../paths'
import { runtimeFor, runtimes, type TabRuntime } from './tabs'
import { Frame, cascadeFrom, frameColour, frameKind, overlayColours, windowOptions } from '../window/frame'
import type { Insets } from '../../shared/modules/window'
import { run } from '../router'
import { keepOnPage } from './guard'

const here = path.dirname(fileURLToPath(import.meta.url))
export const uiPreload = path.join(here, '../preload/ui.cjs')
const uiPage = path.join(here, '../ui/index.html')

/** The interface's own file (either root), never anything else. Compared as
 * a path: Chromium and Node spell a file: address of an unusual folder
 * (spaces, accents) differently; Windows paths ignore case. */
export function isInterfacePage(url: string): boolean {
  if (!/^file:/i.test(url)) return false
  let file: string
  try { file = path.resolve(fileURLToPath(url.split(/[?#]/)[0])) } catch { return false }
  const want = path.resolve(uiPage)
  return process.platform === 'win32' ? file.toLowerCase() === want.toLowerCase() : file === want
}

/** Distances of a page's rectangle from the window's edges, so a resize can
 * move pages at once, before the interface measures again. */
interface Slot { insets: { left: number; top: number; right: number; bottom: number }; radius: number }

const controllers = new Map<ID, WindowController>()
/** Modules hear of each page the first time it comes on screen (zoom). */
export const pageAttached: ((id: ID, contents: Electron.WebContents) => void)[] = []
/** Pages whose focus is already watched (a click in a page of a split gives it the keys). */
const watched = new WeakSet<Electron.WebContents>()

/** Modules add parts of the window's state without touching this file:
 * registerSlice('downloads', c => ...). Send a part again with c.mark(key). */
const sliceMakers = new Map<string, (c: WindowController) => unknown>()
export function registerSlice(key: string, make: (c: WindowController) => unknown): void { sliceMakers.set(key, make) }

/** Panels that give way to anything else wanting the overlay (the star ask,
 * settings/star.ts): a menu, a question or the field simply takes its place. */
export const yielding = new Set<string>()
/** Nothing floats over the page, or only a panel that gives way. */
export function overlayFree(layer: OverlayLayer): boolean {
  return layer.kind === 'none' || (layer.kind === 'panel' && yielding.has(layer.name))
}

export function controllerFor(id: ID): WindowController | undefined { return controllers.get(id) }
export function allControllers(): WindowController[] { return [...controllers.values()] }
export function focusedController(): WindowController | undefined {
  return allControllers().find(c => c.base.isFocused()) ?? allControllers()[0]
}

/** What the floating region is placed against: the window's content, and
 * the part of it that is seen (a free window's shadow is around it; a
 * maximized one reaches past the screen). */
export interface Laid { width: number; height: number; seen: Rect }

/** A floating region kept where it belongs when the window changes size or
 * its shadow comes and goes: what spanned the window still spans it, what
 * sat toward the right or the bottom of what is seen keeps its distance
 * from that edge, a centred one stays centred, and none is left outside. */
export function follow(r: Rect, from: Laid, to: Laid): Rect {
  const axis = (pos: number, size: number, was: number, now: number, wasAt: number, wasSeen: number, nowAt: number, nowSeen: number): [number, number] => {
    if (pos <= 1 && size >= was - 1) return [0, now]
    const rel = pos - wasAt, mid = rel + size / 2
    const p = nowAt + (Math.abs(mid - wasSeen / 2) <= 2 ? (nowSeen - size) / 2 : mid > wasSeen / 2 ? rel + nowSeen - wasSeen : rel)
    const s = Math.min(size, now)
    const lo = s <= nowSeen ? nowAt : 0, hi = s <= nowSeen ? nowAt + nowSeen - s : now - s
    return [Math.round(Math.max(lo, Math.min(p, hi))), s]
  }
  const [x, width] = axis(r.x, r.width, from.width, to.width, from.seen.x, from.seen.width, to.seen.x, to.seen.width)
  const [y, height] = axis(r.y, r.height, from.height, to.height, from.seen.y, from.seen.height, to.seen.y, to.seen.height)
  return { x, y, width, height }
}

export class WindowController {
  readonly base: BaseWindow
  readonly ui: WebContentsView
  readonly overlay: WebContentsView
  readonly chrome = chromeKind()
  readonly frame: Frame
  private slots = new Map<ID, Slot>()
  private shown = new Set<ID>()
  /** Pages of this window that are out in the floating video's window
   * (pages/float.ts): not placed here, however long their tab is in front. */
  private held = new Set<ID>()
  rev = 0
  private dirty = new Set<string>()
  private flushTimer: NodeJS.Timeout | null = null
  private overlayRect: Rect | null = null
  overlayLayer: OverlayLayer = { kind: 'none' }
  /** Tests only (window.pageTrace): each page placed, when and where. */
  pageTrace: { t: number; id: ID; rect: Rect }[] | null = null
  private room: { side: 'left' | 'right'; width: number; place: (rect: Rect | null) => void; insets?: Slot['insets'] } | null = null

  constructor(readonly record: WindowRecord, readonly pageSession: Session) {
    const dark = nativeTheme.shouldUseDarkColors
    const kind = frameKind(this.chrome)
    const front = focusedController()
    this.base = new BaseWindow({ ...windowOptions(kind, dark), ...cascadeFrom(front && !front.base.isFullScreen() ? { kind: front.frame.kind, visual: front.frame.normalVisual() } : null, kind) })
    // Developing the Windows look on a Mac with Windows' frame: our buttons.
    if (process.platform === 'darwin' && kind === 'native') this.base.setWindowButtonVisibility(false)
    this.frame = new Frame(this, kind)
    const ground = kind === 'drawn' ? '#00000000' : frameColour(dark)

    const uiPrefs = (root: string) => ({
      preload: uiPreload,
      sandbox: true,
      contextIsolation: true,
      session: electronSession.defaultSession,
      additionalArguments: [`--search-root=${root}`],
      backgroundThrottling: false,
      // A link or file dropped on the interface asks to navigate, and
      // keepOnPage below opens it in a tab (studio/09 §1.1).
      navigateOnDragDrop: true,
    })
    this.ui = new WebContentsView({ webPreferences: uiPrefs('chrome') })
    this.ui.setBackgroundColor(ground)
    this.overlay = new WebContentsView({ webPreferences: uiPrefs('overlay') })
    this.overlay.setBackgroundColor('#00000000')
    this.base.contentView.addChildView(this.ui)
    this.base.contentView.addChildView(this.overlay)
    this.overlay.setBounds({ x: 0, y: 0, width: 0, height: 0 })
    // The interface never leaves its page; what's dropped on it opens in a tab.
    const dropped = (url: string) => void run({ do: 'tab.new', url } as never, { window: this }).catch(() => {})
    keepOnPage(this.ui.webContents, dropped)
    keepOnPage(this.overlay.webContents, dropped)
    this.ui.webContents.loadFile(uiPage, { query: { root: 'chrome' } })
    this.overlay.webContents.loadFile(uiPage, { query: { root: 'overlay' } })
    // A window closed before its interface had loaded: nothing to show.
    this.ui.webContents.once('did-finish-load', () => { if (!this.base.isDestroyed() && !this.base.isVisible()) this.base.show() })
    // Minimized or hidden, the interface lets its timers and frames rest:
    // one view of a window that refuses throttling keeps the whole window,
    // pages too, drawing frames nobody sees.
    const rest = (on: boolean) => { for (const v of [this.ui, this.overlay]) if (!v.webContents.isDestroyed()) v.webContents.setBackgroundThrottling(on) }
    this.base.on('minimize', () => rest(true))
    this.base.on('hide', () => rest(true))
    this.base.on('restore', () => rest(false))
    this.base.on('show', () => rest(false))
    this.base.on('maximize', () => rest(false))
    this.base.on('focus', () => rest(false))

    this.layout()
    // The frame is read again first, so the margin is right before the pages move.
    this.base.on('resize', () => { this.frame.refresh(); this.layout() })
    this.base.on('moved', () => this.frame.refresh())
    for (const e of ['maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen', 'restore'] as const) {
      this.base.on(e as 'maximize', () => { this.frame.refresh(); this.mark('window') })
    }
    this.base.on('focus', () => this.mark('window'))
    this.base.on('blur', () => this.mark('window'))
    this.base.on('closed', () => {
      controllers.delete(record.id)
      for (const id of this.shown) runtimes.get(id)?.destroy()
      for (const ids of Object.values(record.tabs)) for (const id of ids) runtimes.get(id)?.destroy()
      model.removeWindow(record.id)
    })
    nativeTheme.on('updated', this.onTheme)
    this.base.on('closed', () => nativeTheme.off('updated', this.onTheme))
    controllers.set(record.id, this)
  }

  private onTheme = () => {
    const dark = nativeTheme.shouldUseDarkColors
    if (this.frame.kind !== 'drawn') this.ui.setBackgroundColor(frameColour(dark))
    if (this.frame.kind === 'native' && process.platform !== 'darwin') this.base.setTitleBarOverlay(overlayColours(dark))
    this.mark('window')
  }

  // state

  /** Something in the window's slice changed; send it on the next tick. */
  mark(slice: Slice | 'window' | (string & {})): void {
    this.dirty.add(slice)
    if (!this.flushTimer) this.flushTimer = setTimeout(() => this.flush(), 0)
    if (slice === 'activeID' || slice === 'space' || slice === 'tabs' || slice === 'splits') this.placePages()
  }

  /** Send a part at once, not on the next tick (the frame, before pages move). */
  push(slice: string): void {
    this.dirty.add(slice)
    this.flush()
  }

  private flush(): void {
    this.flushTimer = null
    // Marked just before it closed: no window left to tell.
    if (!this.dirty.size || this.base.isDestroyed()) return
    const keys = [...this.dirty]
    this.dirty.clear()
    // Only the parts that changed are made (a background tab's new title
    // makes the tabs, not every module's slice).
    const set: Record<string, unknown> = {}
    const add = (k: string) => { if (!(k in set)) set[k] = this.part(k) }
    for (const k of keys) {
      if (k === 'window') WINDOW_KEYS.forEach(add)
      else add(k)
    }
    if (keys.includes('space')) ['tabs', 'pins', 'activeID'].forEach(add)
    const patch = { rev: ++this.rev, set }
    for (const v of [this.ui, this.overlay]) if (!v.webContents.isDestroyed()) v.webContents.send(IPC.state, patch)
  }

  /** The whole state, for an interface that has just loaded (hello). */
  state(): WindowState {
    const all: Record<string, unknown> = {}
    for (const k of Object.keys(BUILT_IN)) all[k] = BUILT_IN[k](this)
    for (const [k, make] of sliceMakers) all[k] = make(this)
    return all as unknown as WindowState
  }

  /** One part of the state, made alone: a module's slice, else a built-in part. */
  part(key: string): unknown {
    const make = sliceMakers.get(key)
    if (make) return make(this)
    return BUILT_IN[key]?.(this)
  }

  sendOverlay(layer: OverlayLayer): void {
    this.overlayLayer = layer
    if (!this.overlay.webContents.isDestroyed()) this.overlay.webContents.send(IPC.overlay, layer)
    if (layer.kind === 'none') { this.setOverlayRegion(null); return }
    // The field covers the page it is over.
    if (layer.kind === 'field') {
      const id = this.record.active[this.record.space]
      const bounds = this.base.getContentBounds()
      const rect = (id && this.rectFor(id)) || { x: 0, y: 0, width: bounds.width, height: bounds.height }
      this.setOverlayRegion({ x: rect.x, y: rect.y, width: rect.width, height: rect.height }, true)
    }
  }

  // layout

  private layout(): void {
    const { width, height } = this.base.getContentBounds()
    this.ui.setBounds({ x: 0, y: 0, width, height })
    for (const id of this.shown) this.placeOne(id)
    // What floats over the page was placed for the window's size before:
    // into full screen, a maximize or a restore, it stayed where it was, and
    // the password question went off the screen's left or out of the window.
    this.refollow()
    if (this.overlayRect) this.overlay.setBounds(this.overlayRect)
    const room = this.roomRect()
    if (room) this.room!.place(room)
  }

  /** What the floating region was last placed for. */
  private laid: Laid | null = null

  private laidNow(): Laid {
    const cb = this.base.getContentBounds(), v = this.frame.visual()
    return { width: cb.width, height: cb.height, seen: { x: v.x - cb.x, y: v.y - cb.y, width: v.width, height: v.height } }
  }

  /** The floating region moved with the window, if the window changed since it was placed. */
  refollow(): void {
    const was = this.laid, now = this.laidNow()
    this.laid = now
    if (!this.overlayRect || !was) return
    const same = was.width === now.width && was.height === now.height && was.seen.x === now.seen.x && was.seen.y === now.seen.y && was.seen.width === now.seen.width && was.seen.height === now.seen.height
    if (!same) { this.overlayRect = follow(this.overlayRect, was, now); this.overlay.setBounds(this.overlayRect) }
  }

  /** The interface measured where pages go. */
  setSlots(slots: { id: ID; rect: Rect; radius: number }[]): void {
    const { width, height } = this.base.getContentBounds()
    this.slots.clear()
    for (const s of slots) {
      this.slots.set(s.id, {
        radius: s.radius,
        insets: { left: s.rect.x, top: s.rect.y, right: width - s.rect.x - s.rect.width, bottom: height - s.rect.y - s.rect.height },
      })
    }
    this.placePages()
  }

  /** The margin around the window changed: the card moves with it at once,
   * before the interface measures it again. */
  shiftSlots(by: Insets): void {
    if (!by.top && !by.right && !by.bottom && !by.left) return
    // The shadow came or went: what floats moves with what is seen.
    setImmediate(() => { if (!this.base.isDestroyed()) this.refollow() })
    for (const slot of [...this.slots.values(), ...(this.room?.insets ? [{ insets: this.room.insets }] : [])]) {
      Object.assign(slot.insets, { top: slot.insets.top + by.top, right: slot.insets.right + by.right, bottom: slot.insets.bottom + by.bottom, left: slot.insets.left + by.left })
    }
  }

  private rectFor(id: ID): Rect | null {
    const slot = this.slots.get(id)
    if (!slot) return null
    const { width, height } = this.base.getContentBounds()
    if (this.filling === id) return this.glide?.id === id ? this.glideRect(this.glide) : { x: 0, y: 0, width, height }
    const { left, top, right, bottom } = slot.insets
    return { x: Math.round(left), y: Math.round(top), width: Math.max(0, Math.round(width - left - right)), height: Math.max(0, Math.round(height - top - bottom)) }
  }

  /** Attach the pages that have a slot, detach the rest. */
  placePages(): void {
    const want = new Set<ID>()
    for (const id of this.slots.keys()) {
      const tab = model.tabs.get(id)
      // Only what the model has on screen: the tab in front and its split.
      if (tab && !tab.empty && model.onScreen(id) && !this.held.has(id)) want.add(id)
    }
    for (const id of [...this.shown]) {
      if (want.has(id)) continue
      const rt = runtimes.get(id)
      if (rt?.view) this.base.contentView.removeChildView(rt.view)
      this.shown.delete(id)
      if (this.filling === id) { this.filling = null; this.stopGlide() }
    }
    for (const id of want) {
      const rt = runtimeFor(id, this.pageSession)
      const view = rt.ensure()
      if (!watched.has(view.webContents)) {
        watched.add(view.webContents)
        // studio/01 §8.16: a click (or Tab) in a page of a split gives it the keys.
        view.webContents.on('focus', () => {
          const r = this.record
          if (r.active[r.space] !== id && r.splits.some(s => s.tabs.includes(id))) model.selectTab(r, id)
        })
        for (const f of pageAttached) f(id, view.webContents)
      }
      if (!this.shown.has(id)) {
        // Under the overlay, above the interface.
        this.base.contentView.addChildView(view, this.base.contentView.children.indexOf(this.overlay))
        this.shown.add(id)
      }
      this.placeOne(id)
    }
  }

  /** The page of a tab in front moves into the floating video's window: it
   * leaves this one and is no longer placed in it (its size is the little
   * window's, and it comes back with release). */
  hold(id: ID): void {
    this.held.add(id)
    const view = runtimes.get(id)?.view
    if (view && this.base.contentView.children.includes(view)) this.base.contentView.removeChildView(view)
    this.shown.delete(id)
    if (this.filling === id) { this.filling = null; this.stopGlide() }
  }

  /** The floating video landed: placePages takes the page back. */
  release(id: ID): void { this.held.delete(id) }

  private placeOne(id: ID): void {
    const rt = runtimes.get(id)
    const rect = this.rectFor(id)
    if (!rt?.view || !rect) return
    rt.view.setBounds(rect)
    const radius = Math.round(this.slots.get(id)?.radius ?? 0)
    // Gliding, the card's corners go square on the way out to the screen, and come back.
    rt.view.setBorderRadius(this.filling !== id ? radius : this.glide?.id === id ? Math.round(radius * (1 - this.glideProgress(this.glide))) : 0)
    this.pageTrace?.push({ t: performance.timeOrigin + performance.now(), id, rect })
  }

  /** The page in its own full screen (a video's: window/pagefull.ts). It
   * covers the whole window, square, above the other pages, as Chrome's and
   * Search's WebKit put a video alone on the screen: the card, the column
   * and the strip of tabs stayed around it, the video in the card's place. */
  private filling: ID | null = null

  /** A page entered (on) or left its own full screen; `after` runs once the
   * page is there (on the way out, once it is back in its place: the window
   * leaves the screen only then, pagefull.ts). */
  fillWith(wc: Electron.WebContents, on: boolean, after?: () => void): void {
    const id = [...this.shown].find(i => runtimes.get(i)?.view?.webContents === wc) ?? null
    const g = this.glide
    if (on) {
      // Back in before it was out: it grows again from where it is.
      if (id && g?.id === id && g.dir === 'out') { this.startGlide(id, 'in', this.screenRect(this.glideRect(g)), null); after?.(); return }
      if (!id || this.filling === id) { after?.(); return }
      const from = this.rectFor(id)
      this.filling = id
      // Over a split's other page, under the overlay; nothing floating left over the video.
      const view = runtimes.get(id)!.view!
      this.base.contentView.addChildView(view, this.base.contentView.children.indexOf(this.overlay))
      if (this.overlayLayer.kind !== 'none') this.sendOverlay({ kind: 'none' })
      this.fillFrom = from ? this.screenRect(from) : null
      this.fullBefore = this.frame.isFullScreen()
      if (this.fillFrom && this.glides()) this.startGlide(id, 'in', this.fillFrom, null)
      this.placePages()
      this.mark('window')
      after?.()
      return
    }
    if (!this.filling || (id && id !== this.filling)) return
    // Already on its way back: once is enough.
    if (g?.id === this.filling && g.dir === 'out') return
    const going = this.filling
    if (this.fillFrom && this.glides() && this.shown.has(going)) {
      const now = g?.id === going ? this.screenRect(this.glideRect(g)) : this.screenRect({ x: 0, y: 0, ...this.size() })
      this.startGlide(going, 'out', now, this.fillFrom, () => this.land(going, after))
      return
    }
    this.stopGlide()
    this.filling = null
    this.placePages()
    this.mark('window')
    after?.()
  }

  // The glide into and out of a page's own full screen (the user's wish, 26
  // Nov 2026: a video going full screen smoothly). The page grows from where
  // it sat on the screen to the whole screen while the interface steps aside
  // and black comes up behind it, and goes back the same way. Rectangles are
  // kept on the screen, so the window covering the screen (or coming back)
  // under the page doesn't move it.

  /** Where the page sat on the screen before its full screen. */
  private fillFrom: Rect | null = null
  /** The window was already covering the screen (F11) before the page's. */
  private fullBefore = false
  curtain: 'on' | 'going' | 'off' = 'off'
  private glide: { id: ID; dir: 'in' | 'out'; from: Rect; to: Rect | null; t0: number | null; wait: number; timer: NodeJS.Timeout; done?: () => void } | null = null

  private glides(): boolean { return !model.pref<boolean>('motion.instant') }

  private size(): { width: number; height: number } { const b = this.base.getContentBounds(); return { width: b.width, height: b.height } }

  /** A rectangle of the window's content, on the screen. */
  private screenRect(r: Rect): Rect { const b = this.base.getContentBounds(); return { x: r.x + b.x, y: r.y + b.y, width: r.width, height: r.height } }

  private setCurtain(to: 'on' | 'going' | 'off'): void {
    if (this.curtain === to) return
    this.curtain = to
    this.push('curtain')
  }

  private glideProgress(g: NonNullable<WindowController['glide']>): number {
    if (g.t0 == null) return 0
    const t = Math.min(1, (Date.now() - g.t0) / (g.dir === 'in' ? 280 : 240))
    // Out to the screen: quick then settling; back: eased both ways.
    return g.dir === 'in' ? 1 - Math.pow(1 - t, 3) : t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
  }

  /** The page's rectangle now, in the window's coordinates. */
  private glideRect(g: NonNullable<WindowController['glide']>): Rect {
    const b = this.base.getContentBounds()
    const to = g.to ?? b
    const p = this.glideProgress(g)
    const mix = (a: number, z: number) => a + (z - a) * p
    const x = mix(g.from.x, to.x), y = mix(g.from.y, to.y)
    return { x: Math.round(x - b.x), y: Math.round(y - b.y), width: Math.max(1, Math.round(mix(g.from.width, to.width))), height: Math.max(1, Math.round(mix(g.from.height, to.height))) }
  }

  /** The window covers its screen (where a page's full screen ends up). */
  private covering(): boolean {
    const b = this.base.getBounds(), d = screen.getDisplayMatching(b).bounds
    return b.x === d.x && b.y === d.y && b.width === d.width && b.height === d.height
  }

  private startGlide(id: ID, dir: 'in' | 'out', from: Rect, to: Rect | null, done?: () => void): void {
    if (this.glide) clearInterval(this.glide.timer)
    const g: NonNullable<WindowController['glide']> = {
      id, dir, from, to, done,
      // Into full screen the page waits for the window to cover the screen (a few frames at most).
      t0: dir === 'out' || this.covering() ? Date.now() : null,
      wait: Date.now() + 400,
      timer: setInterval(() => this.glideStep(), 16),
    }
    this.glide = g
    this.setCurtain(dir === 'in' ? 'on' : 'going')
    this.placeOne(id)
  }

  private glideStep(): void {
    const g = this.glide
    if (!g || this.base.isDestroyed()) return this.stopGlide()
    if (g.t0 == null && (this.covering() || Date.now() > g.wait)) g.t0 = Date.now()
    this.placeOne(g.id)
    if (g.t0 == null || this.glideProgress(g) < 1) return
    clearInterval(g.timer)
    if (g.dir === 'in') { this.glide = null; this.placeOne(g.id) }
    g.done?.()
  }

  private stopGlide(): void {
    if (this.glide) clearInterval(this.glide.timer)
    this.glide = null
    this.setCurtain('off')
  }

  /** Back in its place on the screen: the window leaves the screen (`after`),
   * the page stays where it is meanwhile, and the interface comes back once
   * the window is as it was. */
  private land(id: ID, after?: () => void): void {
    after?.()
    const start = Date.now()
    const back = () => {
      if (this.base.isDestroyed()) return
      const g = this.glide
      if (g?.id !== id || g.dir !== 'out') return
      // The window as it was: out of the full screen the page put it in (or still in F11's).
      const ready = this.fullBefore || !this.frame.isFullScreen()
      if (ready || Date.now() - start > 800) {
        setTimeout(() => {
          if (this.glide !== g) return
          this.glide = null
          this.filling = null
          this.placePages()
          this.mark('window')
          this.setCurtain('off')
        }, ready ? 50 : 0)
        return
      }
      this.placeOne(id)
      setTimeout(back, 16)
    }
    back()
  }

  /** A page is in its own full screen in this window. */
  isFilling(): boolean { return !!this.filling }

  /** Room beside the page for another view (the extensions' side panel,
   * studio/02 §4.1): the card gets narrower on that side and `place` is
   * told where the room is, now and whenever it moves; null gives it back
   * (and `place` hears null). */
  setSideRoom(room: { side: 'left' | 'right'; width: number; place: (rect: Rect | null) => void } | null): void {
    const before = this.room
    if (before && (!room || room.place !== before.place)) before.place(null)
    this.room = room ? { ...room, insets: before?.place === room.place ? before.insets : undefined } : null
    this.push('room')
  }

  sideRoom(): { side: 'left' | 'right'; width: number } | null {
    return this.room ? { side: this.room.side, width: this.room.width } : null
  }

  /** The interface measured the room. */
  placeRoom(rect: Rect | null): void {
    if (!this.room) return
    if (!rect) { this.room.insets = undefined; return }
    const { width, height } = this.base.getContentBounds()
    this.room.insets = { left: rect.x, top: rect.y, right: width - rect.x - rect.width, bottom: height - rect.y - rect.height }
    this.room.place(this.roomRect())
  }

  private roomRect(): Rect | null {
    const i = this.room?.insets
    if (!i) return null
    const { width, height } = this.base.getContentBounds()
    return { x: Math.round(i.left), y: Math.round(i.top), width: Math.max(0, Math.round(width - i.left - i.right)), height: Math.max(0, Math.round(height - i.top - i.bottom)) }
  }

  /** Where the pages on screen are (for the tests). */
  pageBounds(): { id: ID; rect: Rect }[] {
    return [...this.shown].map(id => ({ id, rect: runtimes.get(id)?.view?.getBounds() })).filter((p): p is { id: ID; rect: Rect } => !!p.rect)
  }

  setOverlayRegion(rect: Rect | null, focus = false): void {
    this.overlayRect = rect && rect.width > 0 && rect.height > 0 ? rect : null
    // Placed for the window as it is now.
    this.laid = this.laidNow()
    this.overlay.setBounds(this.overlayRect ?? { x: 0, y: 0, width: 0, height: 0 })
    if (this.overlayRect && focus) this.overlay.webContents.focus()
  }

  // helpers

  activeRuntime(): TabRuntime | null {
    const id = this.record.active[this.record.space]
    return id ? runtimeFor(id, this.pageSession) : null
  }

  focusPage(): void {
    const rt = this.activeRuntime()
    if (rt?.view && !rt.record?.empty) rt.view.webContents.focus()
    else this.ui.webContents.focus()
  }
}

/** The window's own parts, sent again together on mark('window'). */
const WINDOW_KEYS = ['chrome', 'look', 'focused', 'maximized', 'fullScreen', 'controlsWidth']

/** The state's parts no module's slice makes (a module's slice of the same
 * name wins: tabs, pins, pinFolders, extensions, downloads). */
const BUILT_IN: Record<string, (c: WindowController) => unknown> = {
  rev: c => c.rev,
  windowID: c => c.record.id,
  chrome: c => c.chrome,
  look: () => (nativeTheme.shouldUseDarkColors ? 'dark' : 'light'),
  focused: c => c.base.isFocused(),
  maximized: c => c.base.isMaximized(),
  fullScreen: c => c.frame.isFullScreen(),
  curtain: c => c.curtain,
  // The window's buttons' room at the strip's end: Classic 3 × 46, Inline 3 doors and 10 (chrome/Buttons.tsx).
  controlsWidth: c => (c.chrome === 'windows' && !c.frame.isFullScreen() ? (model.pref<string>('window.buttons') === 'classic' ? 138 : 96) : 0),
  space: c => c.record.space,
  spaces: () => model.spaces,
  tabs: c => model.spaceTabs(c.record).map(id => model.tabs.get(id)!).filter(Boolean).map(({ home, touched, letGo, ...view }) => view),
  pins: c => model.pinViews(c.record),
  pinFolders: () => [],
  groups: c => c.record.groups,
  splits: c => c.record.splits,
  activeID: c => c.record.active[c.record.space] ?? null,
  sidebar: c => c.record.sidebar,
  field: c => c.record.field,
  extensions: () => [],
  downloads: () => [],
  prefs: () => model.prefs,
}

model.on('window-changed', (id: ID, slices: Slice[]) => {
  const c = controllers.get(id)
  if (c) for (const s of slices) c.mark(s)
})

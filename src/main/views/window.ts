// One browser window: a BaseWindow with three layers of views.
//   1. the interface (column, bar, empty tab's field), full size, at the bottom;
//   2. the pages on screen, at the rectangles the interface measured for them;
//   3. the overlay, transparent, sized to whatever floats over the pages right
//      now and zero otherwise, so clicks elsewhere reach the page.
// The model is the truth; this sends the window's slice to both interface
// roots as patches.

import { BaseWindow, WebContentsView, nativeTheme, session as electronSession, type Session } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ID, OverlayLayer, Rect, WindowState } from '../../shared/state'
import { IPC } from '../../shared/ipc'
import { model, type Slice, type WindowRecord } from '../model/model'
import { chromeKind } from '../paths'
import { runtimeFor, runtimes, type TabRuntime } from './tabs'
import { Frame, frameColour, frameKind, overlayColours, windowOptions } from '../window/frame'
import type { Insets } from '../../shared/modules/window'

const here = path.dirname(fileURLToPath(import.meta.url))
const uiPreload = path.join(here, '../preload/ui.cjs')
const uiPage = path.join(here, '../ui/index.html')

/** Distances of a page's rectangle from the window's edges, so a resize can
 * move pages at once, before the interface measures again. */
interface Slot { insets: { left: number; top: number; right: number; bottom: number }; radius: number }

const controllers = new Map<ID, WindowController>()

/** Modules add parts of the window's state without touching this file:
 * registerSlice('downloads', c => ...). Send a part again with c.mark(key). */
const sliceMakers = new Map<string, (c: WindowController) => unknown>()
export function registerSlice(key: string, make: (c: WindowController) => unknown): void { sliceMakers.set(key, make) }

export function controllerFor(id: ID): WindowController | undefined { return controllers.get(id) }
export function allControllers(): WindowController[] { return [...controllers.values()] }
export function focusedController(): WindowController | undefined {
  return allControllers().find(c => c.base.isFocused()) ?? allControllers()[0]
}

export class WindowController {
  readonly base: BaseWindow
  readonly ui: WebContentsView
  readonly overlay: WebContentsView
  readonly chrome = chromeKind()
  readonly frame: Frame
  private slots = new Map<ID, Slot>()
  private shown = new Set<ID>()
  private rev = 0
  private dirty = new Set<string>()
  private flushTimer: NodeJS.Timeout | null = null
  private overlayRect: Rect | null = null
  overlayLayer: OverlayLayer = { kind: 'none' }

  constructor(readonly record: WindowRecord, readonly pageSession: Session) {
    const dark = nativeTheme.shouldUseDarkColors
    const kind = frameKind(this.chrome)
    this.base = new BaseWindow(windowOptions(kind, dark))
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
    })
    this.ui = new WebContentsView({ webPreferences: uiPrefs('chrome') })
    this.ui.setBackgroundColor(ground)
    this.overlay = new WebContentsView({ webPreferences: uiPrefs('overlay') })
    this.overlay.setBackgroundColor('#00000000')
    this.base.contentView.addChildView(this.ui)
    this.base.contentView.addChildView(this.overlay)
    this.overlay.setBounds({ x: 0, y: 0, width: 0, height: 0 })
    this.ui.webContents.loadFile(uiPage, { query: { root: 'chrome' } })
    this.overlay.webContents.loadFile(uiPage, { query: { root: 'overlay' } })
    this.ui.webContents.once('did-finish-load', () => { if (!this.base.isVisible()) this.base.show() })

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
    if (slice === 'activeID' || slice === 'space' || slice === 'tabs') this.placePages()
  }

  /** Send a part at once, not on the next tick (the frame, before pages move). */
  push(slice: string): void {
    this.dirty.add(slice)
    this.flush()
  }

  private flush(): void {
    this.flushTimer = null
    if (!this.dirty.size) return
    const keys = [...this.dirty]
    this.dirty.clear()
    const full = this.state()
    const set: Partial<WindowState> = {}
    for (const k of keys) {
      if (k === 'window') Object.assign(set, pickWindow(full))
      else (set as any)[k] = (full as any)[k]
    }
    if (keys.includes('space')) Object.assign(set, { tabs: full.tabs, pins: full.pins, activeID: full.activeID })
    const patch = { rev: ++this.rev, set }
    for (const v of [this.ui, this.overlay]) if (!v.webContents.isDestroyed()) v.webContents.send(IPC.state, patch)
  }

  state(): WindowState {
    const r = this.record
    return {
      rev: this.rev,
      windowID: r.id,
      chrome: this.chrome,
      look: nativeTheme.shouldUseDarkColors ? 'dark' : 'light',
      focused: this.base.isFocused(),
      maximized: this.base.isMaximized(),
      fullScreen: this.base.isFullScreen(),
      controlsWidth: this.chrome === 'windows' && !this.base.isFullScreen() ? 138 : 0,
      space: r.space,
      spaces: model.spaces,
      tabs: model.spaceTabs(r).map(id => model.tabs.get(id)!).filter(Boolean).map(({ home, touched, letGo, ...view }) => view),
      pins: model.pinViews(r),
      pinFolders: [],
      groups: r.groups,
      splits: r.splits,
      activeID: r.active[r.space] ?? null,
      sidebar: r.sidebar,
      field: r.field,
      extensions: [],
      downloads: [],
      prefs: model.prefs,
      ...Object.fromEntries([...sliceMakers].map(([k, make]) => [k, make(this)])),
    }
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
    if (this.overlayRect) this.overlay.setBounds(this.overlayRect)
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
    for (const slot of this.slots.values()) {
      slot.insets = { top: slot.insets.top + by.top, right: slot.insets.right + by.right, bottom: slot.insets.bottom + by.bottom, left: slot.insets.left + by.left }
    }
  }

  private rectFor(id: ID): Rect | null {
    const slot = this.slots.get(id)
    if (!slot) return null
    const { width, height } = this.base.getContentBounds()
    const { left, top, right, bottom } = slot.insets
    return { x: Math.round(left), y: Math.round(top), width: Math.max(0, Math.round(width - left - right)), height: Math.max(0, Math.round(height - top - bottom)) }
  }

  /** Attach the pages that have a slot, detach the rest. */
  placePages(): void {
    const want = new Set<ID>()
    for (const id of this.slots.keys()) {
      const tab = model.tabs.get(id)
      if (tab && !tab.empty && model.spaceTabs(this.record).includes(id)) want.add(id)
    }
    for (const id of [...this.shown]) {
      if (want.has(id)) continue
      const rt = runtimes.get(id)
      if (rt?.view) this.base.contentView.removeChildView(rt.view)
      this.shown.delete(id)
    }
    for (const id of want) {
      const rt = runtimeFor(id, this.pageSession)
      const view = rt.ensure()
      if (!this.shown.has(id)) {
        // Under the overlay, above the interface.
        this.base.contentView.addChildView(view, this.base.contentView.children.indexOf(this.overlay))
        this.shown.add(id)
      }
      this.placeOne(id)
    }
  }

  private placeOne(id: ID): void {
    const rt = runtimes.get(id)
    const rect = this.rectFor(id)
    if (!rt?.view || !rect) return
    rt.view.setBounds(rect)
    rt.view.setBorderRadius(Math.round(this.slots.get(id)?.radius ?? 0))
  }

  /** Where the pages on screen are (for the tests). */
  pageBounds(): { id: ID; rect: Rect }[] {
    return [...this.shown].map(id => ({ id, rect: runtimes.get(id)?.view?.getBounds() })).filter((p): p is { id: ID; rect: Rect } => !!p.rect)
  }

  setOverlayRegion(rect: Rect | null, focus = false): void {
    this.overlayRect = rect && rect.width > 0 && rect.height > 0 ? rect : null
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

function pickWindow(s: WindowState): Partial<WindowState> {
  const { chrome, look, focused, maximized, fullScreen, controlsWidth } = s
  return { chrome, look, focused, maximized, fullScreen, controlsWidth }
}

model.on('window-changed', (id: ID, slices: Slice[]) => {
  const c = controllers.get(id)
  if (c) for (const s of slices) c.mark(s)
})

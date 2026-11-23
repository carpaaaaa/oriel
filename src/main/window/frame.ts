// The window's frame, drawn by Search (decision of 23 Nov: "as close to the
// Mac as possible"; studio/02 §4.1, §4.7, §4.8, D1 option b).
//
// The window is frameless and transparent. The interface draws it inset by a
// clear margin (ROOM), with 17.5 px corners and its shadow inside that margin.
// While the pointer is over the margin (and not over the grips just outside
// the edge) the window ignores the mouse, so clicks reach what is behind it,
// as with Windows' own shadows. Maximized, snapped and full screen windows
// have no margin, no corners and no shadow.
//
// Moving and resizing hand the press over to Windows' own loops (user32,
// win/user32.ts), so Aero Snap, the Snap bar and shaking work (studio/01 §0.6
// point 3, §1.12). On a Mac, where this is only for developing and comparing
// (SEARCH_CHROME=windows), and without user32, they are done by hand.

import { screen, type BaseWindowConstructorOptions, type Rectangle } from 'electron'
import type { Edge, FrameView, Insets } from '../../shared/modules/window'
import { model } from '../model/model'
import { DWMWA, WS, win32 } from '../win/user32'
import type { WindowController } from '../views/window'

/** As quietTests in context.ts (not imported: frame.ts loads before it). */
const quietTests = process.platform === 'darwin' && !!process.env.SEARCH_PROBE && process.env.SEARCH_SHOW !== '1'

/** Clear room for the window's shadow (tokens.css --window-shadow fits in it). */
export const ROOM: Insets = { top: 30, right: 40, bottom: 50, left: 40 }
const NONE: Insets = { top: 0, right: 0, bottom: 0, left: 0 }
/** Resizing starts this far outside and inside the visible edge; corners are
 * this long along each edge (Windows 11's invisible borders are about 8). */
export const GRIP = { outside: 8, inside: 4, corner: 20 }
/** studio/01 §1.3, §1.4: 1180×780, never under 640×420. */
export const VISIBLE = { width: 1180, height: 780, minWidth: 640, minHeight: 420 }
/** Windows 11 caption buttons: three of 46. */
export const CAPTION = { width: 46 * 3, height: 40 }

const WM_SYSCOMMAND = 0x0112
const WM_EXITSIZEMOVE = 0x0232
const SC_MAXIMIZE = 0xf030
const SC_RESTORE = 0xf120
const SW_MAXIMIZE = 3
const SW_RESTORE = 9

export type FrameKind = FrameView['kind']
type State = FrameView['state']

/** Variants that can be switched for comparing on Windows (bench and CI). */
const variant = {
  /** plain: Electron's transparent window; thick: plus WS_THICKFRAME, so
   * Windows treats it as resizable (Snap) with DWM's own border turned off. */
  style: (process.env.SEARCH_FRAME_STYLE === 'plain' ? 'plain' : 'thick') as 'plain' | 'thick',
  /** emulated: Electron's maximize for transparent windows (bounds = work
   * area); native: ShowWindow, a real maximized window. */
  maximize: process.env.SEARCH_FRAME_MAX === 'native' ? 'native' : 'emulated',
  /** syscommand: SC_SIZE; nc: WM_NCLBUTTONDOWN on an edge; manual: by hand. */
  resize: (['nc', 'syscommand', 'manual'] as const).find(v => v === process.env.SEARCH_FRAME_RESIZE) ?? 'syscommand',
  /** syscommand: SC_MOVE; nc: WM_NCLBUTTONDOWN on the caption. */
  move: (process.env.SEARCH_FRAME_MOVE === 'nc' ? 'nc' : 'syscommand') as 'nc' | 'syscommand',
}

export function frameKind(chrome: 'windows' | 'mac'): FrameKind {
  if (chrome === 'mac') return 'mac'
  const forced = process.env.SEARCH_FRAME
  if (forced === 'native' || forced === 'drawn') return forced
  return model.pref<boolean>('window.nativeFrame') ? 'native' : 'drawn'
}

export function frameColour(dark: boolean): string { return dark ? '#131313' : '#F4F4F4' }

export function windowOptions(kind: FrameKind, dark: boolean): BaseWindowConstructorOptions {
  const frame = frameColour(dark)
  // The window's title is what Windows shows in the taskbar and Alt+Tab.
  const common = { title: 'Oriel', show: false, minimizable: true, maximizable: true, fullscreenable: true }
  if (kind === 'drawn') {
    return {
      ...common,
      frame: false,
      transparent: true,
      hasShadow: false,
      roundedCorners: false,
      resizable: true,
      backgroundColor: '#00000000',
      width: VISIBLE.width + ROOM.left + ROOM.right,
      height: VISIBLE.height + ROOM.top + ROOM.bottom,
      // The window's own minimum is the visible one, so Snap can make a
      // window without margin 640 wide; free, the margin is added on top
      // (will-resize in Frame, boundsFor).
      minWidth: VISIBLE.minWidth,
      minHeight: VISIBLE.minHeight,
    }
  }
  const base = { ...common, width: VISIBLE.width, height: VISIBLE.height, minWidth: VISIBLE.minWidth, minHeight: VISIBLE.minHeight, backgroundColor: frame }
  if (kind === 'mac') return { ...base, titleBarStyle: 'hidden', trafficLightPosition: { x: 19, y: 19 } }
  // native: Windows' frame and buttons (fallback, window.nativeFrame).
  if (process.platform === 'darwin') return { ...base, titleBarStyle: 'hidden' }
  return { ...base, titleBarStyle: 'hidden', titleBarOverlay: overlayColours(dark) }
}

export function overlayColours(dark: boolean) {
  return { color: frameColour(dark), symbolColor: dark ? '#EDEDED' : '#171717', height: CAPTION.height }
}

/** studio/01 §1.3: a new window takes the front window's size, 22 down and
 * right of it (AppKit's cascade), kept inside the work area; with no window
 * in front, 1180×780 in the middle (Electron centres it). */
export function cascadeFrom(front: { kind: FrameKind; visual: Rectangle } | null, kind: FrameKind): Partial<Rectangle> {
  if (!front) return {}
  const step = 22
  const work = screen.getDisplayMatching(front.visual).workArea
  const width = Math.min(front.visual.width, work.width), height = Math.min(front.visual.height, work.height)
  let x = front.visual.x + step, y = front.visual.y + step
  if (x + width > work.x + work.width) x = work.x
  if (y + height > work.y + work.height) y = work.y
  const m = kind === 'drawn' ? ROOM : NONE
  return { x: x - m.left, y: y - m.top, width: width + m.left + m.right, height: height + m.top + m.bottom }
}

const inside = (p: { x: number; y: number }, r: Rectangle) => p.x >= r.x && p.y >= r.y && p.x < r.x + r.width && p.y < r.y + r.height
const grow = (r: Rectangle, by: number): Rectangle => ({ x: r.x - by, y: r.y - by, width: r.width + 2 * by, height: r.height + 2 * by })

export class Frame {
  readonly kind: FrameKind
  state: State = 'free'
  hollow = false
  readonly manual: boolean
  readonly hwnd: number = 0
  private poll: NodeJS.Timeout | null = null
  private drag: { bounds: Rectangle; x: number; y: number } | null = null
  private restoreTo: Rectangle | null = null
  /** Full screen as we asked it (Electron doesn't know it for transparent windows on Windows). */
  private full = false

  constructor(private readonly c: WindowController, kind: FrameKind) {
    this.kind = kind
    const w = win32()
    if (w && kind === 'drawn') {
      this.hwnd = w.hwnd(c.base.getNativeWindowHandle())
      if (variant.style === 'thick') {
        // Resizable in Windows' eyes (Snap needs it), without DWM's border,
        // corners or shadow: ours are drawn in the margin.
        w.setStyle(this.hwnd, w.style(this.hwnd) | WS.THICKFRAME | WS.MAXIMIZEBOX | WS.MINIMIZEBOX)
      }
      w.dwmSet(this.hwnd, DWMWA.NCRENDERING_POLICY, 1)
      w.dwmSet(this.hwnd, DWMWA.WINDOW_CORNER_PREFERENCE, 1)
      w.dwmSet(this.hwnd, DWMWA.BORDER_COLOR, 0xfffffffe)
      // Win+Up and Win+Down: Electron drops SC_MAXIMIZE for transparent
      // windows; do ours instead.
      c.base.hookWindowMessage(WM_SYSCOMMAND, wParam => {
        const command = Number(wParam.length >= 8 ? wParam.readBigUInt64LE(0) : BigInt(wParam.readUInt32LE(0))) & 0xfff0
        if (process.env.SEARCH_PROBE) console.log('[frame] syscommand 0x' + command.toString(16), this.state)
        if (command === SC_MAXIMIZE && this.state !== 'maximized') setImmediate(() => { if (this.compute() !== 'maximized') this.maximize() })
        else if (command === SC_RESTORE && this.state === 'maximized' && !c.base.isMinimized()) setImmediate(() => { if (this.compute() === 'maximized') this.unmaximize() })
      })
      c.base.hookWindowMessage(WM_EXITSIZEMOVE, () => setImmediate(() => this.refresh()))
    }
    this.manual = kind === 'drawn' && !(w && this.hwnd)
    if (kind === 'drawn') {
      c.base.on('will-resize', (e, next) => {
        if (this.state !== 'free') return
        if (next.width - ROOM.left - ROOM.right < VISIBLE.minWidth || next.height - ROOM.top - ROOM.bottom < VISIBLE.minHeight) e.preventDefault()
      })
    }
    this.state = this.compute()
    c.base.on('closed', () => this.stopPoll())
  }

  // geometry

  margin(): Insets { return this.kind === 'drawn' && this.state === 'free' ? ROOM : NONE }

  /** The window as people see it, in screen DIP (the client area: a really
   * maximized window hangs over the screen's edges by its frame). */
  visual(bounds = this.c.base.getContentBounds()): Rectangle {
    const m = this.margin()
    return { x: bounds.x + m.left, y: bounds.y + m.top, width: bounds.width - m.left - m.right, height: bounds.height - m.top - m.bottom }
  }

  /** The visible rectangle it comes back to when not maximized or snapped. */
  normalVisual(): Rectangle {
    const b = this.c.base
    if (this.state === 'free') return this.visual()
    const n = this.restoreTo ?? b.getNormalBounds()
    const m = this.kind === 'drawn' ? ROOM : NONE
    return { x: n.x + m.left, y: n.y + m.top, width: n.width - m.left - m.right, height: n.height - m.top - m.bottom }
  }

  /** Window bounds for a visible rectangle (free state), never under the
   * visible minimum (studio/01 §1.4). */
  boundsFor(v: Rectangle): Rectangle {
    const m = this.kind === 'drawn' ? ROOM : NONE
    const width = Math.max(VISIBLE.minWidth, v.width), height = Math.max(VISIBLE.minHeight, v.height)
    return { x: v.x - m.left, y: v.y - m.top, width: width + m.left + m.right, height: height + m.top + m.bottom }
  }

  view(): FrameView {
    return { kind: this.kind, margin: this.margin(), state: this.state, hollow: this.hollow, manual: this.manual, manualResize: this.resizesByHand, grip: GRIP }
  }

  private compute(): State {
    const b = this.c.base
    if (this.isFullScreen()) return 'fullScreen'
    if (b.isMaximized()) return 'maximized'
    if (this.hwnd && win32()?.arranged(this.hwnd)) return 'snapped'
    return 'free'
  }

  /** Read the state again (after a resize, a move, Snap). The interface is
   * told at once, before the pages move, so it measures the right card. */
  refresh(): boolean {
    if (this.c.base.isDestroyed()) return false
    const next = this.compute()
    if (next === this.state) return false
    const before = this.margin()
    this.state = next
    if (next !== 'free') this.setHollow(false)
    const after = this.margin()
    this.c.shiftSlots({ top: after.top - before.top, right: after.right - before.right, bottom: after.bottom - before.bottom, left: after.left - before.left })
    this.c.push('frame')
    return true
  }

  // the clear margin

  setHollow(hollow: boolean): void {
    if (this.kind !== 'drawn' || this.state !== 'free' || this.c.base.isDestroyed()) hollow = false
    if (hollow === this.hollow) return
    this.hollow = hollow
    // A quiet test world on a Mac always lets clicks through (context.ts).
    if (!quietTests) this.c.base.setIgnoreMouseEvents(hollow)
    if (hollow) this.startPoll()
    else this.stopPoll()
    this.c.mark('frame')
  }

  /** While the window ignores the mouse it hears nothing: watch the pointer
   * until it is back over the window (or gone). */
  private startPoll(): void {
    if (this.poll) return
    this.poll = setInterval(() => {
      if (this.c.base.isDestroyed()) return this.stopPoll()
      const p = screen.getCursorScreenPoint()
      if (!inside(p, this.c.base.getBounds()) || inside(p, grow(this.visual(), GRIP.outside))) this.setHollow(false)
    }, 16)
  }

  private stopPoll(): void {
    if (this.poll) clearInterval(this.poll)
    this.poll = null
  }

  // moving

  /** A press on the strip (at x, y, screen DIP) moved past the threshold:
   * hand it to Windows' move loop. */
  startDrag(press?: { x: number; y: number }): void {
    const w = win32()
    if (this.manual || !w || !this.hwnd || this.state === 'fullScreen') return
    const b = this.c.base
    if (this.state === 'maximized' && !this.zoomed()) this.restoreUnder(screen.getCursorScreenPoint())
    else if (press && this.state === 'free') {
      // The loop starts from where the pointer is now: first catch up with
      // the few pixels it travelled past the threshold, so the window stays
      // under the point that was pressed. (Really maximized and snapped
      // windows are brought back by Windows itself.)
      const p = screen.getCursorScreenPoint()
      const dx = Math.round(p.x - press.x), dy = Math.round(p.y - press.y)
      if (dx || dy) { const r = b.getBounds(); b.setPosition(r.x + dx, r.y + dy) }
    }
    w.beginMove(this.hwnd, w.cursor(), variant.move)
  }

  /** Dragging a maximized window: it comes back to its size under the
   * pointer, keeping the pointer at the same share of its width, as Windows
   * does with its own maximized windows. */
  private restoreUnder(p: { x: number; y: number }): void {
    const work = screen.getDisplayNearestPoint(p).workArea
    const normal = this.restoreTo ?? this.c.base.getNormalBounds()
    const vis = { width: normal.width - ROOM.left - ROOM.right, height: normal.height - ROOM.top - ROOM.bottom }
    const share = (p.x - work.x) / Math.max(1, work.width)
    const x = Math.round(p.x - share * vis.width)
    this.restoreTo = null
    this.c.base.setBounds(this.boundsFor({ x, y: work.y, ...vis }))
    this.refresh()
  }

  moveDrag(phase: 'start' | 'move' | 'end', x: number, y: number): void {
    const b = this.c.base
    if (phase === 'start') {
      if (this.state === 'fullScreen') return
      if (this.state === 'maximized') {
        b.unmaximize()
        this.refresh()
      }
      this.drag = { bounds: b.getBounds(), x, y }
      return
    }
    if (!this.drag) return
    if (phase === 'move') b.setPosition(Math.round(this.drag.bounds.x + x - this.drag.x), Math.round(this.drag.bounds.y + y - this.drag.y))
    if (phase === 'end') { this.drag = null; this.refresh() }
  }

  // resizing

  startResize(edge: Edge): void {
    const w = win32()
    if (this.manual || !w || !this.hwnd || variant.resize === 'manual') return
    if (this.state === 'maximized' || this.state === 'fullScreen') return
    w.beginSize(this.hwnd, edge, w.cursor(), variant.resize)
  }

  /** Manual resizing is used on a Mac and when Windows' loop isn't. */
  get resizesByHand(): boolean { return this.manual || variant.resize === 'manual' }

  resizeDrag(edge: Edge, phase: 'start' | 'move' | 'end', x: number, y: number): void {
    const b = this.c.base
    if (phase === 'start') { this.drag = { bounds: b.getBounds(), x, y }; return }
    if (!this.drag) return
    if (phase === 'end') { this.drag = null; this.refresh(); return }
    const s = this.drag.bounds
    const m = this.kind === 'drawn' ? ROOM : NONE
    const minW = VISIBLE.minWidth + m.left + m.right, minH = VISIBLE.minHeight + m.top + m.bottom
    const dx = Math.round(x - this.drag.x), dy = Math.round(y - this.drag.y)
    let { x: nx, y: ny, width: nw, height: nh } = s
    if (edge.includes('left')) { nw = Math.max(minW, s.width - dx); nx = s.x + s.width - nw }
    if (edge.includes('right')) nw = Math.max(minW, s.width + dx)
    if (edge.includes('top')) { nh = Math.max(minH, s.height - dy); ny = s.y + s.height - nh }
    if (edge.includes('bottom')) nh = Math.max(minH, s.height + dy)
    b.setBounds({ x: nx, y: ny, width: nw, height: nh })
  }

  // states

  toggleMaximize(): void {
    if (this.state === 'fullScreen') return
    if (this.state === 'maximized') this.unmaximize()
    else this.maximize()
  }

  maximize(): void {
    const b = this.c.base
    if (this.hwnd && variant.maximize === 'native') win32()?.show(this.hwnd, SW_MAXIMIZE)
    else {
      // Electron keeps the bounds to come back to; a snapped window comes
      // back to where it was before Snap, which Windows remembers.
      if (this.state === 'snapped') this.restoreTo = b.getNormalBounds()
      b.maximize()
    }
    this.refresh()
  }

  unmaximize(): void {
    // Aero Snap to the top (and native maximize) make a really maximized
    // window, which Electron's unmaximize for transparent windows doesn't know.
    if (this.zoomed()) win32()?.show(this.hwnd, SW_RESTORE)
    else this.c.base.unmaximize()
    this.refresh()
  }

  /** Maximized by Windows itself (WS_MAXIMIZE), not by bounds. */
  private zoomed(): boolean { return !!this.hwnd && !!win32()?.zoomed(this.hwnd) }

  isFullScreen(): boolean { return this.c.base.isFullScreen() || this.full }

  setFullScreen(on = !this.isFullScreen()): void {
    if (on === this.isFullScreen()) return
    this.full = on && !!this.hwnd
    this.c.base.setFullScreen(on)
    this.refresh()
    this.c.mark('window')
  }

  /** Back to free from whatever Windows or we made of the window (tests,
   * placing a window somewhere). */
  release(): void {
    if (this.isFullScreen()) this.setFullScreen(false)
    if (this.zoomed() || (this.hwnd && win32()?.arranged(this.hwnd))) win32()?.show(this.hwnd, SW_RESTORE)
    else if (this.c.base.isMaximized()) this.c.base.unmaximize()
    this.refresh()
  }

  /** For the bench: what Windows says about the window. */
  diagnose(): Record<string, unknown> {
    const w = win32()
    const out: Record<string, unknown> = { ...this.view(), variant, bounds: this.c.base.getBounds(), visual: this.visual(), hwnd: this.hwnd }
    if (w && this.hwnd) {
      out.style = '0x' + (w.style(this.hwnd) >>> 0).toString(16)
      out.exStyle = '0x' + (w.exStyle(this.hwnd) >>> 0).toString(16)
      out.arranged = w.arranged(this.hwnd)
      out.zoomed = w.zoomed(this.hwnd)
      out.windowRect = w.windowRect(this.hwnd)
      out.dwmFrame = w.dwmFrame(this.hwnd)
      out.cursor = w.cursor()
    }
    out.pages = this.c.pageBounds()
    const wc = this.c.activeRuntime()?.contents
    out.zoom = wc && !wc.isDestroyed() ? wc.getZoomFactor() : null
    out.pointer = screen.getCursorScreenPoint()
    out.minimized = this.c.base.isMinimized()
    out.workArea = screen.getDisplayMatching(this.c.base.getBounds()).workArea
    out.display = screen.getDisplayMatching(this.c.base.getBounds()).bounds
    out.scale = screen.getDisplayMatching(this.c.base.getBounds()).scaleFactor
    return out
  }
}

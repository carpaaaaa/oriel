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
  style: process.env.SEARCH_FRAME_STYLE === 'plain' ? 'plain' : 'thick',
  /** emulated: Electron's maximize for transparent windows (bounds = work
   * area); native: ShowWindow, a real maximized window. */
  maximize: process.env.SEARCH_FRAME_MAX === 'native' ? 'native' : 'emulated',
  /** nc: WM_NCLBUTTONDOWN on an edge; syscommand: SC_SIZE; manual: by hand. */
  resize: (['nc', 'syscommand', 'manual'] as const).find(v => v === process.env.SEARCH_FRAME_RESIZE) ?? 'nc',
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
      minWidth: VISIBLE.minWidth + ROOM.left + ROOM.right,
      minHeight: VISIBLE.minHeight + ROOM.top + ROOM.bottom,
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
        if (command === SC_MAXIMIZE && this.state !== 'maximized') setImmediate(() => this.maximize())
        else if (command === SC_RESTORE && this.state === 'maximized' && !c.base.isMinimized()) setImmediate(() => this.unmaximize())
      })
      c.base.hookWindowMessage(WM_EXITSIZEMOVE, () => setImmediate(() => this.refresh()))
    }
    this.manual = kind === 'drawn' && !(w && this.hwnd)
    this.state = this.compute()
    c.base.on('closed', () => this.stopPoll())
  }

  // geometry

  margin(): Insets { return this.kind === 'drawn' && this.state === 'free' ? ROOM : NONE }

  /** The window as people see it, in screen DIP. */
  visual(bounds = this.c.base.getBounds()): Rectangle {
    const m = this.margin()
    return { x: bounds.x + m.left, y: bounds.y + m.top, width: bounds.width - m.left - m.right, height: bounds.height - m.top - m.bottom }
  }

  /** Window bounds for a visible rectangle (free state). */
  boundsFor(v: Rectangle): Rectangle {
    const m = this.kind === 'drawn' ? ROOM : NONE
    return { x: v.x - m.left, y: v.y - m.top, width: v.width + m.left + m.right, height: v.height + m.top + m.bottom }
  }

  view(): FrameView {
    return { kind: this.kind, margin: this.margin(), state: this.state, hollow: this.hollow, manual: this.manual, manualResize: this.resizesByHand, grip: GRIP }
  }

  private compute(): State {
    const b = this.c.base
    if (b.isFullScreen()) return 'fullScreen'
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
    this.c.base.setIgnoreMouseEvents(hollow)
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

  /** A press on the strip moved past the threshold: hand it to Windows. */
  startDrag(): void {
    const w = win32()
    if (this.manual || !w || !this.hwnd || this.state === 'fullScreen') return
    // A really maximized window (native) is brought back by Windows itself.
    if (this.state === 'maximized' && variant.maximize === 'emulated') this.restoreUnder(screen.getCursorScreenPoint())
    w.beginMove(this.hwnd, w.cursor())
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
    const [minW, minH] = b.getMinimumSize()
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
    const b = this.c.base
    if (this.hwnd && variant.maximize === 'native') win32()?.show(this.hwnd, SW_RESTORE)
    else b.unmaximize()
    this.refresh()
  }

  setFullScreen(on = !this.c.base.isFullScreen()): void {
    this.c.base.setFullScreen(on)
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
    out.pointer = screen.getCursorScreenPoint()
    out.minimized = this.c.base.isMinimized()
    out.workArea = screen.getDisplayMatching(this.c.base.getBounds()).workArea
    out.display = screen.getDisplayMatching(this.c.base.getBounds()).bounds
    out.scale = screen.getDisplayMatching(this.c.base.getBounds()).scaleFactor
    return out
  }
}

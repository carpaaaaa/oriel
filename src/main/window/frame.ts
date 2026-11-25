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
import { DWMWA, WS, win32, type Placement } from '../win/user32'
import { appIcon, iconOption } from '../win/icon'
import type { WindowController } from '../views/window'
import { testEnv } from '../testhooks'

/** As quietTests in context.ts (not imported: frame.ts loads before it). */
const quietTests = process.platform === 'darwin' && !!testEnv('SEARCH_PROBE') && testEnv('SEARCH_SHOW') !== '1'

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
const SW_SHOWMAXIMIZED = 3

export type FrameKind = FrameView['kind']
type State = FrameView['state']

/** Variants that can be switched for comparing on Windows (bench and CI). */
const variant = {
  /** plain: Electron's transparent window; thick: plus WS_THICKFRAME, so
   * Windows treats it as resizable (Snap) with DWM's own border turned off;
   * caption: plus WS_CAPTION and WS_SYSMENU too (Win+Up, animations). */
  style: ((['plain', 'caption'] as const).find(v => v === testEnv('SEARCH_FRAME_STYLE')) ?? 'thick') as 'plain' | 'thick' | 'caption',
  /** native: ShowWindow, a really maximized window, so Windows knows it
   * (Win+Down restores instead of minimizing, dragging it down restores it);
   * emulated: Electron's maximize for transparent windows (bounds = work area). */
  maximize: testEnv('SEARCH_FRAME_MAX') === 'emulated' ? 'emulated' : 'native',
  /** syscommand: SC_SIZE; nc: WM_NCLBUTTONDOWN on an edge; manual: by hand. */
  resize: (['nc', 'syscommand', 'manual'] as const).find(v => v === testEnv('SEARCH_FRAME_RESIZE')) ?? 'syscommand',
  /** syscommand: SC_MOVE; nc: WM_NCLBUTTONDOWN on the caption. */
  move: (testEnv('SEARCH_FRAME_MOVE') === 'nc' ? 'nc' : 'syscommand') as 'nc' | 'syscommand',
}

export function frameKind(chrome: 'windows' | 'mac'): FrameKind {
  if (chrome === 'mac') return 'mac'
  const forced = testEnv('SEARCH_FRAME')
  if (forced === 'native' || forced === 'drawn') return forced
  return model.pref<boolean>('window.nativeFrame') ? 'native' : 'drawn'
}

export function frameColour(dark: boolean): string { return dark ? '#131313' : '#F4F4F4' }

export function windowOptions(kind: FrameKind, dark: boolean): BaseWindowConstructorOptions {
  const frame = frameColour(dark)
  // The window's title is what Windows shows in the taskbar and Alt+Tab.
  const common = { title: 'Oriel', show: false, minimizable: true, maximizable: true, fullscreenable: true, ...iconOption() }
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
  /** Window messages seen while tracing (tests). */
  tracing = false
  trace: string[] = []
  /** For the tests: what full screen did, in order, with the window's state then. */
  note(what: string): void {
    if (!this.tracing || this.c.base.isDestroyed()) return
    const b = this.c.base.getBounds()
    this.trace.push(`${what} | electron full ${this.c.base.isFullScreen()} ours ${this.full} zoomed ${this.zoomed()} | ${b.x},${b.y} ${b.width}x${b.height}`)
  }
  /** Full screen as we asked it (Electron doesn't know it for transparent windows on Windows). */
  private full = false
  /** The bounds it comes back to out of full screen: Electron keeps them to
   * itself for transparent windows on Windows, where getNormalBounds says the
   * full screen, and windows.json would bring it back screen-sized. */
  private beforeFull: Rectangle | null = null
  /** Maximized by Windows when full screen began: Windows keeps a maximized
   * window at the work area whatever bounds it is given (the taskbar showed
   * under F11 and under a video's full screen), so it is made normal for
   * full screen and maximized again after, with the size it is restored to
   * kept as it was. */
  private fromMax: Placement | null = null
  /** What the window was the last time it wasn't in full screen (read at
   * each refresh): where full screen comes back to, whoever started it. */
  private notFull: { state: State; bounds: Rectangle; visual: Rectangle; normal: Rectangle } | null = null
  /** The bounds the last time it was free and not screen-sized: what a
   * maximized window comes back to when Electron can't say. */
  private lastFree: Rectangle | null = null
  /** Corrections made for a client area past the screen's edges (tests). */
  fixes: string[] = []

  constructor(private readonly c: WindowController, kind: FrameKind) {
    this.kind = kind
    const w = win32()
    if (w && kind === 'drawn') {
      this.hwnd = w.hwnd(c.base.getNativeWindowHandle())
      if (variant.style !== 'plain') {
        // Resizable in Windows' eyes (Snap needs it), without DWM's border,
        // corners or shadow: ours are drawn in the margin.
        const extra = variant.style === 'caption' ? WS.CAPTION | WS.SYSMENU : 0
        w.setStyle(this.hwnd, w.style(this.hwnd) | WS.THICKFRAME | WS.MAXIMIZEBOX | WS.MINIMIZEBOX | extra)
      }
      w.dwmSet(this.hwnd, DWMWA.NCRENDERING_POLICY, 1)
      w.dwmSet(this.hwnd, DWMWA.WINDOW_CORNER_PREFERENCE, 1)
      w.dwmSet(this.hwnd, DWMWA.BORDER_COLOR, 0xfffffffe)
      // Win+Up and Win+Down: Electron drops SC_MAXIMIZE for transparent
      // windows; do ours instead.
      c.base.hookWindowMessage(WM_SYSCOMMAND, wParam => {
        const command = Number(wParam.length >= 8 ? wParam.readBigUInt64LE(0) : BigInt(wParam.readUInt32LE(0))) & 0xfff0
        if (this.tracing) this.trace.push('syscommand 0x' + command.toString(16))
        // In full screen Win+Up and Win+Down change nothing (F11 leaves it).
        if (this.isFullScreen()) return
        if (command === SC_MAXIMIZE && this.state !== 'maximized') setImmediate(() => { if (this.compute() !== 'maximized') this.maximize() })
        else if (command === SC_RESTORE && this.state === 'maximized' && !c.base.isMinimized()) setImmediate(() => { if (this.compute() === 'maximized') this.unmaximize() })
      })
      c.base.hookWindowMessage(WM_EXITSIZEMOVE, () => setImmediate(() => this.refresh()))
      // For the tests: which window messages arrive (Win+Up, Snap).
      if (testEnv('SEARCH_PROBE')) {
        for (const m of [0x0005, 0x0018, 0x0024, 0x0046, 0x0047, 0x0086, 0x0231, 0x0313]) {
          if (m === WM_EXITSIZEMOVE) continue
          c.base.hookWindowMessage(m, (wp, lp) => {
            if (!this.tracing) return
            const n = (b: Buffer) => (b.length >= 8 ? b.readBigUInt64LE(0) : BigInt(b.readUInt32LE(0))).toString(16)
            this.trace.push(`0x${m.toString(16)} ${n(wp)} ${n(lp)}`)
          })
        }
      }
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
    // Full screen by F11, by a page (a video) or after a restart: all come here.
    // Electron tells before it moves the window: where it was is read then.
    c.base.on('enter-full-screen', () => { this.note('enter-full-screen'); this.entered(); setImmediate(() => this.refresh()) })
    c.base.on('leave-full-screen', () => { this.note('leave-full-screen'); setImmediate(() => this.refresh()) })
    c.base.on('focus', () => this.refocusSoon())
    c.base.on('restore', () => this.refocusSoon())
  }

  // geometry

  margin(): Insets { return this.kind === 'drawn' && this.state === 'free' ? ROOM : NONE }

  /** The window as people see it, in screen DIP (the client area: a really
   * maximized window hangs over the screen's edges by its frame). */
  visual(bounds = this.c.base.getContentBounds()): Rectangle {
    const m = this.margin()
    return { x: bounds.x + m.left, y: bounds.y + m.top, width: bounds.width - m.left - m.right, height: bounds.height - m.top - m.bottom }
  }

  /** The bounds a maximized window comes back to: the last free bounds
   * Oriel saw. Electron's own can't be trusted for a transparent window
   * maximized by Windows (NativeWindowViews::GetNormalBounds answers its
   * restore_bounds_): empty when it never maximized it itself, and windows.json
   * kept {{40, 30}, {-80, -80}}; the screen's after a full screen, which set
   * them on the way in. Then Electron's if they can be a window's, else the
   * default size in the middle. */
  private normalBounds(): Rectangle {
    if (this.lastFree) return this.lastFree
    const n = this.c.base.getNormalBounds()
    const d = screen.getDisplayMatching(n.width > 0 ? n : this.c.base.getBounds()).bounds
    const screenSized = n.x === d.x && n.y === d.y && n.width === d.width && n.height === d.height
    if (n.width >= 100 && n.height >= 60 && !screenSized) return n
    const work = screen.getDisplayMatching(this.c.base.getBounds()).workArea
    const width = Math.min(VISIBLE.width, work.width), height = Math.min(VISIBLE.height, work.height)
    return this.boundsFor({ x: work.x + Math.round((work.width - width) / 2), y: work.y + Math.round((work.height - height) / 2), width, height })
  }

  /** The visible rectangle it comes back to when not maximized or snapped. */
  normalVisual(): Rectangle {
    if (this.state === 'free') return this.visual()
    const n = this.beforeFull ?? this.restoreTo ?? this.normalBounds()
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

  /** In full screen as a borderless window (window.fullScreenStyle). */
  borderless(): boolean { return this.state === 'fullScreen' && !this.edgeToEdge && model.pref<string>('window.fullScreenStyle') === 'borderless' }

  /** Full screen put on by Ctrl+S: drawn as full screen (the page edge to edge, the tabs coming down
   * at the top), whatever the style; the window's size is still the style's, so a Borderless window
   * keeps the taskbar within reach. Cleared when full screen ends. */
  edgeToEdge = false

  /** Borderless is chosen, and this is Windows: the window covers the screen
   * but Windows isn't told it is full screen, so the taskbar can still come
   * up when the pointer goes to its edge. */
  private borderlessWanted(): boolean { return !!this.hwnd && !!win32() && model.pref<string>('window.fullScreenStyle') === 'borderless' }

  /** Borderless now: chosen, and not a page's own full screen (a video is full screen whole). */
  private borderlessNow(): boolean { return this.borderlessWanted() && !this.byPage }

  /** What a borderless window covers (DIP): the screen, a pixel short on the
   * taskbar's edge when the taskbar hides, so Windows doesn't take the window
   * for a full-screen one and the taskbar still comes up from that edge; the
   * work area while the taskbar stays in view (it would sit over the window). */
  private coverRect(d: Rectangle): Rectangle {
    const bar = this.borderlessNow() ? win32()?.taskbar() : null
    if (!bar) return d
    if (!bar.autoHide) return screen.getDisplayMatching(d).workArea
    // Two physical pixels short on the taskbar's edge, as Windows leaves a maximized window
    // there (Chromium's kAutoHideTaskbarThicknessPx): one wasn't enough to bring the taskbar up
    // (carpa, 25 Nov 2026). In DIP, whole pixels at the screen's scale.
    const n = Math.ceil(2 / (screen.getDisplayMatching(d).scaleFactor || 1))
    switch (bar.edge) {
      case 'top': return { x: d.x, y: d.y + n, width: d.width, height: d.height - n }
      case 'left': return { x: d.x + n, y: d.y, width: d.width - n, height: d.height }
      case 'right': return { x: d.x, y: d.y, width: d.width - n, height: d.height }
      default: return { x: d.x, y: d.y, width: d.width, height: d.height - n }
    }
  }

  view(): FrameView {
    return { kind: this.kind, margin: this.margin(), state: this.state, borderless: this.borderless(), hollow: this.hollow, manual: this.manual, manualResize: this.resizesByHand, grip: GRIP }
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
    const b = this.c.base
    const was = this.state
    const next = this.compute()
    const onScreen = screen.getDisplayMatching(b.getBounds()).bounds, now = b.getBounds()
    const sameAs = (r: Rectangle) => now.x === r.x && now.y === r.y && now.width === r.width && now.height === r.height
    const screenSized = sameAs(onScreen) || sameAs(this.coverRect(onScreen))
    if (next !== 'fullScreen' && !b.isMinimized() && !(next === 'free' && screenSized)) {
      const bounds = now, m = this.kind === 'drawn' && next === 'free' ? ROOM : NONE
      const visual = { x: bounds.x + m.left, y: bounds.y + m.top, width: bounds.width - m.left - m.right, height: bounds.height - m.top - m.bottom }
      this.notFull = { state: next, bounds, visual, normal: next === 'free' ? bounds : this.restoreTo ?? this.normalBounds() }
      if (next === 'free') this.lastFree = bounds
    }
    // Maximized or full screen, the client area stays on the screen.
    if (next === 'maximized' || next === 'fullScreen') this.checkFitSoon()
    // Into and out of full screen, by F11, a page (a video) or a restart:
    // Electron doesn't always say so with its events, the window's state does.
    if (next === 'fullScreen' && was !== 'fullScreen') { this.note('state: full'); this.entered() }
    if (was === 'fullScreen' && next !== 'fullScreen') { this.note(`state: ${next}`); this.left() }
    // In full screen it covers the screen: a maximized window Windows keeps at
    // the work area, and Win+Left/Right moving it.
    if (next === 'fullScreen') setImmediate(() => { this.leaveMaximized(); this.cover() })
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
    const normal = this.restoreTo ?? this.normalBounds()
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
    // Asked of Windows for its next turn, not inside the call: Restore Down
    // after a full screen left maximized took the whole app down (a
    // segfault, from 0.1.7) while Windows sized the window inside it.
    if (this.zoomed()) { win32()?.showAsync(this.hwnd, SW_RESTORE); setTimeout(() => this.refresh(), 0); return }
    this.c.base.unmaximize()
    this.refresh()
  }

  /** Maximized by Windows itself (WS_MAXIMIZE), not by bounds. */
  private zoomed(): boolean { return !!this.hwnd && !!win32()?.zoomed(this.hwnd) }

  isFullScreen(): boolean { return this.c.base.isFullScreen() || this.full }

  setFullScreen(on = !this.isFullScreen()): void {
    if (on === this.isFullScreen()) return
    // Out of a full screen put on for a page's (Escape, F11, the strip's
    // button): the page leaves its own too, or its video stayed "full screen"
    // inside the window.
    if (!on && this.byPage) {
      this.byPage = false
      const page = this.c.activeRuntime()?.contents
      if (page && !page.isDestroyed()) page.executeJavaScript('document.fullscreenElement ? document.exitFullscreen().then(() => 1, () => 0) : 0', true).catch(() => {})
    }
    if (on) {
      this.refresh()
      this.beforeFull = this.comeBackTo()
      this.leaveMaximized()
    }
    if (!on) this.edgeToEdge = false
    this.full = on && !!this.hwnd
    // On Windows the window covers the screen by itself (cover), in both styles:
    // exactly for Full screen (Windows takes it for a full-screen app and keeps
    // the taskbar away), two pixels short on the taskbar's edge for Borderless
    // window (it comes up there). Electron's own full screen is the Mac's, and
    // went through an asynchronous leave and enter whenever the style was
    // changed in full screen, which left the window as it was.
    if (!this.hwnd) this.c.base.setFullScreen(on)
    else if (!on && this.c.base.isFullScreen()) this.c.base.setFullScreen(false)
    this.refresh()
    this.c.mark('window')
  }

  /** Borderless or Full screen chosen in Settings while in full screen: the
   * window covers the screen the way the new choice says, at once. */
  restyle(): void {
    if (!this.hwnd || !this.isFullScreen() || this.c.base.isDestroyed()) return
    this.cover()
    this.refresh()
    this.c.mark('window')
  }

  /** Into full screen, whoever asked (F11, a page, a restart). */
  private entered(): void {
    // A page's full screen: it comes back where it was.
    if (!this.beforeFull) this.beforeFull = this.comeBackTo()
    this.leaveMaximized()
    setImmediate(() => this.cover())
  }

  /** The bounds full screen comes back to: a free window's own; a snapped
   * one's visible rectangle, now with its margin (Windows no longer calls it
   * arranged once moved, so it comes back free where Snap had put it); a
   * maximized one's restored size (it is maximized again: fromMax). */
  private comeBackTo(): Rectangle | null {
    const n = this.notFull
    if (!n) return null
    if (n.state === 'free') return n.bounds
    if (n.state === 'snapped') return this.boundsFor(n.visual)
    return n.normal
  }

  /** Out of full screen, whoever asked: once Electron has put its own bounds
   * back, maximized again if it was, else the size it had before (Electron's
   * own can be the screen's after a page went full screen inside F11's). */
  private left(): void {
    const max = this.fromMax, before = this.beforeFull
    this.fromMax = null
    this.beforeFull = null
    setImmediate(() => {
      const b = this.c.base
      this.note(`left: max ${!!max}, before ${JSON.stringify(before)}`)
      if (b.isDestroyed() || this.isFullScreen()) return
      const w = win32()
      if (max && w && this.hwnd) { if (!this.zoomed()) w.setPlacement(this.hwnd, { ...max, showCmd: SW_SHOWMAXIMIZED }) }
      // Covering the screen exactly, Electron says "maximized" for a window it didn't maximize
      // (its bounds are the work area's, or the screen's): that is not a reason to leave it there.
      else if (before && !this.zoomed() && this.compute() !== 'snapped') {
        const now = b.getBounds()
        if (now.x !== before.x || now.y !== before.y || now.width !== before.width || now.height !== before.height) b.setBounds(before)
      }
      this.refresh()
      this.refocusSoon()
    })
  }

  /** A window Windows maximized is made normal (no animation: the style bit
   * alone), its placement kept to maximize it again after full screen. */
  private leaveMaximized(): void {
    const w = win32()
    if (!w || !this.hwnd || this.fromMax || !this.zoomed()) return
    this.note('leave maximized')
    this.fromMax = w.placement(this.hwnd)
    w.setStyle(this.hwnd, w.style(this.hwnd) & ~WS.MAXIMIZE)
    this.c.base.setBounds(screen.getDisplayMatching(this.c.base.getBounds()).bounds)
  }

  // the client area on the screen

  private fitTimer: NodeJS.Timeout | null = null
  private checkFitSoon(): void {
    if (!this.hwnd || this.fitTimer) return
    this.fitTimer = setTimeout(() => { this.fitTimer = null; this.checkFit(0) }, 150)
  }

  /** Maximized, the client area is the work area; in full screen, the
   * monitor. Past an edge (the window's buttons cut off on the right), the
   * frame is measured again, and if that isn't enough the window is put
   * there again: maximized once more, or covering its screen. */
  private checkFit(tries: number): void {
    const w = win32()
    const b = this.c.base
    if (!w || !this.hwnd || b.isDestroyed() || b.isMinimized()) return
    const state = this.compute()
    if (state !== 'maximized' && state !== 'fullScreen') return
    const m = w.monitorOf(this.hwnd)
    if (!m) return
    const area = state === 'fullScreen' && !(this.borderlessNow() && win32()?.taskbar()?.autoHide === false) ? m.monitor : m.work
    const c = w.clientRect(this.hwnd)
    const past = Math.max(area.left - c.left, c.right - area.right, area.top - c.top, c.bottom - area.bottom)
    // A pixel short on purpose (borderless), and DIP to pixel rounding at 125 or 150%: not past the screen.
    if (past <= (this.borderlessNow() ? 3 : 1)) return
    const said = `${state} past the screen by ${past}: client ${c.left},${c.top},${c.right},${c.bottom} area ${area.left},${area.top},${area.right},${area.bottom} (try ${tries})`
    this.fixes.push(said)
    if (this.fixes.length > 20) this.fixes.shift()
    console.warn('[frame]', said)
    if (tries === 0) w.frameChanged(this.hwnd)
    else if (tries === 1) {
      if (state === 'fullScreen') this.cover()
      else if (this.zoomed()) { w.showAsync(this.hwnd, SW_RESTORE); w.showAsync(this.hwnd, SW_MAXIMIZE) }
    } else return
    setTimeout(() => this.checkFit(tries + 1), 200)
  }

  /** In full screen the window covers its screen. */
  private cover(): void {
    const b = this.c.base
    if (b.isDestroyed() || b.isMinimized() || !this.isFullScreen()) return
    const d = this.coverRect(screen.getDisplayMatching(b.getBounds()).bounds)
    const now = b.getBounds()
    if (now.x !== d.x || now.y !== d.y || now.width !== d.width || now.height !== d.height) b.setBounds(d)
  }

  /** Full screen put on for a page's own (pagefull.ts), to be taken off with it. */
  private byPage = false

  /** A page entered or left its own full screen: the window covers the
   * screen meanwhile (Electron leaves a maximized window as it is). */
  pageFull(on: boolean): void {
    const b = this.c.base
    // Windows only: a Mac's full screen is the system's own (a Space).
    if (b.isDestroyed() || !this.hwnd) return
    this.note(`page full ${on}`)
    if (!on) {
      if (this.byPage) { this.byPage = false; if (this.isFullScreen()) this.setFullScreen(false) }
      return
    }
    if (!this.isFullScreen()) { this.byPage = true; this.setFullScreen(true); return }
    // Electron may say full screen and yet leave a maximized window where it
    // was (a second video in a row): judged by what is on the screen, it
    // covers the screen as ours does.
    setTimeout(() => {
      if (b.isDestroyed() || b.isMinimized() || this.full) return
      const d = screen.getDisplayMatching(b.getBounds()).bounds, now = b.getBounds()
      if (now.x === d.x && now.y === d.y && now.width === d.width && now.height === d.height) return
      this.note('page full: not covering, taken over')
      this.byPage = true
      if (!this.beforeFull) this.beforeFull = this.comeBackTo()
      this.leaveMaximized()
      this.full = !!this.hwnd
      this.cover()
      this.refresh()
    }, 150)
  }

  /** Was maximized under full screen (windows.json keeps it maximized). */
  maximizedUnderFull(): boolean { return !!this.fromMax }

  /** Keys need the page or the interface focused. After the full-screen
   * strip's buttons (in the overlay, which then shrinks away), a restore or
   * Win+arrows, Windows can leave none of them focused, and F11, Escape and
   * every shortcut went nowhere until a click. */
  refocusSoon(): void {
    setTimeout(() => this.refocus(), 60)
    setTimeout(() => this.refocus(), 300)
  }

  private refocus(): void {
    const c = this.c
    if (c.base.isDestroyed() || !c.base.isFocused() || c.base.isMinimized()) return
    const page = c.activeRuntime()?.contents
    const overlayShown = c.overlay.getBounds().width > 0 && c.overlay.getBounds().height > 0
    const views = [c.ui.webContents, overlayShown ? c.overlay.webContents : null, page]
    if (views.some(w => w && !w.isDestroyed() && w.isFocused())) return
    if (page && !page.isDestroyed()) page.focus()
    else c.ui.webContents.focus()
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
    if (w && this.hwnd) { out.client = w.clientRect(this.hwnd); out.monitor = w.monitorOf(this.hwnd) }
    out.fixes = this.fixes.slice(-10)
    out.pages = this.c.pageBounds()
    const wc = this.c.activeRuntime()?.contents
    out.zoom = wc && !wc.isDestroyed() ? wc.getZoomFactor() : null
    out.pointer = screen.getCursorScreenPoint()
    out.minimized = this.c.base.isMinimized()
    out.icon = appIcon() ?? null
    out.native = this.c.base.isFullScreen()
    out.taskbar = w ? w.taskbar() : null
    out.workArea = screen.getDisplayMatching(this.c.base.getBounds()).workArea
    out.display = screen.getDisplayMatching(this.c.base.getBounds()).bounds
    out.scale = screen.getDisplayMatching(this.c.base.getBounds()).scaleFactor
    return out
  }
}

// Calls into Windows through koffi (prebuilt, nothing to compile), for what
// Electron doesn't offer: handing a press over to Windows' own move and size
// loops, so Aero Snap, the Snap bar and shaking work (studio/01 §0.6 point 3,
// §1.12), reading whether Snap arranged the window, and window styles.
// Loaded lazily and only on Windows; every caller copes with null.

import { createRequire } from 'node:module'

const nodeRequire = createRequire(import.meta.url)

const WM_NCLBUTTONDOWN = 0x00a1
const WM_SYSCOMMAND = 0x0112
const SC_SIZE = 0xf000
const SC_MOVE = 0xf010
const GWL_STYLE = -16
const GWL_EXSTYLE = -20
const SWP_FLAGS = 0x0001 | 0x0002 | 0x0004 | 0x0010 | 0x0020 // NOSIZE NOMOVE NOZORDER NOACTIVATE FRAMECHANGED
const VK_LBUTTON = 0x01
const VK_RBUTTON = 0x02
const SM_SWAPBUTTON = 23

export const HT = { caption: 2, left: 10, right: 11, top: 12, 'top-left': 13, 'top-right': 14, bottom: 15, 'bottom-left': 16, 'bottom-right': 17 } as const
const WMSZ = { left: 1, right: 2, top: 3, 'top-left': 4, 'top-right': 5, bottom: 6, 'bottom-left': 7, 'bottom-right': 8 } as const

export const WS = { THICKFRAME: 0x00040000, MAXIMIZEBOX: 0x00010000, MINIMIZEBOX: 0x00020000, SYSMENU: 0x00080000, CAPTION: 0x00c00000 }
export const DWMWA = { NCRENDERING_POLICY: 2, EXTENDED_FRAME_BOUNDS: 9, WINDOW_CORNER_PREFERENCE: 33, BORDER_COLOR: 34 }

export interface Win32 {
  /** HWND from BaseWindow.getNativeWindowHandle(). */
  hwnd(handle: Buffer): number
  /** Is the (logical) left button down right now? */
  primaryDown(): boolean
  cursor(): { x: number; y: number }
  /** Hand the press over to Windows' move loop (as a press on a caption). */
  beginMove(hwnd: number, at: { x: number; y: number }, how: 'nc' | 'syscommand'): boolean
  /** Hand the press over to Windows' size loop, from an edge. */
  beginSize(hwnd: number, edge: keyof typeof WMSZ, at: { x: number; y: number }, how: 'nc' | 'syscommand'): boolean
  style(hwnd: number): number
  exStyle(hwnd: number): number
  setStyle(hwnd: number, style: number): void
  /** Snapped by Windows (Snap, Win+arrows), or null when unknown. */
  arranged(hwnd: number): boolean | null
  zoomed(hwnd: number): boolean
  show(hwnd: number, cmd: number): void
  dwmSet(hwnd: number, attribute: number, value: number): number
  dwmFrame(hwnd: number): { left: number; top: number; right: number; bottom: number } | null
  windowRect(hwnd: number): { left: number; top: number; right: number; bottom: number }
  /** The top-level window under a point (physical pixels), 0 for none. */
  rootAt(at: { x: number; y: number }): number
}

let cached: Win32 | null | undefined

export function win32(): Win32 | null {
  if (cached !== undefined) return cached
  cached = null
  if (process.platform !== 'win32' || process.env.SEARCH_NO_USER32) return null
  try {
    cached = load()
  } catch (error) {
    console.warn('[win32] koffi not available, moving and resizing by hand', error)
  }
  return cached
}

function load(): Win32 {
  const koffi = nodeRequire('koffi') as typeof import('koffi')
  const user32 = koffi.load('user32.dll')
  const dwmapi = koffi.load('dwmapi.dll')
  const POINT = koffi.struct('SEARCH_POINT', { x: 'int32_t', y: 'int32_t' })
  const RECT = koffi.struct('SEARCH_RECT', { left: 'int32_t', top: 'int32_t', right: 'int32_t', bottom: 'int32_t' })

  const ReleaseCapture = user32.func('int __stdcall ReleaseCapture()')
  const PostMessageW = user32.func('int __stdcall PostMessageW(intptr_t hwnd, uint32_t msg, uintptr_t wParam, intptr_t lParam)')
  const GetCursorPos = user32.func('int __stdcall GetCursorPos(_Out_ SEARCH_POINT *point)')
  const GetAsyncKeyState = user32.func('int16_t __stdcall GetAsyncKeyState(int key)')
  const GetSystemMetrics = user32.func('int __stdcall GetSystemMetrics(int index)')
  const GetWindowLongPtrW = user32.func('intptr_t __stdcall GetWindowLongPtrW(intptr_t hwnd, int index)')
  const SetWindowLongPtrW = user32.func('intptr_t __stdcall SetWindowLongPtrW(intptr_t hwnd, int index, intptr_t value)')
  const SetWindowPos = user32.func('int __stdcall SetWindowPos(intptr_t hwnd, intptr_t after, int x, int y, int cx, int cy, uint32_t flags)')
  const IsZoomed = user32.func('int __stdcall IsZoomed(intptr_t hwnd)')
  const ShowWindow = user32.func('int __stdcall ShowWindow(intptr_t hwnd, int cmd)')
  const GetWindowRect = user32.func('int __stdcall GetWindowRect(intptr_t hwnd, _Out_ SEARCH_RECT *rect)')
  const WindowFromPoint = user32.func('intptr_t __stdcall WindowFromPoint(SEARCH_POINT point)')
  const GetAncestor = user32.func('intptr_t __stdcall GetAncestor(intptr_t hwnd, uint32_t flags)')
  let IsWindowArranged: ((hwnd: number) => number) | null = null
  try { IsWindowArranged = user32.func('int __stdcall IsWindowArranged(intptr_t hwnd)') } catch { /* before Windows 10 2004 */ }
  const DwmSetWindowAttribute = dwmapi.func('int32_t __stdcall DwmSetWindowAttribute(intptr_t hwnd, uint32_t attribute, const void *value, uint32_t size)')
  const DwmGetWindowAttribute = dwmapi.func('int32_t __stdcall DwmGetWindowAttribute(intptr_t hwnd, uint32_t attribute, _Out_ SEARCH_RECT *value, uint32_t size)')

  const lparam = (p: { x: number; y: number }) => ((p.y & 0xffff) << 16) | (p.x & 0xffff)
  const cursor = () => { const p = { x: 0, y: 0 }; GetCursorPos(p); return p }
  const primaryDown = () => {
    const key = GetSystemMetrics(SM_SWAPBUTTON) ? VK_RBUTTON : VK_LBUTTON
    return (GetAsyncKeyState(key) & 0x8000) !== 0
  }

  return {
    hwnd: handle => Number(handle.length >= 8 ? handle.readBigUInt64LE(0) : BigInt(handle.readUInt32LE(0))),
    primaryDown,
    cursor,
    beginMove(hwnd, at, how) {
      // A press that already ended would leave the window glued to the pointer.
      if (!primaryDown()) return false
      ReleaseCapture()
      // SC_MOVE | HTCAPTION: the move loop of a press on a caption. A posted
      // WM_NCLBUTTONDOWN is taken by the page view under the pointer instead.
      if (how === 'syscommand') return PostMessageW(hwnd, WM_SYSCOMMAND, SC_MOVE + HT.caption, lparam(at)) !== 0
      return PostMessageW(hwnd, WM_NCLBUTTONDOWN, HT.caption, lparam(at)) !== 0
    },
    beginSize(hwnd, edge, at, how) {
      if (!primaryDown()) return false
      ReleaseCapture()
      if (how === 'syscommand') return PostMessageW(hwnd, WM_SYSCOMMAND, SC_SIZE + WMSZ[edge], lparam(at)) !== 0
      return PostMessageW(hwnd, WM_NCLBUTTONDOWN, HT[edge], lparam(at)) !== 0
    },
    style: hwnd => Number(GetWindowLongPtrW(hwnd, GWL_STYLE)),
    exStyle: hwnd => Number(GetWindowLongPtrW(hwnd, GWL_EXSTYLE)),
    setStyle(hwnd, style) {
      SetWindowLongPtrW(hwnd, GWL_STYLE, style)
      SetWindowPos(hwnd, 0, 0, 0, 0, 0, SWP_FLAGS)
    },
    arranged: hwnd => (IsWindowArranged ? IsWindowArranged(hwnd) !== 0 : null),
    zoomed: hwnd => IsZoomed(hwnd) !== 0,
    show: (hwnd, cmd) => { ShowWindow(hwnd, cmd) },
    dwmSet: (hwnd, attribute, value) => DwmSetWindowAttribute(hwnd, attribute, Uint32Array.of(value >>> 0), 4),
    dwmFrame(hwnd) {
      const r = { left: 0, top: 0, right: 0, bottom: 0 }
      return DwmGetWindowAttribute(hwnd, DWMWA.EXTENDED_FRAME_BOUNDS, r, 16) === 0 ? r : null
    },
    windowRect(hwnd) {
      const r = { left: 0, top: 0, right: 0, bottom: 0 }
      GetWindowRect(hwnd, r)
      return r
    },
    rootAt(at) {
      const h = Number(WindowFromPoint(at))
      return h ? Number(GetAncestor(h, 2 /* GA_ROOT */)) : 0
    },
  }
}

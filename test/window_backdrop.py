#!/usr/bin/env python3
"""A plain window for window_os.py, with nothing but Python on Windows.

    window_backdrop.py back <log>   light grey over the work area, behind
                                    Oriel; a click never activates nor raises
                                    it; each press is written to <log>
    window_backdrop.py front        a small ordinary window in the bottom
                                    right corner that takes the keys, so
                                    Oriel is drawn at rest
"""
import sys
if sys.platform != "win32":
    print("window_backdrop.py runs on Windows only")
    raise SystemExit(0)
import ctypes, sys
from ctypes import wintypes as wt

mode = sys.argv[1] if len(sys.argv) > 1 else "back"
log = sys.argv[2] if len(sys.argv) > 2 else None

user32 = ctypes.WinDLL("user32", use_last_error=True)
gdi32 = ctypes.WinDLL("gdi32")
kernel32 = ctypes.WinDLL("kernel32")
try:
    user32.SetProcessDpiAwarenessContext(ctypes.c_void_p(-4))
except Exception:
    pass

LRESULT = ctypes.c_ssize_t
WNDPROC = ctypes.WINFUNCTYPE(LRESULT, wt.HWND, wt.UINT, wt.WPARAM, wt.LPARAM)
user32.DefWindowProcW.restype = LRESULT
user32.DefWindowProcW.argtypes = [wt.HWND, wt.UINT, wt.WPARAM, wt.LPARAM]
user32.CreateWindowExW.restype = wt.HWND
user32.CreateWindowExW.argtypes = [wt.DWORD, wt.LPCWSTR, wt.LPCWSTR, wt.DWORD, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int,
                                   wt.HWND, wt.HMENU, wt.HINSTANCE, wt.LPVOID]
user32.SetWindowPos.argtypes = [wt.HWND, wt.HWND, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int, wt.UINT]
user32.LoadCursorW.restype = wt.HANDLE
user32.LoadCursorW.argtypes = [wt.HINSTANCE, wt.LPVOID]
kernel32.GetModuleHandleW.restype = wt.HMODULE
gdi32.CreateSolidBrush.restype = wt.HBRUSH


class WNDCLASSW(ctypes.Structure):
    _fields_ = [("style", wt.UINT), ("lpfnWndProc", WNDPROC), ("cbClsExtra", ctypes.c_int), ("cbWndExtra", ctypes.c_int),
                ("hInstance", wt.HINSTANCE), ("hIcon", wt.HICON), ("hCursor", wt.HANDLE), ("hbrBackground", wt.HBRUSH),
                ("lpszMenuName", wt.LPCWSTR), ("lpszClassName", wt.LPCWSTR)]


WM_DESTROY, WM_MOUSEACTIVATE, WM_LBUTTONDOWN, WM_RBUTTONDOWN = 0x0002, 0x0021, 0x0201, 0x0204
MA_NOACTIVATE = 3


def proc(hwnd, msg, wparam, lparam):
    if msg in (WM_LBUTTONDOWN, WM_RBUTTONDOWN) and log:
        p = wt.POINT()
        user32.GetCursorPos(ctypes.byref(p))
        with open(log, "a") as f:
            f.write(f"{p.x},{p.y}\n")
        return 0
    if msg == WM_MOUSEACTIVATE and mode == "back":
        return MA_NOACTIVATE
    if msg == WM_DESTROY:
        user32.PostQuitMessage(0)
        return 0
    return user32.DefWindowProcW(hwnd, msg, wparam, lparam)


callback = WNDPROC(proc)
wc = WNDCLASSW()
wc.lpfnWndProc = callback
wc.hInstance = kernel32.GetModuleHandleW(None)
wc.hbrBackground = gdi32.CreateSolidBrush(0x00E8E8E8 if mode == "back" else 0x00FFFFFF)
wc.hCursor = user32.LoadCursorW(None, ctypes.c_void_p(32512))
wc.lpszClassName = "OrielTest" + mode
user32.RegisterClassW(ctypes.byref(wc))

work = wt.RECT()
user32.SystemParametersInfoW(0x30, 0, ctypes.byref(work), 0)  # SPI_GETWORKAREA
WS_POPUP, WS_VISIBLE, WS_OVERLAPPEDWINDOW = 0x80000000, 0x10000000, 0x00CF0000
WS_EX_NOACTIVATE, WS_EX_TOPMOST = 0x08000000, 0x00000008
if mode == "back":
    hwnd = user32.CreateWindowExW(WS_EX_NOACTIVATE, wc.lpszClassName, "backdrop", WS_POPUP | WS_VISIBLE,
                                  work.left, work.top, work.right - work.left, work.bottom - work.top, None, None, wc.hInstance, None)
    # Above the other windows (a console, say), still without the keys.
    user32.SetWindowPos(hwnd, None, 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0010)
else:
    hwnd = user32.CreateWindowExW(WS_EX_TOPMOST, wc.lpszClassName, "other", WS_OVERLAPPEDWINDOW | WS_VISIBLE,
                                  work.right - 230, work.bottom - 140, 220, 130, None, None, wc.hInstance, None)
    user32.SetForegroundWindow(hwnd)
print("window", hwnd, flush=True)

msg = wt.MSG()
while user32.GetMessageW(ctypes.byref(msg), None, 0, 0) > 0:
    user32.TranslateMessage(ctypes.byref(msg))
    user32.DispatchMessageW(ctypes.byref(msg))

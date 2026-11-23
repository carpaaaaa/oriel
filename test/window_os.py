#!/usr/bin/env python3
"""The window drawn by Oriel on real Windows, with real input from the
operating system (studio/01 §0.6 point 3, §1.12, §1.19; studio/02 §4.1, §4.7,
§4.8): pictures of the whole screen (corners and shadow as Windows composes
them), moving from the strip with Windows' own loop, resizing from edges and
corners, the clear margin letting clicks through to the window behind,
maximize and restore, double click, Aero Snap to a side and to the top,
Win+arrows, full screen.

Windows only. SHOTS_DIR=<folder>, FRAME_VARIANT=<name> (a subfolder), and
the frame's variant through SEARCH_FRAME_STYLE / SEARCH_FRAME_MAX /
SEARCH_FRAME_RESIZE (see src/main/window/frame.ts)."""
import ctypes, json, os, struct, subprocess, sys, tempfile, time, zlib
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b

if sys.platform != "win32":
    print("window_os.py runs on Windows only")
    sys.exit(0)

from ctypes import wintypes as wt

user32 = ctypes.WinDLL("user32", use_last_error=True)
gdi32 = ctypes.WinDLL("gdi32")
try:
    user32.SetProcessDpiAwarenessContext(ctypes.c_void_p(-4))  # per monitor v2: physical pixels
except Exception:
    pass

user32.GetDC.restype = ctypes.c_void_p
user32.GetDC.argtypes = [ctypes.c_void_p]
user32.ReleaseDC.argtypes = [ctypes.c_void_p, ctypes.c_void_p]
user32.WindowFromPoint.restype = ctypes.c_void_p
user32.WindowFromPoint.argtypes = [wt.POINT]
user32.GetAncestor.restype = ctypes.c_void_p
user32.GetAncestor.argtypes = [ctypes.c_void_p, ctypes.c_uint]
user32.GetForegroundWindow.restype = ctypes.c_void_p
gdi32.CreateCompatibleDC.restype = ctypes.c_void_p
gdi32.CreateCompatibleDC.argtypes = [ctypes.c_void_p]
gdi32.CreateCompatibleBitmap.restype = ctypes.c_void_p
gdi32.CreateCompatibleBitmap.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_int]
gdi32.SelectObject.restype = ctypes.c_void_p
gdi32.SelectObject.argtypes = [ctypes.c_void_p, ctypes.c_void_p]
gdi32.BitBlt.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_void_p, ctypes.c_int, ctypes.c_int, ctypes.c_uint]
gdi32.GetDIBits.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_uint, ctypes.c_uint, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_uint]
gdi32.DeleteObject.argtypes = [ctypes.c_void_p]
gdi32.DeleteDC.argtypes = [ctypes.c_void_p]

OUT = Path(os.environ.get("SHOTS_DIR", "shots")) / os.environ.get("FRAME_VARIANT", "drawn")
OUT.mkdir(parents=True, exist_ok=True)
LOG = []


def note(what, **data):
    LOG.append({"what": what, **data})
    (OUT / "window-os.json").write_text(json.dumps(LOG, indent=1))


# pictures of the whole screen

class BITMAPINFOHEADER(ctypes.Structure):
    _fields_ = [("biSize", wt.DWORD), ("biWidth", wt.LONG), ("biHeight", wt.LONG), ("biPlanes", wt.WORD), ("biBitCount", wt.WORD),
                ("biCompression", wt.DWORD), ("biSizeImage", wt.DWORD), ("biXPelsPerMeter", wt.LONG), ("biYPelsPerMeter", wt.LONG),
                ("biClrUsed", wt.DWORD), ("biClrImportant", wt.DWORD)]


def grab(name):
    x, y = user32.GetSystemMetrics(76), user32.GetSystemMetrics(77)
    w, h = user32.GetSystemMetrics(78), user32.GetSystemMetrics(79)
    screen = user32.GetDC(None)
    mem = gdi32.CreateCompatibleDC(screen)
    bmp = gdi32.CreateCompatibleBitmap(screen, w, h)
    gdi32.SelectObject(mem, bmp)
    gdi32.BitBlt(mem, 0, 0, w, h, screen, x, y, 0x00CC0020 | 0x40000000)
    bi = BITMAPINFOHEADER(40, w, -h, 1, 32, 0, 0, 0, 0, 0, 0)
    buf = ctypes.create_string_buffer(w * h * 4)
    gdi32.GetDIBits(mem, bmp, 0, h, buf, ctypes.byref(bi), 0)
    gdi32.DeleteObject(bmp)
    gdi32.DeleteDC(mem)
    user32.ReleaseDC(None, screen)
    data = buf.raw
    raw = bytearray()
    for row in range(h):
        line = data[row * w * 4:(row + 1) * w * 4]
        rgb = bytearray(w * 3)
        rgb[0::3], rgb[1::3], rgb[2::3] = line[2::4], line[1::4], line[0::4]
        raw += b"\0" + rgb

    def chunk(kind, body):
        return struct.pack(">I", len(body)) + kind + body + struct.pack(">I", zlib.crc32(kind + body) & 0xffffffff)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(bytes(raw), 6)) + chunk(b"IEND", b"")
    (OUT / f"{name}.png").write_bytes(png)
    return OUT / f"{name}.png"


# real input

MOUSEEVENTF_MOVE, MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP, MOUSEEVENTF_ABSOLUTE, MOUSEEVENTF_VIRTUALDESK = 0x1, 0x2, 0x4, 0x8000, 0x4000


def move_to(x, y):
    vx, vy = user32.GetSystemMetrics(76), user32.GetSystemMetrics(77)
    vw, vh = user32.GetSystemMetrics(78), user32.GetSystemMetrics(79)
    nx = int((x - vx) * 65535 / max(1, vw - 1))
    ny = int((y - vy) * 65535 / max(1, vh - 1))
    user32.mouse_event(MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_VIRTUALDESK, nx, ny, 0, 0)
    user32.SetCursorPos(int(x), int(y))


def press():
    user32.mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0)


def release():
    user32.mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)


def click(x, y, wait=0.15):
    move_to(x, y)
    time.sleep(0.08)
    press()
    time.sleep(0.05)
    release()
    time.sleep(wait)


def double_click(x, y):
    move_to(x, y)
    time.sleep(0.08)
    for _ in range(2):
        press()
        time.sleep(0.03)
        release()
        time.sleep(0.06)
    time.sleep(0.4)


def drag(start, end, steps=16, hold=0.12, pause=0.02):
    move_to(*start)
    time.sleep(0.1)
    press()
    time.sleep(hold)
    for i in range(1, steps + 1):
        move_to(start[0] + (end[0] - start[0]) * i / steps, start[1] + (end[1] - start[1]) * i / steps)
        time.sleep(pause)
    time.sleep(0.25)
    release()
    time.sleep(0.6)


KEYEVENTF_KEYUP = 0x2
VK = {"win": 0x5B, "left": 0x25, "up": 0x26, "right": 0x27, "down": 0x28, "esc": 0x1B, "f11": 0x7A}


def chord(*keys):
    for k in keys:
        user32.keybd_event(VK[k], 0, 0x1 if k in ("left", "up", "right", "down") else 0, 0)
        time.sleep(0.03)
    for k in reversed(keys):
        user32.keybd_event(VK[k], 0, KEYEVENTF_KEYUP | (0x1 if k in ("left", "up", "right", "down") else 0), 0)
        time.sleep(0.03)
    time.sleep(0.8)


def root_at(x, y):
    h = user32.WindowFromPoint(wt.POINT(int(x), int(y)))
    return user32.GetAncestor(h, 2) if h else None  # GA_ROOT


# a light window behind, recording the clicks that reach it

BACKDROP_LOG = Path(tempfile.gettempdir()) / "oriel-backdrop.txt"
BACKDROP_LOG.write_text("")
HELPER = str(Path(__file__).resolve().parent / "window_backdrop.py")
chord("esc")  # a Start menu or a first-run screen left open
backdrop = subprocess.Popen([sys.executable, HELPER, "back", str(BACKDROP_LOG)])
time.sleep(4)


def backdrop_clicks():
    return [tuple(map(int, l.split(","))) for l in BACKDROP_LOG.read_text().split() if "," in l]


t = b.T()
b.use("window-os-" + os.environ.get("FRAME_VARIANT", "drawn"))
b.launch(env={"SEARCH_LOOK": os.environ["FRAME_LOOK"]} if os.environ.get("FRAME_LOOK") else None)


def cleanup():
    backdrop.kill()
    b.quit()


import atexit, traceback
atexit.register(cleanup)


def frame():
    return b.call({"do": "window.frame"})["frame"]


def settle(pred, within=4.0):
    end = time.time() + within
    last = None
    while time.time() < end:
        last = pred()
        if last:
            return last
        time.sleep(0.1)
    return last


try:
    f = frame()
    S = f["scale"]
    work = f["workArea"]
    note("start", frame=f)
    px = lambda v: v * S  # DIP to pixels (one display, at the origin)

    vis = {"x": work["x"] + 150, "y": work["y"] + 100, "width": min(760, work["width"] - 330), "height": min(480, work["height"] - 220)}
    b.call({"do": "window.place", "visual": True, **vis})
    b.cmd("tab.go", input="data:text/html,<title>os</title><body style='margin:0;background:%23fff;font:15px sans-serif;padding:24px'>A page on the card.")
    b.wait_for(lambda: b.active()["title"] == "os", what="page")
    b.call({"do": "window.focus"})
    time.sleep(1.2)
    f = frame()
    note("placed", frame=f)
    hwnd = f["hwnd"]
    v = f["visual"]
    grab("1-normal")


    def strip(v):
        """A point on the empty strip, left of the buttons."""
        return (px(v["x"] + v["width"] - 220), px(v["y"] + 16))


    # 1. The clear margin: hovering it makes the window let go of the mouse, and
    #    a click there reaches the window behind.
    mx, my = px(v["x"] + v["width"] + 26), px(v["y"] + v["height"] / 2)
    move_to(mx - 4, my)
    time.sleep(0.1)
    move_to(mx, my)
    hollow = settle(lambda: frame()["hollow"], 2)
    t.ok(hollow, "the pointer over the margin makes it clear")
    t.ok(root_at(mx, my) != hwnd, "Windows sees the window behind at the margin")
    before = len(backdrop_clicks())
    click(mx, my, 0.4)
    t.ok(len(backdrop_clicks()) > before, "a click on the margin reaches the window behind")
    time.sleep(0.3)
    gx, gy = px(v["x"] + v["width"] + 3), px(v["y"] + v["height"] / 2)
    move_to(gx, gy)
    time.sleep(0.4)
    t.ok(not frame()["hollow"], "the grip just outside the edge is the window's again")
    t.ok(root_at(gx, gy) == hwnd, "Windows sees our window at the grip")

    # 2. Moving from the strip with Windows' own loop.
    click(*strip(v), 0.4)
    before = frame()["bounds"]
    sx, sy = strip(v)
    drag((sx, sy), (sx + px(120), sy + px(60)))
    after = frame()["bounds"]
    note("move", before=before, after=after)
    t.ok(abs(after["x"] - before["x"] - 120) <= 3 and abs(after["y"] - before["y"] - 60) <= 3 and after["width"] == before["width"], "dragging the strip moves the window (%s -> %s)" % (before, after))
    t.ok(frame()["state"] == "free", "still free after moving")

    # 3. Resizing from the right edge (just outside it) and the bottom left corner.
    b.call({"do": "window.place", "visual": True, **vis})
    time.sleep(0.4)
    v = frame()["visual"]
    before = v
    ex, ey = px(v["x"] + v["width"] + 3), px(v["y"] + v["height"] / 2)
    drag((ex, ey), (ex + px(80), ey))
    v = frame()["visual"]
    note("resize right", before=before, after=v)
    t.ok(abs(v["width"] - before["width"] - 80) <= 3 and v["height"] == before["height"] and v["x"] == before["x"], "the right edge resizes (%s -> %s)" % (before["width"], v["width"]))
    before = v
    cx, cy = px(v["x"] - 2), px(v["y"] + v["height"] + 2)
    drag((cx, cy), (cx - px(40), cy + px(30)))
    v = frame()["visual"]
    note("resize corner", before=before, after=v)
    t.ok(abs(v["width"] - before["width"] - 40) <= 3 and abs(v["height"] - before["height"] - 30) <= 3 and abs(v["x"] - before["x"] + 40) <= 3 and v["y"] == before["y"], "the bottom left corner resizes (%s -> %s)" % (before, v))
    grab("3-resized")

    # 4. The maximize button, then restore.
    v = frame()["visual"]
    normal = frame()["bounds"]
    click(px(v["x"] + v["width"] - 46 - 23), px(v["y"] + 20), 0.8)
    f = frame()
    note("maximize button", frame=f)
    t.ok(f["state"] == "maximized" and f["visual"] == f["workArea"], "the maximize button maximizes (%s)" % f["state"])
    grab("4-maximized")
    v = f["visual"]
    click(px(v["x"] + v["width"] - 46 - 23), px(v["y"] + 20), 0.8)
    f = frame()
    t.ok(f["state"] == "free" and f["bounds"] == normal, "the button restores (%s)" % f["bounds"])

    # 5. Double click on the strip.
    double_click(*strip(f["visual"]))
    f = settle(lambda: frame()["state"] == "maximized" and frame(), 2) or frame()
    t.ok(f["state"] == "maximized", "double click on the strip maximizes")
    double_click(*strip(f["visual"]))
    f = settle(lambda: frame()["state"] == "free" and frame(), 2) or frame()
    t.ok(f["state"] == "free", "double click again restores")

    # 6. Dragging a maximized window brings it back to its size under the pointer.
    b.cmd("window.maximize")
    time.sleep(0.6)
    f = frame()
    sx, sy = px(f["visual"]["x"] + f["visual"]["width"] / 2), px(f["visual"]["y"] + 16)
    drag((sx, sy), (sx, sy + px(120)))
    f = frame()
    note("drag from maximized", frame=f)
    t.ok(f["state"] == "free" and abs(f["bounds"]["width"] - normal["width"]) <= 2, "dragging a maximized window restores it (%s)" % f["bounds"])

    # 7. Aero Snap: drag the strip to the left edge, then away again.
    b.call({"do": "window.place", "visual": True, **vis})
    time.sleep(0.5)
    f = frame()
    sx, sy = strip(f["visual"])
    drag((sx, sy), (px(work["x"]) + 1, sy + px(100)), steps=24, pause=0.03)
    time.sleep(0.8)
    chord("esc")  # Snap Assist
    f = frame()
    note("snap left", frame=f)
    grab("5-snapped-left")
    t.ok(f["state"] == "snapped", "dragging to the left edge snaps (%s, arranged %s)" % (f["state"], f.get("arranged")))
    half = max(work["width"] / 2, 640)  # never under 640 (a 1024 screen's half is less)
    t.ok(f["visual"]["x"] == work["x"] and abs(f["visual"]["width"] - half) <= 2 and f["visual"]["height"] == work["height"], "snapped: the window fills the left half (%s)" % f["visual"])
    sx, sy = strip(f["visual"])
    drag((sx, sy), (sx + px(300), sy + px(120)), steps=20)
    f = frame()
    t.ok(f["state"] == "free" and abs(f["visual"]["width"] - vis["width"]) <= 2, "dragged out of Snap, it gets its size back (%s)" % f["visual"])

    # 8. Win+arrows.
    b.call({"do": "window.place", "visual": True, **vis})
    b.call({"do": "window.focus"})
    click(*strip(frame()["visual"]), 0.3)
    chord("win", "left")
    chord("esc")
    f = frame()
    note("win+left", frame=f)
    grab("6-win-left")
    t.ok(f["state"] == "snapped" and f["visual"]["x"] == work["x"], "Win+Left snaps to the left (%s)" % f["visual"])
    chord("win", "up")
    f = frame()
    note("win+up", frame=f)
    t.ok(f["state"] in ("maximized", "snapped"), "Win+Up from the left half (%s)" % f["state"])
    b.call({"do": "window.place", "visual": True, **vis})
    time.sleep(0.4)
    chord("win", "up")
    f = frame()
    note("win+up free", frame=f)
    t.ok(f["state"] == "maximized", "Win+Up maximizes (%s)" % f["state"])
    chord("win", "down")
    f = frame()
    t.ok(f["state"] == "free", "Win+Down restores (%s)" % f["state"])

    # 9. Dragging to the top edge maximizes (Aero Snap).
    b.call({"do": "window.place", "visual": True, **vis})
    time.sleep(0.4)
    f = frame()
    sx, sy = strip(f["visual"])
    drag((sx, sy), (sx, px(work["y"]) + 1), steps=24, pause=0.03)
    time.sleep(0.6)
    chord("esc")
    f = frame()
    note("snap top", frame=f)
    grab("7-snap-top")
    t.ok(f["state"] == "maximized", "dragging to the top maximizes (%s)" % f["state"])
    b.call({"do": "window.place", "visual": True, **vis})
    time.sleep(0.4)

    # 10. Full screen (F11) keeps the column; the page goes edge to edge.
    click(*strip(frame()["visual"]), 0.3)
    chord("f11")
    f = frame()
    grab("8-fullscreen")
    t.ok(f["state"] == "fullScreen", "F11: full screen (%s)" % f["state"])
    chord("f11")
    t.ok(frame()["state"] == "free", "F11 again: back")

    # 11. Another window in front: the resting shadow and dimmer buttons.
    other = subprocess.Popen([sys.executable, HELPER, "front"])
    time.sleep(4)
    f = frame()
    grab("9-inactive")
    note("inactive", frame=f, focused=b.window()["focused"])
    t.ok(not b.window()["focused"], "another window in front: ours is drawn at rest")
    other.kill()

except Exception:
    traceback.print_exc()
    t.ok(False, "the run went through to the end")

note("end")
backdrop.kill()
t.done()

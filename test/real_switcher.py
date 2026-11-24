#!/usr/bin/env python3
"""Ctrl+Tab, the tab numbers, the number keys and the bounce, with real input
from Windows (studio/01 §3.25-§3.28, §7.16; studio/06 §1.11 bounce):

1. A quick Ctrl+Tab goes straight to the tab used before, and again back.
   (Before 0.1.5 it left the switcher open: Chromium drops Ctrl's keyUp once
   Ctrl+Tab's keyDown was taken, so Ctrl let go was never heard.)
2. Held, the switcher comes up after 0.15 s; Tab and Shift+Tab move along it;
   Ctrl let go picks the card it is on.
3. Ctrl+W in the switcher closes its card; Ctrl let go after it still picks.
4. A click on a card picks it; Esc lets the switcher go; Enter picks.
5. Show tab numbers while Ctrl is held: Ctrl held, the numbers; let go, gone.
6. Ctrl+1 to Ctrl+9 switch spaces: Ctrl+2 the second space, Alt+3 the third
   tab, Alt held the tab numbers.
7. Bounce at the top and bottom: a finger dragging down at the top of a page
   stretches it past its end with the switch on (ElasticOverscroll), and it
   springs back; off, the page stays put. (Touch injected by Windows; when a
   machine refuses touch injection, said and skipped.)

Windows only. SHOTS_DIR=<folder> keeps the pictures of step 7."""
import ctypes, json, os, struct, subprocess, sys, time, zlib
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b
import ui_kit as k

if sys.platform != "win32":
    print("real_switcher.py runs on Windows only")
    sys.exit(0)

from ctypes import wintypes as wt

user32 = ctypes.WinDLL("user32", use_last_error=True)
gdi32 = ctypes.WinDLL("gdi32", use_last_error=True)
try:
    user32.SetProcessDpiAwarenessContext(ctypes.c_void_p(-4))  # per monitor v2: physical pixels
except Exception:
    pass
user32.SetForegroundWindow.argtypes = [ctypes.c_void_p]
user32.GetDC.restype = ctypes.c_void_p
user32.GetDC.argtypes = [ctypes.c_void_p]
user32.ReleaseDC.argtypes = [ctypes.c_void_p, ctypes.c_void_p]
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

subprocess.run(["powershell", "-NoProfile", "-Command", "Get-Process WWAHost, CloudExperienceHostBroker, UserOOBEBroker, wsl, wslhost -ErrorAction SilentlyContinue | Stop-Process -Force"], capture_output=True)
OUT = Path(os.environ.get("SHOTS_DIR", "shots")) / "real-switcher"
OUT.mkdir(parents=True, exist_ok=True)
t = b.T()

# real keys

VK = {"ctrl": 0x11, "shift": 0x10, "alt": 0x12, "tab": 0x09, "w": 0x57, "enter": 0x0D, "esc": 0x1B,
      "1": 0x31, "2": 0x32, "3": 0x33}


def down(key):
    user32.keybd_event(VK[key], 0, 0, 0)
    time.sleep(0.03)


def up(key):
    user32.keybd_event(VK[key], 0, 0x2, 0)
    time.sleep(0.03)


def tap(key):
    down(key)
    up(key)


def move_to(x, y):
    vx, vy = user32.GetSystemMetrics(76), user32.GetSystemMetrics(77)
    vw, vh = user32.GetSystemMetrics(78), user32.GetSystemMetrics(79)
    user32.mouse_event(0x1 | 0x8000 | 0x4000, int((x - vx) * 65535 / max(1, vw - 1)), int((y - vy) * 65535 / max(1, vh - 1)), 0, 0)
    user32.SetCursorPos(int(x), int(y))


def click(x, y):
    move_to(x, y)
    time.sleep(0.12)
    move_to(x + 3, y + 3)
    time.sleep(0.12)
    user32.mouse_event(0x2, 0, 0, 0, 0)
    time.sleep(0.05)
    user32.mouse_event(0x4, 0, 0, 0, 0)
    time.sleep(0.2)


def settle(pred, within=3.0):
    end = time.time() + within
    last = None
    while time.time() < end:
        try:
            last = pred()
        except Exception:
            last = None
        if last:
            return last
        time.sleep(0.05)
    return last


# Oriel

b.use("real-switcher")
b.launch()
WID = b.call({"do": "tabs.state"})["windows"][0]["id"]


def frame():
    return b.call({"do": "window.frame", "window": WID})["frame"]


def focus_window():
    b.call({"do": "window.focus", "window": WID})
    user32.SetForegroundWindow(ctypes.c_void_p(frame()["hwnd"]))
    time.sleep(0.3)


def focus_page():
    b.cmd("window.focusPage")
    time.sleep(0.2)


b.call({"do": "window.place", "x": 120, "y": 80, "width": 1100, "height": 720})
time.sleep(0.5)
names = ["one", "two", "three", "four"]
b.cmd("tab.go", input=f"data:text/html,<title>{names[0]}</title>{names[0]}")
b.wait_for(lambda: b.active()["title"] == names[0], what="first page")
for n in names[1:]:
    b.cmd("tab.new", url=f"data:text/html,<title>{n}</title>{n}")
    b.wait_for(lambda: b.active().get("title") == n, what=n)
    time.sleep(0.3)
focus_window()
focus_page()
title = lambda: b.active()["title"]
switcher = lambda: b.window().get("switcher")

# 1. Quick Ctrl+Tab: straight back a tab, and again.
down("ctrl"); tap("tab"); up("ctrl")
got = settle(lambda: title() == "three" and not switcher())
t.ok(got, f"a quick Ctrl+Tab: the tab used before, no switcher left ({title()}, switcher {switcher()})")
down("ctrl"); tap("tab"); up("ctrl")
got = settle(lambda: title() == "four" and not switcher())
t.ok(got, f"again: back to the first ({title()}, switcher {switcher()})")
shown = b.call({"do": "ui", "js": "!!document.querySelector('.switcher')", "root": "overlay"}).get("value")
t.ok(not shown, "the switcher's panel never showed for a quick press")

# 2. Held: the panel, Tab and Shift+Tab, Ctrl let go.
down("ctrl"); tap("tab")
time.sleep(0.5)
sw = switcher()
panel = b.call({"do": "ui", "js": "!!document.querySelector('.switcher')", "root": "overlay"}).get("value")
t.ok(sw and sw["index"] == 1 and panel, f"held: the switcher up on the tab before ({sw}, panel {panel})")
tap("tab")
time.sleep(0.2)
t.ok((switcher() or {}).get("index") == 2, f"Tab: the next card ({switcher()})")
down("shift"); tap("tab"); up("shift")
time.sleep(0.2)
sw = switcher() or {}
t.ok(sw.get("index") == 1, f"Shift+Tab: back one ({sw})")
want = sw.get("cards", [None, None])[1]
up("ctrl")
got = settle(lambda: not switcher() and b.active()["id"] == want)
t.ok(got, f"Ctrl let go: that card's tab ({title()})")

# 3. Ctrl+W in the switcher, then Ctrl let go.
focus_page()
count = len(b.window()["tabs"])
down("ctrl"); tap("tab")
time.sleep(0.5)
closing = (switcher() or {}).get("cards", [None, None])[1]
tap("w")
time.sleep(0.4)
t.ok(len(b.window()["tabs"]) == count - 1 and closing not in [x["id"] for x in b.window()["tabs"]], "Ctrl+W: the card's tab closes")
t.ok(switcher() is not None, "the switcher stays")
up("ctrl")
got = settle(lambda: not switcher())
t.ok(got, f"Ctrl let go after Ctrl+W: the switcher picks and goes ({switcher()})")

# 4. A click on a card; Esc; Enter.
focus_page()
down("ctrl"); tap("tab")
time.sleep(0.5)
sw = switcher() or {"cards": []}
r = b.call({"do": "ui", "js": "JSON.stringify((() => { const c = document.querySelectorAll('.sw-card'); const e = c[c.length - 1]; if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })())", "root": "overlay"}).get("value")
r = json.loads(r) if isinstance(r, str) else r
f = frame()
if r:
    sx, sy = (f["bounds"]["x"] + r["x"]) * f["scale"], (f["bounds"]["y"] + r["y"]) * f["scale"]
    click(sx, sy)
up("ctrl")
got = settle(lambda: not switcher() and b.active()["id"] == sw["cards"][-1])
t.ok(r and got, f"a click on the last card: its tab ({title()})")

focus_page()
before = b.active()["id"]
down("ctrl"); tap("tab")
time.sleep(0.4)
tap("esc")
time.sleep(0.2)
up("ctrl")
time.sleep(0.4)
t.ok(not switcher() and b.active()["id"] == before, "Esc: the switcher goes, the tab stays")

focus_page()
down("ctrl"); tap("tab"); tap("tab")
time.sleep(0.4)
sw = switcher() or {"cards": [], "index": 0}
want = sw["cards"][sw["index"]] if sw["cards"] else None
tap("enter")
got = settle(lambda: not switcher() and b.active()["id"] == want)
up("ctrl")
t.ok(got, f"Enter: the chosen card's tab ({title()})")

# 5. The tab numbers while Ctrl is held.
b.cmd("settings.set", id="tabs.shortcuts", value=True)
time.sleep(0.4)
focus_page()
numbers = lambda: b.call({"do": "ui", "js": "document.querySelectorAll('.sidebar .row .hint-number').length"}).get("value")
down("ctrl")
time.sleep(0.5)
held = numbers()
up("ctrl")
time.sleep(0.4)
t.ok(held and held >= 3, f"Ctrl held, with the page's keys: the numbers ({held})")
t.ok(not numbers(), "Ctrl let go: they go")

# 6. Ctrl+1 to Ctrl+9 switch spaces.
b.cmd("prefs.set", key="spaces", value=True)
time.sleep(0.3)
work = b.call({"do": "cmd", "cmd": {"do": "space.create", "name": "Work"}}).get("value")
time.sleep(0.6)
first_space = b.state()["spaces"][0]["id"]
b.cmd("space.select", id=first_space)
time.sleep(0.5)
b.cmd("prefs.set", key="spaces.commandNumbers", value=True)
time.sleep(0.3)
focus_page()
down("ctrl"); tap("2"); up("ctrl")
got = settle(lambda: b.window()["space"] == work)
t.ok(got, "on: Ctrl+2 the second space")
down("ctrl"); tap("1"); up("ctrl")
got = settle(lambda: b.window()["space"] == first_space)
t.ok(got, "on: Ctrl+1 the first space")
focus_page()
target = None
try:
    target = [x for x in b.window()["tabs"]][2]["title"]
except Exception:
    pass
down("alt"); tap("3"); up("alt")
got = settle(lambda: title() == target)
t.ok(got, f"on: Alt+3 the third tab ({title()}, wanted {target})")
focus_page()
down("alt")
time.sleep(0.5)
held = numbers()
up("alt")
time.sleep(0.4)
t.ok(held and held >= 3, f"on: Alt held shows the tab numbers ({held})")
# Alt alone let go on Windows can put a window in its menu mode: the next key must still be Oriel's.
down("ctrl"); tap("2"); up("ctrl")
got = settle(lambda: b.window()["space"] == work)
t.ok(got, "after Alt let go, Ctrl+2 still works")
b.cmd("prefs.set", key="spaces.commandNumbers", value=False)
b.cmd("space.select", id=first_space)
time.sleep(0.4)

# 7. Bounce at the top and bottom, with a finger (touch injection).


class POINTER_INFO(ctypes.Structure):
    _fields_ = [("pointerType", ctypes.c_uint32), ("pointerId", ctypes.c_uint32), ("frameId", ctypes.c_uint32), ("pointerFlags", ctypes.c_uint32),
                ("sourceDevice", ctypes.c_void_p), ("hwndTarget", ctypes.c_void_p), ("ptPixelLocation", wt.POINT), ("ptHimetricLocation", wt.POINT),
                ("ptPixelLocationRaw", wt.POINT), ("ptHimetricLocationRaw", wt.POINT), ("dwTime", wt.DWORD), ("historyCount", ctypes.c_uint32),
                ("InputData", ctypes.c_int32), ("dwKeyStates", wt.DWORD), ("PerformanceCount", ctypes.c_uint64), ("ButtonChangeType", ctypes.c_int)]


class POINTER_TOUCH_INFO(ctypes.Structure):
    _fields_ = [("pointerInfo", POINTER_INFO), ("touchFlags", ctypes.c_uint32), ("touchMask", ctypes.c_uint32), ("rcContact", wt.RECT),
                ("rcContactRaw", wt.RECT), ("orientation", ctypes.c_uint32), ("pressure", ctypes.c_uint32)]


DOWN, UPDATE, UP_ = 0x10000 | 0x2 | 0x4, 0x20000 | 0x2 | 0x4, 0x40000


def touch(flags, x, y):
    p = POINTER_TOUCH_INFO()
    p.pointerInfo.pointerType = 2  # PT_TOUCH
    p.pointerInfo.pointerId = 0
    p.pointerInfo.pointerFlags = flags
    p.pointerInfo.ptPixelLocation = wt.POINT(int(x), int(y))
    p.touchMask = 0x1 | 0x2 | 0x4  # contact, orientation, pressure
    p.rcContact = wt.RECT(int(x) - 2, int(y) - 2, int(x) + 2, int(y) + 2)
    p.orientation = 90
    p.pressure = 32000
    return user32.InjectTouchInput(1, ctypes.byref(p))


class BITMAPINFOHEADER(ctypes.Structure):
    _fields_ = [("biSize", wt.DWORD), ("biWidth", wt.LONG), ("biHeight", wt.LONG), ("biPlanes", wt.WORD), ("biBitCount", wt.WORD),
                ("biCompression", wt.DWORD), ("biSizeImage", wt.DWORD), ("biXPelsPerMeter", wt.LONG), ("biYPelsPerMeter", wt.LONG),
                ("biClrUsed", wt.DWORD), ("biClrImportant", wt.DWORD)]


def grab_column(x, y0, y1, name=None):
    """The screen's pixels down one column, (r, g, b) from y0 to y1."""
    w, h = 1, y1 - y0
    screen = user32.GetDC(None)
    mem = gdi32.CreateCompatibleDC(screen)
    bmp = gdi32.CreateCompatibleBitmap(screen, w, h)
    gdi32.SelectObject(mem, bmp)
    gdi32.BitBlt(mem, 0, 0, w, h, screen, int(x), int(y0), 0x00CC0020 | 0x40000000)
    bi = BITMAPINFOHEADER(40, w, -h, 1, 32, 0, 0, 0, 0, 0, 0)
    buf = ctypes.create_string_buffer(w * h * 4)
    gdi32.GetDIBits(mem, bmp, 0, h, buf, ctypes.byref(bi), 0)
    gdi32.DeleteObject(bmp)
    gdi32.DeleteDC(mem)
    user32.ReleaseDC(None, screen)
    d = buf.raw
    return [(d[i * 4 + 2], d[i * 4 + 1], d[i * 4]) for i in range(h)]


def first_red(col):
    for i, (r, g, bb) in enumerate(col):
        if r > 200 and g < 70 and bb < 70:
            return i
    return None


page = "data:text/html,<title>bounce</title><style>html{background:%2300c060}body{margin:0;background:%23fff}</style><div style='height:160px;background:%23e00000'></div><div style='height:3000px'>tall</div>"
b.cmd("tab.go", input=page)
b.wait_for(lambda: title() == "bounce", what="bounce page")
time.sleep(0.6)
f = frame()
S = f["scale"]
bx, by, bw, bh = f["bounds"]["x"], f["bounds"]["y"], f["bounds"]["width"], f["bounds"]["height"]
col_x = (bx + bw * 0.72) * S
y0, y1 = int(by * S), int((by + bh) * S)
fx, fy = (bx + bw * 0.72) * S, (by + bh * 0.45) * S

ok_touch = user32.InitializeTouchInjection(1, 3)  # TOUCH_FEEDBACK_NONE
if not ok_touch:
    print(f"  (touch injection refused here, error {ctypes.get_last_error()}: step 7 skipped)")
else:
    def stretch(on):
        b.cmd("settings.set", id="pages.bounce", value=on)
        time.sleep(0.6)
        focus_window()
        rest = first_red(grab_column(col_x, y0, y1))
        if not touch(DOWN, fx, fy):
            return rest, None, None, ctypes.get_last_error()
        time.sleep(0.05)
        for i in range(1, 25):
            touch(UPDATE, fx, fy + i * 10)
            time.sleep(0.016)
        time.sleep(0.05)
        during = first_red(grab_column(col_x, y0, y1))
        touch(UP_, fx, fy + 240)
        time.sleep(1.0)
        after = first_red(grab_column(col_x, y0, y1))
        return rest, during, after, 0

    rest, during, after, err = stretch(True)
    print(f"  bounce on: band at {rest}, while pulled {during}, after {after} (err {err})")
    t.ok(rest is not None and during is not None and during - rest >= 12, f"on: a finger pulling down at the top stretches the page past its end ({rest} -> {during})")
    t.ok(after is not None and abs(after - rest) <= 2, f"let go, it springs back ({after})")
    rest, during, after, err = stretch(False)
    print(f"  bounce off: band at {rest}, while pulled {during}, after {after} (err {err})")
    t.ok(rest is not None and during is not None and abs(during - rest) <= 2, f"off: the page stays put ({rest} -> {during})")

b.call({"do": "quit"})
t.done()

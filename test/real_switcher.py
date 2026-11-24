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
7. Bounce at the top and bottom: Chromium started with ElasticOverscroll,
   and the page's rule follows the switch (the stretch itself needs a
   precision touchpad, which no test machine has).

Windows only."""
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


# Oriel, asked with a time limit (on Windows the bench's pipe waits forever
# on an Oriel that doesn't answer), and every step said as it happens.

import threading
_call = b.call


def timed_call(req, timeout=15):
    out = {}

    def ask():
        try:
            out["v"] = _call(req)
        except Exception as e:
            out["e"] = e
    th = threading.Thread(target=ask, daemon=True)
    th.start()
    th.join(timeout)
    if th.is_alive():
        raise TimeoutError(f"Oriel didn't answer {req.get('do')} in {timeout}s")
    if "e" in out:
        raise out["e"]
    return out["v"]


b.call = timed_call


def say(what):
    print(f"  .. {what}", flush=True)


def log_tail(n=60):
    try:
        lines = (b.ROOT / "out" / f"bench-{b.WORLD}.log").read_text(errors="replace").splitlines()
        return "\n".join("       | " + l for l in lines[-n:])
    except Exception as e:
        return f"       (no log: {e})"


def release_all():
    for key in ("ctrl", "shift", "alt", "tab"):
        user32.keybd_event(VK[key], 0, 0x2, 0)


def watchdog():
    time.sleep(420)
    print("  !! real_switcher.py ran 7 minutes: stopping. Oriel's log:", flush=True)
    print(log_tail(), flush=True)
    release_all()
    os._exit(1)


threading.Thread(target=watchdog, daemon=True).start()

b.use("real-switcher")
b.launch()
say("launched")
import atexit
atexit.register(release_all)
WID = b.call({"do": "tabs.state"})["windows"][0]["id"]


def frame():
    return b.call({"do": "window.frame", "window": WID})["frame"]


def focus_window():
    b.call({"do": "window.focus", "window": WID})
    user32.SetForegroundWindow(ctypes.c_void_p(frame()["hwnd"]))
    time.sleep(0.3)


user32.GetForegroundWindow.restype = ctypes.c_void_p
user32.GetAncestor.restype = ctypes.c_void_p
user32.GetAncestor.argtypes = [ctypes.c_void_p, ctypes.c_uint]


def focus_page():
    """Oriel in front with the page's keys, as a person gives them: a click
    on an empty part of the page, then the page focused by Oriel too."""
    f = frame()
    x = (f["bounds"]["x"] + f["bounds"]["width"] * 0.78) * f["scale"]
    y = (f["bounds"]["y"] + f["bounds"]["height"] * 0.7) * f["scale"]
    click(x, y)
    b.cmd("window.focusPage")
    time.sleep(0.2)
    fg = user32.GetAncestor(user32.GetForegroundWindow(), 2)
    if fg != f["hwnd"]:
        print(f"  (Oriel isn't in front: {fg} != {f['hwnd']})", flush=True)
    # The ARM machine loses the first keys after a window comes up.
    for _ in range(2):
        tap("shift")


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
say('1. quick Ctrl+Tab')
down("ctrl"); tap("tab"); up("ctrl")
got = settle(lambda: title() == "three" and not switcher())
t.ok(got, f"a quick Ctrl+Tab: the tab used before, no switcher left ({title()}, switcher {switcher()})")
down("ctrl"); tap("tab"); up("ctrl")
got = settle(lambda: title() == "four" and not switcher())
t.ok(got, f"again: back to the first ({title()}, switcher {switcher()})")

# 2. Held: the panel, Tab and Shift+Tab, Ctrl let go.
say('2. held')
focus_page()
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
say('3. Ctrl+W')
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
say('4. click, Esc, Enter')
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
# Esc with Ctrl held is Ctrl+Esc, Windows' own key for Start: said, then put away.
fg = user32.GetAncestor(user32.GetForegroundWindow(), 2)
print(f"  (after Ctrl+Esc, in front: {'Oriel' if fg == frame()['hwnd'] else fg})", flush=True)
if fg != frame()["hwnd"]:
    tap("esc")
    time.sleep(0.5)

focus_page()
down("ctrl"); tap("tab"); tap("tab")
time.sleep(0.4)
sw = switcher() or {"cards": [], "index": 0}
want = sw["cards"][sw["index"]] if sw["cards"] else None
tap("enter")
got = settle(lambda: not switcher() and b.active()["id"] == want)
up("ctrl")
t.ok(got, f"Enter: the chosen card's tab ({title()})")
# The keys went with it: a quick Ctrl+Tab at once, no click in between.
before = b.active()["id"]
time.sleep(0.3)
down("ctrl"); tap("tab"); up("ctrl")
got = settle(lambda: not switcher() and b.active()["id"] != before)
t.ok(got, f"after Enter the new page has the keys: a quick Ctrl+Tab at once works ({title()})")

# 4b. Leaving Oriel with the switcher up: it goes, and Oriel stays behind.
say('4b. leaving with the switcher up')
focus_page()
down("ctrl"); tap("tab")
time.sleep(0.4)
pad = subprocess.Popen(["notepad.exe"])
hw = frame()["hwnd"]
left = settle(lambda: user32.GetAncestor(user32.GetForegroundWindow(), 2) not in (None, 0, hw), within=8)
up("ctrl")
time.sleep(1.2)
fg = user32.GetAncestor(user32.GetForegroundWindow(), 2)
if left:
    t.ok(not switcher() and fg != hw, f"another app in front: the switcher goes and Oriel doesn't come back in front ({fg} vs Oriel {hw})")
else:
    print("  (Notepad didn't come to the front here: step 4b skipped)", flush=True)
    up("ctrl")
pad.kill()
subprocess.run(["taskkill", "/F", "/IM", "notepad.exe"], capture_output=True)
time.sleep(0.5)

# 5. The tab numbers while Ctrl is held.
say('5. numbers')
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
say('6. spaces')
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

# 7. Bounce at the top and bottom. Chromium stretches the page only under a
# precision touchpad (ElasticOverscrollController: a scroll that begins
# "non-momentum" in precise pixels; a touchscreen's never does), and no test
# machine has one: what is checked is the engine's switch and the page's
# own rule, both ways.
say('7. bounce')
sw = b.call({"do": "app.switches"}).get("enableFeatures") or ""
t.ok("ElasticOverscroll" in sw.split(","), f"Chromium started with ElasticOverscroll ({sw})")
b.cmd("tab.go", input="data:text/html,<title>bounce</title><div style='height:3000px'>tall</div>")
b.wait_for(lambda: title() == "bounce", what="bounce page")
tab = b.active()["id"]
rule = lambda: b.ev(tab, "getComputedStyle(document.documentElement).overscrollBehaviorY")
b.cmd("settings.set", id="pages.bounce", value=True)
time.sleep(0.5)
t.ok(rule() == "auto", f"on: the page may stretch past its ends ({rule()})")
b.cmd("settings.set", id="pages.bounce", value=False)
time.sleep(0.5)
t.ok(rule() == "none", f"off: it stops at its ends ({rule()})")

release_all()
try:
    b.call({"do": "quit"})
except Exception:
    pass
t.done()

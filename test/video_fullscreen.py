#!/usr/bin/env python3
"""A video's own full screen on real Windows, as a person does it: a click on
the page's full screen button (a user gesture, as YouTube's), in the page and
inside a frame (an embedded player), out by Escape and by the page's button,
in a row, with the tabs in the column, across the top and across the top
shorter, from a free and a maximized window.

While the page fills the screen (studio/01 §1.22, as Chrome and Search's
WebKit do): the page covers the whole screen, nothing of the window around it
(no tab strip, no column, no card), and the pointer at the top brings no strip
of window buttons over the video. Out again: the window as it was, the page
back on its card, the window's buttons there and answering the pointer.

Pictures of the whole screen at each step (SHOTS_DIR/video), and at the end
YouTube itself, for looking at (it fails nothing: the site isn't ours).

Windows only (on a Mac full screen takes a Space)."""
import ctypes, json, os, struct, sys, threading, time, zlib
from pathlib import Path
from urllib.parse import quote
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b

if sys.platform != "win32":
    print("video_fullscreen.py runs on Windows only")
    sys.exit(0)

from ctypes import wintypes as wt

user32 = ctypes.WinDLL("user32", use_last_error=True)
gdi32 = ctypes.WinDLL("gdi32")
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

# What the test machines put over everything: the first-run screen, a WSL install prompt (ARM).
import subprocess
subprocess.run(["powershell", "-NoProfile", "-Command", "Get-Process WWAHost, CloudExperienceHostBroker, UserOOBEBroker, wsl, wslhost -ErrorAction SilentlyContinue | Stop-Process -Force"], capture_output=True)

t = b.T()
WORLD = "video-fullscreen"
OUT = Path(os.environ.get("SHOTS_DIR", "shots")) / "video"
OUT.mkdir(parents=True, exist_ok=True)


class BITMAPINFOHEADER(ctypes.Structure):
    _fields_ = [("biSize", wt.DWORD), ("biWidth", wt.LONG), ("biHeight", wt.LONG), ("biPlanes", wt.WORD), ("biBitCount", wt.WORD),
                ("biCompression", wt.DWORD), ("biSizeImage", wt.DWORD), ("biXPelsPerMeter", wt.LONG), ("biYPelsPerMeter", wt.LONG),
                ("biClrUsed", wt.DWORD), ("biClrImportant", wt.DWORD)]


def grab(name):
    """The whole screen as Windows composes it, to look at."""
    try:
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
    except Exception as e:
        print(f"  (no picture {name}: {e})")


# real input

def move_to(x, y):
    vx, vy = user32.GetSystemMetrics(76), user32.GetSystemMetrics(77)
    vw, vh = user32.GetSystemMetrics(78), user32.GetSystemMetrics(79)
    user32.mouse_event(0x1 | 0x8000 | 0x4000, int((x - vx) * 65535 / max(1, vw - 1)), int((y - vy) * 65535 / max(1, vh - 1)), 0, 0)
    user32.SetCursorPos(int(x), int(y))


def click(x, y, wait=0.3):
    move_to(x, y)
    time.sleep(0.12)
    user32.mouse_event(0x2, 0, 0, 0, 0)
    time.sleep(0.05)
    user32.mouse_event(0x4, 0, 0, 0, 0)
    time.sleep(wait)


VK = {"esc": 0x1B, "f": 0x46}


def press(k, wait=0.5):
    user32.keybd_event(VK[k], 0, 0, 0)
    time.sleep(0.03)
    user32.keybd_event(VK[k], 0, 0x2, 0)
    time.sleep(wait)


def answer(req, within=10):
    out = {}

    def ask():
        try:
            out["v"] = b.call(req)
        except Exception as e:
            out["e"] = e
    th = threading.Thread(target=ask, daemon=True)
    th.start()
    th.join(within)
    if th.is_alive():
        raise TimeoutError("Oriel didn't answer in %ss (hung?)" % within)
    if "e" in out:
        raise out["e"]
    return out["v"]


def settle(pred, within=6.0):
    end = time.time() + within
    last = None
    while time.time() < end:
        try:
            last = pred()
        except Exception:
            last = None
        if last:
            return last
        time.sleep(0.15)
    return last


def near_rect(a, want, by=2):
    return bool(a) and all(abs(a[k] - want[k]) <= by for k in ("x", "y", "width", "height"))


WID = None
S = 1.0


def frame():
    return answer({"do": "window.frame", "window": WID})["frame"]


def ui(js, root="chrome"):
    return answer({"do": "ui", "js": js, "root": root, "window": WID}).get("value")


def setting(id_, value):
    b.cmd("settings.set", id=id_, value=value)
    time.sleep(0.5)


def focus():
    try:
        answer({"do": "window.focus", "window": WID})
        user32.SetForegroundWindow(ctypes.c_void_p(frame()["hwnd"]))
    except Exception:
        pass
    time.sleep(0.3)


# The page: a "video" with its full screen button, and an embedded player in
# a frame with its own (as a site embedding YouTube). Each, once full screen,
# has its leave button in the middle of the screen.
PLAYER = ("<style>body{margin:0;font:14px sans-serif}"
          ".v{position:relative;width:360px;height:200px;background:#c0392b;color:#fff}"
          ".v:fullscreen{width:100vw;height:100vh;background:#c0392b}"
          ".v button{position:absolute;font:14px sans-serif}"
          ".v .go{right:8px;bottom:8px;width:110px;height:34px}"
          ".v .out{display:none;left:50%;top:50%;width:160px;height:60px;margin:-30px 0 0 -80px}"
          ".v:fullscreen .out{display:block}.v:fullscreen .go{display:none}</style>"
          "<div class=v id=v><button class=go id=go onclick=\"document.getElementById('v').requestFullscreen()\">Full screen</button>"
          "<button class=out id=out onclick=\"document.exitFullscreen()\">Leave</button></div>")
PAGE = ("<title>video</title><body style='margin:0;padding:20px;background:#fff'>" + PLAYER +
        "<iframe id=f allow='fullscreen' allowfullscreen style='display:block;margin-top:16px;width:380px;height:220px;border:0' srcdoc=\""
        + PLAYER.replace('"', "&quot;").replace("#c0392b", "#1e6091") + "\"></iframe>")
URL = "data:text/html," + quote(PAGE)


def where_in_page(js_rect):
    """A rect the page measured (CSS px in the page) to a point on the screen (physical px)."""
    f = frame()
    page = next((p["rect"] for p in f["pages"]), None)
    if not page or not js_rect:
        return None
    return ((f["bounds"]["x"] + page["x"] + js_rect["x"] + js_rect["width"] / 2) * S,
            (f["bounds"]["y"] + page["y"] + js_rect["y"] + js_rect["height"] / 2) * S)


def button_rect(which, name):
    if which == "page":
        js = f"JSON.stringify(document.getElementById('{name}').getBoundingClientRect())"
    else:
        js = ("JSON.stringify((() => { const f = document.getElementById('f').getBoundingClientRect();"
              f" const g = document.getElementById('f').contentDocument.getElementById('{name}').getBoundingClientRect();"
              " return { x: f.x + g.x, y: f.y + g.y, width: g.width, height: g.height } })())")
    return json.loads(b.ev(TAB, js))


def in_full(which):
    js = "!!document.fullscreenElement" if which == "page" else "!!document.getElementById('f').contentDocument.fullscreenElement"
    return b.ev(TAB, js)


def page_covers_screen():
    """The page alone over the whole screen: the window covers the display and
    the page's view covers the window."""
    f = frame()
    pages = f["pages"]
    whole = {"x": 0, "y": 0, "width": f["bounds"]["width"], "height": f["bounds"]["height"]}
    return f if (near_rect(f["bounds"], f["display"], 1) and len(pages) >= 1 and near_rect(pages[0]["rect"], whole, 1)) else None


def page_on_card():
    c = json.loads(ui("JSON.stringify(document.querySelector('.card').getBoundingClientRect())"))
    pages = frame()["pages"]
    return len(pages) == 1 and all(abs(pages[0]["rect"][k] - round(c[k])) <= 1.01 for k in ("x", "y", "width", "height"))


def buttons_answer():
    """The window's three buttons on screen, each the element under its middle."""
    js = ("JSON.stringify([...document.querySelectorAll('.window > .caption-buttons button')].map(b => {"
          " const r = b.getBoundingClientRect(); const e = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);"
          " return { w: r.width, h: r.height, x: r.x, right: innerWidth - r.right, top: r.y, hit: !!e && b.contains(e) } }))")
    got = json.loads(ui(js) or "[]")
    return got if len(got) == 3 and all(g["hit"] and g["w"] > 0 and g["h"] > 0 for g in got) else None


def tabs_clear_of_buttons():
    """Across the top, the strip's tabs end before the buttons begin."""
    js = ("JSON.stringify((() => { const btn = document.querySelector('.window > .caption-buttons')?.getBoundingClientRect();"
          " const tabs = [...document.querySelectorAll('.tabbar .strip-tab, .tabbar [data-tab]')].map(e => e.getBoundingClientRect().right);"
          " return { buttons: btn ? btn.x : null, tabs: tabs.length ? Math.max(...tabs) : null } })())")
    got = json.loads(ui(js))
    return got, (got["buttons"] is None or got["tabs"] is None or got["tabs"] <= got["buttons"] + 0.5)


def no_strip_at_top():
    """The pointer at the top of the screen over a video brings nothing down."""
    f = frame()
    d = f["display"]
    answer({"do": "window.pointer", "x": d["x"] + d["width"] / 2, "y": d["y"]})
    time.sleep(0.7)
    e = answer({"do": "window.edges", "window": WID})
    answer({"do": "window.pointer", "x": None, "y": None})
    return e


LAYOUTS = (("side", "left", False), ("top", "top", False), ("top-short", "top", True))

try:
    b.use(WORLD, wipe=True)
    b.launch()
    WID = b.call({"do": "tabs.state"})["windows"][0]["id"]
    f0 = frame()
    S = f0["scale"]
    work = f0["workArea"]
    P = {"x": work["x"] + 120, "y": work["y"] + 90, "width": min(1000, work["width"] - 300), "height": min(640, work["height"] - 200)}
    print(f"screen {f0['display']}, work area {work}, scale {S}, the window at {P}")
    press("esc", 0.4)  # a Start menu left open (the ARM images start with it)
    b.cmd("tab.go", window=WID, input=URL)
    b.wait_for(lambda: (b.active() or {}).get("title") == "video", what="page")
    TAB = b.active()["id"]
    b.wait_for(lambda: b.ev(TAB, "!!document.getElementById('f').contentDocument?.getElementById('go')"), what="the frame's player")

    for name, layout, short in LAYOUTS:
        setting("tabs.layout", layout)
        setting("tabs.compact", short)
        # a second tab, so the strip has tabs to stretch toward the buttons
        if name == "side":
            b.cmd("tab.new", window=WID, url="data:text/html,<title>other</title>", background=True)
            time.sleep(0.8)
            b.cmd("tab.select", window=WID, id=TAB)
            time.sleep(0.5)
        for base in ("free", "maximized"):
            answer({"do": "window.place", "visual": True, "window": WID, **P})
            time.sleep(0.4)
            if base == "maximized":
                b.cmd("window.maximize", window=WID)
                settle(lambda: frame()["state"] == "maximized", 4)
            focus()
            before = frame()
            for which in ("page", "frame"):
                for exit_by in ("Escape", "button"):
                    tag = f"{name}-{base}-{which}-{exit_by}"
                    answer({"do": "window.trace", "window": WID, "on": True})
                    p = where_in_page(button_rect(which, "go"))
                    click(*p, 0.2)
                    entered = settle(lambda: in_full(which), 4)
                    if not t.ok(entered, f"{tag}: a click on the player's button puts it in full screen"):
                        continue
                    f = settle(page_covers_screen, 4)
                    if not t.ok(f, f"{tag}: the video alone over the whole screen (no strip, column or card)"):
                        g = frame()
                        print(f"       window {g['state']} {g['bounds']}, display {g['display']}, pages {g['pages']}")
                        tr = [x for x in answer({"do": "window.trace", "window": WID, "on": True})["trace"] if not x.startswith("0x") and not x.startswith("syscommand")]
                        print("       trace: " + "\n              ".join(tr[-16:]))
                    grab(f"{tag}-1-in")
                    e = no_strip_at_top()
                    t.ok(not e["reveal"] and not e["peek"], f"{tag}: the pointer at the top brings no strip over the video (reveal {e['reveal']}, peek {e['peek']})")
                    if exit_by == "Escape":
                        press("esc", 0.6)
                        if in_full(which):
                            press("esc", 0.6)  # Press Esc twice, when on
                    else:
                        d = frame()["display"]
                        click(d["x"] * S + d["width"] * S / 2, d["y"] * S + d["height"] * S / 2, 0.2)
                    t.ok(settle(lambda: not in_full(which), 5), f"{tag}: out of full screen")
                    want = before["state"]
                    back = settle(lambda: (lambda g: g if g["state"] == want and (near_rect(g["visual"], P) if want == "free" else near_rect(g["visual"], g["workArea"], 10)) else None)(frame()), 5)
                    g = frame()
                    t.ok(back, f"{tag}: the window {want} again as before (it is {g['state']}, {g['visual']})")
                    t.ok(settle(page_on_card, 4), f"{tag}: the page back on its card")
                    btns = settle(buttons_answer, 4)
                    t.ok(btns, f"{tag}: the window's three buttons there and answering the pointer ({btns or ui('JSON.stringify([...document.querySelectorAll(\".window > .caption-buttons button\")].length)')})")
                    if layout == "top":
                        got, clear = tabs_clear_of_buttons()
                        t.ok(clear, f"{tag}: the tabs across the top end before the buttons ({got})")
                    grab(f"{tag}-2-out")
                    answer({"do": "window.trace", "window": WID, "on": False})
                    time.sleep(0.4)
            # In and out fast, as a person does on YouTube (f, f, Esc...).
            for i in range(3):
                p = where_in_page(button_rect("frame", "go"))
                if p:
                    click(*p, 0.1)
                settle(lambda: in_full("frame"), 3)
                time.sleep(0.25)
                d = frame()["display"]
                click(d["x"] * S + d["width"] * S / 2, d["y"] * S + d["height"] * S / 2, 0.1)
                settle(lambda: not in_full("frame"), 3)
            time.sleep(1.0)
            g = frame()
            want = before["state"]
            t.ok(g["state"] == want and settle(page_on_card, 3) and settle(buttons_answer, 3),
                 f"{name}-{base}: in and out three times fast, the window as before with its buttons ({g['state']})")
            grab(f"{name}-{base}-3-fast")
            if base == "maximized":
                b.cmd("window.maximize", window=WID)  # the button again: restore
                settle(lambda: frame()["state"] == "free", 4)

    # What floats over the page (the password question at the page's top
    # right) follows the window into a maximize and full screen and back:
    # it went off the screen's left, or out of the window.
    answer({"do": "window.place", "visual": True, "window": WID, **P})
    time.sleep(0.4)
    focus()
    f = frame()
    W, H = f["bounds"]["width"], f["bounds"]["height"]
    q = {"x": W - 12 - 300, "y": 12, "width": 300, "height": 90}
    b.cmd("overlay.region", window=WID, rect=q, focus=False)
    for how in ("maximized", "fullScreen", "free"):
        if how == "maximized":
            b.cmd("window.maximize", window=WID)
        elif how == "fullScreen":
            b.cmd("window.fullScreen", window=WID, on=True)
        else:
            b.cmd("window.fullScreen", window=WID, on=False)
            settle(lambda: frame()["state"] == "maximized", 4)
            b.cmd("window.maximize", window=WID)
        settle(lambda: frame()["state"] == how, 5)
        time.sleep(0.6)
        g = frame()
        r = answer({"do": "window.edges", "window": WID})["region"]
        w2 = g["bounds"]["width"]
        t.ok(r and abs((w2 - r["x"] - r["width"]) - 12) <= 2 and abs(r["y"] - 12) <= 2 and r["x"] >= 0,
             f"{how}: the question keeps its place at the top right ({r}, window {w2} wide)")
    b.cmd("overlay.region", window=WID, rect=None, focus=False)

    # YouTube itself, to look at: f for full screen, Escape out.
    try:
        setting("tabs.layout", "top")
        setting("tabs.compact", True)
        answer({"do": "window.place", "visual": True, "window": WID, **P})
        b.cmd("tab.go", window=WID, input="https://www.youtube.com/watch?v=jNQXAC9IVRw")
        time.sleep(8)
        focus()
        f = frame()
        page = f["pages"][0]["rect"] if f["pages"] else None
        if page:
            click((f["bounds"]["x"] + page["x"] + page["width"] * 0.35) * S, (f["bounds"]["y"] + page["y"] + page["height"] * 0.35) * S, 0.6)
        press("f", 2.0)
        yt = b.active()["id"]
        inside = b.ev(yt, "!!document.fullscreenElement")
        covers = page_covers_screen()
        print(f"  YouTube: in full screen {inside}, the page over the whole screen {bool(covers)}")
        grab("youtube-1-in")
        no = no_strip_at_top()
        print(f"  YouTube: pointer at the top, reveal {no['reveal']}, peek {no['peek']}")
        press("esc", 0.6)
        if b.ev(yt, "!!document.fullscreenElement"):
            press("esc", 0.6)
        time.sleep(1.0)
        grab("youtube-2-out")
        print(f"  YouTube out: {frame()['state']}, buttons {bool(buttons_answer())}")
    except Exception as e:
        print(f"  (YouTube not looked at: {e})")
finally:
    try:
        b.quit()
    except Exception:
        pass
t.done()

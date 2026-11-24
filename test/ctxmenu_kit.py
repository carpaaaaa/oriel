"""What the page menu's tests share (not a test itself): a local site with
text, links, a picture, a field and empty room; a real right click on any of
it; the menu read from the main process and from the overlay's DOM; picks
made the way a hand makes them; the clipboard of whoever works beside the
test saved first and given back at the end.

    import ctxmenu_kit as k
    k.world("ctxmenu-text")
    page = k.page("/ctx")
    k.right_click(page, "#text")
    k.labels()  # ["Copy", "Copy Link to Highlight", "—", ...]
"""
import atexit
import json
import os
import struct
import sys
import threading
import time
import zlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b  # noqa: E402

SHOTS = os.environ.get("SHOTS_DIR")
# A test window covered by other windows on the Mac's screen is "occluded":
# Chromium hides its pages and drops their input. Not for these tests.
FRAMES = ["--disable-gpu-vsync", "--disable-frame-rate-limit", "--disable-backgrounding-occluded-windows"]


def _png(w, h, rgb):
    raw = b"".join(b"\x00" + bytes(rgb) * w for _ in range(h))
    chunk = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")


PICTURE = _png(120, 80, (226, 120, 60))

PAGE = """<!doctype html><meta charset=utf-8><title>ctx</title>
<style>body{margin:0;font:16px/1.4 sans-serif} p,img,textarea{margin:16px 20px;display:block} #empty{height:200px}
/* On a Mac, Chromium selects the words under a right click (Windows doesn't): not on these. */
#link,#mail,#imglink{-webkit-user-select:none;user-select:none}</style>
<p id=text>Gentle words to pick from this page</p>
<p><a id=link href="/target?utm_source=news&amp;id=7&amp;fbclid=abc#top">Read the story</a></p>
<p><a id=mail href="mailto:hello@example.com?subject=hi">Write to us</a> <a id=link2 href="/target?two">Second story</a></p>
<img id=img src="/pic.png" width=120 height=80 alt="">
<p><a id=imglink href="/target?from=img"><img src="/pic.png" width=60 height=40 alt="" style="margin:0"></a></p>
<textarea id=area spellcheck=true style="width:300px;height:54px"></textarea>
<div id=rich contenteditable=true style="margin:16px 20px;width:300px;min-height:30px;border:1px solid #ccc"></div>
<div id=empty></div>"""


class Site(BaseHTTPRequestHandler):
    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/pic.png":
            data, kind = PICTURE, "image/png"
        else:
            if path == "/ctx":
                body = PAGE
            elif path == "/search":
                body = "<title>results</title><body>results"
            else:
                body = f"<title>{path.strip('/') or 'home'}</title><body>{path}"
            data, kind = body.encode(), "text/html; charset=utf-8"
        self.send_response(200)
        self.send_header("Content-Type", kind)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *a):
        pass


_server = ThreadingHTTPServer(("127.0.0.1", 0), Site)
threading.Thread(target=_server.serve_forever, daemon=True).start()
BASE = f"http://127.0.0.1:{_server.server_address[1]}"


def url(path):
    return BASE + path


def world(name, look="light", **prefs):
    """A world of its own; searches go to this site (search.custom), and the
    real engines' hosts never leave the machine."""
    b.use(name)
    f = b.folder() / "prefs.json"
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text(json.dumps({"search.engine": "custom", "search.custom": BASE + "/search?q=%s", **prefs}))
    b.launch(*FRAMES, env={"SEARCH_LOOK": look})
    time.sleep(0.8)
    b.call({"do": "ctxmenu.clipboard", "op": "save"})
    atexit.register(lambda: _restore())
    b.call({"do": "ctxmenu.offline", "hosts": ["www.google.com", "lens.google.com", "duckduckgo.com", "www.bing.com", "www.ecosia.org",
                                                 "www.startpage.com", "kagi.com", "search.brave.com", "www.qwant.com"]})


def _restore():
    try:
        b.call({"do": "ctxmenu.clipboard", "op": "restore"}, timeout=5)
    except Exception:
        pass


def done(t):
    _restore()
    t.done()


def tabs_state():
    return b.state()


def tab(id):
    return next((t for t in b.state()["tabs"] if t["id"] == id), None)


def page(path="/ctx"):
    id = b.cmd("tab.open", url=url(path), foreground=True)
    b.wait_for(lambda: (t := tab(id)) and not t["loading"] and t["title"], what=f"page {path}")
    time.sleep(0.4)
    return id


def page_rect(id=None):
    return b.call({"do": "ctxmenu.page", **({"id": id} if id else {})})["rect"]


def element(id, sel):
    return json.loads(b.ev(id, f"JSON.stringify(document.querySelector({json.dumps(sel)}).getBoundingClientRect())"))


def point(id, sel, dx=None, dy=None):
    """A point of an element, in the window's coordinates."""
    r, p = element(id, sel), page_rect(id)
    return (round(p["x"] + r["x"] + (dx if dx is not None else r["width"] / 2)), round(p["y"] + r["y"] + (dy if dy is not None else r["height"] / 2)))


def last():
    return b.call({"do": "ctxmenu.last"})


LAST_CLICK = [None]


def right_click_at(x, y, wait=True):
    """A right button pressed and let go there, as a hand does: the view on
    top under the point gets it (bench `mouse`)."""
    LAST_CLICK[0] = (x, y)
    before = (last()["menu"] or {}).get("seq", 0)
    b.mouse(x, y, button="right")
    if wait:
        shown = lambda: (m := last()["menu"]) and m["seq"] > before and dom_items()
        try:
            b.wait_for(shown, within=3, what="the page menu")
        except AssertionError:
            # A page hidden for a moment by the screen (see FRAMES) missed it.
            b.mouse(x, y, button="right")
            b.wait_for(shown, within=5, what="the page menu")
        time.sleep(0.25)
    return (x, y)


def right_click(id, sel, dx=None, dy=None, wait=True):
    return right_click_at(*point(id, sel, dx, dy), wait=wait)


def select(id, sel):
    b.ev(id, f"(() => {{ const r = document.createRange(); r.selectNodeContents(document.querySelector({json.dumps(sel)}));"
             " const s = getSelection(); s.removeAllRanges(); s.addRange(r); return s.toString() })()")


def flat_labels(entries):
    return ["—" if e == "—" else e["label"] + (" (off)" if not e["enabled"] else "") + (" ▸" if e.get("submenu") else "") for e in entries]


def labels():
    """The menu as the main process built it."""
    return flat_labels(last()["menu"]["entries"])


def entry(label, entries=None):
    for e in entries if entries is not None else last()["menu"]["entries"]:
        if e != "—" and e["label"] == label:
            return e
    return None


def ojs(expr):
    v = b.ui(f"JSON.stringify((() => {{ {expr} }})())", root="overlay")
    return json.loads(v) if v else None


def dom_items(menu=0):
    """The rows drawn in the overlay, as on screen."""
    return ojs(f"const m = document.querySelectorAll('.ctx-host .menu')[{menu}]; if (!m) return null;"
               " return [...m.children].map(e => e.classList.contains('menu-sep') ? '—' : e.dataset.label + (e.classList.contains('off') ? ' (off)' : ''))")


def menu_rect(menu=0):
    return ojs(f"const m = document.querySelectorAll('.ctx-host .menu')[{menu}]; if (!m) return null; const r = m.getBoundingClientRect(); return {{ x: r.x, y: r.y, w: r.width, h: r.height }}")


def is_open():
    return bool(last()["open"])


def pick(label, menu=0, wait=0.6):
    """Pointer over the row, then released on it."""
    ok = ojs(f"const m = document.querySelectorAll('.ctx-host .menu')[{menu}]; const e = m && [...m.querySelectorAll('.menu-item')].find(x => x.dataset.label === {json.dumps(label)});"
             " if (!e) return false; e.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true })); e.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0 })); return true")
    if not ok:
        raise AssertionError(f"no row {label!r} in menu {menu}: {dom_items(menu)}")
    time.sleep(wait)


def hover(label, menu=0):
    ojs(f"const m = document.querySelectorAll('.ctx-host .menu')[{menu}]; const e = [...m.querySelectorAll('.menu-item')].find(x => x.dataset.label === {json.dumps(label)});"
        " e.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true })); return true")
    time.sleep(0.35)


def key(k):
    """A key as the overlay hears it."""
    ojs(f"window.dispatchEvent(new KeyboardEvent('keydown', {{ key: {json.dumps(k)}, bubbles: true }})); return true")
    time.sleep(0.15)


def hot(menu=0):
    return ojs(f"const m = document.querySelectorAll('.ctx-host .menu')[{menu}]; const e = m && m.querySelector('.menu-item.hot'); return e ? e.dataset.label : null")


def clipboard():
    return b.call({"do": "ctxmenu.clipboard"})


def clear_clipboard():
    b.call({"do": "ctxmenu.clipboard", "op": "clear"})


def log(**kw):
    return b.call({"do": "ctxmenu.log", **kw})["log"]


def shot(name):
    if SHOTS:
        Path(SHOTS).mkdir(parents=True, exist_ok=True)
        was = is_open()
        hot_row = hot()
        if b.shot(Path(SHOTS) / f"{name}.png") is None and was and not is_open() and LAST_CLICK[0]:
            # The screen gave no picture (display asleep): the window lost its
            # focus with it, and the menu went, as it should. Open it again.
            print("  (the window lost its focus with the screen: the menu again)")
            right_click_at(*LAST_CLICK[0])
            if hot_row:
                hover(hot_row)


def style_check(t):
    """The rows as the menus are drawn (studio/02 §4.6): 24 high, corners of
    12, the highlight 5 in with corners of 7, in grey, never blue."""
    first = ojs("const m = document.querySelector('.ctx-host .menu'); const i = [...m.querySelectorAll('.menu-item')].find(x => !x.classList.contains('off'));"
                " i.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true })); return i.dataset.label")
    time.sleep(0.25)
    s = ojs("const m = document.querySelector('.ctx-host .menu'); const ms = getComputedStyle(m); const i = m.querySelector('.menu-item.hot'); const is = getComputedStyle(i);"
            " const r = m.getBoundingClientRect(), ri = i.getBoundingClientRect(); const sep = m.querySelector('.menu-sep');"
            " return { radius: ms.borderTopLeftRadius, pad: ms.paddingTop, row: ri.height, inset: ri.x - r.x, hr: is.borderTopLeftRadius, hot: is.backgroundColor,"
            " sep: sep ? sep.getBoundingClientRect().height : 11, ground: ms.backgroundColor, accel: (() => { const a = m.querySelector('.menu-accel'); return a ? getComputedStyle(a).color : null })() }")
    import re
    nums = [float(x) for x in re.findall(r"[\d.]+", s["hot"])]
    grey = len(nums) >= 3 and nums[0] == nums[1] == nums[2]
    t.ok(s["radius"] == "12px" and s["pad"] == "5px" and abs(s["row"] - 24) < 0.6 and abs(s["sep"] - 11) < 0.6,
         f"the menus' measures: corners 12, 5 above, rows 24, separators 11 ({s})")
    t.ok(abs(s["inset"] - 5) < 0.6 and s["hr"] == "7px", f"the highlight 5 in, corners of 7 (on {first!r})")
    t.ok(grey and len(nums) == 4 and 0 < nums[3] < 0.2, f"the highlight is a neutral grey wash, never the system's blue: {s['hot']}")
    if s["accel"]:
        a = [float(x) for x in re.findall(r"[\d.]+", s["accel"])]
        t.ok(a[0] == a[1] == a[2] and (len(a) < 4 or a[3] < 0.8), f"keys at the end in grey: {s['accel']}")
    # Let the pointer go off the row again.
    ojs("const m = document.querySelector('.ctx-host .menu'); m.dispatchEvent(new PointerEvent('pointerleave', { bubbles: false })); return 1")
    return s


def near_click(t, at, what="the menu"):
    r = menu_rect()
    room = last()["menu"]["room"]
    inside = r["x"] >= 0 and r["y"] >= 0 and r["x"] + r["w"] <= room["w"] and r["y"] + r["h"] <= room["h"]
    t.ok(r and abs(r["x"] - at[0]) <= 2 and abs(r["y"] - at[1]) <= 2 and inside, f"{what} opens at the click {at}, inside the window: {r}")

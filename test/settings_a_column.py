#!/usr/bin/env python3
"""Settings › Appearance, the column and the strip, changed as Settings
changes them and measured (studio/08 area A; Prefs.swift, Fold.swift,
Design.swift Metrics/Motion): Tabs on the right (sidebar.position), Shorter
tab bar (tabs.compact), Ctrl+S makes the column icons only
(sidebar.foldIcons), Hide the column until the pointer reaches the edge
(sidebar.hides), Slide the column in and out (sidebar.slides) and the
column going back, the strip folded coming down from the top, A loading
line with the tabs hidden (fold.loadingLine). The pointer is the bench's."""
import json
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b
import ui_kit as k


class Slow(BaseHTTPRequestHandler):
    """A page that takes its time, for the loading line."""
    def do_GET(self):
        time.sleep(4 if self.path.startswith("/slow") else 0)
        body = b"<title>slow</title><body>slow"
        self.send_response(200)
        self.send_header("Content-Type", "text/html")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a):
        pass


srv = ThreadingHTTPServer(("127.0.0.1", 0), Slow)
threading.Thread(target=srv.serve_forever, daemon=True).start()
SITE = f"http://127.0.0.1:{srv.server_port}"

b.use("settings-a-column")
b.launch(*k.FRAMES, env={"SEARCH_LOOK": "light"})

t = b.T()


def setting(id_, value):
    b.cmd("settings.set", id=id_, value=value)
    time.sleep(0.5)


def frame():
    return b.call({"do": "window.frame"})["frame"]


def edges():
    return b.call({"do": "window.edges"})


def pointer(x, y=None):
    b.call({"do": "window.pointer", "x": x, "y": y})


def settle(pred, what, within=4):
    try:
        return b.wait_for(pred, within=within, what=what)
    except AssertionError:
        return None


b.cmd("tab.go", input="data:text/html,<title>page</title><body>page")
b.wait_for(lambda: b.active()["title"] == "page", what="page")
v = frame()["visual"]
away = (v["x"] + v["width"] / 2, v["y"] + v["height"] / 2)
pointer(*away)
W = lambda: k.rect(".window")

# Tabs › on the right (sidebar.position): the column at the window's right, the page's card on its left.
setting("tabs.layout", "right")
side, card, win = k.wrect(".sidebar"), k.wrect(".card"), W()
t.ok(side and k.near(side["x"] + side["w"], win["w"]) and k.near(side["w"], 232), f"on the right: the column against the window's right edge ({side})")
t.ok(card and k.near(card["x"], 8) and k.near(card["x"] + card["w"], win["w"] - 232), f"…the card from 8 to the column ({card})")
setting("tabs.layout", "left")
t.ok(k.near(k.wrect(".sidebar")["x"], 0) and k.near(k.wrect(".card")["x"], 232), "back on the left")

# Shorter tab bar (tabs.compact): with the tabs across the top, 36 instead of 52; the column keeps its band.
setting("tabs.layout", "top")
t.ok(k.near(k.wrect(".tabbar")["h"], 52) and k.near(k.wrect(".card")["y"], 52), "tabs across the top: a strip of 52")
setting("tabs.compact", True)
strip, band, card = k.wrect(".tabbar"), k.wrect(".strip-band"), k.wrect(".card")
t.ok(k.near(strip["h"], 36) and k.near(band["y"], 3) and k.near(band["h"], 30), f"Shorter tab bar: 36, the band of 30 three from the top ({strip}, {band})")
t.ok(k.near(card["y"], 36), f"…the page right under it ({card['y']})")
setting("tabs.layout", "left")
t.ok(k.near(k.wrect(".band")["h"], 52), "with the column it changes nothing: the band stays 52")
setting("tabs.compact", False)

# The strip across the top, folded (Ctrl+S): it comes down over the page when the pointer rests at the top.
setting("tabs.layout", "top")
b.cmd("sidebar.fold", folded=True)
time.sleep(0.4)
v = frame()["visual"]
t.ok(not k.rect(".tabbar"), "the strip folded away")
pointer(v["x"] + 300, v["y"] + 2)
time.sleep(0.08)
t.ok(not edges()["peek"], "at the top it waits a moment (the way to the window's title)")
out = settle(lambda: edges()["peek"], "the strip out", within=2)
strip = k.js("const e = document.querySelector('.fold-out.top .tabbar'); return e && e.getBoundingClientRect().height", root="overlay") if out else None
region = edges()["region"]
t.ok(out and strip and k.near(strip, 52) and region["height"] == 52 + 40 and region["width"] == v["width"],
     f"…then the strip comes down over the page, the window's buttons in it ({strip}, {region})")
pointer(v["x"] + 300, v["y"] + 30)
time.sleep(0.3)
t.ok(edges()["peek"], "over it, it stays")
pointer(*away)
t.ok(settle(lambda: not edges()["peek"] and not edges()["going"], "back", within=2), "the pointer gone, it goes back up")
b.cmd("sidebar.fold", folded=False)
setting("tabs.layout", "left")

# Folded with Ctrl+S, the column goes back on the fold-in spring; with Slide the column in and out, on ease-in 0.22, out on ease-out 0.26.
b.cmd("sidebar.fold", folded=True)
time.sleep(0.4)
v = frame()["visual"]


def timing(which):
    """How the fold-out last moved (its own record: the animations end before a look)."""
    v_ = k.js(f"return document.documentElement.dataset.fold{which.capitalize()} || null", root="overlay")
    return (v_ or "").split(" ", 1) if v_ else None


for slides in (False, True):
    setting("sidebar.slides", slides)
    k.js("delete document.documentElement.dataset.foldOut; delete document.documentElement.dataset.foldBack; return 1", root="overlay")
    pointer(v["x"] + 2, v["y"] + 300)
    settle(lambda: edges()["peek"], "out", within=2)
    a_out = settle(lambda: timing("out"), "its slide", within=2)
    pointer(*away)
    gone_ = settle(lambda: not edges()["going"] and not edges()["peek"], "gone", within=2)
    a_in = timing("back")
    gone = settle(lambda: not edges()["going"] and not edges()["peek"], "gone", within=2)
    if slides:
        t.ok(a_out and a_out[0] == "260" and a_out[1].startswith("cubic-bezier(0, 0, .58, 1)"), f"Slide the column in and out: out on ease-out 0.26 ({a_out})")
        t.ok(a_in and a_in[0] == "220" and a_in[1].startswith("cubic-bezier(.42, 0, 1, 1)"), f"…back on ease-in 0.22 ({a_in})")
    else:
        t.ok(a_out and a_out[1].startswith("linear("), f"out on the fold-out spring ({a_out})")
        t.ok(a_in and a_in[1].startswith("linear(") and 150 <= float(a_in[0]) <= 260, f"the pointer gone, it slides back on the fold-in spring, not just gone ({a_in})")
    t.ok(gone, "…and the overlay is let go once it has")
# Met on its way back, it turns round and comes out whole.
pointer(v["x"] + 2, v["y"] + 300)
settle(lambda: edges()["peek"], "out", within=2)
time.sleep(0.4)
pointer(*away)
settle(lambda: edges()["going"], "going back", within=2)
pointer(v["x"] + 2, v["y"] + 300)
settle(lambda: edges()["peek"], "out again", within=2)
time.sleep(0.6)
x = k.js("const e = document.querySelector('.fold-out'); return e && e.getBoundingClientRect().x", root="overlay")
t.ok(x is not None and abs(x) <= 0.5, f"met on its way back, it turns round and rests out ({x})")
pointer(*away)
settle(lambda: not edges()["going"] and not edges()["peek"], "gone", within=2)
setting("sidebar.slides", False)
b.cmd("sidebar.fold", folded=False)
time.sleep(0.3)

# Ctrl+S makes the column icons only (sidebar.foldIcons): icons and back, never folded.
setting("sidebar.foldIcons", True)
b.cmd("sidebar.toggle")
time.sleep(0.6)
w = b.window()["sidebar"]
t.ok(w["icons"] and not w["folded"] and k.near(k.wrect(".sidebar")["w"], 52), f"Ctrl+S: the column of icons, not folded away ({w})")
t.ok(k.near(k.wrect(".card")["x"], 52), "…the page beside it")
b.cmd("sidebar.toggle")
time.sleep(0.6)
t.ok(not b.window()["sidebar"]["icons"] and k.near(k.wrect(".sidebar")["w"], 232), "Ctrl+S again: the titles back")
setting("sidebar.foldIcons", False)
b.cmd("sidebar.toggle")
time.sleep(0.4)
t.ok(b.window()["sidebar"]["folded"], "switched off, Ctrl+S folds again")
b.cmd("sidebar.toggle")
time.sleep(0.4)

# Hide the column until the pointer reaches the edge (sidebar.hides): it rests folded, the
# page takes the window; 10 from the edge after 0.05 s it comes out; Ctrl+S keeps it out.
setting("sidebar.hides", True)
w = b.window()["sidebar"]
t.ok(w["folded"] and not k.rect(".sidebar") and k.near(k.wrect(".card")["x"], 0), f"on: the column rests folded, the page takes the whole window ({w['folded']})")
v = frame()["visual"]
pointer(v["x"] + 8, v["y"] + 300)
time.sleep(0.02)
early = edges()["peek"]
out = settle(lambda: edges()["peek"], "out", within=2)
t.ok(not early and out, "8 from the edge (10 when it rests folded) it comes out after a moment")
pointer(*away)
settle(lambda: not edges()["peek"] and not edges()["going"], "back", within=2)
b.cmd("sidebar.toggle")
time.sleep(0.5)
t.ok(not b.window()["sidebar"]["folded"] and k.rect(".sidebar"), "Ctrl+S keeps the tabs out")
b.cmd("sidebar.toggle")
time.sleep(0.4)
setting("sidebar.hides", False)
t.ok(not b.window()["sidebar"]["folded"] and k.rect(".sidebar"), "off: the column back beside the page")

# A loading line with the tabs hidden (fold.loadingLine): folded, a line along the page's top while it loads.
line = lambda: k.js("const e = document.querySelector('.loading-line'); if (!e) return null; const r = rel(e.getBoundingClientRect()); return { x: r.x, y: r.y, w: r.width, h: r.height }")
b.cmd("sidebar.fold", folded=True)
time.sleep(0.3)
b.cmd("tab.go", input=SITE + "/slow1")
time.sleep(0.8)
t.ok(line() is None, "off (the Mac's default): no line")
b.wait_for(lambda: not b.active()["loading"], within=10, what="loaded")
setting("fold.loadingLine", True)
b.cmd("tab.go", input=SITE + "/slow2")
got = settle(line, "the line", within=3)
card = k.wrect(".card")
t.ok(got and k.near(got["h"], 2) and k.near(got["y"] + 2, card["y"]) and k.near(got["x"], card["x"] + 10), f"on, folded: 2 along the page's top while it loads, clear of the corners ({got}, card {card})")
colours = k.js("const s = document.querySelector('.loading-line span'); const probe = document.createElement('i'); probe.style.color = 'var(--ink)'; document.body.append(probe); const ink = getComputedStyle(probe).color; probe.remove(); return s ? { line: getComputedStyle(s).backgroundColor, ink } : null")
t.ok(colours and colours["line"] == colours["ink"] and colours["ink"] in ("rgb(23, 23, 23)",), f"light: the line in the text's colour, dark, not the accent ({colours})")
dark = k.js("const s = document.querySelector('.loading-line span'); if (!s) return null; const r = document.documentElement; const was = r.dataset.look; r.dataset.look = 'dark'; const c = getComputedStyle(s).backgroundColor; r.dataset.look = was; return c")
t.ok(dark is None or dark == "rgb(237, 237, 237)", f"dark: the line white as the text ({dark})")
b.wait_for(lambda: not b.active()["loading"], within=10, what="loaded")
time.sleep(0.3)
t.ok(line() is None, "loaded: the line goes")
b.cmd("sidebar.fold", folded=False)
b.cmd("tab.go", input=SITE + "/slow3")
time.sleep(0.8)
t.ok(line() is None, "with the column out, no line")
setting("fold.loadingLine", False)

# The overlay's veils cover the window, never the clear margin round it (the switcher's here).
b.cmd("tab.new", url="data:text/html,<title>other</title>other")
time.sleep(0.5)
b.cmd("tab.switch", by=1)
# The overlay's page takes its new size when it next draws (a busy machine, a covered window: later).
settle(lambda: b.ui("innerWidth", root="overlay") == edges()["region"]["width"], "the overlay at the window's size", within=4)
veil = settle(lambda: k.js("const e = document.querySelector('.switcher'); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, radius: getComputedStyle(e).borderTopLeftRadius }", root="overlay"), "the switcher", within=3)
f = frame()
m, vis = f["margin"], f["visual"]
t.ok(veil and k.near(veil["x"], m["left"]) and k.near(veil["y"], m["top"]) and k.near(veil["w"], vis["width"]) and k.near(veil["h"], vis["height"]) and veil["radius"] == "17.5px",
     f"the switcher's veil over the window drawn by Oriel, its corners, not the margin ({veil}, margin {m}, region {edges()['region']}, room {b.ui('JSON.stringify([innerWidth, innerHeight])', root='overlay')})")
b.cmd("tab.switchEnd", cancel=True)

pointer(None)
srv.shutdown()
t.done()

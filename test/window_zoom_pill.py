#!/usr/bin/env python3
"""Ctrl+wheel zooms the page, a step of Chrome's levels for each run of close
events, and the level is said in a capsule where the Mac says it (the light
announcement 30 above the page's foot, studio/01 §2.22, studio/02 §4.6):
right value, rewritten without coming up again, gone 1.2 s after the last
change, a click on it back to 100%, kept for the site after a restart,
nothing when nothing changes. SHOTS_DIR keeps pictures, light and dark."""
import os
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b
import ui_kit as k

SHOTS = os.environ.get("SHOTS_DIR")
if SHOTS:
    Path(SHOTS).mkdir(parents=True, exist_ok=True)


class Page(BaseHTTPRequestHandler):
    def do_GET(self):
        body = b"<title>zoom</title><body style='font:15px sans-serif;padding:28px'><h2>A page to zoom</h2><p>Some words on it.</p>"
        self.send_response(200)
        self.send_header("Content-Type", "text/html")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a):
        pass


srv = ThreadingHTTPServer(("127.0.0.1", 0), Page)
threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = f"http://127.0.0.1:{srv.server_port}/"
KEY = f"zoom.127.0.0.1:{srv.server_port}"
t = b.T()


def zoom():
    return b.call({"do": "window.frame"})["frame"]["zoom"]


def wheel(up=True, count=1, gap=0):
    b.call({"do": "window.wheel", "deltaY": 120 if up else -120, "count": count, "gap": gap})


def layer():
    return b.window()["overlay"]


def pill():
    return k.js("const e = document.querySelector('.zoom-pill'); if (!e) return null; const r = e.getBoundingClientRect(); const s = getComputedStyle(e);"
                " return { text: e.textContent, x: r.x, y: r.y, w: r.width, h: r.height, bg: s.backgroundColor, font: s.fontSize, radius: s.borderTopLeftRadius }", root="overlay")


def settle(pred, what, within=4):
    try:
        return b.wait_for(pred, within=within, what=what)
    except AssertionError:
        return None


def near(a, c):
    return a is not None and abs(a - c) < 0.002


def start(look, wipe=True):
    b.use(f"window-zoom-pill-{look}", wipe=wipe)
    b.launch(*k.FRAMES, env={"SEARCH_LOOK": look})
    b.cmd("field.commit", text=URL) if wipe else None
    b.wait_for(lambda: (b.active() or {}).get("title") == "zoom" and not b.active()["loading"], what="page")
    time.sleep(0.5)


start("light")
t.ok(near(zoom(), 1) and layer()["kind"] == "none", "a site starts at 100%, nothing said")

# One run of close Ctrl+wheel events is one step: 100 → 110, not three levels.
wheel(up=True, count=3, gap=20)
settle(lambda: near(zoom(), 1.1), "one step")
time.sleep(0.2)
t.ok(near(zoom(), 1.1), f"three close notches of Ctrl+wheel: one step, 110% ({zoom()})")
got = settle(pill, "the capsule", within=2)
t.ok(got and got["text"] == "110%", f"the capsule says 110% ({got})")
card = k.rect(".card")
win = b.window()
lay = layer()
t.ok(lay.get("name") == "window.zoom", "drawn in the overlay over the page")
# where: centred on the page's card, 30 above its foot (overlay coordinates are the region's)
region = b.call({"do": "window.edges"})["region"]
cx = region["x"] + got["x"] + got["w"] / 2
bottom = region["y"] + got["y"] + got["h"]
t.ok(abs(cx - (card["x"] + card["w"] / 2)) <= 1 and abs((card["y"] + card["h"]) - bottom - 30) <= 1, f"centred, 30 above the page's foot ({cx}, {bottom} vs card {card})")
t.ok(region["x"] >= card["x"] and region["x"] + region["width"] <= card["x"] + card["w"], "inside the page's card, never over the column")
t.ok(got["bg"] == "rgb(255, 255, 255)" and got["font"] == "12px" and k.near(got["h"], 32), f"the light announcement: ground, 12, 32 high ({got})")
b.ui("document.querySelector('.zoom-pill').__first = true; 1", root="overlay")
time.sleep(0.3)
wheel(up=True)
settle(lambda: near(zoom(), 1.25), "the next step")
again = settle(lambda: (p := pill()) and p["text"] == "125%" and p, "rewritten", within=2)
same = b.ui("!!document.querySelector('.zoom-pill')?.__first", root="overlay")
t.ok(near(zoom(), 1.25) and again and same, f"another notch a moment later: 125%, the same capsule rewritten, not up again ({again and again['text']}, {same})")
if SHOTS:
    b.shot(Path(SHOTS) / "zoom-pill-light.png")
gone = settle(lambda: layer()["kind"] == "none", "gone", within=3)
t.ok(gone, "1.2 s after the last change it goes")

# Ctrl+= and Ctrl+- go the same way and say it too.
b.cmd("view.zoom", by=1.1)
t.ok(near(zoom(), 1.5) and settle(lambda: (p := pill()) and p["text"] == "150%", "keys", within=2), "Ctrl+= the next level, 150%, said")
b.cmd("view.zoom", by=1 / 1.1)
t.ok(near(zoom(), 1.25), "Ctrl+- back a level")

# A click on the capsule: back to 100%.
settle(pill, "up", within=2)
b.ui("document.querySelector('.zoom-pill').click(); 1", root="overlay")
settle(lambda: near(zoom(), 1), "reset", within=2)
t.ok(near(zoom(), 1) and settle(lambda: (p := pill()) and p["text"] == "100%", "says 100", within=2), "a click on it: back to 100%, said")
t.ok(KEY not in b.state()["prefs"], "100% for the site is forgotten")
settle(lambda: layer()["kind"] == "none", "gone", within=3)

# Nothing changes, nothing said: at the last level, and on a tab with no page.
for _ in range(20):
    b.cmd("view.zoom", by=1.1)
settle(lambda: layer()["kind"] == "none", "gone", within=3)
wheel(up=True)
time.sleep(0.6)
t.ok(near(zoom(), 5) and layer()["kind"] == "none", f"at 500% another notch changes nothing and says nothing ({zoom()}, {layer()['kind']})")
for _ in range(4):
    b.cmd("view.zoom", by=1 / 1.1)
t.ok(near(zoom(), 2), "down the levels: 400, 300, 250, 200")
settle(lambda: layer()["kind"] == "none", "gone", within=3)
b.quit()

# Kept for the site after a restart.
start("light", wipe=False)
t.ok(near(zoom(), 2) and b.state()["prefs"].get(KEY) == 2, f"after a restart the site opens at 200% ({zoom()})")
b.cmd("view.zoom", reset=True)
b.quit()

# Dark: the same capsule in the dark ground.
start("dark")
wheel(up=False)
got = settle(lambda: (p := pill()) and p["text"] == "90%" and p, "dark capsule", within=3)
t.ok(near(zoom(), 0.9) and got and got["bg"] == "rgb(28, 28, 28)", f"Ctrl+wheel down: 90%, the capsule on the dark ground ({got})")
if SHOTS:
    time.sleep(0.5)  # up, its spring over
    b.shot(Path(SHOTS) / "zoom-pill-dark.png")
settle(lambda: layer()["kind"] == "none", "gone", within=3)

# Reduce animations: there at once, gone at once, no movement.
b.cmd("settings.set", id="motion.instant", value=True)
time.sleep(0.3)
wheel(up=True)
got = settle(lambda: (p := pill()) and p["text"] == "100%" and p, "still capsule", within=3)
moving = b.ui("document.getAnimations().length", root="overlay")
t.ok(got and moving == 0, f"with Reduce animations it comes with no movement ({moving} animations)")
srv.shutdown()
t.done()

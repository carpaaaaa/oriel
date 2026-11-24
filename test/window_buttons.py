#!/usr/bin/env python3
"""The window's buttons, Inline (the default) and Classic (Settings › Themes ›
Window buttons, window.buttons; tavole/pulsanti-finestra.html), measured:
Inline's three doors on the same middle as back, forward and reload and the
band's (within 0.5), 10 from the right edge as the column's are from the
left, each symbol in the middle of its door (within 0.5), free and maximized
(and in the strip of full screen on Windows); Classic's 46 × 40 places in the
corner, symbols in their middle, the rounded ground 4 in and 13.5 in the
window's corner; the choice made in Settings shows at once, stays after a
restart; close closes in both."""
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b
import ui_kit as k

IS_WIN = sys.platform == "win32"
b.use("window-buttons")
b.launch(*k.FRAMES, env={"SEARCH_LOOK": "light"})
t = b.T()


def frame():
    return b.call({"do": "window.frame"})["frame"]


def settle(pred, what, within=5):
    try:
        return b.wait_for(pred, within=within, what=what)
    except AssertionError:
        return None


MEASURE = """
  const box = e => { const r = rel(e.getBoundingClientRect()); return { x: r.x, y: r.y, w: r.width, h: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2 } }
  /* the symbol as drawn: the union of its shapes */
  const drawn = svg => { const rs = [...svg.querySelectorAll('path, rect')].map(s => rel(s.getBoundingClientRect()));
    const x = Math.min(...rs.map(r => r.x)), y = Math.min(...rs.map(r => r.y)), r = Math.max(...rs.map(r => r.right)), b = Math.max(...rs.map(r => r.bottom));
    return { cx: (x + r) / 2, cy: (y + b) / 2 } }
  const c = document.querySelector('.window > .caption-buttons')
  const buttons = [...c.querySelectorAll('button')].map(e => ({ ...box(e), glyph: drawn(e.querySelector('svg')), hl: box(e.querySelector('.hl')),
    radius: getComputedStyle(e.querySelector('.hl')).borderTopRightRadius, title: e.title }))
  const doors = [...document.querySelectorAll('.sidebar .helm > .door')].map(box)
  const band = document.querySelector('.sidebar .band')
  return { style: c.dataset.style, buttons, doors, band: band && box(band), card: box(document.querySelector('.card')), w: W0.width }"""


def measure():
    return k.js(MEASURE)


def inline_checks(where):
    m = measure()
    bt, doors = m["buttons"], m["doors"]
    t.ok(m["style"] == "inline" and len(bt) == 3 and all(k.near(x["w"], 26) and k.near(x["h"], 26) for x in bt), f"{where}: Inline, three doors of 26 ({[(x['w'], x['h']) for x in bt]})")
    mid = doors[0]["cy"]
    t.ok(all(abs(x["cy"] - mid) <= 0.5 for x in bt), f"{where}: on the middle of back, forward and reload ({[round(x['cy'], 2) for x in bt]} vs {mid})")
    t.ok(m["band"] and abs(m["band"]["cy"] - mid) <= 0.5, f"{where}: and the band's ({m['band'] and m['band']['cy']})")
    t.ok(abs(m["w"] - (bt[2]["x"] + bt[2]["w"]) - 10) <= 0.5 and abs(doors[0]["x"] - 10) <= 0.5, f"{where}: 10 from the right edge as the column's from the left ({m['w'] - bt[2]['x'] - bt[2]['w']}, {doors[0]['x']})")
    t.ok(all(k.near(b2["x"] - (a["x"] + a["w"]), 4) for a, b2 in zip(bt, bt[1:])), f"{where}: 4 apart")
    off = [(round(x["glyph"]["cx"] - x["cx"], 2), round(x["glyph"]["cy"] - x["cy"], 2)) for x in bt]
    t.ok(all(abs(dx) <= 0.5 and abs(dy) <= 0.5 for dx, dy in off), f"{where}: each symbol in the middle of its door ({off})")
    return m


# 1. Inline by default, free.
f = frame()
work = f["workArea"]
place = {"x": work["x"] + 60, "y": work["y"] + 40, "width": min(900, work["width"] - 200), "height": min(600, work["height"] - 160)}
b.call({"do": "window.place", "visual": True, **place})
time.sleep(0.6)
t.ok((b.state()["prefs"].get("window.buttons") or "inline") == "inline", "Inline by default")
m = inline_checks("free")
t.ok(k.near(m["card"]["y"], 52), f"the page under the band of 52, the doors in its middle ({m['card']['y']})")

# 2. Maximized: the same rule.
b.cmd("window.maximize")
settle(lambda: frame()["state"] == "maximized", "maximized")
time.sleep(0.5)
inline_checks("maximized")
b.cmd("window.maximize")
settle(lambda: frame()["state"] == "free", "restored")
time.sleep(0.4)

# 3. Full screen's strip (Windows): 52, the doors in its middle, 10 from the right.
if IS_WIN:
    b.key("F11")
    settle(lambda: frame()["state"] == "fullScreen", "full screen")
    disp = frame()["bounds"]
    b.call({"do": "window.pointer", "x": disp["x"] + disp["width"] / 2, "y": disp["y"]})
    settle(lambda: b.call({"do": "window.edges"})["reveal"], "the strip", within=3)
    s = k.js("const s = document.querySelector('.reveal-strip').getBoundingClientRect(); return { h: s.height, w: s.width, b: [...document.querySelectorAll('.reveal-strip button')].map(e => { const r = e.getBoundingClientRect(); return [r.y + r.height / 2, r.right] }) }", root="overlay")
    t.ok(s and k.near(s["h"], 52) and all(abs(x[0] - 26) <= 0.5 for x in s["b"]) and abs(s["w"] - s["b"][2][1] - 10) <= 0.5, f"full screen's strip: 52, the doors on its middle, 10 from the right ({s})")
    b.call({"do": "window.pointer", "x": None})
    b.key("F11")
    settle(lambda: frame()["state"] == "free", "out of full screen")

# 4. Classic, chosen in Settings: at once.
b.cmd("settings.set", id="window.buttons", value="classic")
time.sleep(0.5)
m = measure()
bt = m["buttons"]
t.ok(m["style"] == "classic" and len(bt) == 3 and all(k.near(x["w"], 46) and k.near(x["h"], 40) for x in bt), f"Classic at once: Windows' places, 46 × 40 ({[(x['w'], x['h']) for x in bt]})")
t.ok(k.near(bt[2]["x"] + bt[2]["w"], m["w"]) and k.near(bt[0]["y"], 0), "in the window's top right corner")
off = [(round(x["glyph"]["cx"] - x["cx"], 2), round(x["glyph"]["cy"] - x["cy"], 2)) for x in bt]
t.ok(all(abs(dx) <= 0.5 and abs(dy) <= 0.5 for dx, dy in off), f"each symbol in the middle of its place ({off})")
t.ok(all(k.near(x["hl"]["w"], 38) and k.near(x["hl"]["h"], 32) for x in bt), "the ground under the pointer 4 in")
t.ok(bt[0]["radius"] == "8px" and bt[2]["radius"] == "13.5px", f"radius 8, 13.5 in the window's corner (17.5 − 4) ({bt[0]['radius']}, {bt[2]['radius']})")
t.ok(k.near(m["card"]["y"], 40), f"the page under the 40 of the buttons ({m['card']['y']})")
strip_room = b.window()["controlsWidth"]
t.ok(strip_room == 138, f"the strip's room for them: 138 ({strip_room})")

# 5. Kept after a restart.
b.quit()
b.use("window-buttons", wipe=False)
b.launch(*k.FRAMES, env={"SEARCH_LOOK": "light"})
time.sleep(0.8)
t.ok(measure()["style"] == "classic", "after a restart, still Classic")

# 6. Close closes, in both.
for style in ("classic", "inline"):
    b.cmd("settings.set", id="window.buttons", value=style)
    b.cmd("window.new")
    settle(lambda: len(b.state()["windows"]) == 2, "a second window")
    time.sleep(0.8)
    other = b.state()["windows"][-1]["windowID"]
    b.call({"do": "ui", "window": other, "js": "document.querySelector('.window > .caption-buttons .close').click(); 1"})
    t.ok(settle(lambda: len(b.state()["windows"]) == 1, "closed", within=5), f"{style}: close closes the window")
t.ok(b.window()["controlsWidth"] == 96, f"Inline's room in the strip: 3 doors, 4 apart, and 10 ({b.window()['controlsWidth']})")
t.done()

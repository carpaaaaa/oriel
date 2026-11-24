#!/usr/bin/env python3
"""Tabs across the top, measured (studio/02 §4.3, studio/01 §4.3-§4.9,
§4.17, §6.3, §6.49): a strip of 52 with a band of 30, tabs 28 high and 186
wide, narrower in equal parts as they crowd, icon only under 104, never
under 36; pins 30; the pin line 1 × 20; + 15 with 7 each side, there only
with the pointer in the strip; a group's band. SHOTS_DIR keeps pictures."""
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b  # noqa: E402
import ui_kit as k  # noqa: E402

SHOTS = os.environ.get("SHOTS_DIR")
b.use("ui-strip")
b.launch(*k.FRAMES, env={"SEARCH_LOOK": "light"})
t = b.T()
time.sleep(0.8)

s = k.fixture("top")
k.fake(s, look="light")
time.sleep(0.6)
if SHOTS:
    try:
        b.shot(Path(SHOTS) / "strip-top-light.png")
    except RuntimeError as e:
        print(f"  (no picture: {e})")
strip = k.rect(".tabbar")
band = k.wrect(".strip-band")
t.ok(k.near(strip["h"], 52) and k.near(band["h"], 30) and k.near(band["y"], 11), f"a strip of 52, the band of 30 in its middle: {strip['h']}, {band}")
card = k.wrect(".card")
t.ok(k.near(card["y"], 52) and k.near(card["x"], 0), f"the page under the strip, edge to edge: {card}")
tabs = k.js("return [...document.querySelectorAll('.strip-tab')].map(e => { const r = e.getBoundingClientRect(); return [r.x, r.width, r.height, getComputedStyle(e.querySelector('.ground')).borderTopLeftRadius] })")
t.ok(all(k.near(x[2], 28) and x[3] == "9px" for x in tabs), "tabs 28 high, radius 9")
widths = {round(x[1], 2) for x in tabs}
t.ok(len(widths) == 1, f"every tab one width: {widths}")
pins = k.js("return [...document.querySelectorAll('.strip-pin')].map(e => e.getBoundingClientRect().width)")
t.ok(len(pins) == 2 and all(k.near(w, 30) for w in pins), f"pins, squares of 30: {pins}")
line = k.rect(".pin-line")
t.ok(line and k.near(line["w"], 1) and k.near(line["h"], 20), f"the line between pins and tabs, 1 × 20: {line}")
first = k.wrect(".strip-pin")
t.ok(k.near(first["x"], 12 + 2), f"on Windows the tabs start 12 in, as the Mac's do in full screen: {first['x']}")
plus = k.js("const e = document.querySelector('.strip-plus'); const r = e.getBoundingClientRect(); return [Math.round(r.width / parseFloat(getComputedStyle(e).scale || 1)), getComputedStyle(e).opacity]")
t.ok(plus[1] == "0", f"+ hidden with the pointer away: {plus}")
band_bg = k.js("return getComputedStyle(document.querySelector('.strip-group.open')).backgroundColor")
t.ok(k.same_colour(band_bg, "rgba(230, 84, 102, 0.07)"), f"the red group's band at 7%: {band_bg}")

# few tabs: 186 each; many: equal parts, icon only under 104, never under 36
few = {**s, "tabs": [x for x in s["tabs"] if x.get("pinID")] + [x for x in s["tabs"] if not x.get("pinID") and not x.get("groupID")][:2], "groups": []}
few["activeID"] = few["tabs"][-1]["id"]
k.fake(few, look="light")
time.sleep(0.4)
w = k.js("return [...document.querySelectorAll('.strip-tab')].map(e => e.getBoundingClientRect().width)")
t.ok(w and all(k.near(x, 186) for x in w), f"with room, 186 each: {w}")
part = k.js("const e = document.querySelector('.strip-tab'); const m = e.querySelector('.mark').getBoundingClientRect(); const r = e.getBoundingClientRect(); const ti = e.querySelector('.strip-title').getBoundingClientRect(); const sl = e.querySelector('.strip-slot').getBoundingClientRect();"
            " return [m.x - r.x, m.width, ti.x - m.right, r.right - sl.right, sl.width]")
t.ok(k.near(part[0], 11) and k.near(part[1], 15) and k.near(part[2], 6) and k.near(part[3], 7) and k.near(part[4], 15), f"air 11, mark 15, 6, title … slot 15, air 7: {part}")
# Narrower in equal parts, they fit the window drawn by Oriel (the strip is
# measured, not the view with its clear margin), the far end before the buttons.
# (The row's sums leave 3 over: the pin line's gap and the +'s; the margin was 80.)
some = {**s, "tabs": s["tabs"] + [{**s["tabs"][-1], "id": f"y{i}", "label": f"Tab {i}", "title": f"Tab {i}", "url": f"https://example{i}.com/"} for i in range(6)]}
k.fake(some, look="light")
time.sleep(0.4)
fit = k.js("const r = document.querySelector('.strip-row'); const f = rel(document.querySelector('.strip-far').getBoundingClientRect());"
           " return [r.scrollWidth - r.clientWidth, f.right, W0.width, document.querySelector('.strip-tab').getBoundingClientRect().width]")
t.ok(fit[3] < 186 and fit[0] <= 4 and fit[1] <= fit[2] - 138 + 0.5, f"shrunk to fit: nothing hidden in the row, the far end before the window's buttons: {fit}")
many = {**s, "tabs": s["tabs"] + [{**s["tabs"][-1], "id": f"x{i}", "label": f"Tab {i}", "title": f"Tab {i}", "url": f"https://example{i}.com/"} for i in range(30)]}
k.fake(many, look="light")
time.sleep(0.4)
w = k.js("return [...document.querySelectorAll('.strip-tab')].map(e => [e.getBoundingClientRect().width, e.classList.contains('titled')])")
t.ok(all(x[0] >= 36 - 0.5 for x in w) and not any(x[1] for x in w if x[0] < 104), f"crowded: never under 36, no title under 104: {w[:3]}")

# studio/01 §4.20: a double click after the + opens a tab and doesn't zoom;
# on the strip's top band the window zooms (the frame's double click).
k.fake(few, look="light")
time.sleep(0.4)


def frame_state():
    return b.call({"do": "window.frame"})["frame"]["state"]


# A page in the real tab: from an empty tab, New Tab opens no other.
b.cmd("tab.go", input="data:text/html,<title>page</title>page")
b.wait_for(lambda: b.active()["title"] == "page", what="page")
n = len(b.window()["tabs"])
sp = k.rect(".strip-spring")
px, py = sp["x"] + sp["w"] / 2, sp["y"] + sp["h"] / 2
b.mouse(px, py, clicks=1)
b.mouse(px, py, clicks=2)
try:
    b.wait_for(lambda: len(b.window()["tabs"]) == n + 1, within=3, what="a new tab")
except AssertionError:
    pass
time.sleep(0.4)
t.ok(len(b.window()["tabs"]) == n + 1 and frame_state() == "free", f"after the +: a new tab, the window as it was ({len(b.window()['tabs']) - n} new, {frame_state()})")
bar = k.rect(".tabbar")
tx, ty = bar["x"] + bar["w"] / 2, bar["y"] + 5
b.mouse(tx, ty, clicks=1)
b.mouse(tx, ty, clicks=2)
try:
    b.wait_for(lambda: frame_state() == "maximized", within=3, what="zoomed")
except AssertionError:
    pass
t.ok(frame_state() == "maximized" and len(b.window()["tabs"]) == n + 1, f"on the band above the tabs: the window zooms, no tab ({frame_state()})")
b.cmd("window.maximize")
try:
    b.wait_for(lambda: frame_state() == "free", within=3, what="restored")
except AssertionError:
    pass
k.thaw()
t.done()

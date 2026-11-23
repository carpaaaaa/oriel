#!/usr/bin/env python3
"""The window drawn by Oriel, on any machine (studio/01 §1.3, §1.4, §1.12,
§1.19, §1.22; studio/02 §4.1, §4.7, §4.8): margin for the shadow, 17.5 px
corners, the card 8 in with radius 10 and the page laid on it, maximize,
restore, minimize, resizing, moving by hand, double click on the strip, the
clear margin that lets clicks through. Values are the Mac's.

Real input on Windows (Snap, the move and size loops, screenshots of the
whole screen) is in window_os.py."""
import json, os, sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b

SHOTS = os.environ.get("SHOTS_DIR")
if SHOTS:
    Path(SHOTS).mkdir(parents=True, exist_ok=True)


def picture(name):
    """A picture for looking at; a window hidden behind another can't be
    captured (Windows' compositor), which is no failure of the window."""
    try:
        b.shot(f"{SHOTS}/{name}")
    except RuntimeError as e:
        print("  (no picture %s: %s)" % (name, e))
ROOM = {"top": 30, "right": 40, "bottom": 50, "left": 40}

b.use("window-frame")
b.launch()
t = b.T()


def frame():
    return b.call({"do": "window.frame"})["frame"]


def dom():
    return json.loads(b.ui("""JSON.stringify((() => {
      const r = s => { const e = document.querySelector(s); return e && e.getBoundingClientRect().toJSON() }
      const css = (s, p) => { const e = document.querySelector(s); return e && getComputedStyle(e)[p] }
      return { window: r('.window'), card: r('.card'), buttons: r('.caption-buttons'), maxTitle: document.querySelector('.caption-buttons .maximize')?.title,
        windowRadius: css('.window', 'borderTopLeftRadius'), cardRadius: css('.card', 'borderTopLeftRadius'), shadow: css('.window', 'boxShadow'),
        gripRight: r('.grip-right'), gripTop: r('.grip-top'), gripCorner: r('.grip-bottom-right'),
        frame: document.documentElement.dataset.frame, state: document.documentElement.dataset.state }
    })())"""))


def near(a, b_, by=1.01):
    return abs(a - b_) <= by


def settle(pred, what, within=5):
    try:
        return b.wait_for(pred, within=within, what=what)
    except AssertionError:
        return None


# Somewhere known, on any screen.
f = frame()
work = f["workArea"]
place = {"x": work["x"] + 60, "y": work["y"] + 40, "width": min(900, work["width"] - 200), "height": min(600, work["height"] - 160)}
b.call({"do": "window.place", "visual": True, **place})
b.cmd("tab.go", input="data:text/html,<title>frame</title><body style='background:%23fff'>page")
b.wait_for(lambda: b.active()["title"] == "frame", what="page")
time.sleep(0.6)
# The interface catches up with the size (slow machines).
settle(lambda: abs(dom()["window"]["width"] - place["width"]) < 1.5, "interface at the new size", within=8)

# 1. The drawn frame: margin, corners, card (studio/02 §4.1, §4.7).
def page_on_card():
    c, pg = dom()["card"], frame()["pages"]
    return len(pg) == 1 and all(near(pg[0]["rect"][k], round(c[k])) for k in ("x", "y", "width", "height"))
settle(page_on_card, "the page on the card", within=8)
f = frame()
d = dom()
t.ok(f["kind"] == "drawn" and d["frame"] == "drawn", "the window is drawn by Oriel")
t.ok(f["state"] == "free" and f["margin"] == ROOM, "free, with the clear margin for the shadow")
t.ok(f["visual"]["width"] == place["width"] and f["visual"]["height"] == place["height"], "visible size as asked (%sx%s)" % (f["visual"]["width"], f["visual"]["height"]))
w = d["window"]
t.ok(near(w["x"], ROOM["left"]) and near(w["y"], ROOM["top"]) and near(w["width"], place["width"]) and near(w["height"], place["height"]), "the window is drawn inside the margin")
t.ok(d["windowRadius"] == "17.5px", "window corners 17.5 (%s)" % d["windowRadius"])
t.ok("44px" in d["shadow"] or "26px" in d["shadow"], "the window has its own shadow (key or resting)")
c = d["card"]
t.ok(near(w["x"] + w["width"] - (c["x"] + c["width"]), 8) and near(w["y"] + w["height"] - (c["y"] + c["height"]), 8), "card 8 from the right and the bottom")
t.ok(d["cardRadius"] == "10px", "card radius 10 (%s)" % d["cardRadius"])
t.ok(near(c["y"] - w["y"], 40), "card under the caption buttons (40)")
pages = f["pages"]
t.ok(len(pages) == 1 and all(near(pages[0]["rect"][k], round(c[k])) for k in ("x", "y", "width", "height")), "the page lies on the card (%s)" % (pages and pages[0]["rect"]))
bt = d["buttons"]
t.ok(bt and near(bt["width"], 138) and near(bt["x"] + bt["width"], w["x"] + w["width"]) and near(bt["y"], w["y"]), "three caption buttons of 46 in the top right corner")
g = d["gripRight"]
t.ok(near(g["x"], w["x"] + w["width"] - 4) and near(g["width"], 12), "the right grip is 8 outside and 4 inside the edge")
gt = d["gripTop"]
t.ok(near(gt["y"], w["y"] - 8), "the top grip starts 8 above the edge")
if SHOTS:
    picture("window-1-free.png")

# 2. Resizing (setBounds): the drawn window and the page follow.
b.call({"do": "window.place", "visual": True, **{**place, "width": place["width"] - 100, "height": place["height"] - 60}})
time.sleep(0.5)
d = dom()
f = frame()
t.ok(near(d["window"]["width"], place["width"] - 100) and near(d["window"]["height"], place["height"] - 60), "resized: the window is drawn at the new size")
c = d["card"]
t.ok(all(near(f["pages"][0]["rect"][k], round(c[k])) for k in ("x", "y", "width", "height")), "resized: the page follows the card")
b.call({"do": "window.place", "visual": True, **place})
time.sleep(0.3)

# 3. Never under 640x420 visible (studio/01 §1.4).
b.call({"do": "window.place", "visual": True, **{**place, "width": 300, "height": 200}})
time.sleep(0.4)
f = frame()
t.ok(f["visual"]["width"] >= 640 and f["visual"]["height"] >= 420, "never under 640x420 (%sx%s)" % (f["visual"]["width"], f["visual"]["height"]))
b.call({"do": "window.place", "visual": True, **place})
time.sleep(0.3)

# 4. Maximize: no margin, square corners, no shadow; the card keeps its gap.
b.cmd("window.maximize")
f = settle(lambda: frame()["state"] == "maximized" and frame(), "maximized") or frame()
time.sleep(0.5)
d = dom()
t.ok(f["state"] == "maximized" and f["margin"] == {"top": 0, "right": 0, "bottom": 0, "left": 0}, "maximized: no margin")
t.ok(f["visual"] == f["workArea"], "maximized: fills the work area (%s)" % f["visual"])
t.ok(d["windowRadius"] == "0px" and d["shadow"] == "none", "maximized: square corners, no shadow")
t.ok(near(d["window"]["x"], 0) and near(d["window"]["width"], f["workArea"]["width"]), "maximized: drawn edge to edge")
t.ok(near(d["window"]["x"] + d["window"]["width"] - (d["card"]["x"] + d["card"]["width"]), 8), "maximized: the card keeps its 8 (as on the Mac)")
t.ok(d["maxTitle"] == "Restore Down", "maximized: the button restores")
t.ok(all(near(f["pages"][0]["rect"][k], round(d["card"][k])) for k in ("x", "y", "width", "height")), "maximized: the page lies on the card")
t.ok(not d["gripRight"], "maximized: no grips")
if SHOTS:
    picture("window-2-maximized.png")
b.cmd("window.maximize")
f = settle(lambda: frame()["state"] == "free" and frame(), "restored") or frame()
t.ok(f["state"] == "free" and f["visual"] == {**place}, "restored where it was (%s)" % f["visual"])
time.sleep(0.4)

# 5. Double click on the strip maximizes and restores; on a row it doesn't.
d = dom()
strip = (d["window"]["x"] + d["window"]["width"] - 200, d["window"]["y"] + 18)
b.mouse(*strip, clicks=1)
b.mouse(*strip, clicks=2)
t.ok(settle(lambda: frame()["state"] == "maximized", "double click"), "double click on the strip maximizes")
time.sleep(0.4)
d = dom()
strip = (d["window"]["x"] + d["window"]["width"] - 200, d["window"]["y"] + 18)
b.mouse(*strip, clicks=1)
b.mouse(*strip, clicks=2)
t.ok(settle(lambda: frame()["state"] == "free", "double click again"), "double click again restores")
time.sleep(0.4)
d = dom()
rowx, rowy = d["window"]["x"] + 60, d["window"]["y"] + 140
b.mouse(rowx, rowy, clicks=1)
b.mouse(rowx, rowy, clicks=2)
time.sleep(0.5)
t.ok(frame()["state"] == "free", "double click in the column is not the strip's")

# 6. Moving by hand from the strip (the Mac's way; Windows uses its own loop,
#    window_os.py), and only past the threshold.
before = frame()["bounds"]
b.cmd("window.moveDrag", phase="start", x=500, y=300)
b.cmd("window.moveDrag", phase="move", x=560, y=340)
b.cmd("window.moveDrag", phase="end", x=560, y=340)
after = frame()["bounds"]
t.ok(after["x"] == before["x"] + 60 and after["y"] == before["y"] + 40 and after["width"] == before["width"], "moving by hand follows the pointer")
if frame()["manual"]:
    d = dom()
    sx, sy = d["window"]["x"] + d["window"]["width"] - 250, d["window"]["y"] + 18
    before = frame()["bounds"]
    b.call({"do": "window.drag", "path": [[sx, sy], [sx + 2, sy + 1]]})
    t.ok(frame()["bounds"] == before, "a press that hardly moves doesn't move the window")
    b.call({"do": "window.drag", "path": [[sx, sy], [sx + 10, sy + 5], [sx + 30, sy + 15], [sx + 50, sy + 25]]})
    moved = frame()["bounds"]
    t.ok(moved["x"] == before["x"] + 50 and moved["y"] == before["y"] + 25, "dragging the strip moves the window (%s)" % moved)
    before = moved
    bx, by = d["window"]["x"] + 60, d["window"]["y"] + 140
    b.call({"do": "window.drag", "path": [[bx, by], [bx + 30, by + 30]]})
    t.ok(frame()["bounds"] == before, "dragging a tab row doesn't move the window")

# 7. Resizing by hand from an edge and a corner.
before = frame()["bounds"]
b.cmd("window.resizeDrag", edge="right", phase="start", x=0, y=0)
b.cmd("window.resizeDrag", edge="right", phase="move", x=70, y=30)
b.cmd("window.resizeDrag", edge="right", phase="end", x=70, y=30)
after = frame()["bounds"]
t.ok(after["width"] == before["width"] + 70 and after["height"] == before["height"] and after["x"] == before["x"], "the right edge resizes only the width")
before = after
b.cmd("window.resizeDrag", edge="top-left", phase="start", x=0, y=0)
b.cmd("window.resizeDrag", edge="top-left", phase="move", x=20, y=10)
b.cmd("window.resizeDrag", edge="top-left", phase="end", x=20, y=10)
after = frame()["bounds"]
t.ok(after["x"] == before["x"] + 20 and after["y"] == before["y"] + 10 and after["width"] == before["width"] - 20 and after["height"] == before["height"] - 10, "the top left corner keeps the bottom right in place")

# 8. Minimize and back.
b.cmd("window.minimize")
t.ok(settle(lambda: frame()["minimized"], "minimized"), "minimize")
b.call({"do": "window.restore"})
t.ok(settle(lambda: not frame()["minimized"], "restore"), "back from the taskbar")
time.sleep(0.4)
t.ok(frame()["state"] == "free" and frame()["margin"] == ROOM, "back with its margin")

# 9. The clear margin: hollow while the pointer is over it, back to solid as
#    soon as the pointer is elsewhere.
f = frame()
p, bd = f["pointer"], f["bounds"]
pointer_away = not (bd["x"] <= p["x"] < bd["x"] + bd["width"] and bd["y"] <= p["y"] < bd["y"] + bd["height"])
b.cmd("window.hollow", hollow=True)
if pointer_away:
    t.ok(settle(lambda: not frame()["hollow"], "solid again", within=2), "the margin lets go when the pointer isn't over it")
else:
    b.cmd("window.hollow", hollow=False)
    t.ok(not frame()["hollow"], "the margin lets go")
b.cmd("window.maximize")
settle(lambda: frame()["state"] == "maximized", "maximized")
b.cmd("window.hollow", hollow=True)
t.ok(not frame()["hollow"], "a maximized window has no margin to let clicks through")
b.cmd("window.maximize")
settle(lambda: frame()["state"] == "free", "restored")

# 10. Full screen keeps the column and the page goes edge to edge (§1.19,
#     §1.22). Not on a Mac: it would take a Space of the person's desktop.
if sys.platform != "darwin":
    b.key("F11")
    f = settle(lambda: frame()["state"] == "fullScreen" and frame(), "full screen") or frame()
    time.sleep(0.6)
    d = dom()
    t.ok(f["state"] == "fullScreen" and f["bounds"] == f["display"], "F11: full screen fills the display")
    t.ok(not d["buttons"] and near(d["card"]["y"], 0) and d["cardRadius"] == "0px", "full screen: no buttons, the page edge to edge")
    if SHOTS:
        picture("window-3-fullscreen.png")
    b.cmd("window.fullScreen", on=False)
    t.ok(settle(lambda: frame()["state"] == "free", "leave full screen"), "out of full screen, free again")

# 11. A new window: the front one's size, 22 down and right (studio/01 §1.3).
b.call({"do": "window.place", "visual": True, **place})
time.sleep(0.3)
first = frame()["visual"]
b.cmd("window.new")
settle(lambda: len(b.state()["windows"]) == 2, "second window")
time.sleep(0.8)
frames = {w["windowID"]: b.call({"do": "window.frame", "window": w["windowID"]})["frame"] for w in b.state()["windows"]}
new_id, new = next(((i, x) for i, x in frames.items() if x["visual"] != first), list(frames.items())[-1])
t.ok(new["visual"]["x"] == first["x"] + 22 and new["visual"]["y"] == first["y"] + 22, "a new window cascades 22 down and right (%s)" % new["visual"])
t.ok(new["visual"]["width"] == first["width"] and new["visual"]["height"] == first["height"], "a new window has the front one's size")
b.cmd("window.close", window=new_id)
settle(lambda: len(b.state()["windows"]) == 1, "closed")

print(json.dumps(frame()["variant"]))
t.done()

#!/usr/bin/env python3
"""The window's surfaces always in place, from one state to another and back,
several times (studio/01 §1.19-§1.22, §5.29-§5.30; studio/02 §4.1, §4.2): back,
forward and reload and the window's three buttons exist, are drawn, inside
the window, under nothing of the interface and not under the page, free,
maximized, snapped and in full screen. In full screen the buttons come down
with the pointer at the top of the screen and Escape (left to Oriel by the
page) or F11 leaves it; a folded column comes out at the window's edge with
its doors and goes back. The pointer is the bench's (window.pointer).
Snapped and full screen only on Windows (on a Mac full screen takes a Space)."""
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b

IS_WIN = sys.platform == "win32"
b.use("window-states")
b.launch()
t = b.T()


def frame():
    return b.call({"do": "window.frame"})["frame"]


def edges():
    return b.call({"do": "window.edges"})


def pointer(x, y=None):
    b.call({"do": "window.pointer", "x": x, "y": y})


def settle(pred, what, within=5):
    try:
        return b.wait_for(pred, within=within, what=what)
    except AssertionError:
        return None


SEEN = """const seen = (e, W) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e);
  const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
  return { x: r.x, y: r.y, w: r.width, h: r.height, shown: s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity > 0 && r.width > 0 && r.height > 0,
    top: !!top && (top === e || e.contains(top)),
    inside: !W || (r.x >= W.x - 0.5 && r.y >= W.y - 0.5 && r.right <= W.right + 0.5 && r.bottom <= W.bottom + 0.5) } };"""


def surfaces():
    d = json.loads(b.ui("JSON.stringify((() => { " + SEEN + """
      const W = document.querySelector('.window').getBoundingClientRect()
      return { window: { x: W.x, y: W.y, width: W.width, height: W.height },
        doors: [...document.querySelectorAll('.sidebar .helm > .door, .tabbar .strip-helm > .door')].map(e => seen(e, W)),
        buttons: [...document.querySelectorAll('.window > .caption-buttons button')].map(e => seen(e, W)) }
    })())"""))
    pages = [p["rect"] for p in frame()["pages"]]
    for x in d["doors"] + d["buttons"]:
        x["page"] = any(x["x"] < p["x"] + p["width"] and p["x"] < x["x"] + x["w"] and x["y"] < p["y"] + p["height"] and p["y"] < x["y"] + x["h"] for p in pages)
    return d


def ok_all(items, n):
    return len(items) == n and all(x["shown"] and x["top"] and x["inside"] and not x["page"] for x in items)


def check(where, buttons=True):
    d = surfaces()
    bad = [x for x in d["doors"] if not (x["shown"] and x["top"] and x["inside"] and not x["page"])]
    t.ok(ok_all(d["doors"], 3), f"{where}: back, forward and reload there, drawn, uncovered ({len(d['doors'])}{', ' + str(bad[0]) if bad else ''})")
    if buttons:
        t.ok(ok_all(d["buttons"], 3), f"{where}: minimize, maximize and close there, drawn, uncovered ({len(d['buttons'])})")
    return d


f = frame()
work = f["workArea"]
place = {"x": work["x"] + 60, "y": work["y"] + 40, "width": min(900, work["width"] - 200), "height": min(600, work["height"] - 160)}
b.call({"do": "window.place", "visual": True, **place})
b.cmd("tab.go", input="data:text/html,<title>states</title><body style='background:%23fff'>page")
b.wait_for(lambda: b.active()["title"] == "states", what="page")
page = b.active()["id"]
# The real pointer stays out of it: the bench's is over the page.
pointer(place["x"] + place["width"] / 2, place["y"] + place["height"] / 2)


def on_card():
    pg = frame()["pages"]
    c = json.loads(b.ui("JSON.stringify(document.querySelector('.card').getBoundingClientRect())"))
    return len(pg) == 1 and all(abs(pg[0]["rect"][k] - round(c[k])) <= 1.01 for k in ("x", "y", "width", "height"))


settle(on_card, "the page on the card", within=8)
check("free")

# 1. Maximized and back, three times.
for i in range(3):
    b.cmd("window.maximize")
    settle(lambda: frame()["state"] == "maximized" and on_card(), "maximized", within=8)
    check(f"maximized ({i + 1})")
    b.cmd("window.maximize")
    settle(lambda: frame()["state"] == "free" and on_card(), "restored", within=8)
    check(f"free again ({i + 1})")
t.ok(frame()["visual"] == place, f"restored where it was ({frame()['visual']})")

# 2. Snapped (Windows: Win+Left, Win+Right, back), the surfaces still there.
if IS_WIN:
    import ctypes
    user32 = ctypes.WinDLL("user32")

    def chord(*vk):
        for k in vk:
            user32.keybd_event(k, 0, 0x1 if k in (0x25, 0x27) else 0, 0)
            time.sleep(0.03)
        for k in reversed(vk):
            user32.keybd_event(k, 0, 0x2 | (0x1 if k in (0x25, 0x27) else 0), 0)
            time.sleep(0.03)

    b.call({"do": "window.focus"})
    time.sleep(0.5)
    for i, side in enumerate((0x25, 0x27)):
        chord(0x5B, side)
        if settle(lambda: frame()["state"] == "snapped" and on_card(), "snapped", within=6):
            check(f"snapped ({i + 1})")
        else:
            print(f"       (not snapped: {frame()['state']}; Windows didn't arrange the window)")
        b.call({"do": "window.place", "visual": True, **place})
        settle(lambda: frame()["state"] == "free" and on_card(), "free", within=6)
        check(f"free after Snap ({i + 1})")

# 3. Full screen (Windows): the column and its doors stay, the buttons come
#    down with the pointer at the top; Escape and F11 leave it.
if IS_WIN:
    for i, way in enumerate(("Escape", "F11")):
        b.call({"do": "window.focus"})
        b.cmd("tab.select", id=page)
        b.key("F11")
        settle(lambda: frame()["state"] == "fullScreen" and on_card(), "full screen", within=8)
        d = check(f"full screen ({i + 1})", buttons=False)
        t.ok(not d["buttons"], "full screen: no buttons in the way at rest")
        disp = frame()["bounds"]
        pointer(disp["x"] + disp["width"] / 2, disp["y"])
        up = settle(lambda: edges()["reveal"], "the buttons come down", within=3)
        strip = json.loads(b.ui("JSON.stringify((() => { " + SEEN + " return [...document.querySelectorAll('.reveal-strip .caption-buttons button')].map(e => seen(e, null)) })())", root="overlay")) if up else []
        t.ok(up and len(strip) == 3 and all(x["shown"] and x["top"] for x in strip), f"the pointer at the top: the strip with the three buttons ({len(strip)})")
        region = edges()["region"]
        t.ok(up and region["y"] == 0 and region["width"] == disp["width"] and region["height"] >= 40, f"…over the page, the screen's width ({region})")
        pointer(disp["x"] + disp["width"] / 2, disp["y"] + 200)
        t.ok(settle(lambda: not edges()["reveal"], "the strip goes", within=3), "the pointer gone: the strip goes back")
        b.key(way)
        t.ok(settle(lambda: frame()["state"] == "free", f"{way} leaves full screen", within=6), f"{way} leaves full screen")
        settle(on_card, "the page on the card", within=8)
        check(f"after full screen ({i + 1})")
        pointer(place["x"] + place["width"] / 2, place["y"] + place["height"] / 2)

# 4. The folded column comes out at the edge with its doors and goes back,
#    free and maximized, several times.
b.cmd("sidebar.fold", folded=True)
time.sleep(0.4)
t.ok(not surfaces()["doors"], "folded: the column's doors go with it")
for state in ("free", "maximized"):
    if state == "maximized":
        b.cmd("window.maximize")
        settle(lambda: frame()["state"] == "maximized" and on_card(), "maximized", within=8)
    v = frame()["visual"]
    margin = frame()["margin"]
    for i in range(3):
        pointer(v["x"] + 2, v["y"] + v["height"] / 2)
        out = settle(lambda: edges()["peek"], "out", within=3)
        doors = json.loads(b.ui("JSON.stringify((() => { " + SEEN + " return [...document.querySelectorAll('.fold-out .helm > .door')].map(e => seen(e, null)) })())", root="overlay")) if out else []
        t.ok(out and len(doors) == 3 and all(x["shown"] and x["top"] for x in doors), f"{state}: the pointer at the edge, the column out with its doors ({i + 1}: {len(doors)})")
        region = edges()["region"]
        col = b.window()["sidebar"]["width"]
        t.ok(out and region["x"] == margin["left"] and region["y"] == margin["top"] and region["width"] == col + 40 and region["height"] == v["height"],
             f"…over the page from the window's edge, the column and its shadow ({region})")
        pointer(v["x"] + 100, v["y"] + v["height"] / 2)
        time.sleep(0.3)
        t.ok(edges()["peek"], "over it, it stays out")
        pointer(v["x"] - 30, v["y"] + v["height"] / 2)
        time.sleep(0.3)
        t.ok(edges()["peek"], "a little beyond the edge, it stays out")
        pointer(v["x"] + v["width"] / 2, v["y"] + v["height"] / 2)
        t.ok(settle(lambda: not edges()["peek"], "back", within=2), "the pointer gone, it goes back")
    if state == "maximized":
        b.cmd("window.maximize")
        settle(lambda: frame()["state"] == "free" and on_card(), "restored", within=8)
pointer(place["x"] + place["width"] / 2, place["y"] + place["height"] / 2)
b.cmd("sidebar.fold", folded=False)
time.sleep(0.4)
v = frame()["visual"]
pointer(v["x"] + 2, v["y"] + v["height"] / 2)
time.sleep(0.4)
t.ok(not edges()["peek"], "unfolded: the edge brings nothing out")
check("unfolded")

pointer(None)
t.done()

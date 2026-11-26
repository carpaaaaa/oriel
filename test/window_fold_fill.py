#!/usr/bin/env python3
"""Ctrl+S hides the tabs and the page fills the window, in a window as in full screen, never full
screen of its own (carpa, 26 Nov 2026: "it must hide the tab bar and extend everything, also in a
window, not go full screen"). The window's buttons come down at the top.

    npm run build && python3 test/window_fold_fill.py
"""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b  # noqa: E402

t = b.T()
b.use("window-fold-fill")
b.launch()


def frame():
    return b.call({"do": "window.frame"})["frame"]


def folded():
    return b.window()["sidebar"]["folded"]


def settle(pred, what, within=6):
    try:
        return b.wait_for(pred, within=within, what=what)
    except AssertionError:
        return None


def page_vs_window():
    f = frame()
    p = f["pages"][0]["rect"]
    v = f["visual"]
    c = f["bounds"]
    # the page's rectangle in the window's own coordinates (the window's clear margin is round it)
    return p, v, c


def fills():
    f = frame()
    p = f["pages"][0]["rect"]
    return abs(p["width"] - f["visual"]["width"]) <= 1 and abs(p["height"] - f["visual"]["height"]) <= 1


try:
    b.call({"do": "window.place", "x": 80, "y": 80, "width": 1000, "height": 640, "visual": True})
    b.cmd("tab.new", url="about:blank")
    for layout in ("top", "left"):
        b.cmd("settings.set", id="tabs.layout", value=layout)
        time.sleep(0.8)
        print(f"- tabs {layout}: Ctrl+S")
        t.ok(not fills(), "with the tabs showing, the page doesn't fill the window")
        b.cmd("sidebar.toggle")
        t.ok(settle(lambda: folded() and fills(), "the page fills the window") is not None, "folded, and the page fills the whole window")
        t.ok(frame()["state"] == "free", f"still a window, not full screen ({frame()['state']})")
        v = frame()["visual"]
        b.call({"do": "window.pointer", "x": v["x"] + v["width"] // 2, "y": v["y"] + 1})
        time.sleep(1.0)
        e = b.call({"do": "window.edges"})
        t.ok(e["peek"] or e["reveal"], f"at the top, the window's buttons come down ({e})")
        b.call({"do": "window.pointer", "x": v["x"] + v["width"] // 2, "y": v["y"] + v["height"] // 2})
        time.sleep(1.2)
        b.call({"do": "window.pointer"})
        b.cmd("sidebar.toggle")
        t.ok(settle(lambda: not folded() and not fills(), "tabs back") is not None, "Ctrl+S again: the tabs are back, the page as it was")
        t.ok(frame()["state"] == "free", "the window never left being a window")

    print("- maximized")
    b.cmd("window.maximize")
    settle(lambda: frame()["state"] == "maximized", "maximized")
    b.cmd("sidebar.toggle")
    t.ok(settle(lambda: folded() and fills(), "fills") is not None and frame()["state"] == "maximized", "maximized and folded: the page fills the window")
    b.cmd("sidebar.toggle")
    settle(lambda: not folded(), "unfolded")
    b.cmd("window.maximize")
except Exception as error:
    import traceback
    traceback.print_exc()
    t.ok(False, f"ran to the end ({error})")
t.done()

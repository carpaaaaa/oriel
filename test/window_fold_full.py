#!/usr/bin/env python3
"""Ctrl+S takes the page full screen with the tabs gone, and gives the window
back with them (fold.fullScreen, on by default; carpa, 25 Nov 2026: "it
removes the tabs and leaves the empty space, I want it full screen"). Full
screen put on by something else is left alone, and with the setting off Ctrl+S
only folds.

    npm run build && python3 test/window_fold_full.py
"""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b  # noqa: E402

t = b.T()
b.use("window-fold-full")
b.launch()


def frame():
    return b.call({"do": "window.frame"})["frame"]


def folded():
    return b.window()["sidebar"]["folded"]


def settle(pred, what, within=8):
    try:
        return b.wait_for(pred, within=within, what=what)
    except AssertionError:
        return None


try:
    b.call({"do": "window.place", "x": 80, "y": 80, "width": 1000, "height": 640, "visual": True})
    b.cmd("prefs.set", key="tabs.layout", value="top")
    time.sleep(0.8)
    t.ok(frame()["state"] == "free" and not folded(), "a window with its tabs")

    print("- Ctrl+S: the tabs go and the page goes full screen")
    b.cmd("sidebar.toggle")
    t.ok(settle(lambda: frame()["state"] == "fullScreen" and folded(), "folded and full screen") is not None, "the tabs are folded and the window is full screen")
    f = frame()
    t.ok(f["client"]["right"] - f["client"]["left"] >= 1000 and f["client"]["bottom"] - f["client"]["top"] >= 640, f"the client area is the screen's ({f['client']})")

    t.ok(frame()["borderless"] is False, "drawn as full screen, not as a window with its buttons")

    print("- Ctrl+S again: the tabs and the window back")
    b.cmd("sidebar.toggle")
    r = settle(lambda: frame()["state"] == "free" and not folded(), "unfolded and free")
    t.ok(r is not None, f"the tabs are back and the window is a window again ({frame()['state']}, folded {folded()})")
    v = frame()["visual"]
    t.ok(abs(v["width"] - 1000) <= 2 and abs(v["height"] - 640) <= 2, f"the size it had ({v})")

    print("- full screen put on by F11: Ctrl+S leaves it as it is")
    b.cmd("window.fullScreen", on=True)
    settle(lambda: frame()["state"] == "fullScreen", "full screen")
    b.cmd("sidebar.toggle")
    time.sleep(0.8)
    b.cmd("sidebar.toggle")
    time.sleep(0.8)
    t.ok(frame()["state"] == "fullScreen" and not folded(), "folded and unfolded inside F11's full screen, still full screen")
    b.cmd("window.fullScreen", on=False)
    settle(lambda: frame()["state"] == "free", "free")

    print("- Borderless window chosen: Ctrl+S is still drawn edge to edge, with the taskbar within reach")
    b.cmd("settings.set", id="window.fullScreenStyle", value="borderless")
    b.cmd("sidebar.toggle")
    t.ok(settle(lambda: frame()["state"] == "fullScreen" and folded(), "folded and full screen") is not None, "folded and full screen")
    t.ok(frame()["borderless"] is False, "edge to edge: not drawn as a window with its buttons")
    t.ok(frame()["client"]["bottom"] <= frame()["monitor"]["monitor"]["bottom"] - 1, f"the window leaves the taskbar's edge ({frame()['client']})")
    b.cmd("sidebar.toggle")
    settle(lambda: frame()["state"] == "free" and not folded(), "back")
    b.cmd("settings.set", id="window.fullScreenStyle", value="full")

    print("- the tabs down the side: the same")
    b.cmd("prefs.set", key="tabs.layout", value="side")
    time.sleep(0.8)
    b.cmd("sidebar.toggle")
    t.ok(settle(lambda: frame()["state"] == "fullScreen" and folded(), "folded and full screen") is not None and frame()["borderless"] is False, "folded and full screen, edge to edge")
    b.cmd("sidebar.toggle")
    t.ok(settle(lambda: frame()["state"] == "free" and not folded(), "back") is not None, "the column and the window back")
    b.cmd("prefs.set", key="tabs.layout", value="top")
    time.sleep(0.5)

    print("- the setting off: Ctrl+S only folds")
    b.cmd("prefs.set", key="fold.fullScreen", value=False)
    b.cmd("sidebar.toggle")
    t.ok(settle(lambda: folded(), "folded") is not None and frame()["state"] == "free", "folded, the window as it was")
    b.cmd("sidebar.toggle")
    time.sleep(0.6)
    t.ok(not folded() and frame()["state"] == "free", "unfolded, the window as it was")
except Exception as error:
    import traceback
    traceback.print_exc()
    t.ok(False, f"ran to the end ({error})")
t.done()

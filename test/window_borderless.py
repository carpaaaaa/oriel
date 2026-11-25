#!/usr/bin/env python3
"""Borderless window keeps the taskbar within reach (Settings › Appearance ›
Full screen, window.fullScreenStyle; studio/01 §1.12): the window covers the
screen with its buttons, but Windows isn't told it is full screen, so the
taskbar comes up from its edge when the pointer goes there. The window is a
pixel short on the taskbar's edge when the taskbar hides, and fills the work
area when it stays in view. Full screen as before is Electron's own.

Windows only (the taskbar is Windows')."""
import ctypes
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b  # noqa: E402

if sys.platform != "win32":
    print("Windows only")
    sys.exit(0)

t = b.T()


def frame():
    return b.call({"do": "window.frame"})["frame"]


def settle(pred, what, within=8):
    try:
        return b.wait_for(pred, within=within, what=what)
    except AssertionError:
        return None


def shell_state():
    """SHQueryUserNotificationState: 2 busy (a full-screen app), 5 free."""
    try:
        state = ctypes.c_int(0)
        ctypes.windll.shell32.SHQueryUserNotificationState(ctypes.byref(state))
        return state.value
    except Exception:
        return None


def covers(f):
    c, m, bar = f.get("client"), f.get("monitor"), f.get("taskbar")
    if not c or not m:
        return True
    if bar and not bar["autoHide"]:
        a = m["work"]
        return abs(c["left"] - a["left"]) <= 2 and abs(c["top"] - a["top"]) <= 2 and abs(c["right"] - a["right"]) <= 2 and abs(c["bottom"] - a["bottom"]) <= 2
    a = m["monitor"]
    edge = bar["edge"] if bar else "bottom"
    short = {"bottom": a["bottom"] - c["bottom"], "top": c["top"] - a["top"], "left": c["left"] - a["left"], "right": a["right"] - c["right"]}
    others = {"bottom": (c["top"] - a["top"], c["left"] - a["left"], a["right"] - c["right"]),
              "top": (a["bottom"] - c["bottom"], c["left"] - a["left"], a["right"] - c["right"]),
              "left": (c["top"] - a["top"], a["bottom"] - c["bottom"], a["right"] - c["right"]),
              "right": (c["top"] - a["top"], a["bottom"] - c["bottom"], c["left"] - a["left"])}[edge]
    return 0 < short[edge] <= 3 and all(abs(x) <= 1 for x in others)


def main():
    b.use("window-borderless")
    try:
        b.launch()
        b.call({"do": "window.place", "x": 60, "y": 60, "width": 800, "height": 560, "visual": True})
        time.sleep(0.5)
        print(f"  (the shell says {shell_state()} before; taskbar {frame().get('taskbar')})")

        print("- Borderless window: the window covers the screen, Windows isn't told it is full screen")
        b.cmd("settings.set", id="window.fullScreenStyle", value="borderless")
        time.sleep(0.5)
        b.cmd("window.fullScreen", on=True)
        f = settle(lambda: frame()["state"] == "fullScreen" and frame(), "full")
        t.ok(f and f["borderless"] is True, "the frame says borderless")
        t.ok(f and f["native"] is False, "Electron's own full screen is not on")
        t.ok(f and covers(f), f"it covers the screen, a pixel short where the taskbar hides, else the work area ({f and f.get('client')}, {f and f.get('taskbar')})")
        time.sleep(0.8)
        print(f"  (the shell says {shell_state()} with the borderless window)")
        t.ok(shell_state() != 2, "Windows doesn't take it for a full-screen app (the taskbar can come up)")
        b.cmd("window.fullScreen", on=False)
        f = settle(lambda: frame()["state"] == "free" and frame(), "free again")
        v = f and f["visual"]
        t.ok(f and abs(v["width"] - 800) <= 2 and abs(v["height"] - 560) <= 2, f"out of it, the window comes back to its size ({v})")

        print("- Full screen: Electron's own, as before")
        b.cmd("settings.set", id="window.fullScreenStyle", value="full")
        time.sleep(0.5)
        b.cmd("window.fullScreen", on=True)
        f = settle(lambda: frame()["state"] == "fullScreen" and frame(), "full")
        t.ok(f and f["borderless"] is False and f["native"] is True, "full screen is Electron's own")
        b.cmd("window.fullScreen", on=False)
        settle(lambda: frame()["state"] == "free", "free")

        print("- The choice changed while in full screen is put on at once")
        b.cmd("settings.set", id="window.fullScreenStyle", value="borderless")
        time.sleep(0.4)
        b.cmd("window.fullScreen", on=True)
        settle(lambda: frame()["state"] == "fullScreen" and frame()["native"] is False, "borderless full")
        b.cmd("settings.set", id="window.fullScreenStyle", value="full")
        f = settle(lambda: frame()["state"] == "fullScreen" and frame()["native"] is True and frame(), "full screen put on")
        t.ok(f is not None, "borderless to Full screen while in it: Electron's own full screen takes over")
        b.cmd("settings.set", id="window.fullScreenStyle", value="borderless")
        f = settle(lambda: frame()["state"] == "fullScreen" and frame()["native"] is False and frame(), "borderless put on")
        t.ok(f is not None, "and back to borderless")
        b.cmd("window.fullScreen", on=False)
        f = settle(lambda: frame()["state"] == "free" and frame(), "free")
        t.ok(f is not None and not frame().get("fixes"), f"free again, no correction needed ({frame().get('fixes')})")
    finally:
        t.done()


main()

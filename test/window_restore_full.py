#!/usr/bin/env python3
"""Maximize, full screen and back, Restore Down, and what windows.json keeps
(studio/01 §1.2, §1.12, §1.19), in a hidden world.

Restore Down after a full screen left maximized took the whole app down
(a segfault in 0.1.7): Windows sized the window inside the call that asked
it to. The client area stays on the screen at every step (the window's
buttons were seen cut off on the right). A window closed maximized keeps
the size it comes back to: Electron answers an empty rectangle, or the
screen's after a full screen, for a transparent window Windows maximized,
and windows.json had kept {{40, 30}, {-80, -80}}; such a line is read as
no place at all.

    npm run build && python3 test/window_restore_full.py
"""
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b  # noqa: E402

WORLD = "window-restore-full"
t = b.T()


def frame():
    return b.call({"do": "window.frame"})["frame"]


def settle(pred, what, within=6):
    try:
        return b.wait_for(pred, within=within, what=what)
    except AssertionError:
        return None


def on_screen(f):
    """The client area inside the monitor (full screen) or the work area."""
    c, m = f.get("client"), f.get("monitor")
    if not c or not m:
        return True
    area = m["monitor"] if f["state"] == "fullScreen" else m["work"]
    return c["left"] >= area["left"] - 1 and c["top"] >= area["top"] - 1 and c["right"] <= area["right"] + 1 and c["bottom"] <= area["bottom"] + 1


def windows_json():
    return json.loads((b.folder() / "windows.json").read_text(encoding="utf-8"))


def main():
    b.use(WORLD)
    try:
        b.launch()
        w = b.window()["id"]
        b.call({"do": "window.place", "window": w, "x": 40, "y": 40, "width": 800, "height": 560, "visual": True})
        time.sleep(0.5)

        print("- maximized, full screen, back, Restore Down")
        b.cmd("window.maximize")
        f = settle(lambda: frame()["state"] == "maximized" and frame(), "maximized")
        t.ok(f and on_screen(f), f"maximized: on the screen ({f and f.get('client')})")
        b.cmd("window.fullScreen", on=True)
        f = settle(lambda: frame()["state"] == "fullScreen" and frame(), "full screen")
        t.ok(f and on_screen(f), "full screen: on the screen")
        b.cmd("window.fullScreen", on=False)
        f = settle(lambda: frame()["state"] == "maximized" and frame(), "maximized again")
        t.ok(f and on_screen(f), "out of full screen: maximized again, on the screen")
        b.cmd("window.maximize")
        f = settle(lambda: frame()["state"] == "free" and frame(), "restored")
        t.ok(f is not None, "Restore Down after full screen: still running, free")
        if f:
            v = f["visual"]
            t.ok(abs(v["width"] - 800) <= 2 and abs(v["height"] - 560) <= 2, f"back to its size ({v})")
        t.ok(not frame().get("fixes"), f"no correction needed ({frame().get('fixes')})")

        print("- closed maximized: the size it comes back to is kept")
        b.cmd("window.maximize")
        settle(lambda: frame()["state"] == "maximized", "maximized")
        b.cmd("window.fullScreen", on=True)
        settle(lambda: frame()["state"] == "fullScreen", "full screen")
        b.cmd("window.fullScreen", on=False)
        settle(lambda: frame()["state"] == "maximized", "maximized")
        b.quit()
        line = windows_json()[0]
        t.ok(line.get("maximized") is True, "kept maximized")
        t.ok(line["frame"] == "{{40, 40}, {800, 560}}", f"the size it comes back to ({line['frame']})")

        print("- a line with an empty rectangle: the default place")
        rows = windows_json()
        rows[0]["frame"] = "{{40, 30}, {-80, -80}}"
        (b.folder() / "windows.json").write_text(json.dumps(rows), encoding="utf-8")
        b.use(WORLD, wipe=False)
        b.launch()
        f = settle(lambda: frame()["state"] == "maximized" and frame(), "maximized at launch", within=10)
        t.ok(f is not None, "comes back maximized")
        b.cmd("window.maximize")
        f = settle(lambda: frame()["state"] == "free" and frame(), "restored")
        t.ok(f and f["visual"]["width"] >= 640 and f["visual"]["height"] >= 420, f"Restore Down: a real window ({f and f['visual']})")
    except Exception as error:
        import traceback
        traceback.print_exc()
        t.ok(False, f"ran to the end ({error})")
    t.done()


if __name__ == "__main__":
    main()

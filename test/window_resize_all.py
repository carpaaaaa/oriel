#!/usr/bin/env python3
"""Every way the window changes size on real Windows, one after another and in
a row, with real input from the operating system (studio/01 §1.3, §1.4,
§1.12, §1.19; studio/06 §1.5): F11, Escape and the strip's Exit Full Screen
button out of full screen, from a free, a maximized and a snapped window;
minimize and Win+Up/Down while in full screen; a page's own full screen (a
video's); F11 pressed fast many times; a size of its own by dragging a
corner; maximize by the button, by a double click and by dragging to the
top; quitting in full screen and coming back.

After each step: Oriel is still running and answers, its interface and
overlay still draw (their renderers alive), nothing went wrong in the main
process, and the window is where it should be (the size it had before full
screen, the work area maximized, the screen in full screen). When Oriel goes
down, the step fails with how it went (exit code, the end of its log) and it
is launched again, so one crash doesn't hide the next.

Windows only (on a Mac full screen takes a Space)."""
import ctypes, json, os, sys, threading, time, traceback
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b

if sys.platform != "win32":
    print("window_resize_all.py runs on Windows only")
    sys.exit(0)

from ctypes import wintypes as wt

user32 = ctypes.WinDLL("user32", use_last_error=True)
try:
    user32.SetProcessDpiAwarenessContext(ctypes.c_void_p(-4))  # per monitor v2: physical pixels
except Exception:
    pass
user32.ShowWindow.argtypes = [ctypes.c_void_p, ctypes.c_int]
user32.SetForegroundWindow.argtypes = [ctypes.c_void_p]
user32.IsIconic.argtypes = [ctypes.c_void_p]

t = b.T()
WORLD = "window-resize-all"

# real input

def move_to(x, y):
    vx, vy = user32.GetSystemMetrics(76), user32.GetSystemMetrics(77)
    vw, vh = user32.GetSystemMetrics(78), user32.GetSystemMetrics(79)
    user32.mouse_event(0x1 | 0x8000 | 0x4000, int((x - vx) * 65535 / max(1, vw - 1)), int((y - vy) * 65535 / max(1, vh - 1)), 0, 0)
    user32.SetCursorPos(int(x), int(y))


def click(x, y, wait=0.3):
    move_to(x, y)
    time.sleep(0.1)
    user32.mouse_event(0x2, 0, 0, 0, 0)
    time.sleep(0.05)
    user32.mouse_event(0x4, 0, 0, 0, 0)
    time.sleep(wait)


def double_click(x, y):
    move_to(x, y)
    time.sleep(0.1)
    for _ in range(2):
        user32.mouse_event(0x2, 0, 0, 0, 0)
        time.sleep(0.03)
        user32.mouse_event(0x4, 0, 0, 0, 0)
        time.sleep(0.06)
    time.sleep(0.6)


def drag(start, end, steps=20, pause=0.02):
    move_to(*start)
    time.sleep(0.1)
    user32.mouse_event(0x2, 0, 0, 0, 0)
    time.sleep(0.12)
    for i in range(1, steps + 1):
        move_to(start[0] + (end[0] - start[0]) * i / steps, start[1] + (end[1] - start[1]) * i / steps)
        time.sleep(pause)
    time.sleep(0.25)
    user32.mouse_event(0x4, 0, 0, 0, 0)
    time.sleep(0.8)


VK = {"win": 0x5B, "left": 0x25, "up": 0x26, "right": 0x27, "down": 0x28, "esc": 0x1B, "f11": 0x7A, "alt": 0x12, "f4": 0x73}
EXTENDED = ("left", "up", "right", "down")


def chord(*keys, wait=0.8):
    for k in keys:
        user32.keybd_event(VK[k], 0, 0x1 if k in EXTENDED else 0, 0)
        time.sleep(0.03)
    for k in reversed(keys):
        user32.keybd_event(VK[k], 0, 0x2 | (0x1 if k in EXTENDED else 0), 0)
        time.sleep(0.03)
    time.sleep(wait)


# Oriel, and asking it things without waiting forever on a hung one

def answer(req, within=10):
    out = {}

    def ask():
        try:
            out["v"] = b.call(req)
        except Exception as e:
            out["e"] = e
    th = threading.Thread(target=ask, daemon=True)
    th.start()
    th.join(within)
    if th.is_alive():
        raise TimeoutError("Oriel didn't answer in %ss (hung?)" % within)
    if "e" in out:
        raise out["e"]
    return out["v"]


WID = None


def frame():
    return answer({"do": "window.frame", "window": WID})["frame"]


def state_of():
    return frame()["state"]


def settle(pred, within=6.0):
    end = time.time() + within
    last = None
    while time.time() < end:
        try:
            last = pred()
        except Exception:
            last = None
        if last:
            return last
        time.sleep(0.15)
    return last


f0 = None
P = None  # where the window lives, free (visible rectangle, DIP)
S = 1.0
errors_seen = 0
gone_seen = 0
crashes = []


def px(v):
    return v * S


def start(wipe=True):
    global WID, f0, S, errors_seen, gone_seen
    errors_seen = gone_seen = 0
    b.use(WORLD, wipe=wipe)
    b.launch()
    WID = b.call({"do": "tabs.state"})["windows"][0]["id"]
    f0 = frame()
    S = f0["scale"]


def place():
    answer({"do": "window.place", "visual": True, "window": WID, **P})
    b.cmd("tab.go", window=WID, input="data:text/html,<title>sizes</title><body style='margin:0;background:%23fff;font:15px sans-serif;padding:24px'><div id=v style='width:320px;height:180px;background:%23234'>a video</div>")
    b.wait_for(lambda: (b.active() or {}).get("title") == "sizes", what="page")
    focus()
    settle(lambda: state_of() == "free" and near_rect(frame()["visual"], P))


def focus():
    try:
        answer({"do": "window.focus", "window": WID})
        user32.SetForegroundWindow(ctypes.c_void_p(frame()["hwnd"]))
    except Exception:
        pass
    time.sleep(0.3)


def near_rect(a, want, by=2):
    return a and all(abs(a[k] - want[k]) <= by for k in ("x", "y", "width", "height"))


def log_tail(n=40):
    try:
        lines = (b.ROOT / "out" / f"bench-{b.WORLD}.log").read_text(errors="replace").splitlines()
        return "\n".join("       | " + l for l in lines[-n:])
    except Exception as e:
        return f"       (no log: {e})"


def healthy(where):
    """Running, answering, drawing, no new main process error. Relaunches when down."""
    global errors_seen, gone_seen
    running = b.PROC.poll() is None
    why = None
    if not running:
        why = f"Oriel exited (code {b.PROC.returncode}, 0x{(b.PROC.returncode or 0) & 0xffffffff:08x})"
    else:
        try:
            st = answer({"do": "state"})
            for root in ("chrome", "overlay"):
                if answer({"do": "ui", "js": "1+1", "root": root, "window": WID}, within=8).get("value") != 2:
                    why = f"the {root} view doesn't run its page"
            errs = st.get("errors") or []
            if len(errs) > errors_seen:
                for e in errs[errors_seen:]:
                    print("       main process: " + e.splitlines()[0])
                    for l in e.splitlines()[1:6]:
                        print("       " + l)
                why = why or "main process error: " + errs[errors_seen].splitlines()[0]
                errors_seen = len(errs)
            lost = st.get("gone") or []
            if len(lost) > gone_seen:
                why = why or "a process went down: " + ", ".join(lost[gone_seen:])
                gone_seen = len(lost)
        except Exception as e:
            why = f"no answer: {e}"
    ok = t.ok(why is None, f"{where}: Oriel still running and drawing" + (f" ({why})" if why else ""))
    if not ok:
        crashes.append((where, why))
        print(log_tail())
        try:
            b.quit()
        except Exception:
            pass
        if b.PROC and b.PROC.poll() is None:
            b.PROC.kill()
        time.sleep(1)
        start(wipe=True)
        place()
    return ok


def expect(where, want, rect=None):
    """want: 'free' (at rect or P), 'maximized' (the work area), 'fullScreen' (the screen)."""
    if not healthy(where):
        return False
    rect = rect or P
    if want == "free":
        got = settle(lambda: (lambda f: f if f["state"] == "free" and near_rect(f["visual"], rect) else None)(frame()), 6)
    elif want == "maximized":
        got = settle(lambda: (lambda f: f if f["state"] == "maximized" and near_rect(f["visual"], f["workArea"], 10) else None)(frame()), 6)
    elif want == "snapped":
        got = settle(lambda: (lambda f: f if f["state"] == "snapped" and near_rect(f["visual"], rect, 3) else None)(frame()), 6)
    else:
        got = settle(lambda: (lambda f: f if f["state"] == "fullScreen" and near_rect(f["bounds"], f["display"], 1) else None)(frame()), 6)
    if not got:
        try:
            f = frame()
            seen = f"{f['state']}, visual {f['visual']}, bounds {f['bounds']}, minimized {f['minimized']}"
        except Exception as e:
            seen = str(e)
        t.ok(False, f"{where}: {want} as it should be (it is {seen})")
        return False
    # The page on the card, the card in the window: nothing left behind.
    on_card = settle(lambda: (lambda pg, c: len(pg) == 1 and all(abs(pg[0]["rect"][k] - round(c[k])) <= 1.01 for k in ("x", "y", "width", "height")))(
        frame()["pages"], json.loads(answer({"do": "ui", "js": "JSON.stringify(document.querySelector('.card').getBoundingClientRect())", "window": WID})["value"])), 6)
    t.ok(got and on_card, f"{where}: {want}" + (f" at {rect}" if want == "free" else "") + ", the page on its card")
    return True


def button(name, root="chrome"):
    """A caption button's middle on the screen, in pixels: 'minimize', 'maximize', 'close'."""
    sel = ".reveal-strip .caption-buttons button." + name if root == "overlay" else ".window > .caption-buttons button." + name
    r = json.loads(answer({"do": "ui", "js": f"JSON.stringify(document.querySelector('{sel}')?.getBoundingClientRect() ?? null)", "root": root, "window": WID})["value"])
    if not r:
        return None
    f = frame()
    ox, oy = f["bounds"]["x"], f["bounds"]["y"]
    if root == "overlay":
        reg = answer({"do": "window.edges", "window": WID})["region"]
        ox, oy = ox + reg["x"], oy + reg["y"]
    return px(ox + r["x"] + r["width"] / 2), px(oy + r["y"] + r["height"] / 2)


def strip():
    v = frame()["visual"]
    return px(v["x"] + v["width"] - 240), px(v["y"] + 16)


def leave_full(way):
    """Out of full screen the way a person does it."""
    if way == "F11":
        chord("f11")
    elif way == "Escape":
        chord("esc")
        if settle(lambda: state_of() == "fullScreen", 0.6) and state_of() == "fullScreen":
            chord("esc")  # Press Esc twice to leave full screen, when on
    elif way == "button":
        d = frame()["display"]
        move_to(px(d["x"] + d["width"] / 2), px(d["y"]) + 1)
        up = settle(lambda: answer({"do": "window.edges", "window": WID})["reveal"], 4)
        p = button("maximize", "overlay") if up else None
        if not t.ok(p is not None, "the pointer at the top: the strip with Exit Full Screen comes down"):
            chord("f11")
            return
        click(*p, 0.8)
        move_to(px(d["x"] + d["width"] / 2), px(d["y"] + d["height"] / 2))
    else:  # the menu's command, as the app's own code asks
        b.cmd("window.fullScreen", window=WID, on=False)
    time.sleep(0.6)


def restore_minimized():
    hwnd = frame()["hwnd"]
    user32.ShowWindow(ctypes.c_void_p(hwnd), 9)  # SW_RESTORE, as a click on the taskbar
    time.sleep(1.0)
    focus()


try:
    start()
    work = f0["workArea"]
    P = {"x": work["x"] + 120, "y": work["y"] + 90, "width": min(900, work["width"] - 300), "height": min(560, work["height"] - 220)}
    print(f"screen {f0['display']}, work area {work}, scale {S}, the window at {P}")
    place()
    expect("placed", "free")

    # 1. Out of full screen every way, from a free window, twice each.
    for way in ("F11", "Escape", "button", "command"):
        for i in range(2):
            focus()
            chord("f11")
            expect(f"free, F11 ({way} {i + 1})", "fullScreen")
            leave_full(way)
            expect(f"free, out of full screen by {way} ({i + 1})", "free")

    # 2. From a maximized window (the button, a double click, Win+Up): back maximized.
    for how in ("button", "double click", "Win+Up"):
        focus()
        if how == "button":
            click(*button("maximize"), 0.8)
        elif how == "double click":
            double_click(*strip())
        else:
            chord("win", "up")
        expect(f"maximized by {how}", "maximized")
        for way in ("F11", "Escape", "button"):
            chord("f11")
            expect(f"maximized by {how}, F11 ({way})", "fullScreen")
            leave_full(way)
            expect(f"maximized by {how}, out of full screen by {way}: maximized again", "maximized")
        if how == "button":
            click(*button("maximize"), 0.8)
        elif how == "double click":
            double_click(*strip())
        else:
            chord("win", "down")
        expect(f"maximized by {how}, restored", "free")

    # 3. Dragged to the top (Aero Snap maximizes), full screen and out, then down.
    focus()
    sx, sy = strip()
    drag((sx, sy), (sx, px(work["y"]) + 1), steps=24, pause=0.03)
    chord("esc", wait=0.4)
    if expect("dragged to the top", "maximized"):
        chord("f11")
        expect("dragged to the top, F11", "fullScreen")
        chord("f11")
        expect("dragged to the top, out of full screen: maximized again", "maximized")
        chord("win", "down")
        expect("dragged to the top, Win+Down", "free")
    place()

    # 4. Snapped to a side: full screen and out, back where Snap put it.
    for side in ("left", "right"):
        focus()
        chord("win", side)
        f = settle(lambda: (lambda f: f if f["state"] == "snapped" else None)(frame()), 6)
        if not f:
            print(f"       (not snapped to the {side}: Windows didn't arrange the window)")
            place()
            continue
        snapped = f["visual"]
        expect(f"snapped {side}", "snapped", snapped)
        for way in ("F11", "button"):
            chord("f11")
            expect(f"snapped {side}, F11 ({way})", "fullScreen")
            leave_full(way)
            expect(f"snapped {side}, out of full screen by {way}: where Snap put it", "snapped", snapped)
        place()
        expect(f"after snapped {side}", "free")

    # 5. Minimized while in full screen (the strip's button), back, then out.
    focus()
    chord("f11")
    expect("F11 before minimizing", "fullScreen")
    d = frame()["display"]
    move_to(px(d["x"] + d["width"] / 2), px(d["y"]) + 1)
    if settle(lambda: answer({"do": "window.edges", "window": WID})["reveal"], 4):
        click(*button("minimize", "overlay"), 1.0)
        healthy("minimized from full screen")
        t.ok(settle(lambda: frame()["minimized"], 4), "the strip's minimize: minimized")
        move_to(px(d["x"] + d["width"] / 2), px(d["y"] + d["height"] / 2))
        restore_minimized()
        expect("full screen, minimized and back", "fullScreen")
    chord("f11")
    expect("full screen, minimized, back, F11", "free")

    # 6. Win+Down and Win+Up in full screen: whatever Windows does, it holds,
    #    and F11 (or the taskbar) brings it back where it lives.
    for keys in (("win", "down"), ("win", "up"), ("win", "left")):
        focus()
        chord("f11")
        expect(f"F11 before {'+'.join(keys)}", "fullScreen")
        chord(*keys, wait=1.2)
        healthy(f"full screen, {'+'.join(keys)}")
        if frame()["minimized"]:
            restore_minimized()
        st = state_of()
        if st == "fullScreen":
            chord("f11")
        elif st != "free":
            place()
        expect(f"full screen, {'+'.join(keys)}, back", "free")
        place()

    # 7. F11 fast, many times: never half way.
    for n in (4, 6, 9):
        focus()
        for _ in range(n):
            chord("f11", wait=0.05)
        time.sleep(1.5)
        healthy(f"F11 {n} times fast")
        if n % 2:
            expect(f"F11 {n} times fast: full screen", "fullScreen")
            chord("f11")
        expect(f"F11 {n} times fast, then out", "free")
        place()

    # 8. A size of its own (a corner dragged), full screen and out: that size.
    focus()
    v = frame()["visual"]
    corner = (px(v["x"] + v["width"] - 2), px(v["y"] + v["height"] - 2))
    drag(corner, (corner[0] - px(160), corner[1] - px(90)), steps=20)
    mine = frame()["visual"]
    t.ok(mine["width"] < P["width"] - 100 and mine["height"] < P["height"] - 50, f"a corner dragged: smaller ({mine})")
    for way in ("F11", "Escape", "button"):
        chord("f11")
        expect(f"own size, F11 ({way})", "fullScreen")
        leave_full(way)
        expect(f"own size, out of full screen by {way}", "free", mine)
    # Then maximized, full screen, out, restored: that size still.
    click(*button("maximize"), 0.8)
    expect("own size, maximized", "maximized")
    chord("f11")
    expect("own size, maximized, F11", "fullScreen")
    chord("f11")
    expect("own size, maximized, out of full screen", "maximized")
    click(*button("maximize"), 0.8)
    expect("own size, maximized and restored", "free", mine)
    place()

    # 9. A page's own full screen (a video's), from free, maximized and F11.
    tab = b.active()["id"]

    def page_full(on):
        if on:
            b.ev(tab, "document.getElementById('v').requestFullscreen().then(() => 1, () => 0)")
            settle(lambda: b.ev(tab, "!!document.fullscreenElement"), 6)
        else:
            b.ev(tab, "document.exitFullscreen().then(() => 1, () => 0)")
            settle(lambda: not b.ev(tab, "!!document.fullscreenElement"), 6)
        time.sleep(0.8)

    for base in ("free", "maximized"):
        focus()
        if base == "maximized":
            click(*button("maximize"), 0.8)
            expect("maximized before the page's full screen", "maximized")
        for way in ("Escape", "page"):
            page_full(True)
            healthy(f"{base}, the page full screen ({way})")
            f = frame()
            t.ok(near_rect(f["bounds"], f["display"], 1), f"{base}, the page full screen: the window covers the screen ({f['bounds']})")
            if way == "Escape":
                chord("esc")
                if settle(lambda: b.ev(tab, "!!document.fullscreenElement"), 0.6):
                    chord("esc")
                settle(lambda: not b.ev(tab, "!!document.fullscreenElement"), 6)
            else:
                page_full(False)
            expect(f"{base}, the page out of full screen by {way}", base)
        if base == "maximized":
            click(*button("maximize"), 0.8)
            expect("restored after the page's full screen", "free")
    focus()
    chord("f11")
    expect("F11 before the page's full screen", "fullScreen")
    page_full(True)
    healthy("F11, then the page full screen")
    page_full(False)
    expect("F11, the page out of full screen: still F11's", "fullScreen")
    chord("f11")
    expect("F11, the page's full screen, out", "free")

    # 10. Minimize and restore, free and maximized (the button, then the taskbar).
    for base in ("free", "maximized"):
        focus()
        if base == "maximized":
            click(*button("maximize"), 0.8)
            expect("maximized before minimizing", "maximized")
        click(*button("minimize"), 1.0)
        healthy(f"{base}, minimized")
        t.ok(settle(lambda: frame()["minimized"], 4), f"{base}: minimized")
        restore_minimized()
        expect(f"{base}, minimized and back", base)
        if base == "maximized":
            click(*button("maximize"), 0.8)
            expect("restored after minimizing", "free")

    # 11. Quit in full screen, come back in full screen, leave: the size it had.
    for before in ("free", "maximized"):
        place()
        focus()
        if before == "maximized":
            click(*button("maximize"), 0.8)
            expect("maximized before quitting in full screen", "maximized")
        chord("f11")
        expect(f"{before}, F11 before quitting", "fullScreen")
        b.quit()
        time.sleep(1)
        start(wipe=False)
        settle(lambda: state_of() == "fullScreen", 10)
        focus()
        expect(f"{before}, launched again in full screen", "fullScreen")
        chord("f11")
        expect(f"{before}, launched again, out of full screen", before)
        if before == "maximized":
            click(*button("maximize"), 0.8)
            expect("launched again, maximized, restored", "free")

    # 12. Alt+F4, Windows' way to quit, with Confirm before quitting on: the
    #     last window asks (and Windows' own close on the same press is held
    #     back on Cancel), another window only closes.
    place()
    expect("before Alt+F4", "free")
    b.cmd("prefs.set", window=WID, key="quit.confirm", value=True)
    windows = lambda: len(b.call({"do": "tabs.state"})["windows"])
    asked = lambda: b.call({"do": "settingsb.quitAsked"})["asked"]
    b.call({"do": "settingsb.quitAnswer", "answer": "cancel"})
    click(px(P["x"] + P["width"] / 2), px(P["y"] + P["height"] / 2), 0.4)
    chord("alt", "f4", wait=1.5)
    t.ok(b.PROC.poll() is None and windows() == 1 and asked() == 1, f"Alt+F4 on the last window: Quit Oriel? asked ({asked()}), Cancel keeps it open ({windows()} window)")
    expect("Alt+F4, Cancel", "free")
    b.cmd("window.new", window=WID)
    b.wait_for(lambda: windows() == 2, what="a second window")
    time.sleep(1.5)
    chord("alt", "f4", wait=1.5)
    t.ok(settle(lambda: windows() == 1, 4) and asked() == 1, "Alt+F4 on another window closes it without asking")
    b.call({"do": "settingsb.quitAnswer", "answer": "quit"})
    focus()
    click(px(P["x"] + P["width"] / 2), px(P["y"] + P["height"] / 2), 0.4)
    chord("alt", "f4", wait=0.5)
    t.ok(settle(lambda: b.PROC.poll() is not None, 15), "Alt+F4 on the last window, Quit: Oriel quits")

except Exception:
    traceback.print_exc()
    t.ok(False, "the run went through to the end")

if crashes:
    print("Oriel went down %d times:" % len(crashes))
    for where, why in crashes:
        print(f"  - {where}: {why}")
t.done()

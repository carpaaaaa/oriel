#!/usr/bin/env python3
"""Tabs picked with Ctrl or Shift let go on a click anywhere that isn't a pick
(studio/01 §3.18; carpa, 25 Nov 2026: "when you pick more than one tab with
Ctrl, clicking outside takes the selection off, now you can't deselect"), in
the column and across the top, in a hidden world.

Picked, the tabs are let go by: a click on the column's empty place, on the
page, on a button, on a tab that isn't picked, a plain click on a picked tab,
Escape. They are kept by: a right click on a picked tab (its menu acts on
them), dragging a picked tab, Ctrl-click toggling, the X on a picked tab.

    npm run build && python3 test/tabs_pick_clear.py
"""
import json
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b  # noqa: E402

WORLD = "tabs-pick-clear"


class Site(BaseHTTPRequestHandler):
    def do_GET(self):
        name = self.path.split("n=")[-1]
        body = f"<!doctype html><title>{name}</title><body style='margin:0;background:#fff'><p>{name}".encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a):
        pass


srv = ThreadingHTTPServer(("127.0.0.1", 0), Site)
threading.Thread(target=srv.serve_forever, daemon=True).start()
BASE = f"http://127.0.0.1:{srv.server_port}"
t = b.T()


def tab(n):
    return next((x for x in b.state()["tabs"] if x["url"].endswith(f"n={n}")), None)


def window():
    return b.state()["windows"][0]


def picked():
    return set(window().get("picked") or [])


def rect(js):
    return b.ui(f"(() => {{ const e = {js}; if (!e) return null; const r = e.getBoundingClientRect(); return {{ x: r.left, y: r.top, w: r.width, h: r.height }} }})()")


def centre(sel):
    r = rect(f"document.querySelector({sel!r})")
    return r["x"] + r["w"] / 2, r["y"] + r["h"] / 2


def click(sel, mods=None, button="left"):
    x, y = centre(sel)
    b.mouse(x, y, button=button, modifiers=mods)
    time.sleep(0.35)


def ctrl_click(sel):
    """A Ctrl-click, as the pointer gives it: pressed, let go, clicked. (On the
    Mac the bench's Ctrl-click is a right click, as for a person.)"""
    b.ui("(() => { const e = document.querySelector(%r); const r = e.getBoundingClientRect(); const at = { bubbles: true, cancelable: true, button: 0, ctrlKey: true, pointerId: 7, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };"
         " e.dispatchEvent(new PointerEvent('pointerdown', at)); window.dispatchEvent(new PointerEvent('pointerup', at)); e.dispatchEvent(new MouseEvent('click', at)); return true })()" % sel)
    time.sleep(0.35)


def pick(ids, tile):
    """Ctrl-click each tile, as a person picks several."""
    for i in ids:
        ctrl_click(tile(i))


def settle_picks(want, what):
    return b.wait_for(lambda: picked() == want, within=3, what=what)


def run(layout):
    row = (lambda i: f".row[data-tab=\"{i}\"]") if layout == "side" else (lambda i: f".strip-tab[data-tab=\"{i}\"]")
    empty = ".void" if layout == "side" else ".strip-spring"
    A, B, C, D, E = (tab(n)["id"] for n in "abcde")
    b.cmd("tab.select", id=A)
    time.sleep(0.5)

    print(f"- {layout}: Ctrl-click picks, the first pick takes the tab in front with it")
    pick([C, D], row)
    t.ok(picked() == {A, C, D}, f"picked the tab in front and the two ({len(picked())})")
    t.ok(b.ui(f"document.querySelectorAll('.picked').length") == 3, "three tabs drawn picked")

    print(f"- {layout}: a click on the empty place lets them go")
    click(empty)
    t.ok(settle_picks(set(), "let go"), "the selection is gone")
    t.ok(window()["activeID"] == A, "the tab in front is as it was")

    print(f"- {layout}: a click on the page lets them go")
    pick([C, D], row)
    card = rect("document.querySelector('.card')")
    b.mouse(card["x"] + card["w"] / 2, card["y"] + card["h"] / 2)
    t.ok(settle_picks(set(), "let go by the page"), "a click on the page takes the selection off")

    print(f"- {layout}: Escape lets them go")
    pick([C, D], row)
    t.ok(len(picked()) == 3, "picked again")
    b.cmd("window.focusPage")
    b.key("Escape")
    t.ok(settle_picks(set(), "let go by Escape"), "Escape takes the selection off")
    t.ok(window()["activeID"] == A, "and the tab in front is as it was")

    print(f"- {layout}: a click on a tab that isn't picked")
    pick([C, D], row)
    click(row(E))
    t.ok(settle_picks(set(), "let go by another tab"), "a plain click on another tab lets them go")
    t.ok(b.wait_for(lambda: window()["activeID"] == E, within=3, what="E in front"), "and goes to it")

    print(f"- {layout}: a plain click on a picked tab")
    b.cmd("tab.select", id=A)
    time.sleep(0.4)
    pick([C, D], row)
    click(row(D))
    t.ok(settle_picks(set(), "let go by a picked tab"), "a plain click on a picked tab lets the rest go")
    t.ok(b.wait_for(lambda: window()["activeID"] == D, within=3, what="D in front"), "and goes to it")

    print(f"- {layout}: a click on a button")
    b.cmd("tab.select", id=A)
    time.sleep(0.4)
    pick([C, D], row)
    click(".tabbar .strip-near .strip-helm .door:last-child" if layout == "top" else ".helm .door:last-child")
    t.ok(settle_picks(set(), "let go by a button"), "a click on the reload button lets them go")

    print(f"- {layout}: a single pick is let go too")
    b.cmd("tab.select", id=A)
    time.sleep(0.4)
    pick([C], row)
    ctrl_click(row(C))
    t.ok(settle_picks({A}, "one pick left"), "Ctrl-click toggles C off: one pick left")
    click(empty)
    t.ok(settle_picks(set(), "single let go"), "a click outside lets the one go as well")

    print(f"- {layout}: right click on a picked tab keeps them, its menu acts on them")
    pick([C, D], row)
    before = picked()
    # Held down: the menu opens under the pointer, and a release would pick its first item.
    x, y = centre(row(D))
    b.mouse(x, y, button="right", phase="down")
    time.sleep(0.6)
    t.ok(picked() == before, f"still picked after the right click ({len(picked())})")
    labels = json.loads(b.ui("JSON.stringify([...(document.querySelector('.menu')?.children ?? [])].map(e => e.dataset.label || ''))", root="overlay") or "[]")
    t.ok("Close 3 Tabs" in labels, f"the menu is the one for the three ({[x for x in labels if x][:5]}...)")
    b.ui("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); true", root="overlay")
    b.mouse(x, y, button="right", phase="up")
    time.sleep(0.4)
    t.ok(picked() == before, "and after the menu is closed")

    print(f"- {layout}: dragging a picked tab keeps them")
    if len(picked()) != 3:
        pick([C, D], row)
    r = rect(f"document.querySelector('{row(D)}')")
    x0, y0 = r["x"] + r["w"] / 2, r["y"] + r["h"] / 2
    along = (lambda i: [x0, y0 + 3 * i]) if layout == "side" else (lambda i: [x0 + 3 * i, y0])
    b.call({"do": "window.drag", "path": [along(i) for i in range(10)] + [along(9)] * 5})
    time.sleep(0.6)
    t.ok(len(picked()) == 3, f"the picks survive a carry ({len(picked())})")

    print(f"- {layout}: Ctrl-click still toggles")
    click(empty)
    settle_picks(set(), "cleared")
    b.cmd("tab.select", id=A)
    time.sleep(0.4)
    ctrl_click(row(C))
    ctrl_click(row(D))
    t.ok(picked() == {A, C, D}, "Ctrl-click adds")
    ctrl_click(row(D))
    t.ok(picked() == {A, C}, "Ctrl-click takes away")
    click(row(E), ["shift"])
    t.ok(E in picked() and len(picked()) >= 2, f"Shift-click picks the range to E ({len(picked())})")
    click(empty)
    settle_picks(set(), "cleared at the end")


def main():
    b.use(WORLD)
    try:
        b.launch()
        b.call({"do": "window.place", "x": 0, "y": 0, "width": 1000, "height": 700, "visual": True})
        time.sleep(0.5)
        for n in "abcde":
            b.cmd("tab.open", url=f"{BASE}/?n={n}", foreground=True)
        b.wait_for(lambda: all(tab(n) for n in "abcde"), what="five tabs")
        time.sleep(0.8)
        run("side")
        b.cmd("settings.set", id="tabs.layout", value="top")
        b.wait_for(lambda: b.ui("!!document.querySelector('.tabbar')"), within=5, what="the strip")
        time.sleep(0.8)
        run("top")

        print("- its menu acts on the picked tabs, not on the one under the pointer")
        A, B, C, D, E = (tab(n)["id"] for n in "abcde")
        b.cmd("tab.select", id=B)
        time.sleep(0.4)
        b.cmd("tab.pick", id=D, mode="toggle")
        b.cmd("tab.pick", id=E, mode="toggle")
        time.sleep(0.3)
        x, y = centre(f".strip-tab[data-tab=\"{E}\"]")
        b.mouse(x, y, button="right", phase="down")
        time.sleep(0.6)
        b.ui("(() => { const e = [...document.querySelectorAll('.menu .menu-item')].find(x => x.dataset.label === 'Close 3 Tabs');"
             " e.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true })); e.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0 })); return 1 })()", root="overlay")
        b.mouse(x, y, button="right", phase="up")
        t.ok(b.wait_for(lambda: not tab("d") and not tab("e") and not tab("b"), within=5, what="the three closed"), "Close 3 Tabs closes B, D and E")
        t.ok(tab("a") and tab("c"), "the others stay")
    except Exception as error:
        import traceback
        traceback.print_exc()
        t.ok(False, f"ran to the end ({error})")
    t.done()


if __name__ == "__main__":
    main()

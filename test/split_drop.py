#!/usr/bin/env python3
"""A tab carried from the column onto the page (studio/01 §8.17; TabDrag.swift,
Browser.pair), the divider (§8.14), the X on picked tabs (§3.19), and a tab
carried onto another tab (carpa, 25 Nov 2026), in a hidden world.

Carried over the page, the bands show at its edges (the overlay's
split.drop); in a band, the preview of that side; let go there, the tab
stands beside the page in front, the shares even, with the keys. The press
had opened the carried tab: over the page, the page from before comes back
and is the one split with. Let go in the middle, nothing happens. The
divider changes the shares. With tabs picked by Ctrl-click, the X on one of
them closes them all.

Shift held while a tab is carried onto another tab marks that tab (the
`split-target` class) and letting go puts the two side by side, in the column
and across the top; the mark follows Shift pressed or let go mid-carry, by the
pointer's events and by the key's own. Without Shift, resting on a tab's edge
marks nothing and the tab lands where it was carried, as in any reorder; across
the top, resting on a tab's middle marks it too, and letting go splits.

    npm run build && python3 test/split_drop.py
"""
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b  # noqa: E402

WORLD = "split-drop"


class Site(BaseHTTPRequestHandler):
    def do_GET(self):
        name = self.path.split("n=")[-1]
        body = f"<!doctype html><title>{name}</title><p>{name}".encode()
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


def split_of(tid):
    return next((s for s in window().get("splits") or [] if tid in s["tabs"]), None)


def rect(js):
    return b.ui(f"(() => {{ const r = {js}.getBoundingClientRect(); return {{ x: r.left, y: r.top, w: r.width, h: r.height }} }})()")


def carry(tid, to, hold=40, layout="side"):
    """Press the tab's line in the column (or its tab across the top), move over the page to `to`, wait, let go."""
    r = rect(f"document.querySelector({sel(tid, layout)!r})")
    start = [r["x"] + r["w"] / 2, r["y"] + r["h"] / 2]
    path = [start] + [[start[0] + (to[0] - start[0]) * i / 12, start[1] + (to[1] - start[1]) * i / 12] for i in range(1, 13)]
    path += [to] * hold
    b.call({"do": "window.drag", "path": path})
    time.sleep(0.6)


# Shift onto another tab (carpa, 25 Nov 2026)

def sel(tid, layout):
    return f'.row[data-tab="{tid}"]' if layout == "side" else f'.strip-tab[data-tab="{tid}"]'


def centre(selector):
    r = rect(f"document.querySelector({selector!r})")
    return [r["x"] + r["w"] / 2, r["y"] + r["h"] / 2]


def drag_over(tid, over, plan, layout, at=0.5):
    """Press the tab, go to a point of the other tab (`at` its length from the
    start), and stay there: `plan` is (steps, Shift held) one after another.
    Runs on its own, so the interface can be read while the button is down."""
    a, z = centre(sel(tid, layout)), centre(sel(over, layout))
    r = rect(f"document.querySelector({sel(over, layout)!r})")
    if layout == "side":
        z = [z[0], r["y"] + r["h"] * at]
    else:
        z = [r["x"] + r["w"] * at, z[1]]
    path = [a] + [[a[0] + (z[0] - a[0]) * i / 12, a[1] + (z[1] - a[1]) * i / 12] for i in range(1, 13)]
    for steps, shift in plan:
        path += [z + [["shift"]] if shift else z] * steps
    th = threading.Thread(target=lambda: b.call({"do": "window.drag", "path": path}, timeout=90), daemon=True)
    th.start()
    return th


def marked():
    return b.ui("[...document.querySelectorAll('.split-target')].map(e => e.dataset.tab).join(',')")


def row_order():
    return [x["id"] for x in window()["tabs"]]


def shift_tests(layout):
    where = "column" if layout == "side" else "strip"
    n = len(window()["tabs"])
    names = [f"{layout}{i}" for i in range(3)]
    for nm in names:
        b.cmd("tab.open", url=f"{BASE}/?n={nm}", foreground=True)
    b.wait_for(lambda: all(tab(nm) for nm in names), what="three tabs")
    X, Y, Z = (tab(nm)["id"] for nm in names)
    b.cmd("tab.select", id=X)
    time.sleep(0.8)

    print(f"- {where}: no Shift, resting on a tab marks nothing and lets the tab land where it was carried")
    th = drag_over(Z, X, [(80, False)], layout, at=0.2)
    b.wait_for(lambda: b.ui("document.documentElement.classList.contains('carrying')"), within=10, what="the carry under way")
    time.sleep(1.0)
    t.ok(marked() == "", f"nothing marked while it rests ({marked()!r})")
    th.join()
    time.sleep(0.8)
    t.ok(split_of(X) is None and split_of(Z) is None, "no split")
    try:
        b.wait_for(lambda: row_order().index(Z) < row_order().index(X), within=8, what="Z before X")
    except AssertionError:
        pass
    order = row_order()
    t.ok(order.index(Z) < order.index(X), f"it landed before the tab it rested on ({order.index(Z)} < {order.index(X)})")

    print(f"- {where}: Shift held onto a tab marks it, letting go splits the two")
    th = drag_over(Y, X, [(90, True)], layout)
    t.ok(b.wait_for(lambda: marked() == X, within=4, what="X marked"), "the tab it is over is marked")
    th.join()
    s = b.wait_for(lambda: split_of(X), within=4, what="the split")
    t.ok(s["tabs"] == [X, Y], f"the carried tab on the right of the one it was let go on ({len(s['tabs'])} pages)")
    t.ok(b.wait_for(lambda: marked() == "", within=8, what="mark gone"), "the mark goes with the carry")
    t.ok(b.wait_for(lambda: window()["activeID"] == Y, within=8, what="Y in front"), "the carried tab has the keys")
    order = row_order()
    t.ok(order.index(Y) == order.index(X) + 1, "side by side in the row too")

    print(f"- {where}: Shift over its own partner marks nothing")
    th = drag_over(Y, X, [(70, True)], layout)
    b.wait_for(lambda: b.ui("document.documentElement.classList.contains('carrying')"), within=10, what="the carry under way")
    time.sleep(1.2)
    t.ok(marked() == "", f"a page of a split isn't marked for the page beside it ({marked()!r})")
    th.join()
    time.sleep(0.6)
    s = split_of(X)
    t.ok(s and s["tabs"] == [X, Y], "the split is as it was")

    print(f"- {where}: Shift pressed and let go mid-carry, by the pointer's events")
    b.cmd("split.separate")
    time.sleep(0.5)
    th = drag_over(Z, Y, [(60, False), (70, True), (70, False)], layout, at=0.1)
    t.ok(b.wait_for(lambda: marked() == "" , within=2, what="nothing yet"), "nothing marked before Shift")
    t.ok(b.wait_for(lambda: marked() == Y, within=4, what="Y marked"), "Shift pressed: the tab under it is marked")
    t.ok(b.wait_for(lambda: marked() == "", within=4, what="mark gone"), "Shift let go: the mark goes")
    th.join()
    time.sleep(0.6)
    t.ok(split_of(Y) is None, "let go without Shift: no split")

    print(f"- {where}: Shift pressed and let go mid-carry, by the key's own events")
    th = drag_over(Z, Y, [(300, False)], layout, at=0.1)
    b.wait_for(lambda: b.ui("document.documentElement.classList.contains('carrying')"), within=10, what="the carry under way")
    # The pointer has to be at rest on the tab: a later move would say Shift isn't down.
    lifted = ".line.carried" if layout == "side" else ".strip-tab.carried"
    b.wait_for(lambda: b.ui("(() => { const c = document.querySelector(%r)?.getBoundingClientRect(); const y = document.querySelector(%r)?.getBoundingClientRect();"
                            " return !!c && !!y && Math.abs((c.top + c.bottom) / 2 - (y.top + y.bottom) / 2) < 6 && Math.abs((c.left + c.right) / 2 - (y.left + y.right) / 2) < 12 })()" % (lifted, sel(Y, layout))),
               within=15, what="the carried tab over Y")
    time.sleep(1.0)
    b.ui("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift', shiftKey: true })); true")
    t.ok(b.wait_for(lambda: marked() == Y, within=8, what="Y marked by the key"), "Shift pressed with the pointer still: marked")
    b.ui("window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Shift' })); true")
    t.ok(b.wait_for(lambda: marked() == "", within=8, what="mark gone by the key"), "Shift let go with the pointer still: unmarked")
    th.join()
    time.sleep(0.6)
    t.ok(split_of(Y) is None, "let go without Shift: no split")

    if layout == "top":
        # Across the top, onto the middle of a tab splits with no key (carpa, 25 Nov 2026).
        print(f"- {where}: no Shift, let go on the middle of a tab: the two side by side")
        th = drag_over(Z, Y, [(90, False)], layout, at=0.5)
        t.ok(b.wait_for(lambda: marked() == Y, within=6, what="Y marked"), "the tab it is over is marked, no key held")
        th.join()
        s = b.wait_for(lambda: split_of(Y), within=4, what="the split")
        t.ok(s["tabs"] == [Y, Z], f"the carried tab on the right of the one it was let go on ({len(s['tabs'])} pages)")

    for nm in names:
        b.cmd("tab.close", id=tab(nm)["id"])
    time.sleep(0.6)


def strip_band():
    """A tab carried from the strip over the page's band splits it, as one from the column does."""
    print("- strip: let go in the page's right band: beside the page")
    names = ["band0", "band1"]
    for nm in names:
        b.cmd("tab.open", url=f"{BASE}/?n={nm}", foreground=True)
    b.wait_for(lambda: all(tab(nm) for nm in names), what="two tabs")
    X, Y = (tab(nm)["id"] for nm in names)
    b.cmd("tab.select", id=X)
    time.sleep(0.8)
    card = rect("document.querySelector('.card')")
    carry(Y, [card["x"] + card["w"] - 40, card["y"] + card["h"] / 2], layout="top")
    s = b.wait_for(lambda: split_of(X), within=8, what="the split")
    t.ok(s["tabs"] == [X, Y], "the carried tab on the right of the page it was let go on")
    t.ok(b.wait_for(lambda: window()["overlay"]["kind"] == "none", within=8, what="the preview gone"), "the preview gone")
    for nm in names:
        b.cmd("tab.close", id=tab(nm)["id"])
    time.sleep(0.6)


def strip_edit():
    """Across the top a click on the tab in front edits its address; a carry from it doesn't (the press waits for the button up)."""
    print("- strip: a click on the tab in front edits its address, a carry from it doesn't")
    b.cmd("tab.open", url=f"{BASE}/?n=edit", foreground=True)
    b.wait_for(lambda: tab("edit"), what="a tab")
    E = tab("edit")["id"]
    b.cmd("tab.select", id=E)
    time.sleep(0.8)
    editing = lambda: b.ui("!!window.__tabsUI.state().tabEdit")
    r = rect(f"document.querySelector({sel(E, 'top')!r})")
    x, y = r["x"] + 40, r["y"] + r["h"] / 2
    b.call({"do": "window.drag", "path": [[x + 3 * i, y] for i in range(10)] + [[x + 27, y]] * 5})
    time.sleep(0.8)
    t.ok(not editing(), "carried from, the field stays shut")
    b.mouse(x, y)
    t.ok(b.wait_for(editing, within=8, what="the address edited"), "clicked, its address is typed in the tab")
    b.key("Escape")
    t.ok(b.wait_for(lambda: not editing(), within=8, what="the edit over"), "Escape gives the title back")
    b.cmd("tab.close", id=E)
    time.sleep(0.6)


def settings_note():
    """Settings says how to get into Split View, with the Shift-drag in it."""
    print("- Settings names the way in")
    b.cmd("app.settings")
    st = b.wait_for(lambda: next((x for x in window()["tabs"] if x.get("internal") == "settings"), None), what="Settings tab")
    def ev(js):
        try:
            return b.ev(st["id"], js)
        except RuntimeError:  # the page isn't there yet
            return None

    b.wait_for(lambda: ev("document.querySelectorAll('.sr').length"), what="rows")
    ev("(() => { const f = document.querySelector('.st-find input'); f.value = 'side by side'; f.dispatchEvent(new Event('input', {bubbles: true})) })()")
    time.sleep(0.5)
    detail = ev("document.querySelector('.sr[data-row=\"note.split\"] .sr-detail')?.textContent")
    t.ok(detail is not None and "Shift" in detail and "drag a tab onto another" in detail, f"the note: {detail!r}")
    t.ok(detail is not None and "Alt-click a tab" in detail and "drag a tab onto a page" in detail and "Alt+Shift+N" in detail, "and the other ways in")
    t.ok(detail is not None and "\u2014" not in detail and "\u2013" not in detail, "no long dash")


def main():
    b.use(WORLD)
    try:
        b.launch()
        # Room for two pages side by side on a small screen too (a CI runner).
        b.call({"do": "window.place", "x": 0, "y": 0, "width": 1000, "height": 700, "visual": True})
        time.sleep(0.5)
        for n in ["a", "b", "c", "d"]:
            b.cmd("tab.open", url=f"{BASE}/?n={n}", foreground=True)
        b.wait_for(lambda: all(tab(n) for n in "abcd"), what="four tabs")
        A, B, C, D = (tab(n)["id"] for n in "abcd")
        b.cmd("tab.select", id=A)
        time.sleep(0.8)
        card = rect("document.querySelector('.card')")
        middle = [card["x"] + card["w"] / 2, card["y"] + card["h"] / 2]
        right = [card["x"] + card["w"] - 40, middle[1]]

        print("- let go in the middle of the page: nothing")
        carry(B, middle)
        t.ok(split_of(A) is None, "no split")
        t.ok(b.wait_for(lambda: window()["overlay"]["kind"] == "none", within=8, what="the bands gone"), "the bands gone")
        t.ok(b.wait_for(lambda: window()["activeID"] == A, within=8, what="A in front"), "the page from before the press is back in front")

        print("- let go in the right band: beside the page")
        carry(B, right)
        s = b.wait_for(lambda: split_of(A), within=8, what="the split")
        t.ok(s["tabs"] == [A, B], f"the carried tab on the right ({s['tabs']})")
        t.ok(all(abs(x - 0.5) < 0.01 for x in s["sizes"]), f"even shares ({s['sizes']})")
        t.ok(b.wait_for(lambda: window()["activeID"] == B, within=8, what="B in front"), "the carried tab has the keys")
        t.ok(b.wait_for(lambda: window()["overlay"]["kind"] == "none", within=8, what="the preview gone"), "the preview gone")

        print("- the divider")
        b.wait_for(lambda: b.ui("!!document.querySelector('.divider')"), within=8, what="the divider")
        sizes = split_of(A)["sizes"]
        for _ in range(3):  # a busy machine may miss the first press
            time.sleep(0.5)
            d = rect("document.querySelector('.divider')")
            x0, y0 = d["x"] + d["w"] / 2, d["y"] + d["h"] / 2
            # 200 to the left in small steps, then held there (past the snap to even).
            b.call({"do": "window.drag", "path": [[x0 - 8 * i, y0] for i in range(26)] + [[x0 - 200, y0]] * 10})
            time.sleep(0.6)
            sizes = split_of(A)["sizes"]
            if sizes[0] < 0.45:
                break
        t.ok(sizes[0] < 0.45, f"the left page narrower ({sizes})")

        print("- the X on picked tabs closes them all")
        b.cmd("tab.select", id=C)
        time.sleep(0.4)
        b.cmd("tab.pick", id=D, mode="toggle")
        b.wait_for(lambda: set(window().get("picked") or []) == {C, D}, within=8, what="C and D picked")
        # The interface has to have been told too, or its X closes the one.
        b.wait_for(lambda: b.ui("document.querySelectorAll('.row.picked').length") == 2, within=8, what="C and D drawn picked")
        b.ui(f"document.querySelector('.row[data-tab=\"{D}\"] .x').click()")
        b.wait_for(lambda: not tab("c") and not tab("d"), within=8, what="C and D closed")
        t.ok(tab("a") and tab("b"), "the others stay")

        shift_tests("side")
        b.cmd("settings.set", id="tabs.layout", value="top")
        b.wait_for(lambda: b.ui("!!document.querySelector('.tabbar')"), within=5, what="the strip")
        time.sleep(0.8)
        shift_tests("top")
        strip_band()
        strip_edit()
        settings_note()
    except Exception as error:
        import traceback
        traceback.print_exc()
        t.ok(False, f"ran to the end ({error})")
    t.done()


if __name__ == "__main__":
    main()

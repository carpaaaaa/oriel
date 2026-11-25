#!/usr/bin/env python3
"""A split drawn as one object in the tab list (studio/01 §8.29; SplitTabItem,
IconPair; carpa, 25 Nov 2026: "in split view I want the tabs to show that the
two are joined"), in the column, across the top and in the column of icons, in
a hidden world, with the numbers behind it.

The pages of a split lie in one frame (the tile grey, the live grey while one
of them has the keys, a hairline round it), each tab painting its piece of it
so the pieces meet; the frame's corners are concentric with the tabs' (radius
9, 2 in: 11; across the top 1 in: 10); a hairline between the pages goes
beside a lit one; the page with the keys sits on the frame in the darker
grey. Closing one page, pinning one, grouping, moving and carrying one keep
working: a split goes as one. SHOTS_DIR=<folder> keeps a picture of each,
light and dark.

    npm run build && SHOTS_DIR=out python3 test/tabs_split_joined.py
"""
import json
import os
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b  # noqa: E402
import ui_kit as k  # noqa: E402

WORLD = "tabs-split-joined"
SHOTS = os.environ.get("SHOTS_DIR")


class Site(BaseHTTPRequestHandler):
    def do_GET(self):
        name = self.path.split("n=")[-1]
        body = f"<!doctype html><title>Page {name}</title><body style='margin:0;background:#fff'><p>{name}".encode()
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


def order():
    return [x["id"] for x in window()["tabs"]]


def shot(name):
    if SHOTS:
        Path(SHOTS).mkdir(parents=True, exist_ok=True)
        b.shot(Path(SHOTS) / f"{name}.png")


def info(sel, pseudo="::before"):
    """What a tab's element and its piece of the frame come to."""
    v = b.ui("(() => { const e = document.querySelector(%r); if (!e) return null; const r = e.getBoundingClientRect();"
             " const p = getComputedStyle(e, %r); const g = e.querySelector('.ground'); const ti = e.querySelector('.title');"
             " return JSON.stringify({ cls: e.className, x: r.left, y: r.top, w: r.width, h: r.height, bottom: r.bottom, right: r.right,"
             " pair: e.dataset.pair || null, bg: p.backgroundColor, radius: p.borderRadius, top: p.top, bottom_: p.bottom, left: p.left, right_: p.right,"
             " content: p.content, opacity: p.opacity, ground: g && getComputedStyle(g).backgroundColor, groundRadius: g && getComputedStyle(g).borderTopLeftRadius,"
             " title: ti && getComputedStyle(ti).color }) })()" % (sel, pseudo))
    return json.loads(v) if v else None


def has(i, name):
    return name in (i["cls"] or "").split()


def row(tid):
    return f'.row[data-tab="{tid}"]'


def strip(tid):
    return f'.strip-tab[data-tab="{tid}"]'


def pair_up(first, second):
    b.cmd("tab.select", id=first)
    time.sleep(0.4)
    b.cmd("split.pair", id=second, side="right", target=first)
    b.wait_for(lambda: any(s["tabs"] == [first, second] for s in window()["splits"]), within=8, what="the split")
    time.sleep(0.9)


def lit_look(look):
    """The window's own state laid on the interface in another look, for a picture."""
    s = json.loads(b.ui("JSON.stringify(window.__tabsUI.state())"))
    k.fake(s, look=look)
    time.sleep(0.9)


def column(ids):
    A, B, C, D = ids
    print("- column: a split is one frame round its rows")
    pair_up(A, B)
    a, bb, c, d = (info(row(i)) for i in (A, B, C, D))
    t.ok(has(a, "in-pair") and has(a, "pair-first") and not has(a, "pair-last"), f"the first page: in the frame, at its top ({a['cls']})")
    t.ok(has(bb, "in-pair") and has(bb, "pair-last") and not has(bb, "pair-first"), "the last page: at the frame's bottom")
    t.ok(not has(c, "in-pair") and not has(d, "in-pair"), "the tabs beside it are not")
    t.ok(a["pair"] == bb["pair"] == A, "both name the same run")
    t.ok(k.near(a["x"], c["x"] + 2) and k.near(a["w"], c["w"] - 4) and k.near(bb["x"], c["x"] + 2), f"its rows set in by 2 on each side ({a['x'] - c['x']}, {a['w'] - c['w']})")
    t.ok(k.near(bb["y"] - a["y"], 30) and k.near(a["h"], 28), "the rows 2 apart, 28 high, as any two")
    t.ok(all(x["groundRadius"] == "9px" for x in (a, bb, c)), "every row's radius is 9")
    t.ok(a["radius"] == "11px 11px 0px 0px" and bb["radius"] == "0px 0px 11px 11px", f"the frame's radius is 11 = 9 + 2, at its outer corners only ({a['radius']} / {bb['radius']})")
    t.ok(a["left"] == "-2px" and a["right_"] == "-2px" and a["top"] == "-2px" and a["bottom_"] == "-1px", f"the first piece reaches 2 out and half the gap down ({a['left']}, {a['top']}, {a['bottom_']})")
    t.ok(bb["top"] == "-1px" and bb["bottom_"] == "-2px", "the last reaches half the gap up, 2 down")
    t.ok(k.near(a["bottom"] + 1, bb["y"] - 1), "the pieces meet")
    prev = info(row(order()[order().index(A) - 1]))
    t.ok(k.near(a["y"] - prev["bottom"], 4), f"2 more air above the frame than between plain rows ({a['y'] - prev['bottom']})")
    t.ok(k.near(c["y"] - bb["bottom"], 4), f"and below ({c['y'] - bb['bottom']})")

    print("- column: lit while one page has the keys, the page with them in the darker grey")
    t.ok(window()["activeID"] == B and has(a, "pair-live") and has(bb, "pair-live"), "the carried tab has the keys: both pages are lit")
    t.ok(k.same_colour(a["bg"], "rgba(0, 0, 0, 0.0628)") and k.same_colour(bb["bg"], "rgba(0, 0, 0, 0.0628)"), f"the frame in the live grey ({a['bg']})")
    t.ok(k.same_colour(bb["ground"], "rgba(0, 0, 0, 0.0628)") and bb["ground"] != a["ground"], f"the page with the keys on its own grey ({bb['ground']} over {a['ground']})")
    t.ok(k.same_colour(a["title"], "rgba(23, 23, 23, 0.7)"), f"the other page's title lit with it ({a['title']})")
    t.ok(info(row(A), "::after")["opacity"] == "0", "no hairline beside the lit page")
    shot("split-joined-side-light")
    b.cmd("tab.select", id=C)
    time.sleep(0.8)
    a, bb = info(row(A)), info(row(B))
    t.ok(not has(a, "pair-live") and not has(bb, "pair-live"), "another tab in front: the split is at rest")
    t.ok(k.same_colour(a["bg"], "rgba(0, 0, 0, 0.0314)") and k.same_colour(bb["bg"], "rgba(0, 0, 0, 0.0314)"), f"the frame in the tile grey ({a['bg']})")
    t.ok(info(row(A), "::after")["opacity"] == "1" and k.same_colour(info(row(A), "::after")["bg"], "rgba(23, 23, 23, 0.12)"), "a hairline between the pages")
    t.ok(info(row(B), "::after")["content"] == "none", "none after the last")
    b.cmd("tab.select", id=A)
    time.sleep(0.8)
    a, bb = info(row(A)), info(row(B))
    t.ok(has(a, "pair-live") and has(bb, "pair-live") and has(a, "live"), "the first page in front: both lit")
    t.ok(k.same_colour(a["ground"], "rgba(0, 0, 0, 0.0628)") and k.same_colour(bb["title"], "rgba(23, 23, 23, 0.7)"), "the darker grey slid to it, the other's title lit")
    lit_look("dark")
    shot("split-joined-side-dark")
    ad = info(row(A))
    t.ok(ad["bg"].startswith("rgba(255, 255, 255"), f"in the dark look the frame is a light veil ({ad['bg']})")
    k.thaw()
    time.sleep(0.5)

    print("- column: a split goes as one")
    b.cmd("tab.move", id=B, to=order().index(D))
    time.sleep(0.8)
    o = order()
    t.ok(o.index(B) == o.index(A) + 1 and o.index(A) > o.index(D), f"moving its last page moves both, in their order ({[x == A and 'A' or x == B and 'B' or '.' for x in o]})")
    b.cmd("tab.move", id=A, to=1)
    time.sleep(0.8)
    o = order()
    t.ok(o.index(B) == o.index(A) + 1 and o.index(A) == 1, "moving its first page moves both")

    print("- column: carried by one page, the other goes with it")
    first = order().index(A)
    r = k.rect(row(A))
    x0, y0 = r["x"] + r["w"] / 2, r["y"] + r["h"] / 2
    drop_y = k.rect(row(D))["y"] + 24
    path = [[x0, y0 + (drop_y - y0) * i / 14] for i in range(15)] + [[x0, drop_y]] * 60
    th = threading.Thread(target=lambda: b.call({"do": "window.drag", "path": path}, timeout=60), daemon=True)
    th.start()
    time.sleep(1.1)
    lifted = k.js("return [...document.querySelectorAll('.line.carried')].map(e => e.querySelector('.row')?.dataset.tab)")
    t.ok(set(lifted) == {A, B}, f"both lines are lifted and follow the pointer ({len(lifted)})")
    gap = k.js(f"const a = document.querySelector('.row[data-tab=\"{A}\"]').getBoundingClientRect(); const c = document.querySelector('.row[data-tab=\"{B}\"]').getBoundingClientRect(); return c.top - a.top")
    t.ok(k.near(gap, 30), f"as far apart as they were ({gap})")
    th.join()
    time.sleep(1.0)
    o = order()
    t.ok(o.index(B) == o.index(A) + 1 and o.index(A) > first, f"let go lower, the two landed together ({o.index(A)} after {first})")
    t.ok(any(s["tabs"] == [A, B] for s in window()["splits"]), "still a split")

    print("- column: closing one page leaves the other a tab")
    b.cmd("tab.close", id=B)
    time.sleep(1.0)
    a = info(row(A))
    c = info(row(C))
    t.ok(not has(a, "in-pair") and k.near(a["x"], c["x"]) and k.near(a["w"], c["w"]), "no frame, the row as wide as any")
    t.ok(not window()["splits"], "no split")

    print("- column: in a group")
    b.cmd("tab.open", url=f"{BASE}/?n=e", foreground=True)
    b.wait_for(lambda: tab("e"), what="a fifth tab")
    E = tab("e")["id"]
    pair_up(A, E)
    b.cmd("group.new", ids=[A])
    time.sleep(1.0)
    ga, ge = info(row(A)), info(row(E))
    plain = info(row(C))
    t.ok(has(ga, "in-pair") and has(ge, "in-pair"), "the two moved into the group together, still a split")
    t.ok(k.near(ga["x"], plain["x"] + 14 + 2) and k.near(ga["w"], plain["w"] - 14 - 4), f"set in by the group's 14 and the frame's 2 ({ga['x'] - plain['x']})")
    shot("split-joined-side-group")

    print("- column: pinning one page takes it out")
    b.cmd("tab.pin", id=E)
    time.sleep(1.0)
    t.ok(not window()["splits"], "a pin leaves its split")
    t.ok(b.ui(f"!!document.querySelector('.square[data-tab=\"{E}\"]')") and not has(info(row(A)), "in-pair"), "a square for it, a plain row for the other")
    b.cmd("tab.unpin", id=E)
    time.sleep(0.8)


def icons():
    print("- the column of icons: its tiles in one frame")
    s = json.loads(b.ui("JSON.stringify(window.__tabsUI.state())"))
    s["sidebar"] = {**s["sidebar"], "icons": True}
    k.fake(s, look="light")
    time.sleep(1.0)
    tiles = json.loads(b.ui("JSON.stringify([...document.querySelectorAll('.tile.in-pair')].map(e => e.className))"))
    t.ok(len(tiles) == 2 and "pair-first" in tiles[0] and "pair-last" in tiles[1], f"the two tiles in a frame ({len(tiles)})")
    st = json.loads(b.ui("(() => { const e = document.querySelector('.tile.pair-first'); const s = getComputedStyle(e, '::before'); return JSON.stringify({ r: s.borderRadius, w: e.getBoundingClientRect().width, f: s.left }) })()"))
    t.ok(st["r"] == "11px 11px 0px 0px" and k.near(st["w"], 32), f"radius 11 round tiles of 32 ({st})")
    shot("split-joined-icons-light")
    k.thaw()
    time.sleep(0.5)


def top(ids):
    A, B, C, D = ids
    print("- across the top: a split is one pill")
    pair_up(A, B)
    a, bb, c = info(strip(A)), info(strip(B)), info(strip(C))
    band = k.rect(".strip-band")
    t.ok(has(a, "in-pair") and has(a, "pair-first") and has(bb, "pair-last") and not has(c, "in-pair"), "the two tabs in a frame, the others not")
    t.ok(a["radius"] == "10px 0px 0px 10px" and bb["radius"] == "0px 10px 10px 0px", f"radius 10 = 9 + 1, at the outer corners ({a['radius']} / {bb['radius']})")
    t.ok(a["groundRadius"] == "9px" and k.near(a["h"], 28), "the tabs' own 9, 28 high")
    t.ok(a["top"] == "-1px" and a["bottom_"] == "-1px" and k.near(a["y"] - 1, band["y"]) and k.near(a["bottom"] + 1, band["y"] + band["h"]), f"the frame fills the band of 30 ({band['h']})")
    t.ok(k.near(a["right"] + 1, bb["x"] - 1), "the pieces meet")
    t.ok(k.near(a["w"], bb["w"]) and k.near(a["w"], c["w"]), "the pages as wide as any tab")
    t.ok(window()["activeID"] == B and has(a, "pair-live") and has(bb, "pair-live"), "the carried tab has the keys: both pages are lit")
    t.ok(k.same_colour(a["bg"], "rgba(0, 0, 0, 0.063)"), f"the frame in the live grey ({a['bg']})")
    t.ok(k.same_colour(bb["ground"], "rgba(0, 0, 0, 0.063)") and a["ground"] != bb["ground"], "the page with the keys on its own grey")
    t.ok(a["title"] is None or k.same_colour(a["title"], "rgba(23, 23, 23, 0.7)"), f"the other page's title lit with it ({a['title']})")
    t.ok(a["title"] is not None, "(titled, with room for it)")
    shot("split-joined-top-light")
    b.cmd("tab.select", id=C)
    time.sleep(0.8)
    a = info(strip(A))
    t.ok(not has(a, "pair-live") and k.same_colour(a["bg"], "rgba(0, 0, 0, 0.0347)"), f"another tab in front: the frame in the tile grey ({a['bg']})")
    t.ok(info(strip(A), "::after")["opacity"] == "1" and info(strip(B), "::after")["content"] == "none", "a short line between the pages, none after the last")
    b.cmd("tab.select", id=A)
    time.sleep(0.8)
    lit_look("dark")
    shot("split-joined-top-dark")
    ad = info(strip(A))
    t.ok(ad["bg"].startswith("rgba(255, 255, 255"), f"in the dark look the frame is a light veil ({ad['bg']})")
    k.thaw()
    time.sleep(0.5)

    print("- across the top: a split goes as one")
    b.cmd("tab.move", id=B, to=order().index(D))
    time.sleep(0.8)
    o = order()
    t.ok(o.index(B) == o.index(A) + 1 and o.index(A) > o.index(D), "moving its last page moves both")

    print("- across the top: carried by one page, they land together")
    ra = k.rect(strip(A))
    # By its edge: a narrow tab in front shows its cross in the middle under the pointer.
    x0, y0 = ra["x"] + 6, ra["y"] + ra["h"] / 2
    target = k.rect(strip(C))
    path = [[x0 + (target["x"] + 6 - x0) * i / 14, y0] for i in range(15)] + [[target["x"] + 6, y0]] * 30
    b.call({"do": "window.drag", "path": path})
    time.sleep(1.0)
    o = order()
    names = {A: "A", B: "B", C: "C", D: "D"}
    t.ok(o.index(B) == o.index(A) + 1 and o.index(A) < o.index(C), f"carried left past a tab: both there, in order ({[names.get(x, '.') for x in o]})")
    t.ok(any(s["tabs"] == [A, B] for s in window()["splits"]), "still a split")

    print("- across the top: closing one page leaves the other a tab")
    b.cmd("tab.close", id=B)
    time.sleep(1.0)
    t.ok(not has(info(strip(A)), "in-pair") and not window()["splits"], "no frame, no split")


def main():
    b.use(WORLD)
    try:
        b.launch(*k.FRAMES, env={"SEARCH_LOOK": "light"})
        b.call({"do": "window.place", "x": 0, "y": 0, "width": 1000, "height": 700, "visual": True})
        time.sleep(0.5)
        for n in "abcd":
            b.cmd("tab.open", url=f"{BASE}/?n={n}", foreground=True)
        b.wait_for(lambda: all(tab(n) for n in "abcd"), what="four tabs")
        ids = [tab(n)["id"] for n in "abcd"]
        time.sleep(0.8)
        column(ids)
        # A plain column of four new tabs for the column of icons and the strip.
        for g in window()["groups"]:
            b.cmd("group.close", id=g["id"])
        time.sleep(0.6)
        for x in [tab(n) for n in "abcde"]:
            if x:
                b.cmd("tab.close", id=x["id"])
        b.wait_for(lambda: not any(tab(n) for n in "abcde"), within=8, what="the first tabs closed")
        time.sleep(0.5)
        for n in "pqrs":
            b.cmd("tab.open", url=f"{BASE}/?n={n}", foreground=True)
        b.wait_for(lambda: all(tab(n) for n in "pqrs"), what="four new tabs")
        ids = [tab(n)["id"] for n in "pqrs"]
        time.sleep(0.8)
        pair_up(ids[0], ids[1])
        icons()
        b.cmd("settings.set", id="tabs.layout", value="top")
        b.wait_for(lambda: b.ui("!!document.querySelector('.tabbar')"), within=8, what="the strip")
        time.sleep(1.0)
        b.cmd("split.separate")
        time.sleep(0.5)
        top(ids)
    except Exception as error:
        import traceback
        traceback.print_exc()
        t.ok(False, f"ran to the end ({error})")
    t.done()


if __name__ == "__main__":
    main()

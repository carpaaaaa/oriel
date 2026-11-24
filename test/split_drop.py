#!/usr/bin/env python3
"""A tab carried from the column onto the page (studio/01 §8.17; TabDrag.swift,
Browser.pair), the divider (§8.14), and the X on picked tabs (§3.19), in a
hidden world.

Carried over the page, the bands show at its edges (the overlay's
split.drop); in a band, the preview of that side; let go there, the tab
stands beside the page in front, the shares even, with the keys. The press
had opened the carried tab: over the page, the page from before comes back
and is the one split with. Let go in the middle, nothing happens. The
divider changes the shares. With tabs picked by Ctrl-click, the X on one of
them closes them all.

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


def carry(tid, to, hold=40):
    """Press the tab's line in the column, move over the page to `to`, wait, let go."""
    r = rect(f"document.querySelector('.row[data-tab=\"{tid}\"]')")
    start = [r["x"] + r["w"] / 2, r["y"] + r["h"] / 2]
    path = [start] + [[start[0] + (to[0] - start[0]) * i / 12, start[1] + (to[1] - start[1]) * i / 12] for i in range(1, 13)]
    path += [to] * hold
    b.call({"do": "window.drag", "path": path})
    time.sleep(0.6)


def main():
    b.use(WORLD)
    try:
        b.launch()
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
        t.ok(window()["overlay"]["kind"] == "none", "the bands gone")
        t.ok(window()["activeID"] == A, "the page from before the press is back in front")

        print("- let go in the right band: beside the page")
        carry(B, right)
        s = b.wait_for(lambda: split_of(A), within=3, what="the split")
        t.ok(s["tabs"] == [A, B], f"the carried tab on the right ({s['tabs']})")
        t.ok(all(abs(x - 0.5) < 0.01 for x in s["sizes"]), f"even shares ({s['sizes']})")
        t.ok(window()["activeID"] == B, "the carried tab has the keys")
        t.ok(window()["overlay"]["kind"] == "none", "the preview gone")

        print("- the divider")
        d = rect("document.querySelector('.divider')")
        x0, y0 = d["x"] + d["w"] / 2, d["y"] + d["h"] / 2
        b.call({"do": "window.drag", "path": [[x0 - 10 * i, y0] for i in range(16)]})
        time.sleep(0.6)
        sizes = split_of(A)["sizes"]
        t.ok(sizes[0] < 0.45, f"the left page narrower ({sizes})")

        print("- the X on picked tabs closes them all")
        b.cmd("tab.select", id=C)
        time.sleep(0.4)
        b.cmd("tab.pick", id=D, mode="toggle")
        b.wait_for(lambda: set(window().get("picked") or []) == {C, D}, within=3, what="C and D picked")
        b.ui(f"document.querySelector('.row[data-tab=\"{D}\"] .x').click()")
        b.wait_for(lambda: not tab("c") and not tab("d"), within=3, what="C and D closed")
        t.ok(tab("a") and tab("b"), "the others stay")
    except Exception as error:
        import traceback
        traceback.print_exc()
        t.ok(False, f"ran to the end ({error})")
    t.done()


if __name__ == "__main__":
    main()

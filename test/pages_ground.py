#!/usr/bin/env python3
"""A page that hasn't painted yet shows the window's dark, not white
(studio/01 §2.6; Tab.swift:3058-3116), in a hidden world.

While Oriel is dark, a new tab's view has the page card's dark ground until
its page first paints (the preload's paint observer), then white again, so a
page that leaves its ground to the browser reads as anywhere else. A page
that paints while it is still loading turns at once, not at the load's end;
one with nothing to paint turns at the load's end. Light: never waits.

    npm run build && python3 test/pages_ground.py
"""
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b  # noqa: E402

WORLD = "pages-ground"


class Site(BaseHTTPRequestHandler):
    def do_GET(self):
        path = self.path.split("?")[0]
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        if path == "/slow":
            # Nothing for 3 s: nothing to paint meanwhile.
            time.sleep(3)
            self.wfile.write(b"<!doctype html><title>slow</title><p>slow, no ground of its own")
        elif path == "/stream":
            # Words at once, the load ending 4 s later.
            self.wfile.write(b"<!doctype html><title>stream</title><p>at once, no ground of its own</p>")
            self.wfile.flush()
            time.sleep(4)
            self.wfile.write(b"<p>end")
        elif path == "/empty":
            self.wfile.write(b"<!doctype html><title>empty</title>")
        else:
            self.wfile.write(b"<!doctype html><p>nothing")

    def log_message(self, *a):
        pass


srv = ThreadingHTTPServer(("127.0.0.1", 0), Site)
threading.Thread(target=srv.serve_forever, daemon=True).start()
BASE = f"http://127.0.0.1:{srv.server_port}"
t = b.T()


def unpainted(tab):
    return b.call({"do": "pages.state", "id": tab})["unpainted"]


def tab_of(url):
    return next((x for x in b.state()["tabs"] if x["url"].startswith(url)), None)


def open_tab(path):
    url = f"{BASE}{path}?t={time.time()}"
    b.cmd("tab.new", url=url)
    return b.wait_for(lambda: tab_of(url), what=f"the tab for {path}")["id"]


def loaded(tab):
    return b.wait_for(lambda: not next(x for x in b.state()["tabs"] if x["id"] == tab)["loading"], within=15, what="the load's end")


def case_dark():
    print("- dark: the ground waits for the first paint")
    slow = open_tab("/slow")
    time.sleep(1.2)
    t.ok(unpainted(slow) is True, "a page with nothing painted yet keeps the dark ground")
    loaded(slow)
    t.ok(b.wait_for(lambda: unpainted(slow) is False, within=3, what="white after the paint") is True, "white once it painted")

    stream = open_tab("/stream")
    t.ok(b.wait_for(lambda: unpainted(stream) is False, within=2.5, what="white at the first paint"), "white at the first paint, not the load's end")
    st = next(x for x in b.state()["tabs"] if x["id"] == stream)
    t.ok(st["loading"] is True, "while it is still loading")

    empty = open_tab("/empty")
    loaded(empty)
    t.ok(b.wait_for(lambda: unpainted(empty) is False, within=3, what="white at the load's end"), "nothing to paint: white at the load's end")


def case_light():
    print("- light: never waits")
    slow = open_tab("/slow")
    time.sleep(1.2)
    t.ok(unpainted(slow) is False, "white from the start")


def main():
    b.use(WORLD)
    try:
        b.launch(env={"SEARCH_LOOK": "dark"})
        case_dark()
        b.quit()
        b.use(WORLD, wipe=False)
        b.launch(env={"SEARCH_LOOK": "light"})
        case_light()
    except Exception as error:
        import traceback
        traceback.print_exc()
        t.ok(False, f"ran to the end ({error})")
    t.done()


if __name__ == "__main__":
    main()

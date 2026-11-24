#!/usr/bin/env python3
"""The bookmarks bar (Settings › Appearance › Show the bookmarks bar; studio/02
§4.5, BookmarksBar.swift), in a hidden world.

On, a row of 30 right above the page with the top level of the bookmarks:
the page comes down by 30 and the row is as wide as the card. A site opens;
a folder opens its own list under it; what doesn't fit goes behind "»".
Off, the page goes back up.

    npm run build && python3 test/bookmarks_bar.py
"""
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b  # noqa: E402

WORLD = "bookmarks-bar"


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


def page_top():
    pages = b.call({"do": "window.frame"})["frame"].get("pages") or []
    return pages[0]["rect"]["y"] if pages else None


def bar():
    return b.window().get("data", {}).get("bar")


def main():
    b.use(WORLD)
    try:
        b.launch()
        # A window the same size on every screen (a CI runner).
        b.call({"do": "window.place", "window": b.window()["id"], "x": 0, "y": 0, "width": 1000, "height": 700, "visual": True})
        time.sleep(0.5)
        b.cmd("tab.open", url=f"{BASE}/?n=front", foreground=True)
        b.wait_for(lambda: page_top() is not None, what="the page placed")
        time.sleep(0.5)
        before = page_top()
        for n in ["one", "two"]:
            b.cmd("bookmark.add", url=f"{BASE}/?n={n}", title=n.title(), folder=None)
        folder = b.cmd("bookmark.folder", title="Work")
        b.cmd("bookmark.add", url=f"{BASE}/?n=inside", title="Inside", folder=folder["id"])

        print("- on: a row right above the page")
        b.cmd("settings.set", id="bookmarks.bar", value=True)
        items = b.wait_for(lambda: bar(), within=4, what="the bar's items")
        t.ok([(i["title"], i["folder"]) for i in items] == [("One", False), ("Two", False), ("Work", True)], f"the top level, in order ({[i['title'] for i in items]})")
        b.wait_for(lambda: page_top() == before + 30, within=4, what="the page down by 30")
        t.ok(True, "the page comes down by 30")
        r = b.ui("(() => { const b = document.querySelector('.bookmarks-bar').getBoundingClientRect(), c = document.querySelector('.card').getBoundingClientRect(); return [b.left - c.left, b.width - c.width, c.top - b.bottom, b.height] })()")
        t.ok(all(abs(x) < 1 for x in r[:3]) and abs(r[3] - 30) < 1, f"as wide as the card, right above it, 30 high ({r})")

        print("- a site, a folder")
        b.ui("[...document.querySelectorAll('.bmbar-item')].find(x => x.textContent.includes('Two')).click()")
        b.wait_for(lambda: any(x["url"].endswith("n=two") for x in b.state()["tabs"]), within=4, what="Two opened")
        t.ok(True, "a site opens")
        b.ui("document.querySelector('.bmbar-item.folder').click()")
        pop = b.wait_for(lambda: b.window().get("data", {}).get("popover"), within=3, what="the folder's list")
        t.ok([line["title"] for line in pop["lines"]] == ["Inside"], f"a folder opens its own list ({[line['title'] for line in pop['lines']]})")
        b.cmd("bookmark.popoverClose")

        print("- what doesn't fit goes behind »")
        for i in range(30):
            b.cmd("bookmark.add", url=f"{BASE}/?n=s{i}", title=f"Site number {i}", folder=None)
        more = b.wait_for(lambda: b.ui("!!document.querySelector('.bmbar-more')"), within=4, what="»")
        t.ok(more, "» shows")

        print("- off")
        b.cmd("settings.set", id="bookmarks.bar", value=False)
        b.wait_for(lambda: page_top() == before, within=4, what="the page back up")
        t.ok(not b.ui("!!document.querySelector('.bookmarks-bar')"), "no row, the page back up")
    except Exception as error:
        import traceback
        traceback.print_exc()
        t.ok(False, f"ran to the end ({error})")
    t.done()


if __name__ == "__main__":
    main()

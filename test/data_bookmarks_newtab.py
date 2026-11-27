#!/usr/bin/env python3
"""Show the bookmarks bar only on new tabs (Settings › Appearance › Tabs;
Search 1.0.20, Tests/bookmarks_bar_new_tab.py): off unless turned on; on,
the bar is above a new tab only and goes as soon as a page opens in it, the
page then starting where the bar was. With the tabs down a side and the
column folded away (Ctrl+S) or hidden until the pointer reaches the edge, a
new tab keeps the bar above it, clear of the column's edge (Search 1.0.22,
#1625); opening a page takes it away as before.

    npm run build && python test/data_bookmarks_newtab.py
"""
import os
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b  # noqa: E402

SHOTS = os.environ.get("SHOTS_DIR")


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


def bar_shown():
    return bool(b.ui("!!document.querySelector('.bookmarks-bar')"))


def geometry():
    return b.ui("""(() => { const bar = document.querySelector('.bookmarks-bar'), card = document.querySelector('.card'), first = document.querySelector('.bmbar-item');
      if (!bar || !card) return null
      const r = bar.getBoundingClientRect(), c = card.getBoundingClientRect(), f = first ? first.getBoundingClientRect() : null
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, cardTop: c.top, first: f && f.left, visible: getComputedStyle(bar).visibility, width: innerWidth } })()""")


def go(url):
    b.cmd("tab.go", input=url)


def new_tab():
    b.cmd("tab.new")
    b.wait_for(lambda: (b.active() or {}).get("empty"), what="a new tab")
    time.sleep(0.4)


def main():
    b.use("data-bookmarks-newtab")
    try:
        b.launch()
        b.call({"do": "window.place", "x": 0, "y": 0, "width": 1000, "height": 700, "visual": True})
        time.sleep(0.5)
        b.cmd("tab.open", url=f"{BASE}/?n=front", foreground=True)
        b.wait_for(lambda: page_top() is not None, what="the page placed")
        time.sleep(0.5)
        top = page_top()
        for n in ["one", "two"]:
            b.cmd("bookmark.add", url=f"{BASE}/?n={n}", title=n.title(), folder=None)
        t.ok(b.state()["prefs"].get("bookmarks.newTabOnly", False) is False, "Only on new tabs: off unless turned on")
        b.cmd("settings.set", id="bookmarks.bar", value=True)
        b.wait_for(lambda: page_top() == top + 30, within=4, what="the page down by 30")
        t.ok(bar_shown(), "the bar above a page, as before")

        print("- on: above a new tab only")
        b.cmd("settings.set", id="bookmarks.newTabOnly", value=True)
        b.wait_for(lambda: page_top() == top, within=4, what="the page back up")
        t.ok(not bar_shown(), "on a page: no bar, the page starts where it was")
        new_tab()
        t.ok(bar_shown(), "a new tab: the bar above it")
        g = geometry()
        t.ok(g and g["cardTop"] >= g["bottom"] - 0.5, f"the new tab starts under it ({g})")
        if SHOTS:
            b.shot(f"{SHOTS}/newtab-bar.png")
        nt = b.active()["id"]
        go(f"{BASE}/?n=opened")
        b.wait_for(lambda: (b.active() or {}).get("title") == "opened", within=10, what="a page opened in the new tab")
        b.wait_for(lambda: not bar_shown(), within=4, what="the bar gone")
        b.wait_for(lambda: page_top() == top, within=4, what="the page at the top")
        t.ok(b.active()["id"] == nt, "a page opened in the new tab takes the bar away, the page where the bar was")

        print("- the column folded away (Ctrl+S)")
        b.cmd("sidebar.toggle")
        b.wait_for(lambda: b.window()["sidebar"]["folded"], what="folded")
        time.sleep(0.6)
        t.ok(not bar_shown(), "folded, on a page: no bar")
        new_tab()
        g = geometry()
        t.ok(bar_shown() and g and g["top"] >= 0 and g["visible"] == "visible", f"folded, a new tab keeps the bar above it ({g})")
        t.ok(g and g["first"] is not None and g["first"] - g["left"] >= 10, f"clear of the column's edge, where the pointer brings it out ({g and g['first'] - g['left']} from the window's edge)")
        t.ok(g and g["cardTop"] >= g["bottom"] - 0.5, "the new tab under it")
        if SHOTS:
            b.shot(f"{SHOTS}/newtab-bar-folded.png")
        go(f"{BASE}/?n=folded")
        b.wait_for(lambda: (b.active() or {}).get("title") == "folded", within=10, what="a page in the folded window")
        b.wait_for(lambda: not bar_shown(), within=4, what="the bar gone, folded")
        t.ok(True, "folded, opening a page takes it away")
        b.cmd("sidebar.toggle")
        b.wait_for(lambda: not b.window()["sidebar"]["folded"], what="unfolded")

        print("- the column hidden until the edge")
        b.cmd("settings.set", id="sidebar.hides", value=True)
        b.wait_for(lambda: b.window()["sidebar"]["folded"], what="resting folded")
        time.sleep(0.6)
        new_tab()
        g = geometry()
        t.ok(bar_shown() and g and g["first"] - g["left"] >= 10, f"hidden until the edge, a new tab keeps the bar, clear of the edge ({g})")
        if SHOTS:
            b.shot(f"{SHOTS}/newtab-bar-hidden.png")
        b.cmd("settings.set", id="sidebar.hides", value=False)
        b.wait_for(lambda: not b.window()["sidebar"]["folded"], what="the column back")
        time.sleep(0.4)
        g = geometry()
        t.ok(g and g["first"] is not None and g["first"] - g["left"] < 10, f"the column back beside it: no extra room at its start ({g})")

        print("- off again: above every page")
        b.cmd("settings.set", id="bookmarks.newTabOnly", value=False)
        go(f"{BASE}/?n=again")
        b.wait_for(lambda: (b.active() or {}).get("title") == "again", within=10, what="a page")
        b.wait_for(lambda: page_top() == top + 30, within=4, what="the page down by 30 again")
        t.ok(bar_shown(), "off: the bar above pages again")
        # Folded, the page fills the window but no longer covers the bar.
        b.cmd("sidebar.toggle")
        b.wait_for(lambda: b.window()["sidebar"]["folded"], what="folded with a page")
        time.sleep(0.6)
        g = geometry()
        pt = page_top()
        t.ok(g and pt is not None and pt >= g["bottom"] - 0.5 and g["top"] >= 0, f"folded with a page: the page starts under the bar, never over it ({g}, page at {pt})")
        if SHOTS:
            b.shot(f"{SHOTS}/page-bar-folded.png")
        b.cmd("sidebar.toggle")
        b.wait_for(lambda: not b.window()["sidebar"]["folded"], what="unfolded again")

        print("- the row in Settings")
        b.cmd("app.settings")
        b.wait_for(lambda: any(x.get("internal") == "settings" for x in b.window()["tabs"]), what="Settings tab")
        st = next(x for x in b.window()["tabs"] if x.get("internal") == "settings")["id"]
        b.wait_for(lambda: b.ev(st, "document.querySelectorAll('.sr').length"), what="rows")
        b.ev(st, "(() => { const f = document.querySelector('.st-find input'); f.value = 'only on new tabs'; f.dispatchEvent(new Event('input', {bubbles: true})) })()")
        time.sleep(0.5)
        row = b.ev(st, "document.querySelector(\"[data-row='bookmarks.newTabOnly']\")?.innerText") or ""
        t.ok("Show the bookmarks bar only on new tabs" in row and "Hidden while a page is open" in row, f"Settings › Appearance › Tabs has it, in Search's words ({row!r})")
        b.cmd("settings.set", id="bookmarks.bar", value=False)
        time.sleep(0.6)
        row = b.ev(st, "document.querySelector(\"[data-row='bookmarks.newTabOnly']\")?.innerText") or ""
        t.ok("Only with the bookmarks bar shown" in row, f"with the bar off it says what it needs ({row!r})")
    except Exception as error:
        import traceback
        traceback.print_exc()
        t.ok(False, f"ran to the end ({error})")
    t.done()


if __name__ == "__main__":
    main()

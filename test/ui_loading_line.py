#!/usr/bin/env python3
"""The loading line along the page's top shows with the tabs in sight too,
down the side or across the top, not only folded away; for everyone, so its
switch in Settings is gone (Search 1.0.22, App.swift TabLoadingLine, #1650).
2 along the page's top, clear of its round corners, in the text's colour."""
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b  # noqa: E402
import ui_kit as k  # noqa: E402


class Slow(BaseHTTPRequestHandler):
    """A page that takes its time."""
    def do_GET(self):
        time.sleep(4 if self.path.startswith("/slow") else 0)
        body = b"<title>slow</title><body>slow"
        self.send_response(200)
        self.send_header("Content-Type", "text/html")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a):
        pass


srv = ThreadingHTTPServer(("127.0.0.1", 0), Slow)
threading.Thread(target=srv.serve_forever, daemon=True).start()
SITE = f"http://127.0.0.1:{srv.server_port}"

b.use("ui-loading-line")
b.launch(*k.FRAMES, env={"SEARCH_LOOK": "light"})
t = b.T()


def setting(id_, value):
    b.cmd("settings.set", id=id_, value=value)
    time.sleep(0.5)


def settle(pred, what, within=3):
    try:
        return b.wait_for(pred, within=within, what=what)
    except AssertionError:
        return None


line = lambda: k.js("const e = document.querySelector('.loading-line'); if (!e) return null; const r = rel(e.getBoundingClientRect()); return { x: r.x, y: r.y, w: r.width, h: r.height }")
radius = lambda: float(k.js("return parseFloat(getComputedStyle(document.querySelector('.card')).borderTopLeftRadius) || 0"))

b.cmd("tab.go", input="data:text/html,<title>page</title><body>page")
b.wait_for(lambda: b.active()["title"] == "page", what="page")
time.sleep(0.4)
t.ok(line() is None, "a page loaded: no line")

# The column in sight.
b.cmd("tab.go", input=SITE + "/slow1")
got = settle(line, "the line beside the column")
card, r = k.wrect(".card"), radius()
t.ok(got and k.near(got["h"], 2) and k.near(got["y"] + 2, card["y"]) and k.near(got["x"], card["x"] + r) and k.near(got["w"], card["w"] - 2 * r),
     f"the column in sight: 2 along the page's top while it loads, clear of its corners ({got}, card {card}, radius {r})")
colours = k.js("const s = document.querySelector('.loading-line span'); const probe = document.createElement('i'); probe.style.color = 'var(--ink)'; document.body.append(probe); const ink = getComputedStyle(probe).color; probe.remove(); return s ? { line: getComputedStyle(s).backgroundColor, ink } : null")
t.ok(colours and colours["line"] == colours["ink"], f"…in the text's colour, not the accent ({colours})")
b.wait_for(lambda: not b.active()["loading"], within=10, what="loaded")
time.sleep(0.3)
t.ok(line() is None, "loaded: the line goes")

# Across the top.
setting("tabs.layout", "top")
b.cmd("tab.go", input=SITE + "/slow2")
got = settle(line, "the line under the strip")
card = k.wrect(".card")
t.ok(got and k.near(got["h"], 2) and k.near(got["y"] + 2, card["y"]) and k.near(got["x"], card["x"]) and k.near(got["w"], card["w"]),
     f"across the top: along the page's top, edge to edge as the page is ({got}, card {card})")
b.wait_for(lambda: not b.active()["loading"], within=10, what="loaded")
setting("tabs.layout", "left")

# Folded away, as before.
b.cmd("sidebar.fold", folded=True)
time.sleep(0.4)
b.cmd("tab.go", input=SITE + "/slow3")
got = settle(line, "the line folded")
card = k.wrect(".card")
t.ok(got and k.near(got["h"], 2) and got["y"] + 2 <= card["y"] + 0.6, f"folded away: still there, over the page's top ({got}, card {card})")
b.wait_for(lambda: not b.active()["loading"], within=10, what="loaded")
b.cmd("sidebar.fold", folded=False)
time.sleep(0.3)

# Its switch is gone from Settings.
sid = b.cmd("tab.open", url="oriel://settings", foreground=True)
b.wait_for(lambda: b.active() and b.active().get("internal") == "settings", what="settings")
time.sleep(1.0)
row = b.ev(sid, "window.__settings ? JSON.stringify([!!window.__settings.itemOf('fold.loadingLine'), window.__settings.find('loading line').map(i => i.id || (i.item && i.item.id))]) : null")
t.ok(row is not None and row.startswith("[false"), f"Settings has no switch for it any more ({row})")
t.done()

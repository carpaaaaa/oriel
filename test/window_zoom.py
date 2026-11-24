#!/usr/bin/env python3
"""Page zoom kept for each site (studio/01 §2.22): a step at a time along
Chrome's levels (the user's choice over the Mac's times 1.1), between 25% and
500%, Ctrl+0 back to the default, remembered for the host (pref zoom.<host>)
and forgotten when equal to the default; another host keeps its own. Each
step glides (the user's choice over the Mac's jump): the page goes through
the factors between the two levels over about a fifth of a second, never
past the level, and lands exactly on it; the level is kept at once; another
step on the way goes on from the level it was heading for."""
import sys, threading, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b


class Page(BaseHTTPRequestHandler):
    def do_GET(self):
        body = b"<title>zoom</title><body>zoom</body>"
        self.send_response(200)
        self.send_header("Content-Type", "text/html")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a):
        pass


server = ThreadingHTTPServer(("127.0.0.1", 0), Page)
threading.Thread(target=server.serve_forever, daemon=True).start()
port = server.server_address[1]
one, other = f"http://127.0.0.1:{port}/", f"http://localhost:{port}/"
key = f"zoom.127.0.0.1:{port}"

b.use("window-zoom")
b.launch()
t = b.T()


def zoom():
    return b.call({"do": "window.frame"})["frame"]["zoom"]


def prefs():
    return b.state()["prefs"]


def near(a, c):
    return a is not None and abs(a - c) < 0.002


b.cmd("field.commit", text=one)
b.wait_for(lambda: b.active()["title"] == "zoom" and not b.active()["loading"], what="page")
time.sleep(0.3)
t.ok(near(zoom(), 1), "a site starts at the default zoom")

# A step glides (the user's choice): the factor eased from one level to the
# next, as the page sees it each frame (its devicePixelRatio), landing exactly.
tab = b.active()["id"]


def trace():
    """From now, the zoom the page is drawn at, each frame: [ms, factor]."""
    b.ev(tab, "window.base = devicePixelRatio / %r; window.zs = []; window.t0 = performance.now();"
              " (function f(){ zs.push([performance.now() - t0, devicePixelRatio / base]); if (zs.length < 3000) requestAnimationFrame(f) })(); 1" % zoom())


def traced():
    time.sleep(0.15)
    return b.ev(tab, "zs") or []


def exact(a, c):
    return a is not None and abs(a - c) < 1e-6


def between(zs, lo, hi):
    return [z for _, z in zs if lo + 0.004 < z < hi - 0.004]


def steady(zs, down=False):
    return all((b2 <= a2 + 1e-9) if down else (b2 >= a2 - 1e-9) for (_, a2), (_, b2) in zip(zs, zs[1:]))


def took(zs, start, end):
    """ms from the first frame off `start` to the first on `end`."""
    off = next((ms for ms, z in zs if abs(z - start) > 1e-4), None)
    on = next((ms for ms, z in zs if exact(z, end)), None)
    return None if off is None or on is None else round(on - off)


trace()
landed = b.cmd("view.zoom", by=1.1)
zs = traced()
mids = between(zs, 1, 1.1)
print(f"    100 to 110: {len(zs)} frames, {len(mids)} between, {took(zs, 1, 1.1)} ms: {[round(z, 4) for _, z in zs[:40:2]]}")
t.ok(len(mids) >= 4, f"Ctrl+=: the page goes through factors between 100% and 110% ({len(mids)} frames)")
t.ok(steady(zs) and max(z for _, z in zs) < 1.1 + 1e-6, "always toward the level, never past it")
t.ok(exact(zs[-1][1], 1.1) and abs(zoom() - 1.1) < 1e-9 and landed == 1.1, f"it lands exactly on 110% ({zs[-1][1]}, {zoom()})")
ms = took(zs, 1, 1.1)
t.ok(ms is not None and 100 <= ms <= 320, f"in about a fifth of a second ({ms} ms)")
t.ok(near(prefs().get(key, 0), 1.1), "the level is kept for the site")

# Ctrl+wheel: the level is kept for the site at once, the page still on its way.
b.call({"do": "window.wheel", "deltaY": 120})
early, saved = zoom(), prefs().get(key)
t.ok(near(saved, 1.25) and early < 1.25 - 0.001, f"a notch: 125% kept at once, the page still on its way ({saved}, {early})")
b.wait_for(lambda: abs(zoom() - 1.25) < 1e-9, within=3, what="landed on 125%")
t.ok(True, "and it lands exactly on 125%")

# Another step on the way goes on from the level it was heading for.
trace()
first = {}
threading.Thread(target=lambda: first.update(v=b.cmd("view.zoom", by=1.1)), daemon=True).start()
time.sleep(0.07)
second = b.cmd("view.zoom", by=1.1)
time.sleep(0.1)
zs = traced()
print(f"    125 to 175 in two steps: {took(zs, 1.25, 1.75)} ms: {[round(z, 4) for _, z in zs[:60:3]]}")
t.ok(abs(zoom() - 1.75) < 1e-9 and second == 1.75 and first.get("v") == 1.75, f"two quick Ctrl+= from 125%: on to 175%, not back to 150% ({zoom()}, {first.get('v')}, {second})")
t.ok(steady(zs) and between(zs, 1.25, 1.5) and between(zs, 1.5, 1.75), "one glide through 150% on to 175%, never back")
near150 = [ms for ms, z in zs if 1.49 <= z <= 1.51]
t.ok(not near150 or near150[-1] - near150[0] < 60, f"with no stop at 150% ({round(near150[-1] - near150[0]) if near150 else 0} ms within 1% of it)")

# Ctrl+0 glides back too.
trace()
b.cmd("view.zoom", reset=True)
zs = traced()
t.ok(steady(zs, down=True) and len(between(zs, 1, 1.75)) >= 4 and exact(zs[-1][1], 1) and abs(zoom() - 1) < 1e-9,
     f"Ctrl+0: down through the factors between, exactly on 100% ({len(between(zs, 1, 1.75))} frames between)")
t.ok(key not in prefs(), "100% is forgotten for the site at once")

b.cmd("view.zoom", by=1.1)
t.ok(near(zoom(), 1.1), "Ctrl+= the next level, 110%")
t.ok(near(prefs().get(key, 0), 1.1), "the zoom is kept for the site")

b.cmd("tab.go", input=other)
b.wait_for(lambda: b.active()["url"].startswith("http://localhost") and not b.active()["loading"], what="other host")
time.sleep(0.3)
t.ok(near(zoom(), 1), "another site keeps its own zoom")
b.cmd("tab.go", input=one)
b.wait_for(lambda: b.active()["url"].startswith("http://127.0.0.1") and not b.active()["loading"], what="back")
time.sleep(0.3)
t.ok(near(zoom(), 1.1), "back on the site, its zoom comes back")

for _ in range(20):
    b.cmd("view.zoom", by=1.1)
t.ok(near(zoom(), 5), "never over 500%, Chrome's last level")
for _ in range(30):
    b.cmd("view.zoom", by=1 / 1.1)
t.ok(near(zoom(), 0.25), "never under 25%, its first")

b.cmd("view.zoom", reset=True)
t.ok(near(zoom(), 1), "Ctrl+0: back to the default")
t.ok(key not in prefs(), "a zoom equal to the default is forgotten")
server.shutdown()
t.done()

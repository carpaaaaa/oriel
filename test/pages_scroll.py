#!/usr/bin/env python3
"""Smooth scrolling with a mouse wheel (studio/01 §8.36, studio/06 §1.11
#129): Chromium's own glide, on the compositor, on by default in Oriel (the
user's choice; Search's default is off). A notch sent as a mouse sends it
(mouseWheel in lines, no precise deltas) moves the page over several frames,
sampled each frame, and ends at the full distance, where a jump ends; a
touchpad's precise deltas land as they come; a scroller inside the page
glides itself while the page stays; a page that takes the wheel keeps it.
Off: a new tab jumps at once, a tab already open after Oriel restarts; on
again, new tabs glide again. Unless the system asks for less motion
(Windows' Animation effects off), then a notch jumps, as in Chrome."""
import json
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b

TALL = "<body style='margin:0;height:8000px;background:linear-gradient(#fff,#ccd)'>"
PAGES = {
    "/tall": "<title>tall</title>" + TALL + "<p style='margin:40px'>words</p>",
    "/inner": ("<title>inner</title>" + TALL + "<div class='box' style='position:absolute;left:100px;top:100px;width:300px;"
               "height:300px;overflow:auto;background:#eee'><div style='height:4000px'>inside</div></div>"),
    "/taken": ("<title>taken</title>" + TALL + "<script>window.n = 0; addEventListener('wheel', e => { e.preventDefault(); n++ },"
               " { passive: false })</script>"),
}


class Page(BaseHTTPRequestHandler):
    def do_GET(self):
        body = PAGES.get(self.path.split("?")[0], "<title>none</title>").encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/html")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a):
        pass


srv = ThreadingHTTPServer(("127.0.0.1", 0), Page)
threading.Thread(target=srv.serve_forever, daemon=True).start()
H = f"http://127.0.0.1:{srv.server_port}"
t = b.T()


def ev(tab, js):
    try:
        return b.ev(tab, js)
    except RuntimeError:
        return None


def pages():
    return b.call({"do": "pages.state"})


def open_tab(title, url):
    b.cmd("tab.new", url=url)
    b.wait_for(lambda: (b.active() or {}).get("title") == title and not b.active()["loading"], within=30, what=title)
    tab = b.active()["id"]
    # Painted, so the page takes input (a loaded machine paints late).
    b.wait_for(lambda: ev(tab, "new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(1))))") == 1, within=30, what="painted")
    time.sleep(0.4)
    return tab


def notch(tab, x=300, y=300, precise=False, delta=-120):
    """One notch down as a mouse sends it (or a touchpad's precise deltas);
    the page's scrollY and its box's scrollTop each frame: [ms, y, box]."""
    ev(tab, "scrollTo(0, 0); document.querySelectorAll('.box').forEach(e => e.scrollTop = 0); 1")
    time.sleep(0.3)
    ev(tab, "window.tr = []; window.t0 = performance.now(); (function f(){ const bx = document.querySelector('.box');"
            " tr.push([performance.now() - t0, scrollY, bx ? bx.scrollTop : 0]); if (performance.now() - t0 < 900) requestAnimationFrame(f) })(); 1")
    b.call({"do": "pages.input", "id": tab, "events": [
        {"type": "mouseMove", "x": x, "y": y},
        {"type": "mouseWheel", "x": x, "y": y, "deltaX": 0, "deltaY": delta, "wheelTicksX": 0, "wheelTicksY": -1 if delta < 0 else 1,
         "accelerationRatioX": 1, "accelerationRatioY": 1, "hasPreciseScrollingDeltas": precise, "canScroll": True}]})
    time.sleep(1.1)
    return ev(tab, "tr") or []


def path(tr, col=1):
    """Where it ended, the places it passed through on the way, and how long
    from the first move to the end (ms)."""
    ys = [r[col] for r in tr]
    if not ys:
        return 0, [], None
    end = ys[-1]
    mids = sorted({y for y in ys if 0 < y < end})
    start = next((r[0] for r in tr if r[col] != 0), None)
    done = next((r[0] for r in tr if r[col] == end), None)
    return end, mids, None if start is None or done is None else round(done - start)


def show(name, tr, col=1):
    end, mids, ms = path(tr, col)
    print(f"    {name}: end {end}, {len(mids)} between, {ms} ms: {[round(m, 1) for m in mids[:12]]}")


def written():
    """prefs.json as the world keeps it: only what differs from a default."""
    try:
        return json.loads((b.folder() / "prefs.json").read_text())
    except (OSError, ValueError):
        return {}


def setting(key, value):
    b.cmd("settings.set", id=key, value=value)
    time.sleep(0.6)


b.use("pages-scroll")
b.launch()

st = pages()
glides = st["systemGlides"]
if not glides:
    print("    (this system asks for less motion: a notch jumps, as in Chrome)")
t.ok(b.state()["prefs"].get("wheel.smooth") is True and "wheel.smooth" not in written() and st["gliding"] == glides and st["commandLine"]["smooth"] == glides,
     f"on by default: Chromium is told to glide ({st['commandLine']})")

# 1. A notch of a mouse wheel glides over several frames, to the full distance.
tab = open_tab("tall", H + "/tall?a")
tr = notch(tab)
show("on", tr)
end, mids, ms = path(tr)
if glides:
    t.ok(end >= 100 and len(mids) >= 3, f"a notch moves the page over several frames ({len(mids)} places between 0 and {end})")
    t.ok(ms is not None and 60 <= ms <= 400, f"in Chrome's glide, a fifth of a second at most ({ms} ms)")
else:
    t.ok(end >= 100 and not mids, "a notch moves the page in one step")
full = end

# 2. A touchpad's precise deltas land as they come.
tr = notch(tab, precise=True)
end, mids, _ = path(tr)
t.ok(end == 120 and not mids, f"a touchpad's precise deltas: in one step, as they come ({end}, {mids[:5]})")

# 3. A scroller inside the page glides itself; the page stays.
box = open_tab("inner", H + "/inner")
tr = notch(box, x=250, y=250)
show("box", tr, col=2)
end, mids, _ = path(tr, col=2)
t.ok(end >= 100 and (len(mids) >= 3) == glides and all(r[1] == 0 for r in tr),
     f"over a scroller in the page: the scroller glides, the page stays ({end}, {len(mids)} between)")

# 4. A page that takes the wheel keeps it: nothing moves, its listener hears the notch.
taken = open_tab("taken", H + "/taken")
tr = notch(taken)
t.ok(all(r[1] == 0 for r in tr) and ev(taken, "n") == 1, f"a page that takes the wheel keeps it ({ev(taken, 'n')} event, nothing moved)")

# 5. Off: new tabs jump at once; a tab already open keeps its glide until Oriel restarts.
setting("wheel.smooth", False)
st = pages()
t.ok(not st["gliding"] and st["commandLine"]["jumpy"] and not st["commandLine"]["smooth"], "off: Chromium is told not to glide")
fresh = open_tab("tall", H + "/tall?b")
tr = notch(fresh)
show("off, new tab", tr)
end, mids, _ = path(tr)
t.ok(end == full and not mids, f"off: a notch in a new tab moves the page in one step, the same distance ({end} vs {full})")
b.cmd("tab.select", id=tab)
time.sleep(0.5)
tr = notch(tab)
show("off, open tab", tr)
end, mids, _ = path(tr)
t.ok(end == full and (len(mids) >= 3) == glides, f"a tab already open goes on as it was made until Oriel restarts ({len(mids)} between)")
b.quit()

b.use("pages-scroll", wipe=False)
b.launch()
st = pages()
t.ok(b.state()["prefs"].get("wheel.smooth") is False and not st["gliding"] and st["commandLine"]["jumpy"], "after a restart, still off")
again = open_tab("tall", H + "/tall?c")
end, mids, _ = path(notch(again))
t.ok(end == full and not mids, f"off after a restart: one step ({end}, {len(mids)} between)")

# 6. On again: back to the default, and new tabs glide.
setting("wheel.smooth", True)
st = pages()
time.sleep(0.5)  # prefs.json is written after a moment of quiet
t.ok(b.state()["prefs"].get("wheel.smooth") in (True, None) and "wheel.smooth" not in written() and st["gliding"] == glides,
     "on again: the default, nothing written")
tr = notch(open_tab("tall", H + "/tall?d"))
show("on again, new tab", tr)
end, mids, _ = path(tr)
t.ok(end == full and (len(mids) >= 3) == glides, f"a new tab glides again, to the same distance ({end}, {len(mids)} between)")

srv.shutdown()
t.done()

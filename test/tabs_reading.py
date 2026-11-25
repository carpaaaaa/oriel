#!/usr/bin/env python3
"""Show how far you've read (Settings › Appearance › Tabs, `tabs.reading`;
studio/01 §2.17, §4.11): the tab you're on fills with grey from the left as
its page is scrolled down. The page says it (preload page/reading.ts) at most
once a frame and only when the hundredth changes, the main process forwards
only a changed value of the tab in front of the window that holds the page,
and nothing while the setting is off; a page's frames say nothing; it goes
back to nothing on navigation; another tab brought to the front says where it
is at once. The fill is ink at 5.5%, grows on an ease-out of 0.15 s inside
the tab's pill with its radius (the column's row and the top strip's tab),
not on a pin's square nor a strip tab down to its icon, and not at all under
Reduce animations. SHOTS: out/reading-*.png, light and dark, both layouts."""
import json
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b  # noqa: E402
import ui_kit as k  # noqa: E402

OUT = b.ROOT / "out"
OUT.mkdir(exist_ok=True)
PAGES = {
    "/long": "<title>long</title><body style='margin:0;height:5000px'>long",
    "/other": "<title>other</title><body style='margin:0;height:3000px'>other",
    "/frame": ("<title>frame</title><body style='margin:0'><iframe id=f style='width:300px;height:200px' "
               "srcdoc=\"<body style='margin:0;height:4000px'>in\"></iframe>"),
    "/anchor": "<title>anchor</title><body style='margin:0;height:5000px'><div id=a style='position:absolute;top:3000px'>here</div>",
}


class Page(BaseHTTPRequestHandler):
    def do_GET(self):
        body = PAGES.get(self.path.split("?")[0].split("#")[0], "<title>none</title>").encode()
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

b.use("tabs-reading")
b.launch(*k.FRAMES)
t = b.T()
time.sleep(1.0)
b.cmd("settings.set", id="look", value="light")
b.wait_for(lambda: b.ui("document.documentElement.dataset.look") == "light", what="light")


def ev(tab, js):
    try:
        return b.ev(tab, js)
    except RuntimeError:
        return None


def open_page(path, title):
    b.cmd("tab.new", url=H + path)
    b.wait_for(lambda: (b.active() or {}).get("title") == title and not b.active()["loading"], within=30, what=title)
    tab = b.active()["id"]
    # Painted, so the page takes its scrolls and its frames (a loaded machine paints late).
    b.wait_for(lambda: ev(tab, "new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(1))))") == 1, within=30, what="painted")
    time.sleep(0.3)
    return tab


def hundredth(tab):
    """What the page's own numbers say: round(clamp(y / max(1, height - inner), 0, 1) * 100) / 100."""
    return ev(tab, "Math.round(Math.min(1, Math.max(0, scrollY / Math.max(1, document.documentElement.scrollHeight - innerHeight))) * 100) / 100")


def reads():
    return json.loads(b.ui("JSON.stringify(window.__reads)"))


def forget():
    b.ui("window.__reads.length = 0; true")


def fill(sel):
    """The fill of the tab in front, against its pill: [width, pill's width, radius, its place]."""
    return k.js(f"const g = document.querySelector({json.dumps(sel + ' .ground')}); const f = g && g.querySelector('.reading'); if (!g) return null;"
                " const gr = g.getBoundingClientRect(); const fr = f && f.getBoundingClientRect();"
                " return { has: !!f, w: fr ? fr.width : 0, pill: gr.width, x: fr ? fr.x - gr.x : 0, radius: getComputedStyle(g).borderTopLeftRadius, clip: getComputedStyle(g).overflow }")


def settle_fill(sel, want, what):
    """The fill at `want` of its pill (the transition over, 0.15 s)."""
    def got():
        f = fill(sel)
        return f if f and f["has"] and abs(f["w"] - f["pill"] * want) <= 1.0 else None
    return b.wait_for(got, within=5, what=what)


# the interface hears what main says, to count it
b.ui("window.__reads = []; window.search.onReading(v => window.__reads.push(v)); true")

# 1. Off, the default: the page is scrolled, and the interface is told nothing
t.ok(b.state()["prefs"].get("tabs.reading") is False, "Show how far you've read: off by default")
first = open_page("/long", "long")
forget()
ev(first, "scrollTo(0, 1200); 1")
time.sleep(0.6)
want = hundredth(first)
held = b.call({"do": "tabs.reading", "id": first})
t.ok(0 < want < 1 and held["held"] == want, f"the main process keeps what the page said, off or on ({held['held']}, the page says {want})")
t.ok(reads() == [] and held["told"] is None, f"…and tells the interface nothing while the setting is off ({reads()})")
t.ok(not fill(".row.live")["has"], "…no fill in the tab's row")

# 2. On: the tab in front says where it is at once, and the fill is there
b.cmd("prefs.set", key="tabs.reading", value=True)
b.wait_for(lambda: reads(), what="told at once")
t.ok(reads()[-1] == {"id": first, "fraction": want}, f"turned on: the tab in front's value, at once ({reads()[-1]})")
f = settle_fill(".row.live", want, "the fill")
t.ok(f["x"] == 0 and k.near(f["w"], f["pill"] * want, 1.0), f"the fill grows from the left to {want} of its pill ({f['w']:.1f} of {f['pill']:.1f})")
t.ok(f["radius"] == "9px" and f["clip"] == "hidden", f"inside the pill's radius 9, clipped by it ({f['radius']}, {f['clip']})")
look = k.style(".row.live .reading", "background-color", "transition-property", "transition-duration", "transition-timing-function")
t.ok(k.same_colour(look["background-color"], "rgba(23, 23, 23, 0.055)"), f"ink at 5.5%: {look['background-color']}")
# Chromium names cubic-bezier(0, 0, .58, 1) by its keyword: ease-out. With the
# system's animation effects off (a Windows machine in a test) the interface
# is in instant motion and nothing eases.
instant = bool(b.ui("document.documentElement.dataset.motion === 'instant' || matchMedia('(prefers-reduced-motion: reduce)').matches"))
if instant:
    t.ok(look["transition-duration"] in ("0s", "0ms"), f"animation effects off here: the fill takes its place at once: {look}")
else:
    t.ok(look["transition-property"] == "width" and look["transition-duration"] == "0.15s" and look["transition-timing-function"] in ("ease-out", "cubic-bezier(0, 0, 0.58, 1)"),
         f"it grows on an ease-out of 0.15 s: {look}")
time.sleep(0.3)
p = OUT / "reading-column-light.png"
b.shot(p)

# 3. At most once a frame, and only a changed hundredth
forget()
ev(first, "scrollTo(0, 500); scrollTo(0, 1500); scrollTo(0, 2500); 1")
time.sleep(0.6)
want = hundredth(first)
t.ok(reads() == [{"id": first, "fraction": want}], f"three scrolls in one frame, one report: {reads()}")
forget()
ev(first, "scrollBy(0, 2); 1")
time.sleep(0.5)
t.ok(hundredth(first) == want and reads() == [], f"two pixels more, the same hundredth: nothing told ({reads()})")
forget()
ev(first, "scrollTo(0, 0); 1")
b.wait_for(lambda: reads(), what="top")
t.ok(reads()[-1]["fraction"] == 0, f"the top is 0: {reads()[-1]}")
settle_fill(".row.live", 0, "empty fill")
ev(first, "scrollTo(0, 99999); 1")
b.wait_for(lambda: reads() and reads()[-1]["fraction"] == 1, what="bottom")
f = settle_fill(".row.live", 1, "full fill")
t.ok(k.near(f["w"], f["pill"], 1.0), f"the bottom is the whole pill ({f['w']:.1f} of {f['pill']:.1f})")
ev(first, "scrollTo(0, 2000); 1")
b.wait_for(lambda: reads()[-1]["fraction"] not in (0, 1), what="middle")
mid = hundredth(first)
settle_fill(".row.live", mid, "middle fill")

# 4. A page that opens scrolled (an anchor) says so, with no one scrolling it
anchor = open_page("/anchor", "anchor")
forget()
b.cmd("tab.go", input=H + "/anchor#a")
b.wait_for(lambda: (ev(anchor, "scrollY") or 0) > 1000, what="scrolled to the anchor")
b.wait_for(lambda: reads(), what="told")
t.ok(reads()[-1] == {"id": anchor, "fraction": hundredth(anchor)} and reads()[-1]["fraction"] > 0.5, f"scrolled by the page itself: {reads()[-1]}")

# 5. Another tab in front: its own value at once; back, the first's again
other = open_page("/other", "other")
b.wait_for(lambda: reads()[-1]["id"] == other, what="the new tab's value")
t.ok(reads()[-1] == {"id": other, "fraction": 0}, f"a tab brought to the front says where it is: {reads()[-1]}")
t.ok(settle_fill(".row.live", 0, "none yet") is not None and not fill(f".row[data-tab='{first}']")["has"], "the fill is on the tab in front's row, not the others")
ev(other, "scrollTo(0, 1000); 1")
o = hundredth(other)
b.wait_for(lambda: reads()[-1] == {"id": other, "fraction": o}, what="other scrolled")
b.cmd("tab.select", id=first)
b.wait_for(lambda: reads()[-1]["id"] == first, what="back to the first")
t.ok(reads()[-1] == {"id": first, "fraction": mid}, f"back to the first: where it was, kept ({reads()[-1]})")
settle_fill(".row.live", mid, "restored fill")

# 6. A page's frames, and a tab out of sight, tell nothing of the tab in front
frame = open_page("/frame", "frame")
b.cmd("tab.select", id=first)
b.wait_for(lambda: reads()[-1]["id"] == first, what="first in front")
forget()
b.cmd("tab.select", id=frame)
b.wait_for(lambda: reads() and reads()[-1]["id"] == frame, what="frame tab in front")
forget()
ev(frame, "document.getElementById('f').contentWindow.scrollTo(0, 3000); 1")
time.sleep(0.8)
inner = ev(frame, "document.getElementById('f').contentWindow.scrollY")
t.ok(inner > 1000 and reads() == [], f"scrolled inside a frame ({inner}): the page says nothing ({reads()})")
b.call({"do": "tabs.reading", "id": first, "say": 0.77})
time.sleep(0.4)
t.ok(reads() == [] and b.call({"do": "tabs.reading", "id": first})["held"] == 0.77, f"a tab out of sight says it: kept, not told ({reads()})")
b.cmd("tab.select", id=first)
b.wait_for(lambda: reads(), what="first in front again")
t.ok(reads()[-1] == {"id": first, "fraction": 0.77}, f"…and told when it comes to the front: {reads()[-1]}")
b.call({"do": "tabs.reading", "id": first, "say": "far"})
b.call({"do": "tabs.reading", "id": first, "say": 9})
t.ok(b.call({"do": "tabs.reading", "id": first})["held"] == 1, "a word is no value; more than 1 is 1")

# 7. Going somewhere: back to nothing at once; a fragment isn't going anywhere
# (the page's own last word was 0.47: a different place, or the page says nothing new)
ev(first, "scrollTo(0, 2400); 1")
b.wait_for(lambda: reads()[-1]["fraction"] not in (0.77, 1), what="scrolled again")
mid = hundredth(first)
forget()
ev(first, "location.hash = 'nowhere'; 1")
time.sleep(0.6)
t.ok(hundredth(first) == mid and b.call({"do": "tabs.reading", "id": first})["held"] == mid and reads() == [], f"a fragment: where it was ({mid})")
b.cmd("tab.go", input=H + "/other")
b.wait_for(lambda: reads() and reads()[-1]["fraction"] == 0, what="navigated")
t.ok(reads()[-1] == {"id": first, "fraction": 0}, f"navigated: back to nothing: {reads()[-1]}")
settle_fill(".row.live", 0, "empty again")

# 8. A pin's square draws none; a row of a pin does not need one either
b.cmd("tab.pin", id=first)
time.sleep(0.6)
ev(first, "scrollTo(0, 800); 1")
b.wait_for(lambda: reads()[-1]["fraction"] > 0, what="scrolled, pinned")
time.sleep(0.5)
n = k.js("return document.querySelectorAll('.square .reading, .tile .reading').length")
t.ok(n == 0, f"a pin's square has no fill ({n})")
b.cmd("tab.unpin", id=first)
time.sleep(0.5)

# 9. Reduce animations: no growing
b.cmd("prefs.set", key="motion.instant", value=True)
time.sleep(0.5)
d = k.style(".row.live .reading", "transition-duration")
t.ok(d and d["transition-duration"] == "0s", f"Reduce animations: the fill is where it is at once ({d})")
b.cmd("prefs.set", key="motion.instant", value=False)

# 10. Dark
b.cmd("settings.set", id="look", value="dark")
b.wait_for(lambda: b.ui("document.documentElement.dataset.look") == "dark", what="dark")
time.sleep(0.5)
ev(first, "scrollTo(0, 2000); 1")
time.sleep(0.6)
look = k.style(".row.live .reading", "background-color")
t.ok(look and k.same_colour(look["background-color"], "rgba(237, 237, 237, 0.055)"), f"dark: ink at 5.5%: {look}")
b.shot(OUT / "reading-column-dark.png")

# 11. Tabs across the top: in the tab's pill, not a pin's square, not a tab down to its icon
b.cmd("settings.set", id="tabs.layout", value="top")
b.wait_for(lambda: b.ui("!!document.querySelector('.strip-tab')"), what="the strip")
time.sleep(0.8)
want = hundredth(first)
b.wait_for(lambda: (reads() or [{}])[-1].get("id") == first, what="told")
f = settle_fill(".strip-tab.live", reads()[-1]["fraction"], "the strip's fill")
t.ok(f["x"] == 0 and f["radius"] == "9px" and f["clip"] == "hidden", f"across the top: in the tab's pill, radius 9, clipped ({f['radius']}, {f['clip']})")
look = k.style(".strip-tab.live .reading", "background-color", "transition-duration", "transition-timing-function")
t.ok(look and k.same_colour(look["background-color"], "rgba(237, 237, 237, 0.055)") and look["transition-duration"] == ("0s" if instant else "0.15s"), f"the same fill: {look}")
b.shot(OUT / "reading-strip-dark.png")
b.cmd("settings.set", id="look", value="light")
b.wait_for(lambda: b.ui("document.documentElement.dataset.look") == "light", what="light")
time.sleep(0.5)
b.shot(OUT / "reading-strip-light.png")
look = k.style(".strip-tab.live .reading", "background-color")
t.ok(look and k.same_colour(look["background-color"], "rgba(23, 23, 23, 0.055)"), f"light: {look}")

# a pin's square across the top, the tab in front: no fill
b.cmd("tab.pin", id=first)
b.wait_for(lambda: b.ui("!!document.querySelector('.strip-pin.live')"), what="pin in front")
ev(first, "scrollTo(0, 1500); 1")
time.sleep(0.6)
n = k.js("return [document.querySelectorAll('.strip-pin .reading').length, document.querySelectorAll('.strip-pin.live').length]")
t.ok(n == [0, 1], f"a pin's square across the top, in front, has no fill ({n})")
b.cmd("tab.unpin", id=first)
b.wait_for(lambda: b.ui("!!document.querySelector('.strip-tab.live')"), what="unpinned")
time.sleep(0.5)

# a tab down to its icon: the real tab, among others that crowd it (a window state laid on the strip)
st = k.fixture("top")
st["prefs"] = {**st.get("prefs", {}), "tabs.reading": True}
many = [{**st["tabs"][-1], "id": f"x{i}", "label": f"Tab {i}", "title": f"Tab {i}", "url": f"https://example{i}.com/", "pinID": None, "groupID": None} for i in range(40)]
mine = [{**x, "pinID": None, "groupID": None} for x in b.window()["tabs"] if x["id"] == first]
STRIP = "const e = document.querySelector('.strip-tab.live'); return e ? { w: e.getBoundingClientRect().width, titled: e.classList.contains('titled'), reading: !!e.querySelector('.reading') } : null"
k.fake({**st, "tabs": mine + many[:2], "pins": [], "groups": [], "activeID": first}, look="light")
time.sleep(0.8)
roomy = k.js(STRIP)
t.ok(roomy and roomy["titled"] and roomy["reading"], f"with room, the tab in front has its fill ({roomy})")
k.fake({**st, "tabs": mine + many, "pins": [], "groups": [], "activeID": first}, look="light")
time.sleep(0.8)
crowd = k.js(STRIP)
t.ok(crowd and crowd["w"] < 104 and not crowd["titled"], f"crowded, the tab in front is down to its icon ({crowd})")
t.ok(crowd and not crowd["reading"], "...and has no fill: thirty points of grey behind a letter say nothing")
k.thaw()

t.done()

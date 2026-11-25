#!/usr/bin/env python3
"""A page's scrollbars are thin and quiet (preload/page/scrollbar.ts): a slim
thumb in a neutral grey, no track, no arrows. Every site has the same, its own
styling set aside (carpa, 25 Nov 2026); Settings > Pages > Scroll bars: Windows' own
leaves them all alone. The picture of a tall page scrolled a little is kept for looking
at (SHOTS_DIR or out/)."""
import os
import sys
import time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b
import settings_c_web as web

server, P = web.start(tls=False)
H = f"http://127.0.0.1:{P}"
TALL = "<body style='margin:0;height:6000px;background:linear-gradient(#fff,#ccd)'><p style='margin:40px'>words</p>"
web.PAGES["/tall"] = "<title>tall</title>" + TALL
web.PAGES["/own"] = "<title>own</title><style>::-webkit-scrollbar{width:20px}</style>" + TALL
web.PAGES["/plain"] = "<title>plain</title><style>html{scrollbar-color:red blue}</style>" + TALL
web.PAGES["/inner"] = ("<title>inner</title><body style='margin:0'><div id='s' style='width:300px;height:200px;overflow:auto'>"
                       "<div style='height:2000px'>inner</div></div>")

b.use("pages-scrollbar")
b.launch()
t = b.T()
shots = Path(os.environ.get("SHOTS_DIR") or (b.ROOT / "out"))
shots.mkdir(parents=True, exist_ok=True)


def ev(tab, js):
    try:
        return b.ev(tab, js)
    except RuntimeError:
        return None


def open_page(path, title):
    b.cmd("tab.new", url=H + path)
    b.wait_for(lambda: b.active()["title"] == title, within=30, what=title)
    tab = b.active()["id"]
    b.wait_for(lambda: ev(tab, "new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(1))))") == 1, within=30, what="painted")
    time.sleep(0.4)
    return tab


tab = open_page("/tall", "tall")
gutter = lambda t: ev(t, "innerWidth - document.documentElement.clientWidth")
t.ok(gutter(tab) == 10, f"the page's scrollbar is 10 px wide, not the system's 15 with arrows ({gutter(tab)})")
ev(tab, "scrollTo(0, 400); 1")
time.sleep(0.6)
b.shot(shots / "scrollbar-tall.png")

plain = open_page("/plain", "plain")
t.ok(gutter(plain) == 10, f"a site that sets its own scrollbar colour has the same ({gutter(plain)} px)")

own = open_page("/own", "own")
t.ok(gutter(own) == 10, f"a site that styles ::-webkit-scrollbar has the same ({gutter(own)} px)")

inner = open_page("/inner", "inner")
inside = ev(inner, "(() => { const e = document.getElementById('s'); return e.offsetWidth - e.clientWidth })()")
t.ok(inside == 10, f"a box that scrolls inside the page is the same ({inside} px)")
# Windows' own: the system's width again, on a page open already.
b.cmd("prefs.set", key="pages.scrollbars", value="windows")
b.wait_for(lambda: gutter(tab) != 10, within=10, what="the system's scroll bar back")
t.ok(gutter(tab) != 10, f"Windows' own leaves the system's scroll bar ({gutter(tab)} px)")
b.cmd("prefs.set", key="pages.scrollbars", value="oriel")
b.wait_for(lambda: gutter(tab) == 10, within=10, what="Oriel's back")
t.ok(gutter(tab) == 10, "Oriel's back at once")
t.done()

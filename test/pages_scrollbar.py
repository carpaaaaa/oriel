#!/usr/bin/env python3
"""A page's scrollbars are thin and quiet (preload/page/scrollbar.ts): a slim
thumb in a neutral grey, no track. A site that styles its own scrollbars
keeps them. The picture of a tall page scrolled a little is kept for looking
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
web.PAGES["/own"] = "<title>own</title><style>html{scrollbar-color:red blue}</style>" + TALL
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
cs = lambda js: ev(tab, f"(() => {{ const s = getComputedStyle({js}); return [s.scrollbarWidth, s.scrollbarColor] }})()")
width, color = cs("document.documentElement")
t.ok(width == "thin", f"the page's scrollbar is thin ({width})")
t.ok(color.replace(",", "").replace("  ", " ").startswith("rgba(128 128 128 / 0.5)") or color.startswith("rgba(128, 128, 128, 0.5)"), f"in a neutral grey, no track ({color})")
ev(tab, "scrollTo(0, 400); 1")
time.sleep(0.6)
gutter = ev(tab, "innerWidth - document.documentElement.clientWidth")
print(f"  (the scrollbar takes {gutter} px of the page's width)")
b.shot(shots / "scrollbar-tall.png")

own = open_page("/own", "own")
width, color = ev(own, "(() => { const s = getComputedStyle(document.documentElement); return [s.scrollbarWidth, s.scrollbarColor] })()")
t.ok("255, 0, 0" in color or "red" in color, f"a site's own scrollbar colour is kept ({color})")

inner = open_page("/inner", "inner")
width, color = ev(inner, "(() => { const s = getComputedStyle(document.getElementById('s')); return [s.scrollbarWidth, s.scrollbarColor] })()")
t.ok(width == "thin", f"a box that scrolls inside the page is thin too ({width})")
t.done()

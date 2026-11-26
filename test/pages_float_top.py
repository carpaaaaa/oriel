#!/usr/bin/env python3
"""The floating video stays on top of everything, Oriel maximized too: on
Windows Electron's 'floating' level put the little window just under the
taskbar, and with Oriel maximized that was under Oriel, where nobody saw the
video (carpa's recording, 26 Nov 2026)."""
import sys
import time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b

t = b.T()
PAGE = ("data:text/html,<title>vid</title><canvas id=c width=640 height=360></canvas><video id=v width=640 height=360 autoplay></video>"
        "<script>const c=document.getElementById('c'),x=c.getContext('2d');let n=0;setInterval(()=>{x.fillStyle='hsl('+(n++%25360)+',80%25,50%25)';"
        "x.fillRect(0,0,640,360)},33);const v=document.getElementById('v');v.srcObject=c.captureStream(30);v.play()</script>")
fl = lambda: b.call({"do": "pages.state"})["float"]["floating"]

for maximized in (False, True):
    b.use("pages-float-top")
    b.launch(env={"SEARCH_SHOW": "1"})
    b.cmd("tab.new", url=PAGE)
    time.sleep(1.5)
    if maximized:
        b.cmd("window.maximize")
        time.sleep(1.5)
    r = b.cmd("view.float")
    t.ok(r.get("floating"), f"Ctrl+Shift+P floats it ({'maximized' if maximized else 'in a window'})")
    time.sleep(1)
    f = fl()
    t.ok(f and f["visible"] and f["onTop"], f"the little window is shown, on top of everything ({'maximized' if maximized else 'in a window'}: {f and f['onTop']})")
    b.cmd("view.float")
    t.ok(not b.state().get("errors"), "no error in the main process")
    b.quit()
t.done()

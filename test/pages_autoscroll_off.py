#!/usr/bin/env python3
"""Scroll with the middle button stays off when it is off (studio/06 §1.11).

Chromium on Windows scrolls a page by itself when the wheel button is pressed
on it; Oriel's own version is the setting. With the setting off, a middle
click must scroll nothing: the pressed middle button is cancelled before the
page's own handlers hear it (that is what stops Chromium's own autoscroll,
which only Windows has: the Mac can only show that the press was cancelled).
A link still opens in a new tab on a middle click, off."""
import sys
import time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b
import settings_c_web as web

server, P = web.start(tls=False)
H = f"http://127.0.0.1:{P}"
web.PAGES["/tall"] = ("<title>tall</title><body style='margin:0;height:6000px'><p style='margin:300px'>words</p>"
                      "<a id='l' href='/other' style='position:absolute;left:0;top:600px;display:block;width:300px;height:60px'>other</a>")
web.PAGES["/other"] = "<title>other</title>"
web.PAGES["/tall"] = web.PAGES["/tall"] + ("<script>window.dp=[];addEventListener('mousedown',e=>dp.push([e.button,e.defaultPrevented,!!e.target.closest('a')]),true)</script>")

b.use("pages-autoscroll-off")
b.launch()
t = b.T()


def ev(tab, js):
    try:
        return b.ev(tab, js)
    except RuntimeError:
        return None


def send(tab, *events):
    b.call({"do": "pages.input", "id": tab, "events": list(events)})


def middle(tab, x, y):
    send(tab, {"type": "mouseDown", "x": x, "y": y, "button": "middle", "clickCount": 1},
         {"type": "mouseUp", "x": x, "y": y, "button": "middle", "clickCount": 1})


b.cmd("tab.new", url=H + "/tall")
b.wait_for(lambda: b.active()["title"] == "tall", within=30, what="tall")
tab = b.active()["id"]
b.wait_for(lambda: ev(tab, "new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(1))))") == 1, within=30, what="painted")
time.sleep(0.4)

b.cmd("settings.set", id="autoscroll", value=False)
time.sleep(1.0)
middle(tab, 300, 200)
send(tab, {"type": "mouseMove", "x": 300, "y": 420})
time.sleep(1.2)
t.ok(ev(tab, "scrollY") == 0, "off: a click of the wheel and the mouse moved down scrolls nothing, Chromium's own included")
send(tab, {"type": "mouseMove", "x": 300, "y": 120})
time.sleep(0.4)
t.ok(ev(tab, "scrollY") == 0, "and moving back doesn't either")
t.ok(ev(tab, "!!document.querySelector('[data-oriel-autoscroll]')") is False, "no mark is left")
t.ok(ev(tab, "dp.filter(d => d[0] === 1).map(d => d[1])") == [True], "the pressed middle button was cancelled before the page's own handlers (so Chromium's autoscroll never starts)")

# A link on the wheel button still opens in a tab of its own.
before = len(b.state()["tabs"])
middle(tab, 60, 630)
b.wait_for(lambda: len(b.state()["tabs"]) == before + 1, within=15, what="the link in a new tab")
t.ok(True, "off: a middle click on a link still opens it in a new tab")
t.ok(ev(tab, "dp.filter(d => d[0] === 1).map(d => d[1])") == [True, False], "a press on a link is left alone")

b.cmd("settings.set", id="autoscroll", value=True)
time.sleep(1.0)
b.cmd("tab.select", id=tab)
time.sleep(0.4)
middle(tab, 300, 200)
time.sleep(0.2)
t.ok(ev(tab, "!!document.querySelector('[data-oriel-autoscroll]')") is True, "on: Oriel's own mark is left where the wheel was clicked")
send(tab, {"type": "mouseMove", "x": 300, "y": 420})
b.wait_for(lambda: (ev(tab, "scrollY") or 0) > 200, within=10, what="scrolling down")
t.ok(True, "on: the page scrolls towards the pointer")
t.done()

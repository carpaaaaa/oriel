#!/usr/bin/env python3
"""Settings › Browsing › Video, by what each switch does (studio/06 §1.5,
§3.5): Videos wait for a click, Press Esc twice to leave full screen, and
the floating video (The floating video, Float the video on its own,
Minimize the floating video, the flick to a corner)."""
import sys
import time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b
import settings_c_web as web

server, P = web.start(tls=False)
H = f"http://127.0.0.1:{P}"
web.PAGES["/tone.wav"] = (web.wav(30), "audio/wav")
web.PAGES["/auto"] = ("<title>auto</title><body style='margin:0'>"
                      "<video id='v' autoplay muted loop src='/tone.wav' style='width:320px;height:180px;background:#000'></video>"
                      "<video id='w' loop src='/tone.wav' style='width:320px;height:180px'></video>"
                      "<button id='go' style='position:fixed;left:0;top:400px;width:200px;height:60px' onclick=\"document.getElementById('w').play()\">play</button>"
                      "<script>window.r = null; setTimeout(() => document.getElementById('w').play().then(() => window.r = 'played', e => window.r = e.name), 800)</script>")
web.PAGES["/full"] = "<title>full</title><body style='margin:0'><div id='f' style='width:300px;height:200px;background:#345'>video</div>"

b.use("settings-c-video")
b.launch()
t = b.T()


def setting(key, value):
    b.cmd("settings.set", id=key, value=value)
    time.sleep(1.0)


def ev(tab, js):
    try:
        return b.ev(tab, js)
    except RuntimeError:
        return None


def send(tab, *events):
    b.call({"do": "pages.input", "id": tab, "events": list(events)})


def tab_titled(title, url):
    b.cmd("tab.new", url=url)
    b.wait_for(lambda: b.active()["title"] == title, within=30, what=title)
    time.sleep(0.4)
    return b.active()["id"]


# 1. Videos wait for a click (off by default).
# (The bench's own reads count as a click for five seconds: none until the page has tried.)
tab = tab_titled("auto", H + "/auto")
time.sleep(2.5)
t.ok(ev(tab, "document.getElementById('v').paused") is False, "off: a muted autoplay video starts by itself")
t.ok(ev(tab, "window.r") == "played", "off: a page's script can start one")
setting("media.click", True)
tab = tab_titled("auto", H + "/auto?on")
time.sleep(2.5)
t.ok(ev(tab, "document.getElementById('v').paused") is True, "on: an autoplay video waits, even without sound")
t.ok(ev(tab, "window.r") != "played" and ev(tab, "document.getElementById('w').paused") is True, f"on: a script's play() without a click doesn't start it ({ev(tab, 'window.r')})")
send(tab, {"type": "mouseDown", "x": 50, "y": 420, "button": "left", "clickCount": 1},
     {"type": "mouseUp", "x": 50, "y": 420, "button": "left", "clickCount": 1})
time.sleep(1)
t.ok(ev(tab, "document.getElementById('w').paused") is False, "on: a click plays it")
setting("media.click", False)

# 2. Press Esc twice to leave full screen.
def full(tab):
    ev(tab, "document.getElementById('f').requestFullscreen().then(() => 1, () => 0)")
    b.wait_for(lambda: ev(tab, "!!document.fullscreenElement"), within=10, what="full screen")
    time.sleep(0.5)


def esc(tab):
    send(tab, {"type": "keyDown", "keyCode": "Escape"}, {"type": "keyUp", "keyCode": "Escape"})
    time.sleep(0.4)


def pill(tab):
    return ev(tab, "(() => { const p = document.querySelector('[data-oriel-reminder]'); return !!p && p.matches(':popover-open') })()")


tab = tab_titled("full", H + "/full")
full(tab)
esc(tab)
b.wait_for(lambda: not ev(tab, "!!document.fullscreenElement"), within=5, what="left on one press")
t.ok(True, "off: one Escape leaves the page's full screen")
setting("fullscreen.escapeTwice", True)
full(tab)
esc(tab)
st = b.call({"do": "pages.state"})
t.ok(ev(tab, "!!document.fullscreenElement") is True, "on: the first Escape is kept, the page stays full screen")
t.ok(st["reminder"]["showing"] and pill(tab), "the reminder is up over the page")
esc(tab)
b.wait_for(lambda: not ev(tab, "!!document.fullscreenElement"), within=5, what="left on the second press")
t.ok(not b.call({"do": "pages.state"})["reminder"]["showing"] and not pill(tab), "a second within two seconds leaves, and takes the reminder")
full(tab)
esc(tab)
time.sleep(2.4)
t.ok(not b.call({"do": "pages.state"})["reminder"]["showing"] and ev(tab, "!!document.fullscreenElement"), "after two seconds the reminder goes and the page stays")
esc(tab)
t.ok(ev(tab, "!!document.fullscreenElement") is True and b.call({"do": "pages.state"})["reminder"]["showing"], "and the next press is a first again")
ev(tab, "document.exitFullscreen()")
time.sleep(0.6)
t.ok(not b.call({"do": "pages.state"})["reminder"]["showing"], "leaving full screen another way takes the reminder with it")
setting("fullscreen.escapeTwice", False)

t.done()

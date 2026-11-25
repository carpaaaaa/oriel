#!/usr/bin/env python3
"""Settings › Browsing › Video, by what each switch does (studio/06 §1.5,
§3.5): Videos wait for a click, Press Esc twice to leave full screen, and
the floating video (one switch, Floating video; Float the video on its own,
Minimize the floating video, the flick to a corner; a site's own picture in
picture button floats it too, and is refused with the switch off)."""
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


def tab_titled(title, url, paint=True):
    b.cmd("tab.new", url=url)
    b.wait_for(lambda: b.active()["title"] == title, within=30, what=title)
    tab = b.active()["id"]
    # Painted, so the page takes input (a loaded machine paints late).
    if paint:  # (the bench's reads count as a click: not before a page's own play())
        b.wait_for(lambda: ev(tab, "new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(1))))") == 1, within=30, what="painted")
    time.sleep(0.4)
    return tab


# 1. Videos wait for a click (off by default).
# (The bench's own reads count as a click for five seconds: none until the page has tried.)
tab = tab_titled("auto", H + "/auto", paint=False)
time.sleep(2.5)
t.ok(ev(tab, "document.getElementById('v').paused") is False, "off: a muted autoplay video starts by itself")
t.ok(ev(tab, "window.r") == "played", "off: a page's script can start one")
setting("media.click", True)
tab = tab_titled("auto", H + "/auto?on", paint=False)
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
    time.sleep(1.2)  # a Mac window animates into full screen


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
time.sleep(0.8)  # a Mac's window takes its time going back into full screen
esc(tab)
b.wait_for(lambda: not ev(tab, "!!document.fullscreenElement"), within=5, what="left on the second press")
t.ok(not b.call({"do": "pages.state"})["reminder"]["showing"] and not pill(tab), "a second within two seconds leaves, and takes the reminder")
time.sleep(1.2)
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

# 3. The floating video. The test page's host counts as a player's site
# (as the Mac's Players.benchHosts); its tone is too quiet to hear.
import os
web.PAGES["/quiet.wav"] = (web.wav(60, loud=40), "audio/wav")
web.PAGES["/film"] = ("<title>film</title><body style='margin:0;background:#fff'><h1>film page</h1>"
                      "<video id='v' loop src='/quiet.wav' style='width:640px;height:360px;background:#123'></video><p>words</p>")
web.PAGES["/else"] = "<title>else</title>"
b.call({"do": "pages.testHosts", "test.playerHosts": ["127.0.0.1"]})


def fl():
    return b.call({"do": "pages.state"})["float"]


def playing_film():
    tab = tab_titled("film", H + "/film")
    ev(tab, "document.getElementById('v').play().then(() => 1)")
    b.wait_for(lambda: next(x for x in b.state()["tabs"] if x["id"] == tab).get("audible"), within=15, what="audible")
    return tab


film = playing_film()
other = tab_titled("else", H + "/else")
b.wait_for(lambda: fl()["floating"], within=15, what="floated on leaving")
f = fl()["floating"]
t.ok(f["tab"] == film and f["holdsPage"], "leaving a tab with a video playing floats it, its page and all (Switching tabs, the default)")
t.ok(ev(film, "document.documentElement.classList.contains('oriel-floating') && !document.getElementById('v').paused") is True, "the video goes on playing")
size = ev(film, "(() => { const r = document.getElementById('v').getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height), innerWidth, innerHeight] })()")
t.ok(size and size[0] == size[2] and size[1] == size[3] and 250 <= size[2] <= 460, f"everything else goes, the video fills the little window ({size})")
t.ok(b.window()["float"] and b.window()["float"]["tab"] == film and "style" not in b.window()["float"], "one floating video, on as it comes")
t.ok(b.state()["prefs"].get("float.enabled") is True and fl()["enabled"] is True, "Floating video is on by default")
b.cmd("tab.select", id=film)
b.wait_for(lambda: not fl()["floating"], within=10, what="landed")
time.sleep(0.5)
t.ok(ev(film, "document.documentElement.classList.contains('oriel-floating')") is False and ev(film, "!document.getElementById('v').paused") is True, "back to its tab, it lands, still playing")
size = ev(film, "innerWidth")
t.ok(size and size > 460, f"and its page is the tab's size again ({size})")

# Minimize, the buttons and the flick.
b.cmd("tab.select", id=other)
b.wait_for(lambda: fl()["floating"], within=15, what="floated again")
time.sleep(1)
ctl = lambda js: b.call({"do": "pages.floatControls", "js": js})["value"]
t.ok(ctl("document.getElementById('tuck').classList.contains('off')") is True, "Minimize off: no button to tuck it")
setting("float.minimize", True)
t.ok(ctl("document.getElementById('tuck').classList.contains('off')") is False, "on: the button comes at once")
wide = fl()["floating"]["bounds"]["width"]
ctl("document.getElementById('tuck').click(); 1")
time.sleep(0.6)
f = fl()["floating"]
t.ok(f["tucked"] and f["bounds"]["width"] == 220, f"the button tucks it small ({f['bounds']})")
ctl("document.getElementById('tuck').click(); 1")
time.sleep(0.6)
f = fl()["floating"]
t.ok(not f["tucked"] and f["bounds"]["width"] == wide, "the same button brings it back")
setting("float.minimize", False)
before = fl()["floating"]["bounds"]
b.call({"do": "pages.floatControls", "events": [{"type": "mouseMove", "x": 100, "y": 100},
        {"type": "mouseWheel", "x": 100, "y": 100, "deltaX": 400, "deltaY": 400, "wheelTicksX": 3, "wheelTicksY": 3, "hasPreciseScrollingDeltas": False, "canScroll": True}]})
try:
    b.wait_for(lambda: fl()["floating"]["bounds"]["x"] != before["x"], within=8, what="flick")
except AssertionError:
    pass
after = fl()["floating"]["bounds"]
t.ok(after["x"] < before["x"] and after["y"] < before["y"], f"two fingers flick it to the corner they point at ({before['x']},{before['y']} to {after['x']},{after['y']})")
ctl("document.getElementById('pause').click(); 1")
time.sleep(0.6)
t.ok(ev(film, "document.getElementById('v').paused") is True, "its pause button pauses the video")
ctl("document.getElementById('pause').click(); 1")
time.sleep(0.6)
ctl("document.getElementById('back').click(); 1")
b.wait_for(lambda: not fl()["floating"] and b.active()["id"] == film, within=10, what="back to the tab")
t.ok(True, "its back button goes to the tab, and the video lands there")

# Never; a site that isn't a player's; Ctrl+Shift+P by hand.
setting("float.own", "never")
b.cmd("tab.select", id=other)
time.sleep(2)
t.ok(not fl()["floating"], "Never: leaving the tab leaves the video in it")
setting("float.own", "tabs")
b.call({"do": "pages.testHosts", "test.playerHosts": []})
b.cmd("tab.select", id=film)
time.sleep(0.5)
b.cmd("tab.select", id=other)
time.sleep(2)
t.ok(not fl()["floating"], "on its own, only from a site whose video is the point of the site")
b.cmd("tab.select", id=film)
time.sleep(0.5)
r = b.cmd("view.float")
t.ok(r.get("floating") and fl()["floating"]["tab"] == film, "Ctrl+Shift+P floats it by hand from any site")
r = b.cmd("view.float")
b.wait_for(lambda: not fl()["floating"], within=10, what="landed by hand")
t.ok(r.get("landed") is True, "and again lands it")
b.call({"do": "pages.testHosts", "test.playerHosts": ["127.0.0.1"]})

# Tabs or apps: leaving Oriel floats the video, coming back lands it.
setting("float.own", "tabsOrApps")
b.call({"do": "pages.appFocus", "focused": False})
b.wait_for(lambda: fl()["floating"], within=10, what="floated on leaving Oriel")
t.ok(fl()["floating"]["tab"] == film and fl()["floating"]["away"], "Tabs or apps: another app in front floats the video")
b.call({"do": "pages.appFocus", "focused": True})
b.wait_for(lambda: not fl()["floating"], within=10, what="landed on coming back")
t.ok(ev(film, "document.documentElement.classList.contains('oriel-floating')") is False, "back in Oriel on its tab, it lands")
setting("float.own", "tabs")

# A muted video isn't one somebody is watching: it stays.
ev(film, "document.getElementById('v').muted = true; 1")
time.sleep(1)
b.cmd("tab.select", id=other)
time.sleep(2)
t.ok(not fl()["floating"], "a muted video doesn't float out on its own")
b.cmd("tab.select", id=film)
ev(film, "document.getElementById('v').muted = false; 1")

# A tab's own picture in picture button (requestPictureInPicture): the video
# floats here, the one the button named, and it lands on a second press.
web.PAGES["/pip"] = ("<title>pip</title><body style='margin:0'>"
                     "<video id='v' autoplay muted loop src='/tone.wav' style='width:320px;height:180px;background:#000'></video>"
                     "<video id='w' loop src='/tone.wav' style='width:320px;height:180px'></video>"
                     "<script>window.pip = null; setTimeout(() => document.getElementById('v').requestPictureInPicture().then(() => window.pip = 'in', e => window.pip = e.name), 700)</script>")
b.call({"do": "pages.testHosts", "test.playerHosts": []})
pipper = tab_titled("pip", H + "/pip", paint=False)
time.sleep(2.2)
t.ok(ev(pipper, "window.pip") == "NotAllowedError" and not fl()["floating"], f"asked with no click, it is refused as Chromium refuses it ({ev(pipper, 'window.pip')})")
t.ok(ev(pipper, "document.pictureInPictureEnabled") is True, "a site is told it may")
ask = "document.getElementById('w').requestPictureInPicture().then(() => 'in', e => e.name)"
t.ok(ev(pipper, ask) == "in", "a click on the site's button is answered")
b.wait_for(lambda: fl()["floating"], within=10, what="floated from the site's button")
t.ok(fl()["floating"]["tab"] == pipper and fl()["floating"]["holdsPage"], "the video floats in Oriel's window, not Chromium's")
t.ok(ev(pipper, "document.getElementById('w').hasAttribute('data-oriel-float') && !document.getElementById('v').hasAttribute('data-oriel-float')") is True, "the one the button named, though the other was the one playing")
t.ok(ev(pipper, "!document.getElementById('w').paused") is True, "and it plays")
ev(pipper, ask)
b.wait_for(lambda: not fl()["floating"], within=10, what="landed by the site's button")
t.ok(True, "the button again lands it")
time.sleep(0.5)
t.ok(ev(pipper, "document.visibilityState") == "visible" and ev(pipper, "innerWidth") > 460, "its page is back in its tab, whole")
t.ok(ev(pipper, "!document.pictureInPictureElement") is True, "Chromium's own window never opened")
ev(pipper, "var f = document.createElement('iframe'); f.srcdoc = '<video></video>'; document.body.appendChild(f); 1")
time.sleep(0.5)
t.ok(ev(pipper, "document.querySelector('iframe').contentDocument.pictureInPictureEnabled") is False, "in a frame it is refused: no picture in picture of Chromium's there either")
ev(pipper, "document.querySelectorAll('video').forEach(v => v.pause()); 1")  # it would float on leaving

# Floating video off: nothing floats, by hand, on its own or from a site's button.
b.cmd("tab.select", id=film)
time.sleep(0.5)
ev(film, "document.getElementById('v').play().then(() => 1)")  # a tab left rests its video
b.wait_for(lambda: ev(film, "!document.getElementById('v').paused"), within=10, what="the film playing")
b.cmd("view.float")
b.wait_for(lambda: fl()["floating"], within=10, what="floated by hand")
setting("float.enabled", False)
b.call({"do": "pages.testHosts", "test.playerHosts": ["127.0.0.1"]})
t.ok(not fl()["floating"] and fl()["enabled"] is False, "turned off while one floats: it lands at once")
time.sleep(0.5)
t.ok(ev(film, "document.visibilityState") == "visible" and ev(film, "!!document.querySelector('video') && !document.getElementById('v').paused") is True, "back in its tab, still playing")
r = b.cmd("view.float")
t.ok(not r.get("floating") and "off" in r.get("said", "") and not fl()["floating"], f"Ctrl+Shift+P does nothing, and says why quietly ({r})")
b.cmd("tab.select", id=other)
time.sleep(2)
t.ok(not fl()["floating"] and fl()["lifts"][-1:] == ["off"], f"leaving the tab leaves the video in it ({fl()['lifts']})")
setting("float.own", "tabsOrApps")
b.cmd("tab.select", id=film)
b.call({"do": "pages.appFocus", "focused": False})
time.sleep(1.5)
t.ok(not fl()["floating"], "nor does leaving Oriel float it")
b.call({"do": "pages.appFocus", "focused": True})
setting("float.own", "tabs")
t.ok(ev(film, "document.pictureInPictureEnabled") is False, "a site is told there is no picture in picture: its button goes")
t.ok(ev(film, "document.getElementById('v').requestPictureInPicture().then(() => 'in', e => e.name)") == "NotAllowedError", "and a call for it is refused")
time.sleep(0.5)
t.ok(not fl()["floating"] and ev(film, "!document.pictureInPictureElement") is True, "nothing floats, Chromium's window doesn't open either")

# The rows: one switch; what depends on it goes while it is off.
b.cmd("settings.open", page="browsing")
b.wait_for(lambda: [x for x in b.window()["tabs"] if x.get("internal") == "settings"], what="Settings tab")
settings = [x for x in b.window()["tabs"] if x.get("internal") == "settings"][0]["id"]
b.wait_for(lambda: ev(settings, "document.querySelectorAll('.sr').length") or 0, what="Settings drawn", within=30)
rows = lambda: ev(settings, "[...document.querySelectorAll('[data-row]')].map(r => r.dataset.row).filter(r => r.startsWith('float.'))")
b.wait_for(lambda: "float.style" in (rows() or []), what="the Floating video row")
t.ok(rows() == ["float.style"], f"off: one row, the rows that depend on it are gone ({rows()})")
text = ev(settings, "(() => { const r = document.querySelector('[data-row=\"float.style\"]'); return r.innerText + ' ' + r.querySelector('.sr-info').title })()")
t.ok(text.lower().startswith("floating video") and "oriel" not in text.lower() and "picture in picture" not in text.lower() and "\u2014" not in text and "\u2013" not in text, f"titled Floating video, no Oriel or picture in picture in its words ({text[:40]!r})")
t.ok(ev(settings, "document.querySelector('[data-row=\"float.style\"] .st-sw').getAttribute('aria-checked')") == "false", "its switch shows it off")
ev(settings, "document.querySelector('[data-row=\"float.style\"] .st-sw').click(); 1")
b.wait_for(lambda: fl()["enabled"] is True, what="the switch turned on")
b.wait_for(lambda: len(rows() or []) == 4, what="the dependent rows back")
t.ok(rows() == ["float.style", "float.own", "float.minimize", "float.fade"], f"on: Float the video on its own, Minimize, See through are back ({rows()})")
t.ok(ev(settings, "!!document.querySelector('[data-row=\"float.style\"] button[role=radio], [data-row=\"float.style\"] .st-seg')") is False, "no choice between windows any more: a switch")
ev(settings, "document.querySelector('[data-row=\"float.style\"] .st-sw').click(); 1")
b.wait_for(lambda: fl()["enabled"] is False, what="the switch turned off")
t.ok(rows() == ["float.style"], "off again: they go")
ev(settings, "document.querySelector('[data-row=\"float.style\"] .st-sw').click(); 1")
b.wait_for(lambda: fl()["enabled"] is True, what="the switch turned on again")

# Back on: it floats again, and the page's own button too.
b.cmd("tab.select", id=film)
time.sleep(0.5)
t.ok(ev(film, "document.pictureInPictureEnabled") is True, "back on: a site's button is back")
r = b.cmd("view.float")
t.ok(r.get("floating") is True, "back on: Ctrl+Shift+P floats")
b.cmd("view.float")
b.wait_for(lambda: not fl()["floating"], within=10, what="landed")

t.done()

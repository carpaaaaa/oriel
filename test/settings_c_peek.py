#!/usr/bin/env python3
"""Peek at a link and Peek stays with its tab (studio/01 §10.19-§10.22,
studio/06 §1.11 #125-#126), and Your own style for a site (studio/06 §1.5
#87): the peek's click opens a link in a panel over the page, which stays
underneath; Escape or a click beside it puts it away; Ctrl+O keeps it as a
tab, loaded as it is; another tab puts it away, or with Peek stays with its
tab hides it, its sound paused, until you come back. Edit Site Style… puts
your CSS on every page of the site as you type; off, none is worn."""
import sys
import time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b
import settings_c_web as web

server, P = web.start(tls=False)
H = f"http://127.0.0.1:{P}"
LOADS = {"n": 0}


def target(h):
    LOADS["n"] += 1
    return "<title>target</title><body style='margin:0'><h1 id='h'>target page</h1>"


web.PAGES["/target"] = target
web.PAGES["/source"] = ("<title>source</title><body style='margin:0'><a id='l' href='/target' style='display:block;width:300px;height:60px;"
                        "font-size:40px'>target</a><input id='i'><script>window.clicks=0;document.addEventListener('click',()=>clicks++)</script>")
web.PAGES["/tone.wav"] = (web.wav(30), "audio/wav")
web.PAGES["/sound"] = "<title>sound</title><audio id='a' loop src='/tone.wav'></audio>"
web.PAGES["/styled"] = "<title>styled</title><body><p id='p' style='color:rgb(0, 0, 0)'>words</p>"

b.use("settings-c-peek")
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


def click(tab, *mods, x=60, y=30):
    send(tab, {"type": "mouseDown", "x": x, "y": y, "button": "left", "clickCount": 1, "modifiers": list(mods)},
         {"type": "mouseUp", "x": x, "y": y, "button": "left", "clickCount": 1, "modifiers": list(mods)})


def peeks():
    return b.call({"do": "pages.state"})["peeks"]


def tab_titled(title, url):
    b.cmd("tab.new", url=url)
    b.wait_for(lambda: b.active()["title"] == title, within=30, what=title)
    time.sleep(0.4)
    return b.active()["id"]


src = tab_titled("source", H + "/source")
tabs_before = len(b.window()["tabs"])

# 1. Shift-click (the default) opens the link in a peek; the page stays.
click(src, "shift")
b.wait_for(lambda: peeks() and peeks()[0]["url"].endswith("/target"), within=20, what="peek")
p = peeks()[0]
t.ok(p["from"] == src and p["shown"], "Shift-click opens the link in a peek over the page it came from")
t.ok(len(b.window()["tabs"]) == tabs_before and b.active()["id"] == src and b.active()["url"].endswith("/source"), "no new tab, and the page underneath stays")
w = b.window()
page = next(x for x in w.get("pageBounds", [])) if w.get("pageBounds") else None
t.ok(w["overlay"]["kind"] == "panel" and w["overlay"]["name"] == "pages.peek", "the page is dimmed around the panel, with its knobs")
pk = w.get("peek")
t.ok(pk and pk["panel"]["width"] > 100 and pk["panel"]["height"] > 100 and pk["shown"], f"the panel sits over the page ({pk and pk['panel']})")
b.wait_for(lambda: b.call({"do": "pages.peekEval", "js": "document.title"})["value"] == "target", within=20, what="peek page")
t.ok(b.ui("!!document.querySelector('.peek-knob.peek-keep')", root="overlay") is True, "Open as a tab is there beside the panel")

# 2. Escape puts it away, the page goes with it.
b.call({"do": "pages.peekInput", "events": [{"type": "keyDown", "keyCode": "Escape"}, {"type": "keyUp", "keyCode": "Escape"}]})
b.wait_for(lambda: not peeks(), within=10, what="peek gone")
t.ok(b.window()["overlay"]["kind"] == "none" and not b.window().get("peek"), "Escape puts the peek away")

# 3. A click beside the panel puts it away too.
click(src, "shift")
b.wait_for(lambda: peeks(), within=20, what="peek again")
time.sleep(0.5)
b.ui("document.querySelector('.peek').dispatchEvent(new MouseEvent('click', {bubbles: true})); 1", root="overlay")
b.wait_for(lambda: not peeks(), within=10, what="peek gone by click")
t.ok(True, "a click beside the panel puts it away")

# 4. Ctrl+O keeps it as a tab beside this one, loaded as it is.
click(src, "shift")
b.wait_for(lambda: peeks() and b.call({"do": "pages.peekEval", "js": "document.title"})["value"] == "target", within=20, what="peek to keep")
b.call({"do": "pages.peekEval", "js": "document.getElementById('h').textContent = 'kept as it was'; 1"})
loads = LOADS["n"]
b.call({"do": "pages.peekInput", "events": [{"type": "keyDown", "keyCode": "O", "modifiers": ["control"]}, {"type": "keyUp", "keyCode": "O", "modifiers": ["control"]}]})
b.wait_for(lambda: not peeks() and b.active()["id"] != src, within=10, what="kept")
kept = b.active()
row = [x["id"] for x in b.window()["tabs"]]
t.ok(kept["url"].endswith("/target") and row.index(kept["id"]) == row.index(src) + 1, "Ctrl+O keeps it as a tab beside its page, in front")
time.sleep(0.6)
t.ok(ev(kept["id"], "document.getElementById('h').textContent") == "kept as it was" and LOADS["n"] == loads, "loaded as it is: nothing asked for again")
b.cmd("tab.select", id=src)
time.sleep(0.4)
t.ok(ev(kept["id"], "document.title") == "target", "the kept tab is a tab like any other")

# 5. Another tab puts it away (Peek stays with its tab off).
click(src, "shift")
b.wait_for(lambda: peeks(), within=20, what="peek before switching")
b.cmd("tab.select", id=kept["id"])
b.wait_for(lambda: not peeks(), within=10, what="put away by another tab")
t.ok(True, "off: going to another tab puts the peek away")

# 6. Peek stays with its tab: hidden with its sound paused, shown again on return.
setting("links.peek.stays", True)
b.cmd("tab.select", id=src)
time.sleep(0.5)
ev(src, "document.getElementById('l').href = '/sound'; 1")
click(src, "shift")
b.wait_for(lambda: peeks() and b.call({"do": "pages.peekEval", "js": "document.title"})["value"] == "sound", within=20, what="sound peek")
b.call({"do": "pages.peekEval", "js": "document.getElementById('a').play().then(() => 1)"})
time.sleep(0.6)
b.cmd("tab.select", id=kept["id"])
time.sleep(1)
p = peeks()
t.ok(p and not p[0]["shown"] and p[0]["muted"], "another tab hides it, its sound off")
t.ok(b.call({"do": "pages.peekEval", "js": "document.getElementById('a').paused"})["value"] is True, "and its sound paused")
t.ok(b.window()["overlay"]["kind"] == "none", "nothing of it shows over the other tab")
b.cmd("tab.select", id=src)
time.sleep(1)
p = peeks()
t.ok(p and p[0]["shown"] and not p[0]["muted"], "coming back shows it again")
t.ok(b.call({"do": "pages.peekEval", "js": "document.getElementById('a').paused"})["value"] is False, "and its sound goes on")
b.cmd("pages.peek.close")
setting("links.peek.stays", False)
ev(src, "document.getElementById('l').href = '/target'; 1")

# 7. Other keys (Settings › Keyboard & Mouse › Peek at a link) and off.
setting("links.peek", "optionShift")
click(src, "shift")
time.sleep(1.5)
t.ok(not peeks(), "with Alt-Shift-click chosen, Shift-click doesn't peek")
b.cmd("tab.select", id=src)
b.cmd("tab.go", id=src, input=H + "/source")
b.wait_for(lambda: next(x for x in b.state()["tabs"] if x["id"] == src)["title"] == "source", within=15, what="source again")
time.sleep(0.5)
click(src, "shift", "alt")
b.wait_for(lambda: peeks(), within=20, what="alt-shift peek")
t.ok(True, "Alt-Shift-click peeks")
b.cmd("pages.peek.close")
setting("links.peek", "off")
click(src, "alt", "shift")
time.sleep(1.5)
t.ok(not peeks(), "Off: no click peeks")
setting("links.peek", "shift")

# 8. Your own style for a site.
st = tab_titled("styled", H + "/styled")
r = b.cmd("view.style")
t.ok("said" in (r or {}), f"off: Edit Site Style… does nothing ({r})")
setting("sites.styles", True)
r = b.cmd("view.style")
t.ok((r or {}).get("host") == "127.0.0.1" and b.window()["overlay"]["name"] == "pages.style", "on: the editor opens for the site in front")
time.sleep(0.6)
b.ui("const t = document.querySelector('.sitestyle-text'); t.value = '#p { color: rgb(200, 0, 0) !important }'; t.dispatchEvent(new Event('input', {bubbles: true})); 1", root="overlay")
b.wait_for(lambda: ev(st, "getComputedStyle(document.getElementById('p')).color") == "rgb(200, 0, 0)", within=10, what="style worn")
t.ok(True, "what you type is on the page as you type it")
b.ui("document.querySelector('.sitestyle-done').click(); 1", root="overlay")
time.sleep(0.5)
t.ok(b.window()["overlay"]["kind"] == "none", "Done closes it")
other = tab_titled("styled", H + "/styled?again")
t.ok(ev(other, "getComputedStyle(document.getElementById('p')).color") == "rgb(200, 0, 0)", "every page of that site wears it")
setting("sites.styles", False)
t.ok(ev(other, "getComputedStyle(document.getElementById('p')).color") == "rgb(0, 0, 0)", "off: none is worn, at once")
setting("sites.styles", True)
t.ok(ev(other, "getComputedStyle(document.getElementById('p')).color") == "rgb(200, 0, 0)", "and it was kept")
b.cmd("pages.style.set", host="127.0.0.1", css="  ")
time.sleep(0.6)
t.ok(ev(other, "getComputedStyle(document.getElementById('p')).color") == "rgb(0, 0, 0)", "a style of nothing but spaces is no style")

t.done()

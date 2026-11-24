#!/usr/bin/env python3
"""Settings › Keyboard & Mouse and Browsing › Pages, by what each switch does
(studio/06 §1.11, §1.5): Scroll with the middle button, Alt-click a link
opens it in Split View, Bounce at the top and bottom, Smooth scrolling with
a mouse wheel, Correct spelling as you type, and the keys in the tab
switcher (Ctrl+W, Ctrl+R, Ctrl+M while Ctrl+Tab is up)."""
import sys
import time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b
import settings_c_web as web

server, P = web.start(tls=False)
H = f"http://127.0.0.1:{P}"
TALL = "<body style='margin:0;height:6000px;background:linear-gradient(#fff,#ccd)'>"
web.PAGES["/tall"] = "<title>tall</title>" + TALL + "<p style='margin:300px'>words</p><script>window.ys=[];addEventListener('scroll',()=>ys.push(scrollY))</script>"
web.PAGES["/links"] = ("<title>links</title><body style='margin:0'><a id='l' href='/other' style='display:block;width:300px;height:60px;"
                       "font-size:40px'>other page</a><script>window.followed=false</script>")
web.PAGES["/other"] = "<title>other</title>"
web.PAGES["/spell"] = ("<title>spell</title><body style='margin:0'><textarea id='box' spellcheck='true' style='width:400px;height:100px;"
                       "font-size:28px;padding:0;border:0'></textarea>")
LOADS = {"n": 0}


def counted(h):
    LOADS["n"] += 1
    return "<title>count</title>"


web.PAGES["/count"] = counted

b.use("settings-c-mouse")
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


# 1. Scroll with the middle button (off by default).
tab = tab_titled("tall", H + "/tall")
send(tab, {"type": "mouseDown", "x": 300, "y": 200, "button": "middle", "clickCount": 1},
     {"type": "mouseUp", "x": 300, "y": 200, "button": "middle", "clickCount": 1},
     {"type": "mouseMove", "x": 300, "y": 420})
time.sleep(0.8)
t.ok(ev(tab, "scrollY") == 0, "off: a click of the wheel scrolls nothing")
setting("autoscroll", True)
send(tab, {"type": "mouseDown", "x": 300, "y": 200, "button": "middle", "clickCount": 1},
     {"type": "mouseUp", "x": 300, "y": 200, "button": "middle", "clickCount": 1})
time.sleep(0.2)
t.ok(ev(tab, "!!document.querySelector('[data-oriel-autoscroll]')") is True, "on: the mark is left where the wheel was clicked")
send(tab, {"type": "mouseMove", "x": 300, "y": 420})
b.wait_for(lambda: (ev(tab, "scrollY") or 0) > 200, within=10, what="scrolling down")
t.ok(True, "moving below the mark scrolls the page down, on its own")
send(tab, {"type": "mouseDown", "x": 300, "y": 420, "button": "left", "clickCount": 1},
     {"type": "mouseUp", "x": 300, "y": 420, "button": "left", "clickCount": 1})
time.sleep(0.2)
y = ev(tab, "scrollY")
time.sleep(0.4)
t.ok(ev(tab, "scrollY") == y and ev(tab, "!!document.querySelector('[data-oriel-autoscroll]')") is False, "another click stops it and takes the mark away")
setting("autoscroll", False)

# 2. Alt-click a link (off: follows it as a click does; on: Split View).
tab = tab_titled("links", H + "/links")
send(tab, {"type": "mouseDown", "x": 60, "y": 30, "button": "left", "clickCount": 1, "modifiers": ["alt"]},
     {"type": "mouseUp", "x": 60, "y": 30, "button": "left", "clickCount": 1, "modifiers": ["alt"]})
b.wait_for(lambda: next(x for x in b.state()["tabs"] if x["id"] == tab)["title"] == "other", within=15, what="followed")
t.ok(not b.window()["splits"], "off: Alt-click follows the link in its tab, no download, no split")
setting("links.optionSplit", True)
b.cmd("tab.go", id=tab, input=H + "/links")
b.wait_for(lambda: next(x for x in b.state()["tabs"] if x["id"] == tab)["title"] == "links", within=15, what="links again")
time.sleep(0.4)
send(tab, {"type": "mouseDown", "x": 60, "y": 30, "button": "left", "clickCount": 1, "modifiers": ["alt"]},
     {"type": "mouseUp", "x": 60, "y": 30, "button": "left", "clickCount": 1, "modifiers": ["alt"]})
b.wait_for(lambda: b.window()["splits"], within=15, what="split")
split = b.window()["splits"][0]
st = b.state()
other = next(x for x in st["tabs"] if x["id"] == split["tabs"][1])
t.ok(split["tabs"][0] == tab and other["url"] == H + "/other", "on: the link opens beside its page, in Split View")
t.ok(next(x for x in st["tabs"] if x["id"] == tab)["title"] == "links", "the page it came from stays where it was")
t.ok(b.window()["activeID"] == other["id"], "the new page has the keys")
b.cmd("split.separate")
setting("links.optionSplit", False)

# 3. Bounce at the top and bottom (off by default): the page stops at its ends.
tab = tab_titled("tall", H + "/tall?b")
t.ok(ev(tab, "getComputedStyle(document.documentElement).overscrollBehaviorY") == "none", "off: the page doesn't stretch past its ends")
setting("pages.bounce", True)
time.sleep(0.3)
t.ok(ev(tab, "getComputedStyle(document.documentElement).overscrollBehaviorY") == "auto", "on: Chromium's own bounce is left to it, at once")
setting("pages.bounce", False)

# 4. Smooth scrolling with a mouse wheel (off by default): a notch lands at once.
def notch(tab):
    ev(tab, "window.ys = []; scrollTo(0, 0); 1")
    time.sleep(0.3)
    ev(tab, "window.ys = []; 1")
    send(tab, {"type": "mouseMove", "x": 200, "y": 200},
         {"type": "mouseWheel", "x": 200, "y": 200, "deltaX": 0, "deltaY": -120, "wheelTicksX": 0, "wheelTicksY": -1,
          "accelerationRatioX": 1, "accelerationRatioY": 1, "hasPreciseScrollingDeltas": False, "canScroll": True})
    time.sleep(1.2)
    return ev(tab, "window.ys") or []


st = b.call({"do": "pages.state"})
t.ok(st["commandLine"]["jumpy"] and not st["commandLine"]["smooth"], "off: Chromium is told not to glide")
tab = tab_titled("tall", H + "/tall?w1")
jumps = notch(tab)
setting("wheel.smooth", True)
st = b.call({"do": "pages.state"})
t.ok(st["gliding"] and st["commandLine"]["smooth"] and not st["commandLine"]["jumpy"], "on: told to glide, for the pages made from now")
tab2 = tab_titled("tall", H + "/tall?w2")
glides = notch(tab2)
print(f"    off: {jumps}\n    on:  {glides}")
t.ok(len(jumps) >= 1 and len(glides) > len(jumps) and glides[-1] == max(glides), "a notch lands in one step off, glides over several frames on")
setting("wheel.smooth", False)

# 5. Correct spelling as you type: Chromium's checker, on or off for every page.
def typed(tab, text):
    ev(tab, "const b = document.getElementById('box'); b.value = ''; b.focus(); 1")
    for ch in text:
        send(tab, {"type": "char", "keyCode": ch})
    time.sleep(4)
    send(tab, {"type": "mouseDown", "x": 110, "y": 18, "button": "right", "clickCount": 1},
         {"type": "mouseUp", "x": 110, "y": 18, "button": "right", "clickCount": 1})
    time.sleep(1)
    b.key("Escape")
    return b.call({"do": "pages.state", "id": tab})


tab = tab_titled("spell", H + "/spell")
menu = typed(tab, "Ths is wrng ")
t.ok(menu["spelling"] is True and (menu["menu"] or {}).get("misspelled") == "wrng", f"on: a misspelt word is caught, with suggestions ({menu['menu']})")
setting("autocorrect", False)
menu = typed(tab, "Ths is wrng ")
t.ok(menu["spelling"] is False and not (menu["menu"] or {}).get("misspelled"), f"off: nothing is checked ({menu['menu']})")
setting("autocorrect", True)

# 6. Keys in the tab switcher: Ctrl+M, Ctrl+R and Ctrl+W act on the card it is on.
a = tab_titled("count", H + "/count?a")
c2 = tab_titled("links", H + "/links?c")
b.cmd("tab.switch", by=1)
b.wait_for(lambda: b.window().get("switcher"), what="switcher")
sw = b.window()["switcher"]
on = sw["cards"][sw["index"]]
t.ok(on == a, "Ctrl+Tab is on the tab before")
b.call({"do": "eval", "id": c2, "js": "1"})
loads = LOADS["n"]
b.key("M", "control")
time.sleep(0.3)
t.ok(next(x for x in b.state()["tabs"] if x["id"] == a).get("muted") is True and b.window().get("switcher"), "Ctrl+M mutes its card, the switcher stays")
b.key("R", "control")
b.wait_for(lambda: LOADS["n"] > loads, within=15, what="reload")
t.ok(True, "Ctrl+R loads its card's page again")
n = len(b.window()["switcher"]["cards"])
b.key("W", "control")
time.sleep(0.4)
st = b.state()
t.ok(not any(x["id"] == a for x in st["tabs"]), "Ctrl+W closes its card's tab")
sw = st["windows"][0].get("switcher")
t.ok(sw is None or len(sw["cards"]) == n - 1, "and the card goes from the switcher")
b.cmd("tab.switchEnd", cancel=True)
# Without the switcher, Ctrl+W is Close Tab as before.
before = len(b.window()["tabs"])
b.key("W", "control")
time.sleep(0.4)
t.ok(len(b.window()["tabs"]) == before - 1, "without the switcher, Ctrl+W closes the tab in front as before")

t.done()

#!/usr/bin/env python3
"""Float the video on its own floats players on any site (Search 1.0.22,
idea 1248; the Mac's FloatUnseenTests testHeardVideoOnASiteOffTheListFloats):
leaving a tab playing a Video.js or Plyr player on a site that isn't a
streaming one floats it, as Ctrl+Shift+P does. What floats is still decided
by the video: one heard, big enough, longer than a loop and not a preview,
so a muted background video stays in its page. Don't Float Videos Here is
offered for any site playing a video (a tab's menu, the Mac's site card),
and holds that site's videos back; Ctrl+Shift+P still floats one by hand.

    npm run build && python test/pages_float_anysite.py
"""
import sys
import time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b  # noqa: E402
import settings_c_web as web  # noqa: E402

server, P = web.start(tls=False)
H = f"http://127.0.0.1:{P}"
web.PAGES["/quiet.wav"] = (web.wav(60, loud=40), "audio/wav")
web.PAGES["/loop.wav"] = (web.wav(4, loud=40), "audio/wav")
# A Video.js player, as a broadcaster's site has one: not a streaming site.
web.PAGES["/videojs"] = ("<title>videojs</title><body style='margin:0;background:#fff'><h1>match report</h1>"
                         "<div class='video-js vjs-default-skin vjs-paused' style='width:640px;height:360px'>"
                         "<video class='vjs-tech' id='v' loop src='/quiet.wav' style='width:100%;height:100%;background:#123'></video>"
                         "<div class='vjs-control-bar'><button class='vjs-play-control'>Play</button></div></div><p>words</p>")
# A Plyr player.
web.PAGES["/plyr"] = ("<title>plyr</title><body style='margin:0'><div class='plyr plyr--video'><div class='plyr__video-wrapper'>"
                      "<video id='v' loop src='/quiet.wav' style='width:640px;height:360px;background:#123'></video></div></div>")
# A page whose background video plays muted, a short loop: never floats.
web.PAGES["/background"] = ("<title>background</title><body style='margin:0'>"
                            "<video id='v' autoplay muted loop src='/loop.wav' style='width:800px;height:450px;background:#456'></video>")
web.PAGES["/else"] = "<title>else</title><p>elsewhere"

b.use("pages-float-anysite")
b.launch()
t = b.T()


def ev(tab, js):
    try:
        return b.ev(tab, js)
    except RuntimeError:
        return None


def fl():
    return b.call({"do": "pages.state"})["float"]


def tab_titled(title, url):
    b.cmd("tab.new", url=url)
    b.wait_for(lambda: b.active()["title"] == title, within=30, what=title)
    tab = b.active()["id"]
    b.wait_for(lambda: ev(tab, "new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(1))))") == 1, within=30, what="painted")
    time.sleep(0.4)
    return tab


def tab_rec(id):
    return next((x for x in b.state()["tabs"] if x["id"] == id), None)


def playing(title):
    tab = tab_titled(title, f"{H}/{title}")
    ev(tab, "document.getElementById('v').play().then(() => 1)")
    b.wait_for(lambda: (tab_rec(tab) or {}).get("audible"), within=15, what=f"{title} audible")
    return tab


def tools():
    return b.state()["windows"][0].get("siteTools") or {}


# No test host counts as a streaming site here (test.playerHosts empty).
b.call({"do": "pages.testHosts", "test.playerHosts": []})
other = tab_titled("else", H + "/else")

# 1. A Video.js player on a site off the list floats on leaving its tab.
vjs = playing("videojs")
t.ok(tools().get("nofloat", {}).get(vjs) is False, f"Don't Float Videos Here is offered for a site playing a video, off ({tools().get('nofloat')})")
t.ok(other not in tools().get("nofloat", {}), "and not for a site playing nothing")
b.cmd("tab.select", id=other)
b.wait_for(lambda: fl()["floating"], within=15, what="floated on leaving")
t.ok(fl()["floating"]["tab"] == vjs and fl()["floating"]["holdsPage"], f"leaving a tab playing a Video.js player floats it ({fl()['lifts']})")
t.ok(ev(vjs, "document.getElementById('v').hasAttribute('data-oriel-float') && !document.getElementById('v').paused") is True,
     "the player's own video, still playing")
b.cmd("tab.select", id=vjs)
b.wait_for(lambda: not fl()["floating"], within=10, what="landed")
# The page lets go of its floating look once it is back at its own size (float.ts land).
b.wait_for(lambda: ev(vjs, "document.documentElement.classList.contains('oriel-floating')") is False, within=3, what="its look let go")
t.ok(ev(vjs, "!document.getElementById('v').paused") is True, "back to its tab, it lands, still playing")
ev(vjs, "document.getElementById('v').pause(); 1")
time.sleep(0.5)

# 2. A Plyr player, the same.
plyr = playing("plyr")
b.cmd("tab.select", id=other)
b.wait_for(lambda: fl()["floating"], within=15, what="Plyr floated")
t.ok(fl()["floating"]["tab"] == plyr, "a Plyr player floats too")
b.cmd("tab.select", id=plyr)
b.wait_for(lambda: not fl()["floating"], within=10, what="landed")
ev(plyr, "document.getElementById('v').pause(); 1")
time.sleep(0.5)

# 3. A muted background video, a short loop, stays in its page.
bg = tab_titled("background", H + "/background")
b.wait_for(lambda: ev(bg, "!document.getElementById('v').paused"), within=10, what="the background playing")
b.cmd("tab.select", id=other)
time.sleep(2)
t.ok(not fl()["floating"], f"a muted background video doesn't float out on its own ({fl()['lifts'][-2:]})")
t.ok(bg not in tools().get("nofloat", {}), "nor is Don't Float Videos Here offered for its silent page")
b.cmd("tab.close", id=bg)
time.sleep(0.5)

# 4. Don't Float Videos Here: the site's videos stay; Ctrl+Shift+P still floats one.
b.cmd("tab.select", id=vjs)
time.sleep(0.4)
ev(vjs, "document.getElementById('v').play().then(() => 1)")
b.wait_for(lambda: (tab_rec(vjs) or {}).get("audible"), within=15, what="audible again")
r = b.cmd("pages.nofloat", id=vjs, on=True)
t.ok(r.get("grounded") is True and b.state()["prefs"].get("nofloat.127.0.0.1") is True, f"ticked, kept for the site as nofloat.<host> ({r})")
b.wait_for(lambda: tools().get("nofloat", {}).get(vjs) is True, within=5, what="the menu's tick")
t.ok(True, "the tab's menu shows it ticked")
b.cmd("tab.select", id=other)
time.sleep(2)
t.ok(not fl()["floating"] and fl()["lifts"][-1:] == ["grounded"], f"leaving its tab leaves the video in it ({fl()['lifts'][-2:]})")
b.cmd("tab.select", id=vjs)
time.sleep(0.5)
r = b.cmd("view.float")
t.ok(r.get("floating") and fl()["floating"]["tab"] == vjs, "Ctrl+Shift+P still floats it by hand")
b.cmd("view.float")
b.wait_for(lambda: not fl()["floating"], within=10, what="landed by hand")
b.cmd("pages.nofloat", id=vjs, on=False)
t.ok("nofloat.127.0.0.1" not in b.state()["prefs"], "unticked, nothing kept")
b.cmd("tab.select", id=other)
b.wait_for(lambda: fl()["floating"], within=15, what="floats again")
t.ok(fl()["floating"]["tab"] == vjs, "and its video floats on leaving again")
b.cmd("tab.select", id=vjs)
b.wait_for(lambda: not fl()["floating"], within=10, what="landed")

# 5. A private tab is never offered it.
shy = b.cmd("tab.newPrivate")
b.cmd("tab.go", id=shy, input=H + "/videojs")
b.wait_for(lambda: (x := tab_rec(shy)) and not x["loading"] and x["title"] == "videojs", within=30, what="the private page")
ev(shy, "document.getElementById('v').play().then(() => 1)")
b.wait_for(lambda: (tab_rec(shy) or {}).get("audible"), within=15, what="private audible")
t.ok(shy not in tools().get("nofloat", {}), "a private tab, which remembers nothing, isn't offered Don't Float Videos Here")
ev(shy, "document.getElementById('v').pause(); 1")
ev(vjs, "document.getElementById('v').pause(); 1")
t.done()

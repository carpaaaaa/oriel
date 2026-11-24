#!/usr/bin/env python3
"""Settings › Privacy › Blocking, by what each switch does to pages
(studio/06 §1.8, §2.1-§2.4): Block ads and trackers (Search's own list of
third parties, its hiding rules, YouTube's ad schedule and blocker tests),
Remove click trackers from links, Tell sites not to sell or share your data,
Try HTTPS first, Prevent cross-site tracking. Every name reaches a server on
this computer (--host-resolver-rules), so nothing goes to the network."""
import sys
import time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b
import settings_c_web as web

server, P = web.start()
plain, Q = web.start(tls=False)
NAMES = ["site.example", "pixel.quantserve.com", "yt.example", "www.youtube.com", "up.example", "plain.example",
         "first.example", "third.example"]

H = f"http://site.example:{P}"
web.PAGES["/shield"] = (f"<title>shield</title><script src='http://pixel.quantserve.com:{P}/quant.js'></script>"
                        f"<script src='{H}/own.js'></script>"
                        "<div class='adsbygoogle' id='ad'>ad</div><div class='ad-slot-x' id='keep'>keep</div>")
web.PAGES["/quant.js"] = ("window.quant = 1", "text/javascript")
web.PAGES["/own.js"] = ("window.own = 1", "text/javascript")
web.PAGES["/home"] = f"<title>home</title><script src='http://pixel.quantserve.com:{P}/quant.js'></script>"
web.PAGES["/watch"] = ("<title>watch</title><script>var ytInitialPlayerResponse = {playabilityStatus: {status: 'OK'}, adPlacements: [1], "
                       "playerAds: [2], videoDetails: {videoId: 'abc'}};</script><script>"
                       "window.cut = !('adPlacements' in ytInitialPlayerResponse) && !('playerAds' in ytInitialPlayerResponse);"
                       "window.kept = ytInitialPlayerResponse.videoDetails.videoId;"
                       "window.parsed = JSON.parse('{\"responseContext\":{},\"adSlots\":[1],\"x\":1}');"
                       "window.other = JSON.parse('{\"adSlots\":[1]}');"
                       f"fetch('http://www.youtube.com:{P}/api/stats/ads?t=1').then(r => window.standin = r.status, () => window.standin = 'failed');"
                       "fetch('/pagead/viewthroughconversion').then(() => window.pagead = 'loaded', () => window.pagead = 'blocked');"
                       "</script>")
web.PAGES["/landing"] = "<title>landing</title>"
web.PAGES["/gpc"] = "<title>gpc</title>"
web.PAGES["/hf"] = "<title>hf</title>"
web.PAGES["/set"] = ("<title>set</title>", None, {"Set-Cookie": "t=1; SameSite=None; Secure; Path=/"})
web.PAGES["/check"] = "<title>check</title>"
web.PAGES["/frame"] = lambda h: f"<title>frame</title><iframe src='https://third.example:{P}/{h.path.split('?')[1]}'></iframe>"

b.use("settings-c-blocking")
b.launch(web.rules(*NAMES), "--ignore-certificate-errors")
t = b.T()


def setting(key, value):
    b.cmd("settings.set", id=key, value=value)
    time.sleep(0.2)


def go(url, title=None, tab=None):
    tab = tab or b.active()["id"]
    b.cmd("tab.go", id=tab, input=url)
    if title:
        b.wait_for(lambda: (b.state() and next((x for x in b.state()["tabs"] if x["id"] == tab), {}).get("title") == title), within=30, what=title)
    time.sleep(0.5)
    return tab


def ev(tab, js):
    try:
        return b.ev(tab, js)
    except RuntimeError:
        return None


b.cmd("tab.new", url=H + "/landing")
b.wait_for(lambda: b.active()["title"] == "landing", what="first page")
tab = b.active()["id"]

# 1. Shield, on by default: the third party is blocked, the site's own script runs, the slot is hidden.
web.clear()
go(H + "/shield", "shield", tab)
t.ok(ev(tab, "window.quant") is None and not web.seen("/quant.js"), "Shield on: quantserve's script is never asked for")
t.ok(ev(tab, "window.own") == 1, "the site's own script runs")
t.ok(ev(tab, "getComputedStyle(document.getElementById('ad')).display") == "none", "an .adsbygoogle slot is hidden")
t.ok(ev(tab, "getComputedStyle(document.getElementById('keep')).display") != "none", "a class that only contains ad stays")
t.ok(any("quant.js" in u for u in b.call({"do": "pages.state"})["blocked"]), "the bench hears what was blocked")
# The same host as the page is first party: not blocked.
web.clear()
go(f"http://pixel.quantserve.com:{P}/home", "home", tab)
t.ok(ev(tab, "window.quant") == 1, "on its own site, quantserve's script is first party and runs")

# 2. Off: everything as it comes; the hiding goes at once, the script from the next load.
go(H + "/shield", "shield", tab)
setting("shield", False)
time.sleep(0.4)
t.ok(ev(tab, "getComputedStyle(document.getElementById('ad')).display") != "none", "Shield off: the slot shows again without a reload")
web.clear()
go(H + "/shield?2", "shield", tab)
t.ok(ev(tab, "window.quant") == 1 and web.seen("/quant.js"), "Shield off: the third party loads")
setting("shield", True)

# 3. Paused for one site (shield.paused, a host without www).
setting("shield.paused", ["site.example"])
web.clear()
go(H + "/shield?3", "shield", tab)
t.ok(ev(tab, "window.quant") == 1, "paused for site.example: its third parties load")
setting("shield.paused", [])

# 4. YouTube (a stand-in host, as the Mac's test.youtubeHosts).
b.call({"do": "pages.testHosts", "test.youtubeHosts": ["yt.example"]})
web.clear()
go(f"http://yt.example:{P}/watch?v=abc", "watch", tab)
b.wait_for(lambda: ev(tab, "window.standin") is not None and ev(tab, "window.pagead") is not None, what="youtube requests")
t.ok(ev(tab, "window.cut") is True, "the first page's ad schedule is taken out before the page reads it")
t.ok(ev(tab, "window.kept") == "abc", "the rest of the player's data stays")
t.ok(ev(tab, "JSON.stringify(window.parsed)") == '{"responseContext":{},"x":1}', "JSON.parse of a YouTube answer loses adSlots")
t.ok(ev(tab, "JSON.stringify(window.other)") == '{"adSlots":[1]}', "an answer of another shape is left as it came")
t.ok(ev(tab, "window.standin") == 200 and not web.seen("/api/stats/ads"), "YouTube's ad report is answered 200 in the page and never sent")
t.ok(ev(tab, "window.pagead") == "blocked" and not web.seen("/pagead/"), "YouTube's /pagead/ is blocked")
setting("shield", False)
go(f"http://yt.example:{P}/watch?v=abc&off", "watch", tab)
b.wait_for(lambda: ev(tab, "window.pagead") is not None, what="youtube requests, off")
t.ok(ev(tab, "window.cut") is False and ev(tab, "window.pagead") == "loaded", "Shield off: YouTube's data and requests as they come")
setting("shield", True)

# 5. Click IDs (on by default): gclid goes before the page loads, utm_ and the fragment stay.
web.clear()
go(H + "/landing?gclid=abc&utm_source=news&x=1#top", "landing", tab)
url = next(x for x in b.state()["tabs"] if x["id"] == tab)["url"]
t.ok(url == H + "/landing?utm_source=news&x=1#top", f"the address loses gclid only ({url})")
t.ok(web.seen("/landing?utm_source=news&x=1") and not web.seen("gclid"), "the site never sees the click ID")
go(H + "/landing?fbclid=z&X-Amz-Signature=s", "landing", tab)
url = next(x for x in b.state()["tabs"] if x["id"] == tab)["url"]
t.ok("fbclid=z" in url, "a signed address is left whole")
setting("privacy.clickIDs", False)
go(H + "/landing?gclid=off", "landing", tab)
url = next(x for x in b.state()["tabs"] if x["id"] == tab)["url"]
t.ok("gclid=off" in url, "off: the click ID stays")
shy = b.cmd("tab.newPrivate")
b.cmd("tab.go", id=shy, input=H + "/landing?gclid=shy&y=2")
b.wait_for(lambda: "y=2" in next((x for x in b.state()["tabs"] if x["id"] == shy), {}).get("url", ""), what="private page")
time.sleep(0.5)
url = next(x for x in b.state()["tabs"] if x["id"] == shy)["url"]
t.ok("gclid" not in url, f"a private tab always takes it off ({url})")
b.cmd("tab.close", id=shy)
setting("privacy.clickIDs", True)
b.cmd("tab.select", id=tab)

# 6. Global Privacy Control (on by default).
web.clear()
go(H + "/gpc", "gpc", tab)
r = web.seen("/gpc")
t.ok(r and r[-1][3].get("Sec-GPC") == "1", "every request carries Sec-GPC: 1")
t.ok(ev(tab, "navigator.globalPrivacyControl") is True, "navigator.globalPrivacyControl is true")
setting("privacy.gpc", False)
web.clear()
go(H + "/gpc?off", "gpc", tab)
r = web.seen("/gpc?off")
t.ok(r and "Sec-GPC" not in r[-1][3], "off: no Sec-GPC")
t.ok(ev(tab, "navigator.globalPrivacyControl") is not True, "off: navigator.globalPrivacyControl isn't true")
setting("privacy.gpc", True)

# 7. Try HTTPS first (off by default).
web.clear()
go(f"http://up.example:{P}/hf", "hf", tab)
t.ok(ev(tab, "location.protocol") == "http:", "off: an http page loads over http")
setting("privacy.httpsFirst", True)
web.clear()
go(f"http://up.example:{P}/hf?on", "hf", tab)
t.ok(ev(tab, "location.protocol") == "https:" and any(r[0] == "https" for r in web.seen("/hf?on")), "on: the same address loads over https")
go(f"http://plain.example:{Q}/hf?fallback", "hf", tab)
b.wait_for(lambda: ev(tab, "location.href") == f"http://plain.example:{Q}/hf?fallback", what="fallback")
t.ok(ev(tab, "location.protocol") == "http:", "no https there: back to http, quietly")
t.ok(f"http://plain.example:{Q}/hf?fallback" in b.call({"do": "pages.state"})["fellBack"], "the fall back is noted")
back = ev(tab, "history.length")
go(f"http://127.0.0.1:{P}/hf?local", "hf", tab)
t.ok(ev(tab, "location.protocol") == "http:", "a local address is left as asked")
setting("privacy.httpsFirst", False)

# 8. Prevent cross-site tracking (on by default; sites.keep true turns it off).
b.cmd("settings.do", id="clear.cookies")
go(f"https://third.example:{P}/set", "set", tab)  # first party: the cookie is kept
web.clear()
go(f"https://first.example:{P}/frame?check", "frame", tab)
b.wait_for(lambda: web.seen("/check", "third.example"), what="frame check")
r = web.seen("/check", "third.example")[-1]
t.ok("Cookie" not in r[3], "on: a site inside another gets no cookies")
setting("sites.keep", True)
web.clear()
go(f"https://first.example:{P}/frame?check&off", "frame", tab)
b.wait_for(lambda: web.seen("/check", "third.example"), what="frame check, off")
r = web.seen("/check", "third.example")[-1]
t.ok("t=1" in r[3].get("Cookie", ""), "off: it gets its cookies, as in Chrome")
setting("sites.keep", False)
b.cmd("settings.do", id="clear.cookies")
go(f"https://first.example:{P}/frame?set", "frame", tab)
b.wait_for(lambda: web.seen("/set", "third.example"), what="frame set")
time.sleep(0.4)
web.clear()
go(f"https://third.example:{P}/check", "check", tab)
r = web.seen("/check", "third.example")[-1]
t.ok("Cookie" not in r[3], "on: a cookie a site sets from inside another is never kept")

t.done()

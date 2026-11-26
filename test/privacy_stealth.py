#!/usr/bin/env python3
"""Hide the blocker from sites (Settings › Privacy › Blocking, on by
default; src/main/pages/stealth.ts, src/preload/page/stealth.ts). A page
here plays the anti-adblock detectors met on real sites, each on its own:
tennistalker.it's three (an "adsbox" bait off the screen, measured every
100 ms; a fetch to doubleclick that fails while the site's own favicon
loads), BlockAdBlock's 1-pixel bait, a script tag's onerror on
adsbygoogle.js, gpt.js's onload checking googletag is there, an
XMLHttpRequest's onerror and status, an ad pixel's onerror. With the switch
on none of them sees a blocker, and the ads are still blocked: no request
reaches the ad hosts, a real ad box stays hidden, a script that is really
missing (404) still fails. With it off, they all see one. Every name
reaches this computer (--host-resolver-rules): nothing goes to the network.
"""
import json
import sys
import time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b
import settings_c_web as web

server, P = web.start()
ADS = ["pagead2.googlesyndication.com", "www3.doubleclick.net", "securepubads.g.doubleclick.net"]
NAMES = ["news.example", *ADS]
S = lambda host, path: f"https://{host}:{P}{path}"

# This test's own list, as uBlock Origin's would refuse these; the
# resources (stand-ins) are the real ones that came with Oriel.
FILTERS = """! the ad hosts, and the generic hiding rules the baits wear
||googlesyndication.com^
||doubleclick.net^
##.ad-slot
##.sponsored-ad
###adsbox
##.ad_banner
##.pub_300x250
##.real-ad
"""

JS = lambda body: (body, "text/javascript")
web.PAGES["/landing"] = "<title>landing</title>"
web.PAGES["/favicon.ico"] = (b"\0" * 64, "image/x-icon")
web.PAGES["/pagead/js/adsbygoogle.js"] = JS("window.realAdsense = 1")
web.PAGES["/tag/js/gpt.js"] = JS("window.realGpt = 1")
web.PAGES["/x"] = ("{}", "application/json")
web.PAGES["/detect"] = lambda h: ("<title>detect</title><body>"
    "<div class='real-ad' id='realad'><span>Advertisement</span><img alt='' width='300' height='250'></div>"
    "<script>window.found = []; window.passed = []; const hit = w => found.push(w), fine = w => passed.push(w);"
    # tennistalker.it: the bait, checked every 100 ms for 1.5 s.
    "(() => { const t = document.createElement('div'); t.id = 'adsbox'; t.className = 'ad_banner sponsored-ad ad-slot';"
    " t.style.cssText = 'position:absolute;left:-9999px;top:-9999px;width:300px;height:250px;pointer-events:none';"
    " document.body.appendChild(t); const n = Date.now(); const i = setInterval(() => { const z = t.offsetHeight === 0;"
    " if (!z && Date.now() - n < 1500) return; clearInterval(i); z ? hit('tt-bait') : fine('tt-bait') }, 100) })();"
    # tennistalker.it: a fetch to doubleclick that fails while the favicon loads.
    f"fetch('{S('www3.doubleclick.net', '/')}', {{ method: 'HEAD', mode: 'no-cors', cache: 'no-store' }})"
    ".then(() => fine('tt-fetch'), () => fetch('/favicon.ico?t=' + Date.now(), { cache: 'no-store' }).then(r => r.ok ? hit('tt-fetch') : fine('tt-fetch')));"
    # BlockAdBlock's bait: a pixel, &nbsp; inside, looked at after 50 ms.
    "(() => { const d = document.createElement('div'); d.setAttribute('class', 'pub_300x250 pub_300x250m pub_728x90 text-ad textAd text_ad text_ads text-ads text-ad-links');"
    " d.setAttribute('style', 'width: 1px !important; height: 1px !important; position: absolute !important; left: -10000px !important; top: -1000px !important;');"
    " d.innerHTML = '&nbsp;'; document.body.appendChild(d); setTimeout(() => { const cs = getComputedStyle(d);"
    " (d.offsetParent === null || d.offsetHeight === 0 || d.clientWidth === 0 || cs.display === 'none') ? hit('baa-bait') : fine('baa-bait') }, 50) })();"
    # An XMLHttpRequest to an ad host.
    f"(() => {{ const x = new XMLHttpRequest(); x.open('GET', '{S('securepubads.g.doubleclick.net', '/x')}');"
    " x.onerror = () => hit('xhr'); x.onload = () => x.status === 200 ? fine('xhr') : hit('xhr-status'); x.send() })();"
    "</script>"
    # A script tag's onerror on adsbygoogle.js; on load, the library is there.
    f"<script async src='{S('pagead2.googlesyndication.com', '/pagead/js/adsbygoogle.js')}'"
    " onerror=\"hit('adsense-script')\" onload=\"window.adsbygoogle && adsbygoogle.loaded ? fine('adsense-script') : hit('adsense-missing')\"></script>"
    # gpt.js: on load, googletag is there (its stand-in ran first).
    f"<script src='{S('securepubads.g.doubleclick.net', '/tag/js/gpt.js')}'"
    " onerror=\"hit('gpt-script')\" onload=\"window.googletag && googletag.apiReady ? fine('gpt-script') : hit('gpt-missing')\"></script>"
    # An ad pixel.
    f"<img src='{S('pagead2.googlesyndication.com', '/pagead/1x1.gif')}' onerror=\"hit('pixel')\" onload=\"fine('pixel')\">"
    # A script really missing: it still fails.
    "<script src='/missing.js' onerror=\"window.missing = 'error'\" onload=\"window.missing = 'load'\"></script>"
    "</body>")

b.use("privacy-stealth")
b.launch(web.rules(*NAMES), "--ignore-certificate-errors")
t = b.T()


def ev(tab, js):
    try:
        return b.ev(tab, js)
    except RuntimeError:
        return None


def tab_of(tab):
    return next((x for x in b.state()["tabs"] if x["id"] == tab), {})


def run(tab):
    b.cmd("tab.go", id=tab, input=S("news.example", "/detect"))
    b.wait_for(lambda: tab_of(tab).get("title") == "detect", within=30, what="detect page")
    # Every detector has spoken, the bait's 1.5 s included.
    b.wait_for(lambda: (ev(tab, "found.length + passed.length") or 0) >= 7, within=10, what="detectors")
    time.sleep(0.3)
    return ev(tab, "({ found: found.slice().sort(), passed: passed.slice().sort(), missing: window.missing,"
                   " real: getComputedStyle(document.getElementById('realad')).display, realAdsense: !!window.realAdsense, realGpt: !!window.realGpt })")


t.ok(b.state()["prefs"].get("shield.stealth") is not False, "Hide the blocker from sites is on by default")
b.call({"do": "pages.blockerTest", "filters": FILTERS})
b.cmd("tab.new", url=S("news.example", "/landing"))
b.wait_for(lambda: b.active()["title"] == "landing", what="first page")
tab = b.active()["id"]

web.clear()
on = run(tab)
print("  on: " + json.dumps(on))
t.ok(on and on["found"] == [], f"with the switch on, no detector sees a blocker ({on and on['found']})")
for w in ["tt-bait", "tt-fetch", "baa-bait", "xhr", "adsense-script", "gpt-script", "pixel"]:
    t.ok(on and w in on["passed"], f"  {w}: nothing to see")
t.ok(on and not on["realAdsense"] and not on["realGpt"], "the ad libraries still never load (their stand-ins ran instead)")
t.ok(not any(web.seen("/", host=h) for h in ADS), "no request reached an ad host")
t.ok(on and on["real"] == "none", "a real ad box (with something in it) stays hidden")
t.ok(on and on["missing"] == "error", "a script that is really missing still fails")
st = b.call({"do": "pages.state"})
t.ok(any("adsbygoogle" in u for u in st["blocked"]), "Shield still counts them as blocked")

b.cmd("settings.set", id="shield.stealth", value=False)
time.sleep(1.0)
off = run(tab)
print("  off: " + json.dumps(off))
t.ok(off and {"tt-bait", "tt-fetch", "baa-bait", "xhr", "adsense-script", "pixel"} <= set(off["found"]),
     f"with it off, the detectors see the blocker again ({off and off['found']})")
t.ok(off and off["real"] == "none", "and the ads stay blocked")

b.cmd("settings.set", id="shield.stealth", value=True)
time.sleep(1.0)
again = run(tab)
t.ok(again and again["found"] == [], "back on, hidden again")

b.cmd("settings.set", id="shield", value=False)
time.sleep(1.0)
free = run(tab)
# (The ad hosts here are stubs: no googletag, no pixel, no CORS. What
# counts is that the real files load, and nothing is answered for them.)
t.ok(free and free["realAdsense"] and free["realGpt"], "with Block ads and trackers off, the ads load as they are")
t.ok(free and "tt-bait" in free["passed"], "and nothing is hidden")
b.cmd("settings.set", id="shield", value=True)
t.done()

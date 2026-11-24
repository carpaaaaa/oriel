#!/usr/bin/env python3
"""Settings › Privacy › Blocking with uBlock Origin's lists (studio/06 §1.8,
§2.1-§2.4): the engine (@ghostery/adblocker) with a list of this test's own,
so what must be blocked is known exactly: third parties blocked, a stand-in
script ($redirect), an exception (@@) honoured, $important over it, a page
left alone ($document), a page blocked only by a filter for pages, the
lists' CSP and $removeparam, generic and site hiding rules, a cosmetic
exception (#@#), a procedural filter, a scriptlet before the page's own
scripts, a frame's share; then each Blocking row on and off, the daily
update (from this computer) and the engine kept on disk. Every name reaches
a server on this computer (--host-resolver-rules): nothing goes to the
network. With the internet there (and ORIEL_OFFLINE unset), a last part
loads a public ad-block test page with the real lists and reports its score.
"""
import json
import os
import socket
import sys
import time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b
import settings_c_web as web

server, P = web.start()
plain, Q = web.start(tls=False)
NAMES = ["news.example", "ads.example", "tracker.example", "stub.example", "imp.example", "allowed.example",
         "doc.example", "adhost.example", "csp.example", "frame.example", "first.example", "other.example",
         "third.example", "lists.example", "up.example", "plain.example"]
S = lambda host, path: f"https://{host}:{P}{path}"

# (^* before a path: this computer's server has a port, real sites don't.)
FILTERS = """! this test's own list, in uBlock Origin's syntax
||ads.example^$third-party
||tracker.example^$script
@@||tracker.example^*/allowed.js$script,domain=news.example
||stub.example^*/gpt.js$script,redirect=noop.js
||imp.example^$important
@@||imp.example^$script
@@||allowed.example^$document
||doc.example^$document
||adhost.example^
||csp.example^$csp=img-src 'none'
$removeparam=oriel_cid
||news.example^*/api/$xhr,removeparam=track
##.generic-ad-banner
##.late-ad
##.promo-unit
news.example#@#.promo-unit
news.example##.sponsored-box
news.example##div.card:has-text(Sponsored)
news.example##+js(oriel-mark, hello)
frame.example##.frame-ad
frame.example##+js(oriel-mark, inframe)
"""
RESOURCES = json.dumps({
    "scriptlets": [{"name": "oriel-mark.js", "aliases": ["oriel-mark"], "dependencies": [],
                    "body": "function orielMark(name) { window.__orielMark = name + '@' + document.readyState; }"}],
    "redirects": [{"name": "noop.js", "aliases": ["noopjs"], "body": "window.__orielNoop = 1;", "contentType": "application/javascript"}],
})

JS = lambda body: (body, "text/javascript")
web.PAGES["/ad.js"] = JS("window.ad = 1")
web.PAGES["/t.js"] = JS("window.tracker = 1")
web.PAGES["/allowed.js"] = JS("window.allowed = 1")
web.PAGES["/gpt.js"] = JS("window.gpt = 1")
web.PAGES["/imp.js"] = JS("window.imp = 1")
web.PAGES["/pixel.png"] = (bytes.fromhex("89504e470d0a1a0a0000000d4948445200000001000000010806000000"
                                         "1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082"), "image/png")
web.PAGES["/api/data"] = ("{}", "application/json")
web.PAGES["/page"] = lambda h: (
    "<title>page</title>"
    "<script>window.early = window.__orielMark || null</script>"
    f"<script src='{S('ads.example', '/ad.js')}'></script>"
    f"<script src='{S('tracker.example', '/t.js')}'></script>"
    f"<script src='{S('tracker.example', '/allowed.js')}'></script>"
    f"<script src='{S('stub.example', '/gpt.js')}'></script>"
    f"<script src='{S('imp.example', '/imp.js')}'></script>"
    "<div class='generic-ad-banner' id='gen'>generic</div>"
    "<div class='sponsored-box' id='site'>site</div>"
    "<div class='promo-unit' id='promo'>promo</div>"
    "<div class='card' id='c1'>Sponsored post</div><div class='card' id='c2'>A post</div>"
    "<div class='ad-unit-x' id='keep'>keep</div>"
    "<script>setTimeout(() => { const d = document.createElement('div'); d.className = 'late-ad'; d.id = 'late';"
    " d.textContent = 'late'; document.body.appendChild(d) }, 600);"
    "fetch('/api/data?track=1&keep=2').then(() => window.api = 'done', () => window.api = 'failed')</script>")
web.PAGES["/frames"] = lambda h: (
    "<title>frames</title><script>window.frameState = null;"
    "addEventListener('message', e => { window.frameState = e.data })</script>"
    f"<iframe src='{S('frame.example', '/inner')}'></iframe>")
web.PAGES["/inner"] = ("<title>inner</title><div class='frame-ad' id='fa'>frame ad</div>"
                       "<script>setInterval(() => parent.postMessage({ display: getComputedStyle(document.getElementById('fa')).display,"
                       " mark: window.__orielMark || null }, '*'), 200)</script>")
web.PAGES["/doc"] = "<title>doc</title>"
web.PAGES["/landing"] = "<title>landing</title>"
web.PAGES["/csp"] = ("<title>csp</title><script>window.img = 'waiting'</script>"
                     f"<img src='/pixel.png' onload=\"window.img = 'loaded'\" onerror=\"window.img = 'refused'\">")
web.PAGES["/gpc"] = "<title>gpc</title>"
web.PAGES["/hf"] = "<title>hf</title>"
web.PAGES["/set"] = ("<title>set</title>", None, {"Set-Cookie": "t=1; SameSite=None; Secure; Path=/"})
web.PAGES["/check"] = "<title>check</title>"
web.PAGES["/frame"] = lambda h: (f"<title>frame</title><script>window.got = null; addEventListener('message', e => {{ window.got = e.data }})</script>"
                                 f"<iframe src='{S('third.example', '/' + h.path.split('?')[1])}'></iframe>")
web.PAGES["/jar"] = ("<title>jar</title><script>const had = document.cookie;"
                     "document.cookie = 'jar=1; SameSite=None; Secure; Path=/';"
                     "const had2 = localStorage.getItem('k'); try { localStorage.setItem('k', 'v') } catch (e) {}"
                     "parent.postMessage({ had, now: document.cookie, ls: had2 }, '*')</script>")
web.PAGES["/peek"] = ("<title>peek</title><script>parent.postMessage({ had: document.cookie, ls: localStorage.getItem('k') }, '*')</script>")
# A site inside another trying every way round to its cookies through frames
# it makes (Chromium runs no preload in those): each answer is what it read.
web.PAGES["/slow"] = "<title>slow</title>"
web.PAGES["/ways"] = (
    "<title>ways</title><body><div id='host'></div><script>const out = {};"
    "const way = (k, f) => { try { out[k] = String(f()) } catch (e) { out[k] = 'ERR ' + e.name } };"
    "const last = () => window[window.length - 1];"
    "way('index', () => { document.body.appendChild(document.createElement('iframe')); return last().document.cookie });"
    "way('innerHTML', () => { const d = document.createElement('div'); document.body.appendChild(d); d.innerHTML = '<iframe></iframe>'; return last().document.cookie });"
    "way('write', () => { document.write('<iframe id=w></iframe>'); return document.getElementById('w').contentWindow.document.cookie });"
    "way('nested', () => { document.body.append(document.createElement('iframe')); const w = last(); w.document.body.appendChild(w.document.createElement('iframe')); return w[0].document.cookie });"
    "way('loading', () => { const f = document.createElement('iframe'); f.src = '/slow'; document.body.append(f); return last().document.cookie });"
    "way('shadow', () => { document.getElementById('host').attachShadow({ mode: 'closed' }).appendChild(document.createElement('iframe')); return last().document.cookie });"
    "document.body.append(document.createElement('iframe'));"
    "last().cookieStore.getAll().then(a => a.length, e => 'ERR ' + e.name).then(n => { out.cookieStore = String(n); parent.postMessage(out, '*') })"
    "</script>")
# The daily update's stand-ins for the lists' sources.
web.PAGES["/lists/main.txt"] = ("! Title: main\n" + "\n".join(f"||filler{i}.example^" for i in range(30)) + "\n!#include part.txt\n", "text/plain")
web.PAGES["/lists/part.txt"] = ("||updated.example^\n", "text/plain")
web.PAGES["/lists/resources.json"] = (RESOURCES, "application/json")

b.use("privacy-blocking")
b.launch(web.rules(*NAMES, "updated.example"), "--ignore-certificate-errors")
t = b.T()


def setting(key, value):
    b.cmd("settings.set", id=key, value=value)
    time.sleep(1.0)


def tab_of(tab):
    return next((x for x in b.state()["tabs"] if x["id"] == tab), {})


def go(url, title=None, tab=None):
    tab = tab or b.active()["id"]
    b.cmd("tab.go", id=tab, input=url)
    if title:
        b.wait_for(lambda: tab_of(tab).get("title") == title, within=30, what=title)
    time.sleep(0.6)
    return tab


def ev(tab, js):
    try:
        return b.ev(tab, js)
    except RuntimeError:
        return None


def shown(tab, id_):
    return ev(tab, f"(e => e && getComputedStyle(e).display)(document.getElementById('{id_}'))")


st = b.call({"do": "pages.blocker"})
t.ok(st["source"] in ("bundled", "downloaded") and st["scriptlets"] > 50,
     f"uBlock Origin's lists come with Oriel ({st['source']}, {st['scriptlets']} scriptlets, read in {st['loadMs']} ms)")
b.call({"do": "pages.blockerTest", "filters": FILTERS, "resources": RESOURCES})

b.cmd("tab.new", url=S("news.example", "/landing"))
b.wait_for(lambda: b.active()["title"] == "landing", what="first page")
tab = b.active()["id"]

# 1. Network: blocked, a stand-in, exceptions, $important, $removeparam.
web.clear()
go(S("news.example", "/page"), "page", tab)
b.wait_for(lambda: ev(tab, "window.api") is not None, what="the page's fetch")
t.ok(ev(tab, "window.ad") is None and not web.seen("/ad.js"), "a listed third party ($third-party) is never asked for")
t.ok(ev(tab, "window.tracker") is None and not web.seen("/t.js"), "a listed script is blocked")
t.ok(ev(tab, "window.allowed") == 1 and web.seen("/allowed.js"), "an exception (@@ ... $domain) lets its script through")
t.ok(ev(tab, "window.__orielNoop") == 1 and ev(tab, "window.gpt") is None and not web.seen("/gpt.js"),
     "a $redirect script is answered by its harmless stand-in, the server never asked")
t.ok(ev(tab, "window.imp") is None and not web.seen("/imp.js"), "$important blocks over an exception")
r = web.seen("/api/data")
t.ok(r and r[-1][2] == "/api/data?keep=2", f"$removeparam takes a parameter off the page's own request ({r and r[-1][2]})")
blocked = b.call({"do": "pages.blocker"})["blocked"]
t.ok(any("ad.js" in u for u in blocked), "the bench hears what was blocked")

# 2. Cosmetic: generic (as the class appears), site, exception, procedural, scriptlet first.
t.ok(shown(tab, "gen") == "none", "a generic hiding rule hides its element")
t.ok(shown(tab, "site") == "none", "a site's own hiding rule hides its element")
t.ok(shown(tab, "promo") != "none", "a cosmetic exception (#@#) for this site keeps its element")
t.ok(shown(tab, "keep") != "none", "an element no rule names stays")
b.wait_for(lambda: shown(tab, "late") is not None, what="late element")
b.wait_for(lambda: shown(tab, "late") == "none", within=5, what="late element hidden")
t.ok(True, "an element added later is hidden by the generic rule for its class")
b.wait_for(lambda: shown(tab, "c1") == "none", within=5, what="procedural")
t.ok(shown(tab, "c1") == "none" and shown(tab, "c2") != "none", "a procedural filter (:has-text) hides only its element")
t.ok(ev(tab, "window.early") == "hello@loading", f"a scriptlet runs before the page's own scripts ({ev(tab, 'window.early')})")
t.ok(ev(tab, "typeof window.safeSelf") == "undefined", "the scriptlet's helpers stay out of the page's globals")

# The same generic rule elsewhere, without the site's exception.
go(S("first.example", "/page"), "page", tab)
t.ok(shown(tab, "promo") == "none", "elsewhere the generic rule the exception spared applies")
t.ok(shown(tab, "site") != "none" and ev(tab, "window.early") is None, "news.example's own rules stay on news.example")

# 3. A page the lists leave alone ($document), a page blocked by a filter for pages.
web.clear()
go(S("allowed.example", "/page"), "page", tab)
t.ok(ev(tab, "window.ad") == 1 and shown(tab, "gen") != "none", "@@||site^$document: nothing blocked or hidden there")
web.clear()
go(S("adhost.example", "/landing"), "landing", tab)
t.ok(web.seen("/landing", "adhost.example"), "a page on a listed host still opens (only $document filters block pages)")
web.clear()
b.cmd("tab.go", id=tab, input=S("doc.example", "/doc"))
time.sleep(2.5)
t.ok(not web.seen("/doc", "doc.example") and tab_of(tab).get("title") != "doc", "a $document filter blocks the page itself")
err = tab_of(tab).get("error") or {}
t.ok(err.get("description") == "A block list stopped this page.", f"and the tab says why ({err.get('description')})")
t.ok(any("doc.example" in u for u in b.call({"do": "pages.blocker"})["blocked"]), "and says so to the bench")

# 4. The lists' CSP.
web.clear()
go(S("csp.example", "/csp"), "csp", tab)
b.wait_for(lambda: ev(tab, "window.img") != "waiting", what="image")
t.ok(ev(tab, "window.img") == "refused" and not web.seen("/pixel.png", "csp.example"), "$csp adds its policy to the page")

# 5. A frame's share (the main process gives it as the frame commits).
go(S("news.example", "/frames"), "frames", tab)
b.wait_for(lambda: (ev(tab, "window.frameState") or {}).get("display") == "none", within=10, what="frame hidden")
fs = ev(tab, "window.frameState")
t.ok(fs["display"] == "none", "a frame's site hiding rule hides its element")
t.ok(fs["mark"] and fs["mark"].startswith("inframe"), f"a frame's scriptlet runs in it ({fs['mark']})")

# 6. Block ads and trackers, off, and off for one site.
setting("shield", False)
web.clear()
go(S("news.example", "/page") + "?off", "page", tab)
b.wait_for(lambda: ev(tab, "window.api") is not None, what="page, off")
t.ok(ev(tab, "window.ad") == 1 and web.seen("/gpt.js") and ev(tab, "window.early") is None, "off: requests go as they come, no scriptlet")
t.ok(shown(tab, "gen") != "none" and shown(tab, "site") != "none", "off: nothing hidden")
setting("shield", True)
time.sleep(0.5)
t.ok(shown(tab, "site") == "none", "back on: the site's rules apply again at once")
# Off for one site: the tab's menu (the Mac's site card), the page reloads.
go(S("news.example", "/page") + "?paused", "page", tab)
web.clear()
b.cmd("pages.shield.site", id=tab, on=False)
b.wait_for(lambda: web.seen("/ad.js"), within=15, what="reload without blocking")
time.sleep(0.8)
t.ok(ev(tab, "window.ad") == 1 and shown(tab, "site") != "none", "off for news.example: the page reloads, its ads load and show")
time.sleep(0.6)
saved = json.loads((b.folder() / "prefs.json").read_text()).get("shield.paused")
t.ok(saved == ["news.example"], f"kept as the Mac keeps it, a host without www ({saved})")
web.clear()
go(S("first.example", "/page") + "?other", "page", tab)
t.ok(ev(tab, "window.ad") is None, "other sites stay blocked")
go(S("news.example", "/page") + "?again", "page", tab)
b.cmd("pages.shield.site", id=tab, on=True)
time.sleep(1.5)
b.wait_for(lambda: tab_of(tab).get("title") == "page", what="reload")
time.sleep(0.6)
t.ok(ev(tab, "window.ad") is None and shown(tab, "site") == "none", "back on for news.example: blocked and hidden again")

# 7. Remove click trackers from links: Search's list and the lists' $removeparam, utm_ stays.
go(S("news.example", "/landing") + "?gclid=1&oriel_cid=2&utm_source=x&k=3#top", "landing", tab)
url = tab_of(tab)["url"]
t.ok(url == S("news.example", "/landing") + "?utm_source=x&k=3#top", f"click IDs and the lists' parameters go, utm_ stays ({url})")
go(S("news.example", "/landing") + "?oriel_cid=2&X-Amz-Signature=s", "landing", tab)
t.ok("oriel_cid=2" in tab_of(tab)["url"], "a signed address is left whole")
setting("privacy.clickIDs", False)
go(S("news.example", "/landing") + "?gclid=off&oriel_cid=off", "landing", tab)
url = tab_of(tab)["url"]
t.ok("gclid=off" in url and "oriel_cid=off" in url, "off: the address stays as it was")
setting("privacy.clickIDs", True)

# 8. Tell sites not to sell or share your data.
web.clear()
go(S("news.example", "/gpc"), "gpc", tab)
r = web.seen("/gpc")
t.ok(r and r[-1][3].get("Sec-GPC") == "1" and ev(tab, "navigator.globalPrivacyControl") is True, "on: Sec-GPC: 1 and navigator.globalPrivacyControl")
web.clear()
go(S("news.example", "/frames") + "?gpc", "frames", tab)
time.sleep(1)
r = web.seen("/inner", "frame.example")
t.ok(r and r[-1][3].get("Sec-GPC") == "1", "a frame's requests carry it too")
setting("privacy.gpc", False)
web.clear()
go(S("news.example", "/gpc") + "?off", "gpc", tab)
r = web.seen("/gpc?off")
t.ok(r and "Sec-GPC" not in r[-1][3] and ev(tab, "navigator.globalPrivacyControl") is not True, "off: neither")
setting("privacy.gpc", True)

# 9. Try HTTPS first (off by default).
go(f"http://up.example:{P}/hf", "hf", tab)
t.ok(ev(tab, "location.protocol") == "http:", "off: an http page stays http")
setting("privacy.httpsFirst", True)
go(f"http://up.example:{P}/hf?on", "hf", tab)
t.ok(ev(tab, "location.protocol") == "https:", "on: it loads over https")
go(f"http://plain.example:{Q}/hf?fallback", "hf", tab)
b.wait_for(lambda: ev(tab, "location.href") == f"http://plain.example:{Q}/hf?fallback", what="fallback")
t.ok(ev(tab, "location.protocol") == "http:", "no https there: back to http, quietly")
setting("privacy.httpsFirst", False)

# 10. Prevent cross-site tracking: cookies by header and by script, storage.
b.cmd("settings.do", id="clear.cookies")
go(S("third.example", "/set"), "set", tab)
web.clear()
go(S("first.example", "/frame") + "?check", "frame", tab)
b.wait_for(lambda: web.seen("/check", "third.example"), within=30, what="frame check")
t.ok("Cookie" not in web.seen("/check", "third.example")[-1][3], "on: a site inside another is sent no cookies")
go(S("first.example", "/frame") + "?jar", "frame", tab)
b.wait_for(lambda: ev(tab, "window.got") is not None, what="jar")
go(S("other.example", "/frame") + "?peek", "frame", tab)
b.wait_for(lambda: ev(tab, "window.got") is not None, what="peek")
got = ev(tab, "window.got")
t.ok("jar=1" not in (got.get("had") or ""), f"on: a cookie a frame wrote by script on one site isn't there on another ({got})")
t.ok(got.get("ls") is None, "a frame's storage on one site isn't there on another")
go(S("first.example", "/frame") + "?ways", "frame", tab)
b.wait_for(lambda: ev(tab, "window.got") is not None, what="ways")
ways = ev(tab, "window.got")
t.ok(all(v in ("", "0") for v in ways.values()) and len(ways) == 7,
     f"on: no frame it makes by script reads them (index, innerHTML, write, nested, loading, shadow, cookieStore: {ways})")
setting("sites.keep", True)
web.clear()
go(S("first.example", "/frame") + "?check&off", "frame", tab)
b.wait_for(lambda: web.seen("/check", "third.example"), within=30, what="frame check, off")
t.ok("t=1" in web.seen("/check", "third.example")[-1][3].get("Cookie", ""), "off: it gets its cookies, as in Chrome")
go(S("first.example", "/frame") + "?ways", "frame", tab)
b.wait_for(lambda: ev(tab, "window.got") is not None, what="ways, off")
ways = ev(tab, "window.got")
t.ok(all(v == "t=1" for k, v in ways.items() if k != "cookieStore") and ways.get("cookieStore") == "1",
     f"off: each of those ways reads them, as in Chrome ({ways})")
setting("sites.keep", False)

# 11. The daily update (its sources on this computer), and the engine kept on disk.
b.call({"do": "pages.blockerTest", "filters": None})
src = lambda i, p: {"id": i, "title": i, "license": "-", "urls": [S("lists.example", p)]}
res = b.call({"do": "pages.blockerUpdate", "lists": [src("main", "/lists/main.txt")], "resources": src("resources", "/lists/resources.json")})
t.ok(res.get("changed") is True and not res.get("error"), f"an update fetches, follows !#include and compiles ({res})")
st = b.call({"do": "pages.blocker"})
t.ok(st["source"] == "downloaded" and st["updates"] == 1, "the new engine is in use")
web.PAGES["/up"] = f"<title>up</title><script src='{S('updated.example', '/ad.js')}'></script>"
web.clear()
go(S("news.example", "/up"), "up", tab)
t.ok(not web.seen("/ad.js", "updated.example"), "a filter that came with the update blocks")
res = b.call({"do": "pages.blockerUpdate", "lists": [src("main", "/lists/main.txt")], "resources": src("resources", "/lists/resources.json")})
t.ok(res.get("changed") is False, "the same lists again: nothing compiled")
world = b.folder() / "Blocker"
t.ok((world / "engine.bin").exists() and (world / "lists" / "main.txt").exists(), "the engine and its lists are kept in Oriel's folder")
web.PAGES["/lists/main.txt"] = ("<!doctype html><title>Sign in to the Wi-Fi</title>", "text/html")
res = b.call({"do": "pages.blockerUpdate", "lists": [src("main", "/lists/main.txt")], "resources": src("resources", "/lists/resources.json")})
t.ok(res.get("error") and b.call({"do": "pages.blocker"})["source"] == "downloaded", "a captive portal's page is refused, the engine kept")
b.quit()
b.launch(web.rules(*NAMES, "updated.example"), "--ignore-certificate-errors", wait=40)
st = b.call({"do": "pages.blocker"})
t.ok(st["source"] == "downloaded", f"after a restart the kept engine is read back ({st['loadMs']} ms)")
# The resources are pinned: a text that isn't the pinned one is refused, the engine kept.
web.PAGES["/lists/main.txt"] = ("! Title: main\n" + "\n".join(f"||filler{i}.example^" for i in range(30)) + "\n||pinned.example^\n", "text/plain")
pin = dict(src("resources", "/lists/resources.json"), sha256="0" * 64)
res = b.call({"do": "pages.blockerUpdate", "lists": [src("main", "/lists/main.txt")], "resources": pin})
t.ok(res.get("changed") is False and "SHA-256" in (res.get("error") or ""), f"resources that aren't the pinned text are refused, the engine kept ({res})")
# A damaged engine.bin is made again at once from the lists kept, without the network.
b.quit()
(world / "engine.bin").write_bytes(b"\0" * 4096)
b.launch(web.rules(*NAMES), "--ignore-certificate-errors", wait=40)
b.wait_for(lambda: b.call({"do": "pages.blocker"})["rebuilt"] >= 1, within=30, what="rebuilt")
st = b.call({"do": "pages.blocker"})
head = (world / "engine.bin").read_bytes()[:14]
t.ok(st["source"] == "downloaded" and head == b"ORIEL-BLOCKER-", f"a damaged engine is made again at once from the kept lists ({st['source']}, {head!r})")

# 12. With the internet: a public test page with the real lists (optional).
online = os.environ.get("ORIEL_OFFLINE") != "1"
if online:
    try:
        socket.create_connection(("adblock.turtlecute.org", 443), timeout=4).close()
    except OSError:
        online = False
if online:
    b.quit()
    b.use("privacy-blocking-online")
    b.launch()
    b.cmd("tab.new", url="https://adblock.turtlecute.org/")
    time.sleep(2)
    live = b.active()["id"]

    def score():
        text = ev(live, "document.body ? document.body.innerText : ''") or ""
        import re
        total = re.search(r"Total:\s*(\d+)", text)
        got = re.search(r"(\d+)\s+blocked", text)
        return (int(got.group(1)), int(total.group(1))) if total and got and int(got.group(1)) > 0 else None
    try:
        b.wait_for(lambda: (time.sleep(1) or True) and score(), within=60, what="score")
        time.sleep(8)
        n, total = score()
        print(f"  info adblock.turtlecute.org (the d3ward test's successor): {n}/{total} blocked ({100 * n // total}%)")
        # Search's own list alone: 32 of 130. What uBlock Origin's lists leave is
        # theirs to leave: about 37 phone and app telemetry hosts that only DNS
        # lists carry, and three bait tests (a first-party ads.js, pagead.js and
        # an .adsbox element) the lists spare so pages don't see a blocker.
        t.ok(n / total >= 0.6, "the real lists block what uBlock Origin's lists block there (over 60%)")
    except AssertionError as e:
        print(f"  info no score from the public test page ({e})")
else:
    print("  info offline: the public test page is skipped")

t.done()

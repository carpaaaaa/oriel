#!/usr/bin/env python3
"""Independent review of the ad blocker and Settings > Privacy > Blocking
(studio/06 §2.1-§2.4). Each check states what uBlock Origin (or the row's own
promise) does; a FAIL is a finding, not a flaky test. Every name reaches a
server on this computer (--host-resolver-rules): nothing goes to the network.

  python3 test/privacy_blocking_review.py
"""
import json
import socket
import sys
import time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b
import settings_c_web as web

server, P = web.start()
plain, Q = web.start(tls=False)


class Looper(web.Handler):
    """A site whose https address sends you back to http (some old sites do);
    its http address answers. (Only https redirects: an http /loop2 sending
    to itself would loop with or without Try HTTPS first.)"""
    def do_GET(self):
        import ssl
        if self.path.startswith("/loop") and isinstance(self.connection, ssl.SSLSocket):
            with web.LOCK:
                web.REQUESTS.append(("https", "loop.example", self.path, dict(self.headers.items())))
            self.send_response(302)
            self.send_header("Location", f"http://loop.example:{self.server.server_address[1]}/loop2")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        super().do_GET()


loopsrv = web.Dual(("127.0.0.1", 0), Looper)
loopsrv.context = web.certificate()
import threading
threading.Thread(target=loopsrv.serve_forever, daemon=True).start()
L = loopsrv.server_address[1]
# A port nobody listens on yet (a site that is down for a moment).
tmp = socket.socket()
tmp.bind(("127.0.0.1", 0))
X = tmp.getsockname()[1]
tmp.close()

NAMES = ["news.example", "allhost.example", "dochost.example", "popad.example", "first.example", "other.example",
         "third.example", "lists.example", "loop.example", "flaky.example", "wsbad.example", "wsok.example", "paused.example"]
S = lambda host, path: f"https://{host}:{P}{path}"

FILTERS = """! review list
||allhost.example^$all
||dochost.example^$document
||popad.example^$popup
||wsbad.example^$websocket
$removeparam=oriel_cid
news.example##.sponsored-box
news.example##+js(oriel-mark, hello)
"""
RESOURCES = json.dumps({
    "scriptlets": [{"name": "oriel-mark.js", "aliases": ["oriel-mark"], "dependencies": [],
                    "body": "function orielMark(name) { window.__orielMark = name + '@' + document.readyState; }"}],
    "redirects": [{"name": "noop.js", "aliases": ["noopjs"], "body": "window.__orielNoop = 1;", "contentType": "application/javascript"}],
})
web.PAGES["/landing"] = "<title>landing</title>"
web.PAGES["/loop"] = "<title>loop</title>"
web.PAGES["/loop2"] = "<title>loop</title>"
web.PAGES["/hf"] = "<title>hf</title>"
web.PAGES["/page"] = "<title>page</title>"
web.PAGES["/popopen"] = "<title>popopen</title>"
web.PAGES["/ws"] = "<title>ws</title>"
MARK = "<div class='sponsored-box' id='sb'>sponsored</div>"
web.PAGES["/kids"] = (
    "<title>kids</title>" + MARK +
    "<iframe id='same' src='/kid'></iframe>"
    "<iframe id='srcdoc' srcdoc=\"" + MARK.replace("'", "&#39;") + "\"></iframe>"
    "<script>const f = document.createElement('iframe'); f.id = 'blank'; document.body.append(f);"
    "const d = f.contentDocument; d.open(); d.write(\"" + MARK.replace('"', '\\"') + "\"); d.close();</script>")
web.PAGES["/kid"] = "<title>kid</title>" + MARK
web.PAGES["/frame"] = lambda h: (f"<title>frame</title><script>window.got = null; addEventListener('message', e => {{ window.got = e.data }})</script>"
                                 f"<iframe src='{S('third.example', '/' + h.path.split('?')[1])}'></iframe>")
# A third-party frame that goes round its own cookie block through a child frame.
web.PAGES["/jar2"] = ("<title>jar2</title><body><script>const f = document.createElement('iframe'); document.body.append(f);"
                      "let direct = '', child = '';"
                      "try { document.cookie = 'direct=1; SameSite=None; Secure; Path=/'; direct = document.cookie } catch (e) { direct = 'ERR' }"
                      "try { f.contentDocument.cookie = 'bypass=1; SameSite=None; Secure; Path=/'; child = f.contentDocument.cookie } catch (e) { child = 'ERR ' + e }"
                      "parent.postMessage({ direct, child }, '*')</script>")
web.PAGES["/peek2"] = ("<title>peek2</title><body><script>const f = document.createElement('iframe'); document.body.append(f);"
                       "let child = ''; try { child = f.contentDocument.cookie } catch (e) { child = 'ERR' }"
                       "parent.postMessage({ direct: document.cookie, child }, '*')</script>")
web.PAGES["/lists/main.txt"] = ("! Title: main\n" + "\n".join(f"||filler{i}.example^" for i in range(30)) + "\n||v1.example^\n", "text/plain")
web.PAGES["/lists/resources.json"] = (RESOURCES, "application/json")

b.use("privacy-blocking-review")
b.launch(web.rules(*NAMES), "--ignore-certificate-errors")
t = b.T()


def setting(key, value):
    b.cmd("settings.set", id=key, value=value)
    time.sleep(1.0)


def tab_of(tab):
    return next((x for x in b.state()["tabs"] if x["id"] == tab), {})


def ev(tab, js):
    try:
        return b.ev(tab, js)
    except RuntimeError:
        return None


def go(url, title=None, tab=None, within=30):
    tab = tab or b.active()["id"]
    b.cmd("tab.go", id=tab, input=url)
    if title:
        b.wait_for(lambda: tab_of(tab).get("title") == title, within=within, what=title)
    time.sleep(0.6)
    return tab


b.call({"do": "pages.blockerTest", "filters": FILTERS, "resources": RESOURCES})
b.cmd("tab.new", url=S("news.example", "/landing"))
b.wait_for(lambda: b.active()["title"] == "landing", what="first page")
tab = b.active()["id"]

# 1. uBlock Origin's `$all` (1298 filters in its Badware list) blocks the page itself;
#    `$document` does. Shield only stops a page for a filter it can tell is `$document`.
web.clear()
b.cmd("tab.go", id=tab, input=S("dochost.example", "/landing"))
time.sleep(2.5)
t.ok(not web.seen("/landing", "dochost.example"), "control: ||x^$document stops the page")
web.clear()
b.cmd("tab.go", id=tab, input=S("allhost.example", "/landing"))
time.sleep(2.5)
t.ok(not web.seen("/landing", "allhost.example"), "||x^$all (the Badware list's form) stops the page, as in uBlock Origin")

# 2. $popup filters (about 3,100 in EasyList and uBlock filters) are never asked.
go(S("news.example", "/popopen"), "popopen", tab)
web.clear()
before = len(b.state()["tabs"])
ev(tab, f"window.open('https://popad.example:{P}/landing'); 1")
time.sleep(3)
t.ok(not web.seen("/landing", "popad.example"), f"||x^$popup stops window.open to x ({before} tabs before, {len(b.state()['tabs'])} after)")

# 3. A WebSocket to a listed host (type websocket).
go(S("news.example", "/ws"), "ws", tab)
web.clear()
ev(tab, f"window.w = new WebSocket('wss://wsbad.example:{P}/sock'); 1")
time.sleep(2)
ev(tab, f"window.w2 = new WebSocket('wss://wsok.example:{P}/sock2'); 1")
time.sleep(2)
t.ok(not web.seen("/sock", "wsbad.example") and web.seen("/sock2", "wsok.example"),
     "$websocket filter: the handshake is never sent (an unlisted host's is, as control)")

# 4. Frames of the same origin, srcdoc and script-written get the site's rules.
go(S("news.example", "/kids"), "kids", tab)
time.sleep(1.5)
box = lambda sel: ev(tab, f"(() => {{ const e = {sel}; return e && getComputedStyle(e).display }})()")
t.ok(box("document.getElementById('sb')") == "none", "control: the top page's rule hides its element")
t.ok(box("document.getElementById('same').contentDocument.getElementById('sb')") == "none", "a same-origin frame (src) is hidden too")
t.ok(box("document.getElementById('srcdoc').contentDocument.getElementById('sb')") == "none", "a srcdoc frame is hidden too")
t.ok(box("document.getElementById('blank').contentDocument.getElementById('sb')") == "none", "a script-written about:blank frame is hidden too")
print("  info frames the main process dressed:", [(f["url"][-30:], f["css"], f["scripts"]) for f in b.call({"do": "pages.blocker"})["frames"]])
mark = ev(tab, "[document.getElementById('same'), document.getElementById('srcdoc'), document.getElementById('blank')].map(f => f.contentWindow.__orielMark || null)")
t.ok(all(mark or []), f"the site's scriptlet runs in each of them ({mark})")

# 5. Prevent cross-site tracking: a third-party frame writes a cookie through a child frame.
b.cmd("settings.do", id="clear.cookies")
go(S("first.example", "/frame") + "?jar2", "frame", tab)
b.wait_for(lambda: ev(tab, "window.got") is not None, what="jar2")
mine = ev(tab, "window.got")
go(S("other.example", "/frame") + "?peek2", "frame", tab)
b.wait_for(lambda: ev(tab, "window.got") is not None, what="peek2")
got = ev(tab, "window.got")
t.ok("bypass=1" not in (got.get("child") or "") and "bypass=1" not in (got.get("direct") or ""),
     f"a cookie written by a third-party frame through its child frame isn't read back under another site (wrote {mine}, read {got})")

# 6. Block ads off for one site, or everywhere: the lists' $removeparam on the page's own address.
b.cmd("pages.shield.site", id=tab, on=True)
go(S("news.example", "/landing"), "landing", tab)
b.cmd("pages.shield.site", id=tab, on=False)
time.sleep(2)
go(S("news.example", "/landing") + "?oriel_cid=2&k=3", "landing", tab)
t.ok("oriel_cid=2" in tab_of(tab)["url"], f"off for this site: the lists' $removeparam leaves its address alone ({tab_of(tab)['url']})")
b.cmd("pages.shield.site", id=tab, on=True)
time.sleep(1.5)
setting("shield", False)
go(S("news.example", "/landing") + "?oriel_cid=9&k=3", "landing", tab)
t.ok("oriel_cid=9" in tab_of(tab)["url"], f"Block ads and trackers off: the lists' $removeparam leaves its address alone ({tab_of(tab)['url']})")
setting("shield", True)

# 7. Try HTTPS first: a site whose https answer sends you back to http; a site that was down.
setting("privacy.httpsFirst", True)
loop = f"http://loop.example:{L}/loop"
web.clear()
b.cmd("tab.go", id=tab, input=loop)
time.sleep(5)
st = tab_of(tab)
tries = [r[2] for r in web.REQUESTS if r[1] == "loop.example" and r[0] == "https"]
t.ok(not st.get("error") and len(tries) == 1,
     f"a site that sends https back to http loads over http at once, no redirect loop ({st.get('url')}, error {st.get('error')}, https tries {tries})")

b.cmd("tab.go", id=tab, input=f"http://flaky.example:{X}/hf")
time.sleep(4)
flaky = web.Dual(("127.0.0.1", X), web.Handler)
flaky.context = web.certificate()
threading.Thread(target=flaky.serve_forever, daemon=True).start()
web.clear()
go(f"http://flaky.example:{X}/hf?again", "hf", tab)
r = web.seen("/hf?again", "flaky.example")
t.ok(r and r[-1][0] == "https", f"after one failed try (site down), the next load is tried over https again ({r and r[-1][0]})")
setting("privacy.httpsFirst", False)

# 8. The daily update: one list that fails holds back the ones that changed.
src = lambda i, p: {"id": i, "title": i, "license": "-", "urls": [S("lists.example", p)]}
b.call({"do": "pages.blockerTest", "filters": None})
res = b.call({"do": "pages.blockerUpdate", "lists": [src("main", "/lists/main.txt")], "resources": src("resources", "/lists/resources.json")})
t.ok(res.get("changed") is True, f"control: an update compiles ({res})")
h = (web.seen("/lists/main.txt") or [("", "", "", {})])[0][3]
t.ok(not any(k.lower() in ("cookie", "referer", "authorization") for k in h), f"the update request carries no cookie or referrer ({sorted(h)})")
print("  info update request headers:", {k: v for k, v in h.items() if k.lower() in ("user-agent", "accept-language")})
web.PAGES["/lists/main.txt"] = ("! Title: main\n" + "\n".join(f"||filler{i}.example^" for i in range(30)) + "\n||v1.example^\n||v2.example^\n", "text/plain")
res = b.call({"do": "pages.blockerUpdate", "lists": [src("main", "/lists/main.txt"), src("dead", "/lists/dead.txt")], "resources": src("resources", "/lists/resources.json")})
st = b.call({"do": "pages.blocker"})
t.ok(res.get("changed") is True or not res.get("error"),
     f"one list that can't be reached doesn't hold back the others' new filters ({res})")

t.done()

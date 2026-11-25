#!/usr/bin/env python3
"""A name with no address of its own (Oriel's own, as Firefox does it):
unibg.it answers only as www.unibg.it, so an address Oriel was asked to open
(typed, picked, from another app) whose name goes nowhere is tried once with
"www." in front, and a "www." one without it; path, query and port come
along. A link on a page gets no second try, a name that answers is left as
typed, and when both names fail the page says the one that was asked for.
Stand-in names reach a local server (--host-resolver-rules); the dead ones
are names nobody has registered."""
import sys
import time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b
import settings_c_web as web

server, P = web.start(tls=False)
web.PAGES["/"] = "<title>home</title><body>hi"
web.PAGES["/p"] = "<title>deeper</title><body>hi"

b.use("field-wwwfallback")
# zzapexsite-q81.com exists only without www, zzwwwsite-q81.com only with it.
b.launch(web.rules("zzapexsite-q81.com", "www.zzwwwsite-q81.com"))
t = b.T()
b.cmd("tab.new", url=f"http://zzapexsite-q81.com:{P}/")
b.wait_for(lambda: (b.active() or {}).get("title") == "home", within=30, what="the first page")


def settled():
    a = b.active()
    return a if a and not a.get("loading") and (a.get("error") or a.get("title")) else None


def go(text):
    b.cmd("tab.go", id=b.active()["id"], input=text)
    time.sleep(0.8)
    return b.wait_for(settled, within=40, what=text)


a = go(f"http://www.zzapexsite-q81.com:{P}/p?q=1")
t.ok(a["url"] == f"http://zzapexsite-q81.com:{P}/p?q=1" and a["title"] == "deeper" and not a.get("error"),
     f"a typed www. name that goes nowhere opens without it, path, query and port kept ({a['url']})")

a = go(f"http://zzwwwsite-q81.com:{P}/")
t.ok(a["url"] == f"http://www.zzwwwsite-q81.com:{P}/" and a["title"] == "home" and not a.get("error"),
     f"a typed bare name that goes nowhere opens with www. ({a['url']})")

a = go(f"http://zzapexsite-q81.com:{P}/")
t.ok(a["url"] == f"http://zzapexsite-q81.com:{P}/" and a["title"] == "home", f"a name that answers is left as typed ({a['url']})")

a = go(f"http://zzgone-q81.com:{P}/")
err = a.get("error") or {}
t.ok(err.get("code") == -105 and err.get("url") == f"http://zzgone-q81.com:{P}/" and a["url"] == f"http://zzgone-q81.com:{P}/",
     f"both names missing: the page says the name that was asked for ({err}, {a['url']})")

# A link in a page to a dead name: the page's doing, no second try.
go(f"http://zzapexsite-q81.com:{P}/")
tab = b.active()["id"]
b.ev(tab, f"document.body.innerHTML = '<a id=\"l\" href=\"http://zzlinkonly-q81.com:{P}/\">x</a>'; document.getElementById('l').click(); true")
a = b.wait_for(lambda: (b.active() or {}).get("error") and b.active(), within=30, what="the link's error")
t.ok(a["error"]["code"] == -105 and "www." not in a["url"], f"a link to a dead name gets no second try ({a['url']})")

# Local names are never given a www.
b.cmd("tab.go", id=tab, input="localhost:9")
a = b.wait_for(lambda: (b.active() or {}).get("error") and b.active(), within=30, what="localhost refused")
t.ok("www." not in a["url"], f"localhost is never given a www. ({a['url']})")
t.done()

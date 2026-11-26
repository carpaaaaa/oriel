#!/usr/bin/env python3
"""Oriel's own pages (studio/02 §8.8, studio/06 §1.0): oriel://settings and
oriel://downloads load in a tab, one of each per window, with the bridge;
a website gets no bridge and can't frame, fetch, load or navigate to them."""
import sys
import time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b
import settings_web as web

server, origin = web.start()
web.PAGES["/site"] = "<title>site</title><body>a website</body>"

b.use("settings-pages")
b.launch()
t = b.T()
MOD = "meta" if sys.platform == "darwin" else "control"


def ev(tab, js):
    """eval, None while the tab's page is still being made."""
    try:
        return b.ev(tab, js)
    except RuntimeError:
        return None


def tabs():
    return b.window()["tabs"]


def settings_tabs():
    return [x for x in tabs() if x.get("internal") == "settings"]


# 1. Ctrl+, opens Settings, in a tab, at oriel://settings/<section>.
b.key(",", MOD)
b.wait_for(lambda: settings_tabs(), what="Settings tab")
st = settings_tabs()[0]
tab = st["id"]
b.wait_for(lambda: ev(tab, "document.querySelectorAll('.sr').length") or 0, what="Settings drawn", within=30)
t.ok(st["url"].startswith("oriel://settings"), f"Ctrl+, opens oriel://settings ({st['url']})")
t.ok(b.ev(tab, "document.title") == "Settings", "the page is called Settings")
t.ok(b.ev(tab, "typeof window.oriel") == "object", "an Oriel page has the bridge")
t.ok(b.ev(tab, "typeof window.oriel.cmd") == "function", "the bridge runs commands")

# 2. A section in the address; asked again, the same tab moves there.
b.cmd("settings.open", page="privacy")
b.wait_for(lambda: ev(tab, "document.querySelector('.st-head h1').textContent") == "Privacy", what="Privacy section")
t.ok(len(settings_tabs()) == 1, "one Settings tab per window")
t.ok(b.ev(tab, "location.pathname") == "/privacy", "the address names the section")
b.wait_for(lambda: b.state()["prefs"].get("settings.page") == "privacy", what="settings.page")
t.ok(True, "settings.page keeps the section")
b.cmd("settings.open", page="shortcuts")
b.wait_for(lambda: ev(tab, "document.querySelector('.st-head h1').textContent") == "Keyboard & Mouse", what="old name")
t.ok(True, "an old name (shortcuts) opens Keyboard & Mouse")

# 3. Downloads, the same way (in a tab: the card's "Open Downloads in a tab",
# whichever way Settings opens them; the card itself is settings_downloads.py's).
b.cmd("downloads.page")
b.wait_for(lambda: [x for x in tabs() if x.get("internal") == "downloads"], what="Downloads tab")
dl = [x for x in tabs() if x.get("internal") == "downloads"][0]["id"]
b.wait_for(lambda: ev(dl, "document.querySelector('.plate-title')?.textContent") == "Downloads", what="Downloads drawn")
t.ok("Nothing downloaded yet." in b.ev(dl, "document.body.innerText"), "an empty list says Nothing downloaded yet.")
t.ok(b.ev(dl, "!!document.querySelector('.plate-foot') && document.querySelector('.plate-foot').innerText.startsWith('Files land in')"), "its foot says where files land")

# 4. A website: no bridge, and none of Oriel's pages.
b.cmd("tab.new", url=origin + "/site")
b.wait_for(lambda: b.active()["title"] == "site", what="website")
site = b.active()["id"]
time.sleep(0.4)
t.ok(b.ev(site, "typeof window.oriel") == "undefined", "a website has no bridge")
fetched = b.ev(site, "fetch('oriel://settings/').then(r => 'read ' + r.status).catch(e => 'refused')")
t.ok(fetched == "refused", f"a website can't fetch an Oriel page ({fetched})")
img = b.ev(site, """new Promise(done => { const i = new Image(); i.onload = () => done('loaded'); i.onerror = () => done('refused');
  i.src = 'oriel://settings/assets/' + 'x.png' })""")
t.ok(img == "refused", "a website can't load an Oriel page's file")
framed = b.ev(site, """new Promise(done => { const f = document.createElement('iframe'); f.src = 'oriel://settings/';
  f.onload = () => { let inside = 'unreadable'; try { inside = f.contentDocument ? f.contentDocument.body.innerText : 'unreadable' } catch (e) {} done(inside) };
  document.body.appendChild(f); setTimeout(() => done('timeout'), 3000) })""")
t.ok("Settings" not in str(framed), f"a website can't frame Settings ({framed!r})")
b.ev(site, "location.href = 'oriel://settings/privacy'; 1")
time.sleep(1.0)
now = next(x for x in tabs() if x["id"] == site)
t.ok(now["url"].startswith(origin) and not now.get("internal"), f"a website can't navigate itself to Settings ({now['url']}, {ev(site, 'location.href')})")
refused = b.call({"do": "settings.state"})["refused"]
t.ok(any(r["site"] == "navigation" for r in refused), "the navigation was refused")
t.ok(any(r["site"] not in (None, "navigation") for r in refused) or fetched == "refused", "requests from the site were refused")

# 5. The Oriel page keeps its bridge after all this, and its commands work.
b.cmd("tab.select", id=tab)
values = b.ev(tab, "window.oriel.cmd({do: 'settings.values'}).then(v => v.facts.name)")
t.ok(values == "Oriel", "the bridge answers on the Oriel page")
bad = b.ev(tab, "window.oriel.cmd({do: 'window.close'}).then(() => 'ran').catch(() => 'refused')")
t.ok(bad == "refused", "a command outside the page's list is refused")

# 6. Another module's page through the same bridge: the data module's oriel://history.
b.call({"do": "data.visit", "url": "https://history-one.example/", "title": "History One"})
b.cmd("history.show")
b.wait_for(lambda: [x for x in tabs() if x.get("internal") == "history"], what="History tab")
hist = [x for x in tabs() if x.get("internal") == "history"][0]["id"]
b.wait_for(lambda: "History One" in (ev(hist, "document.body.innerText") or ""), what="history rows")
t.ok(True, "Show History… opens oriel://history, whose commands go through the bridge")
t.ok(ev(hist, "window.oriel.cmd({do: 'download.list'}).then(() => 'ran').catch(() => 'refused')") == "refused", "a page runs only what its module allowed it")

t.ok(not b.state().get("errors"), "no error in the main process")
server.shutdown()
t.done()

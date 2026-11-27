#!/usr/bin/env python3
"""Developer Mode, site by site (Search 1.0.22, DevMode.swift; the Mac's
Tests/arc_extras.py and DevModeTests): a page on this computer (localhost,
127.0.0.1, [::1], .localhost, .test) shows a slim bar over its corner with
its whole address, Developer Tools, Reload Ignoring Cache and a switch that
keeps the cache off for the site's reloads. Any site can be put in it or
taken out from its tab's menu (the Mac's site card) or with Shift+F12, and is
remembered; private tabs remember nothing. On by itself for local sites,
switchable in Settings › About › Developer (off in a test world unless a
test turns it on, as on the Mac).

    npm run build && python test/pages_devmode.py
"""
import sys
import time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b  # noqa: E402
import settings_c_web as web  # noqa: E402

server, P = web.start(tls=False)
LOCAL = f"http://127.0.0.1:{P}"
web.PAGES["/dev"] = "<title>dev</title><body style='margin:0'><p>local dev page"
web.PAGES["/long"] = "<title>long</title><p>a long address"
web.PAGES["/site"] = "<title>site</title><p>a site out there"
REMOTE = f"http://dev.example:{P}"
RULES = web.rules("dev.example")
WORLD = "pages-devmode"
t = b.T()


def ev(tab, js):
    try:
        return b.ev(tab, js)
    except RuntimeError:
        return None


def tab_rec(id):
    return next((x for x in b.state()["tabs"] if x["id"] == id), None)


def open_tab(url, title):
    id = b.cmd("tab.open", url=url, foreground=True)
    b.wait_for(lambda: (x := tab_rec(id)) and not x["loading"] and x["title"] == title, within=30, what=title)
    b.wait_for(lambda: ev(id, "new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(1))))") == 1, within=30, what="painted")
    time.sleep(0.4)
    return id


def dev(**req):
    return b.call({"do": "pages.devmode", **req})


def bar_of(tab):
    return next((x for x in dev(id=tab)["bars"] if x["tab"] == tab), None)


def bar_js(tab, js):
    return b.call({"do": "pages.devbar", "id": tab, "js": js})["value"]


def wait_bar(tab, shown=True):
    b.wait_for(lambda: (bar_of(tab) is not None and bar_of(tab)["ready"]) if shown else bar_of(tab) is None, within=8,
               what=f"the bar {'up' if shown else 'gone'}")
    time.sleep(0.4)


def asked(path):
    return [r[3] for r in web.seen(path)]


def no_cache(headers):
    return "no-cache" in (headers.get("Cache-Control", "") + headers.get("Pragma", ""))


def tools():
    return b.state()["windows"][0].get("siteTools") or {}


def setting(key, value):
    b.cmd("settings.set", id=key, value=value)
    time.sleep(0.6)


b.use(WORLD)
b.launch(RULES)
time.sleep(0.8)

# 1. Which sites are this computer's (DevMode.isLocal).
hosts = {"localhost": True, "app.localhost": True, "site.test": True, "127.0.0.1": True, "127.1.2.3": True, "::1": True,
         "[::1]": True, "0.0.0.0": True, "LOCALHOST.": True, "example.com": False, "localhost.example.com": False,
         "127.0.0.1.example.com": False, "test": False, "10.0.0.1": False, "127.0.0.256": False, "my-test.dev": False}
got = dict(b.call({"do": "pages.devlocal", "hosts": list(hosts)})["local"])
t.ok(got == hosts, f"localhost, 127.x, [::1], .localhost and .test are this computer's, nothing else ({[h for h in hosts if got.get(h) != hosts[h]]})")

# 2. Off in a test world until asked; on by itself for local sites once on.
local = open_tab(LOCAL + "/dev", "dev")
r = dev(id=local)
t.ok(not r["on"] and not r["local"] and r["isLocal"], f"a test world's local pages wear no bar until asked ({r['on']}, {r['local']})")
t.ok(r["command"] and r["key"] == "Shift+F12", f"the command exists, on Shift+F12 ({r['key']})")
setting("developer.local", True)
wait_bar(local)
r = dev(id=local)
t.ok(r["on"] and r["local"] and r["sites"] == {}, "Settings › About › Developer on: on by itself for 127.0.0.1, nothing kept")
named = open_tab(f"http://localhost:{P}/dev?x=1", "dev")
t.ok(dev(id=named)["on"], "on by itself for localhost too")
wait_bar(named)
t.ok(bar_js(named, "document.getElementById('url').textContent") == f"http://localhost:{P}/dev?x=1", "the bar shows the page's whole address")
b.cmd("tab.close", id=named)
time.sleep(0.3)
b.cmd("tab.select", id=local)
wait_bar(local)

# 3. The bar: over the page's bottom corner, above the page, under the overlay.
bar = bar_of(local)
page, box = bar["page"], bar["bounds"]
t.ok(abs((box["x"] + box["width"]) - (page["x"] + page["width"] - 2)) <= 1 and abs((box["y"] + box["height"]) - (page["y"] + page["height"] - 2)) <= 1,
     f"in the page's bottom right corner, the capsule 10 in ({box} in {page})")
t.ok(42 <= box["height"] <= 44 and 180 < box["width"] < 560, f"slim: 26 high with room for its shadow ({box['width']}x{box['height']})")
t.ok(bar["above"] and bar["underOverlay"], "a view of its own above the page, under the overlay (nothing put in the page)")
t.ok(ev(local, "document.querySelectorAll('body *').length") == 1, "the page's own document is as it was")
look = bar_js(local, "(() => { const b = document.getElementById('bar'), s = getComputedStyle(b);"
                     " return [Math.round(b.getBoundingClientRect().height), s.borderTopLeftRadius, getComputedStyle(document.querySelector('#url')).fontFamily.includes('Mono'),"
                     " [...document.querySelectorAll('button')].map(x => x.getAttribute('aria-label'))] })()")
t.ok(look[0] == 26 and look[1] == "13px" and look[2], f"a capsule 26 high, the address in a monospaced face ({look[:3]})")
t.ok(look[3] == ["Developer Tools (F12)", "Reload Ignoring Cache (Ctrl+F5)", "Turn Cache Off for This Site's Reloads",
                 "Turn Off Developer Mode for This Site (Shift+F12)"], f"its tools, with their keys ({look[3]})")
t.ok(tools().get("dev", {}).get(local) is True and tools().get("devKey") == "Shift+F12", "the tab's menu has Developer Mode, ticked, with its key")
# It follows the page: the sidebar folded makes the page wider.
b.cmd("sidebar.toggle")
time.sleep(1.2)
bar = bar_of(local)
page2, box2 = bar["page"], bar["bounds"]
t.ok(page2["width"] != page["width"] and abs((box2["x"] + box2["width"]) - (page2["x"] + page2["width"] - 2)) <= 1,
     f"it follows the page when the page moves ({page['width']} to {page2['width']})")
b.cmd("sidebar.toggle")
time.sleep(1.0)

# 4. Off by hand is kept for the site; the command brings it back, nothing kept.
r = dev(id=local, set=False)
t.ok(not r["on"] and r["sites"] == {"127.0.0.1": False}, f"off by hand, kept for the site ({r['sites']})")
wait_bar(local, shown=False)
t.ok(True, "and its bar goes")
r = b.cmd("view.developerMode", id=local)
t.ok(r["on"] and dev(id=local)["sites"] == {}, "the command turns it back on, nothing kept")
wait_bar(local)
# Shift+F12, as a hand gives it to the page.
b.call({"do": "pages.input", "id": local, "events": [{"type": "keyDown", "keyCode": "F12", "modifiers": ["shift"]},
                                                     {"type": "keyUp", "keyCode": "F12", "modifiers": ["shift"]}]})
b.wait_for(lambda: not dev(id=local)["on"], within=5, what="Shift+F12")
t.ok(dev(id=local)["sites"] == {"127.0.0.1": False}, "Shift+F12 takes the site out")
b.call({"do": "pages.input", "id": local, "events": [{"type": "keyDown", "keyCode": "F12", "modifiers": ["shift"]},
                                                     {"type": "keyUp", "keyCode": "F12", "modifiers": ["shift"]}]})
b.wait_for(lambda: dev(id=local)["on"], within=5, what="Shift+F12 again")
t.ok(True, "and puts it back")
wait_bar(local)

# 5. Reloads: plain ones ask as usual; Reload Ignoring Cache, and every reload with the cache off, skip it.
before = len(asked("/dev"))
b.cmd("tab.reload", id=local)
b.wait_for(lambda: len(asked("/dev")) > before, within=8, what="a plain reload")
plain = asked("/dev")[before:]
t.ok(len(plain) == 1 and not no_cache(plain[0]), f"a plain reload asks the server, without no-cache ({plain[0].get('Cache-Control') if plain else None})")
wait_bar(local)
before = len(asked("/dev"))
bar_js(local, "document.getElementById('reload').click(); 1")
b.wait_for(lambda: len(asked("/dev")) > before, within=8, what="Reload Ignoring Cache")
t.ok(no_cache(asked("/dev")[before]), "the bar's Reload Ignoring Cache skips the cache (no-cache)")
wait_bar(local)
bar_js(local, "document.getElementById('cache').click(); 1")
b.wait_for(lambda: dev(id=local)["cacheOff"], within=5, what="cache off")
time.sleep(0.4)
t.ok(bar_js(local, "[document.getElementById('cache').classList.contains('on'), document.getElementById('cache').getAttribute('aria-label')]")
     == [True, "Cache Off for This Site's Reloads: Turn On"], "its switch: the cache off for the site, said so")
before = len(asked("/dev"))
b.cmd("tab.reload", id=local)
b.wait_for(lambda: len(asked("/dev")) > before, within=8, what="Ctrl+R with the cache off")
t.ok(no_cache(asked("/dev")[before]), "with the cache off, Ctrl+R's reload skips it (no-cache)")
other = open_tab(LOCAL + "/long?" + "a" * 200, "long")
t.ok(dev(id=other)["cacheOff"], "for every page of the site")
wait_bar(other)
w = bar_of(other)["bounds"]["width"]
cut = bar_js(other, "[document.querySelector('#url .b').textContent, document.querySelector('#url .a').scrollWidth > document.querySelector('#url .a').clientWidth]")
# The address 420 at most (DevBar's maxWidth), the tools beside it, the shadow's room round them.
t.ok(w <= 600 and cut[0].endswith("aaaa") and cut[1], f"a long address loses its middle, its end stays ({w} wide, …{cut[0]})")
b.cmd("tab.close", id=other)
b.cmd("tab.select", id=local)
wait_bar(local)
bar_js(local, "document.getElementById('cache').click(); 1")
b.wait_for(lambda: not dev(id=local)["cacheOff"], within=5, what="cache on again")
before = len(asked("/dev"))
b.cmd("tab.reload", id=local)
b.wait_for(lambda: len(asked("/dev")) > before, within=8, what="a plain reload again")
t.ok(not no_cache(asked("/dev")[before]), "on again, a plain reload is plain")
wait_bar(local)

# 6. Developer Tools: Chromium's, for this page (a test world writes down what would open).
bar_js(local, "document.getElementById('inspector').click(); 1")
time.sleep(0.5)
t.ok(dev(id=local)["inspected"][-1:] == [{"id": local, "open": True}], f"the bar's Developer Tools opens them for the page ({dev(id=local)['inspected']})")
r = b.cmd("view.inspector")
t.ok(r == {"open": False}, "F12 (Web Inspector) puts them away again")

# 7. Any site: put in it from its tab's menu and remembered; ✕ takes it out.
remote = open_tab(REMOTE + "/site", "site")
r = dev(id=remote)
t.ok(not r["on"] and not r["isLocal"] and bar_of(remote) is None, "a site out there has no bar by itself")
t.ok(tools().get("dev", {}).get(remote) is False, "its tab's menu offers Developer Mode, unticked")
b.cmd("view.developerMode", id=remote)
wait_bar(remote)
t.ok(dev(id=remote)["sites"] == {"dev.example": True}, "put in Developer Mode, the site is remembered")

# 8. A private tab remembers nothing.
shy = b.cmd("tab.newPrivate")
b.cmd("tab.go", id=shy, input=LOCAL + "/dev")
b.wait_for(lambda: (x := tab_rec(shy)) and not x["loading"] and x["title"] == "dev", within=30, what="the private page")
time.sleep(0.5)
t.ok(dev(id=shy)["on"], "a private tab of a local site is in it too")
b.cmd("view.developerMode", id=shy)
time.sleep(0.4)
t.ok(not dev(id=shy)["on"] and dev(id=shy)["sites"] == {"dev.example": True}, "turned off in a private tab: nothing written down")
t.ok(dev(id=local)["on"], "and the ordinary tab of that site keeps it")
b.cmd("tab.close", id=shy)
time.sleep(0.3)

# 9. ✕ on the bar takes the site out.
b.cmd("tab.select", id=remote)
wait_bar(remote)
bar_js(remote, "document.getElementById('off').click(); 1")
b.wait_for(lambda: not dev(id=remote)["on"], within=5, what="✕")
t.ok(dev(id=remote)["sites"] == {}, "✕ takes the site out (back as it would be by itself, nothing kept)")
wait_bar(remote, shown=False)
b.cmd("view.developerMode", id=remote)
wait_bar(remote)

# 10. Remembered after Oriel restarts; Settings' switch off leaves only the sites turned on.
b.quit()
b.use(WORLD, wipe=False)
b.launch(RULES)
time.sleep(0.8)
remote = open_tab(REMOTE + "/site", "site")
t.ok(dev(id=remote)["on"] and dev(id=remote)["sites"] == {"dev.example": True}, "remembered after Oriel restarts")
wait_bar(remote)
local = open_tab(LOCAL + "/dev", "dev")
t.ok(dev(id=local)["on"], "local sites still on by themselves")
setting("developer.local", False)
wait_bar(local, shown=False)
t.ok(not dev(id=local)["on"], "Settings' switch off: local sites wear no bar")
b.cmd("tab.select", id=remote)
wait_bar(remote)
t.ok(dev(id=remote)["on"], "only the sites turned on show it")
t.done()

#!/usr/bin/env python3
"""Settings' area B, links from other apps (studio/08 B): each row changed,
its effect seen.
  - Open links from other apps in a small window (links.little, §10.27-§10.31)
  - Go to a tab that has the page (links.little.tabs)
  - Send links to a space (spaces.links, spaces.links.rules, §7.28-§7.29)
  - Ask which space for links from other apps (links.ask, links.ask.last, §7.30)
  - Open the address field from any app (launcher.on, launcher.key, launcher.little)"""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b  # noqa: E402
import tabs_kit as k  # noqa: E402

t = b.T()
k.world("settings-b-arrive")
k.launch()
arrive = lambda url: k.cmd("link.arrive", url=url)
littles = lambda: b.call({"do": "settingsb.littles"})["littles"]

# Open links from other apps in a small window: on as it comes.
k.page("first")
tabs = len(k.tabs())
r = arrive(k.url("from-mail"))
t.ok(r["went"] == "little", "on, as it comes: a link from another app opens in a small window")
b.wait_for(lambda: littles() and littles()[0]["url"] == k.url("from-mail"), what="small window loaded")
l = littles()[0]
t.ok(len(k.tabs()) == tabs and b.call({"do": "settingsb.littles"})["windows"] == 1, "Oriel's window stays as it was: no tab, no window")
t.ok(l["bounds"]["width"] == 900 and l["bounds"]["height"] == 640, "900 by 640 the first time")
time.sleep(0.6)
b.call({"do": "settingsb.littleEval", "id": l["id"], "js": "window.kept = 42"})
got = b.call({"do": "settingsb.littleKeep", "id": l["id"]})["tab"]
time.sleep(0.6)
x = k.tab(got)
t.ok(x and x["url"] == k.url("from-mail") and k.win()["activeID"] == got, "Open in Oriel: the page a tab in front")
t.ok(b.ev(got, "window.kept") == 42, "the same page, not loaded again")
t.ok(littles() == [], "and the small window gone")
arrive(k.url("second"))
b.wait_for(lambda: len(littles()) == 1, what="second small window")
l2 = littles()[0]
arrive(k.url("third"))
b.wait_for(lambda: len(littles()) == 2, what="third small window")
l3 = littles()[1]
t.ok(l3["bounds"]["x"] == l2["bounds"]["x"] + 20 and l3["bounds"]["y"] == l2["bounds"]["y"] + 20, "another one a step down and to the right")
b.call({"do": "settingsb.littleKey", "id": l3["id"], "key": "Escape"})
b.wait_for(lambda: len(littles()) == 1, what="Escape closes")
t.ok(True, "Escape closes a small window")
b.call({"do": "settingsb.littleKey", "id": l2["id"], "key": "O", "modifiers": ["control", "meta"]})
b.wait_for(lambda: littles() == [] and k.by_name("second") is not None, what="Ctrl+O keeps")
t.ok(True, "Ctrl+O keeps the page")

# Go to a tab that has the page
k.cmd("prefs.set", key="links.little.tabs", value=True)
other = k.page("other")
r = arrive(k.url("first"))
t.ok(r["went"] == "open" and k.name_of(k.active()["url"]) == "first" and littles() == [], "on: a page already open in a tab: that tab, no small window")
k.cmd("prefs.set", key="links.little.tabs", value=False)
r = arrive(k.url("first"))
t.ok(r["went"] == "little", "off: a small window all the same")
b.wait_for(lambda: len(littles()) == 1, what="little")
b.call({"do": "settingsb.littleKey", "id": littles()[0]["id"], "key": "W", "modifiers": ["control", "meta"]})
b.wait_for(lambda: littles() == [], what="Ctrl+W closes")
k.cmd("prefs.set", key="links.little", value=False)
r = arrive(k.url("as-tab"))
time.sleep(0.6)
t.ok(r["went"] == "tab" and k.name_of(k.active()["url"]) == "as-tab" and littles() == [], "off: a tab in front, in Oriel's window")

# Send links to a space
FIRST = "00000000-0000-0000-0000-000000000001"
k.cmd("prefs.set", key="spaces", value=True)
work = k.cmd("space.create", name="Work"); k.settle(0.5)
k.cmd("space.select", id=FIRST); k.settle(0.4)
k.cmd("prefs.set", key="links.little", value=True)
k.cmd("prefs.set", key="spaces.links.rules", value=[{"site": "localhost", "space": work}])
r = arrive(k.BASE.replace("127.0.0.1", "localhost") + "/routed")
t.ok(r["went"] == "little", "a rule but the row off: the link goes as always")
b.wait_for(lambda: len(littles()) == 1, what="little")
b.call({"do": "settingsb.littleKey", "id": littles()[0]["id"], "key": "Escape"})
k.cmd("prefs.set", key="spaces.links", value=True)
r = arrive(k.BASE.replace("127.0.0.1", "localhost") + "/routed")
time.sleep(0.6)
t.ok(r["went"] == "tab" and k.win()["space"] == work and k.active()["url"].endswith("/routed"), "on: the site's link opens in its space, the window gone to it, never a small window")
r = arrive(k.BASE.replace("127.0.0.1", "sub.localhost") + "/deeper")
t.ok(r["went"] == "tab" and k.win()["space"] == work, "its subdomains with it")
k.cmd("space.select", id=FIRST); k.settle(0.4)
pg = k.page("page-in-personal")
b.ev(pg, "window.open('" + k.BASE.replace("127.0.0.1", "localhost") + "/from-page'); true")
b.wait_for(lambda: k.win()["space"] == work and k.active()["url"].endswith("/from-page"), what="link from a page routed")
t.ok(True, "a page of another space opening the site in a new tab: in its space")
site = k.cmd("spaces.route", url=k.url("x"), space=work); time.sleep(0.6)
t.ok(site == "127.0.0.1" and {"site": "127.0.0.1", "space": work} in k.read("prefs.json")["spaces.links.rules"], "Always Open <site> in <space> keeps a rule")
k.cmd("spaces.route", url=k.url("x"), space=None); time.sleep(0.6)
t.ok(all(r["site"] != "127.0.0.1" for r in k.read("prefs.json")["spaces.links.rules"]), "Stop Opening takes it away")

# Ask which space for links from other apps
k.cmd("space.select", id=FIRST); k.settle(0.4)
k.cmd("prefs.set", key="links.ask", value=True)
r = arrive(k.url("asked"))
t.ok(r["went"] == "ask", "on: asked first, nothing loads")
asking = b.call({"do": "settingsb.asking"})["data"]
t.ok(asking and [x["name"] for x in asking["rows"]] == ["Personal", "Work"] and asking["rows"][0]["digit"] == 1 and asking["title"] == "Open a link", "every space, with the digit that opens it there")
t.ok(asking["rows"][asking["marked"]]["space"] == FIRST and asking["alwaysShown"], "the space in front marked; Always offered with Send links to a space on")
b.wait_for(lambda: b.window()["overlay"].get("name") == "tabs.ask", what="panel up")
b.ui("document.querySelector('[data-ask]').dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit2', key: '2', bubbles: true })), true", root="overlay")
b.wait_for(lambda: k.win()["space"] == work and k.name_of(k.active()["url"]) == "asked", what="opened in Work")
t.ok(b.window()["overlay"]["kind"] == "none", "2: opened in the second space, the panel gone")
time.sleep(0.6)
t.ok(k.read("prefs.json")["links.ask.last"][0] == {"site": "127.0.0.1", "space": work}, "where the site went is remembered")
k.cmd("space.select", id=FIRST); k.settle(0.4)
arrive(k.url("asked-again"))
asking = b.call({"do": "settingsb.asking"})["data"]
t.ok(asking["rows"][asking["marked"]]["space"] == work, "next time its space is marked")
k.cmd("link.choose", space=work, always=True); time.sleep(0.8)
t.ok({"site": "127.0.0.1", "space": work} in k.read("prefs.json")["spaces.links.rules"], "Always: a rule for its site")
k.cmd("space.select", id=FIRST); k.settle(0.4)
r = arrive(k.url("ruled"))
t.ok(r["went"] == "tab" and k.win()["space"] == work, "and its links go there without asking")
k.cmd("prefs.set", key="links.ask", value=False)

# Open the address field from any app
launcher = lambda: b.call({"do": "settingsb.launcher"})["registered"]
t.ok(launcher() is None, "off, as it comes: no key taken")
k.cmd("prefs.set", key="launcher.key", value='{"name":"Ctrl+Shift+Space"}')
k.cmd("prefs.set", key="launcher.on", value=True); time.sleep(0.3)
t.ok(launcher() == "CommandOrControl+Shift+Space", "on: the key is Oriel's from any app")
k.cmd("space.select", id=FIRST); k.settle(0.4)
k.page("under")
b.call({"do": "settingsb.launch"}); time.sleep(0.6)
t.ok(k.active()["empty"], "the key brings the window in front, a new tab's field up")
k.cmd("field.close"); time.sleep(0.3)
k.cmd("prefs.set", key="launcher.little", value=True)
b.call({"do": "settingsb.launch"}); time.sleep(0.5)
before = len(k.tabs())
k.cmd("field.commit", text=k.url("from-launcher"))
b.wait_for(lambda: any(x["url"] == k.url("from-launcher") for x in littles()), what="launcher small window")
time.sleep(0.5)
t.ok(not any(x["url"] == k.url("from-launcher") for x in k.tabs()), "Open in a small window: what Return opens comes in a small window, not a tab")
k.cmd("prefs.set", key="launcher.on", value=False); time.sleep(0.3)
t.ok(launcher() is None, "off again: the key given back")
t.done()

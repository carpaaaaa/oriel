#!/usr/bin/env python3
"""Settings' area B, the rows that say "always there" and need something
behind them (studio/08 B):
  - Websites in the side panel (panel.sites; SidePanel.swift, idea 365)
  - A tab's menu › Open in Small Window (links.little; Browser.openInLittleWindow)"""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b  # noqa: E402
import tabs_kit as k  # noqa: E402

t = b.T()
k.world("settings-b-panel")
k.launch()
panel = lambda: b.call({"do": "settingsb.sitePanel"})
line = lambda: b.call({"do": "settingsb.sitePanelLine"}).get("text")
peval = lambda js: b.call({"do": "settingsb.sitePanelEval", "js": js})["value"]

a = k.page("a")
b.ev(a, "document.cookie = 'kept=yes; path=/'; true")
t.ok(not panel()["open"], "no panel, as it comes")
k.cmd("panel.site", url=k.url("chat"))
b.wait_for(lambda: panel()["open"] and panel()["arrived"] == k.url("chat") and panel()["bounds"]["width"] > 0, what="site in the panel")
p = panel()
t.ok(p["room"] and p["room"]["side"] == "right" and p["room"]["width"] == 380, "beside the page, away from the tabs, 380 wide to start")
t.ok(abs(p["bounds"]["width"] - 380) <= 2, "the panel laid in the room the window gave")
b.wait_for(lambda: line() == "127.0.0.1 (not secure)", what="line")
t.ok(True, "its own line names the site, as it stays beside every tab")
t.ok("kept=yes" in peval("document.cookie"), "signed in where the space's tabs are")
before = len(k.tabs())
peval(f"window.open('{k.url('from-panel')}'); true")
b.wait_for(lambda: k.by_name("from-panel") is not None, what="window from the panel")
t.ok(len(k.tabs()) == before + 1 and panel()["open"], "a window it opens goes to a tab; the panel stays")
k.cmd("panel.site", url=k.url("elsewhere-same-site"))
b.wait_for(lambda: not panel()["open"], what="same site closes")
t.ok(k.win() and b.call({"do": "settingsb.sitePanel"})["open"] is False, "the same site again closes it")
k.cmd("view.sidePanel")
b.wait_for(lambda: panel()["open"] and panel()["arrived"] == k.url("chat"), what="Show Side Panel")
t.ok(True, "Show Side Panel: the site last there")
k.cmd("view.sidePanel")
b.wait_for(lambda: not panel()["open"], what="toggle closes")
t.ok(True, "and again closes it")
k.cmd("panel.site", url=k.url("read-here"))
b.wait_for(lambda: panel()["open"] and panel()["arrived"] == k.url("read-here"), what="panel again")
b.call({"do": "settingsb.sitePanelLine", "click": "tab"})
b.wait_for(lambda: not panel()["open"] and k.name_of(k.active()["url"]) == "read-here", what="Open in a Tab")
t.ok(True, "Open in a Tab: its page a tab in front, the panel closed")
k.cmd("panel.site", url=k.url("chat"))
b.wait_for(lambda: panel()["open"], what="panel for close")
b.call({"do": "settingsb.sitePanelLine", "click": "close"})
b.wait_for(lambda: not panel()["open"] and panel().get("room") is None, what="Close")
t.ok(True, "Close gives the page its room back")
t.ok(k.cmd("panel.site", url="file:///etc/hosts") is False and not panel()["open"], "only the web: never a file")

# Another space: the site comes again, signed in as that space is.
FIRST = "00000000-0000-0000-0000-000000000001"
k.cmd("prefs.set", key="spaces", value=True)
k.cmd("panel.site", url=k.url("chat"))
b.wait_for(lambda: panel()["open"], what="panel before the space")
work = k.cmd("space.create", name="Work", signedOut=True)
b.wait_for(lambda: panel()["open"] and panel()["space"] == work and panel()["arrived"] == k.url("chat"), what="panel follows the space")
t.ok("kept=yes" not in peval("document.cookie"), "the window in another space: the site again, with that space's sign-ins")
k.cmd("space.select", id=FIRST); k.settle(0.4)
k.cmd("panel.siteClose")

# A tab's menu › Open in Small Window
x = k.page("lift-me")
k.page("stays")
k.cmd("tab.select", id=x); k.settle(0.3)
t.ok(k.cmd("tab.little", id=x) is True, "Open in Small Window")
b.wait_for(lambda: any(l["url"] == k.url("lift-me") for l in b.call({"do": "settingsb.littles"})["littles"]), what="small window")
t.ok(k.by_name("lift-me") is None and k.name_of(k.active()["url"]) != "lift-me", "the tab out of its row, its page in a small window")
pin = k.page("pinned"); k.cmd("tab.pin", id=pin); k.settle(0.3)
t.ok(k.cmd("tab.little", id=pin) is False, "never a pin")
for l in b.call({"do": "settingsb.littles"})["littles"]:
    b.call({"do": "settingsb.littleKey", "id": l["id"], "key": "Escape"})
t.done()

#!/usr/bin/env python3
"""Settings › Tabs › Double click to rename, off unless turned on (Search
1.0.22, Browser.clickRenamesTab, SettingsIndex tabs.clickRenames): a click on
the tab you're on opens its name to type over, as Rename in its menu does,
instead of its address; down the side and across the top. It takes the click
over from "Clicking the tab you're on edits its address only", which hides
while it is on; the column of icons, with no title to type over, still opens
the address, and there the switch doesn't apply."""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b  # noqa: E402
import ui_kit as k  # noqa: E402

b.use("ui-click-rename")
b.launch(*k.FRAMES, env={"SEARCH_LOOK": "light"})
t = b.T()
time.sleep(0.8)


def setting(id_, value):
    b.cmd("settings.set", id=id_, value=value)
    time.sleep(0.5)


def click(sel):
    r = b.wait_for(lambda: k.rect(sel), within=4, what=sel)
    b.mouse(r["x"] + r["w"] / 2, r["y"] + r["h"] / 2)
    time.sleep(0.4)


def field():
    return k.js("const e = document.activeElement; return e && e.classList.contains('rename') ? [e.value, e.selectionStart, e.selectionEnd, !!e.closest('.row, .strip-tab.live')] : null")


def name_it(word):
    k.js(f"const e = document.activeElement; e.value = {word!r}; e.dispatchEvent(new KeyboardEvent('keydown', {{ key: 'Enter', bubbles: true }})); return 1")
    time.sleep(0.4)


def tab(id_):
    return next((x for x in b.window()["tabs"] if x["id"] == id_), None)


b.cmd("tab.go", input="data:text/html,<title>one</title>one")
b.wait_for(lambda: b.active()["title"] == "one", what="one")
b.cmd("tab.new", url="data:text/html,<title>two</title>two")
b.wait_for(lambda: b.active()["title"] == "two", what="two")
two = b.active()["id"]
time.sleep(0.5)

# Off, as it comes: a click on the tab you're on edits its address.
click(f".row[data-tab='{two}']")
t.ok(b.window().get("tabEdit") and field() is None, "off (the default): a click on the tab you're on opens its address, no name to type over")
k.js("document.activeElement && document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return 1")
time.sleep(0.4)
b.wait_for(lambda: not b.window().get("tabEdit"), within=3, what="the address put away")

# On: its name to type over, in its row.
setting("tabs.clickRenames", True)
t.ok(b.state()["prefs"].get("tabs.clickRenames") is True, "Settings › Tabs › Double click to rename turns on")
click(f".row[data-tab='{two}']")
got = field()
t.ok(got and got[0] == "two" and got[1] == 0 and got[2] == 3 and got[3], f"on: a click on the tab you're on opens its name, picked whole, to type over ({got})")
t.ok(not b.window().get("tabEdit"), "…not its address")
name_it("Second")
t.ok(tab(two).get("name") == "Second", "Enter names the tab, as Rename does")
t.ok(k.js(f"return document.querySelector(\".row[data-tab='{two}'] .title\").textContent") == "Second", "…and the row says its new name")

# Across the top, the same.
setting("tabs.layout", "top")
time.sleep(0.4)
click(f".strip-tab[data-tab='{two}']")
got = field()
t.ok(got and got[0] == "Second" and got[3], f"across the top: the name typed over in the tab ({got})")
k.js("document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return 1")
time.sleep(0.4)
t.ok(field() is None and tab(two).get("name") == "Second", "Escape leaves the name as it was")
setting("tabs.layout", "left")

# Settings: the address-only switch hides while it is on; neither with icons only.
sid = b.cmd("tab.open", url="oriel://settings/tabs", foreground=True)
b.wait_for(lambda: b.active() and b.active().get("internal") == "settings", what="settings")
time.sleep(1.0)
applies = lambda k_: b.ev(sid, f"window.__settings ? window.__settings.applies({k_!r}) : null")
t.ok(applies("tabs.clickRenames") is True and applies("tabs.clickAddressOnly") is False,
     f"on: Double click to rename shows, Clicking the tab you're on edits its address only hides ({applies('tabs.clickRenames')}, {applies('tabs.clickAddressOnly')})")
setting("tabs.clickRenames", False)
time.sleep(0.5)
t.ok(applies("tabs.clickAddressOnly") is True, "off: the address-only switch is back")
setting("tabs.clickRenames", True)
setting("tabs.layout", "icons")
time.sleep(0.5)
t.ok(applies("tabs.clickRenames") is False and applies("tabs.clickAddressOnly") is True, "icons only: no title to type over, the switch doesn't apply")
b.cmd("tab.close", id=sid)
time.sleep(0.4)
b.cmd("tab.select", id=two)
time.sleep(0.4)
r = k.rect(f".tile[data-tab='{two}']")
b.mouse(r["x"] + r["w"] / 2, r["y"] + r["h"] / 2, clicks=2)
time.sleep(0.5)
t.ok(field() is None, "in the column of icons a click still never opens a name to type over")
setting("tabs.layout", "left")
t.done()

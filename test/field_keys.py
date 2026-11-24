#!/usr/bin/env python3
"""The shortcuts on Windows (studio/03 §4.3, §4.4, §13; studio/01 §1.43):
letters by character, digits and punctuation by the key's place, AltGr never
a shortcut, the whole Command.all table with no Ctrl+Alt and no Windows key
taken, Settings' changes kept as differences, page first except the keys
Search keeps, and the keys themselves doing what they say."""
import sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b

b.use("field-keys")
b.launch()
t = b.T()


def chord(key, code, **mods):
    return b.call({"do": "field.chord", "key": key, "code": code, **mods})


def k(key, *mods, to="page"):
    b.call({"do": "field.key", "key": key, "modifiers": list(mods), "to": to})


def same(got, want, what):
    t.ok(got == want, f"{what}: {got!r}" + ("" if got == want else f" (want {want!r})"))


# §4.3 reading a key
same(chord("t", "KeyT", ctrl=True)["name"], "Ctrl+T", "a letter by its character")
same(chord("a", "KeyQ", ctrl=True)["name"], "Ctrl+A", "AZERTY: the key that types A is Ctrl+A")
same(chord("е", "KeyT", ctrl=True)["name"], "Ctrl+T", "Russian layout: by the key's Latin place")
same(chord("&", "Digit1", ctrl=True)["first"], "tab.1", "AZERTY top row: Ctrl+1 by the key's place")
same(chord("é", "Digit2", alt=True)["first"], "spaces.2", "Alt+2 by place: Space 2")
same(chord("3", "Numpad3", ctrl=True)["name"], "Ctrl+3", "the keypad's digits too")
same(chord("[", "BracketLeft", ctrl=True, alt=True)["name"], None, "Italian AltGr+è types [: never a shortcut")
same(chord("ł", "KeyL", ctrl=True, alt=True)["name"], None, "Polish AltGr+L types ł: never a shortcut")
same(chord("€", "KeyE", altGraph=True)["name"], None, "AltGraph reported by the page: never")
same(chord("è", "BracketLeft", ctrl=True)["later"], "tabs.back", "Italian Ctrl+è: the [ key's place, Back")
same(chord("+", "BracketRight", ctrl=True)["later"], "view.zoomIn", "Italian Ctrl++ is zoom, not Forward")
same(chord("+", "BracketRight", ctrl=True)["name"], "Ctrl++", "Italian Ctrl++ reads as +")
same(chord("}", "BracketRight", ctrl=True, shift=True)["first"], "tabs.next", "Ctrl+Shift+] by place: Next Tab")
same(chord("PageDown", "PageDown", ctrl=True)["first"], "tabs.next", "Ctrl+PageDown: Next Tab")
same(chord("PageUp", "PageUp", ctrl=True)["first"], "tabs.previous", "Ctrl+PageUp: Previous Tab")
same(chord("F4", "F4", ctrl=True)["first"], "file.closeTab", "Ctrl+F4: Close Tab")
same(chord("F4", "F4", alt=True)["first"], "window.close", "Alt+F4: the window closes")
same(chord("F5", "F5")["later"], "view.reload", "F5: Reload")
same(chord("F5", "F5", ctrl=True)["later"], "view.reloadOrigin", "Ctrl+F5: Reload From Origin")
same(chord("d", "KeyD", alt=True)["first"], "file.openAddress", "Alt+D: Open Address")
same(chord("F6", "F6")["first"], "file.openAddress", "F6: Open Address")
same(chord("ArrowLeft", "ArrowLeft", alt=True)["later"], "tabs.back", "Alt+Left: Back")
same(chord("Tab", "Tab", ctrl=True)["first"], "tabs.recent", "Ctrl+Tab")
same(chord("k", "KeyK", ctrl=True)["first"], "tabs.search", "Ctrl+K: Search Tabs, before the page")
same(chord("f", "KeyF", ctrl=True)["later"], "edit.find", "Ctrl+F: Find, after the page")
same(chord("Escape", "Escape")["first"], "escape", "Escape: Search's chain first")
same(chord("Escape", "Escape")["later"], "stop", "Escape left by the page: stop loading")
same(chord("Control", "ControlLeft", ctrl=True)["name"], None, "a modifier alone is no shortcut")

# the table: every command of Command.all, no Ctrl+Alt, nothing Windows keeps
table = b.call({"do": "field.keys"})["bindings"]
ids = {x["id"] for x in table}
mac = ["app.settings", "app.welcome", "app.passwords", "file.newWindow", "file.newTab", "file.newPrivateTab", "file.reopen",
       "file.openAddress", "file.openFile", "file.closeTab", "file.closeWindow", "file.import", "file.share", "file.savePage",
       "file.exportPDF", "file.print", "file.stopAgent", "edit.pasteMatchStyle", "edit.find", "edit.findNext", "edit.findPrevious",
       "edit.copyCleanLink", "view.sidebar", "view.fold", "view.foldGroups", "view.unfoldGroups", "view.reload", "view.reloadOrigin",
       "view.reader", "view.float", "view.sitePanel", "view.dusk", "view.duskPause", "view.summarize", "view.ask", "view.capture",
       "view.hide", "view.hidden", "view.style", "view.zoomIn", "view.zoomOut", "view.actualSize", "view.inspector", "view.console",
       "view.inspect", "tabs.back", "tabs.forward", "tabs.next", "tabs.recent", "tabs.previous", "tabs.search", "tabs.split",
       "tabs.focusLeftPane", "tabs.focusRightPane", "tabs.focusOtherPane", "tabs.swapSplit", "tabs.separateSplit", "tabs.pin",
       "tabs.pinRow", "tabs.rename", "tabs.duplicate", "tabs.copyAddress", "tabs.copyMarkdown", "tabs.pasteAndGo", "tabs.closeOthers",
       "tabs.mute", "bookmarks.add", "bookmarks.show", "bookmarks.bar", "history.show", "history.downloads", "history.archive",
       "history.clearData", "history.clear", "spaces.next", "spaces.previous", "profiles.next", "profiles.previous"] \
    + [f"spaces.{n}" for n in range(1, 10)] + [f"profiles.{n}" for n in range(1, 10)]
missing = [x for x in mac if x not in ids]
t.ok(not missing, f"every command of Command.all is in the table ({len(mac)}): missing {missing}")
keys = [(x["id"], key, x["phase"]) for x in table for key in x["keys"]]
bad = [(i, key) for i, key, _ in keys if "Ctrl+Alt" in key or "Ctrl+Shift+Alt" in key]
t.ok(not bad, f"no Ctrl+Alt anywhere (AltGr): {bad}")
taken = {"Ctrl+C", "Ctrl+V", "Ctrl+X", "Ctrl+A", "Ctrl+Z", "Ctrl+Y", "Ctrl+Shift+Z", "Alt+Tab", "Alt+Escape", "Alt+Space",
         "Ctrl+Escape", "Ctrl+Shift+Escape", "F10", "Tab", "Shift+Tab"}
bad = [(i, key) for i, key, _ in keys if key in taken]
t.ok(not bad, f"none of the keys Windows keeps: {bad}")
seen, twice = {}, []
for i, key, phase in keys:
    if (key, phase) in seen:
        twice.append((key, seen[(key, phase)], i))
    seen[(key, phase)] = i
t.ok(not twice, f"no key twice in the same phase: {twice}")
same(next(x for x in table if x["id"] == "history.show")["keys"], ["Ctrl+H"], "Show History on Ctrl+H, never Ctrl+Y (Redo)")
same(next(x for x in table if x["id"] == "history.downloads")["keys"], ["Ctrl+J"], "Downloads on Ctrl+J, as Chrome")
same(next(x for x in table if x["id"] == "view.reader")["keys"], ["Ctrl+Shift+R"], "Reading Mode keeps Ctrl+Shift+R")
same(next(x for x in table if x["id"] == "view.fold")["phase"], "later", "Ctrl+S is the page's first (Docs keeps it)")
live = {x["id"] for x in table if x["live"]}
t.ok({"file.newTab", "file.closeTab", "file.openAddress", "tabs.search", "edit.find", "view.reload"} <= live, "the keys with a command now are live")
# Reading Mode (pages/reader.ts, settings area C) and History (Settings) have their commands now.
t.ok({"view.reader", "history.show"} <= live, "Reading Mode and History are live now that their modules made them")

# Settings' changes are differences: a key moved, a key taken off
b.cmd("prefs.set", key="shortcuts", value={"edit.find": {"keys": ["Ctrl+Shift+F"]}})
same(chord("F", "KeyF", ctrl=True, shift=True)["later"], "edit.find", "a key given in Settings works")
same(chord("f", "KeyF", ctrl=True)["later"], None, "the old one goes back to the page")
b.cmd("prefs.set", key="shortcuts", value={"edit.find": {"keys": None}})
same(chord("F", "KeyF", ctrl=True, shift=True)["later"], None, "a key taken off a command")
b.cmd("prefs.set", key="shortcuts", value={})

# the keys at work
b.cmd("field.commit", text="data:text/html,<title>one</title><script>window.keys=[];document.addEventListener('keydown',e=>{keys.push(e.key);if(e.key==='k'||e.key==='s')e.preventDefault()})</script>")
b.wait_for(lambda: b.active()["title"] == "one", what="page one")
one = b.active()["id"]
time.sleep(0.3)

n = len(b.window()["tabs"])
k("T", "control")
b.wait_for(lambda: len(b.window()["tabs"]) == n + 1 and b.active()["empty"], what="Ctrl+T")
t.ok(b.window()["field"]["mode"] == "blank", "Ctrl+T from the page: a new blank tab, its field")
k("T", "control", "isautorepeat", to="ui")
time.sleep(0.3)
t.ok(len(b.window()["tabs"]) == n + 1, "Ctrl+T held down makes no more")
k("W", "control", to="ui")
b.wait_for(lambda: len(b.window()["tabs"]) == n, what="Ctrl+W")
t.ok(b.active()["id"] == one, "Ctrl+W closes the tab")

k("K", "control")
time.sleep(0.4)
t.ok(b.window()["field"]["mode"] == "switcher", "Ctrl+K is Search's even on a page that uses it")
t.ok("k" not in (b.ev(one, "window.keys") or []), "...and the page never sees it")
k("Escape", to="overlay")
k("Escape", to="overlay")
time.sleep(0.3)
k("L", "control")
b.wait_for(lambda: b.window()["field"]["open"], what="Ctrl+L")
k("W", "control", to="overlay")
time.sleep(0.3)
t.ok(not b.window()["field"]["open"] and b.active()["id"] == one, "Ctrl+W with the field up puts the field away, the page stays")

folded = b.window()["sidebar"]["folded"]
k("S", "control")
time.sleep(0.4)
t.ok(b.window()["sidebar"]["folded"] == folded, f"a page that uses Ctrl+S keeps it: {b.ev(one, 'JSON.stringify(window.keys)')}")
b.ev(one, "window.keys = []")

b.cmd("tab.new", url="data:text/html,<title>two</title>")
b.wait_for(lambda: b.active()["title"] == "two", what="page two")
two = b.active()["id"]
k("1", "control")
b.wait_for(lambda: b.window()["activeID"] == b.window()["tabs"][0]["id"], what="Ctrl+1")
t.ok(True, "Ctrl+1: the first tab")
k("9", "control")
b.wait_for(lambda: b.window()["activeID"] == b.window()["tabs"][-1]["id"], what="Ctrl+9")
t.ok(True, "Ctrl+9: the last tab")
k("PageUp", "control")
b.wait_for(lambda: b.window()["activeID"] == b.window()["tabs"][-2]["id"], what="Ctrl+PageUp")
t.ok(True, "Ctrl+PageUp: the tab before")
k("F4", "control")
b.wait_for(lambda: all(x["id"] != one for x in b.window()["tabs"]), what="Ctrl+F4")
t.ok(True, "Ctrl+F4 closes the tab")

t.done()

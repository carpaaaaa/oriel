#!/usr/bin/env python3
"""Pins (studio/01 §6.1-§6.12, §6.18, §6.19, §6.24-§6.26, §6.51): the
letter, the place, put down at home, the same in every window, rows and
folders, every space; pins.json and pin-folders.json as the Mac writes them.
Ports pins_home.py, put_down_back.py, shared_pins.py and pin_tiers.py where
they apply."""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b  # noqa: E402
import tabs_kit as k  # noqa: E402

t = b.T()
k.world("tabs-pins", **{"pins.list": True, "pins.folders": True})
k.launch()

a = k.cmd("tab.open", url="http://www.alpha.localhost:1/", foreground=False)
x = k.page("x")
k.cmd("tab.pin", id=x); k.settle(0.3)
s = k.st()
pin = k.win(s)["pins"][0]
t.ok(pin["letter"] == "1", "the letter from the host's first character (127.0.0.1 → 1)")
t.ok(k.tabs(s)[0]["id"] == x and pin["tabID"] == x, "pinned: first in the row, the same tab")
k.cmd("tab.pin", id=a); k.settle(0.3)
s = k.st()
p2 = next(p for p in k.win(s)["pins"] if p["tabID"] == a)
t.ok(p2["letter"] == "A", "the letter from the host without www. (alpha → A)")
t.ok([p["tabID"] for p in k.win(s)["pins"]] == [x, a], "a square after the squares, in the order pinned")
pins = k.read("pins.json")
space = "00000000-0000-0000-0000-000000000001"
t.ok(pins and list(pins.keys()) == [space] and [p["letter"] for p in pins[space]] == [pin["letter"], "A"], "pins.json: the space's pins under its UUID")
t.ok(set(pins[space][0].keys()) <= {"id", "letter", "home", "title", "name", "listed", "folder", "pair", "titled"}
     and pins[space][0]["id"] == pins[space][0]["id"].upper(), "PinDef keys as the Mac's, UUIDs in capitals")
k.cmd("tab.unpin", id=a); k.settle(0.3)

# Put down at home (§6.7, §6.8, pins_home.py, put_down_back.py)
b.ev(x, f"location.href = '{k.url('x2')}'; true")
b.wait_for(lambda: k.tab(x)["title"] == "x2", what="x2")
other = k.page("other")
k.cmd("tab.select", id=x); k.settle(0.3)
k.cmd("tab.closeFront"); k.settle(0.5)
s = k.st(); px = k.tab(x, s)
t.ok(px and px["asleep"] and k.name_of(px["url"]) == "x" and not px["live"], "⌘W: put down at its home, its page let go")
t.ok(k.win(s)["activeID"] == other, "you land on the tab looked at last, not a pin")
t.ok(not px["canGoBack"], "put down, its Back goes nowhere")
k.cmd("tab.select", id=x)
b.wait_for(lambda: (y := k.tab(x)) and y["live"] and y["title"] == "x", what="pin wakes at home")
t.ok(True, "a click wakes it at its home")
b.ev(x, f"location.href = '{k.url('x3')}'; true")
b.wait_for(lambda: k.tab(x)["title"] == "x3", what="x3")
r = k.cmd("pin.home", id=k.tab(x)["pinID"])
b.wait_for(lambda: k.tab(x)["title"] == "x", what="home again")
t.ok(r == "went", "Back to Pinned Page goes home")
t.ok(k.cmd("pin.home", id=k.tab(x)["pinID"]) == "home", "already home: nothing to go to (the letter is changed instead)")

# The same in every window (§6.18)
pinID = k.tab(x)["pinID"]
b.cmd("window.new"); k.settle(1.5)
s = k.st()
w2 = s["windows"][1]
p_in_2 = [p for p in w2["pins"] if p["id"] == pinID]
t.ok(len(p_in_2) == 1, "a second window has the pin")
t2 = k.tab(p_in_2[0]["tabID"], s)
t.ok(t2 and t2["asleep"] and not t2["live"] and k.name_of(t2["url"]) == "x", "its own tab for it, asleep at the pin's home")
k.cmd("pin.letter", id=pinID, letter="q"); k.settle(0.3)
s = k.st()
t.ok(all(p["letter"] == "Q" for w in s["windows"] for p in w["pins"] if p["id"] == pinID), "a letter changed in one window is changed in every window")
y = k.page("y", i=1)
k.cmd("tab.pin", 1, id=y); k.settle(0.4)
s = k.st()
t.ok(any(p["home"] == k.url("y") for p in k.win(s, 0)["pins"]), "pinned in the second window: in the first too")
k.cmd("tab.unpin", 1, id=y); k.settle(0.4)
s = k.st()
t.ok(not any(p["home"] == k.url("y") for p in k.win(s, 0)["pins"]), "unpinned there: the first window's tab for it closes")
t.ok(k.tab(y, s) and not k.tab(y, s).get("pinID"), "and the second window keeps it as a tab")
b.call({"do": "tabs.closeWindow", "window": k.wid(1)}); k.settle(1)

# Rows and squares (§6.4, §6.5, pin_tiers.py)
r1 = k.page("r1"); k.cmd("tab.pinRow", id=r1)
r2 = k.page("r2"); k.cmd("tab.pinRow", id=r2)
sq = k.page("sq"); k.cmd("tab.pin", id=sq); k.settle(0.4)
s = k.st()
order = [p["tabID"] for p in k.win(s)["pins"]]
t.ok(order == [x, sq, r1, r2], "squares first, then rows, each in its order")
k.cmd("pin.listed", id=k.tab(sq)["pinID"], listed=True); k.settle(0.3)
order = [p["tabID"] for p in k.win()["pins"]]
t.ok(order == [x, sq, r1, r2] and k.tab(sq)["listed"], "Show as Row: to the top of the rows")
k.cmd("pin.listed", id=k.tab(r2)["pinID"], listed=False); k.settle(0.3)
order = [p["tabID"] for p in k.win()["pins"]]
t.ok(order == [x, r2, sq, r1], "Show as Square: to the end of the squares")

# Folders (§6.24-§6.26)
f1 = k.cmd("pinFolder.new", pin=k.tab(r1)["pinID"]); k.settle(0.3)
s = k.st()
t.ok(f1 and k.tab(r1, s)["pinFolder"] == f1, "New Folder from a row: the folder holds it")
t.ok(any(f["id"] == f1 and f["name"] == "New Folder" and f["open"] for f in k.win(s)["pinFolders"]), "named New Folder, open")
f2 = k.cmd("pinFolder.new", parent=f1)
f3 = k.cmd("pinFolder.new", parent=f2)
f4 = k.cmd("pinFolder.new", parent=f3)
t.ok(f2 and f3 and f4 is None, "three deep at most")
k.cmd("pinFolder.rename", id=f1, name="  Work  "); k.settle(0.2)
folders = k.read("pin-folders.json")
t.ok(folders and folders[space][0]["name"] == "Work" and set(folders[space][0]) >= {"id", "name", "collapsed"}, "pin-folders.json: the space's folders, names trimmed")
k.cmd("pin.folder", id=k.tab(sq)["pinID"], folder=f3); k.settle(0.2)
k.cmd("pinFolder.delete", id=f3); k.settle(0.3)
t.ok(k.tab(sq)["pinFolder"] == f2, "Delete Folder: what it held goes up a level")
pins = k.read("pins.json")
t.ok(any(p.get("folder") == f2 for p in pins[space]), "pins.json keeps each row's folder")
k.cmd("pinFolder.fold", id=f1); k.settle(0.2)
t.ok(any(f["id"] == f1 and not f["open"] for f in k.win()["pinFolders"]), "a folder folds")
sqid = k.tab(sq)["pinID"]
k.cmd("pin.listed", id=sqid, listed=False); k.settle(0.2)
t.ok(not k.tab(sq).get("pinFolder"), "a row made a square leaves its folder")

# Keep in Every Space (§6.19)
k.cmd("prefs.set", key="spaces", value=True)
sp = k.cmd("space.create", name="Work"); k.settle(0.6)
s = k.st()
t.ok(k.win(s)["space"] == sp and len(k.win(s)["pins"]) == 0, "a new space: no pins of its own")
first = "00000000-0000-0000-0000-000000000001"
k.cmd("space.select", id=first); k.settle(0.4)
k.cmd("pin.share", id=pinID, everywhere=True); k.settle(0.4)
k.cmd("space.select", id=sp); k.settle(0.4)
s = k.st()
t.ok([p["id"] for p in k.win(s)["pins"]] == [pinID] and k.win(s)["pins"][0].get("everywhere"), "Keep in Every Space: the pin in the other space too")
pins = k.read("pins.json")
t.ok(pins.get("shared") and pins["shared"][0]["id"] == pinID and not any(p["id"] == pinID for p in pins.get(first, [])), "pins.json: under \"shared\", out of the space's list")
k.cmd("pin.share", id=pinID, everywhere=False); k.settle(0.4)
s = k.st()
mine = k.win(s)["pins"]
t.ok([p["id"] for p in mine] == [pinID] and not mine[0].get("everywhere"), "Only in This Space: this space's own pin now")
pins = k.read("pins.json")
t.ok("shared" not in pins and pins.get(sp, [{}])[0].get("id") == pinID and not any(p["id"] == pinID for p in pins.get(first, [])), "pins.json: under this space, no \"shared\" key")
k.cmd("space.select", id=first); k.settle(0.4)
t.ok(not any(p["id"] == pinID for p in k.win()["pins"]), "and gone from the other space")

# Delete (§6.6)
k.cmd("space.select", id=first); k.settle(0.4)
sqtab = sq
k.cmd("pin.remove", id=sqid); k.settle(0.4)
s = k.st()
t.ok(not any(p["id"] == sqid for p in k.win(s)["pins"]) and k.tab(sqtab, s) is None, "Delete: unpinned and closed")
k.cmd("tab.reopen"); k.settle(0.6)
t.ok(any(k.name_of(x["url"]) == "sq" and not x.get("pinID") for x in k.tabs()), "⇧⌘T brings it back as a tab")
t.done()

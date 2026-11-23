#!/usr/bin/env python3
"""The session (studio/01 §9.1-§9.11, §9.13, §2.44): what is written, in the
Mac's keys and dates, and what comes back at launch, asleep but for the tab
in front; a file that won't read put aside; Start with a fresh window; the
other windows in windows.json. Ports fresh_window.py, spaces_quit_keep.py
and MutedTabRestoreTests where they apply."""
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b  # noqa: E402
import tabs_kit as k  # noqa: E402

FIRST = "00000000-0000-0000-0000-000000000001"
UUID = __import__("re").compile(r"^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$")
t = b.T()
k.world("tabs-session", **{"spaces": True})
k.launch()

pin = k.page("pinned"); k.cmd("tab.pin", id=pin)
a = k.page("a"); k.cmd("tab.rename", id=a, name="Named")
g1 = k.page("g1"); g2 = k.page("g2")
gid = k.cmd("group.new", ids=[g1, g2]); k.cmd("group.colour", id=gid, colour=4)
m = k.page("muted"); k.cmd("tab.mute", id=m, muted=True)
shy = k.cmd("tab.newPrivate"); b.cmd("tab.go", id=shy, input=k.url("secret")); time.sleep(0.8)
c = k.page("c")
k.cmd("tab.select", id=g2); k.settle(0.3)
work = k.cmd("space.create", name="Work"); k.settle(0.4)
w1 = k.page("w1")
k.cmd("space.select", id=FIRST); k.settle(0.4)
before = time.time()
row = [n for n in k.names() if n not in ("<blank>", "secret")]
b.call({"do": "tabs.write"})

# The file (§9.4, §9.5)
shape = k.read("session.json")
urls = [k.name_of(e["url"]) for e in shape["tabs"]]
t.ok(list(shape.keys()) == ["tabs", "active", "groups", "splits"], "session.json: tabs, active, groups, splits")
t.ok(urls == row and "secret" in k.names() and len(urls) == 6, "web pages in their order; the private and the empty tab left out")
entry = {k.name_of(e["url"]): e for e in shape["tabs"]}
t.ok(shape["active"] == urls.index("g2"), "active: the tab in front by its place")
e_pin = shape["tabs"][0]
t.ok(e_pin["pin"] == "1" and UUID.match(e_pin["pinID"]) and e_pin["home"] == k.url("pinned") and "letGo" not in e_pin, "a pin: its letter, pinID and home; no letGo")
e_a = entry["a"]
t.ok(e_a["name"] == "Named" and e_a["muted"] is False and "pin" not in e_a and "home" not in e_a, "a named tab: its name; muted always written")
t.ok(entry["muted"]["muted"] is True, "a muted tab says so")
t.ok(entry["g1"]["groupID"] == gid and shape["groups"] == [{"id": gid, "name": "Group 1", "collapsed": False, "colour": 4}], "groups: id, name, collapsed, colour")
apple_now = time.time() - k.APPLE
t.ok(all(abs(e["touched"] - apple_now) < 600 for e in shape["tabs"] if "touched" in e), "touched in seconds since 2001")
t.ok(abs(entry["g2"]["touched"] - (before - k.APPLE)) < 5, "the tab on screen is touched now")
t.ok(shape["splits"] == [], "splits always written")
t.ok(k.read(f"session-{work}.json")["tabs"][0]["url"] == k.url("w1"), "the other space in session-<UUID>.json")
wins = k.read("windows.json")
t.ok(len(wins) == 1 and wins[0]["rows"] == {} and wins[0]["space"] == FIRST and wins[0]["frame"].startswith("{{"), "windows.json: the first window's frame and space, its rows in the session files")

# Back at launch (§9.8, §9.9)
k.relaunch()
s = k.st()
t.ok(k.names(s) == row, "back: the same row")
front = k.active(s)
t.ok(front and k.name_of(front["url"]) == "g2", "the tab in front in front")
b.wait_for(lambda: (x := k.active()) and x["live"] and x["title"] == "g2", what="front wakes")
s = k.st()
t.ok(all(x["asleep"] and not x["live"] for x in k.tabs(s) if k.name_of(x["url"]) != "g2"), "every other tab asleep: no page until you go to it")
t.ok(k.by_name("a", s)["label"] == "Named" and k.by_name("muted", s)["muted"], "names and mutes come back")
t.ok(k.win(s)["groups"][0]["id"] == gid and k.win(s)["groups"][0]["colour"] == 4, "and the group")
t.ok(k.win(s)["pins"][0]["home"] == k.url("pinned"), "and the pin")
mid = k.by_name("muted")["id"]
k.cmd("tab.select", id=mid)
b.wait_for(lambda: k.tab(mid)["live"], what="muted wakes")
t.ok(k.tab(mid)["muted"], "a muted tab wakes muted (§2.19)")
k.cmd("space.select", id=work); k.settle(0.5)
t.ok(k.names() == ["w1"], "the other space's row from its file")
k.cmd("space.select", id=FIRST); k.settle(0.3)

# A pin comes back to its home (Pins keep their site, §6.8)
pid = k.by_name("pinned")["id"]
k.cmd("tab.select", id=pid)
b.wait_for(lambda: k.tab(pid)["live"] and not k.tab(pid)["loading"], what="pin awake")
b.ev(pid, f"location.href = '{k.url('elsewhere')}'; true")
b.wait_for(lambda: k.tab(pid)["title"] == "elsewhere", what="pin elsewhere")
k.cmd("tab.select", id=k.by_name("c")["id"]); k.settle(0.3)
b.call({"do": "tabs.write"})
t.ok(k.read("session.json")["tabs"][0]["url"] == k.url("elsewhere"), "the pin is written where it is")
k.relaunch()
t.ok(k.name_of(k.tabs()[0]["url"]) == "pinned", "and comes back at its home")

# A second window (§9.11)
b.cmd("window.new"); k.settle(1.2)
k.page("other1", i=1); k.page("other2", i=1)
b.call({"do": "tabs.write"})
wins = k.read("windows.json")
t.ok(len(wins) == 2 and [k.name_of(e["url"]) for e in wins[1]["rows"][FIRST]["tabs"]] == ["pinned", "other1", "other2"], "windows.json: the second window whole, its rows by space")
k.relaunch()
s = k.st()
t.ok(len(s["windows"]) == 2 and k.names(s, 1) == ["pinned", "other1", "other2"], "both windows come back, each with its row")
t.ok(s["windows"][0]["primary"] and not s["windows"][1]["primary"], "the first owns the session files")

# The first window closed: the second takes the files (§9.11)
b.call({"do": "tabs.closeWindow", "window": k.wid(0)}); k.settle(1.0)
shape = k.read("session.json")
t.ok([k.name_of(e["url"]) for e in shape["tabs"]] == ["pinned", "other1", "other2"], "the oldest window closed: the next one's row is session.json")
t.ok(k.read(f"session-{work}.json")["tabs"] == [], "and an empty row where it has none")
k.cmd("tab.reopen"); k.settle(1.5)
s = k.st()
t.ok(len(s["windows"]) == 2 and any(k.name_of(x["url"]) == "g2" for x in k.tabs(s, 1)), "⇧⌘T brings the closed window back with its tabs (§9.18)")
b.quit()

# A file that won't read is put aside, never written over (§9.3)
(b.folder() / "session.json").write_text("{ this is not json")
k.launch()
s = k.st()
aside = [p for p in k.files() if p.startswith("session.unreadable-")]
t.ok(len(aside) == 1 and k.active(s)["empty"] and all(x["empty"] or x.get("pinID") for x in k.tabs(s)), "session.json unreadable: kept as session.unreadable-<seconds>.json; the pins and an empty tab")
b.quit()
(b.folder() / "pins.json").write_text('{"' + FIRST + '": [{"id": 3}]}')
k.launch()
t.ok(any(p.startswith("pins.unreadable-") for p in k.files()), "a pins.json that makes no sense is put aside too")
b.quit()

# Start with a fresh window (§9.13, fresh_window.py)
k.world("tabs-session-fresh")
k.launch()
p2 = k.page("p"); k.cmd("tab.pin", id=p2)
n = k.page("n"); k.cmd("tab.rename", id=n, name="Keep")
x1 = k.page("x1"); x2 = k.page("x2")
gg = k.cmd("group.new", ids=[x2])
k.page("gone")
b.quit()
k.set_prefs(**{"start.fresh": True})
k.launch()
s = k.st()
t.ok([x for x in k.names(s) if x != "<blank>"] == ["p", "x2", "n"], "fresh: pins, grouped tabs and named tabs come back; the rest don't")
t.ok(k.active(s)["empty"], "and the window opens on an empty tab")
t.done()

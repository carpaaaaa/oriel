#!/usr/bin/env python3
"""Settings' area B, windows, spaces and pins (studio/08 B): each row changed,
its effect seen.
  - Same tabs in every window (tabs.mirror, §10.34-§10.36)
  - A space's colour or gradient (spaces.gradient note, §7.7)
  - The rows that say "always there": Tab groups (tabs.groups), Pins in every
    space (pins.shared), A pin's number again goes back (pins.numberBack)"""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b  # noqa: E402
import tabs_kit as k  # noqa: E402

FIRST = "00000000-0000-0000-0000-000000000001"
t = b.T()
k.world("settings-b-windows")
k.launch()

# Same tabs in every window
a = k.page("a")
b.cmd("window.new"); k.settle(1.2)
w0, w1 = k.wid(0), k.wid(1)
names = lambda i: [n for n in k.names(None, i) if n != "<blank>"]
t.ok("a" not in names(1), "off, as it comes: each window its own tabs")
k.page("only-here", i=1)
t.ok("only-here" not in names(0), "a tab opened in one isn't in the other")
k.cmd("prefs.set", key="tabs.mirror", value=True)
b.wait_for(lambda: "only-here" in names(0) and "a" in names(1), what="windows joined")
t.ok(True, "on: every window's tabs come together, nothing lost")
x = k.by_name("only-here", None, 0)
t.ok(x["asleep"] and not x["live"], "a tab from the other window comes asleep, its page this window's own")
n = k.page("new-one", i=0)
b.wait_for(lambda: "new-one" in names(1), what="opened in the other")
t.ok(names(0) == names(1), "a tab opened in one window: in the other too, in the same place")
k.cmd("tab.rename", 0, id=n, name="Named here")
b.wait_for(lambda: (y := k.by_name("new-one", None, 1)) and y.get("name") == "Named here", what="renamed")
t.ok(True, "renamed in one: so in the other")
other_a = k.by_name("a", None, 1)["id"]
k.cmd("tab.close", 1, id=other_a)
b.wait_for(lambda: "a" not in names(0), what="closed")
t.ok(len(k.win(None, 0)["ghosts"]) == 0 or all(k.name_of(g["url"]) != "a" for g in k.win(None, 0)["ghosts"]), "closed in one: gone from the other, in silence (⇧⌘T is the other window's)")
first_id = k.tabs(None, 0)[[k.name_of(x["url"]) for x in k.tabs(None, 0)].index("new-one")]["id"]
k.cmd("tab.move", 0, id=first_id, to=0)
b.wait_for(lambda: names(1)[:1] == ["new-one"], what="moved")
t.ok(names(0) == names(1), "moved in one: the same order in the other")
g = k.cmd("group.new", 0, ids=[first_id])
b.wait_for(lambda: any(gr["id"] == g for gr in k.win(None, 1)["groups"]), what="grouped")
t.ok(k.by_name("new-one", None, 1).get("groupID") == g, "grouped in one: the group in the other, open")
k.cmd("group.fold", 1, id=g, folded=True); time.sleep(0.6)
t.ok(not next(gr for gr in k.win(None, 0)["groups"] if gr["id"] == g)["folded"], "folding a group is each window's own")
b.call({"do": "tabs.write"})
t.ok(all(e.get("twinID") for e in k.read("session.json")["tabs"] if not e.get("pin")), "the session keeps each tab's twinID while it is on")
k.cmd("prefs.set", key="tabs.mirror", value=False)
k.page("after-off", i=0); time.sleep(0.8)
t.ok("after-off" not in names(1), "off again: each window keeps what it has, and goes its own way")
b.call({"do": "tabs.write"})
t.ok(not any(e.get("twinID") for e in k.read("session.json")["tabs"]), "and no twinID in the file")
b.call({"do": "tabs.closeWindow", "window": w1}); k.settle(1)

# A space's colour or gradient
k.cmd("prefs.set", key="spaces", value=True)
k.cmd("space.gradient", id=FIRST, preset="Lagoon"); time.sleep(0.4)
sp = next(s for s in k.read("spaces.json") if s["id"] == FIRST)
t.ok(sp.get("gradient") == {"colours": ["#00B7A8", "#53A3F2"], "angle": 135}, "Colour… › Gradient: Lagoon, the Mac's own colours")
k.cmd("space.strength", id=FIRST, strength="vivid"); time.sleep(0.3)
t.ok(next(s for s in k.read("spaces.json") if s["id"] == FIRST).get("strength") == "vivid", "Strength: Vivid")
k.cmd("space.strength", id=FIRST, strength="subtle"); time.sleep(0.3)
t.ok("strength" not in next(s for s in k.read("spaces.json") if s["id"] == FIRST), "Subtle, written as none")
k.cmd("space.colour", id=FIRST, colour=2); time.sleep(0.3)
sp = next(s for s in k.read("spaces.json") if s["id"] == FIRST)
t.ok(sp["colour"] == 2 and "gradient" not in sp, "a colour takes the gradient's place")
t.ok(k.st()["spaces"][0]["colour"] == 2, "the window wears it")

# Always there: tab groups, pins in every space, a pin's number again
gg = k.cmd("group.new", ids=[k.page("grouped")])
t.ok(gg and k.win()["groups"][-1]["name"].startswith("Group"), "Tab groups: always there (Move to Group › New Group)")
p = k.page("pinned"); k.cmd("tab.pin", id=p)
work = k.cmd("space.create", name="Work"); k.settle(0.4)
k.cmd("space.select", id=FIRST); k.settle(0.3)
k.cmd("pin.share", id=k.tab(p)["pinID"], everywhere=True)
k.cmd("space.select", id=work); k.settle(0.4)
t.ok(any(x.get("everywhere") for x in k.win()["pins"]), "Pins in every space: always there with spaces (Keep in Every Space)")
k.cmd("space.select", id=FIRST); k.settle(0.3)
before = k.page("before")
k.cmd("tab.nth", n=1); k.settle(0.3)
t.ok(k.active()["pinID"], "Ctrl+1: the pin")
k.cmd("tab.nth", n=1); k.settle(0.3)
t.ok(k.win()["activeID"] == before, "A pin's number again goes back: always there")
t.done()

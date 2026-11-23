#!/usr/bin/env python3
"""Spaces (studio/01 §7.1-§7.15, §7.26, §7.31): on and off, made, named,
coloured, ordered, deleted; each with its row; signed in where the first is
or with cookies of its own; Move to Space; spaces.json as the Mac writes it.
Ports space_landing.py, space_delete.py, space_order.py and group_to_space.py
where they apply."""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b  # noqa: E402
import tabs_kit as k  # noqa: E402

FIRST = "00000000-0000-0000-0000-000000000001"
t = b.T()
k.world("tabs-spaces")
k.launch()



def cpage(name):
    """A page whose title is its cookies."""
    id = k.page(name, wait=False)
    b.wait_for(lambda: (x := k.tab(id)) and x["title"] and x["title"] != name and not x["loading"], what=name)
    return id


s = k.st()
t.ok([x["id"] for x in s["spaces"]] == [FIRST] and s["spaces"][0]["name"] == "Personal" and not s["spacesOn"], "spaces off: one space, Personal, the first id")
k.cmd("prefs.set", key="spaces", value=True); k.settle(0.3)
a = k.page("a")
b.ev(a, "document.cookie = 'who=me; max-age=3600'; true")
work = k.cmd("space.create", name="  Work  "); k.settle(0.5)
s = k.st()
sp = next(x for x in s["spaces"] if x["id"] == work)
t.ok(sp["name"] == "Work" and sp["colour"] == 0 and sp["sharesSignIns"] is True and sp["icon"], "New space: named, no colour, signed in, an icon nobody wears")
t.ok(k.win(s)["space"] == work and len(k.tabs(s)) == 1 and k.tabs(s)[0]["empty"], "you go to it: an empty tab")
t.ok([x["id"] for x in s["spaces"]] == [FIRST, work], "at the end of the list")
c1 = cpage("cookie1")
t.ok(k.tab(c1)["title"] == "who=me", "signed in: the first space's cookies")
home = k.cmd("space.create", name="Home", signedOut=True, icon="house"); k.settle(0.5)
c2 = cpage("cookie2")
t.ok(k.tab(c2)["title"] == "none", "signed out: cookies of its own, starting from none")
b.ev(c2, "document.cookie = 'who=home; max-age=3600'; true")
k.cmd("space.select", id=FIRST); k.settle(0.4)
c3 = cpage("cookie3")
t.ok(k.tab(c3)["title"] == "who=me", "and they stay its own")

# Each space keeps its row and the tab in front (§7.14, space_landing.py)
k.cmd("tab.select", id=a); k.settle(0.2)
k.cmd("space.select", id=work); k.settle(0.4)
s = k.st()
t.ok(k.win(s)["activeID"] == c1 and [n for n in k.names(s) if n != "<blank>"] == ["cookie1"], "back in Work: its own row, its tab in front")
k.cmd("space.select", id=FIRST); k.settle(0.4)
t.ok(k.win()["activeID"] == a, "back in Personal: a, where you were")
k.cmd("space.colour", id=work, colour=1); k.cmd("space.icon", id=work, icon="terminal"); k.cmd("space.rename", id=work, name="Job")
k.settle(0.3)
spaces = k.read("spaces.json")
w = next(x for x in spaces if x["id"] == work)
t.ok(w == {"id": work, "name": "Job", "colour": 1, "icon": "terminal", "sharesSignIns": True}, "spaces.json: the Mac's keys, nothing more")
h = next(x for x in spaces if x["id"] == home)
t.ok(h["sharesSignIns"] is False and spaces[0]["id"] == FIRST and "icon" not in spaces[0], "a signed-out space says so; Personal as it always was")

# Move Left / Move Right (§7.10)
k.cmd("space.order", id=home, by=-1); k.settle(0.2)
t.ok([x["id"] for x in k.st()["spaces"]] == [FIRST, home, work], "Move Left")
k.cmd("space.order", id=FIRST, by=1); k.settle(0.2)
t.ok([x["id"] for x in k.read("spaces.json")] == [home, FIRST, work], "the first space moves too, and the file keeps the order")

# Move to Space (§7.31, group_to_space.py)
m = k.page("moving")
b.ev(m, f"location.href = '{k.url('moving2')}'; true")
b.wait_for(lambda: k.tab(m)["title"] == "moving2", what="moving2")
time.sleep(0.5)
k.cmd("tab.toSpace", ids=[m], space=work); k.settle(0.5)
s = k.st()
t.ok(k.win(s)["space"] == FIRST and m not in [x["id"] for x in k.tabs(s)], "Move to Space: the tab goes, you stay")
t.ok(m in [x["id"] for x in k.win(s)["rows"][work]["tabs"]], "it is at the end of Work's row")
k.cmd("tab.toSpace", ids=[c3], space=home); k.settle(0.5)
k.cmd("space.select", id=home); k.settle(0.4)
k.cmd("tab.select", id=c3)
b.wait_for(lambda: (x := k.tab(c3)) and x["live"] and not x["loading"], what="c3 in Home")
b.ev(c3, "location.reload(); true"); time.sleep(1.2)
t.ok(k.tab(c3)["title"] == "who=home", "moved to a space with other cookies: it reopens with that space's")
g1 = k.page("g1"); g2 = k.page("g2")
gid = k.cmd("group.new", ids=[g1, g2]); k.cmd("group.rename", id=gid, name="Pack"); k.settle(0.3)
k.cmd("group.toSpace", id=gid, space=work); k.settle(0.5)
s = k.st()
t.ok(not any(x["id"] == gid for x in k.win(s)["groups"]), "Move Group to Space: gone from here")
k.cmd("space.select", id=work); k.settle(0.4)
s = k.st()
gg = next((x for x in k.win(s)["groups"] if x["id"] == gid), None)
t.ok(gg and gg["name"] == "Pack" and [k.name_of(x["url"]) for x in k.tabs(s) if x.get("groupID") == gid] == ["g1", "g2"], "the same group there, its tabs in order")

# Sessions per space (§9.10)
b.call({"do": "tabs.write"})
t.ok(k.read(f"session-{work}.json") and any(e["url"] == k.url("moving2") for e in k.read(f"session-{work}.json")["tabs"]), "each space its own session-<UUID>.json")

# Delete (§7.9, space_delete.py): the space on screen, its file, its pins
k.cmd("tab.pin", id=g1); k.settle(0.3)
k.cmd("space.delete", id=work); k.settle(0.5)
s = k.st()
t.ok(work not in [x["id"] for x in s["spaces"]] and k.win(s)["space"] != work, "Delete: the space goes, the window to another")
t.ok(not (b.folder() / f"session-{work}.json").exists(), "its session file goes")
t.ok(work not in (k.read("pins.json") or {}), "its pins go")
k.cmd("space.delete", id=FIRST); k.settle(0.5)
s = k.st()
t.ok([x["id"] for x in s["spaces"]] == [home] and s["homeSpace"] == home, "the first space can go too: the next is home")
t.ok(k.read("session.json") == {"tabs": [], "active": 0, "splits": []}, "its session.json emptied, not removed")
t.ok(k.read("profiles.json")[0]["home"] == home, "profiles.json says where home is now")
t.ok(not k.cmd("space.delete", id=home) and len(k.st()["spaces"]) == 1, "the last space stays")

# Spaces off: back home, the others' tabs let go, their files kept (§7.1)
other = k.cmd("space.create", name="Other"); k.settle(0.4)
k.page("kept")
k.cmd("prefs.set", key="spaces", value=False); k.settle(0.5)
s = k.st()
t.ok(k.win(s)["space"] == home and other not in k.win(s)["rows"], "spaces off: home, the other rows let go")
t.ok(any(e["url"] == k.url("kept") for e in k.read(f"session-{other}.json")["tabs"]), "their files kept")
k.cmd("prefs.set", key="spaces", value=True); k.settle(0.3)
k.cmd("space.select", id=other); k.settle(0.5)
t.ok(k.names() == ["kept"], "on again: the row comes back from its file")
t.done()

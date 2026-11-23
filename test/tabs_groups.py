#!/usr/bin/env python3
"""Tab groups (studio/01 §6.34-§6.41, §6.50) and the keys over the row:
⌘1-⌘9 with pins and folded groups (§3.22), next and previous (§3.24), the
⌃Tab switcher (§3.25-§3.27). Ports close_in_group.py and close_group.py
where they apply."""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b  # noqa: E402
import tabs_kit as k  # noqa: E402

t = b.T()
k.world("tabs-groups")
k.launch()

loose1 = k.page("loose1")
g1 = k.page("g1"); g2 = k.page("g2"); g3 = k.page("g3")
loose2 = k.page("loose2")
p = k.page("p"); k.cmd("tab.pin", id=p); k.settle(0.3)
gid = k.cmd("group.new", ids=[g1, g2]); k.settle(0.3)
s = k.st()
grp = k.win(s)["groups"][0]
t.ok(grp["id"] == gid and grp["name"] == "Group 1" and not grp["folded"] and grp["colour"] == 0, "Move to Group › New Group: \"Group 1\", open, no colour")
t.ok(k.names(s)[:3] == ["p", "g1", "g2"], "the row: pins, then the group's tabs, then the rest")
k.cmd("tab.group", ids=[g3], group=gid); k.settle(0.3)
t.ok(k.names()[:4] == ["p", "g1", "g2", "g3"], "moved into the group: at its end")
gid2 = k.cmd("group.new", ids=[loose2]); k.settle(0.3)
s = k.st()
t.ok(k.win(s)["groups"][1]["name"] == "Group 2" and k.names(s)[:5] == ["p", "g1", "g2", "g3", "loose2"], "a second group, after the first")
t.ok(k.cmd("group.new", ids=[p]) is None and len(k.win()["groups"]) == 2, "a pin can't be in a group: none made")
k.cmd("group.rename", id=gid, name="  Reading  ")
k.cmd("group.rename", id=gid, name="   ")
k.cmd("group.colour", id=gid, colour=3); k.settle(0.3)
grp = k.win()["groups"][0]
t.ok(grp["name"] == "Reading" and grp["colour"] == 3, "renamed (trimmed, empty ignored), coloured Orange")

# ⌘1-⌘9 (§3.22, §6.50)
k.cmd("tab.select", id=loose1); k.settle(0.2)
targets = k.win()["targets"]
t.ok(targets[:4] == [p, g1, g2, g3], "⌘1-⌘9: the pin, then the open group's tabs")
k.cmd("tab.nth", n=2); k.settle(0.2)
t.ok(k.win()["activeID"] == g1, "⌘2: the group's first tab")
k.cmd("tab.nth", n=9); k.settle(0.2)
t.ok(k.win()["activeID"] == targets[-1], "⌘9: the last place")
k.cmd("tab.select", id=g2); k.settle(0.2)
k.cmd("group.fold", id=gid); k.settle(0.2)
s = k.st()
t.ok(k.win(s)["groups"][0]["folded"] and k.win(s)["targets"].count(g2) == 1 and g1 not in k.win(s)["targets"], "a folded group is one place: its tab in front")
k.cmd("tab.nth", n=1); k.settle(0.2)
k.cmd("tab.nth", n=1); k.settle(0.2)
t.ok(k.win()["activeID"] == g2, "a pin's number again goes back to the tab before")
k.cmd("tab.select", id=loose1); k.settle(0.2)
k.cmd("tab.step", by=-1); k.settle(0.2)
t.ok(k.win()["activeID"] != g3 and k.win()["activeID"] != g1, "Previous Tab skips the tabs folded away")
k.cmd("tab.select", id=g1); k.settle(0.2)
t.ok(not k.win()["groups"][0]["folded"], "going to a tab in a folded group opens it")

# Put away, then closed (§6.39, close_in_group.py)
k.cmd("tab.select", id=g3); k.settle(0.2)
k.cmd("tab.close", id=g3); k.settle(0.3)
x = k.tab(g3)
t.ok(x and x["asleep"] and x.get("groupID") == gid, "the cross on a grouped page puts it away")
k.cmd("tab.closeOthers", id=loose1); k.settle(0.5)
s = k.st()
t.ok(not any(x.get("groupID") == gid for x in k.tabs(s)), "Close Other Tabs closes a group's tabs for good")
t.ok(not any(g["id"] == gid for g in k.win(s)["groups"]), "and the group with its last tab")

# Close Group and back (§6.40, close_group.py)
a1 = k.page("a1"); a2 = k.page("a2")
ga = k.cmd("group.new", ids=[a1, a2]); k.cmd("group.rename", id=ga, name="Trip"); k.cmd("group.colour", id=ga, colour=2)
k.settle(0.3)
k.cmd("group.close", id=ga); k.settle(0.5)
s = k.st()
t.ok(not any(g["id"] == ga for g in k.win(s)["groups"]) and k.win(s)["reopenTitle"] == "Reopen Closed Group", "Close Group: gone, ⇧⌘T says Reopen Closed Group")
k.cmd("tab.reopen"); k.settle(0.6)
s = k.st()
g = next((g for g in k.win(s)["groups"] if g["id"] == ga), None)
t.ok(g and g["name"] == "Trip" and g["colour"] == 2 and not g["folded"], "⇧⌘T: the group back, named and coloured as it was, open")
t.ok([k.name_of(x["url"]) for x in k.tabs(s) if x.get("groupID") == ga] == ["a1", "a2"], "with its tabs in order")

# Ungroup, Remove from Group (§6.41): let go of, for the closing that counts time
k.cmd("tab.group", ids=[k.by_name("a1")["id"]], group=None); k.settle(0.3)
x = k.by_name("a1")
t.ok(not x.get("groupID") and x.get("letGo"), "Remove from Group: out, let go of now")
k.cmd("group.ungroup", id=ga); k.settle(0.3)
s = k.st()
t.ok(not any(g["id"] == ga for g in k.win(s)["groups"]) and not k.by_name("a2", s).get("groupID"), "Ungroup Tabs: the group goes, the tabs stay")

# New Tab in Group (§6.45)
gb = k.cmd("group.new", ids=[k.by_name("a2")["id"]]); k.settle(0.2)
nt = k.cmd("group.newTab", id=gb); k.settle(0.3)
x = k.tab(nt)
t.ok(x["empty"] and x.get("groupID") == gb and k.win()["activeID"] == nt, "New Tab in Group: an empty tab at the group's end, in front")
blank = k.cmd("tab.new"); k.settle(0.2)
t.ok(blank != nt and not k.tab(blank).get("groupID"), "⌘T never reuses an empty tab in a group")

# The session keeps the groups (§9.4)
b.call({"do": "tabs.write"})
shape = k.read("session.json")
t.ok(shape["groups"] and shape["groups"][0]["id"] == gb and set(shape["groups"][0]) >= {"id", "name", "collapsed"}, "session.json: groups with id, name, collapsed")
t.ok(any(e.get("groupID") == gb for e in shape["tabs"]), "and each grouped tab's groupID")

# ⌃Tab (§3.25-§3.27)
for x in [x["id"] for x in k.tabs() if not x.get("pinID")]:
    k.cmd("tab.close", id=x)
s1 = k.page("s1"); s2 = k.page("s2"); s3 = k.page("s3")
k.cmd("tab.select", id=s1); k.settle(0.2)
k.cmd("tab.switch", by=1); k.settle(0.2)
sw = k.win()["switcher"]
t.ok(sw and sw["cards"][0] == s1 and sw["cards"][sw["index"]] == s3 and k.win()["activeID"] == s1, "⌃Tab: the cards, the one before picked, nothing changed yet")
k.cmd("tab.switchEnd"); k.settle(0.2)
t.ok(k.win()["activeID"] == s3 and k.win()["switcher"] is None, "⌃ let go: back to the tab before")
k.cmd("tab.switch", by=1); k.cmd("tab.switchEnd"); k.settle(0.2)
t.ok(k.win()["activeID"] == s1, "a quick ⌃Tab again: and back again")
k.cmd("tab.switch", by=1); k.cmd("tab.switch", by=1)
k.cmd("tab.switchEnd", cancel=True); k.settle(0.2)
t.ok(k.win()["activeID"] == s1, "cancelled: where it was")
t.done()

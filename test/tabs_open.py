#!/usr/bin/env python3
"""Opening tabs and where they go (studio/01 §3.1-§3.3, §3.7, §3.31, §3.39,
§3.42), picking several and closing them as one (§3.16-§3.19), ⇧⌘T
(§9.15-§9.17). Ports the Mac's new_tab_end.py, link_place.py and
close_picked.py, where they apply."""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b  # noqa: E402
import tabs_kit as k  # noqa: E402

t = b.T()
k.world("tabs-open")
k.launch()

# ⌘T reuses the empty tab (§3.1)
s = k.st()
t.ok(len(k.tabs(s)) == 1 and k.tabs(s)[0]["empty"] and k.tabs(s)[0]["label"] == "New Tab", "a window starts on an empty tab, 'New Tab'")
a = k.page("a")
blank1 = k.cmd("tab.new")
blank2 = k.cmd("tab.new")
s = k.st()
t.ok(sum(1 for x in k.tabs(s) if x["empty"]) == 1 and blank1 == blank2, "⌘T twice: one empty tab, reused")
t.ok(k.names(s)[-1] == "<blank>" and k.win(s)["activeID"] == blank1, "⌘T's tab at the end, in front")

# Where new tabs go: After current (§3.2)
for x in [x["id"] for x in k.tabs()]:
    if x != a:
        k.cmd("tab.close", id=x)
bb = k.page("b"); c = k.page("c")
k.cmd("tab.select", id=a); k.settle(0.2)
d = k.page("d")
t.ok(k.names() == ["a", "d", "b", "c"], "a page opened in front goes after the tab you're on (After current)")
dup = k.cmd("tab.duplicate", id=bb); k.settle(0.6)
s = k.st()
t.ok(k.names(s)[:4] == ["a", "d", "b", "b"] and k.win(s)["activeID"] == dup and k.tab(dup)["url"] == k.url("b"), "Duplicate: the same address after it, in front (§3.42)")

# Links opened behind: after their page, in click order (§3.31, link_place.py)
for x in [x["id"] for x in k.tabs()]:
    if x not in (a, bb):
        k.cmd("tab.close", id=x)
k.settle(0.3)
k.cmd("tab.select", id=a); k.settle(0.2)
l1 = k.cmd("tab.new", url=k.url("l1"), after=a, background=True)
l2 = k.cmd("tab.new", url=k.url("l2"), after=a, background=True)
l3 = k.cmd("tab.new", url=k.url("l3"), after=a, background=True)
k.settle(0.8)
s = k.st()
t.ok(k.names(s) == ["a", "l1", "l2", "l3", "b"], "three links opened behind: after the page, in the order clicked")
t.ok(k.win(s)["activeID"] == a, "the page stays in front")
t.ok(all(k.tab(x)["live"] for x in (l1, l2, l3)), "and they load behind (Load background tabs when you go to them off)")
o = k.win(s)["switcherOrder"]
t.ok(o[0] == a and o.index(l3) <= 2 and o.index(l3) < o.index(l2) < o.index(l1), "⌃Tab: the page, the tab left last, then the links opened behind, newest first")
k.cmd("tab.select", id=bb); k.settle(0.2); k.cmd("tab.select", id=a); k.settle(0.2)
l4 = k.cmd("tab.new", url=k.url("l4"), after=a, background=True); k.settle(0.3)
t.ok(k.names()[1] == "l4", "after going to another tab the run starts again right after the page")

# Load background tabs when you go to them (§3.39)
k.cmd("prefs.set", key="tabs.lazy", value=True)
lz = k.cmd("tab.new", url=k.url("lazy"), after=a, background=True); k.settle(0.6)
x = k.tab(lz)
t.ok(x["asleep"] and not x["live"] and k.name_of(x["url"]) == "lazy", "with tabs.lazy a link behind waits, asleep, with its address")
k.cmd("tab.select", id=lz)
b.wait_for(lambda: (y := k.tab(lz)) and y["live"] and y["title"] == "lazy", what="lazy tab wakes")
t.ok(True, "and loads when you go to it")
k.cmd("prefs.set", key="tabs.lazy", value=False)

# Top and Bottom (§3.2)
k.cmd("prefs.set", key="tabs.newPlace", value="top")
k.cmd("tab.select", id=bb); k.settle(0.2)
top = k.page("top")
t.ok(k.names()[0] == "top", "Top: a page in front goes first")
k.cmd("prefs.set", key="tabs.newPlace", value="end")
k.cmd("tab.select", id=a); k.settle(0.2)
end = k.page("end")
t.ok(k.names()[-1] == "end", "Bottom: at the end")
k.cmd("prefs.set", key="tabs.newPlace", value="next")

# Private tabs (§3.7, §2.35)
p1 = k.cmd("tab.newPrivate")
p2 = k.cmd("tab.newPrivate")
s = k.st()
t.ok(p1 == p2 and k.tab(p1)["shy"] and sum(1 for x in k.tabs(s) if x.get("shy") and x["empty"]) == 1, "⇧⌘N twice: one empty private tab")
b.cmd("tab.go", id=p1, input=k.url("secret"))
b.wait_for(lambda: k.tab(p1)["title"] == "secret", what="private page")
store = k.tab(p1)["store"]
blank = k.cmd("tab.new"); k.settle(0.3)
t.ok(k.tab(blank)["shy"] and k.tab(blank)["store"] != store, "⌘T from a private tab: private too, its own store")
link = k.cmd("tab.new", url=k.url("secret2"), after=p1, background=True); k.settle(0.8)
t.ok(k.tab(link)["shy"] and k.tab(link)["store"] == store, "a link from a private tab: private, in the same store")
ghosts = len(k.win()["ghosts"])
k.cmd("tab.close", id=link); k.settle(0.3)
t.ok(len(k.win()["ghosts"]) == ghosts, "a private tab closed isn't remembered for ⇧⌘T")
visits = [v["url"] for v in b.call({"do": "tabs.visits"})["visits"]]
t.ok(k.url("a") in visits and k.url("secret") not in visits and k.url("secret2") not in visits, "visits go to History (data.recordVisit), never a private tab's")
for x in (p1, blank):
    k.cmd("tab.close", id=x)

# Picked tabs (§3.18-§3.19, close_picked.py)
for x in [x["id"] for x in k.tabs()]:
    k.cmd("tab.close", id=x)
k.settle(0.3)
a = k.page("a"); bb = k.page("b"); c = k.page("c"); d = k.page("d"); e = k.page("e")
k.cmd("tab.select", id=bb); k.settle(0.2)
before = k.names()
k.cmd("tab.pick", id=c, mode="toggle")
k.cmd("tab.pick", id=e, mode="toggle")
s = k.st()
t.ok(sorted(k.win(s)["picked"]) == sorted([bb, c, e]), "⌘-click c and e with b in front: b, c and e picked")
k.cmd("tab.closeFront"); k.settle()
s = k.st(); ids = [x["id"] for x in k.tabs(s)]
t.ok(not any(x in ids for x in (bb, c, e)) and a in ids and d in ids, "⌘W: b, c and e closed, a and d stay")
t.ok(k.win(s)["activeID"] in (a, d) and k.win(s)["picked"] == [], "off the closed tabs; nothing picked")
t.ok(k.win(s)["reopenTitle"] == "Reopen 3 Closed Tabs", "⇧⌘T offers all three as one")
k.cmd("tab.reopen"); k.settle(0.8)
s = k.st()
t.ok(k.names(s) == before, "⇧⌘T: all three back where they were")
t.ok(k.name_of(k.active(s)["url"]) == "b", "the one in front is in front again")
# Reopened tabs are new tabs: their ids are new.
a, bb, c = (k.by_name(n)["id"] for n in ("a", "b", "c"))
k.cmd("tab.select", id=c); k.settle(0.2)
k.cmd("tab.pick", id=a, mode="toggle"); k.cmd("tab.pick", id=bb, mode="toggle"); k.cmd("tab.pick", id=c, mode="toggle")
k.settle(0.2)
cur = [x["id"] for x in k.tabs()]
picked = k.win()["picked"]
t.ok(len(picked) == 2 and k.active()["id"] not in picked, "⌘-clicking the tab in front again lets it go")
k.cmd("tab.closeFront"); k.settle()
s = k.st()
t.ok(len(k.tabs(s)) == len(cur) - 2 and k.name_of(k.active(s)["url"]) == "c", "the picked close, the one in front stays")
k.cmd("tab.pick", id=k.tabs()[0]["id"], mode="toggle")
k.cmd("tab.pick", id=k.tabs()[-1]["id"], mode="addRange")
k.settle(0.2)
t.ok(len(k.win()["picked"]) == len(k.tabs()), "⇧-click: the whole range")
k.cmd("tab.closeFront"); k.settle()
s = k.st()
t.ok(len(k.tabs(s)) == 1 and k.tabs(s)[0]["empty"], "every tab picked and closed: one new tab left")

# Close Other Tabs, Close Tabs Below (§3.16-§3.17)
k.cmd("tab.reopen"); k.settle(0.6)
for n in ("f", "g", "h"):
    k.page(n)
pin = k.page("pinned"); k.cmd("tab.pin", id=pin); k.settle(0.3)
f = k.by_name("f")["id"]
k.cmd("tab.closeOthers", id=f); k.settle()
s = k.st()
t.ok([n for n in k.names(s) if n != "<blank>"] == ["pinned", "f"], "Close Other Tabs: the pin stays (put down), the others go")
t.ok(k.tab(pin)["asleep"], "the pin is put down")
t.ok(all(not g.get("batch") for g in k.win(s)["ghosts"][-3:]) and k.win(s)["reopenTitle"] == "Reopen Closed Tab", "one ⇧⌘T step per tab, not a block")
for n in ("i", "j", "k"):
    k.page(n)
k.cmd("tab.select", id=f); k.settle(0.2)
k.cmd("tab.closeBelow", id=f); k.settle()
s = k.st()
t.ok(k.names(s) == ["pinned", "f"], "Close Tabs Below: every tab under it, never a pin")
t.ok(k.win(s)["reopenTitle"] == "Reopen 3 Closed Tabs", "remembered as one")
k.cmd("tab.reopen"); k.settle(0.6)
t.ok(k.names() == ["pinned", "f", "i", "j", "k"], "⇧⌘T: all of them back, in order")
t.ok(all(x["asleep"] for x in k.tabs() if k.name_of(x["url"]) in ("i", "j", "k")), "back asleep, as last session's tabs are")

# ⇧⌘T with its history (§9.15, reopen_history.py)
h = k.page("h1")
b.ev(h, f"location.href = '{k.url('h2')}'; true")
b.wait_for(lambda: k.tab(h)["title"] == "h2", what="h2")
b.ev(h, f"location.href = '{k.url('long3')}'; true")
b.wait_for(lambda: k.tab(h)["title"] == "long3" and not k.tab(h)["loading"], what="long3")
time.sleep(0.4)
b.ev(h, "scrollTo(0, 4000); true"); time.sleep(1.5)
k.cmd("tab.close", id=h); k.settle(0.4)
back = k.cmd("tab.reopen")
b.wait_for(lambda: (x := k.tab(back)) and x["live"] and x["title"] == "long3" and not x["loading"], what="reopened")
time.sleep(0.6)
t.ok(b.ev(back, "history.length") == 3, "⇧⌘T: the tab comes back with its history")
t.ok(abs(b.ev(back, "Math.round(scrollY)") - 4000) < 5, "and where it was scrolled to")
t.ok(k.tab(back)["canGoBack"], "Back is there")
t.done()

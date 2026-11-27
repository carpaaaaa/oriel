#!/usr/bin/env python3
"""Closing beside pins, as Search 1.0.22 does (Browser.close, leave,
tabBefore; LastTabNewTabTests, close_blank_beside_sleeping.py, TabCloseTests,
PinSplitTests):
 - the last tab that isn't a pin closed: a new, empty tab, not a pin;
 - an empty tab closed over a pin still open (Ctrl+T, then Ctrl+W): back to
   that pin, the window stays (#1577);
 - the new tab left by putting the last pin down, with only pins put down
   beside it: Ctrl+W closes the window (#1480);
 - Closing a tab goes back to the one before: Ctrl+W on a new tab doesn't go
   back to a pin put down when the only other tab is asleep; it lands on the
   sleeping tab, and the pin stays down (#1656);
 - a pin, or a pin in a split, put down in the background keeps you on the
   tab you were looking at (#1624)."""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b  # noqa: E402
import tabs_kit as k  # noqa: E402

t = b.T()


def loose(s=None):
    return [x["id"] for x in k.tabs(s) if not x.get("pinID")]


def only(*keep):
    for id in loose():
        if id not in keep:
            k.cmd("tab.close", id=id)
    k.settle(0.3)


k.world("tabs-close-last")
k.launch()
t.ok(b.state()["prefs"].get("tabs.newAfterLast") is not False, "Leave a new tab when the last tab closes: on, as it comes")

# The last page beside a pin: a new tab.
p = k.page("p")
k.cmd("tab.pin", id=p)
a = k.page("a")
only(a)
k.cmd("tab.closeFront"); k.settle()
now = k.active()
t.ok(now and now["empty"] and not now.get("pinID"), "the last tab that isn't a pin closed: a new, empty tab, not the pin")

# Ctrl+T over a pin still open, then Ctrl+W: back to that pin, the window stays.
k.cmd("tab.select", id=p); k.settle(0.4)
t.ok(not k.tab(p)["asleep"], "the pin is open")
only()
k.cmd("tab.blank"); k.settle(0.4)
blank = k.active()
t.ok(blank and blank["empty"] and loose() == [blank["id"]], "Ctrl+T: an empty tab, the pin the only other tab")
k.cmd("tab.closeFront"); k.settle(0.6)
s = b.state()
t.ok(len(s["windows"]) == 1 and k.win()["activeID"] == p, f"Ctrl+W on it goes back to the pin, the window stays ({len(s['windows'])} windows, on {k.active() and k.active().get('label')})")
t.ok(blank["id"] not in [x["id"] for x in k.tabs()], "…the empty tab gone")

# Background pins: put down where you aren't, you stay where you are.
q = k.page("q")
k.cmd("tab.pin", id=q)
c = k.page("c")
k.cmd("tab.select", id=p); k.settle(0.2)
k.cmd("tab.select", id=c); k.settle(0.3)
t.ok(not k.tab(q)["asleep"] and not k.tab(p)["asleep"], "two pins open, c in front")
k.cmd("tab.close", id=q); k.settle(0.5)
t.ok(k.win()["activeID"] == c and k.tab(q)["asleep"], "a pin put down in the background: still on c, the pin down")

# A pin in a split, put down from beside it: the other page stays in front, the split goes.
k.cmd("tab.select", id=p); k.settle(0.3)
k.cmd("split.toggle"); k.settle(0.5)
w = k.win()
split = next((x for x in w["splits"] if p in x["tabs"]), None)
partner = next((x for x in split["tabs"] if x != p), None) if split else None
t.ok(split and w["activeID"] == partner, f"the pin in a split, the page beside it in front ({split})")
k.cmd("tab.close", id=p); k.settle(0.5)
w = k.win()
t.ok(w["activeID"] == partner and k.tab(p)["asleep"], "the pin put down from beside it: the page beside it stays in front")
t.ok(not any(p in x["tabs"] for x in w["splits"]), "…and the pin is out of the split, not a sleeping half of it")
b.quit()

# Closing a tab goes back to the one before (#1656): the pin put down stays down.
k.world("tabs-close-last-back", **{"tabs.closeGoesBack": True})
k.launch()
p = k.page("p")
k.cmd("tab.pin", id=p)
a = k.page("a")
only(a)
k.cmd("tab.select", id=p); k.settle(0.3)
k.cmd("tab.putToSleep", id=a); k.settle(0.6)
t.ok(k.tab(a)["asleep"], "a, the only other tab, put to sleep")
k.cmd("tab.closeFront"); k.settle(0.6)
blank = k.active()
t.ok(k.tab(p)["asleep"] and blank and blank["empty"], "Ctrl+W on the pin: put down, a new tab in front")
k.cmd("tab.closeFront"); k.settle(0.6)
t.ok(k.win()["activeID"] == a, f"Ctrl+W on the new tab lands on the sleeping tab ({k.active() and k.active().get('label')})")
t.ok(k.tab(p)["asleep"], "…and the pin stays down")
b.quit()

# The new tab left by putting the last pin down, only pins put down beside it: Ctrl+W closes its window (#1480).
k.world("tabs-close-last-window")
k.launch()
b.cmd("window.new"); k.settle(1.5)
t.ok(len(b.state()["windows"]) == 2, "a second window")
second = k.wid(1)
p = k.page("p", 1)
k.cmd("tab.pin", 1, id=p)
for id in [x["id"] for x in k.tabs(None, 1) if not x.get("pinID")]:
    k.cmd("tab.close", 1, id=id)
k.settle(0.4)
k.cmd("tab.select", 1, id=p); k.settle(0.3)
k.cmd("tab.closeFront", 1); k.settle(0.6)
w = next(x for x in k.st()["windows"] if x["id"] == second)
t.ok(any(x["id"] == p and x["asleep"] for x in w["tabs"]) and next(x for x in w["tabs"] if x["id"] == w["activeID"])["empty"], "the pin put down: a new tab beside it")
b.cmd("tab.closeFront", window=second); k.settle(1.0)
t.ok(all(x["id"] != second for x in k.st()["windows"]), "Ctrl+W on that new tab closes the window, as the only tab does")
t.done()

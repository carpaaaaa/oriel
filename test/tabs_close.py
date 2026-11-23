#!/usr/bin/env python3
"""Closing tabs and where you land (studio/01 §3.10-§3.14, §6.7, §6.39).
Ports the Mac's Tests/close_last_tab.py and close_opened_link.py, and the
cases of TabCloseTests: the neighbour, the tab before, the opener."""
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
    k.settle(0.2)


# close_last_tab.py: Leave a new tab when the last tab closes (§3.13)
k.world("tabs-close", **{"tabs.newAfterLast": True})
k.launch()
a = k.page("a"); p = k.page("p")
k.cmd("tab.pin", id=a); k.cmd("tab.pin", id=p)
bb = k.page("b")
only(bb)
s = k.st()
pins = [x["id"] for x in k.tabs(s) if x.get("pinID")]
t.ok(sorted(pins) == sorted([a, p]) and loose(s) == [bb] and k.win(s)["activeID"] == bb, "two pins, and b the one tab beside them, on screen")

k.cmd("tab.closeFront")
k.settle()
s = k.st(); now = k.active(s)
t.ok(now is not None and not now.get("pinID") and now["empty"], "⌘W on the last tab beside pins: a new tab, not a pin")
t.ok(sorted(x["id"] for x in k.tabs(s) if x.get("pinID")) == sorted([a, p]), "the pins are still there")
t.ok(bb not in [x["id"] for x in k.tabs(s)], "b is gone")
k.cmd("tab.reopen"); k.settle(0.8)
t.ok(k.name_of(k.active()["url"]) == "b", "⇧⌘T brings b back, on screen")

c = k.page("c")
only(c)
k.cmd("tab.select", id=a); k.settle(0.3)
k.cmd("tab.close", id=c); k.settle()
t.ok(k.win()["activeID"] == a, "closed behind a pin, the pin on screen stays")

d = k.page("d"); e = k.page("e")
only(d, e)
k.cmd("tab.select", id=d)
k.cmd("tab.close", id=d); k.settle()
s = k.st()
t.ok(k.win(s)["activeID"] == e and loose(s) == [e], "another tab left: it is picked, no new tab made")
b.quit()

# The switch off, as it comes: a pin is picked.
k.world("tabs-close-off")
k.launch()
a = k.page("a"); k.cmd("tab.pin", id=a)
bb = k.page("b")
only(bb)
k.cmd("tab.close", id=bb); k.settle()
t.ok(k.win()["activeID"] == a, "switch off: the pin is picked, as before")

# The only tab (§3.12): a page leaves an empty tab; ⌘W on that closes the window.
for x in [x["id"] for x in k.tabs()]:
    if k.tab(x) and k.tab(x).get("pinID"):
        k.cmd("tab.unpin", id=x)
only()
s = k.st()
t.ok(len(k.tabs(s)) == 1, "one tab left")
only_id = k.tabs(s)[0]["id"]
if not k.tabs(s)[0]["empty"]:
    k.cmd("tab.close", id=only_id); k.settle()
s = k.st()
t.ok(len(k.tabs(s)) == 1 and k.tabs(s)[0]["empty"], "the last page closed: an empty tab in its place")
b.cmd("window.new"); k.settle(1.5)
t.ok(len(k.st()["windows"]) == 2, "a second window")
first = k.wid(0)
b.cmd("tab.closeFront", window=first); k.settle(1.0)
s = k.st()
t.ok(len(s["windows"]) == 1 and s["windows"][0]["id"] != first, "⌘W on the last empty tab closes its window")
b.quit()

# Where you land (§3.14): the neighbour; the tab before with the switch; the opener.
k.world("tabs-close-land")
k.launch()
a = k.page("a"); bb = k.page("b"); c = k.page("c"); d = k.page("d")
k.cmd("tab.select", id=bb); k.settle(0.2)
k.cmd("tab.close", id=bb); k.settle()
t.ok(k.name_of(k.active()["url"]) == "c", "off: the neighbour below")
k.cmd("tab.select", id=d); k.settle(0.2)
k.cmd("tab.close", id=d); k.settle()
t.ok(k.name_of(k.active()["url"]) == "c", "the last one closed: the one above it")
k.cmd("prefs.set", key="tabs.closeGoesBack", value=True)
e = k.page("e"); f = k.page("f")
k.cmd("tab.select", id=a); k.settle(0.2)
k.cmd("tab.select", id=f); k.settle(0.2)
k.cmd("tab.close", id=f); k.settle()
t.ok(k.name_of(k.active()["url"]) == "a", "on: back to the tab viewed before")
k.cmd("prefs.set", key="tabs.closeGoesBack", value=False)

# close_opened_link.py: a page opened by a link in front goes back to its page.
k.cmd("tab.select", id=a); k.settle(0.3)
b.ev(a, f"window.open('{k.url('opened')}'); true")
b.wait_for(lambda: (x := k.active()) and k.name_of(x["url"]) == "opened", what="the opened page")
s = k.st()
opened = k.active(s)
t.ok(k.names(s)[-1] == "opened" and opened.get("opener") == a, "window.open: at the end of the row, a's page its opener")
k.cmd("tab.close", id=opened["id"]); k.settle()
t.ok(k.name_of(k.active()["url"]) == "a", "closing it lands on the page that opened it")
b.ev(a, f"window.open('{k.url('opened2')}'); true")
b.wait_for(lambda: (x := k.active()) and k.name_of(x["url"]) == "opened2", what="opened2")
o2 = k.active()["id"]
k.cmd("tab.select", id=c); k.settle(0.2); k.cmd("tab.select", id=o2); k.settle(0.2)
k.cmd("tab.close", id=o2); k.settle()
t.ok(k.name_of(k.active()["url"]) == "e", "after going to another tab, closing it lands beside it as before")

# Internal pages go back whatever the switch says.
k.cmd("tab.select", id=c); k.settle(0.2)
h = k.cmd("tab.open", url="oriel://history", foreground=True); k.settle(0.3)
x = k.tab(h)
t.ok(x and x.get("internal") == "history" and x["label"] == "History", "oriel://history is History")
k.cmd("tab.close", id=h); k.settle()
t.ok(k.name_of(k.active()["url"]) == "c", "closing one of Oriel's own pages goes back")

# A grouped tab is put away, then closed (§6.39); a pin is put down (§6.7).
g1 = k.page("g1"); g2 = k.page("g2")
gid = k.cmd("group.new", ids=[g1, g2]); k.settle()
k.cmd("tab.select", id=g2); k.settle(0.3)
k.cmd("tab.closeFront"); k.settle()
x = k.tab(g2)
t.ok(x and x["asleep"] and x.get("resting") and x.get("groupID") == gid, "⌘W on a grouped page: put away, still in its group")
t.ok(k.win()["activeID"] != g2, "and off it")
k.cmd("tab.close", id=g2); k.settle()
t.ok(k.tab(g2) is None, "asked again: closed for good")
k.cmd("prefs.set", key="pins.home", value=True)
pp = k.page("home1")
k.cmd("tab.pin", id=pp); k.settle()
b.ev(pp, f"location.href = '{k.url('away')}'; true")
b.wait_for(lambda: k.name_of(k.tab(pp)["url"]) == "away", what="pin wandered")
k.cmd("tab.closeFront"); k.settle()
x = k.tab(pp)
t.ok(x and x["asleep"] and k.name_of(x["url"]) == "home1" and not x["live"], "⌘W on a pin: put down at its home, its page let go")
t.ok(k.win()["activeID"] != pp and not k.active().get("pinID"), "and you land on a tab that isn't a pin")
t.done()

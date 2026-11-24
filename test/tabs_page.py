#!/usr/bin/env python3
"""The tab and its page (studio/01 §2.4-§2.40) and sleep (§9.22-§9.26):
labels, a page that didn't load and Try again, a page whose process died,
mute before the first sound, Oriel's own pages, the visits History gets, and
tabs that sleep or stay awake. Ports CrashLoopTests, CrashCountTests,
MutedTabRestoreTests, PinSleepTests and memory_close.py where they apply."""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b  # noqa: E402
import tabs_kit as k  # noqa: E402

t = b.T()
k.world("tabs-page", **{"sleep.after": 600})
k.launch()

# Labels (§2.8)
u = k.page("untitled", wait=False)
b.wait_for(lambda: not k.tab(u)["loading"] and k.tab(u)["url"].endswith("/untitled"), what="untitled")
time.sleep(0.4)
x = k.tab(u)
t.ok(x["title"] == "" and x["label"] == k.BASE.split("//")[1] + "/untitled", "no <title>: the address, without the scheme")
k.cmd("tab.rename", id=u, name="Mine"); k.settle(0.2)
t.ok(k.tab(u)["label"] == "Mine", "a name wins over everything")
b.ev(u, f"location.href = '{k.url('next')}'; true")
b.wait_for(lambda: k.tab(u)["title"] == "next", what="next")
t.ok(k.tab(u)["label"] == "Mine", "and stays across pages")
k.cmd("tab.rename", id=u, name=None); k.settle(0.2)
t.ok(k.tab(u)["label"] == "next" and k.tab(u).get("letGo"), "the name taken away: the title, and the tab let go of")

# A page that didn't load (§2.33)
import socket
with socket.socket() as sock:
    sock.bind(("127.0.0.1", 0))
    closed = sock.getsockname()[1]
r = k.cmd("tab.open", url=f"http://127.0.0.1:{closed}/", foreground=True)
b.wait_for(lambda: k.tab(r).get("error"), what="refused")
t.ok(k.tab(r)["error"]["description"] == "The site refused the connection.", "refused: The site refused the connection.")
n = k.cmd("tab.open", url="http://no-such-host.invalid/", foreground=True)
b.wait_for(lambda: k.tab(n).get("error"), within=20, what="no host")
t.ok(k.tab(n)["error"]["description"] == "No site at that address.", "no host: No site at that address.")
k.cmd("tab.tryAgain", id=n); k.settle(0.2)
b.wait_for(lambda: k.tab(n).get("error"), within=20, what="no host again")
t.ok(True, "Try again asks again")
b.cmd("tab.go", id=n, input=k.url("fine"))
b.wait_for(lambda: k.tab(n)["title"] == "fine", what="fine")
t.ok(not k.tab(n).get("error"), "a page that arrives clears the message")

# A page whose process died (§2.32)
cr = k.page("crash")
b.call({"do": "tabs.crash", "id": cr})
b.wait_for(lambda: (x := k.tab(cr)) and x["title"] == "crash" and not x["loading"] and len(x.get("crashes", [])) == 1, what="reloaded")
t.ok(not k.tab(cr).get("dead"), "died on screen: asked for again at once")
behind = k.page("behind")
k.cmd("tab.select", id=cr); k.settle(0.4)
b.call({"do": "tabs.crash", "id": behind}); time.sleep(1)
t.ok(k.tab(behind).get("stale"), "died behind: marked, nothing loaded")
k.cmd("tab.select", id=behind)
b.wait_for(lambda: (x := k.tab(behind)) and not x.get("stale") and x["title"] == "behind" and not x["loading"], what="revived")
t.ok(True, "and asked for again when you go back to it")
k.cmd("tab.select", id=cr); k.settle(0.3)
for i in range(2):
    b.call({"do": "tabs.crash", "id": cr})
    time.sleep(1.5)
x = k.tab(cr)
t.ok(x.get("dead") and x["error"]["description"] == "This page kept crashing.", "a third death within the minute: This page kept crashing.")
k.cmd("tab.tryAgain", id=cr)
b.wait_for(lambda: (x := k.tab(cr)) and not x.get("dead") and x["title"] == "crash" and not x["loading"], what="try again")
t.ok(not k.tab(cr).get("error"), "Try again asks for the address again")

# Mute (§2.19, MutedTabRestoreTests)
mu = k.page("mute")
k.cmd("tab.mute", id=mu, muted=True); k.settle(0.2)
t.ok(b.call({"do": "eval", "id": mu, "js": "true"}) and k.tab(mu)["muted"], "Mute Tab")
k.cmd("tab.select", id=cr); k.settle(0.3)
b.cmd("tab.sleep", id=mu); k.settle(0.3)
k.cmd("tab.mute", id=mu, muted=False); k.cmd("tab.mute", id=mu, muted=True); k.settle(0.2)
t.ok(k.tab(mu)["asleep"] and not k.tab(mu)["live"], "muting an asleep tab doesn't wake it")

# Oriel's own pages (§2.10)
s1 = k.cmd("tab.open", url="oriel://settings/privacy", foreground=True); k.settle(0.3)
s2 = k.cmd("tab.open", url="oriel://settings", foreground=True); k.settle(0.3)
x = k.tab(s1)
t.ok(s1 == s2 and x["internal"] == "settings" and x["label"] == "Settings", "one Settings tab, however often asked")
t.ok(k.cmd("tab.open", url="search://history", foreground=True) and k.active()["url"].rstrip("/") == "oriel://history", "a Mac's search:// page is Oriel's own")  # loaded, Chromium writes oriel://history/

# History (§2.8: every main-frame visit goes to the data module)
v = [x["url"] for x in b.call({"do": "tabs.visits"})["visits"]]
t.ok(k.url("next") in v and k.url("crash") in v and not any(x.startswith("oriel:") for x in v), "visits handed to data.recordVisit; Oriel's own pages aren't")

# Sleep (§9.22-§9.26, memory_close.py, PinSleepTests)
for x in [x["id"] for x in k.tabs()]:
    k.cmd("tab.close", id=x)
k.settle(0.5)
z1 = k.page("z1"); z2 = k.page("z2"); z3 = k.page("form1"); z4 = k.page("z4"); pz = k.page("pz")
k.cmd("tab.pin", id=pz)
front = k.page("front")
for x in (z1, z2, z3, z4, pz):
    b.call({"do": "tabs.age", "id": x, "seconds": 3600})
b.ev(z3, "document.getElementById('t').value = 'half a letter'; true")
b.call({"do": "tabs.fake", "id": z4, "patch": {"audible": True}})
slept = b.call({"do": "tabs.tidy"})["slept"]
s = k.st()
t.ok(z1 in slept and z2 in slept and k.tab(z1, s)["asleep"] and not k.tab(z1, s)["live"], "tabs left for an hour sleep: no page in memory")
t.ok(slept.index(z1) < slept.index(z2), "the longest left first, one at a time")
t.ok(z3 not in slept and b.call({"do": "tabs.sleep", "id": z3})["reason"] == "holding something typed", "something typed keeps a tab awake")
t.ok(z4 not in slept and b.call({"do": "tabs.awake", "id": z4})["reason"] == "playing sound", "sound keeps a tab awake")
t.ok(pz not in slept and b.call({"do": "tabs.awake", "id": pz})["reason"] == "pinned", "a pin in the space on screen stays awake")
t.ok(b.call({"do": "tabs.awake", "id": front})["reason"] == "on screen", "the tab in front stays awake")
b.call({"do": "tabs.fake", "id": z4, "patch": {"audible": False, "capturing": True}})
t.ok(b.call({"do": "tabs.awake", "id": z4})["reason"] == "on a call", "camera or microphone keeps it awake")
b.call({"do": "tabs.fake", "id": z4, "patch": {"capturing": False}})
r = k.cmd("tab.putToSleep", id=z4)
t.ok(r == {"asleep": True}, "Put to Sleep")
r = k.cmd("tab.putToSleep", id=front)
t.ok(r == {"asleep": False, "awake": "Stays awake: on screen"}, "Put to Sleep on the tab in front: Stays awake: on screen")
fresh = k.page("fresh")
k.cmd("tab.select", id=front); k.settle(0.2)
t.ok(fresh not in b.call({"do": "tabs.tidy"})["slept"], "a tab just left doesn't sleep before its time")
k.cmd("prefs.set", key="tabs.sleep", value=False)
b.call({"do": "tabs.age", "id": fresh, "seconds": 3600})
t.ok(b.call({"do": "tabs.tidy"})["slept"] == [], "Never: nothing sleeps")
k.cmd("prefs.set", key="tabs.sleep", value=True)
k.cmd("tab.select", id=z1)
b.wait_for(lambda: (x := k.tab(z1)) and x["live"] and x["title"] == "z1" and not x["loading"], what="z1 wakes")
t.ok(not k.tab(z1)["asleep"], "an asleep tab wakes when you go to it")
t.done()

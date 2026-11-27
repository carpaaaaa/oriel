#!/usr/bin/env python3
"""A site that couldn't be found for a moment loads by itself (Search 1.0.22,
DNSRetry.swift; Tests/dns_retry.py): the page says "Couldn't find this site.
Trying again…" and asks again after 1 and 3 seconds; a tab out of sight waits
until it is picked; a network change tries at once; a POST, and an address
typed with no scheme to a site never visited, are not tried again and say
"Couldn't find this site." with the hint; going elsewhere stops the tries;
after the third try it gives up. Bench `field.dnsfail` makes the next loads
of a host fail as a lookup does, before anything is asked of the network."""
import sys
import time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b  # noqa: E402
import settings_c_web as web  # noqa: E402

TRYING = "Couldn't find this site. Trying again…"
GAVE_UP = "Couldn't find this site.\nCheck the address or your connection."
HOST = "127.0.0.1"

server, P = web.start(tls=False)
for name in ("hello", "behind", "network", "known", "formpage", "far", "elsewhere", "late"):
    web.PAGES["/" + name] = f"<title>{name}</title><body>{name}"
BASE = f"http://{HOST}:{P}"

b.use("field-dnsretry")
b.launch()
t = b.T()


def tab(id):
    return next(x for x in b.state()["tabs"] if x["id"] == id)


def said(id):
    return (tab(id).get("error") or {}).get("description", "")


def tries(id):
    return b.call({"do": "field.dnstab", "id": id})


def fail(host, times):
    return b.call({"do": "field.dnsfail", "host": host, "times": times})["left"]


def left(host):
    return b.call({"do": "field.dnsfail"})["left"].get(host)


def until(check, within):
    end = time.time() + within
    while time.time() < end:
        got = check()
        if got:
            return got
        time.sleep(0.1)
    return check()


def front():
    id = b.cmd("tab.new", url=f"{BASE}/hello")
    b.wait_for(lambda: tab(id)["title"] == "hello" and not tab(id)["loading"], within=20, what="a page in front")
    return id


# 1. In sight: two failed lookups, then the site is there.
id = front()
fail(HOST, 2)
start = time.time()
b.cmd("tab.go", id=id, input=f"{BASE}/network?first")
first = until(lambda: said(id), 4)
t.ok(first == TRYING, f"says it is trying again ({first!r})")
t.ok(tab(id)["url"] == f"{BASE}/network?first", f"the field has the address that failed ({tab(id)['url']})")
after1 = until(lambda: tries(id)["tries"] >= 1 and tries(id), 3)
took = time.time() - start
t.ok(after1 and 0.7 < took < 2.5, f"the first try about a second later ({took:.1f} s)")
loaded = until(lambda: tab(id)["title"] == "network" and not tab(id).get("error") and tab(id), 8)
took = time.time() - start
t.ok(bool(loaded), "the page arrived by itself")
t.ok(tries(id)["tries"] == 2 and 3.5 < took < 7, f"after the second try, 1 s then 3 s ({tries(id)['tries']} tries, {took:.1f} s)")
t.ok(tries(id)["pending"] is False, "nothing left pending")

# 2. Out of sight: no try until the tab is looked at.
fail(HOST, 1)
bg = b.cmd("tab.open", url=f"{BASE}/behind", foreground=False)
until(lambda: said(bg), 5)
time.sleep(2.5)
x = tries(bg)
t.ok(said(bg) == TRYING and x["tries"] == 0 and x["pending"], f"a tab behind waits, untried ({said(bg)!r}, {x})")
b.cmd("tab.select", id=bg)
shown = until(lambda: tab(bg)["title"] == "behind" and tab(bg), 5)
t.ok(bool(shown) and not tab(bg).get("error") and tries(bg)["tries"] == 1, f"it loads once picked ({tab(bg)['title']!r}, {tries(bg)})")

# 3. A network change tries at once, not a second later.
id = front()
fail(HOST, 1)
b.cmd("tab.go", id=id, input=f"{BASE}/network")
until(lambda: said(id), 4)
start = time.time()
b.call({"do": "field.dnsfail", "network": True})
net = until(lambda: tab(id)["title"] == "network" and tab(id), 3)
t.ok(bool(net) and time.time() - start < 0.8, f"a network change: loaded at once ({time.time() - start:.2f} s)")

# 4. A POST is never sent again.
id = front()
b.cmd("tab.go", id=id, input=f"http://localhost:{P}/formpage")
b.wait_for(lambda: tab(id)["title"] == "formpage", within=20, what="the form's page")
b.ev(id, f"document.body.innerHTML = \"<form method=post action='{BASE}/posted'><input name=a value=1></form>\"; 1")
fail(HOST, 5)
b.ev(id, "document.forms[0].submit(); 1")
until(lambda: said(id), 4)
time.sleep(2.5)
x = tries(id)
t.ok(said(id) == GAVE_UP and x["tries"] == 0 and not x["pending"], f"a POST: given up at once, with the hint ({said(id)!r}, {x})")
t.ok(left(HOST) == 4, f"a POST: asked for once only ({left(HOST)} left of 5)")
fail(HOST, 0)

# 5. A typed guess at a site never visited: a typo, not tried again.
id = front()
fail("dnstypo.example", 3)
b.cmd("field.commit", text="dnstypo.example/x")
until(lambda: said(id), 4)
time.sleep(2.0)
x = tries(id)
t.ok(said(id) == GAVE_UP and not x["pending"], f"a typo: says it couldn't find it, with the hint ({said(id)!r})")
t.ok(left("dnstypo.example") == 2, f"a typo: asked for once only ({left('dnstypo.example')} left of 3)")
t.ok(tab(id)["url"] == "https://dnstypo.example/x", f"…and the field has the address that failed ({tab(id)['url']})")

# 6. Typed with no scheme to a site you have been to: tried again.
fail(HOST, 1)
b.cmd("field.commit", text=f"{HOST}:{P}/known")
first = until(lambda: said(id), 4)
t.ok(first == TRYING, f"a site visited before, typed with no scheme: trying again ({first!r})")
got = until(lambda: tab(id)["title"] == "known" and tab(id), 5)
t.ok(bool(got), "…and it arrives")

# 7. Going elsewhere ends the tries.
id = front()
fail(HOST, 3)
b.cmd("tab.go", id=id, input=f"{BASE}/far")
until(lambda: said(id), 4)
fail("elsewhere.example", 0)
b.cmd("tab.go", id=id, input=f"http://localhost:{P}/elsewhere")
b.wait_for(lambda: tab(id)["title"] == "elsewhere", within=10, what="elsewhere")
time.sleep(1.5)
t.ok(not tries(id)["pending"] and left(HOST) == 2, f"going elsewhere stops the tries ({tries(id)}, {left(HOST)} left)")
fail(HOST, 0)

# 8. After the third try, it gives up and says so with the hint.
id = front()
fail(HOST, 9)
start = time.time()
b.cmd("tab.go", id=id, input=f"{BASE}/late")
until(lambda: said(id), 4)
done = until(lambda: said(id) == GAVE_UP, 16)
took = time.time() - start
t.ok(done and tries(id)["tries"] == 3 and not tries(id)["pending"] and 11 < took < 15,
     f"three tries (1, 3, 8 s), then the hint ({said(id)!r}, {tries(id)}, {took:.1f} s)")
t.ok(left(HOST) == 5, f"asked for four times in all ({left(HOST)} left of 9)")
fail(HOST, 0)
b.cmd("tab.tryAgain", id=id)
got = until(lambda: tab(id)["title"] == "late" and tab(id), 6)
t.ok(bool(got) and not tab(id).get("error"), "Try again asks again, and the page comes")
t.done()

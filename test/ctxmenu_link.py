#!/usr/bin/env python3
"""The page menu on a link (studio/01 §3.38, Tab.swift:2496-2575; studio/06
§2.3 Copy Clean Link), in the dark look: Open Link in New Tab (behind, after
its page), in New Window, in Private Window (a private window, its own
store), in Split View (paired on the right, with the keys), Download Linked
File, Copy Link, Copy Clean Link (no utm_, no fbclid; the rest and # kept);
an email link copies its address; a link with its words selected gets both."""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b  # noqa: E402
import ctxmenu_kit as k  # noqa: E402

OUT = Path(__file__).resolve().parent.parent / "out" / "ctxmenu-link"
OUT.mkdir(parents=True, exist_ok=True)
for f in OUT.iterdir():
    f.unlink()
k.world("ctxmenu-link", look="dark", downloads=str(OUT))
t = b.T()
LINK = k.url("/target?utm_source=news&id=7&fbclid=abc#top")
# Opened, the address loses its click IDs (Remove click trackers, on by
# default: studio/06 §2.3, the pages module): either is the link.
OPENED = (LINK, k.url("/target?utm_source=news&id=7#top"))

page = k.page("/ctx")
at = k.right_click(page, "#link")
WANT = ["Open Link in New Tab", "Open Link in New Window", "Open Link in Private Window", "Open Link in Split View", "—",
        "Download Linked File", "—", "Copy Link", "Copy Clean Link", "—", "Hide Element", "—", "Inspect"]
t.ok(k.labels() == WANT, f"a link: open it four ways, download it, copy it two ways ({k.labels()})")
t.ok(k.dom_items() == WANT, "…drawn as built")
t.ok(k.last()["menu"]["context"] == ["link"], "its context is the link")
k.near_click(t, at)
dark = k.ojs("return document.documentElement.dataset.look")
t.ok(dark == "dark", "the overlay is dark")
s = k.style_check(t)
t.ok(s["ground"].startswith("rgba(40, 40, 40"), f"…on the dark menus' ground: {s['ground']}")
k.shot("ctxmenu-link-dark")

# Copy Link, Copy Clean Link
k.clear_clipboard()
k.pick("Copy Link")
t.ok(k.clipboard()["text"] == LINK, f"Copy Link copies the link as it is: {k.clipboard()['text']}")
k.right_click(page, "#link")
k.pick("Copy Clean Link")
t.ok(k.clipboard()["text"] == k.url("/target?id=7#top"), f"Copy Clean Link leaves out utm_ and fbclid, keeps id and #: {k.clipboard()['text']}")

# Open Link in New Tab: behind, right after its page
k.right_click(page, "#link")
k.pick("Open Link in New Tab")
w = b.state()["windows"][0]
ids = [x["id"] for x in w["tabs"]]
new = ids[ids.index(page) + 1] if page in ids and ids.index(page) + 1 < len(ids) else None
nt = k.tab(new) if new else None
t.ok(nt and nt["url"] in OPENED and w["activeID"] == page, f"Open Link in New Tab: right after its page, behind it ({nt and nt['url']})")
if nt:
    b.cmd("tab.close", id=new)

# Open Link in New Window
before = len(b.state()["windows"])
k.right_click(page, "#link")
k.pick("Open Link in New Window")
b.wait_for(lambda: len(b.state()["windows"]) == before + 1, what="a new window")
w2 = b.state()["windows"][-1]
a2 = next(x for x in w2["tabs"] if x["id"] == w2["activeID"])
t.ok(a2["url"] in OPENED and not a2.get("shy"), f"Open Link in New Window: a window of its own with the link ({a2['url']})")
b.wait_for(lambda: not k.tab(a2["id"])["loading"] and k.tab(a2["id"])["title"] == "target", what="the link loaded there")
t.ok(True, "…loaded there")
b.cmd("window.close", window=w2["windowID"])
b.wait_for(lambda: len(b.state()["windows"]) == before, what="closed again")

# Open Link in Private Window
k.right_click(page, "#link")
k.pick("Open Link in Private Window")
b.wait_for(lambda: len(b.state()["windows"]) == before + 1, what="a private window")
w3 = b.state()["windows"][-1]
a3 = next(x for x in w3["tabs"] if x["id"] == w3["activeID"])
t.ok(a3["url"] in OPENED and a3.get("shy"), f"Open Link in Private Window: a private window with the link (shy={a3.get('shy')})")
b.wait_for(lambda: k.tab(a3["id"])["title"] == "target", what="loaded privately")
b.ev(a3["id"], "document.cookie = 'shy=1; path=/'")
t.ok(b.ev(page, "document.cookie") == "", "…keeping its cookies to itself")
# From a private page there is no Private Window: its links are private already.
p3 = b.cmd("tab.open", window=w3["windowID"], url=k.url("/ctx"), foreground=True)
b.wait_for(lambda: (x := k.tab(p3)) and x["title"] == "ctx" and not x["loading"], what="ctx in private")
time.sleep(0.4)
pr = b.call({"do": "ctxmenu.page", "window": w3["windowID"], "id": p3})["rect"]
r = k.element(p3, "#link")
b.call({"do": "mouse", "window": w3["windowID"], "x": round(pr["x"] + r["x"] + r["width"] / 2), "y": round(pr["y"] + r["y"] + r["height"] / 2), "button": "right"})
b.wait_for(lambda: (m := k.last()["menu"]) and m["window"] == w3["windowID"], within=5, what="the private page's menu")
t.ok("Open Link in Private Window" not in k.labels() and "Open Link in New Window" in k.labels(), f"on a private page: no Private Window ({k.labels()[:3]})")
b.call({"do": "ctxmenu.key", "key": "Escape", "window": w3["windowID"]})
time.sleep(0.3)
b.cmd("window.close", window=w3["windowID"])
b.wait_for(lambda: len(b.state()["windows"]) == before, what="private closed")
time.sleep(0.4)

# Open Link in Split View: paired on the right, with the keys
k.right_click(page, "#link")
k.pick("Open Link in Split View")
w = b.state()["windows"][0]
split = next((s for s in w["splits"] if page in s["tabs"]), None)
t.ok(split and len(split["tabs"]) == 2 and split["tabs"][0] == page, f"Open Link in Split View: the page and the link, as a pair ({split})")
other = split and split["tabs"][1]
t.ok(other and k.tab(other)["url"] in OPENED and w["activeID"] == other, "…the link on the right, with the keys")
b.wait_for(lambda: len(k.page_rect(other) and [1] or []) and len(b.call({"do": "ctxmenu.page"})["views"]) >= 4, within=5, what="both pages on screen")
t.ok(True, "…both pages on screen")
b.cmd("split.separate")
b.cmd("tab.close", id=other)
b.cmd("tab.select", id=page)
time.sleep(0.5)

# Download Linked File: into Downloads, as any download
k.right_click(page, "#link")
k.pick("Download Linked File")
got = b.wait_for(lambda: [f for f in OUT.iterdir() if not f.name.startswith(".") and not f.name.endswith(".crdownload")], within=10, what="the file")
t.ok(got and "target" in got[0].name, f"Download Linked File saves the link's file in Downloads: {[f.name for f in got]}")

# an email link
k.right_click(page, "#mail")
t.ok(k.labels() == ["Copy Email Address", "—", "Hide Element", "—", "Inspect"], f"an email link: Copy Email Address ({k.labels()})")
k.pick("Copy Email Address")
t.ok(k.clipboard()["text"] == "hello@example.com", f"…the address alone: {k.clipboard()['text']}")

# a link with its words selected: the link's rows, then the words'
k.select(page, "#link2")
k.right_click(page, "#link2")
labs = k.labels()
t.ok(labs[:4] == WANT[:4] and "Copy" in labs and labs.index("Copy") > labs.index("Copy Clean Link") and any(x.startswith("Search “Second story”") for x in labs),
     f"a link with its words selected: the link's rows, then Copy and Search ({labs})")
t.ok(k.last()["menu"]["context"] == ["link", "selection"], "…its context is both")
k.pick("Copy")
t.ok(k.clipboard()["text"] == "Second story", "…Copy copies the words")

k.done(t)

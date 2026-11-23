#!/usr/bin/env python3
"""Split View in the window (studio/01 §8.12, §8.13, §8.14, §8.19, §8.24,
§8.26), with the Mac's values: two pages side by side with a 7 pt gutter,
none under 250, the divider that snaps to even within 15, double click to
even out, the keys moving between pages, closing one page, too narrow for
both, separating."""
import json, os, sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b

SHOTS = os.environ.get("SHOTS_DIR")
b.use("window-split")
b.launch()
t = b.T()


def frame():
    return b.call({"do": "window.frame"})["frame"]


def panes():
    return json.loads(b.ui("JSON.stringify([...document.querySelectorAll('.pane')].map(e => ({ id: e.dataset.tab, ...e.getBoundingClientRect().toJSON() })))"))


def divider():
    return json.loads(b.ui("JSON.stringify(document.querySelector('.divider')?.getBoundingClientRect().toJSON() ?? null)"))


def splits():
    return b.window()["splits"]


def near(a, c, by=1.01):
    return abs(a - c) <= by


work = frame()["workArea"]
place = {"x": work["x"] + 40, "y": work["y"] + 30, "width": min(1180, work["width"] - 120), "height": min(700, work["height"] - 120)}
b.call({"do": "window.place", "visual": True, **place})
mod = "control"
b.cmd("tab.go", input="data:text/html,<title>left</title><body style='background:%23fafafa'>left")
b.wait_for(lambda: b.active()["title"] == "left", what="left page")
left = b.active()["id"]

# 1. Split Current Page: an empty page beside it, with the keys (§8.19).
b.cmd("split.toggle")
time.sleep(0.6)
s = splits()
t.ok(len(s) == 1 and s[0]["tabs"][0] == left and len(s[0]["tabs"]) == 2, "Split Current Page puts a page beside it")
right = s[0]["tabs"][1]
t.ok(b.window()["activeID"] == right and b.active()["empty"], "the new page is empty and has the keys")
p = panes()
stage = json.loads(b.ui("JSON.stringify(document.querySelector('.card').getBoundingClientRect().toJSON())"))
t.ok(len(p) == 2 and near(p[1]["x"] - (p[0]["x"] + p[0]["width"]), 7), "two pages with a 7 pt gutter")
t.ok(near(p[0]["width"], p[1]["width"]) and near(p[0]["width"] + p[1]["width"] + 7, stage["width"]), "even shares fill the card's place")
t.ok(b.ui("!!document.querySelector('.pane:nth-child(2) .empty-page')") is True, "the empty page shows the field")

# 2. The empty page gets an address: both pages are laid on their panes.
b.cmd("tab.go", id=right, input="data:text/html,<title>right</title><body style='background:%23f0f0f0'>right")
b.wait_for(lambda: next(x for x in b.state()["tabs"] if x["id"] == right)["title"] == "right", what="right page")
time.sleep(0.6)
p = panes()
pages = {x["id"]: x["rect"] for x in frame()["pages"]}
t.ok(set(pages) == {left, right}, "both pages are on screen")
t.ok(all(all(near(pages[x["id"]][k], round(x[k])) for k in ("x", "y", "width", "height")) for x in p), "each page lies on its pane")
if SHOTS:
    b.shot(f"{SHOTS}/split-1-even.png")

# 3. The divider: dragging moves the shares, released once; near even it snaps.
d = divider()
t.ok(d and near(d["width"], 7), "the divider fills the gutter")
x0, y0 = d["x"] + 3, d["y"] + d["height"] / 2
before = panes()[0]["width"]
b.call({"do": "window.drag", "path": [[x0, y0], [x0 + 40, y0], [x0 + 80, y0], [x0 + 100, y0]]})
time.sleep(0.4)
after = panes()[0]["width"]
t.ok(near(after, before + 100, 2), "dragging the divider widens the left page (%s -> %s)" % (before, after))
s = splits()[0]
t.ok(near(s["sizes"][0] * (stage["width"] - 7), after, 2), "the split keeps the new shares")
pages = {x["id"]: x["rect"] for x in frame()["pages"]}
t.ok(near(pages[left]["width"], round(after), 1.5), "the page follows the divider")
d = divider()
x0 = d["x"] + 3
b.call({"do": "window.drag", "path": [[x0, y0], [x0 - 50, y0], [x0 - 90, y0]]})
time.sleep(0.4)
p = panes()
t.ok(near(p[0]["width"], p[1]["width"]), "within 15 of even the divider snaps to the middle")
d = divider()
x0 = d["x"] + 3
b.call({"do": "window.drag", "path": [[x0, y0], [x0 - 2000, y0]]})
time.sleep(0.4)
t.ok(near(panes()[0]["width"], 250), "no page under 250")
d = divider()
x0 = d["x"] + 3
b.mouse(x0, y0, clicks=1)
b.mouse(x0, y0, clicks=2)
time.sleep(0.5)
p = panes()
t.ok(near(p[0]["width"], p[1]["width"]), "double click evens the two pages out")

# 4. The keys move between pages, one at a time (§8.24).
b.cmd("tab.select", id=right)
b.cmd("split.focus", by=-1)
t.ok(b.window()["activeID"] == left, "the keys go to the left page")
b.cmd("split.focus", by=-1)
t.ok(b.window()["activeID"] == left, "and stop at the end")
b.cmd("split.focus", by=1)
t.ok(b.window()["activeID"] == right, "and back to the right")
t.ok(splits()[0]["focused"] == right, "the split remembers the page with the keys")

# 5. Too narrow for both: the page with the keys alone (§8.13).
b.call({"do": "window.place", "visual": True, **{**place, "width": 700}})
time.sleep(0.6)
p = panes()
t.ok(len(p) == 1 and p[0]["id"] == right and near(p[0]["width"], json.loads(b.ui("JSON.stringify(document.querySelector('.card').getBoundingClientRect().width)"))), "too narrow: the page with the keys alone")
t.ok([x["id"] for x in frame()["pages"]] == [right], "only that page is on screen")
b.call({"do": "window.place", "visual": True, **place})
time.sleep(0.6)
t.ok(len(panes()) == 2, "with room again, both come back")

# 6. Closing the page with the keys: the other one takes the place (§8.26).
b.cmd("tab.close", id=right)
time.sleep(0.5)
t.ok(splits() == [] and b.window()["activeID"] == left, "closing one page: the split is gone, its partner in front")
t.ok(len(panes()) == 0 and len(frame()["pages"]) == 1, "one card again")

# 7. Split and separate with the same key (§8.19).
b.cmd("split.toggle")
time.sleep(0.4)
t.ok(len(splits()) == 1, "split again")
b.cmd("split.toggle")
time.sleep(0.4)
t.ok(splits() == [], "the same key separates")
t.done()

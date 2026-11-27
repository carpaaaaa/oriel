#!/usr/bin/env python3
"""The edges, as Search 1.0.22 has them (Fold.swift hiddenEdge, dwell,
rising; Side.swift the column's edge):
 - a sidebar hidden until the pointer reaches the edge comes from a band 28
   wide, not 10; nothing covers the page until it is out;
 - the tabs across the top, folded, come down after 0.05 s on the edge, not
   0.15; a pointer still going up through the edge doesn't bring them;
 - the column's edge is 12 wide, not 9, its pill where it was, and pulled
   it holds the cursor. The pointer is the bench's."""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b  # noqa: E402
import ui_kit as k  # noqa: E402

b.use("window-edges-wide")
b.launch(*k.FRAMES, env={"SEARCH_LOOK": "light"})
t = b.T()


def setting(id_, value):
    b.cmd("settings.set", id=id_, value=value)
    time.sleep(0.5)


def frame():
    return b.call({"do": "window.frame"})["frame"]


def edges():
    return b.call({"do": "window.edges"})


def pointer(x, y=None):
    b.call({"do": "window.pointer", "x": x, "y": y})


def settle(pred, what, within=3):
    try:
        return b.wait_for(pred, within=within, what=what, every=0.02)
    except AssertionError:
        return None


b.cmd("tab.go", input="data:text/html,<title>page</title><body>page")
b.wait_for(lambda: b.active()["title"] == "page", what="page")
v = frame()["visual"]
away = (v["x"] + v["width"] / 2, v["y"] + v["height"] / 2)
pointer(*away)

# The column's edge: 12 wide at the column's edge, the pill 2.5 in, as with the old 9.
grip, side = k.rect(".sidebar .grip"), k.rect(".sidebar")
pill = k.rect(".sidebar .grip-pill")
t.ok(grip and k.near(grip["w"], 12) and k.near(grip["x"] + grip["w"], side["x"] + side["w"]), f"the column's edge: 12 wide, along its edge ({grip}, column {side})")
t.ok(pill and k.near(side["x"] + side["w"] - (pill["x"] + pill["w"]), 2.5), f"…its pill where it was, 2.5 in from the edge ({pill})")
t.ok(k.style(".sidebar .grip", "cursor")["cursor"] == "col-resize", "…the left-right cursor over it")
cx, cy = grip["x"] + grip["w"] / 2, grip["y"] + grip["h"] / 2
b.mouse(cx, cy, phase="down")
time.sleep(0.2)
held = k.js("return [document.documentElement.classList.contains('col-resizing'), getComputedStyle(document.querySelector('.rows') || document.body).cursor]")
b.mouse(cx, cy, phase="up")
time.sleep(0.2)
t.ok(held and held[0] and held[1] == "col-resize", f"pulled, it holds the cursor over the rows too ({held})")
t.ok(not k.js("return document.documentElement.classList.contains('col-resizing')"), "let go, the cursor is the page's again")

# Hide the column until the pointer reaches the edge: the band is 28 wide.
setting("sidebar.hides", True)
v = frame()["visual"]
t.ok(b.window()["sidebar"]["folded"], "on: the column rests folded away")
pointer(v["x"] + 34, v["y"] + 300)
time.sleep(0.25)
t.ok(not edges()["peek"], "34 from the edge, past the band: nothing comes")
pointer(v["x"] + 22, v["y"] + 300)
early = edges()
out = settle(lambda: edges()["peek"], "out")
t.ok(not early["peek"] and out, "22 from the edge, inside the band of 28: after a moment, the column comes out")
t.ok(early["region"] is None or early["region"]["width"] == 0, f"…and until it is out nothing covers the page: a press there is the page's ({early['region']})")
pointer(*away)
settle(lambda: not edges()["peek"] and not edges()["going"], "back")
setting("sidebar.hides", False)

# The strip across the top, folded: it comes down after 0.05 s, not 0.15.
setting("tabs.layout", "top")
b.cmd("sidebar.fold", folded=True)
time.sleep(0.5)
v = frame()["visual"]
pointer(v["x"] + 300, v["y"] + 2)
start = time.time()
out = settle(lambda: edges()["peek"], "the strip out", within=1)
took = time.time() - start
t.ok(out and took < 0.14, f"at the top edge the strip comes down after 0.05 s ({took:.3f} s, the old wait was 0.15)")
pointer(*away)
settle(lambda: not edges()["peek"] and not edges()["going"], "back up")
time.sleep(0.2)

# Still going up through the edge: it doesn't come.
y = v["y"] + 5
pointer(v["x"] + 300, y)
risen = False
for _ in range(12):
    y -= 0.4
    pointer(v["x"] + 300, max(v["y"], y))
    time.sleep(0.02)
    risen = risen or edges()["peek"]
# Thirteen looks still going up, through the edge's 6: never out.
t.ok(not risen, "a pointer still going up through the edge doesn't bring it down")
out = settle(lambda: edges()["peek"], "out once it rests", within=1)
t.ok(out, "…come to rest on it, it does")
pointer(*away)
settle(lambda: not edges()["peek"] and not edges()["going"], "back up")
b.cmd("sidebar.fold", folded=False)
setting("tabs.layout", "left")
pointer(None)
t.done()

#!/usr/bin/env python3
"""Icons only (Settings › Appearance › Tabs): a click on the tab you're on no
longer closes it. Its close button waits half a second of the pointer on the
tile and sits small in its top-left corner, clear of a click to pick the tab;
middle-click and Ctrl+W close as before. Every tile's tooltip says where its
page is, under its title (Search 1.0.22, SideIcons.swift IconTile.crossDwell,
crossFrame, IconTiles.tip)."""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b  # noqa: E402
import ui_kit as k  # noqa: E402

b.use("ui-icon-close")
b.launch(*k.FRAMES, env={"SEARCH_LOOK": "light"})
t = b.T()
time.sleep(0.8)

CROSS = ("const e = document.querySelector('.tile.live .tile-x'); if (!e) return null; const r = e.getBoundingClientRect();"
         " const p = e.closest('.tile').getBoundingClientRect(); const s = getComputedStyle(e);"
         " return { dx: r.x - p.x, dy: r.y - p.y, w: r.width, h: r.height, opacity: s.opacity, events: s.pointerEvents, title: e.title }")

# The tooltips, on the column of icons laid as a fixture, the address setting off.
s = k.fixture("many", sidebar={"icons": True})
s["prefs"] = {**s.get("prefs", {}), "tabs.address": False}
k.fake(s, look="light")
time.sleep(0.5)
tips = k.js("return [...document.querySelectorAll('.tile')].map(e => [e.dataset.tab, e.title, e.classList.contains('live')])")
hn = next(x for x in s["tabs"] if "ycombinator" in x["url"])
tip = next((x[1] for x in tips if x[0] == hn["id"]), None)
t.ok(tip and tip.split("\n")[:2] == ["Hacker News", "news.ycombinator.com"], f"a tile that isn't the one you're on: its title, then where its page is ({tip!r})")
t.ok(all(len(x[1].split("\n")) >= 2 for x in tips if not x[1].startswith("New Tab")), "every tile's tooltip says where its page is, the address setting off too")
k.thaw()
time.sleep(0.4)

# The real column of icons, with real tabs.
b.cmd("settings.set", id="tabs.layout", value="icons")
time.sleep(0.6)
b.cmd("tab.go", input="data:text/html,<title>one</title>one")
b.wait_for(lambda: b.active()["title"] == "one", what="one")
for n in ("two", "three"):
    b.cmd("tab.new", url=f"data:text/html,<title>{n}</title>{n}")
b.wait_for(lambda: len(b.window()["tabs"]) >= 3 and b.active()["title"] == "three", what="three tabs")
time.sleep(0.6)
live = b.active()["id"]
got = k.js(CROSS)
t.ok(got and got["opacity"] == "0" and got["events"] == "none", f"at rest the tab you're on shows no cross, and takes no press for one ({got})")

tile = k.rect(".tile.live")
cx, cy = tile["x"] + tile["w"] / 2, tile["y"] + tile["h"] / 2
# A click in the middle of the tab you're on, straight away: it stays.
b.mouse(cx, cy)
time.sleep(0.25)
t.ok(any(x["id"] == live for x in b.window()["tabs"]), "a click on the tab you're on doesn't close it")
got = k.js(CROSS)
t.ok(got and got["opacity"] == "0", f"…the pointer on it a quarter of a second: no cross yet ({got and got['opacity']})")
time.sleep(0.6)
got = k.js(CROSS)
t.ok(got and got["opacity"] == "1" and got["events"] == "auto", f"half a second on the tile: the cross ({got})")
t.ok(got and k.near(got["dx"], -3) and k.near(got["dy"], -3) and k.near(got["w"], 13) and k.near(got["h"], 13),
     f"…small, a disc of 13 on its top-left corner, 3 past it ({got})")
t.ok(got and got["title"] == "Close Tab", f"…Close Tab ({got and got['title']})")
# Still a click in the middle picks, never closes.
b.mouse(cx, cy)
time.sleep(0.3)
t.ok(any(x["id"] == live for x in b.window()["tabs"]), "with the cross out, a click in the middle of the tile still doesn't close it")
# The cross itself closes it.
x = k.rect(".tile.live .tile-x")
b.mouse(x["x"] + x["w"] / 2, x["y"] + x["h"] / 2)
b.wait_for(lambda: all(y["id"] != live for y in b.window()["tabs"]), within=3, what="closed by its cross")
t.ok(True, "a click on the cross closes it")
k.js("const e = document.querySelector('.tile.live'); e && e.dispatchEvent(new PointerEvent('pointerleave')); return 1")

# Middle-click on any tile closes it, as before.
left = [y["id"] for y in b.window()["tabs"] if not y.get("pinID")]
target = next(y for y in left if y != b.window()["activeID"])
r = k.rect(f".tile[data-tab='{target}']")
b.mouse(r["x"] + r["w"] / 2, r["y"] + r["h"] / 2, button="middle")
b.wait_for(lambda: all(y["id"] != target for y in b.window()["tabs"]), within=3, what="middle-click")
t.ok(True, "middle-click on a tile closes it, as before")
b.cmd("settings.set", id="tabs.layout", value="left")
t.done()

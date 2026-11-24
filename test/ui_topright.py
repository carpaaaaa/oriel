#!/usr/bin/env python3
"""The bookmark, extensions and downloads buttons where Search 1.0.19 has
them (TabBar.swift:264-279, Side.swift:1706-1747, Bookmarks.swift:1133-1420,
Extensions.swift:2506-2560, Fetching.swift:658-773; studio/01 §4.3, §5.8,
§5.9, studio/05 §3.2): with the tabs across the top, at the strip's far end
before Windows' buttons (downloads, the puzzle, back, forward and reload
when they are on the right, the bookmark button), each a door of 26, 2
apart, the last 12 before Windows' buttons; with the column, in its foot,
or up beside back, forward and reload with Buttons at the top. Each one is
there, drawn, uncovered, inside the window, off the page and clear of the
window's buttons, in each layout, free and maximized (and in full screen
on Windows, where the strip with the window's buttons still comes down).
A click does what the Mac's does: the bookmark button its list (Add This
Page, then the card: name, folder, Remove, Done), the puzzle its list, the
downloads button the downloads. The puzzle only with extensions; the
downloads button while a file comes in and 5 s after (arrow.down), or
always with Always show the downloads button."""
import json
import shutil
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b  # noqa: E402
import settings_web as web  # noqa: E402

IS_WIN = sys.platform == "win32"
FIXTURE = Path(__file__).resolve().parent / "fixtures" / "dnr-test"

server, origin = web.start()
web.PAGES["/page"] = "<title>Kept page</title><body>a page to keep</body>"
web.PAGES["/other"] = "<title>Other page</title><body>another</body>"

b.use("ui-topright")
b.launch("--disable-gpu-vsync", "--disable-frame-rate-limit", env={"SEARCH_LOOK": "light"})
t = b.T()
time.sleep(0.6)

over = lambda js: b.ui(js, root="overlay")


def frame():
    return b.call({"do": "window.frame"})["frame"]


def settle(pred, what, within=5):
    try:
        return b.wait_for(pred, within=within, what=what)
    except AssertionError:
        return None


# What every door must be (window_states.py's test): there, drawn, under
# nothing of the interface, inside the window, off the page; and here also
# clear of the window's three buttons.
SEEN = """const seen = (e, W) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e);
  const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
  const caps = [...document.querySelectorAll('.window > .caption-buttons button')].map(c => c.getBoundingClientRect());
  return { x: r.x - W.x, y: r.y - W.y, w: r.width, h: r.height, right: r.right - W.x,
    shown: s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity > 0 && r.width > 0 && r.height > 0,
    top: !!top && (top === e || e.contains(top)),
    inside: r.x >= W.x - 0.5 && r.y >= W.y - 0.5 && r.right <= W.right + 0.5 && r.bottom <= W.bottom + 0.5,
    caps: caps.some(c => r.x < c.right && c.x < r.right && r.y < c.bottom && c.y < r.bottom),
    capsLeft: caps.length ? Math.min(...caps.map(c => c.x)) - W.x : null } };"""

KINDS = {"downloads": ".fetch-door", "puzzle": ".ext-puzzle:not(.hidden)", "bookmarks": ".bookmark-door", "helm": ".strip-helm > .door"}


def doors(where):
    """`where`: the strip's far end, the column's foot, or the foot up in the band."""
    box = {"strip": ".tabbar .strip-far", "foot": ".sidebar > .foot", "up": ".sidebar .band > .foot.up"}[where]
    d = json.loads(b.ui("JSON.stringify((() => { " + SEEN + f"""
      const W = document.querySelector('.window').getBoundingClientRect()
      const box = document.querySelector({json.dumps(box)})
      const kinds = {json.dumps(KINDS)}
      const out = {{}}
      for (const [k, sel] of Object.entries(kinds)) out[k] = box ? [...box.querySelectorAll(sel)].map(e => seen(e, W)) : []
      const col = document.querySelector('.sidebar')?.getBoundingClientRect()
      out.column = col ? {{ x: col.x - W.x, right: col.right - W.x }} : null
      out.width = W.width
      return out
    }})())"""))
    pages = [p["rect"] for p in frame()["pages"]]
    m = frame()["margin"]
    for k in KINDS:
        for x in d[k]:
            x["page"] = any(x["x"] + m["left"] < p["x"] + p["width"] and p["x"] < x["x"] + m["left"] + x["w"] and x["y"] + m["top"] < p["y"] + p["height"] and p["y"] < x["y"] + m["top"] + x["h"] for p in pages)
    return d


def good(x):
    return x["shown"] and x["top"] and x["inside"] and not x["page"] and not x["caps"] and round(x["w"]) == 26 and round(x["h"]) == 26


def check(where, layout, want):
    """`want`: the doors expected, in order from the left."""
    d = doors(where)
    got = sorted([(x["x"], k) for k in want for x in d[k][:1]])
    order = [k for _, k in got]
    bad = [(k, d[k][0] if d[k] else None) for k in want if not d[k] or not good(d[k][0])]
    t.ok(not bad and order == want, f"{layout}: {', '.join(want)} there, drawn, uncovered, inside, off the page, clear of the window's buttons, in the Mac's order ({order}{'; ' + str(bad[0]) if bad else ''})")
    return d


def gaps(d, want):
    xs = sorted([d[k][0] for k in want], key=lambda x: x["x"])
    return [round(b2["x"] - a["right"], 1) for a, b2 in zip(xs, xs[1:])]


def centre(sel):
    r = json.loads(b.ui(f"JSON.stringify(document.querySelector({json.dumps(sel)}).getBoundingClientRect())"))
    return r["x"] + r["width"] / 2, r["y"] + r["height"] / 2, r


def popover():
    return (b.window().get("data") or {}).get("popover")


def overlay_name():
    return (b.window().get("overlay") or {}).get("name")


def close_overlay():
    if overlay_name() == "data.bookmarks":
        b.cmd("bookmark.popoverClose")
    elif overlay_name() == "ext.list":
        b.cmd("ext.menuClose")
    settle(lambda: not overlay_name(), "the overlay closed", within=3)
    time.sleep(0.35)


# A free window of a known size, a page in front.
f = frame()
work = f["workArea"]
place = {"x": work["x"] + 40, "y": work["y"] + 30, "width": min(1100, work["width"] - 120), "height": min(720, work["height"] - 100)}
b.call({"do": "window.place", "visual": True, **place})
folder = Path(b.folder()) / "Downloads here"
shutil.rmtree(folder, ignore_errors=True)
folder.mkdir(parents=True)
b.call({"do": "settings.answers", "folder": str(folder)})
b.cmd("settings.do", id="downloads.folder")
b.cmd("tab.go", input=origin + "/page")
b.wait_for(lambda: b.active()["title"] == "Kept page", what="page")
page = b.active()["id"]

# ---- 1. Tabs across the top: the far end of the strip ---------------------
b.cmd("settings.set", id="tabs.layout", value="top")
settle(lambda: b.ui("!!document.querySelector('.tabbar .strip-far')"), "the strip")
time.sleep(0.5)

d = check("strip", "across the top", ["bookmarks"])
t.ok(not d["puzzle"], "no puzzle without extensions (Extensions.swift:2535)")
t.ok(not d["downloads"], "no downloads button with nothing coming in and Always show off (Fetching.swift:699-701)")
bm = d["bookmarks"][0]
t.ok(bm["capsLeft"] is not None and abs(bm["capsLeft"] - bm["right"] - 12) <= 0.6,
     f"the last door 12 before the window's buttons, as before the strip's end on the Mac ({bm['capsLeft']} - {bm['right']})")
t.ok(b.ui("document.querySelector('.bookmark-door').title") == "Bookmarks", "its tooltip: Bookmarks")
t.ok(b.ui("!!document.querySelector('.bookmark-door:not(.kept)')"), "bookmark, not filled: this page isn't kept")

# The bookmark button: its list, under it (Browser.toggleBookmarks).
x, y, r = centre(".bookmark-door")
b.mouse(x, y)
settle(lambda: overlay_name() == "data.bookmarks" and popover(), "the bookmarks list")
time.sleep(0.3)
p = popover()
t.ok(p and p["arrow"]["side"] == "top" and abs(p["arrow"]["at"] - x) <= 1 and p["rect"]["y"] >= r["y"] + r["height"] and round(p["rect"]["width"]) == 280,
     f"a click opens the list, 280 wide, hanging under the button from its middle ({p and p['rect']}, {p and p['arrow']})")
t.ok(over("document.querySelector('.bm-none')?.textContent") == "No bookmarks yet", "No bookmarks yet")
t.ok(over("[...document.querySelectorAll('.bm-foot-row span:last-child')].map(s => s.textContent).join('|')") == "Add This Page", "then Add This Page")

# Add This Page: kept, at the end, and the card off the button (Browser.bookmarkCurrent).
over("document.querySelector('[data-bookmark-add]').click()")
settle(lambda: (popover() or {}).get("card"), "the card")
time.sleep(0.3)
p = popover()
kept = b.call({"do": "data.bookmarks"})["roots"]
t.ok(len(kept) == 1 and kept[0]["url"].startswith(origin + "/page") and kept[0]["title"] == "Kept page", f"Add This Page keeps the page ({kept})")
t.ok(p["card"]["title"] == "Kept page" and p["card"]["folderName"] == "Top Level" and over("document.querySelector('.bm-heading')?.textContent") == "Bookmarked",
     "and the card says Bookmarked, with its name and Top Level")
settle(lambda: b.ui("!!document.querySelector('.bookmark-door.kept')"), "filled", within=3)
t.ok(b.ui("!!document.querySelector('.bookmark-door.kept')"), "the button fills: bookmark.fill on a page that is kept")
# The name, kept as it is typed.
over("(() => { const f = document.querySelector('[data-bookmark-name]'); f.value = 'Mine'; f.dispatchEvent(new Event('input', { bubbles: true })) })()")
settle(lambda: b.call({"do": "data.bookmarks"})["roots"][0]["title"] == "Mine", "renamed", within=3)
t.ok(b.call({"do": "data.bookmarks"})["roots"][0]["title"] == "Mine", "the name changes as it is typed")
over("document.querySelector('[data-bookmark-done]').click()")
t.ok(settle(lambda: not overlay_name() and not popover(), "Done closes", within=3), "Done closes the card")
time.sleep(0.4)

# Again: the list has it, Edit This Bookmark…; a click on it opens it in a new tab in front.
x, y, r = centre(".bookmark-door")
b.mouse(x, y)
settle(lambda: overlay_name() == "data.bookmarks" and popover() and popover()["lines"], "the list again")
time.sleep(0.3)
p = popover()
t.ok(not p["card"] and [l["title"] for l in p["lines"]] == ["Mine"], f"the button opens the list, never the card left from before ({[l['title'] for l in p['lines']]})")
t.ok(over("document.querySelector('.bm-foot-row span:last-child')?.textContent") == "Edit This Bookmark…", "Edit This Bookmark… on a page that is kept")
b.cmd("tab.go", id=page, input=origin + "/other")
b.wait_for(lambda: b.active()["title"] == "Other page", what="other page")
time.sleep(0.3)
if overlay_name() != "data.bookmarks":
    x, y, r = centre(".bookmark-door")
    b.mouse(x, y)
    settle(lambda: overlay_name() == "data.bookmarks", "the list")
    time.sleep(0.3)
tabs = len(b.window()["tabs"])
over("document.querySelector('.bm-row[data-bookmark]').click()")
settle(lambda: len(b.window()["tabs"]) == tabs + 1, "a new tab")
time.sleep(0.6)
t.ok(len(b.window()["tabs"]) == tabs + 1 and (b.active()["url"] or "").startswith(origin + "/page") and not overlay_name(),
     "a bookmark picked opens in a new tab in front (the tab in front isn't empty), and the list goes (Browser.openBookmark)")
b.cmd("tab.select", id=page)
time.sleep(0.3)

# Ctrl+Shift+B (Add This Page): kept, and the card hangs from the button.
b.cmd("bookmarks.add")
settle(lambda: (popover() or {}).get("card"), "the card from the key")
p = popover()
x, y, r = centre(".bookmark-door")
t.ok(p and p["card"] and abs(p["arrow"]["at"] - x) <= 1 and b.call({"do": "data.bookmarks"})["count"] == 2,
     "Ctrl+Shift+B keeps the page and opens its card off the button")
# Remove: gone, the card with it.
over("document.querySelector('[data-bookmark-remove]').click()")
settle(lambda: b.call({"do": "data.bookmarks"})["count"] == 1 and not overlay_name(), "removed", within=3)
t.ok(b.call({"do": "data.bookmarks"})["count"] == 1 and not overlay_name(), "Remove takes it out and closes the card")
time.sleep(0.3)

# Escape closes the list.
x, y, r = centre(".bookmark-door")
b.mouse(x, y)
settle(lambda: overlay_name() == "data.bookmarks", "the list")
time.sleep(0.3)
over("document.querySelector('.bm-region').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))")
t.ok(settle(lambda: not overlay_name(), "Escape", within=3), "Escape closes the list")
time.sleep(0.4)
# A press elsewhere closes it (transient, as NSPopover); the button again closes it, not opens it twice.
x, y, r = centre(".bookmark-door")
b.mouse(x, y)
settle(lambda: overlay_name() == "data.bookmarks", "the list")
time.sleep(0.3)
sx, sy, _ = centre(".tabbar .strip-spring")
b.mouse(sx, sy)
t.ok(settle(lambda: not overlay_name(), "a press elsewhere", within=3), "a press elsewhere in the window closes it")
time.sleep(0.4)
b.mouse(x, y)
settle(lambda: overlay_name() == "data.bookmarks", "the list")
time.sleep(0.3)
b.mouse(x, y)
time.sleep(0.6)
t.ok(not overlay_name() and not popover(), "the button pressed again closes it")
time.sleep(0.3)

# Always show the downloads button: there with nothing coming in, before the bookmark button.
b.cmd("prefs.set", key="downloads.button", value=True)
settle(lambda: doors("strip")["downloads"], "the downloads button", within=3)
d = check("strip", "Always show the downloads button", ["downloads", "bookmarks"])
t.ok(gaps(d, ["downloads", "bookmarks"]) == [2.0], f"2 between doors ({gaps(d, ['downloads', 'bookmarks'])})")
t.ok(b.ui("!!document.querySelector('.tabbar .fetch-door svg') && !document.querySelector('.tabbar .fetch-ring')"), "at rest: arrow.down.circle, no ring")
x, y, r = centre(".tabbar .fetch-door")
tabs = len(b.window()["tabs"])
b.mouse(x, y)
settle(lambda: "downloads" in (b.active()["url"] or ""), "the downloads page")
t.ok("downloads" in (b.active()["url"] or ""), f"a click shows the downloads: their page in a tab, as the Mac's default ({b.active()['url']})")
b.cmd("tab.select", id=page)
time.sleep(0.3)
# As a card (downloads.open popover): under the button, not over it.
b.cmd("prefs.set", key="downloads.open", value="popover")
b.mouse(x, y)
settle(lambda: overlay_name() == "settings.downloads", "the downloads card")
region = b.call({"do": "window.edges"})["region"]
t.ok(region and region["y"] >= r["y"] + r["height"], f"…or its card, under the button from the top ({region}, the button's foot {r['y'] + r['height']})")
b.cmd("downloads.show", toggle=True)
settle(lambda: not overlay_name(), "card closed", within=3)
b.cmd("prefs.set", key="downloads.open", value="tab")
b.cmd("prefs.set", key="downloads.button", value=False)
settle(lambda: not doors("strip")["downloads"], "the downloads button gone", within=3)
t.ok(not doors("strip")["downloads"], "Always show off: gone again at once")

# While a file comes in: the ring, then arrow.down, then gone 5 s later.
web.gate("a")
b.ev(page, "(() => { const a = document.createElement('a'); a.href = %s; a.download = ''; document.body.appendChild(a); a.click(); a.remove() })()" % json.dumps("/file/a.bin?size=400000&gate=a"))
settle(lambda: b.ui("!!document.querySelector('.tabbar .fetch-door .fetch-ring')"), "the ring", within=10)
t.ok(b.ui("!!document.querySelector('.tabbar .fetch-door.swell')") or (b.window().get("settings") or {}).get("downloadsStarted"), "it swells as the download starts (Fetching.swift:745)")
time.sleep(0.6)  # measured once the swell (1.35, 0.42 s) is over
d = check("strip", "a file coming in", ["downloads", "bookmarks"])
t.ok(b.ui("!!document.querySelector('.tabbar .fetch-door .fetch-ring')"), "the downloads button comes with a file, its ring filling")
web.gate("a").set()
settle(lambda: (b.window().get("settings") or {}).get("downloadsDone"), "in", within=20)
t.ok(b.ui("!!document.querySelector('.tabbar .fetch-door .fetch-done')") and doors("strip")["downloads"], "everything in: arrow.down, the button still there")
gone = settle(lambda: not doors("strip")["downloads"], "the button goes", within=9)
t.ok(gone, "and 5 s later it goes, though the list holds the file (Fetches.linger)")

# With extensions: the puzzle, before the bookmark button; its list under it.
ext = b.call({"do": "extensions.loadUnpacked", "path": str(FIXTURE), "copy": True})
settle(lambda: doors("strip")["puzzle"], "the puzzle", within=10)
d = check("strip", "with an extension", ["puzzle", "bookmarks"])
t.ok(gaps(d, ["puzzle", "bookmarks"]) == [2.0], f"2 between the puzzle and the bookmark button ({gaps(d, ['puzzle', 'bookmarks'])})")
x, y, r = centre(".tabbar .ext-puzzle")
b.mouse(x, y)
settle(lambda: overlay_name() == "ext.list", "the extensions list")
mnu = (b.window().get("ext") or {}).get("menu") or {}
t.ok(mnu.get("arrow", {}).get("side") == "top" and mnu.get("rect", {}).get("y", 0) >= r["y"] + r["height"], f"the puzzle opens the extensions' list, under it ({mnu.get('arrow')})")
close_overlay()

# Back, forward and reload on the right (toolbar.left off, the Mac's default):
# before the bookmark button, 8 after them.
b.cmd("prefs.set", key="toolbar.left", value=False)
time.sleep(0.5)
d = check("strip", "back, forward and reload on the right", ["puzzle", "helm", "bookmarks"])
helm = sorted(d["helm"], key=lambda x: x["x"])
t.ok(len(helm) == 3 and all(good(x) for x in helm) and abs(d["bookmarks"][0]["x"] - helm[-1]["right"] - 10) <= 0.6,
     f"the helm before the bookmark button, 8 and the row's 2 between ({d['bookmarks'][0]['x']} - {helm[-1]['right']})")
b.cmd("prefs.set", key="toolbar.left", value=True)
time.sleep(0.4)

# Classic window buttons (46 × 40): still clear of them.
b.cmd("prefs.set", key="window.buttons", value="classic")
time.sleep(0.5)
check("strip", "classic window buttons", ["puzzle", "bookmarks"])
b.cmd("prefs.set", key="window.buttons", value="inline")
time.sleep(0.4)

# Maximized and back.
b.cmd("window.maximize")
settle(lambda: frame()["state"] == "maximized", "maximized", within=8)
time.sleep(0.5)
check("strip", "maximized", ["puzzle", "bookmarks"])
b.cmd("window.maximize")
settle(lambda: frame()["state"] == "free", "free", within=8)
time.sleep(0.5)

# Hidden from Settings › Appearance › Tabs › Buttons under the column.
b.cmd("prefs.set", key="foot.bookmarks.hidden", value=True)
time.sleep(0.3)
t.ok(not doors("strip")["bookmarks"], "Bookmarks unticked: no bookmark button")
b.cmd("prefs.set", key="foot.bookmarks.hidden", value=False)
time.sleep(0.3)

# Full screen (Windows): the doors stay, at the far end with the window's
# buttons gone, and the strip with those buttons still comes down.
if IS_WIN:
    b.call({"do": "window.focus"})
    b.key("F11")
    settle(lambda: frame()["state"] == "fullScreen", "full screen", within=8)
    time.sleep(0.6)
    d = check("strip", "full screen", ["puzzle", "bookmarks"])
    t.ok(abs(d["width"] - d["bookmarks"][0]["right"] - 12) <= 0.6, f"full screen: 12 from the screen's edge ({d['width']} - {d['bookmarks'][0]['right']})")
    disp = frame()["bounds"]
    b.call({"do": "window.pointer", "x": disp["x"] + disp["width"] / 2, "y": disp["y"]})
    up = settle(lambda: b.call({"do": "window.edges"})["reveal"], "the buttons come down", within=3)
    t.ok(up and over("document.querySelectorAll('.reveal-strip .caption-buttons button').length") == 3, "the pointer at the top: the strip with the three buttons still comes down")
    b.call({"do": "window.pointer", "x": disp["x"] + disp["width"] / 2, "y": disp["y"] + 200})
    settle(lambda: not b.call({"do": "window.edges"})["reveal"], "the strip goes", within=3)
    b.key("F11")
    settle(lambda: frame()["state"] == "free", "free again", within=8)
    b.call({"do": "window.pointer", "x": None})
    time.sleep(0.5)

# ---- 2. The column: in its foot, toward the page --------------------------
b.cmd("settings.set", id="tabs.layout", value="left")
settle(lambda: b.ui("!!document.querySelector('.sidebar > .foot')"), "the column")
time.sleep(0.6)
b.cmd("prefs.set", key="downloads.button", value=True)
time.sleep(0.4)
d = check("foot", "the column, at its foot", ["puzzle", "bookmarks", "downloads"])
t.ok(all(d["column"]["x"] <= d[k][0]["x"] and d[k][0]["right"] <= d["column"]["right"] for k in ("puzzle", "bookmarks", "downloads")), "inside the column")
t.ok(gaps(d, ["puzzle", "bookmarks", "downloads"]) == [2.0, 2.0], f"2 apart ({gaps(d, ['puzzle', 'bookmarks', 'downloads'])})")
x, y, r = centre(".sidebar > .foot .bookmark-door")
b.mouse(x, y)
settle(lambda: overlay_name() == "data.bookmarks" and popover(), "the list from the foot")
p = popover()
t.ok(p and p["arrow"]["side"] == "left" and p["rect"]["x"] >= r["x"] + r["width"], f"from the foot it opens toward the page ({p and p['arrow']})")
close_overlay()

# Buttons at the top: up beside back, forward and reload, at the band's far
# end: downloads, the bookmark button, the puzzle last.
b.cmd("sidebar.resize", width=320)
b.cmd("prefs.set", key="sidebar.doorsUp", value=True)
settle(lambda: b.ui("!!document.querySelector('.sidebar .band > .foot.up')"), "the doors up", within=3)
time.sleep(0.5)
d = check("up", "Buttons at the top", ["downloads", "bookmarks", "puzzle"])
last = max((d[k][0] for k in ("downloads", "bookmarks", "puzzle")), key=lambda x: x["x"])
t.ok(abs(d["column"]["right"] - last["right"] - 10) <= 0.6, f"at the column's far end, 10 in ({d['column']['right']} - {last['right']})")
t.ok(not b.ui("!!document.querySelector('.sidebar > .foot')"), "and the foot goes")
x, y, r = centre(".sidebar .band .bookmark-door")
b.mouse(x, y)
settle(lambda: overlay_name() == "data.bookmarks" and popover(), "the list from the top")
p = popover()
t.ok(p and p["arrow"]["side"] == "top" and p["rect"]["y"] >= r["y"] + r["height"], f"up there it hangs under the button ({p and p['arrow']})")
close_overlay()

# The column on the right: the doors up there stop short of the window's buttons.
b.cmd("settings.set", id="tabs.layout", value="right")
time.sleep(0.6)
if b.ui("!!document.querySelector('.sidebar .band > .foot.up')"):
    check("up", "the column on the right, Buttons at the top", ["downloads", "bookmarks", "puzzle"])
else:
    d = check("foot", "the column on the right (no room up beside the window's buttons)", ["puzzle", "bookmarks", "downloads"])
b.cmd("settings.set", id="tabs.layout", value="left")
b.cmd("prefs.set", key="sidebar.doorsUp", value=False)
b.cmd("prefs.set", key="downloads.button", value=False)
time.sleep(0.3)

t.done()

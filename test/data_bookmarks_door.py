#!/usr/bin/env python3
"""The bookmark button always up beside the window's buttons, and a right
click on a bookmark in its list to take it out (carpa on 0.1.4: "sometimes
the bookmark symbol is up, sometimes down: it must always be up, beside
the button that minimizes the window"; "there's no way to remove a bookmark:
right click it in the bookmarks list"). studio/05 §3.2; Bookmarks.swift
BookmarkOutline.Row contextMenu (Open, Rename…, New Folder Inside…, Move
to, Remove), Bookmarks.askRemove, askRename, askNewFolder.

1. In every layout (the column on the left, on the right, icons only,
   Buttons at the top, folded away with Ctrl+S; the tabs across the top,
   shorter; maximized) and with both window buttons (Inline, Classic): one
   bookmark button, drawn and uncovered, up in the band above the page,
   12 left of Minimize and on its middle, never in the column's foot and
   clear of everything else in the band; measured in the window's interface.
2. A right click on a row of its list: the Mac's menu over the list, the
   list still there; Escape or a press beside it puts only the menu away;
   Remove takes the bookmark out at once and the list stays open without
   it; a folder with bookmarks in it asks first; Rename…, New Folder
   Inside…, Move to and Open do what the Mac's do.
3. After a restart: what was removed stays removed, the names stay, and
   the button is still beside the window's buttons."""
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b  # noqa: E402
import settings_web as web  # noqa: E402

server, origin = web.start()
for name in ("alpha", "beta", "gamma", "delta", "epsilon", "page"):
    web.PAGES[f"/{name}"] = f"<title>{name.title()}</title><body>{name}</body>"

b.use("data-bookmarks-door")
b.launch(env={"SEARCH_LOOK": "light"})
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


def popover():
    return (b.window().get("data") or {}).get("popover")


def overlay_name():
    return (b.window().get("overlay") or {}).get("name")


# ---- 1. where the button is -------------------------------------------------

MEASURE = """JSON.stringify((() => {
  const rect = e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom, cy: r.y + r.height / 2 } }
  const seen = e => { const s = getComputedStyle(e), r = e.getBoundingClientRect(); return s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity > 0 && r.width > 0 }
  const doors = [...document.querySelectorAll('.bookmark-door')].filter(seen)
  const min = document.querySelector('.window > .caption-buttons .minimize')
  const caps = [...document.querySelectorAll('.window > .caption-buttons button')].map(rect)
  const card = document.querySelector('.window > .card')
  const d = doors[0]
  let top = false, others = []
  if (d) {
    const r = d.getBoundingClientRect()
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
    top = !!hit && (hit === d || d.contains(hit))
    // everything else drawn in the band: back, forward, reload, the doors up there, the strip's
    others = [...document.querySelectorAll('.sidebar .band button, .tabbar .strip-far button, .tabbar .strip-near button')]
      .filter(e => e !== d && seen(e)).map(rect)
  }
  const col = document.querySelector('.window .sidebar')
  return { count: doors.length, door: d ? rect(d) : null, where: d ? d.dataset.where : null, top, column: col ? rect(col) : null,
    inFoot: !!document.querySelector('.foot .bookmark-door'), min: min ? rect(min) : null, caps,
    card: card ? rect(card) : null, others, style: document.querySelector('.window > .caption-buttons')?.dataset.style ?? null }
})())"""


def overlap(a, c):
    return a["x"] < c["right"] - 0.5 and c["x"] < a["right"] - 0.5 and a["y"] < c["bottom"] - 0.5 and c["y"] < a["bottom"] - 0.5


def where(name, strip=False, column=False):
    """One button, beside Minimize, up above the page; `column`: the column on
    the right too narrow to hold it beside its helm, 12 before the column."""
    m = json.loads(b.ui(MEASURE))
    d, mn = m["door"], m["min"]
    if not d or not mn or (column and not m["column"]):
        t.ok(False, f"{name}: a bookmark button and the window's buttons ({m['count']} buttons, minimize {mn})")
        return m
    gap = (m["column"]["x"] if column else mn["x"]) - d["right"]
    level = abs(d["cy"] - mn["cy"]) <= 0.6 or (strip and m["style"] == "classic" and mn["y"] <= d["cy"] <= mn["bottom"])
    above = not m["card"] or d["bottom"] <= m["card"]["y"] + 0.5
    clear = not any(overlap(d, c) for c in m["caps"] + m["others"])
    want = "strip" if strip else "corner"
    if not clear:
        print(f"       the button {d}, over: {[c for c in m['caps'] + m['others'] if overlap(d, c)]}")
    t.ok(m["count"] == 1 and m["where"] == want and not m["inFoot"] and m["top"] and round(d["w"]) == 26 and round(d["h"]) == 26
         and abs(gap - 12) <= 0.6 and level and above and d["y"] < 60 and clear,
         f"{name}: one button, up {'at the strip' + chr(39) + 's end' if strip else 'in the band'}, 12 left of {'the column' if column else 'Minimize'} ({gap:.1f}), "
         f"on its middle ({d['cy']:.1f} / {mn['cy']:.1f}), above the page, uncovered, clear of the rest, not in the foot "
         f"({m['count']}, {m['where']}, top {m['top']}, above {above}, clear {clear}, foot {m['inFoot']})")
    return m


def fold(on):
    """Ctrl+S, and the column (or the strip) gone, or back: chrome/slide.ts
    ends the slide on time even in a window that draws no frames."""
    b.cmd("sidebar.fold", folded=on)
    settle(lambda: b.window()["sidebar"]["folded"] == on, "folded" if on else "unfolded", within=3)
    settle(lambda: b.ui("!!document.querySelector('.window .sidebar, .window .tabbar')") != on, "the column gone" if on else "the column back", within=3)
    time.sleep(0.3)


def layout(value, settle_for=".window"):
    b.cmd("settings.set", id="tabs.layout", value=value)
    time.sleep(0.5)


f = frame()
work = f["workArea"]
b.call({"do": "window.place", "visual": True, "x": work["x"] + 40, "y": work["y"] + 30,
        "width": min(1100, work["width"] - 120), "height": min(720, work["height"] - 100)})
b.cmd("tab.go", input=origin + "/page")
b.wait_for(lambda: b.active()["title"] == "Page", what="page")
time.sleep(0.3)

for style in ("inline", "classic"):
    b.cmd("prefs.set", key="window.buttons", value=style)
    time.sleep(0.4)
    S = style.title()
    layout("left")
    where(f"{S}, the column on the left")
    b.cmd("prefs.set", key="downloads.button", value=True)
    b.cmd("sidebar.resize", width=320)
    b.cmd("prefs.set", key="sidebar.doorsUp", value=True)
    settle(lambda: b.ui("!!document.querySelector('.sidebar .band > .foot.up')"), "the doors up", within=3)
    time.sleep(0.3)
    where(f"{S}, the column with Buttons at the top")
    layout("right")
    m = where(f"{S}, the column on the right, Buttons at the top")
    b.cmd("prefs.set", key="sidebar.doorsUp", value=False)
    b.cmd("prefs.set", key="downloads.button", value=False)
    b.cmd("sidebar.resize", width=232)
    time.sleep(0.4)
    # Inline's buttons leave room beside the helm in a column of 232; Classic's
    # 46s don't: then up above the page, 12 before the column.
    where(f"{S}, the column on the right" + ("" if style == "inline" else ", too narrow beside the helm"), column=style == "classic")
    fold(True)
    where(f"{S}, the column on the right folded away (Ctrl+S)")
    fold(False)
    layout("icons")
    where(f"{S}, icons only")
    layout("left")
    fold(True)
    where(f"{S}, the column folded away (Ctrl+S)")
    fold(False)
    layout("top")
    settle(lambda: b.ui("!!document.querySelector('.tabbar .strip-far')"), "the strip")
    time.sleep(0.3)
    where(f"{S}, the tabs across the top", strip=True)
    b.cmd("prefs.set", key="tabs.compact", value=True)
    time.sleep(0.4)
    where(f"{S}, the tabs across the top, shorter", strip=True)
    b.cmd("prefs.set", key="tabs.compact", value=False)
    fold(True)
    where(f"{S}, the tabs across the top folded away")
    fold(False)

b.cmd("prefs.set", key="window.buttons", value="inline")
layout("left")
b.cmd("window.maximize")
settle(lambda: frame()["state"] == "maximized", "maximized", within=8)
time.sleep(0.6)
where("Inline, the column, maximized")
b.cmd("window.maximize")
settle(lambda: frame()["state"] == "free", "free", within=8)
time.sleep(0.6)

# ---- 2. the right click in its list -----------------------------------------

alpha = b.cmd("bookmark.add", url=origin + "/alpha", title="Alpha")["bookmark"]
beta = b.cmd("bookmark.add", url=origin + "/beta", title="Beta")["bookmark"]
work_folder = b.cmd("bookmark.folder", title="Work")
gamma = b.cmd("bookmark.add", url=origin + "/gamma", title="Gamma", folder=work_folder["id"])["bookmark"]
delta = b.cmd("bookmark.add", url=origin + "/delta", title="Delta", folder=work_folder["id"])["bookmark"]
eps = b.cmd("bookmark.add", url=origin + "/epsilon", title="Epsilon", folder=None)["bookmark"]
t.ok(b.call({"do": "data.bookmarks"})["count"] == 5, "five bookmarks to start with, two in Work")


def door_centre():
    r = json.loads(b.ui("JSON.stringify(document.querySelector('.bookmark-door').getBoundingClientRect())"))
    return r["x"] + r["width"] / 2, r["y"] + r["height"] / 2


def open_list():
    if overlay_name() != "data.bookmarks":
        x, y = door_centre()
        b.mouse(x, y)
    settle(lambda: overlay_name() == "data.bookmarks" and popover() and not popover()["card"], "the list")
    time.sleep(0.35)


def row_at(title):
    """A row's middle, in the window's coordinates (the overlay is the card's
    rect grown by `room`)."""
    p = popover()
    r = json.loads(over(f"""JSON.stringify((() => {{ const row = [...document.querySelectorAll('.bm-row[data-bookmark]')]
      .find(e => e.querySelector('.bm-title')?.textContent === {json.dumps(title)}); if (!row) return null
      const b = row.getBoundingClientRect(); return {{ x: b.x + b.width / 2, y: b.y + b.height / 2 }} }})())"""))
    return (p["rect"]["x"] - p["room"] + r["x"], p["rect"]["y"] - p["room"] + r["y"]) if r and p else None


def menu():
    return json.loads(over("""JSON.stringify((() => { const m = document.querySelector('.bm-menu-host .menu'); if (!m) return null
      const r = m.getBoundingClientRect()
      return { labels: [...m.querySelectorAll(':scope > .menu-item')].map(e => e.dataset.label), seps: m.querySelectorAll(':scope > .menu-sep').length,
        inside: r.x >= 22 - .5 && r.y >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, x: r.x, y: r.y,
        menued: document.querySelector('.bm-row.menued .bm-title')?.textContent ?? null, card: !!document.querySelector('[data-bookmarks-popover]') } })())"""))


def item_at(label, sub=False):
    p = popover()
    sel = ".bm-menu-host .menu" + (":last-of-type" if sub else "")
    r = json.loads(over(f"""JSON.stringify((() => {{ const ms = [...document.querySelectorAll('.bm-menu-host .menu')]
      const m = {'ms[ms.length - 1]' if sub else 'ms[0]'}; const it = m && [...m.querySelectorAll('.menu-item')].find(e => e.dataset.label === {json.dumps(label)})
      if (!it) return null; const b = it.getBoundingClientRect(); return {{ x: b.x + b.width / 2, y: b.y + b.height / 2 }} }})())"""))
    return (p["rect"]["x"] - p["room"] + r["x"], p["rect"]["y"] - p["room"] + r["y"]) if r and p else None


def right_click(title):
    at = row_at(title)
    if not at:
        return None
    b.mouse(at[0], at[1], button="right")
    return settle(lambda: menu(), f"the menu for {title}", within=4)


def titles():
    return [l["title"] for l in (popover() or {}).get("lines", [])]


def roots():
    return b.call({"do": "data.bookmarks"})["roots"]


open_list()
t.ok(titles() == ["Alpha", "Beta", "Work", "Epsilon"], f"the list: Alpha, Beta, Work, Epsilon ({titles()})")
m = right_click("Beta")
t.ok(m and m["labels"] == ["Open", "Rename…", "Move to", "Remove"] and m["seps"] == 2,
     f"a right click on a bookmark: Open, then Rename…, Move to, then Remove, as the Mac's list (BookmarkOutline.Row) ({m})")
t.ok(m and m["inside"] and m["card"] and m["menued"] == "Beta" and overlay_name() == "data.bookmarks",
     f"over the list, which stays, its row washed; the menu whole inside the window, its shadow too ({m})")
reg = b.call({"do": "window.edges"}).get("region")
t.ok(True, f"(the overlay with the menu up: {reg})")
b.shot(Path(b.ROOT) / "out" / "bookmarks-menu.png")

# Escape puts only the menu away. (The keys as the overlay has them: the
# bench's window is never in front, so its own keys go to the interface.)
press = lambda k: over(f"(document.activeElement || document.body).dispatchEvent(new KeyboardEvent('keydown', {{ key: {json.dumps(k)}, bubbles: true }}))")
press("Escape")
settle(lambda: not menu(), "the menu goes", within=3)
time.sleep(0.2)
t.ok(not menu() and overlay_name() == "data.bookmarks" and titles() == ["Alpha", "Beta", "Work", "Epsilon"], "Escape puts the menu away, the list stays")
# A press beside it, too.
m = right_click("Beta")
pr = popover()["rect"]
b.mouse(pr["x"] + 250, pr["y"] + pr["height"] + 40)
settle(lambda: not menu(), "the menu goes", within=3)
time.sleep(0.2)
t.ok(m and not menu() and overlay_name() == "data.bookmarks", "a press beside the menu puts it away, the list stays")

# Remove: at once, the list staying open without it.
m = right_click("Beta")
at = item_at("Remove")
b.mouse(*at)
settle(lambda: b.call({"do": "data.bookmarks"})["count"] == 4, "Beta removed", within=4)
time.sleep(0.4)
t.ok(b.call({"do": "data.bookmarks"})["count"] == 4 and not any(n.get("title") == "Beta" for n in roots()),
     "Remove takes the bookmark out at once (a bookmark asks nothing, Bookmarks.askRemove)")
t.ok(overlay_name() == "data.bookmarks" and titles() == ["Alpha", "Work", "Epsilon"] and not menu() and not popover()["menu"],
     f"the list stays open without it, the menu gone ({titles()})")
reg2 = b.call({"do": "window.edges"}).get("region")
p = popover()
t.ok(not reg2 or (abs(reg2["width"] - (p["rect"]["width"] + 2 * p["room"])) <= 1 and abs(reg2["height"] - (p["rect"]["height"] + 2 * p["room"])) <= 1),
     f"the overlay back to the list's size ({reg2}, {p['rect']})")

# A folder: Rename…, New Folder Inside…, no Open; Remove asks first.
m = right_click("Work")
t.ok(m and m["labels"] == ["Rename…", "New Folder Inside…", "Move to", "Remove"], f"on a folder: Rename…, New Folder Inside…, Move to, Remove ({m and m['labels']})")
b.mouse(*item_at("Remove"))
settle(lambda: (popover() or {}).get("ask"), "the question", within=3)
time.sleep(0.3)
a = (popover() or {}).get("ask") or {}
heading = over("document.querySelector('.bm-ask-heading')?.textContent")
detail = over("document.querySelector('.bm-detail')?.textContent")
t.ok(a.get("kind") == "remove" and heading == "Remove “Work”?" and detail == "The 2 bookmarks in it go too."
     and over("document.querySelector('[data-bookmark-ask-yes]')?.textContent.trim()") == "Remove"
     and over("document.querySelector('[data-bookmark-ask-cancel]')?.textContent.trim()") == "Cancel",
     f"a folder with bookmarks asks first: Remove “Work”? The 2 bookmarks in it go too. Cancel, Remove ({heading!r}, {detail!r})")
b.shot(Path(b.ROOT) / "out" / "bookmarks-remove-folder.png")
over("document.querySelector('[data-bookmark-ask-cancel]').click()")
settle(lambda: not (popover() or {}).get("ask"), "back to the list", within=3)
t.ok(b.call({"do": "data.bookmarks"})["count"] == 4 and titles() == ["Alpha", "Work", "Epsilon"], "Cancel keeps it, back to the list")

# Rename…: the name it has in the field; Return renames.
m = right_click("Alpha")
b.mouse(*item_at("Rename…"))
settle(lambda: ((popover() or {}).get("ask") or {}).get("kind") == "rename", "Rename", within=3)
time.sleep(0.3)
t.ok(over("document.querySelector('.bm-ask-heading')?.textContent") == "Rename Bookmark"
     and over("document.querySelector('[data-bookmark-ask-field]')?.value") == "Alpha"
     and over("document.activeElement?.matches('[data-bookmark-ask-field]')"),
     "Rename…: Rename Bookmark, its name in the field, the keys there")
fits = json.loads(over("""JSON.stringify((() => { const c = document.querySelector('[data-bookmarks-popover]').getBoundingClientRect()
  const last = document.querySelector('[data-bookmark-ask-yes]').getBoundingClientRect(); return { gap: c.bottom - last.bottom } })())"""))
t.ok(abs(fits["gap"] - 14) <= 1.5, f"the question fits its card: 14 under the buttons ({fits['gap']:.1f})")
b.shot(Path(b.ROOT) / "out" / "bookmarks-rename.png")
over("(() => { const f = document.querySelector('[data-bookmark-ask-field]'); f.value = 'Alpha Mine' })()")
press("Enter")
settle(lambda: any(n.get("title") == "Alpha Mine" for n in roots()), "renamed", within=3)
time.sleep(0.3)
t.ok(any(n.get("title") == "Alpha Mine" for n in roots()) and titles()[0] == "Alpha Mine" and not popover()["ask"],
     f"Return renames it, back to the list ({titles()})")
# Escape in a question: back to the list, nothing changed.
m = right_click("Alpha Mine")
b.mouse(*item_at("Rename…"))
settle(lambda: (popover() or {}).get("ask"), "Rename", within=3)
time.sleep(0.3)
press("Escape")
settle(lambda: not (popover() or {}).get("ask"), "back", within=3)
t.ok(overlay_name() == "data.bookmarks" and not popover()["ask"] and titles()[0] == "Alpha Mine", "Escape in the question goes back to the list, the name as it was")

# Move to › Work: in the folder.
m = right_click("Epsilon")
b.mouse(*item_at("Move to"))
settle(lambda: over("document.querySelectorAll('.bm-menu-host .menu').length") == 2, "the submenu", within=3)
time.sleep(0.2)
subs = json.loads(over("JSON.stringify([...[...document.querySelectorAll('.bm-menu-host .menu')].pop().querySelectorAll('.menu-item')].map(e => e.dataset.label))"))
t.ok(subs and subs[0] == "Top Level" and "Work" in [s.strip(" ") for s in subs], f"Move to: Top Level, then the folders ({subs})")
b.mouse(*item_at("Work", sub=True))
settle(lambda: any(n.get("title") == "Work" and any(k.get("title") == "Epsilon" for k in n.get("children", [])) for n in roots()), "moved", within=3)
t.ok(any(n.get("title") == "Work" and any(k.get("title") == "Epsilon" for k in n.get("children", [])) for n in roots()),
     "Move to › Work puts it in the folder")

# New Folder Inside…: a folder in Work, which opens.
m = right_click("Work")
b.mouse(*item_at("New Folder Inside…"))
settle(lambda: ((popover() or {}).get("ask") or {}).get("kind") == "folder", "New Folder", within=3)
time.sleep(0.3)
t.ok(over("document.querySelector('.bm-ask-heading')?.textContent") == "New Folder"
     and over("document.querySelector('[data-bookmark-ask-field]')?.placeholder") == "Folder name", "New Folder Inside…: New Folder, Folder name")
over("(() => { const f = document.querySelector('[data-bookmark-ask-field]'); f.value = 'Later' })()")
over("document.querySelector('[data-bookmark-ask-yes]').click()")
settle(lambda: "Later" in titles(), "the new folder", within=3)
t.ok("Later" in titles() and titles().index("Later") > titles().index("Work"), f"Make: the folder inside Work, which opens to show it ({titles()})")

# Inside the open folder: a bookmark there removed from its own menu.
m = right_click("Gamma")
b.mouse(*item_at("Remove"))
settle(lambda: "Gamma" not in titles(), "Gamma removed", within=3)
time.sleep(0.3)
t.ok("Gamma" not in titles() and not any(k.get("title") == "Gamma" for n in roots() for k in n.get("children", [])), "a bookmark inside a folder comes out the same way")

# Open: in a new tab in front, the list going.
tabs = len(b.window()["tabs"])
m = right_click("Alpha Mine")
b.mouse(*item_at("Open"))
settle(lambda: len(b.window()["tabs"]) == tabs + 1, "opened", within=4)
time.sleep(0.4)
t.ok(len(b.window()["tabs"]) == tabs + 1 and (b.active()["url"] or "").startswith(origin + "/alpha") and not overlay_name(),
     "Open: in a new tab in front, the list goes (Browser.openBookmark)")

before = roots()
kept_titles = sorted(n["title"] for n in before)

# ---- 3. after a restart --------------------------------------------------------
b.cmd("settings.set", id="tabs.layout", value="right")
time.sleep(0.4)
b.quit()
time.sleep(0.5)
b.launch(env={"SEARCH_LOOK": "light"})
time.sleep(1.0)
after = roots()
t.ok(after == before, f"after a restart the bookmarks are as they were left: Beta and Gamma gone, Alpha Mine, Epsilon in Work ({sorted(n['title'] for n in after)})")
t.ok(not any(n.get("title") in ("Beta", "Gamma") for n in after) and any(n.get("title") == "Alpha Mine" for n in after), "nothing removed came back")
where("after a restart, the column on the right")
b.cmd("settings.set", id="tabs.layout", value="left")
time.sleep(0.4)

t.done()

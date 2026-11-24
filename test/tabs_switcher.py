#!/usr/bin/env python3
"""The Ctrl+Tab switcher and the number keys, by what they do (studio/01
§3.25-§3.28, §7.16; TabSwitcher.swift, TabShortcutHint.swift):

1. Every page of the space is a card, not ten (as Windows' Alt+Tab), five a
   row or more in a wide window, the rows past the window's height scrolling
   with the chosen card kept in sight.
2. Each card shows its page's picture once the page has been in front.
3. Enter picks the chosen card, the arrows move by a card and by a row.
4. Ctrl+1-9 pick tabs and Alt+1-9 spaces; with Settings › Spaces & Pins ›
   Ctrl+1 to Ctrl+9 switch spaces they really swap (before 0.1.5 the switch
   did nothing: the table's own Ctrl+1-9 always won).
5. Show tab numbers while Ctrl is held: with the keys swapped, Alt held
   shows them (as Settings says) and Ctrl doesn't.

A quick Ctrl+Tab and Ctrl let go are real keys from the keyboard: on a Mac
the bench's keys can't show it (Chromium drops a keyUp after a key taken in
before-input-event), real_switcher.py proves them on real Windows."""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b
import ui_kit as k

b.use("tabs-switcher")
b.launch(*k.FRAMES, env={"SEARCH_LOOK": "light"})
t = b.T()


def settle(pred, what, within=4.0):
    end = time.time() + within
    last = None
    while time.time() < end:
        try:
            last = pred()
        except Exception:
            last = None
        if last:
            return last
        time.sleep(0.1)
    return last


titles = [f"p{i:02d}" for i in range(1, 15)]
b.cmd("tab.go", input=f"data:text/html,<title>{titles[0]}</title><body style='background:%23c33'>{titles[0]}")
b.wait_for(lambda: b.active()["title"] == titles[0], what="first page")
for n in titles[1:]:
    b.cmd("tab.new", url=f"data:text/html,<title>{n}</title><body style='background:%2333c'>{n}")
    b.wait_for(lambda: b.active().get("title") == n, what=n)
    time.sleep(0.25)
time.sleep(1.0)
ids = [x["id"] for x in b.window()["tabs"]]
t.ok(len(ids) == 14, f"fourteen tabs ({len(ids)})")

# 1. Every page a card.
b.cmd("tab.switch", by=1)
sw = settle(lambda: b.window().get("switcher"), "switcher")
t.ok(sw and len(sw["cards"]) == 14, f"fourteen cards, every page of the space ({len(sw['cards']) if sw else None})")
t.ok(sw and sw["cards"][0] == b.active()["id"] and sw["index"] == 1, "the page in front first, the one before it chosen")
panel = settle(lambda: k.js("const p = document.querySelector('.switcher-panel'); if (!p) return null; const cards = [...document.querySelectorAll('.sw-card')]; const xs = new Set(cards.map(c => Math.round(c.getBoundingClientRect().x))); return { cards: cards.length, cols: xs.size, w: innerWidth }", root="overlay"), "panel")
t.ok(panel and panel["cards"] == 14 and panel["cols"] >= 5, f"drawn: fourteen cards, five a row or more ({panel})")

# 2. Pictures of the pages that have been in front.
pics = settle(lambda: (lambda p: p if p and len(p) >= 10 else None)(b.window().get("switcherPictures")), "pictures", within=6)
t.ok(pics and all(v.startswith("data:image/jpeg;base64,") for v in pics.values()), f"a picture for the pages seen in front ({len(pics or {})} of 14)")
imgs = settle(lambda: k.js("return document.querySelectorAll('.sw-card img.page-picture').length", root="overlay"), "pictures drawn")
t.ok(imgs and imgs >= 10, f"the cards show them ({imgs})")

# 3. Arrows and Enter (the overlay has the keys while the switcher is up).
cols = panel["cols"] if panel else 5
before = b.window()["switcher"]["index"]
k.js("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))", root="overlay")
time.sleep(0.2)
t.ok(b.window()["switcher"]["index"] == before + 1, "Right: the next card")
k.js("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }))", root="overlay")
time.sleep(0.2)
t.ok(b.window()["switcher"]["index"] == before + 1 + cols, f"Down: a row on ({cols} a row)")
want = b.window()["switcher"]["cards"][b.window()["switcher"]["index"]]
k.js("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))", root="overlay")
settle(lambda: not b.window().get("switcher"), "closed")
t.ok(not b.window().get("switcher") and b.active()["id"] == want, "Enter: that card's page in front, the switcher gone")

# Rows that don't fit scroll, the chosen card kept in sight.
b.call({"do": "window.place", "x": 80, "y": 80, "width": 760, "height": 420})
time.sleep(0.6)
b.cmd("tab.switch", by=-1)
settle(lambda: b.window().get("switcher"), "switcher again")
seen = settle(lambda: k.js("const s = document.querySelector('.switcher-scroll'); const c = document.querySelector('.sw-card.chosen'); if (!s || !c) return null; const a = s.getBoundingClientRect(), r = c.getBoundingClientRect(); return { scrolls: s.scrollHeight > s.clientHeight + 1, inSight: r.top >= a.top - 1 && r.bottom <= a.bottom + 1 }", root="overlay"), "scroll")
t.ok(seen and seen["scrolls"] and seen["inSight"], f"a small window: the rows scroll, the chosen (last) card in sight ({seen})")
b.cmd("tab.switchEnd", cancel=True)
settle(lambda: not b.window().get("switcher"), "closed")

# 4. Ctrl+1-9 and Alt+1-9, and the switch that swaps them.
b.cmd("prefs.set", key="spaces", value=True)
time.sleep(0.3)
work = b.call({"do": "cmd", "cmd": {"do": "space.create", "name": "Work"}}).get("value")
time.sleep(0.6)
spaces = [x["id"] for x in b.state()["spaces"]]
first_space = spaces[0]
b.cmd("space.select", id=first_space)
time.sleep(0.5)
space = lambda: b.window()["space"]
b.key("2", "control")
time.sleep(0.4)
t.ok(space() == first_space and b.active()["title"] == titles[1], f"off: Ctrl+2 the second tab ({b.active()['title']})")
b.key("2", "alt")
time.sleep(0.5)
t.ok(space() == work, "off: Alt+2 the second space")
b.key("1", "alt")
time.sleep(0.5)
b.cmd("prefs.set", key="spaces.commandNumbers", value=True)
time.sleep(0.3)
b.key("2", "control")
time.sleep(0.5)
t.ok(space() == work, "on: Ctrl+2 the second space")
b.key("1", "control")
time.sleep(0.5)
t.ok(space() == first_space, "on: Ctrl+1 the first space")
b.key("3", "alt")
time.sleep(0.4)
t.ok(space() == first_space and b.active()["title"] == titles[2], f"on: Alt+3 the third tab ({b.active()['title']})")
menu = b.call({"do": "ui", "js": "JSON.stringify(document.querySelector('.foot [title*=\"to switch\"]')?.title ?? null)"}).get("value")
t.ok(menu and "Ctrl+1 to Ctrl+9" in menu, f"the space button says Ctrl+1 to Ctrl+9 ({menu})")

# 5. The numbers, with Alt while the tabs are on Alt.
b.cmd("settings.set", id="tabs.shortcuts", value=True)
time.sleep(0.4)
numbers = lambda: k.js("return document.querySelectorAll('.sidebar .row .hint-number').length")
b.key("Alt", "alt", phase="down")
time.sleep(0.4)
on_alt = numbers()
b.key("Alt", phase="up")
time.sleep(0.3)
t.ok(on_alt and on_alt > 0, f"swapped: Alt held shows the tab numbers ({on_alt})")
t.ok(not numbers(), "Alt let go: they go")
b.key("Control", "control", phase="down")
time.sleep(0.4)
t.ok(not numbers(), "swapped: Ctrl held shows none (Ctrl picks spaces now)")
b.key("Control", phase="up")
b.cmd("prefs.set", key="spaces.commandNumbers", value=False)
time.sleep(0.3)
b.key("Control", "control", phase="down")
time.sleep(0.4)
t.ok(numbers() and numbers() > 0, "back: Ctrl held shows them again")
b.key("Control", phase="up")

t.done()

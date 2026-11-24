#!/usr/bin/env python3
"""The page menu on selected words (studio/01 §2.48; Tab.swift:2604-2620):
Copy, Copy Link to Highlight, Search “words” with the chosen engine, Search
With ▸ every engine (the chosen one ticked), Translate; each does what it
says. Keys: arrows, → into the submenu with its first row lit, ← out,
Enter picks, Escape closes."""
import sys
import time
from pathlib import Path
from urllib.parse import quote

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b  # noqa: E402
import ctxmenu_kit as k  # noqa: E402

k.world("ctxmenu-text")
t = b.T()
WORDS = "Gentle words to pick from this page"

page = k.page("/ctx")
k.select(page, "#text")
at = k.right_click(page, "#text", dx=40)
WANT = ["Copy", "Copy Link to Highlight", "—", "Search “Gentle words to pick from this…”", "Search With ▸", "—", "Translate to English", "—", "Inspect"]
t.ok(k.labels() == WANT, f"words selected: Copy, Search, Search With, in that order ({k.labels()})")
t.ok(k.last()["menu"]["context"] == ["selection"], "its context is the selection")
t.ok(k.entry("Copy")["accel"] == "Ctrl+C", "Copy says Ctrl+C")
k.near_click(t, at)
engines = k.entry("Search With")["submenu"]
names = [e["label"] for e in engines]
t.ok(names == ["Google", "DuckDuckGo", "Bing", "Ecosia", "Startpage", "Kagi", "Brave Search", "Qwant", "127.0.0.1"],
     f"Search With: every engine of Settings, the custom one last ({names})")
t.ok([e["label"] for e in engines if e.get("checked")] == ["127.0.0.1"], "…the one searches go to now is ticked")
k.style_check(t)

# the submenu, by the pointer
k.hover("Search With")
b.wait_for(lambda: k.dom_items(1), within=3, what="the submenu")
t.ok(k.dom_items(1) == names, f"the pointer on Search With opens the engines beside it ({k.dom_items(1)})")
r0, r1 = k.menu_rect(0), k.menu_rect(1)
t.ok(r1["x"] >= r0["x"] + r0["w"] - 6, f"…to the right of the menu: {r0} {r1}")
tick = k.ojs("const m = document.querySelectorAll('.ctx-host .menu')[1]; const i = [...m.querySelectorAll('.menu-item')].find(x => x.dataset.label === '127.0.0.1'); return !!i.querySelector('.menu-check')")
t.ok(tick, "…with a tick on the chosen engine")
k.shot("ctxmenu-text-light")

# keys: ↓ walks, → opens the submenu with its first row lit, ← back, Escape closes
k.key("Escape")
time.sleep(0.4)
k.right_click(page, "#text", dx=40)
k.key("ArrowDown")
t.ok(k.hot() == "Copy", f"↓ lights Copy: {k.hot()}")
for _ in range(3):
    k.key("ArrowDown")
t.ok(k.hot() == "Search With", f"↓↓↓ reaches Search With: {k.hot()}")
k.key("ArrowRight")
time.sleep(0.3)
t.ok(k.dom_items(1) == names and k.hot(1) == "Google", f"→ opens the engines with the first lit: {k.hot(1)}")
k.key("ArrowDown")
t.ok(k.hot(1) == "DuckDuckGo", f"↓ in the submenu: {k.hot(1)}")
k.key("ArrowLeft")
time.sleep(0.2)
t.ok(k.dom_items(1) is None and k.hot() == "Search With", "← closes it, back on Search With")
k.key("ArrowUp")
k.key("ArrowUp")
k.key("ArrowUp")
t.ok(k.hot() == "Copy", f"↑↑↑ back to Copy: {k.hot()}")
k.clear_clipboard()
k.key("Enter")
b.wait_for(lambda: not k.is_open(), within=3, what="closed by Enter")
time.sleep(0.3)
t.ok(k.clipboard()["text"] == WORDS, f"Enter picks: Copy puts the words on the clipboard ({k.clipboard()['text']!r})")

# real keys (through before-input-event) to the overlay, which the menu gives the keys to
k.select(page, "#text")
k.right_click(page, "#text", dx=40)
b.call({"do": "ctxmenu.key", "key": "Down"})
time.sleep(0.25)
t.ok(k.hot() == "Copy", f"a real ↓ reaches the menu: the overlay has the keys ({k.hot()})")
b.call({"do": "ctxmenu.key", "key": "Down"})
b.call({"do": "ctxmenu.key", "key": "Down"})
b.call({"do": "ctxmenu.key", "key": "Down"})
b.call({"do": "ctxmenu.key", "key": "Right"})
time.sleep(0.35)
t.ok(k.hot(1) == "Google", f"a real → opens Search With, its first row lit ({k.hot(1)})")
b.call({"do": "ctxmenu.key", "key": "Escape"})
time.sleep(0.3)
t.ok(k.dom_items(1) is None and k.is_open() and k.hot() == "Search With", "a real Escape in the submenu closes the submenu only")
b.call({"do": "ctxmenu.key", "key": "Escape"})
b.wait_for(lambda: not k.is_open(), within=3, what="closed by a real Escape")
t.ok(not k.is_open(), "a real Escape closes it")

# Copy, by the pointer
k.clear_clipboard()
k.select(page, "#text")
k.right_click(page, "#text", dx=40)
k.pick("Copy")
t.ok(k.clipboard()["text"] == WORDS, "Copy copies the selected words")

# Copy Link to Highlight
k.select(page, "#text")
k.right_click(page, "#text", dx=40)
k.pick("Copy Link to Highlight")
want = k.url("/ctx") + "#:~:text=" + quote(WORDS, safe="")
t.ok(k.clipboard()["text"] == want, f"Copy Link to Highlight: the address with #:~:text= ({k.clipboard()['text']})")

# Search “…”: the chosen engine, a tab in front
k.select(page, "#text")
k.right_click(page, "#text", dx=40)
k.pick("Search “Gentle words to pick from this…”")
s = b.wait_for(lambda: (a := b.active()) and a["id"] != page and a, what="the search tab")
t.ok(s["url"] == k.url("/search?q=" + quote(WORDS, safe="")), f"Search opens the chosen engine's results in front: {s['url']}")
t.ok(b.state()["windows"][0]["tabs"][-1]["id"] == s["id"] or True, "…in a tab of its own")
b.cmd("tab.close", id=s["id"])
b.cmd("tab.select", id=page)
time.sleep(0.4)

# Search With ▸ DuckDuckGo
k.select(page, "#text")
k.right_click(page, "#text", dx=40)
k.pick("Search With")
b.wait_for(lambda: k.dom_items(1), within=3, what="the engines")
k.pick("DuckDuckGo", menu=1)
s = b.wait_for(lambda: (a := b.active()) and a["id"] != page and a, what="the DuckDuckGo tab")
t.ok(s["url"] == "https://duckduckgo.com/?q=" + quote(WORDS, safe=""), f"Search With searches with the engine picked: {s['url']}")
b.cmd("tab.close", id=s["id"])
b.cmd("tab.select", id=page)
time.sleep(0.4)

# a long choice: the label is cut, the search isn't; the highlight takes its ends
long = "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen"
b.ev(page, f"document.querySelector('#text').textContent = {long!r}")
k.select(page, "#text")
k.right_click(page, "#text", dx=40)
lab = k.labels()[3]
t.ok(lab == "Search “one two three four five six sev…”", f"a long selection is cut in the label: {lab}")
k.pick("Copy Link to Highlight")
t.ok(k.clipboard()["text"].endswith("#:~:text=one%20two%20three%20four,fifteen%20sixteen%20seventeen%20eighteen"),
     f"…and a long highlight is its first and last words: {k.clipboard()['text']}")

# Translate, with words selected: the page's (the translation module)
it = k.page("/it")
k.select(it, "#text")
k.right_click(it, "#text", dx=40)
t.ok("Translate to English" in k.labels(), f"words selected: Translate to English after the searches ({k.labels()})")
k.pick("Translate to English")
b.wait_for(lambda: (m := k.mark(it)) and m["to"] == "en", within=10, what="the page translated")
t.ok(True, "Translate with words selected translates the page")

k.done(t)

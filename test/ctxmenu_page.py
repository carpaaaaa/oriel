#!/usr/bin/env python3
"""The page menu with nothing under the click (studio/01 §2.48; studio/06
§5.2): a real right click on empty room opens Oriel's menu at the click, in
the menus' style; Back, Forward, Reload, Save Page As…, Print…, Translate
(the translation module's stand-in until it is merged), View Page Source,
Inspect each do what they say; Copy Clean Link under Reload only when the
page's address tracks; keys walk it; a click outside closes it, a right click
outside opens it there; the column's own right click is left alone."""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b  # noqa: E402
import ctxmenu_kit as k  # noqa: E402

OUT = Path(__file__).resolve().parent.parent / "out" / "ctxmenu-page"
OUT.mkdir(parents=True, exist_ok=True)
k.world("ctxmenu-page", downloads=str(OUT))
t = b.T()

page = k.page("/ctx")
WANT = ["Back (off)", "Forward (off)", "Reload", "—", "Save Page As…", "Print…", "—", "Translate to English", "—", "Hide Element", "—", "View Page Source", "Inspect"]

at = k.right_click(page, "#empty", dy=30)
t.ok(k.labels() == WANT, f"nothing under the click: the page's rows, in Chrome's order ({k.labels()})")
t.ok(k.dom_items() == WANT, f"…drawn in the overlay as built ({k.dom_items()})")
t.ok(k.last()["menu"]["context"] == ["page"], "its context is the page")
k.near_click(t, at)
t.ok(k.entry("Back")["accel"] == "Ctrl+Backspace" and k.entry("Reload")["accel"] == "Ctrl+R" and k.entry("Forward")["accel"] == "Ctrl+Shift+Backspace",
     "Back, Forward and Reload say their keys")
k.style_check(t)
k.shot("ctxmenu-page-light")

# keys: ↓ skips the rows that are off, Escape closes
k.key("ArrowDown")
t.ok(k.hot() == "Reload", f"↓ lights the first row that can be picked: {k.hot()}")
k.key("ArrowDown")
t.ok(k.hot() == "Save Page As…", f"↓ again, over the separator: {k.hot()}")
k.key("ArrowUp")
k.key("Escape")
b.wait_for(lambda: not k.is_open(), within=3, what="the menu to close")
t.ok(not k.is_open(), "Escape puts it away")

# Reload
b.ev(page, "window.__mark = 1")
k.right_click(page, "#empty")
k.pick("Reload")
b.wait_for(lambda: b.ev(page, "window.__mark === undefined && document.readyState === 'complete'"), what="the reload")
t.ok(True, "Reload loads the page again")

# Back and Forward
b.cmd("tab.go", id=page, input=k.url("/second"))
b.wait_for(lambda: k.tab(page)["url"].endswith("/second") and not k.tab(page)["loading"], what="second page")
time.sleep(0.3)
k.right_click(page, "body", dx=300, dy=300)
t.ok(k.labels()[:2] == ["Back", "Forward (off)"], f"with a page behind it, Back can be picked: {k.labels()[:2]}")
k.pick("Back")
b.wait_for(lambda: k.tab(page)["url"].endswith("/ctx") and not k.tab(page)["loading"], what="back")
t.ok(True, "Back goes back")
time.sleep(0.3)
k.right_click(page, "#empty")
k.pick("Forward")
b.wait_for(lambda: k.tab(page)["url"].endswith("/second"), what="forward")
t.ok(True, "Forward goes forward")
b.cmd("tab.go", id=page, input=k.url("/ctx"))
b.wait_for(lambda: k.tab(page)["url"].endswith("/ctx") and not k.tab(page)["loading"], what="ctx again")
time.sleep(0.4)

# Save Page As…: Windows' dialog (answered by the test), then the page saved
saved = OUT / "saved page.html"
saved.unlink(missing_ok=True)
k.log(reset=True, saveAs=str(saved))
k.right_click(page, "#empty")
k.pick("Save Page As…")
b.wait_for(lambda: saved.exists() and saved.stat().st_size > 100, what="the saved page")
d = k.log()["dialogs"]
t.ok(d and d[-1]["title"] == "Save Page As" and d[-1]["defaultPath"].endswith("ctx.html"), f"Save Page As… asks where, named after the page: {d}")
t.ok("Gentle words" in saved.read_text(), "…and writes the page there")

# Print…, Inspect: Windows' print dialog and the inspector (recorded in a test world)
k.right_click(page, "#empty")
k.pick("Print…")
t.ok(k.log()["printed"] == [page], "Print… prints this page")
at = k.right_click(page, "#empty", dx=40, dy=30)
k.pick("Inspect")
ins = k.log()["inspected"]
pr = k.page_rect(page)
t.ok(ins and ins[-1]["id"] == page and abs(ins[-1]["x"] - (at[0] - pr["x"])) <= 1 and abs(ins[-1]["y"] - (at[1] - pr["y"])) <= 1,
     f"Inspect opens the inspector on the element clicked: {ins}")

# Translate: the translation module (its stand-in translator in a test world)
it = k.page("/it")
k.right_click(it, "#empty", dy=30)
t.ok("Translate to English" in k.labels(), f"one language in Settings: Translate to English, after Print ({k.labels()})")
t.ok(k.labels().index("Translate to English") == k.labels().index("Print…") + 2, "…in a group of its own after Save Page As… and Print…")
k.pick("Translate to English")
r = b.call({"do": "translate.wait", "id": it, "within": 60}, timeout=70)
m = r.get("mark") or k.mark(it)
t.ok(m and m["to"] == "en" and m["phase"] == "done", f"Translate to English translates the page into English ({m})")
t.ok(b.ev(it, "document.querySelector('#text').textContent") != "La biblioteca comunale apre alle nove del mattino, tutti i giorni tranne la domenica.",
     "…its words changed")
k.right_click(it, "#empty", dy=30)
t.ok("Show Original" in k.labels() and "Translate to English" not in k.labels(), f"translated, the row says Show Original ({k.labels()})")
k.pick("Show Original")
b.wait_for(lambda: not k.mark(it), within=10, what="the original")
t.ok(b.ev(it, "document.querySelector('#text').textContent").startswith("La biblioteca comunale"), "Show Original puts the page's own words back")
b.cmd("prefs.set", key="translate.languages", value=["en", "it", "de"])
k.right_click(it, "#empty", dy=30)
tr = k.entry("Translate Page")
t.ok(tr and [e["label"] for e in tr["submenu"]] == ["English", "German", "Italian"], f"several languages in Settings, in the module's order: Translate Page ▸ ({tr})")
k.pick("Translate Page")
t.ok(k.dom_items(1) == ["English", "German", "Italian"], f"…its languages beside it: {k.dom_items(1)}")
k.pick("German", menu=1)
b.wait_for(lambda: (m := k.mark(it)) and m["to"] == "de", within=10, what="German asked for")
t.ok(True, "…and the one picked is the one translated into")
b.cmd("page.untranslate", id=it)
b.cmd("prefs.set", key="translate.languages", value=["en"])
b.cmd("tab.close", id=it)
b.cmd("tab.select", id=page)
time.sleep(0.5)

# View Page Source: the source in a tab of its own, in front
k.right_click(page, "#empty")
k.pick("View Page Source")
src = b.wait_for(lambda: (a := b.active()) and a["id"] != page and a, what="the source tab")
t.ok(src["url"] == "view-source:" + k.url("/ctx"), f"View Page Source opens a tab of its own in front: {src['url']}")
b.wait_for(lambda: "<title>ctx</title>" in (b.ev(src["id"], "document.body.innerText") or ""), what="the source shown")
t.ok(True, "…showing the page's HTML as text")
time.sleep(0.5)
t.ok(k.tab(src["id"])["url"] == "view-source:" + k.url("/ctx"), f"…its address stays view-source: once loaded ({k.tab(src['id'])['url']})")
b.cmd("tab.close", id=src["id"])
b.cmd("tab.select", id=page)
time.sleep(0.4)

# Copy Clean Link: only on a page whose address tracks, under Reload
k.right_click(page, "#empty")
t.ok("Copy Clean Link" not in k.labels(), "an address without trackers: no Copy Clean Link")
k.key("Escape")
tracked = k.page("/ctx?utm_source=mail&id=2&gclid=x")
k.right_click(tracked, "#empty")
t.ok(k.labels()[:4] == ["Back (off)", "Forward (off)", "Reload", "Copy Clean Link"], f"with trackers: Copy Clean Link under Reload ({k.labels()[:5]})")
k.clear_clipboard()
k.pick("Copy Clean Link")
t.ok(k.clipboard()["text"] == k.url("/ctx?id=2"), f"…copies the address without utm_ and gclid: {k.clipboard()['text']}")

# a press outside closes; a right press outside opens it there
k.right_click(tracked, "#empty")
first = k.last()["menu"]["seq"]
x, y = k.point(tracked, "#text", dx=10, dy=5)
b.mouse(x + 300, y + 200, button="right")
b.wait_for(lambda: k.last()["menu"]["seq"] > first and k.dom_items(), within=5, what="the menu again")
time.sleep(0.25)
t.ok(abs(k.menu_rect()["x"] - (x + 300)) <= 2 and abs(k.menu_rect()["y"] - (y + 200)) <= 2, f"a right click outside opens the menu where it was: {k.menu_rect()}")
b.mouse(x + 10, y + 10)
b.wait_for(lambda: not k.is_open(), within=3, what="closed")
t.ok(not k.is_open(), "a click outside puts it away")
t.ok(b.state()["windows"][0]["overlay"]["kind"] == "none", "…and the overlay goes with it")

# the menu's place: near the window's right and bottom it flips and rises
pr = k.page_rect(tracked)
at = k.right_click_at(pr["x"] + pr["width"] - 20, pr["y"] + pr["height"] - 20)
r, room = k.menu_rect(), k.last()["menu"]["room"]
t.ok(r["x"] + r["w"] <= at[0] + 1 and r["x"] + r["w"] <= room["w"] and r["y"] + r["h"] <= room["h"] - 3, f"near the corner it opens left of the click and inside the window: {r} at {at}")
k.key("Escape")
time.sleep(0.3)

# the column's own right click is the tabs' menu, never this one
seq = k.last()["menu"]["seq"]
row = b.ui("(() => { const e = document.querySelector('.row[data-tab]'); if (!e) return null; const r = e.getBoundingClientRect();"
           " e.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.x + 20, clientY: r.y + 10 })); return true })()")
time.sleep(0.5)
t.ok(k.last()["menu"]["seq"] == seq, "a right click on the column doesn't open the page menu")
if row:
    up = b.wait_for(lambda: b.ui("document.querySelectorAll('[data-tabs-ui=host] .menu').length", root="overlay"), within=3, what="the tabs' menu")
    t.ok(up, "…the tabs' own menu comes up instead")
    b.call({"do": "ctxmenu.key", "key": "Escape"})
    b.wait_for(lambda: b.state()["windows"][0]["overlay"]["kind"] == "none", within=3, what="the tabs' menu closed by Escape")
    t.ok(True, "a real Escape closes the tabs' menu too")

k.done(t)

#!/usr/bin/env python3
"""The drawn menus (studio/01 §4.35-§4.37, §6.25, §6.36, §7.12; studio/02
§4.6 MenuMetrics) and the Ctrl+Tab switcher (§3.25-§3.27), over the page in
the overlay: their items in the Mac's order and words, their measures,
picks that do what they say, inline renames. SHOTS_DIR keeps pictures."""
import json
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b  # noqa: E402
import tabs_kit as tk  # noqa: E402
import ui_kit as k  # noqa: E402

SHOTS = os.environ.get("SHOTS_DIR")
tk.world("ui-menus", spaces=True, **{"pins.list": True, "pins.folders": True})
b.launch(*k.FRAMES, env={"SEARCH_LOOK": "light"})
time.sleep(0.8)
t = b.T()


def shot(name):
    if SHOTS:
        try:
            b.shot(Path(SHOTS) / f"{name}.png")
        except RuntimeError as e:
            print(f"  (no picture of {name}: {e})")


a = tk.page("a")
bb = tk.page("b")
time.sleep(0.5)


def context(sel):
    r = k.rect(sel)
    k.js(f"const e = document.querySelector({json.dumps(sel)}); e.dispatchEvent(new MouseEvent('contextmenu', {{ bubbles: true, cancelable: true, clientX: {r['x'] + 30}, clientY: {r['y'] + 12} }})); return 1")
    time.sleep(0.35)


def items():
    return k.js("return [...document.querySelectorAll('.menu')][0] ? [...document.querySelectorAll('.menu')[0].children].map(e => e.classList.contains('menu-sep') ? '—' : (e.dataset.label + (e.classList.contains('off') ? ' (off)' : ''))) : null", root="overlay")


def pick(label, menu=0):
    k.js(f"const e = [...document.querySelectorAll('.menu')[{menu}].querySelectorAll('.menu-item')].find(x => x.dataset.label === {json.dumps(label)});"
         " e.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true })); e.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0 })); return 1", root="overlay")
    time.sleep(0.4)


def overlay_bounds():
    return b.state()["windows"][0].get("overlay")


# a tab's menu (§4.35)
context(f'.row[data-tab="{a}"]')
shot("menu-tab-light")
got = items()
t.ok(got is not None, "a right click on a row: a menu over the page, in the overlay")
want_start = ["Move to Group", "Pin", "Pin as Row", "Move to Space", "Open in Split View (off)", "Move to New Window (off)", "—",
              "Rename", "Duplicate", "Site Information… (off)", "Copy Address", "Copy as Markdown Link", "Copy Clean Link (off)",
              "Open in Side Panel (off)", "Mute Tab", "Put to Sleep", "—", "Close Tab", "Close Other Tabs", "Close Tabs Below"]
t.ok(got and got[:len(want_start)] == want_start, f"the Mac's items, in its order: {got}")
t.ok(got and got[-1].startswith("Reopen"), "…ending with Reopen")
m = k.js("const m = document.querySelector('.menu'); const s = getComputedStyle(m); const i = m.querySelector('.menu-item'); const r = m.getBoundingClientRect(); const ri = i.getBoundingClientRect();"
         " const l = i.querySelector('.menu-label').getBoundingClientRect(); const sep = m.querySelector('.menu-sep').getBoundingClientRect();"
         " return { radius: s.borderTopLeftRadius, padTop: parseFloat(s.paddingTop), row: ri.height, text: l.x - r.x, inset: ri.x - r.x, hr: getComputedStyle(i).borderTopLeftRadius, sep: sep.height, font: s.fontSize }",
         root="overlay")
t.ok(m["radius"] == "12px" and m["padTop"] == 5 and k.near(m["row"], 24) and k.near(m["sep"], 11), f"corners 12, 5 above, items 24, separators 11: {m}")
t.ok(k.near(m["text"], 17) and k.near(m["inset"], 5) and m["hr"] == "6px" and m["font"] == "13px", f"text 17 in, the highlight 5 in with a radius of 6, 13 points: {m}")
ov = overlay_bounds()
pick("Move to Group")
sub = k.js("return document.querySelectorAll('.menu').length", root="overlay")
t.ok(sub == 2, "Move to Group opens beside it")
sub_items = k.js("return [...document.querySelectorAll('.menu')[1].querySelectorAll('.menu-item')].map(e => e.dataset.label)", root="overlay")
t.ok(sub_items == ["New Group"], f"…with New Group: {sub_items}")
pick("New Group", menu=1)
time.sleep(0.4)
groups = tk.win()["groups"]
t.ok(len(groups) == 1 and groups[0]["name"] == "Group 1", f"New Group: 'Group 1' (§6.34): {groups}")
field = k.js("const e = document.activeElement; return e && e.classList.contains('heading-field') ? e.value : null")
t.ok(field == "Group 1", "…its name in a field at once, to rename")
k.js("const e = document.activeElement; e.value = 'Reading'; e.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return 1")
time.sleep(0.4)
t.ok(tk.win()["groups"][0]["name"] == "Reading", "Enter keeps the name typed")

# the group's menu (TabGroups.swift), Colour… (§6.36)
context(".group-heading")
got = items()
t.ok(got == ["New Tab in Group", "—", "Rename Group", "Collapse Group", "Colour…", "—", "Ungroup Tabs", "Close Group"], f"a group's menu: {got}")
pick("Colour…")
sw = k.js("return [...document.querySelectorAll('.swatch')].map(e => { const r = e.getBoundingClientRect(); return [Math.round(r.width), e.title] })", root="overlay")
t.ok(len(sw) == 6 and all(w == 22 for w, _ in sw) and sw[0][1] == "None", f"six swatches of 22, None first: {sw}")
shot("menu-swatches-light")
k.js("document.querySelectorAll('.swatch')[3].click(); return 1", root="overlay")
time.sleep(0.4)
t.ok(tk.win()["groups"][0]["colour"] == 3, "Orange picked: the group's colour")

# Rename, in the row (§3.49)
context(f'.row[data-tab="{bb}"]')
pick("Rename")
time.sleep(0.3)
field = k.js("const e = document.activeElement; return e && e.classList.contains('rename') ? e.value : null")
t.ok(field == "b", f"Rename: the title in a field in its row: {field}")
k.js("const e = document.activeElement; e.value = 'Bee'; e.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return 1")
time.sleep(0.4)
t.ok(tk.tab(bb).get("name") == "Bee", "Enter names the tab")

# Escape closes the menu and gives the overlay back
front = tk.active()["id"]
b.ev(front, "window.__keys = []; addEventListener('keydown', e => __keys.push(e.key), true); 1")
context(f'.row[data-tab="{bb}"]')
layer = overlay_bounds()
t.ok(layer and layer.get("kind") == "panel" and layer.get("name") == "tabs.menu", f"the main process raised it (menu.open), a layer like the field's: {layer and layer.get('kind')} {layer and layer.get('name')}")
k.js("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); return 1", root="overlay")
time.sleep(0.3)
t.ok(not k.js("return !!document.querySelector('.menu')", root="overlay"), "Escape closes it")
t.ok(overlay_bounds() == {"kind": "none"}, f"…and the main process lets the overlay go (menu.close): {overlay_bounds()}")
b.key("k")
time.sleep(0.3)
t.ok(b.ev(front, "window.__keys") == ["k"], f"…the keys back to the page in front (window.focusPage): {b.ev(front, 'window.__keys')}")

# Pin, then the pin's menu (§6.1-§6.11)
context(f'.row[data-tab="{bb}"]')
pick("Pin")
b.wait_for(lambda: tk.tab(bb).get("pinID"), what="pinned")
time.sleep(0.4)
context(f'.square[data-tab="{bb}"]')
got = items()
t.ok(got and got[:9] == ["Show as Row", "New Live Folder… (off)", "Change Letter", "Replace Pinned Page with Current URL (off)", "Keep in Every Space", "Unpin", "Delete", "Move to Space", "Open in Split View (off)"],
     f"a square's menu: {got}")
pick("Change Letter")
time.sleep(0.3)
k.js("const e = document.activeElement; e.value = 'q'; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return 1")
time.sleep(0.4)
t.ok(k.js(f"return document.querySelector('.square[data-tab=\"{bb}\"] .pin-letter')?.textContent") == "Q", "Change Letter: one letter, upper case, in the square")

# the column's own menu (§4.37)
k.js("const e = document.querySelector('.void'); const r = e.getBoundingClientRect(); e.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.x + 40, clientY: r.y + 40 })); return 1")
time.sleep(0.4)
got = [x for x in items() if x != "Paste and Go"]
t.ok(got[:3] == ["New Tab", "New Folder", "New Live Folder… (off)"] and got[-2:] == ["Hide Sidebar", "Sidebar Settings…"], f"the column's menu: {got}")
k.js("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); return 1", root="overlay")
time.sleep(0.3)

# the space's menu (§7.12)
tk.cmd("space.create", name="Work")
time.sleep(0.5)
k.js("const e = document.querySelector('.space-dot'); const r = e.getBoundingClientRect(); e.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: r.x + 13, clientY: r.y + 13 })); return 1")
time.sleep(0.4)
got = items()
shot("menu-space-light")
t.ok(got and got[:2] == ["Personal", "Work"] and got[2:5] == ["—", "New Space…", "—"] and "Rename “Work”…" in got and "Icon" in got and "Colour…" in got and "Move Left" in got and got[-1] == "Delete “Work”…",
     f"the space's menu: {got}")
acc = k.js("return [...document.querySelectorAll('.menu .menu-accel')].map(e => e.textContent)", root="overlay")
t.ok(acc[:2] == ["Alt+1", "Alt+2"], f"spaces' keys, Alt+1-9 on Windows: {acc}")
pick("Personal")
time.sleep(0.5)
t.ok(tk.win()["space"] == "00000000-0000-0000-0000-000000000001", "a space picked: gone to")

# the switcher (§3.25-§3.27)
c = tk.page("c")
time.sleep(0.4)
tk.cmd("tab.switch", by=1)
time.sleep(0.05)
t.ok(not k.js("return !!document.querySelector('.switcher')", root="overlay"), "not up before Ctrl has been held 0.15 s")
time.sleep(0.4)
sw = k.js("const p = document.querySelector('.switcher-panel'); if (!p) return null; const cards = [...p.querySelectorAll('.sw-card')];"
          " return { cards: cards.length, w: cards[0].getBoundingClientRect().width, pic: cards[0].querySelector('.picture').getBoundingClientRect().height,"
          " radius: getComputedStyle(p).borderTopLeftRadius, pad: getComputedStyle(p).paddingTop, veil: getComputedStyle(document.querySelector('.switcher')).backgroundColor,"
          " keys: document.querySelector('.switcher-keys').textContent, chosen: getComputedStyle(document.querySelector('.switcher-chosen')).borderTopLeftRadius }", root="overlay")
shot("switcher-light")
t.ok(sw is not None, "held, the switcher is up over the window")
if sw:
    t.ok(sw["cards"] >= 2 and k.near(sw["w"], 176), f"cards up to 176 wide: {sw}")
    t.ok(k.near(sw["pic"], (176 - 16) * 0.62), "the picture (w − 16) × 0.62")
    t.ok(sw["radius"] == "12px" and sw["pad"] == "12px" and sw["chosen"] == "8px" and k.same_colour(sw["veil"], "rgba(0, 0, 0, 0.12)"), "panel 12/12, the chosen grey radius 8, a veil of 12%")
    t.ok(sw["keys"] == "Ctrl+W CloseCtrl+R ReloadCtrl+M Mute", f"the keys under the grid: {sw['keys']}")
before = tk.active()["id"]
tk.cmd("tab.switchEnd")
time.sleep(0.4)
t.ok(not k.js("return !!document.querySelector('.switcher')", root="overlay"), "let go: gone")
t.ok(tk.active()["id"] != before, "…and on the card chosen")

t.done()

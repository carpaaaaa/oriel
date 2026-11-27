#!/usr/bin/env python3
"""Settings in a tab, as the Mac draws it (studio/06 §1.0-1.15, studio/02
§4.6): the rail at 196 with its three blocks, the column at 600, rows with
their 26-point tiles and 30 × 18 switches, every row of SettingsIndex in the
Mac's order with its key and default, dependent rows only where they count,
the merged rows writing the Mac's keys, and the find field."""
import json
import os
import sys
import time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b

ROOT = Path(__file__).resolve().parent.parent
INDEX = json.loads((ROOT / "src/ui/settings/index.json").read_text())
SHOTS = os.environ.get("SHOTS_DIR")

b.use("settings-panel")
b.launch(env={"SEARCH_LOOK": "light"})
t = b.T()


def ev(tab, js):
    try:
        return b.ev(tab, js)
    except RuntimeError:
        return None


def prefs():
    return b.state()["prefs"]


b.cmd("app.settings")
b.wait_for(lambda: any(x.get("internal") == "settings" for x in b.window()["tabs"]), what="Settings tab")
tab = next(x for x in b.window()["tabs"] if x.get("internal") == "settings")["id"]
b.wait_for(lambda: ev(tab, "document.querySelectorAll('.sr').length"), what="rows")
time.sleep(0.4)


def box(sel):
    return ev(tab, f"(() => {{ const r = document.querySelector({json.dumps(sel)})?.getBoundingClientRect(); return r && {{x: r.x, y: r.y, w: r.width, h: r.height}} }})()")


def style(sel, prop):
    return ev(tab, f"getComputedStyle(document.querySelector({json.dumps(sel)}))[{json.dumps(prop)}]")


def search(text):
    ev(tab, "(() => { const f = document.querySelector('.st-find input'); f.value = %s; f.dispatchEvent(new Event('input', {bubbles: true})) })()" % json.dumps(text))


def click(sel):
    return ev(tab, f"(() => {{ const el = document.querySelector({json.dumps(sel)}); if (!el) return false; el.click(); return true }})()")


# 1. The rail: 196 wide, Settings, Find a setting, three blocks of sections.
t.ok(round(box(".rail")["w"]) == 196, "the rail is 196 wide")
t.ok(ev(tab, "document.querySelector('.rail-title').textContent") == "Settings", "the rail is titled Settings")
t.ok(round(box(".st-find")["h"]) == 28, "Find a setting is 28 high")
names = ev(tab, "[...document.querySelectorAll('.rail-row .rail-name')].map(e => e.textContent)")
t.ok(names == ["General", "Appearance", "Themes", "Tabs", "Browsing", "Spaces & Pins", "Passwords", "Privacy", "Extensions", "Keyboard & Mouse", "About"],
     f"the sections in the Mac's order, AI left out ({names})")
t.ok(ev(tab, "document.querySelectorAll('.rail-rule').length") == 2, "three blocks, two hairlines between")
t.ok(round(box(".rail-row")["h"]) == 30, "a section's row is 30 high")
white = box(".rail-white")
on = box(".rail-row.on")
t.ok(white and abs(white["y"] - on["y"]) < 1 and abs(white["h"] - 30) < 1, "the white lies under the chosen section")

# 2. The column: at most 600, rows with their tiles and controls.
ev(tab, "document.body.style.width = '1400px'")
col = box(".st-column")
t.ok(abs(col["w"] - 600) < 1, f"the column is 600 wide at most ({col['w']})")
card = box(".card-st")
t.ok(abs(card["w"] - 552) < 1, f"cards are 600 less 24 a side ({card['w']})")
ev(tab, "document.body.style.width = ''")
t.ok(round(box(".sr-tile")["w"]) == 26 and round(box(".sr-tile")["h"]) == 26, "the icon tile is 26 × 26")
t.ok(style(".sr-tile", "borderTopLeftRadius") == "7px", "with corners of 7")
sw = box(".st-sw")
t.ok(round(sw["w"]) == 30 and round(sw["h"]) == 18, "a switch is 30 × 18")
t.ok(style(".sr-title", "fontSize") == "13px" and style(".sr-detail", "fontSize") == "11.5px", "titles at 13, details at 11.5")
t.ok(style(".st-group-head", "fontSize") == "10.5px" and style(".st-group-head", "textTransform") in ("none", "") and ev(tab, "document.querySelector('.st-group-head').textContent") == "YOUR BROWSER",
     "group headings small and in capitals")
t.ok(style(".card-st", "borderTopLeftRadius") == "11px", "cards have corners of 11")
t.ok(ev(tab, "getComputedStyle(document.querySelector('.st-head h1')).fontSize") == "17px", "the section's title is 17")

# 3. Every row of SettingsIndex, in the Mac's order, minus the Mac's own.
removed = ev(tab, "Object.keys(window.__settings ? {} : {})")
# Oriel's own rows, not the Mac's: Window buttons (Themes).
OWN = {"window.buttons"}
catalog = [i for i in ev(tab, "window.__settings.items.map(i => i.id)") if i not in OWN]
mac = [i["id"] for i in INDEX["items"] if i["id"] not in OWN]
# 158, and Search 1.0.20-1.0.22's Export spaces, Show the bookmarks bar only on
# new tabs and Copy captures only.
t.ok(len(mac) == 161, "SettingsIndex has 161 rows")
gone = [i for i in mac if i not in catalog]
t.ok(catalog == [i for i in mac if i in catalog], "the rows keep the Mac's order")
# translate.target and note.translate are back with Translate Page (translate
# module); swipe.history and agents hidden (area C); Liquid Glass's tab and the
# window's glass left out (area A); Profiles in one window left out until
# Oriel has profiles (area B); the note on searching a ready-made site with Tab
# left out while there is none (field module, settings_shortcuts.py). Where an
# extension runs is back with "Runs on" (test/settings_extensions.py).
t.ok(len(catalog) == 139 and len(gone) == 22, f"139 rows on Windows, 22 of the Mac's left out ({gone})")
texts = ev(tab, "JSON.stringify(window.__settings.items.map(i => [i.title, i.detail, i.more || ''].join(' ')))")
t.ok(not any(c in texts for c in "—–⌘⌥⌃⇧"), "no long dash, no Mac key symbol in any row")
t.ok(not any(w in texts for w in ("macOS", "Touch ID", "keychain", "Finder", "System Settings")), "no macOS, Touch ID, keychain, Finder or System Settings")

pages = ["general", "appearance", "themes", "tabs", "browsing", "spaces", "passwords", "privacy", "keyboard", "about"]
shown = 0
for page in pages:
    b.cmd("settings.open", page=page)
    b.wait_for(lambda: ev(tab, "location.pathname") == "/" + page, what=page)
    time.sleep(0.15)
    ids = ev(tab, "[...document.querySelectorAll('.st-column .sr[data-row]')].map(e => e.dataset.row)")
    groups = [g["id"] for g in INDEX["groups"] if g["page"] == page]
    expect = [i for g in groups for i in [x["id"] for x in INDEX["items"] if x["group"] == g and not x.get("findOnly")] if i in catalog or i in OWN]
    t.ok(all(i in expect for i in ids) and ids == [i for i in expect if i in ids], f"{page}: rows in the Mac's order ({len(ids)} shown)")
    shown += len(ids)
t.ok(shown >= 100, f"{shown} rows shown with the defaults")

# 4. Switches write the Mac's keys; back to its default, no key.
b.cmd("settings.open", page="general")
b.wait_for(lambda: ev(tab, "location.pathname") == "/general", what="general")
time.sleep(0.2)
click(".sr[data-row='quit.confirm'] .st-sw")
b.wait_for(lambda: prefs().get("quit.confirm") is True, what="quit.confirm on")
t.ok(True, "Confirm before quitting writes quit.confirm")
quit_detail = ev(tab, "document.querySelector(\"[data-row='quit.confirm'] .sr-detail\").textContent")
t.ok(quit_detail == "Ask before Alt+F4 or Quit Oriel closes the browser", f"Confirm before quitting names Alt+F4, Windows' own way to quit ({quit_detail})")
click(".sr[data-row='quit.confirm'] .st-sw")
b.wait_for(lambda: not prefs().get("quit.confirm"), what="quit.confirm off")
t.ok("quit.confirm" not in prefs() or prefs()["quit.confirm"] is None, "back at its default, the key is gone")

# 5. Merged rows: Tabs (sidebar, sidebar.position, sidebar.icons) and the rows that need them.
b.cmd("settings.open", page="appearance")
b.wait_for(lambda: ev(tab, "location.pathname") == "/appearance", what="appearance")
time.sleep(0.2)
t.ok(ev(tab, "!!document.querySelector(\"[data-row='sidebar.hides']\")") and not ev(tab, "!!document.querySelector(\"[data-row='tabs.compact']\")"),
     "with the column, its rows show and the top bar's don't")
ev(tab, "document.querySelector(\"[data-row='tabs.layout'] .st-pic[aria-label='Top']\").click()")
b.wait_for(lambda: prefs().get("sidebar") is False, what="sidebar off")
time.sleep(0.2)
t.ok(ev(tab, "!!document.querySelector(\"[data-row='tabs.compact']\")") and not ev(tab, "!!document.querySelector(\"[data-row='sidebar.hides']\")"),
     "Top: Shorter tab bar shows, the column's rows go")
t.ok(b.window()["sidebar"]["layout"] == "top", "the window's tabs go across the top")
ev(tab, "document.querySelector(\"[data-row='tabs.layout'] .st-pic[aria-label='Right']\").click()")
b.wait_for(lambda: prefs().get("sidebar.position") == "right" and prefs().get("sidebar") is not False, what="right")
t.ok(b.window()["sidebar"]["side"] == "right", "Right: the column on the right (sidebar.position)")
ev(tab, "document.querySelector(\"[data-row='tabs.layout'] .st-pic[aria-label='Left']\").click()")
b.wait_for(lambda: prefs().get("sidebar.position") in (None, "left"), what="left")

# Light, Dark, Auto: the look (and its dependent rows).
ev(tab, "document.querySelector(\"[data-row='look'] .st-pic[aria-label='Light']\").click()")
b.wait_for(lambda: prefs().get("look") == "light", what="look light")
time.sleep(0.2)
t.ok(not ev(tab, "!!document.querySelector(\"[data-row='pages.dusk']\")"), "Light: Darken pages that stay light goes")
ev(tab, "document.querySelector(\"[data-row='look'] .st-pic[aria-label='Auto']\").click()")
b.wait_for(lambda: prefs().get("look") in (None, "system"), what="look auto")

# Sleep tabs: Never / Later / Normal / Sooner over tabs.sleep and tabs.sleep.pace.
b.cmd("settings.open", page="tabs")
b.wait_for(lambda: ev(tab, "location.pathname") == "/tabs", what="tabs")
time.sleep(0.2)
ev(tab, "[...document.querySelectorAll(\"[data-row='tabs.sleep'] .st-seg-item\")].find(e => e.textContent === 'Sooner').click()")
b.wait_for(lambda: prefs().get("tabs.sleep.pace") == "sooner", what="sooner")
t.ok("ten minutes" in ev(tab, "document.querySelector('.st-sleep-detail').textContent"), "Sooner: After ten minutes away")
ev(tab, "[...document.querySelectorAll(\"[data-row='tabs.sleep'] .st-seg-item\")].find(e => e.textContent === 'Never').click()")
b.wait_for(lambda: prefs().get("tabs.sleep") is False, what="never")
t.ok(b.call({"do": "settings.state"})["merged"]["tabs.sleep"] == "never", "Never: tabs.sleep off")
if SHOTS:
    b.call({"do": "settings.shot", "id": tab, "path": f"{SHOTS}/settings-tabs.png"})

# 6. Find a setting: every word, in the sections' order, counts in the rail.
search('dark')
time.sleep(0.3)
t.ok(ev(tab, "document.querySelector('.st-head h1').textContent") == "Settings matching “dark”", "the title says what is searched")
found = ev(tab, "[...document.querySelectorAll('.st-column .sr[data-row]')].map(e => e.dataset.row)")
t.ok("look" in found and "pages.dusk" in found, f"dark finds Appearance and Darken pages ({found})")
t.ok(ev(tab, "[...document.querySelectorAll('.rail-row')].find(e => e.dataset.page === 'appearance').querySelector('.rail-count')?.textContent") is not None,
     "the rail counts what each section holds")
t.ok(ev(tab, "document.querySelector('.found-head span').textContent").startswith("GENERAL  ›") or "›" in ev(tab, "document.querySelector('.found-head span').textContent"),
     "results come under SECTION › GROUP")
search('split')
time.sleep(0.3)
t.ok("ALWAYS ON, NOTHING TO SET" in ev(tab, "document.body.innerText"), "what is always on comes apart, under Always on, nothing to set")
search('zzzz')
time.sleep(0.3)
t.ok("No setting called that. Try other words, like dark, tabs or video" in ev(tab, "document.body.innerText"), "nothing found says so")
search('hide sidebar')
time.sleep(0.3)
ev(tab, "document.querySelector('.found-head').click()")
time.sleep(0.3)
t.ok(ev(tab, "location.pathname") == "/appearance" and ev(tab, "!!document.querySelector('.sr.lit')"), "a result's heading opens its section and lights the row")

# 7. A row that is a button: Forget choices says so.
b.cmd("settings.open", page="privacy")
b.wait_for(lambda: ev(tab, "location.pathname") == "/privacy", what="privacy")
time.sleep(0.2)
click(".sr[data-row='privacy.forget'] .pill-st")
b.wait_for(lambda: ev(tab, "document.querySelector('.st-said')?.textContent") == "Camera, microphone, location and notification choices forgotten", what="said")
t.ok(True, "Forget choices: Camera, microphone, location and notification choices forgotten")
t.ok(ev(tab, "!!document.querySelector(\"[data-group='proxy']\")"), "Privacy ends with Proxy")

# 8. Downloads folder: Change… asks for a folder (answered by the test).
folder = str(Path(b.folder()) / "Chosen downloads")
os.makedirs(folder, exist_ok=True)
b.call({"do": "settings.answers", "folder": folder})
b.cmd("settings.open", page="general")
b.wait_for(lambda: ev(tab, "location.pathname") == "/general", what="general")
time.sleep(0.2)
click(".sr[data-row='downloads.folder'] .pill-st")
b.wait_for(lambda: prefs().get("downloads") == folder, what="folder")
time.sleep(0.2)
t.ok("Chosen downloads" in ev(tab, "document.querySelector(\"[data-row='downloads.folder'] .sr-detail\").textContent"), "Save to shows the folder chosen")
click(".sr[data-row='general.default'] .pill-st")
time.sleep(0.2)
t.ok(any(u.startswith("ms-settings:defaultapps") for u in b.call({"do": "settings.state"})["opened"]), "Make default opens Windows' Default apps")

if SHOTS:
    b.call({"do": "settings.shot", "id": tab, "path": f"{SHOTS}/settings-general.png"})
t.ok(not b.state().get("errors"), "no error in the main process")
t.done()

#!/usr/bin/env python3
"""Oriel's own pop-up menus, never Windows' <select> (lib/Dropdown.tsx;
studio/02 §4.6, studio/06 §1.0): the button shows the value and a double
arrow; the list has rows of 24, corners of 12, the highlight 5 in with
corners of 7, a tick on the chosen row, the app's typeface, a neutral grey
highlight (never blue), the chosen row over the button, inside the page;
mouse and keys choose, Escape and a click outside put it away, the value is
kept. The overlay's menus highlight in the same grey. Pictures, light and
dark, in out/shots/ (SHOTS_DIR to put them elsewhere)."""
import json
import os
import sys
import time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b

ROOT = Path(__file__).resolve().parent.parent
SHOTS = Path(os.environ.get("SHOTS_DIR") or ROOT / "out" / "shots")
SHOTS.mkdir(parents=True, exist_ok=True)
t = b.T()


def ev(tab, js):
    try:
        return b.ev(tab, js)
    except RuntimeError:
        return None


def rgb(css):
    nums = [float(x) for x in css[css.index("(") + 1: css.index(")")].replace("/", ",").split(",")[:3]]
    return nums


def neutral(css):
    r, g, b2 = rgb(css)
    return max(r, g, b2) - min(r, g, b2) <= 6


def open_settings(page):
    b.cmd("settings.open", page=page)
    b.wait_for(lambda: any(x.get("internal") == "settings" for x in b.window()["tabs"]), what="Settings")
    tab = next(x for x in b.window()["tabs"] if x.get("internal") == "settings")["id"]
    b.wait_for(lambda: ev(tab, "location.pathname") == "/" + page and ev(tab, "document.querySelectorAll('.dd-button').length"), what=page, within=30)
    time.sleep(0.3)
    return tab


def card():
    return json.loads(b.ui("JSON.stringify(document.querySelector('.card').getBoundingClientRect())"))


def rect(tab, sel):
    return ev(tab, f"(() => {{ const r = document.querySelector({json.dumps(sel)})?.getBoundingClientRect(); return r && {{x: r.x, y: r.y, w: r.width, h: r.height}} }})()")


def press(tab, sel):
    """A real click at the element's middle, through the window."""
    if not ev(tab, "!!document.querySelector('.dd-list')"):
        ev(tab, f"document.querySelector({json.dumps(sel)}).scrollIntoView({{block: 'center'}})")
        time.sleep(0.15)
    r = rect(tab, sel)
    c = card()
    b.mouse(c["x"] + r["x"] + r["w"] / 2, c["y"] + r["y"] + r["h"] / 2)


def key(tab, k, target="window"):
    ev(tab, f"(() => {{ const t = {('document.activeElement' if target == 'focus' else 'window')}; t.dispatchEvent(new KeyboardEvent('keydown', {{key: {json.dumps(k)}, bubbles: true, cancelable: true}})) }})()")
    time.sleep(0.05)


def listed(tab):
    return ev(tab, "!!document.querySelector('.dd-list.placed') && !document.querySelector('.dd-list.leaving')")


def gone(tab):
    return not ev(tab, "!!document.querySelector('.dd-list')")


def hot(tab):
    return ev(tab, "document.querySelector('.dd-row.hot .dd-label')?.textContent")


def prefs():
    return b.state()["prefs"]


def shot(name, tab):
    path = SHOTS / name
    try:
        b.shot(path)
    except RuntimeError:
        b.call({"do": "settings.shot", "id": tab, "path": str(path)})
    return path


for look in ("light", "dark"):
    b.use(f"settings-dropdowns-{look}")
    b.launch(env={"SEARCH_LOOK": look})
    print(f"-- {look}")
    tab = open_settings("browsing")
    ENGINE = "[data-row='search.engine'] .dd-button"

    if look == "light":
        # 1. No <select> left; the button: value and double arrow.
        t.ok(ev(tab, "document.querySelectorAll('select').length") == 0, "no <select> in Settings")
        t.ok(ev(tab, f"document.querySelector(\"{ENGINE}\").textContent") == "Google", "the button shows the value")
        t.ok(ev(tab, f"!!document.querySelector(\"{ENGINE} .dd-arrows\")"), "with a small double arrow")
        btn = rect(tab, ENGINE)
        t.ok(round(btn["h"]) == 24, "the button is 24 high")
        t.ok(ev(tab, f"getComputedStyle(document.querySelector(\"{ENGINE}\")).borderRadius") == "7px", "with corners of 7")

    # 2. Opened by a click: the rebuilt menu's measures.
    press(tab, ENGINE)
    b.wait_for(lambda: listed(tab), what="list open")
    time.sleep(0.45)
    t.ok(listed(tab), f"{look}: a click opens the list, and it stays open after the release")
    L = rect(tab, ".dd-list")
    row = rect(tab, ".dd-row")
    t.ok(ev(tab, "getComputedStyle(document.querySelector('.dd-list')).borderTopLeftRadius") == "12px", "the list has corners of 12")
    t.ok(round(row["h"]) == 24, "rows are 24 high")
    t.ok(abs(row["x"] - L["x"] - 5) < 0.6 and abs(L["x"] + L["w"] - row["x"] - row["w"] - 5) < 0.6, "the highlight runs 5 in from each edge")
    t.ok(ev(tab, "getComputedStyle(document.querySelector('.dd-row')).borderTopLeftRadius") == "7px", "with corners of 7: concentric with 12 at 5 (12 − 5)")
    t.ok(abs(row["y"] - L["y"] - 5) < 0.6, "5 above the first row")
    t.ok("Jakarta" in ev(tab, "getComputedStyle(document.querySelector('.dd-list')).fontFamily"), "in the app's typeface")
    chosen = ev(tab, "(() => { const r = document.querySelector('.dd-row[aria-selected=\"true\"]'); return r && {label: r.querySelector('.dd-label').textContent, tick: !!r.querySelector('.dd-tick')} })()")
    t.ok(chosen == {"label": "Google", "tick": True}, f"a tick on the chosen row ({chosen})")
    btn = rect(tab, ENGINE)
    crow = rect(tab, ".dd-row[aria-selected='true']")
    t.ok(abs((crow["y"] + crow["h"] / 2) - (btn["y"] + btn["h"] / 2)) < 2, "the chosen row lies over the button, as on the Mac")
    vw, vh = ev(tab, "[document.documentElement.clientWidth, document.documentElement.clientHeight]")
    t.ok(L["x"] >= 0 and L["y"] >= 0 and L["x"] + L["w"] <= vw and L["y"] + L["h"] <= vh, "inside the page")
    t.ok(hot(tab) == "Google", "the chosen row is lit at first")
    ev(tab, "[...document.querySelectorAll('.dd-row')].find(r => r.textContent === 'Bing').dispatchEvent(new PointerEvent('pointermove', {bubbles: true}))")
    time.sleep(0.1)
    lit = ev(tab, "getComputedStyle(document.querySelector('.dd-row.hot')).backgroundColor")
    t.ok(hot(tab) == "Bing" and neutral(lit), f"under the pointer, a neutral grey ({lit}), never blue")
    t.ok(ev(tab, "getComputedStyle(document.querySelector('.dd-row.hot')).color") == ev(tab, "getComputedStyle(document.querySelector('.dd-list')).color"), "the lit row keeps the ink")
    shot(f"dropdowns-{look}.png", tab)

    # 3. Chosen with the mouse: kept, closed, shown.
    press(tab, ".dd-row:nth-child(2)")
    b.wait_for(lambda: prefs().get("search.engine") == "duckduckgo", what="DuckDuckGo chosen")
    b.wait_for(lambda: gone(tab), what="closed")
    t.ok(ev(tab, f"document.querySelector(\"{ENGINE}\").textContent") == "DuckDuckGo", f"{look}: a click on a row chooses it, keeps it and closes")
    shot(f"dropdowns-button-{look}.png", tab)

    if look == "light":
        # 4. The keys: arrows, Enter, Home, End, letters, Escape, Tab.
        ev(tab, f"document.querySelector(\"{ENGINE}\").focus()")
        key(tab, "ArrowDown", "focus")
        b.wait_for(lambda: listed(tab), what="opened by a key")
        t.ok(hot(tab) == "DuckDuckGo", "↓ on the button opens it at the chosen row")
        key(tab, "ArrowDown")
        t.ok(hot(tab) == "Bing", "↓ moves down")
        key(tab, "ArrowUp")
        t.ok(hot(tab) == "DuckDuckGo", "↑ moves up")
        key(tab, "End")
        t.ok(hot(tab) == "Custom", "End: the last")
        key(tab, "Home")
        t.ok(hot(tab) == "Google", "Home: the first")
        key(tab, "q")
        t.ok(hot(tab) == "Qwant", "a letter: the first row it begins")
        key(tab, "Enter")
        b.wait_for(lambda: prefs().get("search.engine") == "qwant", what="Qwant by Enter")
        t.ok(gone(tab) or not listed(tab), "Enter chooses and closes")
        t.ok(ev(tab, "document.activeElement?.classList.contains('dd-button')"), "the button keeps the focus")
        key(tab, "Enter", "focus")
        b.wait_for(lambda: listed(tab), what="opened by Enter")
        key(tab, "ArrowDown")
        key(tab, "Escape")
        b.wait_for(lambda: gone(tab), what="Escape")
        t.ok(prefs().get("search.engine") == "qwant", "Escape puts it away, choosing nothing")
        key(tab, " ", "focus")
        b.wait_for(lambda: listed(tab), what="opened by Space")
        key(tab, "Tab")
        b.wait_for(lambda: gone(tab), what="Tab")
        t.ok(prefs().get("search.engine") == "qwant", "Tab puts it away")

        # 5. A click outside puts it away.
        press(tab, ENGINE)
        b.wait_for(lambda: listed(tab), what="open again")
        time.sleep(0.4)
        press(tab, ".st-head h1")
        b.wait_for(lambda: gone(tab), what="click outside")
        t.ok(prefs().get("search.engine") == "qwant", "a click outside puts it away, choosing nothing")

        # 6. A separator (Shift-Return: Off, then the engines).
        press(tab, "[data-row='search.shift'] .dd-button")
        b.wait_for(lambda: listed(tab), what="shift menu")
        sep = rect(tab, ".dd-sep")
        t.ok(sep and round(sep["h"]) == 11, "a separator, 11 high")
        key(tab, "Escape")
        b.wait_for(lambda: gone(tab), what="closed")

        # 7. Numbers, and a list near the page's foot stays inside it.
        tab = open_settings("tabs")
        press(tab, "[data-row='tabs.close.after'] .dd-button")
        b.wait_for(lambda: listed(tab), what="close-after menu")
        time.sleep(0.4)
        press(tab, ".dd-row:nth-child(3)")
        b.wait_for(lambda: prefs().get("tabs.close.after") == 24, what="After a day")
        t.ok(True, "Close tabs you leave alone: After a day keeps 24 (hours)")
        tab = open_settings("privacy")
        ev(tab, "document.querySelector('.st-scroll').scrollTo(0, 1e6)")
        time.sleep(0.2)
        ev(tab, "document.querySelector(\"[data-group='proxy'] .dd-button\").dispatchEvent(new PointerEvent('pointerdown', {bubbles: true, button: 0}))")
        b.wait_for(lambda: listed(tab), what="proxy menu")
        time.sleep(0.3)
        L = rect(tab, ".dd-list")
        vh = ev(tab, "document.documentElement.clientHeight")
        t.ok(L["y"] >= 0 and L["y"] + L["h"] <= vh, f"near the foot, the list is pulled back inside the page ({L['y']:.0f}+{L['h']:.0f} ≤ {vh})")
        key(tab, "Escape")
        tab = open_settings("keyboard")
        press(tab, "[data-row='links.peek'] .dd-button")
        b.wait_for(lambda: listed(tab), what="peek menu")
        labels = ev(tab, "[...document.querySelectorAll('.dd-row .dd-label')].map(e => e.textContent)")
        t.ok(labels == ["Off", "Shift-click", "Alt-Shift-click", "Ctrl-Alt-click"], f"Peek at a link: Windows' keys ({labels})")
        key(tab, "Escape")

        # 8. The overlay's menus: the same neutral grey, corners of 7.
        b.cmd("tab.new", url="data:text/html,<title>p</title>")
        time.sleep(0.8)
        active = b.window()["activeID"]
        b.ui(f"""(() => {{ const e = document.querySelector('.row[data-tab="{active}"]'); const r = e.getBoundingClientRect();
          e.dispatchEvent(new MouseEvent('contextmenu', {{ bubbles: true, cancelable: true, clientX: r.x + 30, clientY: r.y + 12 }})) }})()""")
        b.wait_for(lambda: b.ui("document.querySelectorAll('.menu .menu-item').length", root="overlay"), what="tab menu")
        b.ui("[...document.querySelectorAll('.menu .menu-item:not(.off)')].find(e => e.dataset.label === 'Duplicate' || e.dataset.label === 'Close Tab').dispatchEvent(new PointerEvent('pointerenter'))", root="overlay")
        time.sleep(0.1)
        bg = b.ui("getComputedStyle(document.querySelector('.menu-item.hot')).backgroundColor", root="overlay")
        t.ok(bg and neutral(bg) and "111, 162, 249" not in bg, f"a tab's menu lights its row in grey ({bg})")
        t.ok(b.ui("getComputedStyle(document.querySelector('.menu-item')).borderTopLeftRadius", root="overlay") == "7px", "with corners of 7 there too")
        shot("menus-tab-light.png", tab)
        b.ui("window.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape'}))", root="overlay")

    t.ok(not b.state().get("errors"), f"{look}: no error in the main process")
    b.quit()

print(f"pictures: {SHOTS / 'dropdowns-light.png'}, {SHOTS / 'dropdowns-dark.png'}")
t.done()

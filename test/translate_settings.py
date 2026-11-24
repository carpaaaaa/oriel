#!/usr/bin/env python3
"""Settings › Browsing › Pages › Translation languages (studio/06 row 84;
translate.target on the Mac, one language there): the row's pop-up button
(Add Language…) offers every language Mozilla's models translate into that
isn't chosen yet; each chosen one is a line under the row with Remove,
English alone to begin with, the last one can't be removed (the user's wish,
24 Nov 2026: clean, not a grid of 58 ticks); what is chosen is what
translate.menuLanguages gives the right-click menu, and the window's state
too; kept after a restart. The find field finds the row."""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b  # noqa: E402
import translate_kit as k  # noqa: E402

SHOTS = k.ROOT / "out" / "translate-shots"
SHOTS.mkdir(parents=True, exist_ok=True)

t = b.T()
k.world("translate-settings", fake=True)
k.launch()


def menu():
    return [l["code"] for l in b.cmd("translate.menuLanguages")["languages"]]


def slice_menu():
    return [l["code"] for l in (b.state()["windows"][0].get("translate") or {}).get("menu", [])]


t.ok(menu() == ["en"], f"English alone to begin with: {menu()}")
t.ok(slice_menu() == ["en"], "the window's state says the same")

sid = b.cmd("internal.open", url="oriel://settings/browsing")
b.wait_for(lambda: b.ev(sid, "!!document.querySelector('[data-row=\"translate.target\"]')"), within=10, what="the row")
ROW = '[data-row="translate.target"]'
chosen = lambda: b.ev(sid, "[...document.querySelectorAll('.tr-chosen [data-lang]')].map(e => e.dataset.lang)")
row = b.ev(sid, """(() => { const r = document.querySelector('[data-row="translate.target"]');
  return { title: r.querySelector('.sr-title').innerText.trim(), detail: r.querySelector('.sr-detail').innerText.trim(),
           button: r.querySelector('.tr-add .dd-value')?.innerText, ticks: document.querySelectorAll('.tr-chosen input, [data-row="translate.target"] input[type=checkbox]').length,
           remove: [...document.querySelectorAll('.tr-chosen [data-lang] button')].map(x => ({ text: x.innerText.trim(), disabled: x.disabled })) } })()""")
t.ok(row["title"] == "Translation languages", f"the row is back, as Translation languages: {row['title']!r}")
t.ok("this PC" in row["detail"] and "Mac" not in row["detail"] and "—" not in row["detail"], f"its words name the PC: {row['detail']!r}")
t.ok(row["button"] == "Add Language…" and row["ticks"] == 0, f"clean: a pop-up button, no ticks ({row['button']!r}, {row['ticks']} ticks)")
t.ok(chosen() == ["en"], f"English alone to begin with: {chosen()}")
t.ok(row["remove"] == [{"text": "Remove", "disabled": True}], f"the last one can't be removed: {row['remove']}")


def open_add():
    b.ev(sid, f"(() => {{ const e = document.querySelector('{ROW} .tr-add'); e.scrollIntoView({{block: 'center'}}); e.dispatchEvent(new PointerEvent('pointerdown', {{button: 0, bubbles: true}})) }})()")
    b.wait_for(lambda: b.ev(sid, "!!document.querySelector('.dd-list.placed')"), within=5, what="the list")
    time.sleep(0.4)  # a press needs 300 ms after opening


def offered():
    return b.ev(sid, "[...document.querySelectorAll('.dd-list .dd-row .dd-label')].map(e => e.textContent)")


def pick(name):
    open_add()
    b.ev(sid, f"[...document.querySelectorAll('.dd-list .dd-row')].find(r => r.querySelector('.dd-label').textContent === {name!r}).dispatchEvent(new PointerEvent('pointerup', {{button: 0, bubbles: true}}))")


open_add()
names = offered()
t.ok(names[0] == "Add Language…" and len(names) == 58 and "English" not in names and "French" in names and "Japanese" in names,
     f"Add Language… offers the other 57, named in English ({len(names) - 1})")
b.ev(sid, "document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}))")
b.ev(sid, f"document.querySelector('{ROW}').scrollIntoView({{ block: 'center' }})")
time.sleep(0.4)
b.shot(SHOTS / "settings-row.png")

# French and German added: lines under the row, the menu offers them, in the list's order.
pick("French")
b.wait_for(lambda: menu() == ["en", "fr"], within=5, what="French in the menu")
pick("German")
b.wait_for(lambda: menu() == ["en", "fr", "de"], within=5, what="German in the menu")
t.ok(chosen() == ["en", "fr", "de"], f"added French and German: a line each under the row ({chosen()})")
t.ok(menu() == ["en", "fr", "de"], f"…and the menu offers them: {menu()}")
names = [l["name"] for l in b.cmd("translate.menuLanguages")["languages"]]
t.ok(names == ["English", "French", "German"], f"with their names: {names}")
t.ok(b.wait_for(lambda: slice_menu() == ["en", "fr", "de"], within=3, what="slice"), "the window's state follows")
open_add()
t.ok("French" not in offered() and "German" not in offered(), "Add Language… no longer offers them")
b.ev(sid, "document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}))")
time.sleep(0.3)
t.ok(not b.ev(sid, "document.querySelector('.tr-chosen [data-lang=\"en\"] button').disabled"), "English can be removed now")
b.ev(sid, "document.querySelector('.tr-chosen [data-lang=\"en\"] button').click()")
b.wait_for(lambda: menu() == ["fr", "de"], within=5, what="English out")
t.ok(menu() == ["fr", "de"] and chosen() == ["fr", "de"], "removed English: gone from the lines and the menu")

# The find field finds it.
found = b.ev(sid, "(async () => { const f = document.querySelector('.st-hunt input, input[placeholder^=\"Find\"]'); f.focus(); f.value = 'translation'; f.dispatchEvent(new Event('input', { bubbles: true })); await new Promise(r => setTimeout(r, 300)); return [...document.querySelectorAll('[data-row]')].map(r => r.dataset.row) })()")
t.ok(found and "translate.target" in found, f"the find field finds it: {found}")

# Kept after a restart.
b.quit()
time.sleep(1)
k.world("translate-settings", fake=True, wipe=False)
k.launch()
t.ok(menu() == ["fr", "de"], f"after a restart: still French and German: {menu()}")
t.ok("translate.languages" in b.state()["prefs"], "written in prefs.json as translate.languages")

t.done()

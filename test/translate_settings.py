#!/usr/bin/env python3
"""Settings › Browsing › Pages › Translation languages (studio/06 row 84;
translate.target on the Mac, one language there): a tick for each language
Mozilla's models translate into, English alone to begin with, the last one
can't be unticked; what is ticked is what translate.menuLanguages gives the
right-click menu, and the window's state too; kept after a restart. The
find field finds the row."""
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
row = b.ev(sid, """(() => { const r = document.querySelector('[data-row="translate.target"]');
  return { title: r.querySelector('.sr-title').innerText.trim(), detail: r.querySelector('.sr-detail').innerText.trim(),
           langs: [...r.querySelectorAll('[data-lang]')].map(l => l.dataset.lang),
           names: [...r.querySelectorAll('[data-lang] span')].map(s => s.innerText),
           ticked: [...r.querySelectorAll('[data-lang] input:checked')].map(i => i.closest('[data-lang]').dataset.lang),
           locked: r.querySelector('[data-lang="en"] input').disabled } })()""")
t.ok(row["title"] == "Translation languages", f"the row is back, as Translation languages: {row['title']!r}")
t.ok("this PC" in row["detail"] and "Mac" not in row["detail"] and "—" not in row["detail"], f"its words name the PC: {row['detail']!r}")
t.ok(len(row["langs"]) == 58 and row["langs"][0] == "en", f"every language Mozilla translates into, English first: {len(row['langs'])}")
t.ok("French" in row["names"] and "German" in row["names"] and "Japanese" in row["names"], "named in English")
t.ok(row["ticked"] == ["en"], "English ticked")
t.ok(row["locked"], "the last one ticked can't be unticked")
b.ev(sid, "document.querySelector('[data-row=\"translate.target\"]').scrollIntoView({ block: 'center' })")
time.sleep(0.4)
b.shot(SHOTS / "settings-row.png")

# French and German ticked: the menu offers them, in the list's order.
b.ev(sid, "document.querySelector('[data-lang=\"fr\"] input').click()")
b.wait_for(lambda: menu() == ["en", "fr"], within=5, what="French in the menu")
b.ev(sid, "document.querySelector('[data-lang=\"de\"] input').click()")
b.wait_for(lambda: menu() == ["en", "fr", "de"], within=5, what="German in the menu")
t.ok(menu() == ["en", "fr", "de"], f"ticked French and German: the menu offers them: {menu()}")
names = [l["name"] for l in b.cmd("translate.menuLanguages")["languages"]]
t.ok(names == ["English", "French", "German"], f"with their names: {names}")
t.ok(b.wait_for(lambda: slice_menu() == ["en", "fr", "de"], within=3, what="slice"), "the window's state follows")
t.ok(not b.ev(sid, "document.querySelector('[data-lang=\"en\"] input').disabled"), "English can be unticked now")
b.ev(sid, "document.querySelector('[data-lang=\"en\"] input').click()")
b.wait_for(lambda: menu() == ["fr", "de"], within=5, what="English out")
t.ok(menu() == ["fr", "de"], "unticked English: gone from the menu")

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

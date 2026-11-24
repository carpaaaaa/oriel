#!/usr/bin/env python3
"""Search a site from the address field (Settings' note note.sitesearch,
"Always there: type red, then Tab, and search Reddit"; 08 area D;
SiteSearch.swift, studio/06 §5.5). No ready-made site for now (the owner's
decision): red, yt and wiki offer nothing, so the note promising them is left
out of Settings and its find field; only a site shortcut of the user's own is
offered, by its word or the start of its site's name (SiteSearch.match with
the keywords). Writing shortcuts in Settings: settings_shortcuts.py."""
import sys
import time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b

b.use("settings-d-search")
b.launch()
t = b.T()


def ev(tab, js):
    try:
        return b.ev(tab, js)
    except RuntimeError:
        return None


def site(text):
    return b.call({"do": "field.address", "text": text})["site"]


for word in ("red", "yt", "wiki", "goo", "maps"):
    t.ok(site(word) is None, f"no ready-made site: {word} offers nothing ({site(word)})")
b.cmd("prefs.set", key="search.keywords", value=[{"keyword": "r", "template": "https://www.reddit.com/search/?q=%s"}])
time.sleep(0.3)
t.ok(site("red") == "Reddit", f"with a shortcut of your own, red offers its site ({site('red')})")
t.ok(site("yt") is None, "and no other")
t.ok(site("zzzqqq") is None, "a word no site has offers none")

b.cmd("settings.open", page="browsing")
b.wait_for(lambda: any(x.get("internal") == "settings" for x in b.window()["tabs"]), what="Settings", within=30)
tab = next(x for x in b.window()["tabs"] if x.get("internal") == "settings")["id"]
b.wait_for(lambda: ev(tab, "document.querySelectorAll('.sr').length"), what="rows", within=30)
b.ev(tab, "(() => { const f = document.querySelector('.st-find input'); f.value = 'search a site'; f.dispatchEvent(new Event('input', {bubbles: true})) })()")
time.sleep(0.3)
found = b.ev(tab, "[...document.querySelectorAll('.sr[data-row]')].map(r => r.dataset.row)")
t.ok("note.sitesearch" not in found, f"Settings has no note promising a ready-made site ({found})")
t.ok("type red, then Tab, and search Reddit" not in b.ev(tab, "document.body.innerText"), "nothing says type red, then Tab")
t.ok(not b.state().get("errors"), "no error in the main process")
t.done()

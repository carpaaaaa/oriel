#!/usr/bin/env python3
"""Search a site from the address field (Settings' note note.sitesearch,
"Always there: type red, then Tab, and search Reddit"; 08 area D,
search.sites; SiteSearch.swift, studio/06 §5.5): always on, the field
module's. The words the note gives work: red offers Reddit, yt YouTube,
and the find field of Settings finds the note."""
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


t.ok(site("red") == "Reddit", f"red offers Reddit ({site('red')})")
t.ok(site("yt") == "YouTube", f"yt offers YouTube ({site('yt')})")
t.ok(site("wiki") is not None and "Wikipedia" in site("wiki"), f"wiki offers Wikipedia ({site('wiki')})")
t.ok(site("zzzqqq") is None, "a word no site has offers none")

b.cmd("settings.open", page="browsing")
b.wait_for(lambda: any(x.get("internal") == "settings" for x in b.window()["tabs"]), what="Settings", within=30)
tab = next(x for x in b.window()["tabs"] if x.get("internal") == "settings")["id"]
b.wait_for(lambda: ev(tab, "document.querySelectorAll('.sr').length"), what="rows", within=30)
b.ev(tab, "(() => { const f = document.querySelector('.st-find input'); f.value = 'search a site'; f.dispatchEvent(new Event('input', {bubbles: true})) })()")
time.sleep(0.3)
found = b.ev(tab, "[...document.querySelectorAll('.sr[data-row]')].map(r => r.dataset.row)")
t.ok("note.sitesearch" in found, f"Settings finds the note ({found})")
t.ok("Always there: type red, then Tab, and search Reddit" in b.ev(tab, "document.body.innerText"), "in the Mac's words")
t.ok(not b.state().get("errors"), "no error in the main process")
t.done()

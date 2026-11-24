#!/usr/bin/env python3
"""oriel://history (studio/05 §3.5, Recall.swift): the page draws in a tab,
with its search and its foot; with the bridge Oriel's pages get (the settings
module's window.oriel), the pages by day with their times, Remove and Clear."""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b

b.use("data-history-page")
b.launch()
t = b.T()


def req(name, **kw):
    return b.call({"do": name, **kw})


req("data.visit", url="https://history-one.example/", title="History One")
req("data.visit", url="https://history-two.example/page", title="History Two")

# oriel://history once the scheme is served; until then the same page from
# the bundle (page.tsx draws ?page=<name> too).
PAGE = (Path(__file__).resolve().parent.parent / "out" / "ui" / "page.html").as_uri() + "?page=history"
b.cmd("field.commit", text=PAGE)
b.wait_for(lambda: "page.html" in (b.active() or {}).get("url", "") and not b.active()["loading"], what="the page")
time.sleep(0.8)
tab = b.active()["id"]
text = b.ev(tab, "document.body.innerText")
t.ok("History" in text, f"the page draws ({text[:80]!r})")
t.ok(b.ev(tab, "document.querySelector('.hp-hunt')?.placeholder") == "Search everywhere you have been", "its search, as the Mac words it")
t.ok("Clear…" in text, "and Clear… at the foot")

if b.ev(tab, "!!window.oriel"):
    b.wait_for(lambda: "History One" in b.ev(tab, "document.body.innerText"), what="rows")
    text = b.ev(tab, "document.body.innerText")
    t.ok("Today" in text and "History Two" in text and "history-two.example/page" in text, "the pages under Today, with title and address")
    t.ok("2 pages" in text, "the count")
    b.ev(tab, "[...document.querySelectorAll('.hp-row')].find(r => r.innerText.includes('History One')).querySelector('.hp-remove').click()")
    b.wait_for(lambda: "History One" not in b.ev(tab, "document.body.innerText"), what="removed")
    t.ok(not any(v["url"] == "https://history-one.example/" for v in req("data.history")["file"] if v["title"]), "Remove forgets it")
else:
    print("       (no window.oriel on Oriel's pages yet: the settings module's bridge; rows not checked)")
t.done()

#!/usr/bin/env python3
"""Return takes the top suggestion (Settings › Browsing, search.returnTop;
Search 1.0.21, ReturnTakesTopTests; the field raised from any app too,
Search 1.0.22, LauncherTests): the place on top of the list is picked as you
type, the field keeps what was typed, Return goes there; ↑ lets go of the
row and Return searches; ↓ still walks the list; an address typed out and a
search on top pick nothing. Off, as it ships, Return searches."""
import json
import sys
import time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b  # noqa: E402
import settings_c_web as web  # noqa: E402

server, P = web.start(tls=False)
web.PAGES["/teams/kettlebell-club"] = "<title>Kettlebell club</title>club"
web.PAGES["/search"] = "<title>Results</title>results"
web.PAGES["/start"] = "<title>start</title>start"
PAGE = f"http://127.0.0.1:{P}/teams/kettlebell-club"

b.use("field-returntop")
b.folder().mkdir(parents=True, exist_ok=True)
(b.folder() / "prefs.json").write_text(json.dumps({"search.engine": "custom", "search.custom": f"http://127.0.0.1:{P}/search?q=%s",
                                                   "launcher.on": True, "launcher.key": json.dumps({"name": "Ctrl+Shift+Space"})}))
b.launch()
t = b.T()
# A page found by a word from its title, which the grey ending can't finish.
b.call({"do": "field.fake", "places": [{"kind": "history", "url": PAGE, "title": "Kettlebell club"}]})


def typed(text):
    b.cmd("field.type", text=text)
    time.sleep(0.4)
    return b.window()["field"]


def start():
    id = b.cmd("tab.new", url=f"http://127.0.0.1:{P}/start")
    b.wait_for(lambda: (b.active() or {}).get("title") == "start" and not b.active()["loading"], within=20, what="a page")
    b.cmd("field.open", target="here")
    time.sleep(0.3)
    return id


def landed(title):
    return b.wait_for(lambda: (a := b.active()) and a["title"] == title and a, within=15, what=title)


# Off, as it ships.
start()
f = typed("kettlebell")
t.ok(f["suggestions"][0]["url"] == PAGE and f["ending"] is None and f["selected"] == -1, "off: the page is listed on top, nothing picked")
b.cmd("field.submit", text="kettlebell")
t.ok(landed("Results")["url"].startswith(f"http://127.0.0.1:{P}/search"), "off: Return searches the words")

b.cmd("prefs.set", key="search.returnTop", value=True)
start()
f = typed("kettlebell")
t.ok(f["selected"] == 0, f"on: the top row is picked as you type ({f['selected']})")
t.ok(f["shown"] == "kettlebell" and f["text"] == "kettlebell", f"…and the field keeps what was typed ({f['shown']!r})")
b.cmd("field.submit", text="kettlebell")
t.ok(landed("Kettlebell club")["url"] == PAGE, "Return goes to the page")

start()
typed("kettlebell")
b.cmd("field.move", by=-1)
time.sleep(0.2)
f = b.window()["field"]
t.ok(f["selected"] == -1 and f["shown"] == "kettlebell", f"↑ lets go of the row ({f['selected']})")
b.cmd("field.submit", text="kettlebell")
t.ok(landed("Results")["url"].startswith(f"http://127.0.0.1:{P}/search"), "…and Return searches")

start()
typed("kettlebell")
b.cmd("field.move", by=1)
time.sleep(0.2)
t.ok(b.window()["field"]["selected"] == 1, "↓ still goes to the next row")
f = typed(f"127.0.0.1:{P}/teams")
t.ok(f["selected"] == -1, "an address typed out is not swapped for a row")
f = typed("zzqx nothing like it")
t.ok(f["selected"] == -1, "a search on top: nothing picked")
b.cmd("field.close")

# The address in the tab (Search 1.0.21): the same.
here = start()
b.cmd("field.close")
time.sleep(0.3)
b.cmd("field.editTab", id=here)
time.sleep(0.5)
b.cmd("field.tabType", text="kettlebell")
time.sleep(0.4)
e = b.window()["tabEdit"]
t.ok(e and e["selected"] == 0 and e["offers"][0]["url"] == PAGE, f"the address in the tab: the top place picked as you type ({e and e['selected']})")
b.cmd("field.tabMove", by=-1)
time.sleep(0.2)
t.ok(b.window()["tabEdit"]["selected"] == -1, "…↑ lets go of it")
b.cmd("field.tabType", text="kettlebel")
b.cmd("field.tabType", text="kettlebell")
time.sleep(0.4)
b.cmd("field.tabCommit", text="kettlebell")
t.ok(landed("Kettlebell club")["url"] == PAGE, "…and Return goes to the page")

# The field raised from any app (launcher.on): the same.
b.call({"do": "settingsb.launch"})
time.sleep(0.6)
t.ok(b.active()["empty"], "the key from any app: a new tab's field up")
f = typed("kettlebell")
t.ok(f["selected"] == 0 and f["shown"] == "kettlebell", f"…the top place picked as you type, what was typed kept ({f['selected']}, {f['shown']!r})")
b.cmd("field.move", by=-1)
time.sleep(0.2)
t.ok(b.window()["field"]["selected"] == -1, "…↑ lets go of it")
f = typed("kettlebel")
f = typed("kettlebell")
b.cmd("field.submit", text="kettlebell")
t.ok(landed("Kettlebell club")["url"] == PAGE, "…and Return goes to the page")
t.done()

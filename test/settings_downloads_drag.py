#!/usr/bin/env python3
"""Downloads, Search 1.0.20-1.0.22 (DownloadDragOutTests, DownloadReplaceTests):
a finished download is dragged out of the Downloads list as its file, onto a
page or into File Explorer, from the Downloads tab and from the card by the
button alike; one under way or whose file has gone has nothing to drag (a
test world never starts the system's drag: the main process notes the file it
would drag). A download saved over a file already there, after answering
Replace, replaces it."""
import os
import shutil
import sys
import time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b
import settings_web as web

server, origin = web.start()
web.PAGES["/page"] = "<title>files</title><body>files</body>"

b.use("settings-downloads-drag")
b.launch()
t = b.T()
folder = Path(b.folder()) / "Drag downloads"
shutil.rmtree(folder, ignore_errors=True)
folder.mkdir(parents=True)


def ev(tab, js):
    try:
        return b.ev(tab, js)
    except RuntimeError:
        return None


def ds():
    return b.call({"do": "settings.state"})["downloads"]


def fetch(tab, path):
    ev(tab, "(() => { const a = document.createElement('a'); a.href = '%s'; a.download = ''; document.body.appendChild(a); a.click(); a.remove() })()" % path)


DRAG = """(() => { const r = [...document.querySelectorAll('.dl-row.kept')].find(r => r.querySelector('.dl-name').textContent === %r);
  if (!r) return null; const e = new DragEvent('dragstart', { bubbles: true, cancelable: true }); r.dispatchEvent(e);
  return { draggable: r.draggable, prevented: e.defaultPrevented } })()"""

b.call({"do": "settings.answers", "folder": str(folder)})
b.cmd("settings.do", id="downloads.folder")
b.cmd("settings.set", id="downloads.peek", value=False)
b.cmd("tab.new", url=origin + "/page")
b.wait_for(lambda: b.active()["title"] == "files", what="page")
page = b.active()["id"]
time.sleep(0.3)
for name in ("one.bin", "two.bin"):
    fetch(page, f"/file/{name}?size=3000")
b.wait_for(lambda: (folder / "one.bin").exists() and (folder / "two.bin").exists() and not ds()["current"], what="two files in")
time.sleep(0.4)

# 1. The Downloads tab: a finished download drags out as its file.
b.cmd("settings.set", id="downloads.open", value="tab")
b.cmd("downloads.show")
b.wait_for(lambda: any(x.get("internal") == "downloads" for x in b.window()["tabs"]), what="Downloads tab")
dl = next(x for x in b.window()["tabs"] if x.get("internal") == "downloads")["id"]
b.wait_for(lambda: (ev(dl, "document.querySelectorAll('.dl-row.kept').length") or 0) >= 2, what="rows")
r = ev(dl, DRAG % "one.bin")
b.wait_for(lambda: str(folder / "one.bin") in ds()["dragged"], within=5, what="dragged from the tab")
t.ok(r and r["draggable"] and r["prevented"], f"the Downloads tab: a finished row is draggable, the system's drag takes over ({r})")
t.ok(ds()["dragged"][-1] == str(folder / "one.bin"), "and the drag carries its file")
t.ok(not any(o.startswith("open:") for o in b.call({"do": "settings.state"})["opened"]), "dragging doesn't open it")

# 2. A file gone: nothing to drag.
os.remove(folder / "two.bin")
b.wait_for(lambda: ev(dl, "[...document.querySelectorAll('.dl-row.kept.gone .dl-name')].some(e => e.textContent === 'two.bin')"), within=10, what="two.bin gone")
before = list(ds()["dragged"])
r = ev(dl, DRAG % "two.bin")
time.sleep(0.5)
t.ok(r and not r["draggable"] and ds()["dragged"] == before, f"its file gone: not draggable, nothing dragged ({r})")

# 3. The card by the button: the same.
b.cmd("settings.set", id="downloads.open", value="popover")
b.cmd("downloads.show", toggle=True)
b.wait_for(lambda: b.ui("document.querySelectorAll('.dlf .dl-row.kept').length", root="overlay"), what="card rows")
r = b.ui(DRAG % "one.bin", root="overlay")
b.wait_for(lambda: len(ds()["dragged"]) == len(before) + 1, within=5, what="dragged from the card")
t.ok(r and r["draggable"] and ds()["dragged"][-1] == str(folder / "one.bin"), f"the card by the button: dragged out as its file too ({r})")
b.cmd("downloads.show", toggle=True)

# 4. Under way: no row to drag (only finished ones are kept rows).
web.gate("g")
fetch(page, "/file/going.bin?size=400000&gate=g")
b.wait_for(lambda: any(d["name"] == "going.bin" for d in ds()["current"]), what="going.bin coming in")
going = next(d for d in ds()["current"] if d["name"] == "going.bin")
r = b.cmd("download.drag", id=going["id"])
t.ok(r == {"dragged": False}, f"a download under way has nothing to drag ({r})")
web.gate("g").set()
b.wait_for(lambda: not ds()["current"], within=20, what="going.bin done")

# 5. Saved over a file already there, after Replace: replaced (Search 1.0.22, idea 1232).
there = folder / "photo.jpg"
there.write_bytes(b"old picture")
b.cmd("settings.set", id="downloads.ask", value=True)
b.call({"do": "settings.answers", "saveAs": str(there)})
fetch(page, "/file/photo.jpg?size=5000")
b.wait_for(lambda: there.exists() and there.stat().st_size == 5000 and not ds()["current"], within=15, what="replaced")
t.ok(True, "saved over a file already there (Replace answered): the new file replaces it")
t.ok(not (folder / "photo 2.jpg").exists(), "and nothing is saved beside it")
b.cmd("settings.set", id="downloads.ask", value=False)
b.call({"do": "settings.answers", "saveAs": None})

server.shutdown()
t.ok(not b.state().get("errors"), "no error in the main process")
t.done()

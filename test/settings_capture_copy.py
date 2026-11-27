#!/usr/bin/env python3
"""Copy captures only (Search 1.0.22, SnapCopyOnlyTests): in Settings ›
Browsing › Pages under Capture pages, Capture… puts the picture on the
clipboard and saves no PNG in the downloads folder. Off unless turned on, so
a capture is still copied and saved; the row counts only with Capture pages
on. The clipboard of whoever works beside the test is put back after."""
import json
import os
import shutil
import sys
import tempfile
import time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b
import settings_c_web as web

server, P = web.start(tls=False)
H = f"http://127.0.0.1:{P}"
web.PAGES["/snap"] = ("<title>snap</title><body style='margin:0;height:1200px;background:#fff'>"
                      "<div id='box' style='position:absolute;left:40px;top:40px;width:200px;height:100px;background:#c33'></div>")

b.use("settings-capture-copy")
b.launch()
t = b.T()


def ev(tab, js):
    try:
        return b.ev(tab, js)
    except RuntimeError:
        return None


def caps():
    return b.call({"do": "pages.state"})["captures"]


def clip():
    return b.call({"do": "ctxmenu.clipboard"})


folder = tempfile.mkdtemp(prefix="oriel-capture-copy-")
b.cmd("settings.set", id="downloads", value=folder)
b.call({"do": "ctxmenu.clipboard", "op": "save"})
try:
    # The row: under Capture pages, off by default, counting only with Capture pages on.
    b.cmd("app.settings")
    b.wait_for(lambda: any(x.get("internal") == "settings" for x in b.window()["tabs"]), what="Settings tab")
    st = next(x for x in b.window()["tabs"] if x.get("internal") == "settings")["id"]
    b.wait_for(lambda: ev(st, "document.querySelectorAll('.sr').length"), what="rows")
    vals = b.call({"do": "settings.state"})
    t.ok(b.state()["prefs"].get("pages.capture.copyOnly", False) is False, "Copy captures only: off unless turned on")
    ev(st, "(() => { const f = document.querySelector('.st-find input'); f.value = 'copy captures'; f.dispatchEvent(new Event('input', {bubbles: true})) })()")
    time.sleep(0.5)
    found = ev(st, "[...document.querySelectorAll('.st-column .sr[data-row]')].map(e => e.dataset.row)") or []
    t.ok("pages.capture.copyOnly" in found, f"Find a setting finds it ({found})")
    row = ev(st, "document.querySelector(\"[data-row='pages.capture.copyOnly']\")?.innerText") or ""
    t.ok("Copy captures only" in row and "no PNG saved in your downloads folder" in row, f"its words, Search's ({row!r})")
    b.cmd("settings.set", id="pages.capture", value=False)
    time.sleep(0.6)
    row = ev(st, "document.querySelector(\"[data-row='pages.capture.copyOnly']\")?.innerText") or ""
    t.ok("Only with Capture pages on" in row, f"with Capture pages off it says what it needs ({row!r})")
    b.cmd("settings.set", id="pages.capture", value=True)

    b.cmd("tab.new", url=H + "/snap")
    b.wait_for(lambda: b.active()["title"] == "snap", within=30, what="snap")
    sn = b.active()["id"]
    b.wait_for(lambda: ev(sn, "new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(1))))") == 1, within=30, what="painted")
    time.sleep(0.4)

    # Off: copied and saved, as before.
    b.call({"do": "ctxmenu.clipboard", "op": "clear"})
    r = b.cmd("view.capture", mode="area", rect={"x": 40, "y": 40, "width": 200, "height": 100})
    t.ok(r.get("said") == f"Copied and saved to {Path(folder).name}" and r.get("path") and Path(r["path"]).exists(), f"off: copied and saved as a PNG ({r})")
    t.ok((clip().get("image") or "").startswith("image/"), "and the picture is on the clipboard")
    before = sorted(os.listdir(folder))

    # On: only copied.
    b.cmd("settings.set", id="pages.capture.copyOnly", value=True)
    time.sleep(0.5)
    b.call({"do": "ctxmenu.clipboard", "op": "clear"})
    r = b.cmd("view.capture", mode="area", rect={"x": 40, "y": 40, "width": 200, "height": 100})
    t.ok(r.get("said") == "Copied" and not r.get("path"), f"on: Copied, and no file named ({r})")
    c = clip()
    t.ok((c.get("image") or "").startswith("image/") and c.get("imageBytes", 0) > 100, f"the picture is on the clipboard ({c.get('image')}, {c.get('imageBytes')} bytes)")
    time.sleep(0.5)
    t.ok(sorted(os.listdir(folder)) == before, f"and no PNG in the downloads folder ({sorted(os.listdir(folder))})")
    r = b.cmd("view.capture", mode="page")
    t.ok(r.get("said") in ("Copied", "The top of the page copied") and sorted(os.listdir(folder)) == before, f"Whole Page too: copied, not saved ({r.get('said')})")
    t.ok(caps()[-1]["path"] == "" and caps()[-1]["width"] > 0, "the bench sees a capture with no file")
finally:
    b.call({"do": "ctxmenu.clipboard", "op": "restore"})
    shutil.rmtree(folder, ignore_errors=True)

t.ok(not b.state().get("errors"), "no error in the main process")
server.shutdown()
t.done()

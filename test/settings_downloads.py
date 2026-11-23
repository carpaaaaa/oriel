#!/usr/bin/env python3
"""Downloads as Search keeps them (studio/06 §3.1-3.2): into the folder of
Settings › Downloads, "name 2.ext" for a name taken, asking where when
Settings says so; progress on the button and on the taskbar; pause, resume,
cancel, retry; downloads.json in the Mac's format, 50 at most; the list in a
tab or floating by the button; open and show in the folder (never really
opened in a test world); a private window's never listed."""
import json
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

b.use("settings-downloads")
b.launch()
t = b.T()
folder = Path(b.folder()) / "Downloads here"
shutil.rmtree(folder, ignore_errors=True)
folder.mkdir(parents=True)


def ev(tab, js):
    try:
        return b.ev(tab, js)
    except RuntimeError:
        return None


def ds():
    return b.call({"do": "settings.state"})["downloads"]


def current(name=None):
    c = ds()["current"]
    return next((d for d in c if name is None or d["name"] == name), None)


def fetch(tab, path):
    ev(tab, "(() => { const a = document.createElement('a'); a.href = %s; a.download = ''; document.body.appendChild(a); a.click(); a.remove() })()" % json.dumps(path))


# The folder, chosen through Settings (answered by the test, never a dialog).
b.call({"do": "settings.answers", "folder": str(folder)})
b.cmd("settings.do", id="downloads.folder")
t.ok(b.state()["prefs"].get("downloads") == str(folder), "Change… sets the downloads folder")

b.cmd("tab.new", url=origin + "/page")
b.wait_for(lambda: b.active()["title"] == "files", what="page")
page = b.active()["id"]
time.sleep(0.3)
t.ok(not (b.window().get("settings") or {}).get("downloadsButton"), "no download, no button (Always show is off)")

# 1. A file coming in: listed, the button's ring, the taskbar's bar.
web.gate("a")
fetch(page, "/file/a.bin?size=400000&gate=a")
b.wait_for(lambda: current("a.bin") and current("a.bin")["received"] > 0, what="a.bin coming in")
d = current("a.bin")
t.ok(d["state"] == "downloading" and d["total"] == 400000 and d["from"] == "127.0.0.1", f"listed as downloading, with its size and site ({d['state']}, {d['total']})")
s = b.window()["settings"]
t.ok(s["downloadsButton"] and s["downloadsProgress"] is not None and 0 < s["downloadsProgress"] < 1, f"the button shows, with the fraction come in ({s['downloadsProgress']})")
p = ds()["progress"]
t.ok(p and p["mode"] == "normal" and 0 < p["value"] < 1, f"the taskbar shows it ({p})")
t.ok(any(x["state"] == "progressing" for x in b.window()["downloads"]), "the window's downloads say progressing")
t.ok("Downloading a.bin" in b.call({"do": "settings.state"})["said"], "Downloading a.bin")
door = b.ui("!!document.querySelector('.fetch-door')")
t.ok(door, "the downloads button is at the column's foot")

# Pause and resume.
b.cmd("download.pause", id=d["id"])
b.wait_for(lambda: current("a.bin")["state"] == "paused", what="paused")
t.ok(True, "Pause: paused")
b.wait_for(lambda: ds()["progress"]["mode"] == "paused", what="taskbar paused")
t.ok(True, "the taskbar's bar pauses with it")
b.cmd("download.resume", id=d["id"])
b.wait_for(lambda: current("a.bin") and current("a.bin")["state"] in ("downloading", "resuming"), what="resumed")
t.ok(True, "Resume: downloading again")
web.gate("a").set()
b.wait_for(lambda: not current("a.bin"), within=20, what="a.bin done")
t.ok((folder / "a.bin").exists() and (folder / "a.bin").stat().st_size == 400000, "the file is in the folder, whole")
t.ok("Saved a.bin" in b.call({"do": "settings.state"})["said"], "Saved a.bin")
b.wait_for(lambda: ds()["progress"]["mode"] == "none", what="taskbar clear")
t.ok(ds()["progress"]["value"] == -1, "the taskbar's bar goes")
b.wait_for(lambda: (Path(b.folder()) / "downloads.json").exists(), what="downloads.json")
kept = json.loads((Path(b.folder()) / "downloads.json").read_text())
t.ok(kept and kept[0]["name"] == "a.bin" and kept[0]["from"] == "127.0.0.1" and kept[0]["path"] == str(folder / "a.bin")
     and isinstance(kept[0]["date"], (int, float)) and kept[0]["date"] < 2e9 and kept[0]["address"].startswith(origin),
     "downloads.json as Loot.swift writes it (name, from, path, date since 2001, address)")

# 2. The same name again: "a 2.bin", not "a (1).bin".
fetch(page, "/file/a.bin?size=1000")
b.wait_for(lambda: (folder / "a 2.bin").exists() and not current(), what="a 2.bin")
t.ok(True, "a name taken: a 2.bin")

# 3. Cancel: gone from the list, no file.
web.gate("c")
fetch(page, "/file/c.bin?size=400000&gate=c")
b.wait_for(lambda: current("c.bin") and current("c.bin")["received"] > 0, what="c.bin")
b.cmd("download.cancel", id=current("c.bin")["id"])
b.wait_for(lambda: not current("c.bin"), what="cancelled")
time.sleep(0.3)
t.ok(not (folder / "c.bin").exists(), "Cancel: gone, and no file")
web.gate("c").set()

# 4. A download that breaks: Failed, Retry from the beginning.
web.BROKEN.add("/file/f.bin")
fetch(page, "/file/f.bin?size=300000&breaks=100000")
b.wait_for(lambda: current("f.bin") and current("f.bin")["state"] in ("failed", "paused"), within=20, what="f.bin failed")
f = current("f.bin")
t.ok(f["state"] in ("failed", "paused") and (f["canRetry"] or f["canResume"]), f"a broken download stays, to retry ({f['state']})")
t.ok("Download failed" in b.call({"do": "settings.state"})["said"] or f["state"] == "paused", "Download failed")
web.BROKEN.discard("/file/f.bin")
b.cmd("download.retry", id=f["id"])
b.wait_for(lambda: (folder / "f.bin").exists() and (folder / "f.bin").stat().st_size == 300000 and not current("f.bin"), within=20, what="retried")
t.ok(True, "Retry: the file comes whole, under its own name")

# 5. No length: the bar can't say how far (indeterminate).
web.gate("n")
fetch(page, "/file/n.bin?size=300000&nolength=1&gate=n")
b.wait_for(lambda: current("n.bin") and current("n.bin")["received"] > 0, what="n.bin")
b.wait_for(lambda: ds()["progress"]["mode"] == "indeterminate", what="indeterminate")
t.ok(b.window()["settings"]["downloadsProgress"] is None, "without a length: the ring turns, the taskbar is indeterminate")
web.gate("n").set()
b.wait_for(lambda: not current("n.bin"), within=20, what="n.bin done")

# 6. Ask where to save each file.
b.cmd("settings.set", id="downloads.ask", value=True)
elsewhere = Path(b.folder()) / "elsewhere.bin"
b.call({"do": "settings.answers", "saveAs": str(elsewhere)})
fetch(page, "/file/w.bin?size=2000")
b.wait_for(lambda: elsewhere.exists() and not current(), what="saved where asked")
t.ok(not (folder / "w.bin").exists(), "Ask where: saved where the answer said")
b.call({"do": "settings.answers", "saveAs": None})
fetch(page, "/file/x.bin?size=2000")
time.sleep(1.0)
t.ok(not current("x.bin") and not (folder / "x.bin").exists(), "Ask where, cancelled: nothing saved")
b.cmd("settings.set", id="downloads.ask", value=False)

# 7. The list in a tab: Completed rows, Show in File Explorer, open, Remove, Clear list.
b.cmd("downloads.show")
b.wait_for(lambda: any(x.get("internal") == "downloads" for x in b.window()["tabs"]), what="Downloads tab")
dl = next(x for x in b.window()["tabs"] if x.get("internal") == "downloads")["id"]
b.wait_for(lambda: ev(dl, "document.querySelectorAll('.dl-row.kept').length") or 0, what="rows")
names = ev(dl, "[...document.querySelectorAll('.dl-row.kept .dl-name')].map(e => e.textContent)")
t.ok(names[:2] == ["elsewhere.bin", "n.bin"] and "a.bin" in names, f"Completed, newest first ({names})")
t.ok(ev(dl, "document.querySelector('.dl-row.kept .dl-state').textContent").startswith("127.0.0.1 · "), "each says <site> · <when>")
ev(dl, "[...document.querySelectorAll('.dl-row.kept')].find(r => r.querySelector('.dl-name').textContent === 'a.bin').querySelector('.quick').click()")
time.sleep(0.3)
opened = b.call({"do": "settings.state"})["opened"]
t.ok(f"reveal:{folder / 'a.bin'}" in opened, "Show in File Explorer shows the file in its folder")
ev(dl, "[...document.querySelectorAll('.dl-row.kept')].find(r => r.querySelector('.dl-name').textContent === 'a.bin').click()")
time.sleep(0.3)
t.ok(f"open:{folder / 'a.bin'}" in b.call({"do": "settings.state"})["opened"], "a click on the row opens the file")
t.ok("Clearing the list leaves the files where they are" in ev(dl, "document.querySelector('.plate-foot').innerText"), "the foot: Clearing the list leaves the files where they are")

# 8. Floating by the button.
b.cmd("settings.set", id="downloads.open", value="popover")
b.cmd("downloads.show", toggle=True)
w = b.window()
t.ok(w["overlay"]["kind"] == "panel" and w["overlay"]["name"] == "settings.downloads" and w["settings"]["downloadsOpen"], "Floating by the button: the card over the page")
b.wait_for(lambda: b.ui("document.querySelectorAll('.dlf .dl-row').length", root="overlay"), what="card rows")
t.ok(b.ui("document.querySelector('.dlf h2').textContent", root="overlay") == "Downloads", "the card is titled Downloads")
b.cmd("downloads.show", toggle=True)
t.ok(b.window()["overlay"]["kind"] == "none", "the button again puts it away")

# 9. A private window's downloads are never listed.
before = len(ds()["completed"])
b.cmd("window.new", shy=True)
b.wait_for(lambda: len(b.state()["windows"]) == 2, what="private window")
shy = next(w for w in b.state()["windows"] if w["windowID"] != b.window()["windowID"] or True)
shy_id = [w["windowID"] for w in b.state()["windows"]][-1]
b.cmd("tab.new", window=shy_id, url=origin + "/page")
time.sleep(1.0)
shy_tab = next(t2["id"] for t2 in b.state()["windows"][-1]["tabs"] if t2["url"].startswith(origin))
fetch(shy_tab, "/file/private.bin?size=2000")
b.wait_for(lambda: (folder / "private.bin").exists(), what="private file")
time.sleep(0.4)
t.ok(len(ds()["completed"]) == before, "a private download isn't listed")
t.ok("Saved private.bin" in b.call({"do": "settings.state"})["said"], "only said: Saved private.bin")

# 10. Clear list: the files stay.
b.cmd("download.clear")
t.ok(ds()["completed"] == [] and json.loads((Path(b.folder()) / "downloads.json").read_text()) == [] if (time.sleep(0.6) or True) else False, "Clear list empties downloads.json")
t.ok((folder / "a.bin").exists(), "and leaves the files where they are")

t.ok(not b.state().get("errors"), "no error in the main process")
server.shutdown()
t.done()

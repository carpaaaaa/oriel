#!/usr/bin/env python3
"""Updates as Search for Mac has them (studio/06 §4, Updater.swift; 08 area D,
update.install): checked at launch and every hour; with Install updates on
its own, a new version is fetched and ready for the next launch (Relaunch
now); off, it is said and waits for Install; turned back on, a waiting one is
fetched at once. Settings › About says each stage in the Mac's words. The
real electron-updater is checked against a feed on this computer (generic
provider, latest-mac.yml / latest.yml), as GitHub Releases would serve it."""
import json
import sys
import time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b
import settings_web as web

t = b.T()
server, origin = web.start()
FEED = "latest-mac.yml" if sys.platform == "darwin" else "latest.yml"


def ev(tab, js):
    try:
        return b.ev(tab, js)
    except RuntimeError:
        return None


def up(**kw):
    return b.call({"do": "settings.updater", **kw})


def about():
    b.cmd("settings.open", page="about")
    b.wait_for(lambda: any(x.get("internal") == "settings" for x in b.window()["tabs"]), what="Settings", within=30)
    tab = next(x for x in b.window()["tabs"] if x.get("internal") == "settings")["id"]
    b.wait_for(lambda: ev(tab, "location.pathname") == "/about" and ev(tab, "!!document.querySelector(\"[data-row='updates.version']\")"), what="About", within=30)
    return tab


def row(tab):
    return ev(tab, """(() => { const r = document.querySelector("[data-row='updates.version']"); return r && {
      title: r.querySelector('.sr-title span').textContent, detail: r.querySelector('.sr-detail')?.textContent ?? '',
      control: r.querySelector('.sr-control')?.innerText.trim() ?? '', ring: !!r.querySelector('.st-ring') } })()""")


def seed(prefs):
    folder = b.folder()
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "prefs.json").write_text(json.dumps(prefs))


# 1. At launch: checked once; nothing new.
b.use("settings-d-updates")
b.launch()
b.wait_for(lambda: up()["fake"]["checks"] >= 1, what="checked at launch")
t.ok(up()["active"], "a test world has the bench's feed")
t.ok(b.state()["prefs"].get("update.checked"), "the check is kept (update.checked)")
tab = about()
r = row(tab)
t.ok(r["title"] == "Updates" and r["detail"].startswith("Checked ") and r["detail"].endswith(", every hour on its own"), f"About: Updates, Checked <when>, every hour on its own ({r})")
t.ok(r["control"] == "Check now", "with Check now")
ev(tab, "document.querySelector(\"[data-row='updates.version'] .pill-st\").click()")
b.wait_for(lambda: "This is the latest one" in (ev(tab, "document.querySelector('.st-said')?.textContent") or ""), what="latest")
t.ok(True, "Check now, nothing new: This is the latest one")

# 2. Install updates on its own (on, the default): fetched, then ready; Relaunch now.
up(version="0.2.0", notes="Quicker tabs and a calmer column.")
ev(tab, "document.querySelector(\"[data-row='updates.version'] .pill-st\").click()")
b.wait_for(lambda: up()["stage"]["kind"] in ("fetching", "ready"), what="found")
saw_fetching = up()["stage"]["kind"] == "fetching"
b.wait_for(lambda: row(tab)["title"] == "Oriel 0.2.0 is ready", what="ready")
r = row(tab)
t.ok(up()["fake"]["downloads"] == 1, f"on: fetched at once ({'seen downloading' if saw_fetching else 'quick'})")
t.ok(r["detail"] == "Quicker tabs and a calmer column." and r["control"] == "Relaunch now", f"Oriel 0.2.0 is ready, its notes, Relaunch now ({r})")
ev(tab, "document.querySelector(\"[data-row='updates.version'] .pill-st\").click()")
b.wait_for(lambda: up()["fake"]["installs"] == 1, what="relaunch")
t.ok(True, "Relaunch now puts it in place and opens it")
t.ok(not b.state().get("errors"), "no error in the main process")
b.quit()

# 3. Off: said and waiting; Install fetches it.
b.use("settings-d-updates-off")
seed({"update.install": False})
b.launch()
up(version="0.3.0")
b.wait_for(lambda: up()["fake"]["checks"] >= 1, what="checked")
tab = about()
up(check=True)
b.wait_for(lambda: (row(tab) or {}).get("title") == "Oriel 0.3.0 is out", what="out")
r = row(tab)
t.ok(up()["fake"]["downloads"] == 0, "off: nothing is fetched")
t.ok(r["detail"] == "Checked and put in place when you press Install" and r["control"] == "Install", f"Oriel 0.3.0 is out, Install ({r})")
ev(tab, "document.querySelector(\"[data-row='updates.version'] .pill-st\").click()")
b.wait_for(lambda: row(tab)["title"] == "Oriel 0.3.0 is ready", what="installed")
t.ok(up()["fake"]["downloads"] == 1, "Install fetches it, and it is ready")
b.quit()

# 4. Off, then turned back on with one waiting: fetched at once.
b.use("settings-d-updates-again")
seed({"update.install": False})
b.launch()
up(version="0.4.0", check=True)
b.wait_for(lambda: up()["stage"]["kind"] == "waiting", what="waiting")
b.cmd("settings.set", id="update.install", value=True)
b.wait_for(lambda: up()["stage"]["kind"] == "ready", what="fetched on turning on")
t.ok(up()["fake"]["downloads"] == 1, "turned back on, the waiting update is fetched at once")
b.quit()

# 5. The real electron-updater, against a feed here (what GitHub Releases serves).
sha = "A" * 86 + "=="
web.PAGES["/feed/" + FEED] = (
    "version: 9.9.9\nfiles:\n  - url: Oriel-9.9.9.zip\n    sha512: %s\n    size: 1000\n"
    "path: Oriel-9.9.9.zip\nsha512: %s\nreleaseDate: '2026-11-24T08:00:00.000Z'\nreleaseNotes: 'Faster tabs.'\n" % (sha, sha))
b.use("settings-d-updates-feed")
seed({"update.install": False})
b.launch(env={"ORIEL_UPDATE_FEED": origin + "/feed"})
b.wait_for(lambda: up()["stage"]["kind"] == "waiting", within=30, what="found in the feed")
s = up()["stage"]
t.ok(up()["feed"] and s["version"] == "9.9.9" and s.get("notes") == "Faster tabs.", f"electron-updater reads the feed: 9.9.9 with its notes ({s})")
b.quit()
web.PAGES["/feed/" + FEED] = web.PAGES["/feed/" + FEED].replace("9.9.9", "0.0.1")
b.use("settings-d-updates-feed-old")
b.launch(env={"ORIEL_UPDATE_FEED": origin + "/feed"})
b.wait_for(lambda: b.state()["prefs"].get("update.checked"), within=30, what="checked against the feed")
t.ok(up()["stage"]["kind"] == "none", "an older version in the feed: nothing to do")
t.ok(not b.state().get("errors"), "no error in the main process")
b.quit()

# 6. The portable build (studio/09 §1.3): electron-builder's launcher sets
# PORTABLE_EXECUTABLE_DIR. It never checks or installs (the installer isn't
# how it updates) and About says to download the new version.
b.use("settings-d-updates-portable")
b.launch(env={"PORTABLE_EXECUTABLE_DIR": str(b.folder())})
time.sleep(2.5)
u = up()
t.ok(u.get("portable") is True and not u["active"], f"portable: no update source ({u.get('portable')}, active {u['active']})")
t.ok(u["fake"]["checks"] == 0, "portable: nothing is checked at launch")
tab = about()
b.wait_for(lambda: "download" in (row(tab) or {}).get("detail", ""), what="portable line")
r = row(tab)
t.ok(r["detail"] == "Portable Oriel doesn't update on its own. To update, download the new version" and r["control"] == "Download…",
     f"About says the portable copy updates by downloading the new version ({r})")
ev(tab, "document.querySelector(\"[data-row='updates.version'] .pill-st\").click()")
opened = False
try:
    opened = b.wait_for(lambda: any("/carpaaaaa/oriel/releases" in (x.get("url") or "") for x in b.window()["tabs"]), what="releases tab")
except AssertionError:
    pass
t.ok(opened, "Download… opens the releases page in a tab")
server.shutdown()
t.done()

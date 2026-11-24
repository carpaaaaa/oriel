#!/usr/bin/env python3
"""The update at launch (the user's wish, 24 Nov 2026; 08 area D,
update.install): a new version in the feed (a latest.yml served here, read
by the real electron-updater) floats a popup at the first launch with its
notes and Update and Restart; its X puts it away for that version
(updates.dismissed), and it doesn't come back at the next launch until a
newer version is out; meanwhile Settings shows the update as its first
section, with the same button. Fetching and installing are only counted
here (ORIEL_UPDATE_FAKE_INSTALL=1)."""
import json
import os
import sys
import time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b
import settings_web as web

ROOT = Path(__file__).resolve().parent.parent
SHOTS = Path(os.environ.get("SHOTS_DIR") or ROOT / "out" / "shots")
SHOTS.mkdir(parents=True, exist_ok=True)
server, origin = web.start()
FEED = "latest-mac.yml" if sys.platform == "darwin" else "latest.yml"
SHA = "A" * 86 + "=="
ENV = {"ORIEL_UPDATE_FEED": origin + "/feed", "ORIEL_UPDATE_FAKE_INSTALL": "1"}
t = b.T()


def feed(version, notes):
    web.PAGES["/feed/" + FEED] = (
        f"version: {version}\nfiles:\n  - url: Oriel-{version}.zip\n    sha512: {SHA}\n    size: 1000\n"
        f"path: Oriel-{version}.zip\nsha512: {SHA}\nreleaseDate: '2026-11-24T08:00:00.000Z'\nreleaseNotes: '{notes}'\n")


def ev(tab, js):
    try:
        return b.ev(tab, js)
    except RuntimeError:
        return None


def up():
    return b.call({"do": "settings.updater"})


def overlay():
    return (b.window().get("overlay") or {})


def popup_up():
    o = overlay()
    return o.get("kind") == "panel" and o.get("name") == "settings.update"


def popup_text():
    return b.ui("document.querySelector('.up-plate')?.innerText ?? null", root="overlay")


def settings():
    b.cmd("app.settings")
    b.wait_for(lambda: any(x.get("internal") == "settings" for x in b.window()["tabs"]), what="Settings", within=30)
    tab = next(x for x in b.window()["tabs"] if x.get("internal") == "settings")["id"]
    b.wait_for(lambda: ev(tab, "document.querySelectorAll('.rail-row').length"), what="rail", within=30)
    time.sleep(0.4)
    return tab


# 1. A new version: the popup at the first launch.
feed("0.2.0", "Quicker tabs and a calmer column.")
b.use("settings-d-popup")
b.launch(env=ENV)
b.wait_for(popup_up, within=30, what="the popup at launch")
b.wait_for(lambda: popup_text(), what="popup drawn")
text = popup_text()
t.ok("Oriel 0.2.0 is ready" in text, f"Oriel 0.2.0 is ready ({text!r})")
t.ok("Quicker tabs and a calmer column." in text, "with the release's notes in brief")
t.ok("Update and Restart" in text, "and Update and Restart")
t.ok(b.ui("!!document.querySelector('.up-x')", root="overlay"), "and an X")
plate = b.ui("(() => { const e = document.querySelector('.up-plate'); return {w: e.offsetWidth, radius: getComputedStyle(e).borderTopLeftRadius} })()", root="overlay")
t.ok(round(plate["w"]) == 460 and plate["radius"] == "16px", f"a plate 460 wide with corners of 16 ({plate})")
t.ok(up()["fake"]["downloads"] == 1, "fetched quietly first (Install updates on its own is on)")
b.shot(SHOTS / "update-popup.png")

# 2. The X: away, kept as dismissed; Settings shows the update first.
b.ui("document.querySelector('.up-x').click()", root="overlay")
b.wait_for(lambda: not popup_up(), what="dismissed")
t.ok(b.state()["prefs"].get("updates.dismissed") == "0.2.0", "the X keeps updates.dismissed = 0.2.0")
tab = settings()
first = ev(tab, "document.querySelector('.rail-row')?.dataset.page")
t.ok(first == "update", f"Settings: the update is the first section ({first})")
t.ok(ev(tab, "document.querySelector('.rail-row').innerText").strip() == "Update to 0.2.0", "Update to 0.2.0")
t.ok(ev(tab, "location.pathname") == "/update", "and Settings opens on it")
row = ev(tab, "document.querySelector(\"[data-row='update.now']\")?.innerText")
t.ok(row and "Oriel 0.2.0 is ready" in row and "Update and Restart" in row, f"with its version and Update and Restart ({row!r})")
b.call({"do": "settings.shot", "id": tab, "path": str(SHOTS / "update-settings.png")})
ev(tab, "document.querySelector(\"[data-row='update.now'] .pill-st\").click()")
b.wait_for(lambda: up()["fake"]["installs"] == 1, what="installed")
t.ok(True, "its button puts the update in place and restarts (quitAndInstall)")
b.quit()

# 3. Next launch, same version: no popup; the section is still first.
b.use("settings-d-popup", wipe=False)
b.launch(env=ENV)
b.wait_for(lambda: up()["stage"]["kind"] != "none", within=30, what="found again")
time.sleep(2.5)
t.ok(not popup_up() and "0.2.0" not in up()["shown"], "dismissed: not again at the next launch")
tab = settings()
t.ok(ev(tab, "document.querySelector('.rail-row')?.dataset.page") == "update", "the update is still the first section")
b.quit()

# 4. A newer version: the popup comes back.
feed("0.3.0", "Downloads in the column.")
b.use("settings-d-popup", wipe=False)
b.launch(env=ENV)
b.wait_for(popup_up, within=30, what="the popup for 0.3.0")
b.wait_for(lambda: popup_text() and "0.3.0" in popup_text(), what="0.3.0 drawn")
t.ok("Oriel 0.3.0 is ready" in popup_text(), "a newer version: the popup comes back")
b.ui("[...document.querySelectorAll('.up-plate button')].find(x => x.textContent === 'Update and Restart').click()", root="overlay")
b.wait_for(lambda: up()["fake"]["installs"] == 1, what="update from the popup")
t.ok(not popup_up(), "Update and Restart: fetched, put in place and restarted from the popup")
b.quit()

# 5. Nothing new: no popup, no section.
feed("0.0.1", "Old.")
b.use("settings-d-popup-none")
b.launch(env=ENV)
b.wait_for(lambda: b.state()["prefs"].get("update.checked"), within=30, what="checked")
time.sleep(1)
t.ok(not popup_up(), "nothing new: no popup")
tab = settings()
t.ok(ev(tab, "document.querySelector('.rail-row')?.dataset.page") == "general", "and no update section")
t.ok(not b.state().get("errors"), "no error in the main process")
server.shutdown()
t.done()

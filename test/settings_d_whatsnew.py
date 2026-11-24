#!/usr/bin/env python3
"""What's New (WhatsNew.swift, studio/02 §8.6, 06 §1.12 about.notes; 08 area
D, news): after an update, once, a tab with every version's notes, newest
first, read from the repository's releases (here a feed on this computer
shaped as GitHub's API); never on a fresh install, never twice for one
version; Settings › About › What's New… opens it any time."""
import json
import sys
import time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b
import settings_web as web

server, origin = web.start()
RELEASES = [
    {"tag_name": "v0.2.0", "name": "v0.2.0", "published_at": "2026-11-30T10:00:00Z", "draft": False, "prerelease": False,
     "body": "## New\n- Updates from GitHub, on their own\n- **What's New** after an update\n\n## Fixed\n- The column no longer jumps"},
    {"tag_name": "v0.1.9", "name": "Quieter", "published_at": "2026-11-20T10:00:00Z", "draft": True, "prerelease": False, "body": "draft"},
    {"tag_name": "v0.1.0", "name": "v0.1.0", "published_at": "2026-11-23T10:00:00Z", "draft": False, "prerelease": False, "body": "First version."},
]
web.PAGES["/releases"] = json.dumps(RELEASES)
ENV = {"ORIEL_WHATSNEW": "1", "ORIEL_NOTES_FEED": origin + "/releases"}
t = b.T()


def ev(tab, js):
    try:
        return b.ev(tab, js)
    except RuntimeError:
        return None


def notes_tab():
    return next((x["id"] for x in b.window()["tabs"] if x.get("internal") == "release-notes"), None)


def seed(prefs):
    b.folder().mkdir(parents=True, exist_ok=True)
    (b.folder() / "prefs.json").write_text(json.dumps(prefs))


# 1. After an update (this version unseen): the notes open by themselves.
b.use("settings-d-whatsnew")
seed({"whatsnew.seen": "0.0.9"})
b.launch(env=ENV)
b.wait_for(notes_tab, within=20, what="What's New opened")
tab = notes_tab()
b.wait_for(lambda: ev(tab, "document.querySelectorAll('.rn-version').length"), what="notes drawn")
t.ok(ev(tab, "document.querySelector('.plate-title').textContent") == "What's New", "a tab called What's New opens after an update")
versions = ev(tab, "[...document.querySelectorAll('.rn-version')].map(v => v.dataset.version)")
t.ok(versions == ["0.2.0", "0.1.0"], f"every version, newest first, drafts left out ({versions})")
text = ev(tab, "document.querySelector('.rn-version').innerText")
t.ok("Oriel 0.2.0" in text and "30 November 2026" in text, "each under Oriel <version> and its date")
t.ok(ev(tab, "[...document.querySelectorAll('.rn-version')[0].querySelectorAll('.rn-section')].map(e => e.textContent)") == ["New", "Fixed"], "sections as written (New, Fixed)")
t.ok(ev(tab, "document.querySelector('.rn-item').innerText").endswith("Updates from GitHub, on their own"), "lines as bullets")
t.ok(b.state()["prefs"].get("whatsnew.seen") not in (None, "", "0.0.9"), "this version is now seen")
b.cmd("tab.close", id=tab)  # closed, so the next session doesn't bring it back
time.sleep(0.8)
b.quit()

# 2. Next launch, same version: not again.
b.use("settings-d-whatsnew", wipe=False)
b.launch(env=ENV)
time.sleep(3)
t.ok(notes_tab() is None, "not twice for one version")

# 3. Settings › About › What's New… opens it any time.
b.cmd("settings.open", page="about")
b.wait_for(lambda: any(x.get("internal") == "settings" for x in b.window()["tabs"]), what="Settings", within=30)
st = next(x for x in b.window()["tabs"] if x.get("internal") == "settings")["id"]
b.wait_for(lambda: ev(st, "!!document.querySelector(\"[data-row='about.notes'] .pill-st\")"), what="What's New row", within=30)
t.ok(ev(st, "document.querySelector(\"[data-row='about.notes'] .sr-detail\").textContent") == "Every version's notes, newest first", "About: What's new, Every version's notes, newest first")
ev(st, "document.querySelector(\"[data-row='about.notes'] .pill-st\").click()")
b.wait_for(notes_tab, what="opened from Settings")
t.ok(True, "What's New… opens the notes")
b.quit()

# 4. A fresh install: never.
b.use("settings-d-whatsnew-fresh")
b.launch(env=ENV)
time.sleep(3)
t.ok(notes_tab() is None, "a fresh install doesn't open it")
t.ok(b.state()["prefs"].get("whatsnew.seen"), "and counts this version as seen")
t.ok(not b.state().get("errors"), "no error in the main process")
server.shutdown()
t.done()

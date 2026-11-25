#!/usr/bin/env python3
"""Clear all data when Oriel quits (settings/wipe.ts; carpa, 25 Nov 2026):
Settings › Clear › Clear all data when Oriel quits, off unless turned on and
asking first. With it on, a quit leaves no history, no session of tabs, no
closed tabs and no downloads list, while bookmarks and settings stay; with it
off, a quit keeps them as before.

    npm run build && python3 test/settings_wipe.py
"""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b  # noqa: E402

t = b.T()
KEY = "privacy.clearOnQuit"


def on():
    return b.cmd("settings.values")["prefs"].get(KEY) is True


def files():
    f = b.folder()
    return {n: (f / n).exists() for n in ("history.json", "session.json", "bookmarks.json", "prefs.json", "wipe.pending")}


print("- off, as it comes: a quit keeps the data")
b.use("settings-wipe")
b.launch()
t.ok(not on(), "off by default")
b.call({"do": "data.visit", "url": "https://wipe-one.example/", "title": "Wipe One"})
b.cmd("tab.new", url="about:blank")
time.sleep(1.0)
b.quit()
kept = files()
t.ok(kept["history.json"] and kept["session.json"], f"quit with it off keeps the history and the session ({kept})")

print("- turning it on asks first")
b.use("settings-wipe", wipe=False)
b.launch()
b.call({"do": "settingsb.wipeAnswer", "answer": "cancel"})
b.cmd("settings.set", id=KEY, value=True)
t.ok(not on(), "Cancel: it stays off")
b.call({"do": "settingsb.wipeAnswer", "answer": "on"})
b.cmd("settings.set", id=KEY, value=True)
t.ok(on(), "Turn On: it is on")
t.ok(b.call({"do": "settingsb.wipeAsked"})["asked"] == 2, "asked each time it was turned on")
b.cmd("settings.set", id=KEY, value=False)
t.ok(not on(), "turning it off asks nothing")
t.ok(b.call({"do": "settingsb.wipeAsked"})["asked"] == 2, "no question for off")
b.call({"do": "settingsb.wipeAnswer", "answer": "on"})
b.cmd("settings.set", id=KEY, value=True)
b.call({"do": "data.visit", "url": "https://wipe-two.example/", "title": "Wipe Two"})
b.cmd("tab.new", url="about:blank")
time.sleep(1.0)
print("- on: a quit leaves nothing of it behind")
b.quit()
gone = files()
t.ok(not gone["history.json"] and not gone["session.json"], f"no history and no session after the quit ({gone})")
t.ok(gone["prefs.json"] and not gone["wipe.pending"], "settings stay, and the marker is gone with the wipe")

print("- the next launch is empty, and the setting stays on")
b.use("settings-wipe", wipe=False)
b.launch()
t.ok(on(), "still on")
t.done()

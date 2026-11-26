#!/usr/bin/env python3
"""Text size (Settings › Appearance, text.scale): one slider makes Oriel's own
text bigger everywhere, from 100% to 140%: the tabs and both roots of the
window, Settings and the other Oriel pages, at once and as it moves; values
out of range are held to it; websites keep their own size."""
import sys
import time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b

t = b.T()


def ev(tab, js):
    try:
        return b.ev(tab, js)
    except RuntimeError:
        return None


def ui(js, root="chrome"):
    try:
        return b.ui(js, root=root)
    except RuntimeError:
        return None


VAR = "getComputedStyle(document.documentElement).getPropertyValue('--text-scale').trim()"
TITLE = "(e => e && getComputedStyle(e).fontSize)(document.querySelector('.sidebar .title'))"

b.use("settings-text-scale")
b.launch()
b.cmd("tab.new", url="data:text/html,<title>Some page</title><p style='font-size:16px'>site text</p>")
time.sleep(1)
page = next(x["id"] for x in b.window()["tabs"] if x.get("url", "").startswith("data:"))
t.ok(ui(TITLE) == "12.5px", f"at 100% a tab's title is 12.5 ({ui(TITLE)})")

# The row, in Settings › Appearance.
b.cmd("settings.open", page="appearance")
b.wait_for(lambda: any(x.get("internal") == "settings" for x in b.window()["tabs"]), what="Settings", within=30)
st = next(x for x in b.window()["tabs"] if x.get("internal") == "settings")["id"]
b.wait_for(lambda: ev(st, "!!document.querySelector(\"[data-row='text.scale'] input[type=range]\")"), what="Text size row", within=30)
t.ok(ev(st, "document.querySelector(\"[data-row='text.scale'] .st-textsize-n\").textContent") == "100%", "Text size says 100%")
body = ev(st, "parseFloat(getComputedStyle(document.querySelector(\"[data-row='text.scale'] .sr-title, [data-row='text.scale']\")).fontSize)")

# 140%: everything follows, at once.
b.cmd("settings.set", id="text.scale", value=1.4)
b.wait_for(lambda: ui(TITLE) == "17.5px", what="the tab's title at 140%", within=10)
t.ok(True, "at 140% a tab's title is 17.5")
t.ok(ui(VAR, root="overlay") == "1.4", "the overlay follows too (menus, panels)")
b.wait_for(lambda: ev(st, VAR) == "1.4", what="Settings at 140%", within=10)
t.ok(ev(st, "document.querySelector(\"[data-row='text.scale'] .st-textsize-n\").textContent") == "140%", "Settings follows, and says 140%")
bigger = ev(st, "parseFloat(getComputedStyle(document.querySelector(\"[data-row='text.scale'] .sr-title, [data-row='text.scale']\")).fontSize)")
t.ok(body and bigger and abs(bigger / body - 1.4) < 0.02, f"Settings' text is 1.4 times bigger ({body} > {bigger})")
t.ok(ev(page, "getComputedStyle(document.querySelector('p')).fontSize") == "16px", "a website keeps its own size")

# An Oriel page opened now starts at its size.
b.cmd("settings.open", page="about")
time.sleep(1)
b.cmd("tab.new", url="oriel://release-notes")
b.wait_for(lambda: any(x.get("internal") == "release-notes" for x in b.window()["tabs"]), what="What's New", within=20)
notes = next(x for x in b.window()["tabs"] if x.get("internal") == "release-notes")["id"]
b.wait_for(lambda: ev(notes, VAR) == "1.4", what=f"What's New at 140% ({ev(notes, VAR)!r})", within=20)
t.ok(True, "What's New opens at 140%")

# Reset: back to 100%, and greyed out there.
reset = "document.querySelector(\"[data-row='text.scale'] .st-textsize-reset\")"
b.cmd("settings.open", page="appearance")
b.wait_for(lambda: ev(st, f"!!{reset}"), what="Reset", within=20)
t.ok(ev(st, f"{reset}.disabled") is False, "Reset is there at 140%")
ev(st, f"{reset}.click()")
b.wait_for(lambda: ui(VAR) == "1", what="back to 100%", within=10)
t.ok(b.state()["prefs"].get("text.scale") in (None, 1), "Reset puts the text back at 100%")
b.wait_for(lambda: ev(st, f"{reset}.disabled") is True, what="Reset greyed out", within=10)
t.ok(True, "and is greyed out at 100%")
b.cmd("settings.set", id="text.scale", value=1.4)

# Held to its range.
b.cmd("settings.set", id="text.scale", value=3)
b.wait_for(lambda: ui(VAR) == "1.4", what="held at 140%", within=10)
b.cmd("settings.set", id="text.scale", value=0.5)
b.wait_for(lambda: ui(VAR) == "1", what="held at 100%", within=10)
t.ok(True, "out of range, held to 100% to 140%")
t.ok(not b.state().get("errors"), "no error in the main process")
b.quit()
t.done()

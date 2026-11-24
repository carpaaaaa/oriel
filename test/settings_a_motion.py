#!/usr/bin/env python3
"""Settings › Appearance and General, motion and pages, changed and measured
(studio/08 area A; Design.swift Motion, Sleep.swift:88, Dusk.swift): Reduce
animations (motion.instant), Save power in Low Power Mode (motion.light,
with SEARCH_LOW_POWER=1 standing in for Windows' battery saver, as the
Mac's testLowPower), Darken pages that stay light (pages.dusk)."""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b
import ui_kit as k

t = b.T()


def setting(id_, value):
    b.cmd("settings.set", id=id_, value=value)
    time.sleep(0.4)


def css(prop, root="chrome"):
    return b.ui(f"getComputedStyle(document.documentElement).getPropertyValue('{prop}').trim()", root=root)


def ms(prop, root="chrome"):
    """A time token in milliseconds, however Chromium writes it (".467s", "0ms")."""
    v = (css(prop, root) or "").strip()
    return round(float(v[:-2]) if v.endswith("ms") else float(v[:-1]) * 1000) if v else None


# Reduce animations (motion.instant): every transition at once, in both of the window's views.
b.use("settings-a-motion")
b.launch(*k.FRAMES, env={"SEARCH_LOOK": "light"})
b.cmd("tab.go", input="data:text/html,<title>page</title>page")
b.wait_for(lambda: b.active()["title"] == "page", what="page")
door = lambda: b.ui("getComputedStyle(document.querySelector('.sidebar .door')).transitionDuration")
t.ok(ms("--dur-glide") == 467 and door() != "0s", f"off (the default): glide 467 ms, the doors fade ({ms('--dur-glide')}, {door()})")
setting("motion.instant", True)
t.ok(b.ui("document.documentElement.dataset.motion") == "instant" and ms("--dur-glide") == 0 and ms("--dur-settle") == 0, "on: glide and settle at once")
t.ok(door() == "0s", f"…the doors' fade too ({door()})")
t.ok(ms("--dur-quick", root="overlay") == 0, "…and over the page (the overlay)")
setting("motion.instant", False)
t.ok(ms("--dur-glide") == 467, "off again: the springs back")

# Save power without the battery saver: nothing changes.
setting("motion.light", True)
t.ok(ms("--dur-glide") == 467, "Save power on, Windows not saving: the springs as they are")
setting("motion.light", False)
b.quit()

# Save power with the battery saver (stand-in): glide and settle a short ease-out, idle tabs sleep sooner.
b.use("settings-a-motion-power")
b.launch(*k.FRAMES, env={"SEARCH_LOOK": "light", "SEARCH_LOW_POWER": "1"})
b.cmd("tab.go", input="data:text/html,<title>front</title>front")
b.wait_for(lambda: b.active()["title"] == "front", what="page")
back = b.cmd("tab.new", url="data:text/html,<title>behind</title>behind", background=True)
b.wait_for(lambda: any(x.get("title") == "behind" for x in b.window()["tabs"]), what="tab behind")
time.sleep(0.5)
t.ok(ms("--dur-glide") == 467, "battery saver, switch off (the Mac's default): nothing changes")
b.call({"do": "tabs.age", "id": back, "seconds": 700})
slept = b.call({"do": "tabs.tidy"})["slept"]
t.ok(back not in (slept or []), f"…a tab left 11 minutes stays awake (Normal: 30) ({slept})")
setting("motion.light", True)
t.ok(b.ui("document.documentElement.dataset.motion") == "light" and ms("--dur-glide") == 160 and ms("--dur-settle") == 160, f"switch on: glide and settle 0.16 s ({ms('--dur-glide')})")
t.ok(css("--ease-glide") == css("--ease-quick"), "…on an ease-out")
b.call({"do": "tabs.age", "id": back, "seconds": 700})
slept = b.call({"do": "tabs.tidy"})["slept"]
t.ok(back in (slept or []), f"…and idle tabs sleep no later than Sooner (10 minutes) ({slept})")
setting("motion.light", False)
b.quit()

# Darken pages that stay light (pages.dusk): only while Oriel is dark; light pages turned over, dark ones left alone.
b.use("settings-a-dusk")
b.launch(*k.FRAMES, env={"SEARCH_LOOK": "dark"})
b.cmd("tab.go", input="data:text/html,<title>white</title><body style='background:%23fff'>white")
b.wait_for(lambda: b.active()["title"] == "white", what="white page")
white = b.active()["id"]
filt = lambda tab: b.ev(tab, "getComputedStyle(document.documentElement).filter")
time.sleep(0.4)
t.ok(filt(white) == "none", "off (the default): the page as it is")
setting("pages.dusk", True)
got = b.wait_for(lambda: "invert" in (filt(white) or "") and filt(white), within=4, what="darkened")
t.ok("invert(0.9)" in got and "hue-rotate(180deg)" in got, f"on, Oriel dark: a light page turned over ({got})")
img = b.ev(white, "(() => { const i = document.createElement('img'); document.body.appendChild(i); return getComputedStyle(i).filter })()")
t.ok("invert(1)" in img, f"…its pictures turned back ({img})")
b.cmd("tab.new", url="data:text/html,<title>dark</title><body style='background:%23111;color:%23eee'>dark")
b.wait_for(lambda: b.active()["title"] == "dark", what="dark page")
dark = b.active()["id"]
time.sleep(0.8)
t.ok(filt(dark) == "none", "a page already dark is left alone")
setting("pages.dusk", False)
b.wait_for(lambda: filt(white) == "none", within=4, what="undone")
t.ok(True, "off again: the page as it was")
b.quit()
b.use("settings-a-dusk-light")
b.launch(*k.FRAMES, env={"SEARCH_LOOK": "light"})
b.cmd("settings.set", id="pages.dusk", value=True)
b.cmd("tab.go", input="data:text/html,<title>white</title><body style='background:%23fff'>white")
b.wait_for(lambda: b.active()["title"] == "white", what="white page")
time.sleep(0.8)
t.ok(filt(b.active()["id"]) == "none", "with Oriel light, nothing is darkened")
t.done()

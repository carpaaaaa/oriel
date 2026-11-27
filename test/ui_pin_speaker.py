#!/usr/bin/env python3
"""A pinned square whose page plays sound wears the icons-only column's
speaker in its bottom corner, in the column and across the top; a click on it
mutes the page, another unmutes it (Search 1.0.22, idea 1328; Side.swift and
TabBar.swift CornerSpeaker). Back and forward with nowhere to go, across the
top as down the side, dimmed to half (Search 1.0.22, TabBar.swift
Helm.dimmed)."""
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b  # noqa: E402
import ui_kit as k  # noqa: E402

b.use("ui-pin-speaker")
b.launch(*k.FRAMES, env={"SEARCH_LOOK": "light"})
t = b.T()
time.sleep(0.8)

SPEAKER = ("const e = document.querySelector({sel}); if (!e) return null; const r = e.getBoundingClientRect();"
           " const p = e.parentElement.getBoundingClientRect(); const s = getComputedStyle(e);"
           " return {{ w: r.width, h: r.height, right: r.right - p.right, bottom: r.bottom - p.bottom, title: e.title, radius: s.borderTopLeftRadius }}")


def speaker(sel):
    return k.js(SPEAKER.format(sel=json.dumps(sel)))


s = k.fixture("many")
pin = next(x for x in s["tabs"] if x.get("pinID"))
other = next(x for x in s["tabs"] if x.get("pinID") and x["id"] != pin["id"])

# Down the side: a pinned square playing sound.
pin["audible"] = True
k.fake(s, look="light")
time.sleep(0.4)
got = speaker(f".square[data-tab='{pin['id']}'] .corner-speaker")
t.ok(got and k.near(got["w"], 13) and k.near(got["h"], 13) and got["radius"] == "50%", f"a square playing sound: a speaker of 13 on a disc ({got})")
t.ok(got and k.near(got["right"], 3) and k.near(got["bottom"], 3), f"…in its bottom corner, 3 past it, as a tile's ({got})")
t.ok(got and got["title"] == "Mute Tab", f"…its tooltip Mute Tab ({got and got['title']})")
t.ok(speaker(f".square[data-tab='{other['id']}'] .corner-speaker") is None, "a square that plays nothing wears none")

pin["audible"] = False
pin["muted"] = True
k.fake(s, look="light")
time.sleep(0.3)
got = speaker(f".square[data-tab='{pin['id']}'] .corner-speaker")
t.ok(got and got["title"] == "Unmute Tab", f"muted: the speaker stays, slashed, Unmute Tab ({got and got['title']})")
pin["loading"] = True
k.fake(s, look="light")
time.sleep(0.3)
t.ok(speaker(f".square[data-tab='{pin['id']}'] .corner-speaker") is None, "loading: the ring has the place, no speaker")
pin["loading"] = False

# Across the top: a pin of the strip playing sound.
top = k.fixture("top")
tpin = next(x for x in top["tabs"] if x.get("pinID"))
tpin["audible"] = True
k.fake(top, look="light")
time.sleep(0.5)
got = speaker(f".strip-pin[data-tab='{tpin['id']}'] .corner-speaker")
band = k.rect(".strip-band")
sp = k.rect(f".strip-pin[data-tab='{tpin['id']}'] .corner-speaker")
t.ok(got and k.near(got["w"], 13) and k.near(got["right"], 3) and got["title"] == "Mute Tab", f"across the top: the pin's speaker, in its corner ({got})")
t.ok(sp and band and sp["y"] + sp["h"] <= band["y"] + band["h"] + 0.5, f"…all of it inside the band the row clips to ({sp}, {band})")
doors = k.js("return [...document.querySelectorAll('.tabbar .strip-helm > .door')].map(e => [e.disabled, getComputedStyle(e).opacity])")
dim = [d for d in doors if d[0]] if doors else []
t.ok(dim and all(d[1] == "0.5" for d in dim), f"across the top, back and forward with nowhere to go dimmed to half ({doors})")
k.thaw()
time.sleep(0.5)

# The real thing: a click on the speaker unmutes the page, and doesn't go to the pin.
b.cmd("tab.go", input="data:text/html,<title>pinned</title><body>pinned")
b.wait_for(lambda: b.active()["title"] == "pinned", what="page")
p = b.active()["id"]
b.cmd("tab.pin", id=p)
b.cmd("tab.new", url="data:text/html,<title>other</title><body>other")
b.wait_for(lambda: b.active()["title"] == "other", what="other")
here = b.active()["id"]
b.cmd("tab.mute", id=p, muted=True)
time.sleep(0.5)
r = b.wait_for(lambda: k.rect(f".square[data-tab='{p}'] .corner-speaker"), within=4, what="the muted pin's speaker")
b.mouse(r["x"] + r["w"] / 2, r["y"] + r["h"] / 2)
time.sleep(0.5)
x = next(x for x in b.window()["tabs"] if x["id"] == p)
t.ok(not x["muted"], "a click on it unmutes the page")
t.ok(b.window()["activeID"] == here, "…and leaves you on the tab you were on")
t.ok(k.rect(f".square[data-tab='{p}'] .corner-speaker") is None, "unmuted and silent: the speaker goes")
t.done()

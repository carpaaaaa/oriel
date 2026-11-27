#!/usr/bin/env python3
"""What's playing at the foot of the sidebar lists every tab playing out of
sight, one row each with the newest on top, pinned tabs and tabs left playing
in another space included, a click on one of those going to its space. Paused
from the sidebar, a player out of a script's reach (audio never put in the
page, as on music sites) no longer disappears: it stays with its play button
and plays again from where it was; going to the tab, its row's Put Away or
leaving the page hands the pause back to the page (Search 1.0.22,
Player.swift players, PlayerStackTests)."""
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b  # noqa: E402
import ui_kit as k  # noqa: E402

b.use("tabs-player")
b.launch(*k.FRAMES, env={"SEARCH_LOOK": "light"})
t = b.T()
time.sleep(0.6)

ROWS = "return [...document.querySelectorAll('.sidebar .player')].map(e => [e.dataset.tab, e.querySelector('.player-title').textContent, [...e.querySelectorAll('.player-button')].map(x => x.title), e.dataset.space || null])"

# --- The rows, on a window state laid on the column ---
s = k.fixture("many")
tabs = [x for x in s["tabs"] if x["id"] != s["activeID"]]
pin = next(x for x in tabs if x.get("pinID"))
loose = [x for x in tabs if not x.get("pinID")]
front = next(x for x in s["tabs"] if x["id"] == s["activeID"])
elsewhere = {**loose[2], "id": "elsewhere-tab", "title": "Radio", "label": "Radio", "space": "other-space"}
s["players"] = [
    {**loose[0], "audible": True},
    {**pin, "audible": True},
    {**front, "audible": True},
    elsewhere,
    {**loose[1], "audible": False, "stilled": True},
]
k.fake(s, look="light")
time.sleep(0.4)
rows = k.js(ROWS)
t.ok(rows and [r[0] for r in rows] == [loose[0]["id"], pin["id"], "elsewhere-tab", loose[1]["id"]],
     f"a row for every tab playing out of sight, the newest on top, a pin and another space's tab included, the tab on screen left out ({rows})")
t.ok(rows and rows[0][2] == ["Pause"] and rows[3][2] == ["Put Away", "Play"], f"playing: its pause; paused from here: its play, and its cross to put it away ({rows and [r[2] for r in rows]})")
t.ok(rows and rows[2][3] == "other-space", "the tab left playing in another space says where it is")
gap = k.js("const r = [...document.querySelectorAll('.sidebar .player')].map(e => e.getBoundingClientRect()); return r.length > 1 ? r[1].top - r[0].bottom : null")
t.ok(gap is not None and k.near(gap, 6), f"one above the other, 6 apart (playerGap) ({gap})")
s["float"] = {"tab": loose[0]["id"], "tucked": False}
k.fake(s, look="light")
time.sleep(0.3)
rows = k.js(ROWS)
t.ok(rows and loose[0]["id"] not in [r[0] for r in rows], "the tab out in the floating window has its own controls: no row")
s["prefs"] = {**s.get("prefs", {}), "sidebar.player": False}
k.fake(s, look="light")
time.sleep(0.3)
t.ok(not k.js(ROWS), "Settings › What's playing in other tabs off: no rows")
k.thaw()
time.sleep(0.4)

# --- The real thing: two tabs playing out of sight ---
WAV = ("(() => { const r = 8000, n = r * 2; const buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);"
       " const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));"
       " w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);"
       " v.setUint32(24, r, true); v.setUint32(28, r * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);"
       " for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.sin(i / 8) * 3000, true);"
       " return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' })) })()")


def song(name, in_page):
    id_ = b.cmd("tab.new", url=f"data:text/html,<title>{name}</title><body>{name}", background=True)
    b.wait_for(lambda: any(x.get("title") == name for x in b.window()["tabs"]), what=name)
    time.sleep(0.3)
    # In the page, or (as a music site's) never put in it: out of a script's reach of the page.
    add = "document.body.appendChild(a);" if in_page else ""
    return id_, b.ev(id_, f"(() => {{ const a = new Audio({WAV}); a.loop = true; {add} window.__a = a; return a.play().then(() => true, () => false) }})()")


def players():
    return b.window().get("players") or []


b.cmd("tab.go", input="data:text/html,<title>front</title><body>front")
b.wait_for(lambda: b.active()["title"] == "front", what="front")
one, ok1 = song("first", True)
two, ok2 = song("second", False)
heard = None
if ok1 and ok2:
    try:
        heard = b.wait_for(lambda: [p["id"] for p in players() if p.get("audible")] == [two, one] or None, within=6, what="both heard")
    except AssertionError:
        heard = None
if not heard:
    print(f"  (this machine plays no sound, or Chromium hears none: {[(p['id'], p.get('audible')) for p in players()]}; the pause and play are followed without it)")
else:
    t.ok(True, "two tabs playing out of sight: both listed, the newest first")
    rows = b.wait_for(lambda: (r := k.js(ROWS)) and len(r) == 2 and r, within=3, what="two rows")
    t.ok([r[0] for r in rows] == [two, one], f"…a row each at the foot of the column ({rows})")

# Paused from the column: the one out of a script's reach too.
was = b.ev(two, "window.__a.currentTime")
paused = b.cmd("tab.media", id=two, play=False)
time.sleep(0.3)
t.ok(paused and paused >= 1 and b.ev(two, "window.__a.paused"), f"Pause: the audio never put in the page is paused too ({paused})")
row = next((p for p in players() if p["id"] == two), None)
t.ok(row and row.get("stilled"), f"…and its row stays, paused from here ({row and {k_: row.get(k_) for k_ in ('audible', 'stilled')}})")
if heard:
    try:
        b.wait_for(lambda: not next((p for p in players() if p["id"] == two), {}).get("audible", True), within=6, what="quiet")
    except AssertionError:
        pass
    row = next((p for p in players() if p["id"] == two), None)
    t.ok(row and row.get("stilled") and not row.get("audible"), "the page quiet now: the row still there, with its play")
    rows = k.js(ROWS)
    t.ok(rows and any(r[0] == two and r[2][-1] == "Play" for r in rows), f"…drawn with its play ({rows})")
at = b.ev(two, "window.__a.currentTime")
again = b.cmd("tab.media", id=two, play=True)
time.sleep(0.4)
t.ok(again and again >= 1 and not b.ev(two, "window.__a.paused"), f"Play: it plays again ({again})")
t.ok(at >= was and b.ev(two, "window.__a.currentTime") >= at, "…from where it was")
t.ok(not next((p for p in players() if p["id"] == two), {}).get("stilled"), "…no longer paused from here")

# Gone to: the pause is handed back to the page, which keeps it paused.
b.cmd("tab.media", id=two, play=False)
time.sleep(0.3)
b.cmd("tab.select", id=two)
time.sleep(0.5)
row = next((p for p in players() if p["id"] == two), None)
t.ok(b.ev(two, "window.__a.paused") and not (row and row.get("stilled")), "gone to: the pause is the page's own, the player stays paused")
b.cmd("tab.select", id=next(x["id"] for x in b.window()["tabs"] if x.get("title") == "front"))
time.sleep(0.3)

# Put Away on a row paused from here: the row goes.
b.ev(one, "window.__a.play().then(() => 1, () => 0)")
time.sleep(0.4)
b.cmd("tab.media", id=one, play=False)
time.sleep(0.3)
t.ok(next((p for p in players() if p["id"] == one), {}).get("stilled"), "first paused from here")
b.cmd("tab.media", id=one, play=False, letGo=True)
time.sleep(0.5)
t.ok(not next((p for p in players() if p["id"] == one), {}).get("stilled") and b.ev(one, "window.__a.paused"), "Put Away: no longer held, the page's player paused as by its own button")

# A step in the page's own history (as single-page music sites take) keeps the
# pause from here; leaving the page (a reload) hands it back.
b.ev(two, "window.__a.play().then(() => 1, () => 0)")
time.sleep(0.4)
b.cmd("tab.media", id=two, play=False)
time.sleep(0.3)
b.ev(two, "(location.hash = 'moved', 1)")
time.sleep(0.5)
t.ok(next((p for p in players() if p["id"] == two), {}).get("stilled"), "a step in the page's own history: still paused from here")
b.cmd("tab.reload", id=two)
time.sleep(1.0)
t.ok(not next((p for p in players() if p["id"] == two), {}).get("stilled"), "the page left (reloaded): the pause is handed back, the row goes")

# Left playing in another space: still listed, a click goes there.
if heard:
    b.ev(one, "window.__a.play().then(() => 1, () => 0)")
    b.wait_for(lambda: next((p for p in players() if p["id"] == one), {}).get("audible"), within=6, what="first playing again")
    b.cmd("settings.set", id="spaces", value=True)
    time.sleep(0.4)
    home = b.window()["space"]
    b.call({"do": "cmd", "cmd": {"do": "space.create", "name": "Elsewhere"}})
    time.sleep(0.8)
    t.ok(b.window()["space"] != home, "another space on screen")
    row = next((p for p in players() if p["id"] == one), None)
    t.ok(row and row.get("space") == home, f"the tab left playing in the space before: still listed, its space said ({row and row.get('space')})")
    rows = k.js(ROWS)
    t.ok(rows and any(r[0] == one and r[3] == home for r in rows), f"…a row for it in this space's column ({rows})")
    el = k.rect(f".sidebar .player[data-tab='{one}'] .player-title")
    b.mouse(el["x"] + 5, el["y"] + el["h"] / 2)
    time.sleep(0.8)
    t.ok(b.window()["space"] == home and b.window()["activeID"] == one, "a click on it goes to its space, and to it")
t.done()

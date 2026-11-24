#!/usr/bin/env python3
"""Settings › Appearance and Tabs, the tabs' own looks, changed and measured
(studio/08 area A; Prefs.swift, Side.swift, UnreadBadge.swift,
TabShortcutHint.swift, Design.swift Motion.give, Extensions.swift):
Show tab numbers while Ctrl is held (tabs.shortcuts), Show counts on pins
(tabs.pinCounts), Tabs give when pressed (tabs.give), Back, forward and
reload (helm.*.hidden), Buttons under the column › Extensions
(foot.extensions.hidden)."""
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b
import ui_kit as k

b.use("settings-a-tabs")
b.launch(*k.FRAMES, env={"SEARCH_LOOK": "light"})
t = b.T()


def setting(id_, value):
    b.cmd("settings.set", id=id_, value=value)
    time.sleep(0.4)


b.cmd("tab.go", input="data:text/html,<title>one</title>one")
b.wait_for(lambda: b.active()["title"] == "one", what="page")
for n in ("two", "three"):
    b.cmd("tab.new", url=f"data:text/html,<title>{n}</title>{n}")
b.wait_for(lambda: len(b.window()["tabs"]) >= 3 and all(x.get("title") for x in b.window()["tabs"]), what="three tabs")
time.sleep(0.4)
numbers = lambda: k.js("return [...document.querySelectorAll('.sidebar .row .hint-number')].map(e => [e.closest('.row').querySelector('.title').textContent, e.textContent, Math.round(e.getBoundingClientRect().width)])")

# Show tab numbers while Ctrl is held (tabs.shortcuts): off by default, nothing; on, Ctrl alone held shows Ctrl+1-9's.
b.key("Control", phase="down")
time.sleep(0.4)
t.ok(not numbers(), "off (the default): holding Ctrl shows nothing")
b.key("Control", phase="up")
setting("tabs.shortcuts", True)
b.key("Control", phase="down")
time.sleep(0.4)
got = numbers()
t.ok(got and [x[1] for x in got] == ["1", "2", "3"] and all(x[2] == 15 for x in got), f"on: Ctrl held, each tab its number, 15 wide ({got})")
style = k.style(".sidebar .row .hint-number", "font-size", "font-weight", "color")
t.ok(style["font-size"] == "11px" and style["font-weight"] == "500", f"11 medium, ink at 65% ({style})")
b.key("Control", phase="up")
time.sleep(0.3)
t.ok(not numbers(), "Ctrl let go: they go")
b.key("Control", phase="down")
b.key("k")
time.sleep(0.3)
t.ok(not numbers(), "another key with it: they go (it's a shortcut, not a look)")
b.key("Control", phase="up")
setting("tabs.shortcuts", False)

# Tabs give when pressed (tabs.give): a tab sinks to 0.97 under the pointer, and comes back.
row = k.rect(".sidebar .row")
cx, cy = row["x"] + row["w"] / 2, row["y"] + row["h"] / 2
scale = lambda: k.js("return getComputedStyle(document.querySelector('.sidebar .row')).scale")
b.mouse(cx, cy, phase="down")
time.sleep(0.3)
t.ok(scale() in ("none", "1"), f"off (the default): it doesn't give ({scale()})")
b.mouse(cx, cy, phase="up")
setting("tabs.give", True)
b.mouse(cx, cy, phase="down")
time.sleep(0.4)
pressed = scale()
b.mouse(cx, cy, phase="up")
time.sleep(0.6)
t.ok(pressed == "0.97", f"on: pressed, it gives to 0.97 ({pressed})")
t.ok(scale() in ("none", "1"), f"let go, back to its size ({scale()})")
setting("tabs.give", False)

# Show counts on pins (tabs.pinCounts): the count at the front of its title, red, on its icon's corner.
s = k.fixture("many")
first = next(x for x in s["tabs"] if x.get("pinID"))
first["title"] = "(5) Inbox"
first["asleep"] = False
s2 = json.loads(json.dumps(s))
k.fake({**s, "prefs": {**s.get("prefs", {}), "tabs.pinCounts": False}}, look="light")
time.sleep(0.4)
badge = lambda: k.js(f"const e = document.querySelector('.square[data-tab=\"{first['id']}\"] .unread'); if (!e) return null; const r = e.getBoundingClientRect(); const g = e.parentElement.getBoundingClientRect(); return [e.textContent, getComputedStyle(e).backgroundColor, getComputedStyle(e).color, r.x + r.width / 2 - g.right, r.y + r.height / 2 - g.y]")
t.ok(badge() is None, "off (the default): no count")
k.fake({**s, "prefs": {**s.get("prefs", {}), "tabs.pinCounts": True}}, look="light")
time.sleep(0.4)
got = badge()
t.ok(got and got[0] == "5" and got[1] == "rgb(237, 61, 54)" and got[2] == "rgb(255, 255, 255)", f"on: \"(5) Inbox\" shows 5, white on red ({got})")
t.ok(got and abs(got[3]) <= 3 and abs(got[4]) <= 3, f"…hung on the icon's top right corner ({got and got[3:]})")
for title, want in (("(120) Mail", "99+"), ("(12+) Chat", "12+"), ("Dune (2021) - IMDb", None), ("(0) Zero", None)):
    s2 = json.loads(json.dumps(s))
    next(x for x in s2["tabs"] if x["id"] == first["id"])["title"] = title
    k.fake({**s2, "prefs": {**s2.get("prefs", {}), "tabs.pinCounts": True}}, look="light")
    time.sleep(0.25)
    g = badge()
    t.ok((g[0] if g else None) == want, f"{title!r}: {want}")
s2 = json.loads(json.dumps(s))
next(x for x in s2["tabs"] if x["id"] == first["id"])["asleep"] = True
k.fake({**s2, "prefs": {**s2.get("prefs", {}), "tabs.pinCounts": True}}, look="light")
time.sleep(0.25)
t.ok(badge() is None, "asleep: no count (the last one heard may be old)")

# Back, forward and reload (helm.*.hidden): each goes only when unticked, in the column and in the strip.
doors = lambda sel: k.js(f"return [...document.querySelectorAll('{sel}')].map(e => e.title.split(' ')[0])")
k.fake({**s, "prefs": {"helm.reload.hidden": True}}, look="light")
time.sleep(0.3)
t.ok(doors(".sidebar .helm > .door") == ["Back", "Forward"], f"Reload unticked: back and forward stay ({doors('.sidebar .helm > .door')})")
k.fake({**s, "prefs": {"helm.back.hidden": True, "helm.forward.hidden": True}}, look="light")
time.sleep(0.3)
t.ok(doors(".sidebar .helm > .door") == ["Reload"], "Back and Forward unticked: reload alone")
top = k.fixture("top")
k.fake({**top, "prefs": {"helm.forward.hidden": True}}, look="light")
time.sleep(0.3)
t.ok(doors(".tabbar .strip-helm > .door") == ["Back", "Reload"], f"in the strip too ({doors('.tabbar .strip-helm > .door')})")

# Buttons under the column › Extensions (foot.extensions.hidden): the puzzle goes, still where popups hang from; pinned ones stay.
ext = {"list": [{"id": "abc", "name": "Thing", "version": "1", "title": "Thing", "enabled": True, "pinned": True, "action": True, "icon": None,
                 "badge": None, "fromStore": True, "options": False}], "menu": None, "popup": None, "busy": [], "said": None, "manage": False, "panel": None}
k.fake({**s, "ext": ext, "prefs": {}}, look="light")
time.sleep(0.3)
puzzle = lambda: k.js("const e = document.querySelector('.foot .ext-puzzle'); if (!e) return null; return [e.getBoundingClientRect().width, getComputedStyle(e).opacity, !!document.querySelector('.foot .ext-button')]")
t.ok(puzzle() and puzzle()[0] == 26 and puzzle()[1] == "1", f"ticked (the default): the puzzle in the foot ({puzzle()})")
k.fake({**s, "ext": ext, "prefs": {"foot.extensions.hidden": True}}, look="light")
time.sleep(0.3)
got = puzzle()
t.ok(got and got[0] == 0 and got[1] == "0" and got[2], f"unticked: the puzzle 0 wide and clear, still there to hang popups from; the pinned button stays ({got})")
# Buttons at the top (sidebar.doorsUp): the foot's doors beside back, forward and reload, when they fit.
sp = k.fixture("spaces")
k.fake({**sp, "prefs": {**sp["prefs"], "sidebar.doorsUp": False}}, look="light")
time.sleep(0.3)
where = lambda: k.js("const d = document.querySelector('.sidebar .space-dot'); if (!d) return null; return [d.closest('.band') ? 'band' : 'foot', !!document.querySelector('.sidebar > .foot'), Math.round(rel(d.getBoundingClientRect()).y + 13)]")
t.ok(where() and where()[0] == "foot", f"off (the default): the space's door at the foot ({where()})")
k.fake({**sp, "prefs": {**sp["prefs"], "sidebar.doorsUp": True}}, look="light")
time.sleep(0.3)
got = where()
t.ok(got and got[0] == "band" and not got[1] and got[2] == 26, f"on: up in the band, on the helm's middle, the foot gone ({got})")
many_ext = {**ext, "list": [{**ext["list"][0], "id": f"e{i}", "name": f"E{i}"} for i in range(3)]}
k.fake({**sp, "ext": many_ext, "prefs": {**sp["prefs"], "sidebar.doorsUp": True}}, look="light")
time.sleep(0.3)
t.ok(where() and where()[0] == "foot", f"too many to fit beside the helm: they stay at the foot ({where()})")

# What's playing in other tabs (sidebar.player): the newest tab making a sound out of sight, at the foot.
pl = json.loads(json.dumps(s))
loose = [x for x in pl["tabs"] if not x.get("pinID") and x["id"] != pl["activeID"]]
loose[0]["audible"] = True
row = lambda: k.js("const e = document.querySelector('.sidebar .player'); return e && [e.querySelector('.player-title').textContent, e.querySelector('.player-button').title, e.dataset.tab]")
k.fake({**pl, "prefs": {}}, look="light")
time.sleep(0.3)
t.ok(row() is None, "off (the default): no player")
k.fake({**pl, "prefs": {"sidebar.player": True}}, look="light")
time.sleep(0.3)
got = row()
sounding = [x["id"] for x in pl["tabs"] if x.get("audible") and x["id"] != pl["activeID"]]
t.ok(got and got[2] in sounding and got[1] == "Pause", f"on: a tab playing out of sight, its title and its pause ({got})")
front = json.loads(json.dumps(pl))
for x in front["tabs"]:
    x["audible"] = x["id"] == front["activeID"]
k.fake({**front, "prefs": {"sidebar.player": True}}, look="light")
time.sleep(0.3)
t.ok(row() is None, "the tab on screen playing: nothing to show")
k.thaw()

# Its pause and play reach the page: what plays is paused, remembered, played again.
time.sleep(0.3)
song = b.cmd("tab.new", url="data:text/html,<title>song</title><body>song", background=True)
b.wait_for(lambda: any(x.get("title") == "song" for x in b.window()["tabs"]), what="song")
time.sleep(0.4)
started = b.ev(song, "(() => { const a = document.createElement('audio'); a.loop = true; const r = 8000, n = r; const buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);"
                    " const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));"
                    " w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);"
                    " v.setUint32(24, r, true); v.setUint32(28, r * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);"
                    " for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.sin(i / 8) * 3000, true);"
                    " a.src = URL.createObjectURL(new Blob([buf], { type: 'audio/wav' })); document.body.appendChild(a); window.__a = a; return a.play().then(() => true, () => false) })()")
if started:
    paused = b.cmd("tab.media", id=song, play=False)
    t.ok(paused == 1 and b.ev(song, "window.__a.paused"), f"Pause: what played is paused ({paused})")
    again = b.cmd("tab.media", id=song, play=True)
    time.sleep(0.3)
    t.ok(again == 1 and not b.ev(song, "window.__a.paused"), "Play: it plays again")
    b.cmd("tab.media", id=song, play=False)
else:
    print("  (this machine plays no sound: pause and play not followed)")
t.done()

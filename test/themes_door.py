#!/usr/bin/env python3
"""The door to Settings on the blank tab (asked for on Windows): in the
card's bottom right corner, 14 in from both edges (the field's own margin,
min(560, width − 28), and Find on Page's from the right), drawn as the
column's doors (26 × 26, radius 8, the symbol at 11 medium in muted; studio/02
§4.2); over a theme it stands on the ground with a hairline, as the field
does; a click opens oriel://settings."""
import sys
import time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b
import themes_kit as k

b.use("themes-door")
b.launch()
t = b.T()
k.look("light")
k.blank_tab()

INFO = """(() => { const d = document.querySelector('.empty-page > .blank-door'); if (!d) return null;
  const r = d.getBoundingClientRect(), c = document.querySelector('.card').getBoundingClientRect(), s = getComputedStyle(d);
  const svg = d.querySelector('svg'), path = svg.querySelector('path');
  return { right: Math.round((c.right - r.right) * 100) / 100, bottom: Math.round((c.bottom - r.bottom) * 100) / 100, w: r.width, h: r.height,
    radius: s.borderTopLeftRadius, colour: s.color, background: s.backgroundColor, shadow: s.boxShadow, title: d.title, label: d.getAttribute('aria-label'),
    box: svg.getBoundingClientRect().width, stroke: svg.getAttribute('stroke-width'), cap: svg.getAttribute('stroke-linecap'), sc: svg.getAttribute('stroke'),
    x: r.left + r.width / 2, y: r.top + r.height / 2, themed: d.classList.contains('themed') } })()"""
d = b.ui(INFO)
t.ok(d is not None, "the blank tab has a door to Settings")
t.ok(d["right"] == 14 and d["bottom"] == 14, f"14 in from the card's right and bottom ({d['right']}, {d['bottom']})")
t.ok(d["w"] == 26 and d["h"] == 26 and d["radius"] == "8px", f"26 × 26 at radius 8, as the column's doors ({d['w']}×{d['h']}, {d['radius']})")
muted = b.ui("getComputedStyle(document.documentElement).getPropertyValue('--muted').trim()")
t.ok(d["colour"] == "rgb(140, 140, 140)" and muted.upper() == "#8C8C8C", f"in muted ({d['colour']})")
t.ok(abs(d["box"] - 12.1) < 0.01 and d["stroke"] == "1.5" and d["cap"] == "round" and d["sc"] == "currentColor", f"a gear at 11 (box 12.1), 1.5 round strokes in its colour ({d['box']}, {d['stroke']})")
t.ok(d["title"] == "Settings" and d["label"] == "Settings", "called Settings")
t.ok(d["background"] == "rgba(0, 0, 0, 0)", "plain on a plain tab")
hover = b.ui("[...document.styleSheets].flatMap(s => { try { return [...s.cssRules] } catch { return [] } }).filter(r => r.selectorText === '.blank-door:hover').map(r => r.style.background + '|' + r.style.color)")
t.ok(hover and hover[0] == "var(--g-hover)|var(--ink-hover-text)", f"under the pointer: ink 70% on the hover grey ({hover})")
k.shot("door-off-light")

# Over a theme: on the ground with a hairline.
b.cmd("settings.set", id="home.theme", value="cityAtNight")
b.wait_for(lambda: k.wall()["key"].startswith("cityAtNight:"), what="a wall")
time.sleep(0.5)  # its quick fade in
d = b.ui(INFO)
t.ok(d["themed"] and d["background"] == "rgb(255, 255, 255)" and "inset" in d["shadow"], f"over a theme it stands on the ground with a hairline ({d['background']}, {d['shadow']})")
k.shot("door-wall-light")
k.look("dark")
time.sleep(0.5)
d = b.ui(INFO)
t.ok(d["background"] == "rgb(28, 28, 28)", f"dark: on the dark ground ({d['background']})")
k.shot("door-wall-dark")
k.look("light")

# A click opens Settings.
# (Measured again after the look's change; a click that lands while the
# window is still settling is given another go.)
time.sleep(0.5)
d = b.ui(INFO)
tries = 0
while not k.settings_tab() and tries < 3:
    tries += 1
    b.mouse(d["x"], d["y"])
    try:
        b.wait_for(lambda: k.settings_tab(), within=4, what="Settings tab")
    except AssertionError:
        pass
b.wait_for(lambda: k.settings_tab(), within=1, what="Settings tab")
tab = [x for x in b.window()["tabs"] if x.get("internal") == "settings"][0]
t.ok(tab["url"].startswith("oriel://settings"), f"a click opens oriel://settings ({tab['url']}, click {tries})")
t.done()

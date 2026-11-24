#!/usr/bin/env python3
"""The blank tab's themes (studio/02 §2.8, §8.1-8.3; HomeTheme.swift,
HomeWalls.swift, HomeStickers.swift, ThemesPage.swift): each family chosen
on Settings › Themes is painted behind the blank tab's field, with the Mac's
colours and the stickers where the Mac's seed puts them; Shuffle follows the
day; Intensity blends toward the ground; another window follows at once; Off
gives the plain tab and its breath back. Pictures of each, light and dark,
in out/themes-shots/."""
import datetime
import json
import math
import sys
import time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b
import themes_kit as k

b.use("themes-blank")
b.launch()
t = b.T()
k.look("light")
prefs = lambda: b.state()["prefs"]
tuning = lambda: json.loads(prefs().get("home.tuning") or "{}")


def both_looks(name):
    """A picture of the blank tab in light, then dark, then back to light."""
    k.blank_tab()
    k.shot(f"{name}-light")
    k.look("dark")
    w = k.wall()
    t.ok(w["key"].endswith("|dark") or w["shown"] in ("off", "none", "custom"), f"{name}: painted again for dark ({w['key']})")
    k.shot(f"{name}-dark")
    k.look("light")


# 0. Off unless chosen: a plain tab, the breath under the field.
k.blank_tab()
w = k.wall()
t.ok(prefs().get("home.theme", "off") == "off", "home.theme is off by default")
t.ok(w["shown"] == "none" and w["breath"] != "none", f"the blank tab is plain and breathes ({w})")
k.shot("off-light")

# 1. The page: families with the Mac's words, Off's note.
tab = k.open_themes()
seg = k.ev(tab, "[...document.querySelectorAll('.th .st-seg-item')].map(b => b.textContent)")
t.ok(seg == ["Off", "Wall painting", "Stickers", "Solid colour", "Gradient", "Image"], f"families as on the Mac ({seg})")
t.ok(k.ev(tab, "document.querySelector('.th .th-note')?.textContent") == "The blank tab stays plain.", "Off: The blank tab stays plain.")
mock = k.ev(tab, "(() => { const r = document.querySelector('.th-mock').getBoundingClientRect(); return [r.width, r.height, parseFloat(getComputedStyle(document.querySelector('.th-mock')).borderTopLeftRadius)] })()")
t.ok(mock == [480, 300, 12], f"the window in small is 480 × 300, radius 12 ({mock})")
t.ok(k.ev(tab, "document.querySelector('.th-mock-field').textContent") == "Search or enter address", "its field says Search or enter address")

# 2. Wall painting: the family alone puts Open Road up; a card picks another.
k.family(tab, "Wall painting")
b.wait_for(lambda: prefs().get("home.theme") == "openRoad", what="Open Road")
t.ok(True, "Wall painting alone puts Open Road on the wall")
names = k.ev(tab, "[...document.querySelectorAll('.th .th-card')].map(c => c.getAttribute('aria-label'))")
t.ok(names == ["Open Road", "Desert Highway", "Coastal Cliffs", "Mountain Lake", "Rice Terraces", "Northern Lights", "Saturn Rise", "Moonscape", "City at Night", "Monsoon Forest"], "the ten walls, named as on the Mac")
ring = k.ev(tab, "(() => { const r = document.querySelector('.th-card.on .th-ring'); const th = r.querySelector('.th-thumb'); const s = getComputedStyle(r); return [s.borderTopLeftRadius, s.boxShadow.includes('2.5px'), getComputedStyle(th).borderTopLeftRadius, getComputedStyle(r).paddingTop] })()")
t.ok(ring == ["13px", True, "10px", "3px"], f"the choice has a 2.5 ring at 13 round a 10 thumbnail, 3 apart ({ring})")
thumb = k.ev(tab, "(() => { const c = document.querySelector('.th-card .th-thumb canvas'); return [c.dataset.drawn, c.width / c.getBoundingClientRect().width] })()")
t.ok(thumb and thumb[0].startswith("480x"), f"a preview is painted as a window 480 wide ({thumb})")
k.card(tab, "Desert Highway")
b.wait_for(lambda: prefs().get("home.theme") == "desertHighway", what="Desert Highway")
k.blank_tab()
w = b.wait_for(lambda: (lambda w: w if w["key"].startswith("desertHighway:1|") else None)(k.wall()), what="Desert Highway on the blank tab")
card = b.ui("(() => { const r = document.querySelector('.card').getBoundingClientRect(); return [r.width, r.height] })()")
want = f"{math.ceil(card[0] / 64) * 64}x{math.ceil(card[1] / 64) * 64}"
t.ok(w["drawn"] == want, f"painted at the card rounded up to 64 ({w['drawn']}, card {card})")
t.ok(w["fit"] == "cover", "shown filling the card (aspect fill)")
t.ok(w["breath"] == "none", "no breath over a theme (Omnibox.swift UnlessThemed)")
sky = k.canvas_pixels([[0.5, 0.0]])[0]
t.ok(k.near(sky, [66, 46, 112], 4), f"the sky starts at the Mac's (0.26, 0.18, 0.44) ({sky})")
both_looks("wall-desertHighway")

# 3. Stickers: a pack's card; every sticker where the Mac's seed puts it.
tab = k.open_themes()
k.family(tab, "Stickers")
b.wait_for(lambda: prefs().get("home.theme") == "stickers", what="stickers")
k.card(tab, "Ocean")
b.wait_for(lambda: tuning().get("pack") == "ocean", what="Ocean")
t.ok(prefs()["home.tuning"] == json.dumps(dict(sorted({**tuning()}.items())), separators=(",", ":")), f"home.tuning is one line of JSON, keys sorted ({prefs()['home.tuning']})")
sl = k.ev(tab, "[...document.querySelectorAll('.th-slider-title')].map(s => s.textContent)")
t.ok(sl == ["Intensity", "Density", "Scale"], f"stickers have Intensity, Density and Scale ({sl})")
t.ok(k.ev(tab, "document.querySelector('.th-check')?.textContent.trim()") == "Shuffle: a different one each day", "Shuffle's box, worded as on the Mac")
k.blank_tab()
w = b.wait_for(lambda: (lambda w: w if w["key"].startswith("stickers:ocean:") else None)(k.wall()), what="Ocean on the blank tab")
dw, dh = map(int, w["drawn"].split("x"))
placed = b.ui("window.__themes.placed()")
want = k.placements("ocean", dw, dh)
same = len(placed) == len(want) and all(abs(a["x"] - e["x"]) < 1e-6 and abs(a["y"] - e["y"]) < 1e-6 and abs(a["r"] - e["r"]) < 1e-6
                                        and abs(a["tilt"] - e["tilt"]) < 1e-6 and a["sticker"] == e["sticker"] for a, e in zip(placed, want))
t.ok(same, f"{len(placed)} stickers, each where the Mac's generator puts it (first at {placed[0]['x']:.2f}, {placed[0]['y']:.2f})")
ground = k.canvas_pixels([[0.5, 0.5]])[0]
t.ok(k.near(ground, [214, 237, 245], 1), f"on the pack's ground (0.84, 0.93, 0.96) ({ground})")
both_looks("stickers-ocean")

# 4. Solid colour: a swatch.
tab = k.open_themes()
k.family(tab, "Solid colour")
b.wait_for(lambda: prefs().get("home.theme") == "solid", what="solid")
sw = k.ev(tab, "[...document.querySelectorAll('.th-swatch')].map(s => s.getAttribute('aria-label'))")
t.ok(sw == [f"Colour #{h}" for h in ["E8DFD0", "F3D9CF", "D9E4D3", "D3DFEA", "E4D8EC", "2B2B2E"]], f"the six swatches ({sw})")
k.ev(tab, "document.querySelector('.th-swatch[aria-label=\"Colour #D3DFEA\"]').click()")
b.wait_for(lambda: tuning().get("solid") == "#D3DFEA", what="swatch")
k.blank_tab()
b.wait_for(lambda: k.wall()["key"].startswith("solid:#D3DFEA"), what="solid on the blank tab")
px = k.canvas_pixels([[0.1, 0.1], [0.9, 0.9]])
t.ok(all(k.near(p, k.pen("#D3DFEA", False), 0) for p in px), f"the whole wall is #D3DFEA ({px})")
k.look("dark")
b.wait_for(lambda: k.wall()["key"].endswith("|dark"), what="dark")
px = k.canvas_pixels([[0.5, 0.5]])[0]
t.ok(k.near(px, k.pen("#D3DFEA", True), 1), f"dark: the same pigment × 0.42 ({px} for {k.pen('#D3DFEA', True)})")
k.look("light")
both_looks("solid")

# 5. Gradient: Dusk alone, then Sea; corners carry the two colours.
tab = k.open_themes()
k.family(tab, "Gradient")
b.wait_for(lambda: prefs().get("home.theme") == "gradient", what="gradient")
t.ok([c for c in k.ev(tab, "[...document.querySelectorAll('.th .th-card')].map(c => c.getAttribute('aria-label'))")] == ["Dusk", "Sea", "Peach", "Mint", "Mono"], "the five gradients")
t.ok(k.ev(tab, "document.querySelector('.th-card.on')?.getAttribute('aria-label')") == "Dusk", "Dusk is the default")
k.card(tab, "Sea")
b.wait_for(lambda: tuning().get("gradientA") == "#BFE0DC", what="Sea")
t.ok(tuning().get("gradientB") == "#5E8FA8" and tuning().get("angle") == 160, f"Sea: #BFE0DC → #5E8FA8 at 160 ({tuning()})")
wells = k.ev(tab, "[...document.querySelectorAll('.th-well-row > span:first-child')].map(s => s.textContent)")
t.ok(wells == ["From", "To"], f"From and To ({wells})")
k.blank_tab()
b.wait_for(lambda: k.wall()["key"].startswith("gradient:#BFE0DC:#5E8FA8:160"), what="Sea on the blank tab")
tr, bl = k.canvas_pixels([[0.999, 0.0], [0.0, 0.999]])
t.ok(k.near(tr, k.pen("#BFE0DC", False), 3) and k.near(bl, k.pen("#5E8FA8", False), 3), f"the line runs corner to corner at 160° as in CSS + 90° (top right {tr}, bottom left {bl})")
both_looks("gradient-sea")

# 6. Intensity, applied when let go: the wall blended toward the ground.
tab = k.open_themes()
k.ev(tab, """(() => { const i = [...document.querySelectorAll('.th-slider')].find(s => s.textContent.startsWith('Intensity')).querySelector('input');
  i.value = 40; i.dispatchEvent(new Event('input', { bubbles: true })); return true })()""")
time.sleep(0.4)
t.ok(abs(tuning().get("intensity", 1) - 1) < 1e-9, "not applied while held")
t.ok(k.ev(tab, "[...document.querySelectorAll('.th-slider')].find(s => s.textContent.startsWith('Intensity')).querySelector('.th-slider-value').textContent") == "40%", "the value reads 40% while held")
k.ev(tab, "(() => { const i = [...document.querySelectorAll('.th-slider')].find(s => s.textContent.startsWith('Intensity')).querySelector('input'); i.dispatchEvent(new Event('change', { bubbles: true })); return true })()")
b.wait_for(lambda: abs(tuning().get("intensity", 1) - 0.4) < 1e-9, what="intensity 0.4")
k.blank_tab()
b.wait_for(lambda: ":0.4|" in k.wall()["key"], what="intensity on the blank tab")
tr = k.canvas_pixels([[0.999, 0.0]])[0]
a = k.pen("#BFE0DC", False)
blend = [round(v * 0.4 + 255 * 0.6) for v in a]
t.ok(k.near(tr, blend, 4), f"covered by the ground at 60% ({tr} ≈ {blend})")
tab = k.open_themes()
k.ev(tab, """(() => { const i = [...document.querySelectorAll('.th-slider')].find(s => s.textContent.startsWith('Intensity')).querySelector('input');
  i.value = 100; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); return true })()""")
b.wait_for(lambda: abs(tuning().get("intensity", 0) - 1) < 1e-9, what="intensity back")

# 7. Shuffle: the day's wall and the day's pack (day % 10, counted as Foundation counts).
day = datetime.date.today().toordinal()
k.family(tab, "Wall painting")
k.card(tab, "Open Road")
b.wait_for(lambda: prefs().get("home.theme") == "openRoad", what="Open Road")
k.ev(tab, "document.querySelector('.th-check input').click()")
b.wait_for(lambda: prefs().get("home.shuffle") is True, what="shuffle on")
k.blank_tab()
want = k.WALLS[day % 10]
b.wait_for(lambda: k.wall()["key"].startswith(want + ":"), what=f"today's wall {want}")
t.ok(True, f"Shuffle shows today's wall ({want}, day {day})")
tab = k.open_themes()
k.family(tab, "Stickers")
k.card(tab, "Space")
b.wait_for(lambda: prefs().get("home.theme") == "stickers" and tuning().get("pack") == "space", what="Space")
k.blank_tab()
pack = k.PACKS[day % 10]
b.wait_for(lambda: k.wall()["key"].startswith(f"stickers:{pack}:"), what=f"today's pack {pack}")
t.ok(True, f"Shuffle shows today's pack ({pack})")
tab = k.open_themes()
k.ev(tab, "document.querySelector('.th-check input').click()")
b.wait_for(lambda: not prefs().get("home.shuffle"), what="shuffle off")
k.blank_tab()
b.wait_for(lambda: k.wall()["key"].startswith("stickers:space:"), what="the chosen pack again")
t.ok(True, "Shuffle off: the chosen pack again")
both_looks("stickers-space")
k.blank_tab()
k.wall()

# 8. Every window follows at once.
first = b.window()["windowID"]
b.cmd("window.new")
b.wait_for(lambda: len(b.state()["windows"]) == 2, what="second window")
second = [x for x in b.state()["windows"] if x["windowID"] != first][0]["windowID"]
b.wait_for(lambda: k.wall(second)["key"].startswith("stickers:space:"), what="the second window's wall")
b.cmd("settings.set", id="home.theme", value="monsoonForest")
b.wait_for(lambda: k.wall(second)["key"].startswith("monsoonForest:"), within=5, what="second window follows")
t.ok(True, "a theme chosen shows at once in another window too")
b.cmd("window.close", window=second)
b.cmd("settings.set", id="home.theme", value="stickers")
b.wait_for(lambda: len(b.state()["windows"]) == 1, what="one window")

# 9. Off: the plain tab and its breath back.
tab = k.open_themes()
k.family(tab, "Off")
b.wait_for(lambda: prefs().get("home.theme", "off") == "off", what="off")
k.blank_tab()
w = b.wait_for(lambda: (lambda w: w if w["shown"] == "none" else None)(k.wall()), what="plain tab")
t.ok(w["breath"] != "none", f"Off: no wall, the breath is back ({w})")
k.look("dark")
k.shot("off-dark")
k.look("light")

# The Themes page itself, light and dark, for the eye.
tab = k.open_themes()
k.family(tab, "Wall painting")
k.shot("page-wall-light")
k.look("dark")
k.shot("page-wall-dark")
k.look("light")
t.done()

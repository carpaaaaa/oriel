#!/usr/bin/env python3
"""Settings › Themes › Image (studio/02 §8.2-8.3; HomeTheme.swift keep,
forget, choose; ThemesPage.swift image): a picture chosen (the Open dialog's
answer given by the bench, never a dialog on screen) is copied into Oriel's
Theme folder, one at a time, fills the blank tab's card as the Mac's aspect
fill does, stays after a restart, blends with Intensity; Remove deletes the
copy and gives the plain tab back; a picture that can't be read is Off."""
import json
import sys
import time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b
import themes_kit as k

RED, BLUE, GREEN = (200, 40, 40), (40, 60, 200), (40, 170, 90)
here = b.ROOT / "out"
first = k.png(here / "themes-first.png", 300, 200, RED, BLUE)
second = k.png(here / "themes-second.png", 120, 240, GREEN, RED)

b.use("themes-image")
b.launch()
t = b.T()
k.look("light")
prefs = lambda: b.state()["prefs"]
tuning = lambda: json.loads(prefs().get("home.tuning") or "{}")

# 1. The family with no picture yet: on show, not on the wall.
tab = k.open_themes()
k.family(tab, "Image")
time.sleep(0.4)
t.ok(prefs().get("home.theme", "off") == "off", "Image with no picture leaves the wall as it was (Off)")
none = k.ev(tab, "(() => { const f = document.querySelector('.th-image-frame'); const r = f.getBoundingClientRect(); return [r.width, r.height, getComputedStyle(f).borderTopLeftRadius, !!f.querySelector('.th-image-none svg')] })()")
t.ok(none == [176, 114, "8px", True], f"176 × 114 at radius 8, the photo on wash ({none})")
pills = k.ev(tab, "[...document.querySelectorAll('.th-image-side .pill-st')].map(p => p.textContent)")
t.ok(pills == ["Choose Image…"], f"only Choose Image… ({pills})")
t.ok(k.ev(tab, "document.querySelector('.th-image-side .th-small').textContent") == "A copy is kept inside Oriel.", "A copy is kept inside Oriel.")
t.ok(not k.ev(tab, "!!document.querySelector('.th-sliders')"), "no sliders until there is a picture")

# 2. Choose Image…: the dialog's answer is copied into the Theme folder.
b.call({"do": "themes.answer", "file": str(first)})
k.ev(tab, "[...document.querySelectorAll('.th-image-side .pill-st')].find(p => p.textContent === 'Choose Image…').click()")
b.wait_for(lambda: prefs().get("home.theme") == "custom", what="custom")
kept = prefs()["home.theme.image"]
folder = b.call({"do": "themes.folder"})
t.ok(kept.startswith(folder["folder"]) and kept.endswith(".png") and Path(kept).read_bytes() == Path(first).read_bytes(), f"a copy kept in Oriel's Theme folder ({Path(kept).name})")
t.ok(len(folder["files"]) == 1, f"one picture in the folder ({folder['files']})")
b.wait_for(lambda: k.ev(tab, "!!document.querySelector('.th-image-frame canvas.picture')"), what="thumbnail")
t.ok(k.ev(tab, "[...document.querySelectorAll('.th-image-side .pill-st')].map(p => p.textContent)") == ["Choose Image…", "Remove"], "Remove comes with a picture")
t.ok(k.ev(tab, "[...document.querySelectorAll('.th-slider-title')].map(s => s.textContent)") == ["Intensity"], "Intensity only, for a picture")

# 3. The blank tab: the picture filling the card, centred and cut (aspect fill).
k.blank_tab()
w = b.wait_for(lambda: (lambda w: w if w["shown"] == "custom" else None)(k.wall()), what="picture on the blank tab")
t.ok(w["breath"] == "none" and w["fit"] == "cover", f"the picture fills the card, no breath ({w})")
pic = b.ui("(() => { const c = document.querySelector('.blank-wall canvas.picture'); return [c.width, c.height] })()")
t.ok(pic == [300, 200], f"decoded at its own size ({pic})")
px = k.canvas_pixels([[0.25, 0.5], [0.75, 0.5]], ".blank-wall canvas.picture")
t.ok(k.near(px[0], RED, 1) and k.near(px[1], BLUE, 1), f"its pixels as they are ({px})")
card = b.ui("(() => { const r = document.querySelector('.card').getBoundingClientRect(); return [r.left, r.top, r.width, r.height] })()")
p = k.shot("image-light")
x0, y0, cw, ch = card
pts = [[x0 + 12, y0 + ch / 2], [x0 + cw - 12, y0 + ch / 2], [x0 + cw * 0.25, y0 + 6], [x0 + cw * 0.75, y0 + ch - 6]]
got = k.shot_pixels(p, pts)
t.ok(k.near(got[0], RED, 6) and k.near(got[1], BLUE, 6), f"edge to edge across the card ({got[0]}, {got[1]})")
t.ok(k.near(got[2], RED, 6) and k.near(got[3], BLUE, 6), f"and top to bottom: filled, not fitted ({got[2]}, {got[3]})")
k.look("dark")
k.shot("image-dark")
k.look("light")

# 4. Intensity: the ground over the picture at 1 − intensity.
tab = k.open_themes()
k.ev(tab, """(() => { const i = document.querySelector('.th-slider input'); i.value = 50;
  i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); return true })()""")
b.wait_for(lambda: abs(tuning().get("intensity", 1) - 0.5) < 1e-9, what="intensity 0.5")
k.blank_tab()
veil = b.wait_for(lambda: b.ui("(() => { const v = document.querySelector('.blank-wall .home-bg-veil'); return v && getComputedStyle(v).opacity === '0.5' ? [getComputedStyle(v).opacity, getComputedStyle(v).backgroundColor] : null })()"), what="veil")
t.ok(veil == ["0.5", "rgb(255, 255, 255)"], f"the ground at 50% over it ({veil})")
k.shot("image-intensity-light")

# 5. A second picture replaces the first, file and all.
r = b.call({"do": "themes.pick", "file": str(second)})["value"]
b.wait_for(lambda: prefs().get("home.theme.image") == r["path"], what="second picture")
folder = b.call({"do": "themes.folder"})
t.ok(len(folder["files"]) == 1 and not Path(kept).exists(), f"the old copy goes ({folder['files']})")
b.wait_for(lambda: b.ui("(() => { const c = document.querySelector('.blank-wall canvas.picture'); return c && c.width === 120 && c.height === 240 })()"), what="the new picture shown")
t.ok(True, "the blank tab shows the new picture at once")
t.ok(b.cmd("themes.picture", path=str(first)) is None, "the interface gets no file but the kept copy")

# 6. After a restart it is still there.
kept = prefs()["home.theme.image"]
b.quit()
b.use("themes-image", wipe=False)
b.launch()
k.blank_tab()
w = b.wait_for(lambda: (lambda w: w if w["shown"] == "custom" else None)(k.wall()), what="picture after restart")
t.ok(prefs().get("home.theme.image") == kept and b.ui("document.querySelector('.blank-wall canvas.picture').width") == 120, "the picture is there after a restart")

# 7. A picture that can't be read shows as Off: breath and all.
Path(kept).rename(kept + ".gone")
b.cmd("settings.set", id="home.theme.image", value=kept + ".missing")
w = b.wait_for(lambda: (lambda w: w if w["shown"] == "off" else None)(k.wall()), what="unreadable is off")
t.ok(w["breath"] not in ("none", "gone"), f"an unreadable picture shows as Off, the breath back ({w})")
Path(kept + ".gone").rename(kept)
b.cmd("settings.set", id="home.theme.image", value=kept)
b.wait_for(lambda: k.wall()["shown"] == "custom", what="readable again")

# 8. Remove: the copy goes, and the wall with it.
tab = k.open_themes()
k.ev(tab, "[...document.querySelectorAll('.th-image-side .pill-st')].find(p => p.textContent === 'Remove').click()")
b.wait_for(lambda: prefs().get("home.theme", "off") == "off" and not prefs().get("home.theme.image"), what="removed")
t.ok(not Path(kept).exists() and b.call({"do": "themes.folder"})["files"] == [], "Remove deletes the kept copy")
k.blank_tab()
w = b.wait_for(lambda: (lambda w: w if w["shown"] == "none" else None)(k.wall()), what="plain")
t.ok(w["breath"] not in ("none", "gone"), "and the blank tab is plain again, breathing")
t.done()

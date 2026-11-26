#!/usr/bin/env python3
"""The star card after an update (settings/star.ts): once per update, never on
a fresh install; small, in the page's lower right corner, taking no focus;
Star on GitHub opens the repository and Buy me a coffee end it for good, the
X puts it away until the next update; anything else wanting the overlay
takes its place."""
import json
import sys
import time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b

t = b.T()


def star(**kw):
    return b.call({"do": "settings.star", **kw})


def seed(prefs):
    b.folder().mkdir(parents=True, exist_ok=True)
    (b.folder() / "prefs.json").write_text(json.dumps(prefs))


def overlay(js):
    try:
        return b.ui(js, root="overlay")
    except RuntimeError:
        return None


def card_up():
    return star()["shown"] and overlay("!!document.querySelector('.star-card')")


def click(selector):
    overlay(f"document.querySelector('{selector}').click()")


# 1. After an update: it comes, small, at the page's lower right corner.
b.use("settings-d-star")
seed({"whatsnew.seen": "0.0.1"})
b.launch(env={"ORIEL_STAR": "update"})
b.wait_for(card_up, within=20, what="the star card")
r = star()["region"]
t.ok(r["width"] <= 340 and r["height"] <= 150, f"small ({r['width']}x{r['height']})")
t.ok(overlay("document.querySelector('.star-title').textContent") == "Enjoying Oriel?", "says Enjoying Oriel?")
t.ok(overlay("document.querySelector('.star-go').textContent") == "Star on GitHub", "Star on GitHub")
t.ok(overlay("document.querySelector('.star-coffee').textContent") == "Buy me a coffee", "Buy me a coffee")
t.ok(not overlay("document.hasFocus()"), "takes no focus from the page")
# 2. The X: away, not done (the next update asks again).
click(".star-x")
b.wait_for(lambda: not star()["shown"], what="put away")
t.ok(not star()["done"], "the X doesn't end it for good")
b.quit()

# 3. A fresh install, or the same version again: never.
b.use("settings-d-star-fresh")
b.launch(env={"ORIEL_STAR": "update"})
time.sleep(9)
t.ok(star()["asked"] == 0, "not on a fresh install")
b.quit()
b.use("settings-d-star-fresh", wipe=False)
b.launch(env={"ORIEL_STAR": "update"})
time.sleep(9)
t.ok(star()["asked"] == 0, "not without an update")
b.quit()

# 4. Buy me a coffee: its page opens, the card is gone, and never again.
b.use("settings-d-star-never")
b.launch(env={"ORIEL_STAR": "1"})
b.wait_for(card_up, within=20, what="the star card")
click(".star-coffee")
b.wait_for(lambda: not star()["shown"], what="gone")
b.wait_for(lambda: any("buymeacoffee.com/charstudio" in (x.get("url") or "") for x in b.window()["tabs"]), what="the coffee page's tab")
t.ok(star()["done"], "Buy me a coffee is for good")
b.quit()
b.use("settings-d-star-never", wipe=False)
b.launch(env={"ORIEL_STAR": "1"})
time.sleep(4)
t.ok(star()["asked"] == 0, "and it doesn't come back")
b.quit()

# 5. Star on GitHub: the repository in a tab, never asked again.
b.use("settings-d-star-go")
b.launch(env={"ORIEL_STAR": "1"})
b.wait_for(card_up, within=20, what="the star card")
click(".star-go")
b.wait_for(lambda: any("github.com/carpaaaaa/oriel" in (x.get("url") or "") for x in b.window()["tabs"]), what="the repository's tab")
t.ok(star()["done"] and not star()["shown"], "starred: gone for good")
b.quit()

# 6. It gives way: the zoom capsule takes its place.
b.use("settings-d-star-way")
b.launch(env={"ORIEL_STAR": "1"})
b.cmd("tab.new", url="about:blank")
b.wait_for(card_up, within=20, what="the star card")
b.cmd("view.zoom", by=1.25)
b.wait_for(lambda: not star()["shown"], what="the capsule in its place")
t.ok(True, "anything else wanting the overlay takes its place")
t.ok(not b.state().get("errors"), "no error in the main process")
b.quit()
# 7. Centred and clean, in every text size: the card fits its content, the region
# fits the card, the padding is the same above and below, the buttons end where
# the card's padding does, the star and the X sit on the title's line.
MEASURE = """JSON.stringify((() => { const q = s => document.querySelector(s).getBoundingClientRect(); const c = q('.star-card'), g = q('.star-glyph'), t = q('.star-title'), x = q('.star-x'), go = q('.star-go'), co = q('.star-coffee');
  return {card: [c.left, c.top, c.right, c.bottom], glyph: g.top + g.height / 2, title: t.top + t.height / 2, x: x.top + x.height / 2, goTop: go.top, goBottom: go.bottom, coRight: co.right, goLeft: go.left, coLeft: co.left, glyphTop: g.top, vw: innerWidth, vh: innerHeight} })())"""


def measured():
    return json.loads(overlay(MEASURE))


def fitted(label):
    import math
    time.sleep(0.6)
    m = measured()
    c = m["card"]
    region = star()["region"]
    t.ok(abs(region["width"] - (math.ceil(c[2] - c[0]) + 24)) <= 1 and abs(region["height"] - (math.ceil(c[3] - c[1]) + 24)) <= 1,
         f"{label}: the region is the card and its margin ({region['width']}x{region['height']} for {c[2]-c[0]:.0f}x{c[3]-c[1]:.0f})")
    t.ok(c[0] >= 0 and c[1] >= 0 and c[2] <= m["vw"] and c[3] <= m["vh"], f"{label}: the card is whole inside its region")
    above, below = m["glyphTop"] - c[1], c[3] - m["goBottom"]
    t.ok(abs(above - below) <= 1.5, f"{label}: the same room above and below ({above:.1f}, {below:.1f})")
    t.ok(abs((c[2] - 10) - m["coRight"]) <= 1, f"{label}: the buttons end where the padding does ({c[2] - 10:.1f}, {m['coRight']:.1f})")
    t.ok(abs(m["glyph"] - m["title"]) <= 1.5 and abs(m["x"] - m["title"]) <= 2, f"{label}: the star and the X on the title's line ({m['glyph']:.1f}, {m['x']:.1f}, {m['title']:.1f})")
    t.ok(m["goLeft"] < m["coLeft"] and m["coLeft"] - m["goTop"] * 0 >= m["goLeft"], f"{label}: the buttons side by side")


b.use("settings-d-star-size")
b.launch(env={"ORIEL_STAR": "1"})
b.cmd("tab.new", url="data:text/html,<body>page</body>")
b.wait_for(card_up, within=20, what="the star card")
fitted("100%")
for scale in (1.15, 1.4):
    b.cmd("settings.set", id="text.scale", value=scale)
    star(show=True)
    b.wait_for(card_up, within=10, what="the card again")
    fitted(f"{round(scale * 100)}%")
# Its size changing while it is up (the slider moved): the region follows.
b.cmd("settings.set", id="text.scale", value=1)
fitted("back to 100%, live")
# The window changing size under it: it stays in the page's corner, whole.
b.cmd("window.maximize")
time.sleep(1.2)
w = b.window()
r = star()["region"]
cb = w["bounds"]
t.ok(r and r["x"] >= 0 and r["y"] >= 0 and r["x"] + r["width"] <= cb["width"] and r["y"] + r["height"] <= cb["height"], f"the window maximized, the card is still inside it ({r}, window {cb['width']}x{cb['height']})")
t.ok(not b.state().get("errors"), "no error in the main process")
b.quit()
t.done()

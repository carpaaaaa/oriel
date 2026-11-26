#!/usr/bin/env python3
"""The star card after an update (settings/star.ts): once per update, never on
a fresh install; small, in the page's lower right corner, taking no focus;
Star on GitHub opens the repository and Don't ask again end it for good, the
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
t.ok(overlay("document.querySelector('.star-never').textContent") == "Don't ask again", "Don't ask again")
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

# 4. Don't ask again: gone, and never again.
b.use("settings-d-star-never")
b.launch(env={"ORIEL_STAR": "1"})
b.wait_for(card_up, within=20, what="the star card")
click(".star-never")
b.wait_for(lambda: not star()["shown"], what="gone")
t.ok(star()["done"], "Don't ask again is for good")
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
t.done()

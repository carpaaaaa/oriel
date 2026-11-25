#!/usr/bin/env python3
"""The bookmark button while the column goes away with Ctrl+S and comes
back (studio/01 §5.29, studio/05 §3.2): the column is drawn for as long as
it slides (chrome/slide.ts), and a window that draws no frames (covered,
the display asleep) holds the slide at its start, the column still there.
All that time the button, up beside the window's buttons, stays clear of
back, forward and reload: measured many times during the slide, with
Classic and Inline, the column on the right and on the left."""
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b  # noqa: E402

b.use("data-bookmarks-fold")
b.launch(env={"SEARCH_LOOK": "light"})
b.cmd("prefs.set", key="fold.fullScreen", value=False)  # these test folding alone, not full screen with it

t = b.T()
time.sleep(0.6)

f = b.call({"do": "window.frame"})["frame"]
work = f["workArea"]
b.call({"do": "window.place", "visual": True, "x": work["x"] + 40, "y": work["y"] + 30,
        "width": min(1100, work["width"] - 120), "height": min(720, work["height"] - 100)})
time.sleep(0.4)

# The button against everything in the column's band and the window's
# buttons, as drawn now (the column may be part way out).
SAMPLE = """JSON.stringify((() => {
  const box = e => e.getBoundingClientRect()
  const d = [...document.querySelectorAll('.bookmark-door')].find(e => box(e).width > 0)
  if (!d) return { door: false }
  const r = box(d)
  const hits = [...document.querySelectorAll('.sidebar .band button, .window > .caption-buttons button')].filter(e => e !== d).map(box)
    .filter(o => r.x < o.right - .5 && o.x < r.right - .5 && r.y < o.bottom - .5 && o.y < r.bottom - .5)
  const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
  // part way across, the column passes under the window's buttons and this one alike
  const shift = parseFloat(document.querySelector('.window').style.getPropertyValue('--fold-shift')) || 0
  return { door: true, x: r.x, hits: hits.map(o => ({ x: o.x, y: o.y })), top: !!top && (top === d || d.contains(top)),
    column: !!document.querySelector('.window .sidebar'), moving: Math.abs(shift) > .5 }
})())"""


def watch(name, folded):
    """Fold or unfold, sampling the button as fast as the bench can."""
    b.cmd("sidebar.fold", folded=folded)
    seen, held, bad = 0, 0, []
    end = time.time() + 1.2
    while time.time() < end:
        s = json.loads(b.ui(SAMPLE))
        if s.get("moving"):
            continue
        seen += 1
        held += 1 if s["column"] and folded else 0
        if not s["door"] or s["hits"] or not s["top"]:
            bad.append(s)
    t.ok(seen and not bad, f"{name}: the button clear and uncovered in all {seen} looks with the column in its place"
         f"{f' ({held} with it held there, folded)' if held else ''} ({bad[:2]})")


for style in ("classic", "inline"):
    b.cmd("prefs.set", key="window.buttons", value=style)
    for side in ("right", "left"):
        b.cmd("settings.set", id="tabs.layout", value=side)
        time.sleep(0.6)
        S = f"{style.title()}, the column on the {side}"
        watch(f"{S}, going away (Ctrl+S)", True)
        watch(f"{S}, coming back", False)
        # Slide off (sidebar.slides): the ease-in/ease-out curves instead of the springs.
        b.cmd("prefs.set", key="sidebar.slides", value=True)
        watch(f"{S}, Slide the column in and out, going away", True)
        watch(f"{S}, Slide the column in and out, coming back", False)
        b.cmd("prefs.set", key="sidebar.slides", value=False)

b.cmd("prefs.set", key="window.buttons", value="inline")
b.cmd("settings.set", id="tabs.layout", value="left")
t.done()

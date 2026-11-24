#!/usr/bin/env python3
"""An empty page in a Split View wears the blank tab's theme, as a lone empty
tab does; the field and Settings' door only in the pane with the keys."""
import sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b

b.use("themes-split")
b.launch()
t = b.T()

b.cmd("prefs.set", key="home.theme", value="gradient")
b.cmd("field.commit", text="data:text/html,<title>left</title><body>left")
b.wait_for(lambda: b.active()["title"] == "left", what="page")
page = b.active()["id"]

# Split the page: the new pane is an empty page with the keys.
b.cmd("split.toggle", id=page)
b.wait_for(lambda: b.window()["splits"], what="a split")
time.sleep(1.2)

def panes():
    return b.ui("""[...document.querySelectorAll('.pane[data-tab]')].map(p => ({
      id: p.dataset.tab,
      theme: !!p.querySelector('.empty-page canvas, .empty-page img, .empty-page [class*="wall"], .empty-page [class*="theme"]'),
      field: !!p.querySelector('.empty-page .field'),
      door: !!p.querySelector('.empty-page [title="Settings"]'),
      w: Math.round(p.getBoundingClientRect().width)
    }))""")

ps = panes()
empty = [p for p in ps if p["id"] != page]
t.ok(len(ps) == 2 and len(empty) == 1, f"two panes, one empty: {ps}")
if empty:
    e = empty[0]
    t.ok(e["theme"], "the empty pane wears the theme")
    t.ok(e["field"], "the field is in the empty pane with the keys")
    t.ok(e["door"], "Settings' door is there too")

# Keys to the page: the empty pane keeps its theme, without the field.
b.cmd("split.focus", side="other")
time.sleep(0.8)
ps = panes()
e = next((p for p in ps if p["id"] != page), None)
t.ok(e and e["theme"], "without the keys the empty pane still wears the theme")
t.ok(e and not e["field"], "the field goes with the keys")

# Theme off: the empty pane is plain again.
b.cmd("prefs.set", key="home.theme", value="off")
time.sleep(0.8)
e = next((p for p in panes() if p["id"] != page), None)
t.ok(e and not e["theme"], "theme off: the empty pane is plain")
t.done()

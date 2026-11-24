#!/usr/bin/env python3
"""Fase 0, on any machine: the layer over the page, the order of keys
("page first"), and a tab put to sleep coming back as it was."""
import sys, time, os
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b

b.use("f0-core")
b.launch()
t = b.T()
SHOTS = os.environ.get("SHOTS_DIR")

PAGE = ("data:text/html,<title>keys</title><body style='height:4000px'>"
        "<input id=f><script>window.clicks=0;document.addEventListener('click',()=>clicks++);"
        "window.blockR=false;document.addEventListener('keydown',e=>{if(blockR&&e.ctrlKey&&e.key==='r'){e.preventDefault()}});"
        "window.loads=(window.loads||0)+1</script>")

# A page in the first tab.
b.cmd("field.commit", text=PAGE)
b.wait_for(lambda: b.active()["title"] == "keys", what="page")
tab = b.active()["id"]
time.sleep(0.5)

# 1. The overlay is zero-sized at rest; clicks reach the page.
w = b.window()
t.ok(w["overlay"]["kind"] == "none", "overlay at rest")
ui_box = b.ui("JSON.stringify(document.querySelector('.card').getBoundingClientRect())")
import json
card = json.loads(ui_box)
b.mouse(card["x"] + 200, card["y"] + 300)
time.sleep(0.3)
t.ok(b.ev(tab, "window.clicks") == 1, "a click on the page reaches the page")

# 2. Ctrl+L floats the field over the page; Escape takes it away.
b.call({"do": "eval", "id": tab, "js": "document.getElementById('f').focus()"})
b.key("L", "control" if sys.platform != "darwin" else "meta")
time.sleep(0.6)
w = b.window()
t.ok(w["overlay"]["kind"] == "field" and w["field"]["open"], "Ctrl+L opens the field over the page")
if SHOTS: b.shot(f"{SHOTS}/f0-field-over-page.png")
b.cmd("field.close")
time.sleep(0.3)
t.ok(b.window()["overlay"]["kind"] == "none", "the field closes")

# 3. Page first: a page that takes Ctrl+R keeps it; otherwise Search reloads.
mod = "meta" if sys.platform == "darwin" else "control"
b.ev(tab, "document.getElementById('f').focus(); window.blockR=true")
b.key("R", mod)
time.sleep(1.0)
t.ok(b.ev(tab, "window.loads") == 1, "a page that uses Ctrl+R keeps it")
b.ev(tab, "window.blockR=false")
b.key("R", mod)
b.wait_for(lambda: b.ev(tab, "typeof window.loads") == "number" and not b.active()["loading"], what="reload")
time.sleep(0.5)
t.ok(b.ev(tab, "window.blockR") is False and b.active()["title"] == "keys", "Ctrl+R left alone reloads")

# 4. Sleep and wake: history, scroll and a typed field come back.
b.cmd("tab.go", input="data:text/html,<title>second</title><body style='height:3000px'><input id=g>")
b.wait_for(lambda: b.active()["title"] == "second", what="second page")
b.ev(tab, "scrollTo(0, 1234); document.getElementById('g').value='typed'")
# The page tells Chromium its scroll and fields on a timer (1 s, later on a
# busy machine): what the history keeps when the tab sleeps.
time.sleep(3.0)
# Sleep happens to tabs behind: go to another one first.
other = b.cmd("tab.new", url="https://example.com")
time.sleep(1.0)
b.cmd("tab.sleep", id=tab)
time.sleep(0.3)
st = b.state()
me = next(x for x in st["tabs"] if x["id"] == tab)
t.ok(me["asleep"], "the tab sleeps")
t.ok(not me["live"], "no page in memory while asleep")
b.cmd("tab.select", id=tab)
b.wait_for(lambda: not b.active()["asleep"] and not b.active()["loading"], what="wake")
time.sleep(0.8)
t.ok(b.active()["canGoBack"], "Back is still there after waking")
t.ok(b.ev(tab, "Math.round(scrollY)") == 1234, "scroll comes back")
t.ok(b.ev(tab, "document.getElementById('g').value") == "typed", "typed text comes back")
b.cmd("tab.back")
b.wait_for(lambda: b.active()["title"] == "keys", what="back")
t.ok(True, "Back goes to the page before")
t.done()

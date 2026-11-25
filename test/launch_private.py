#!/usr/bin/env python3
"""A private tab you can find (studio/01 §2.35, §3.7, §1.9): Ctrl+Shift+N and
the taskbar icon's Jump List (right click: New Window, New Private Tab) make
one, and the blank page of a private tab says "A tab that keeps nothing".
The Jump List runs Oriel.exe with --new-window or --private-tab; a running
Oriel hears it as a second launch. (The list itself is Windows' to show; here
the flags and what they do.)"""
import sys
import time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b

b.use("launch-private")
b.launch()
t = b.T()

launch = lambda *args: b.call({"do": "app.launch", "args": list(args)}).get("action")
t.ok(launch("--private-tab") == "privateTab", "--private-tab reads as New Private Tab")
t.ok(launch("--new-window") == "window", "--new-window reads as New Window")
t.ok(launch() is None and launch("https://example.com/") is None, "a link or nothing is no Jump List task")

shy = lambda: [x for x in b.state()["tabs"] if x.get("shy")]
note = lambda: b.ui("(() => { const n = document.querySelector('.private-note'); return n ? n.textContent : null })()")

t.ok(not shy() and note() is None, "at the start: no private tab, no note on the blank page")
first = b.active()["id"]

# The Jump List's New Private Tab, with Oriel already running.
b.call({"do": "app.launch", "second": True, "args": ["--private-tab"]})
b.wait_for(lambda: len(shy()) == 1, what="a private tab")
a = b.active()
t.ok(a and a.get("shy") and a.get("empty"), "a second launch with --private-tab opens a private tab in front")
text = b.wait_for(note, what="the note")
t.ok("A tab that keeps nothing" in text, f"its blank page says so ({text})")
b.call({"do": "app.launch", "second": True, "args": ["--private-tab"]})
time.sleep(0.8)
t.ok(len(shy()) == 1, "never two empty private tabs")

# A normal blank tab has no note.
b.cmd("tab.select", id=first)
b.wait_for(lambda: not (b.active() or {}).get("shy") and (b.active() or {}).get("empty"), what="a normal blank tab")
b.wait_for(lambda: note() is None, what="no note on a normal tab")
t.ok(True, "a normal new tab has no note")

# Ctrl+Shift+N: a private tab, with its note.
b.key("n", "ctrl", "shift")
b.wait_for(lambda: (b.active() or {}).get("shy"), what="Ctrl+Shift+N")
t.ok(bool(b.wait_for(note, what="the note again")), "Ctrl+Shift+N makes a private tab, and it says so")

# Once it has a page, the note goes.
b.cmd("tab.go", id=b.active()["id"], input="data:text/html,<title>x</title>hello")
b.wait_for(lambda: (b.active() or {}).get("title") == "x", what="a page in it")
b.wait_for(lambda: note() is None, what="the note gone")
t.ok(True, "with a page in it the note is gone")

# New Window from the Jump List.
before = len(b.state()["windows"])
b.call({"do": "app.launch", "second": True, "args": ["--new-window"]})
b.wait_for(lambda: len(b.state()["windows"]) == before + 1, what="a new window")
t.ok(True, "a second launch with --new-window opens a window")
t.done()

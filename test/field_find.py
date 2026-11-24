#!/usr/bin/env python3
"""Find on Page (studio/03 §6.1, Find.swift): Ctrl+F (the page's first),
counting "1 of 3", Return and Shift+Return, F3, No matches in red, Match
case, Escape putting back the page's own selection, open from tab to tab,
and the field raised over it giving it back."""
import json, sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b

b.use("field-find")
b.launch()
t = b.T()

PAGE = ("data:text/html,<title>fruit</title><body><p id=p>apple banana Apple cherry apple</p><p id=q>kept</p>"
        "<script>window.keepF=false;document.addEventListener('keydown',e=>{if(keepF&&e.ctrlKey&&e.key==='f'){e.preventDefault()}})</script>")
b.cmd("field.commit", text=PAGE)
b.wait_for(lambda: b.active()["title"] == "fruit", what="page")
tab = b.active()["id"]
time.sleep(0.4)


def find():
    return b.window().get("find") or {}


def overlay():
    return b.window()["overlay"]["kind"]


def k(key, *mods, to="page"):
    """A key to one view: the page, the interface or the overlay (a test
    window in the background has the keys nowhere)."""
    b.call({"do": "field.key", "key": key, "modifiers": list(mods), "to": to})


def typed_in_find(text):
    for ch in text:
        k(ch, to="overlay")
        time.sleep(0.04)


# the page's own selection, to be put back
b.ev(tab, "(() => { const r = document.createRange(); r.selectNodeContents(document.getElementById('q')); getSelection().removeAllRanges(); getSelection().addRange(r); return true })()")

# a page that uses Ctrl+F keeps it
b.ev(tab, "window.keepF = true")
k("F", "control")
time.sleep(0.6)
t.ok(not find().get("open"), "a page that uses Ctrl+F keeps it")
b.ev(tab, "window.keepF = false")

# Ctrl+F left alone: the pill, in the overlay, with the keys
k("F", "control")
b.wait_for(lambda: find().get("open") and overlay() == "find", what="find bar")
t.ok(True, "Ctrl+F opens Find on Page in the overlay")
ph = b.ui("document.querySelector('.find-field')?.placeholder", root="overlay")
t.ok(ph == "Find on page", f"placeholder Find on page: {ph!r}")

typed_in_find("apple")
b.wait_for(lambda: find().get("status") == "1 of 3", what="1 of 3")
t.ok(not find()["missed"], "apple: 1 of 3, case ignored")
k("Return", to="overlay")
b.wait_for(lambda: find().get("status") == "2 of 3", what="2 of 3")
t.ok(True, "Return: the next match")
k("Return", "shift", to="overlay")
b.wait_for(lambda: find().get("status") == "1 of 3", what="back to 1 of 3")
t.ok(True, "Shift+Return: the one before")
k("F3")
b.wait_for(lambda: find().get("status") == "2 of 3", what="F3")
t.ok(True, "F3: the next match")
k("F3", "shift", to="overlay")
b.wait_for(lambda: find().get("status") == "1 of 3", what="Shift+F3")
t.ok(True, "Shift+F3: the one before")
b.cmd("find.step", forward=True)
b.cmd("find.step", forward=True)
b.cmd("find.step", forward=True)
b.wait_for(lambda: find().get("status") == "1 of 3", what="wrap")
t.ok(True, "past the last, round to the first")

# Match case
b.cmd("find.options", matchCase=True)
b.wait_for(lambda: find().get("status", "").endswith("of 2"), what="match case")
t.ok(find()["matchCase"], "Match case: apple twice")
b.cmd("find.options", matchCase=False)

# no matches: said in red
b.cmd("find.input", text="zzz")
b.wait_for(lambda: find().get("status") == "No matches", what="no matches")
t.ok(find()["missed"], "No matches, the pill's edge in red")
missed = b.ui("document.querySelector('.find-pill').classList.contains('missed')", root="overlay")
t.ok(missed, "the pill shows it")
b.cmd("find.input", text="banana")
b.wait_for(lambda: find().get("status") == "1 of 1", what="banana")

# open from tab to tab, asking the new page
b.cmd("tab.new", url="data:text/html,<title>two</title><p>banana banana</p>")
b.wait_for(lambda: b.active()["title"] == "two", what="second page")
try:
    b.wait_for(lambda: find().get("status") == "1 of 2" and overlay() == "find", what="find on the new tab")
except AssertionError:
    print("   ", find(), overlay())
    raise
t.ok(True, "it stays open on another tab and counts there")
b.cmd("tab.select", id=tab)
b.wait_for(lambda: find().get("status") == "1 of 1", what="back")

# the field raised over it, then put away: Find is back
k("L", "control")
b.wait_for(lambda: overlay() == "field", what="field over find")
t.ok(find()["open"], "Ctrl+L: the field over the page, Find still open")
k("Escape", to="overlay")
b.wait_for(lambda: overlay() == "find", what="find back")
t.ok(True, "Escape: the field goes, Find comes back")

# closing it puts back the page's own selection
b.cmd("find.close")
time.sleep(0.4)
t.ok(not find()["open"] and overlay() == "none", "closed: the overlay is given back")
sel = b.ev(tab, "getSelection().toString()")
t.ok(sel == "kept", f"the page's own selection is put back: {sel!r}")

k("F", "control")
b.wait_for(lambda: find().get("open"), what="find again")
k("Escape")
b.wait_for(lambda: not find().get("open"), what="escape from the page")
t.ok(True, "Escape closes it, from wherever the keys are")

# a blank tab has nothing to find
b.cmd("tab.new")
time.sleep(0.3)
k("F", "control", to="ui")
time.sleep(0.4)
t.ok(not find()["open"], "a blank tab: Ctrl+F does nothing")

t.done()

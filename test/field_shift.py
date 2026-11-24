#!/usr/bin/env python3
"""Shift+Return (studio/03 §1.4, Browser.submitToShiftEngine): what was
typed, exactly, searched with the engine of Settings › Browsing ›
Shift-Return searches with; the row walked to, the grey ending, a site in
the field and a site shortcut are passed over; with no engine chosen it is
Return. Real key events."""
import sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b

b.use("field-shift")
b.launch()
t = b.T()
time.sleep(1.0)
for _ in range(3):
    b.call({"do": "data.visit", "url": "https://github.com/", "title": "GitHub"})


def key(k, *mods, to="ui"):
    b.call({"do": "field.key", "key": k, "modifiers": list(mods), "to": to})


def typed(word, to="ui"):
    for ch in word:
        key(ch, to=to)
        time.sleep(0.12)
    time.sleep(0.4)


def blank():
    b.cmd("tab.new")
    time.sleep(0.5)


def went(url, what):
    b.wait_for(lambda: b.active()["url"] == url, what=what)
    return True


# none chosen: Shift+Return is Return
typed("cats")
key("Return", "shift")
t.ok(went("https://www.google.com/search?q=cats", "Return"), "no engine chosen: Shift+Return does what Return does")

# DuckDuckGo chosen: the words as typed, not the grey ending
b.cmd("prefs.set", key="search.shift", value="duckduckgo")
blank()
typed("gi")
v = b.ui("document.querySelector('.field input').value")
t.ok(v == "github.com", f"the field offers github.com: {v!r}")
key("Return", "shift")
t.ok(went("https://duckduckgo.com/?q=gi", "shift engine"), "Shift+Return: gi, as typed, to DuckDuckGo (the ending passed over)")

# a row walked to is passed over
blank()
typed("gi")
key("Down")
time.sleep(0.3)
key("Return", "shift")
t.ok(went("https://duckduckgo.com/?q=gi", "past the row"), "the row walked to is passed over")

# a site shortcut is passed over
b.cmd("prefs.set", key="search.keywords", value=[{"keyword": "yt", "template": "https://www.youtube.com/results?search_query=%s"}])
blank()
typed("yt cats")
key("Return", "shift")
t.ok(went("https://duckduckgo.com/?q=yt%20cats", "past the shortcut"), "a site shortcut is passed over: yt cats to DuckDuckGo")

# a site in the field is passed over too (a shortcut's site: no ready-made one)
b.cmd("prefs.set", key="search.keywords", value=[{"keyword": "red", "template": "https://www.reddit.com/search/?q=%s"}])
blank()
typed("red")
key("Tab")
time.sleep(0.3)
typed("dogs")
t.ok(b.window()["field"]["chip"]["name"] == "Reddit", "Reddit in the field")
key("Return", "shift")
t.ok(went("https://duckduckgo.com/?q=dogs", "past the chip"), "a site in the field is passed over")

# a custom engine, as Settings writes it
b.cmd("prefs.set", key="search.shift", value="custom")
b.cmd("prefs.set", key="search.shiftCustom", value="example.org/find?w={searchTerms}")
blank()
typed("owls")
key("Return", "shift")
t.ok(went("https://example.org/find?w=owls", "custom"), "a custom Shift-Return engine")

# over a page, the page goes there
key("L", "control", to="page")
b.wait_for(lambda: b.window()["overlay"]["kind"] == "field", what="field over the page")
time.sleep(0.3)
key("Backspace", to="overlay")
typed("bats", to="overlay")
key("Return", "shift", to="overlay")
t.ok(went("https://example.org/find?w=bats", "over a page"), "over a page, in that tab")

# nothing typed: refused
blank()
before = b.window()["field"]["refused"]
key("Return", "shift")
time.sleep(0.3)
t.ok(b.window()["field"]["refused"] == before + 1 and b.active()["empty"], "nothing typed: refused")

t.done()

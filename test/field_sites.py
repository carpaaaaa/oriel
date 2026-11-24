#!/usr/bin/env python3
"""Searching a site with Tab, as the user wants it in Oriel (not the Mac's
default): every site off until turned on, one by one, in Settings ›
Browsing › Site shortcuts; until then typing its name offers nothing more.
The chip, once there, shows an X under the pointer that takes the site out
and keeps what was typed and the keys; Backspace on the empty field and
Escape still take it out (studio/03 §1.4, §1.9). Real key events."""
import json, sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b

b.use("field-sites")
b.launch()
t = b.T()
time.sleep(1.0)


def key(k, to="ui", *mods):
    b.call({"do": "field.key", "key": k, "modifiers": list(mods), "to": to})


def typed(word, to="ui"):
    for ch in word:
        key(ch, to)
        time.sleep(0.12)
    time.sleep(0.3)


def field():
    return b.window()["field"]


def ui(js, root="chrome"):
    return b.ui(js, root=root)


def ev(tab, js):
    try:
        return b.ev(tab, js)
    except RuntimeError:  # the Settings page not there yet
        return None


def clear():
    # Escape: first the row walked to, then the words (App.swift take).
    for _ in range(3):
        if not field()["text"] and field()["selected"] == -1:
            return
        key("Escape")
        time.sleep(0.3)


# off by default: nothing offered, Tab walks the list instead
t.ok(b.state()["prefs"].get("search.sites") == [], "no site is on to begin with")
for word in ("github", "red", "yt", "ama", "wiki"):
    typed(word)
    t.ok(field().get("offer") is None and not ui("!!document.querySelector('.field-offer')"), f"{word!r}: nothing offered while its site is off")
    clear()
typed("gith")
key("Tab")
time.sleep(0.3)
t.ok(field().get("chip") is None, "Tab with no site on puts nothing in the field")
clear()

# Settings › Browsing › Site shortcuts: a switch for each site
b.cmd("app.settings")
b.wait_for(lambda: any(x.get("internal") == "settings" for x in b.window()["tabs"]), what="Settings tab")
tab = next(x for x in b.window()["tabs"] if x.get("internal") == "settings")["id"]
b.cmd("settings.open", page="browsing")
b.wait_for(lambda: ev(tab, "document.querySelectorAll('.kw-site-row').length"), what="site switches")
names = ev(tab, "[...document.querySelectorAll('.kw-site-row')].map(e => e.dataset.site)")
t.ok(names[:3] == ["Google", "Reddit", "YouTube"] and len(names) == 16, f"the sixteen sites, in the Mac's order: {names}")
t.ok(ev(tab, "[...document.querySelectorAll('.kw-site-row .st-sw')].every(s => !s.classList.contains('on'))"), "every switch off")
ev(tab, "document.querySelector(\".kw-site-row[data-site='GitHub'] .st-sw\").click()")
b.wait_for(lambda: b.state()["prefs"].get("search.sites") == ["GitHub"], what="GitHub on")
t.ok(True, "a switch turns one site on")

# back on a blank tab: GitHub is offered, Reddit still isn't
b.cmd("tab.new")
time.sleep(0.5)
typed("gith")
f = field()
t.ok(f.get("offer") and f["offer"]["name"] == "GitHub", "GitHub, turned on, is offered")
clear()
typed("red")
t.ok(field().get("offer") is None, "Reddit, still off, is not")
clear()

# the chip and its X
typed("gith")
f = field()
if not f.get("offer"):
    print("   before Tab:", {k: f.get(k) for k in ("text", "shown", "offer", "selected")}, ui("document.querySelector('.field input').value"))
key("Tab")
time.sleep(0.3)
t.ok((field()["chip"] or {}).get("name") == "GitHub", "Tab puts GitHub in the field")
typed("cats")
x = json.loads(ui("JSON.stringify(document.querySelector('.field-chip-x').getBoundingClientRect())"))
t.ok(ui("getComputedStyle(document.querySelector('.field-chip-x')).opacity") == "0", "no X until the pointer is on the chip")
b.call({"do": "field.hover", "x": x["x"] + x["width"] / 2, "y": x["y"] + x["height"] / 2})
time.sleep(0.4)
b.wait_for(lambda: ui("getComputedStyle(document.querySelector('.field-chip-x')).opacity") == "1", within=3, what="the X")
t.ok(ui("getComputedStyle(document.querySelector('.field-chip-x')).opacity") == "1", "the pointer on the chip: the X")
t.ok(ui("getComputedStyle(document.querySelector('.field-chip-lens')).opacity") == "0", "...in the lens's place")
b.call({"do": "field.hover", "x": x["x"] + x["width"] / 2, "y": x["y"] + x["height"] / 2, "click": True})
time.sleep(0.4)
f = field()
v = json.loads(ui("JSON.stringify({ v: document.querySelector('.field input').value, f: document.activeElement === document.querySelector('.field input'), chip: !!document.querySelector('.field-chip') })"))
t.ok(f["chip"] is None and not v["chip"], "a click on the X takes the site out")
t.ok(v["v"] == "cats" and f["text"] == "cats", f"what was typed stays: {v['v']!r}")
t.ok(v["f"], "the keys stay in the field")
t.ok(f["placeholder"] == "Enter a web address", "the field is the plain field again")
clear()

# Backspace on the empty field takes it out too
typed("gith")
key("Tab")
time.sleep(0.3)
key("Backspace")
time.sleep(0.3)
t.ok(field()["chip"] is None, "Backspace on the empty field takes the site out")

# over a page, Escape takes the chip out and leaves the field
b.cmd("field.commit", text="data:text/html,<title>p</title><p>page")
b.wait_for(lambda: b.active()["title"] == "p", what="page")
time.sleep(0.4)
key("L", "page", "control")
b.wait_for(lambda: b.window()["overlay"]["kind"] == "field", what="field over the page")
time.sleep(0.3)
key("Backspace", "overlay")
typed("gith", "overlay")
key("Tab", "overlay")
time.sleep(0.3)
f = field()
t.ok((f["chip"] or {}).get("name") == "GitHub", f"over a page too: {f['text']!r} {f.get('offer')} {ui('document.querySelector(\'.field input\')?.value', root='overlay')!r}")
key("Escape", "overlay")
time.sleep(0.3)
t.ok(field()["chip"] is None and field()["open"], "Escape takes the site out, the field stays")

t.done()

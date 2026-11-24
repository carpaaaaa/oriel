#!/usr/bin/env python3
"""The address in the tab itself (studio/01 §5.18, studio/03 §1.4;
Browser.beginTabEdit, TabAddressField, TabOffers.swift): a click on the tab
you're on turns its row into its address, selected whole, in the row and
not over the page; what is typed gets the places in a list under the tab;
Escape gives the title back; Return goes there in the same tab; a click
elsewhere keeps what was typed. The column, then tabs across the top."""
import json, sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b

b.use("field-tabedit")
b.launch()
t = b.T()
time.sleep(1.0)
for _ in range(3):
    b.call({"do": "data.visit", "url": "https://github.com/", "title": "GitHub"})

PAGE = "data:text/html,<title>here</title><p>a page"


def key(k, *mods, to="ui"):
    b.call({"do": "field.key", "key": k, "modifiers": list(mods), "to": to})


def rect(sel, root="chrome"):
    v = b.ui(f"(() => {{ const r = document.querySelector({json.dumps(sel)})?.getBoundingClientRect(); return r ? JSON.stringify({{ x: r.x, y: r.y, w: r.width, h: r.height }}) : null }})()", root=root)
    return json.loads(v) if v else None


def click(sel, root="chrome"):
    r = rect(sel, root)
    b.call({"do": "field.hover", "x": r["x"] + r["w"] / 2, "y": r["y"] + r["h"] / 2, "click": True, "to": root if root == "overlay" else "ui"})
    time.sleep(0.4)


def typed(word):
    for ch in word:
        key(ch)
        time.sleep(0.12)
    time.sleep(0.4)


def editing():
    return b.window().get("tabEdit")


def run(host, live_sel, label):
    b.cmd("field.commit", text=PAGE)
    b.wait_for(lambda: b.active()["title"] == "here", what="page")
    tab = b.active()["id"]
    url = b.active()["url"]
    time.sleep(0.5)
    # a click on the tab you're on: its address, in it
    click(live_sel)
    b.wait_for(lambda: editing() and rect(f"{live_sel} .field-tab-input"), what="field in the tab")
    row, field = rect(live_sel), rect(f"{live_sel} .field-tab-input")
    inside = field["x"] >= row["x"] and field["x"] + field["w"] <= row["x"] + row["w"] + 0.5 and field["y"] >= row["y"] and field["y"] + field["h"] <= row["y"] + row["h"]
    t.ok(inside, f"{label}: the field is in the tab, within its edges: {field} in {row}")
    t.ok(b.window()["overlay"]["kind"] != "field", f"{label}: not the field over the middle of the page")
    v = json.loads(b.ui(f"JSON.stringify((i => ({{ v: i.value, s: i.selectionStart, e: i.selectionEnd, f: document.activeElement === i, fs: getComputedStyle(i).fontSize }}))(document.querySelector('{live_sel} .field-tab-input')))"))
    t.ok(v["v"] == url and v["s"] == 0 and v["e"] == len(url) and v["f"], f"{label}: its address, selected whole, with the keys: {v['v'][:40]!r}")
    t.ok(v["fs"] == "12.5px", f"{label}: 12.5, as the tab's title")
    # Escape: the title back
    key("Escape")
    b.wait_for(lambda: not editing(), what="title back")
    t.ok(rect(f"{live_sel} .field-tab-input") is None and b.ui(f"!!document.querySelector('{live_sel} .title')"), f"{label}: Escape gives the title back")
    # typing: the list under the tab
    click(live_sel)
    b.wait_for(lambda: editing(), what="edit again")
    typed("gi")
    v = b.ui(f"document.querySelector('{live_sel} .field-tab-input').value")
    t.ok(v == "github.com", f"{label}: the grey ending as in the field: {v!r}")
    b.wait_for(lambda: b.call({"do": "field.views"})["layer"] == "tabOffers", what="the list")
    views = b.call({"do": "field.views"})
    row = rect(live_sel)
    lst = rect(".field-taboffers", root="overlay")
    top = views["overlay"]["y"] + lst["y"]
    left = views["overlay"]["x"] + lst["x"]
    row_bottom = views["ui"]["y"] + row["y"] + row["h"]
    t.ok(row_bottom - 4 <= top <= row_bottom + 12, f"{label}: the list hangs under the tab ({top:.0f} under {row_bottom:.0f})")
    t.ok(abs(left - (views["ui"]["x"] + field["x"] - 12)) <= 2 and lst["w"] >= 320, f"{label}: from 12 left of the field, at least 320 wide ({lst['w']:.0f})")
    t.ok(b.ui("document.querySelectorAll('.field-taboffers .field-row').length", root="overlay") >= 1, f"{label}: with its places")
    # Return: there, in the same tab
    key("Return")
    b.wait_for(lambda: b.active()["url"].startswith("https://github.com"), what="github")
    t.ok(b.active()["id"] == tab and not editing() and b.call({"do": "field.views"})["layer"] == "none", f"{label}: Return goes there in the same tab, the list gone")
    # nowhere to go: refused, the edit stays
    click(live_sel)
    b.wait_for(lambda: editing(), what="edit")
    key("a", "control" if sys.platform != "darwin" else "meta")
    key("Backspace")
    key("Return")
    time.sleep(0.3)
    t.ok(editing() and editing()["refused"] >= 1, f"{label}: Return on nothing is refused, the edit stays")
    key("Escape")
    time.sleep(0.3)
    # a click elsewhere keeps what was typed
    b.cmd("field.commit", text=PAGE)
    b.wait_for(lambda: b.active()["title"] == "here", what="page again")
    time.sleep(0.4)
    click(live_sel)
    b.wait_for(lambda: editing(), what="edit")
    b.cmd("field.tabType", text="example.org")
    b.cmd("field.tabBlur", text="example.org")
    b.wait_for(lambda: b.active()["url"].startswith("https://example.org"), what="kept")
    t.ok(not editing(), f"{label}: a click elsewhere keeps what was typed, as Return")


run("column", ".row.live", "column")
b.cmd("settings.set", id="tabs.layout", value="top")  # as Settings sets it (the Mac's sidebar key)
time.sleep(1.0)
if b.ui("!!document.querySelector('.strip-tab')"):
    run("strip", ".strip-tab.live", "tabs on top")
    w = rect(".strip-tab.live")
    click(".strip-tab.live")
    b.wait_for(lambda: editing(), what="edit on top")
    t.ok(rect(".strip-tab.live")["w"] >= 339, "tabs on top: the tab widens to 340 while its address is typed")
    key("Escape")
else:
    t.ok(False, "tabs on top: no strip")

t.done()

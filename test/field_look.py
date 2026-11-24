#!/usr/bin/env python3
"""The field's look, measured in the interface against studio/02 §4.4, §4.8,
§6 (Omnibox.swift, Find.swift): sizes, radii, shadows, the breath, the list
8 under the field, rows, the veil at 74%, the Find pill in its corner.
SHOTS_DIR=<folder> keeps pictures of each."""
import json, os, sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b

b.use("field-look")
b.launch(env={"SEARCH_LOOK": "light"})
t = b.T()
SHOTS = os.environ.get("SHOTS_DIR")
# No ready-made site to search with Tab: Reddit as a site shortcut of the user's own (studio/03 §1.10).
b.cmd("prefs.set", key="search.keywords", value=[{"keyword": "red", "template": "https://www.reddit.com/search/?q=%s"}])

b.call({"do": "field.fake", "places": [
    {"kind": "history", "title": "GitHub", "url": "https://github.com/"},
    {"kind": "bookmark", "title": "GitHub Docs", "url": "https://docs.github.com/"},
]})


def css(sel, props, root="chrome", pseudo=None):
    js = (f"(() => {{ const e = document.querySelector({json.dumps(sel)}); if (!e) return null;"
          f" const s = getComputedStyle(e{', ' + json.dumps(pseudo) if pseudo else ''}); const r = e.getBoundingClientRect();"
          f" return JSON.stringify({{ r: {{ x: r.x, y: r.y, w: r.width, h: r.height }}, "
          + ", ".join(f"{json.dumps(p)}: s.getPropertyValue({json.dumps(p)})" for p in props) + " }) })()")
    v = b.ui(js, root=root)
    return json.loads(v) if v else None


def near(a, want, tol=0.6):
    return a is not None and abs(a - want) <= tol


# the blank tab's field
time.sleep(0.6)
f = css(".field", ["border-radius", "padding-left", "padding-right", "box-shadow", "background-color"])
page = css(".empty-page", [])
i = css(".field input", ["font-size", "line-height", "color", "caret-color"])
t.ok(near(f["r"]["w"], 560), f"the field is 560 wide: {f['r']['w']}")
t.ok(near(f["r"]["h"], 50), f"50 high (22 of text, 14 above and below): {f['r']['h']}")
t.ok(f["border-radius"] == "14px", f"radius 14: {f['border-radius']}")
t.ok(f["padding-left"] == "22px" and f["padding-right"] == "22px", "22 at the sides")
t.ok("rgba(0, 0, 0, 0.06) 0px 8px 48px" in f["box-shadow"], f"shadow black 6% r24 y8: {f['box-shadow']}")
t.ok("rgb(232, 232, 232) 0px 0px 0px 1px inset" in f["box-shadow"], "a hairline inside the edge")
t.ok(f["background-color"] == "rgb(255, 255, 255)", "on ground")
t.ok(i["font-size"] == "15.5px" and near(i["r"]["h"], 22), f"text 15.5 in 22: {i['font-size']} {i['r']['h']}")
mid_page = page["r"]["y"] + page["r"]["h"] / 2
mid_field = f["r"]["y"] + f["r"]["h"] / 2
t.ok(near(mid_page - mid_field, 30, 1), f"raised 30 above the page's middle: {mid_page - mid_field:.1f}")
t.ok(near(f["r"]["x"] + f["r"]["w"] / 2, page["r"]["x"] + page["r"]["w"] / 2, 1), "centred on the page, not the window")
ph = css(".field input", ["color"], pseudo="::placeholder")
t.ok(ph and ph["color"] in ("rgba(23, 23, 23, 0.3)", "color(srgb 0.0901961 0.0901961 0.0901961 / 0.3)"), f"placeholder ink 30%: {ph and ph['color']}")
br = css(".field-breath", ["animation-duration", "animation-direction", "animation-iteration-count", "box-shadow", "border-radius"])
t.ok(br["animation-duration"] == "2.6s" and br["animation-direction"] == "alternate" and br["animation-iteration-count"] == "infinite",
     "the breath: 2.6 s each way, back and forth, for ever")
t.ok("0px 0px 52px" in br["box-shadow"] and br["border-radius"] == "26px", f"ink 7% blurred 26, shape radius 26: {br['box-shadow']}")
if SHOTS: b.shot(f"{SHOTS}/field-blank.png")

# the list
b.cmd("field.type", text="git")
time.sleep(0.5)
l = css(".field-list", ["padding-top", "border-radius", "box-shadow"])
t.ok(near(l["r"]["y"] - f["r"]["y"], 58), f"the list 8 under the field: {l['r']['y'] - f['r']['y']}")
t.ok(near(l["r"]["w"], 560), "as wide as the field")
t.ok(l["padding-top"] == "6px" and l["border-radius"] == "14px", "padding 6, radius 14")
t.ok("rgba(0, 0, 0, 0.07) 0px 6px 40px" in l["box-shadow"], f"shadow black 7% r20 y6: {l['box-shadow']}")
row = css(".field-row", ["padding-top", "padding-left", "border-radius", "column-gap"])
t.ok(row["padding-top"] == "9px" and row["padding-left"] == "12px" and row["border-radius"] == "9px", "rows: 12 / 9, radius 9")
t.ok(row["column-gap"] == "10px", "10 between icon and words")
key = css(".field-key", ["font-size", "color"])
title = css(".field-title", ["font-size", "color"])
t.ok(key["font-size"] == "13px" and key["color"] == "rgb(23, 23, 23)", "address 13 in ink")
t.ok(title["font-size"] == "12px" and title["color"] == "rgb(140, 140, 140)", "title 12 in muted")
icon = css(".field-icon", [])
t.ok(near(icon["r"]["w"], 14) and near(icon["r"]["h"], 14), "a 14 by 14 column before the words")
b.cmd("field.move", by=1)
time.sleep(0.25)
picked = css(".field-row.picked", ["background-color"])
t.ok(picked["background-color"] == "rgb(239, 239, 239)", f"the row walked to: wash: {picked['background-color']}")
if SHOTS: b.shot(f"{SHOTS}/field-list.png")

# the site offer and its Tab key
b.cmd("field.type", text="red")
time.sleep(0.4)
tab = css(".field-tabkey", ["font-size", "font-weight", "padding-left", "border-radius"])
t.ok(near(tab["r"]["h"], 18) and tab["font-size"] == "11px" and tab["font-weight"] == "500" and tab["padding-left"] == "6px" and tab["border-radius"] == "5px",
     "Tab: 11 medium, 18 high, 6 at the sides, radius 5")
drawn = b.ui("[...document.querySelectorAll('.field-icon svg')].every(s => s.childElementCount > 0)")
t.ok(drawn, "every row's symbol is drawn, the same symbol twice included")
b.cmd("field.tab")
time.sleep(0.3)
chip = css(".field-chip", ["padding-left", "border-radius", "background-color"])
name = css(".field-chip-name", ["font-size", "font-weight"])
t.ok(near(chip["r"]["h"], 22) and chip["padding-left"] == "8px" and chip["border-radius"] == "7px" and chip["background-color"] == "rgb(239, 239, 239)",
     "the chip: 22 high, 8 at the sides, wash, radius 7")
t.ok(name["font-size"] == "13px" and name["font-weight"] == "500", "its name 13 medium")
if SHOTS: b.shot(f"{SHOTS}/field-chip.png")
b.cmd("field.unchip")
b.cmd("field.escape")

# over a page: the veil at 74%
b.cmd("field.commit", text="data:text/html,<title>p</title><body style='background:%23c33'><h1>page</h1><p>apple apple</p>")
b.wait_for(lambda: b.active()["title"] == "p", what="page")
time.sleep(0.4)
b.cmd("field.open", target="here")
time.sleep(0.6)
veil = css(".field-veil", ["background-color"], root="overlay")
t.ok(veil and veil["background-color"] == "rgba(255, 255, 255, 0.74)", f"over a page: ground at 74%: {veil and veil['background-color']}")
of = css(".field", [], root="overlay")
t.ok(near(veil["r"]["h"] / 2 - (of["r"]["y"] + of["r"]["h"] / 2), 30, 1), "raised 30 over the page too")
if SHOTS: b.shot(f"{SHOTS}/field-over-page.png")
b.cmd("field.escape")
time.sleep(0.3)

# Find: 12 from the top, 14 from the right, a capsule
b.cmd("find.open")
time.sleep(0.5)
b.cmd("find.input", text="apple")
time.sleep(0.5)
pill = css(".find-pill", ["border-radius", "padding-left", "padding-right", "padding-top", "box-shadow"], root="overlay")
room = json.loads(b.ui("JSON.stringify({ w: innerWidth, h: innerHeight })", root="overlay"))
t.ok(near(pill["r"]["y"], 12) and near(room["w"] - (pill["r"]["x"] + pill["r"]["w"]), 14), f"12 from the top, 14 from the right: {pill['r']}")
t.ok(pill["padding-left"] == "16px" and pill["padding-right"] == "8px" and pill["padding-top"] == "8px", "padding 16 / 8, 8 above and below")
t.ok("rgba(0, 0, 0, 0.1) 0px 5px 36px" in pill["box-shadow"], f"shadow black 10% r18 y5: {pill['box-shadow']}")
ff = css(".find-field", ["font-size"], root="overlay")
st = css(".find-status", ["font-size", "font-weight", "font-variant-numeric"], root="overlay")
t.ok(near(ff["r"]["w"], 150) and ff["font-size"] == "12.5px", "the field 150 wide, 12.5")
t.ok(st and st["font-size"] == "10px" and st["font-weight"] == "500" and "tabular-nums" in st["font-variant-numeric"], "status 10 medium, tabular digits")
t.ok(b.ui("document.querySelector('.find-field').value", root="overlay") == "apple", "the words show in the find field")
btn = css(".find-button", [], root="overlay")
t.ok(near(btn["r"]["w"], 24) and near(btn["r"]["h"], 24), "buttons 24 by 24")
if SHOTS: b.shot(f"{SHOTS}/find.png")

t.done()

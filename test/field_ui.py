#!/usr/bin/env python3
"""The field as a person uses it, keys and all (studio/03 §1.1, §1.3-1.5,
Omnibox.swift): the grey ending inside the input, deleting keys, the row
walked to, keys typed before the field had them, the site chip, the shake,
Alt+Return, Ctrl+K held and let go."""
import json, sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b

b.use("field-ui")
b.launch()
t = b.T()
CTRL = "meta" if sys.platform == "darwin" else "control"

b.call({"do": "field.fake", "places": [
    {"kind": "history", "title": "GitHub", "url": "https://github.com/"},
    {"kind": "history", "title": "Example", "url": "https://example.com/"},
]})


def inp(root="chrome"):
    js = ("(() => { const i = document.querySelector('.field input'); if (!i) return null;"
          " return JSON.stringify({ v: i.value, s: i.selectionStart, e: i.selectionEnd, f: document.activeElement === i,"
          " p: i.placeholder, chip: document.querySelector('.chip-name')?.textContent ?? null }) })()")
    v = b.ui(js, root=root)
    return json.loads(v) if v else None


def keys(text):
    for ch in text:
        b.key(ch)
        time.sleep(0.05)


def settle(pred, what, root="chrome"):
    try:
        return b.wait_for(lambda: (lambda x: x if x and pred(x) else None)(inp(root)), within=5, what=what)
    except AssertionError:
        w = b.window()
        print("   state:", {k: w["field"].get(k) for k in ("text", "shown", "offer", "mode", "open", "focus")}, w["overlay"], inp(root))
        raise


# the blank tab's field has the keys
x = settle(lambda x: x["f"], "focused field")
t.ok(x["p"] == "Enter a web address", "the blank tab's field has the keys, placeholder Enter a web address")

# typing: the rest of the address grey and selected after the caret
keys("gi")
x = settle(lambda x: x["v"] == "github.com", "completion")
t.ok(x["s"] == 2 and x["e"] == 10, f"gi shows github.com with thub.com selected: {x}")
keys("t")
x = settle(lambda x: x["v"] == "github.com" and x["s"] == 3, "typed over the ending")
t.ok(x["e"] == 10, "typing the next letter keeps the ending, one letter shorter")
b.key("Backspace")
x = settle(lambda x: x["v"] == "git", "deleted")
time.sleep(0.4)
x = inp()
t.ok(x["v"] == "git" and x["s"] == 3, f"Backspace takes the ending away and it doesn't come back: {x}")
keys("h")
x = settle(lambda x: x["v"] == "github.com", "completion again")
t.ok(x["s"] == 4, "the next letter offers it again")

# the arrows walk the list and the field shows the row
b.key("Down")
x = settle(lambda x: b.window()["field"]["selected"] == 0, "walked")
t.ok(x["v"] == b.window()["field"]["suggestions"][0]["title"], "Down: the field shows the row walked to")
b.key("Escape")
time.sleep(0.3)
t.ok(b.window()["field"]["selected"] == -1, "Escape lets go of the row")

# Return goes there
b.key("Return")
b.wait_for(lambda: b.active()["url"].startswith("https://github.com"), what="github")
t.ok(True, "Return goes to the address the field finished")

# Ctrl+L: the page's address selected whole, in the overlay
time.sleep(0.5)
b.key("L", CTRL)
x = settle(lambda x: x["f"] and x["v"].startswith("https://github.com"), "ctrl+l field", root="overlay")
t.ok(x["s"] == 0 and x["e"] == len(x["v"]), "Ctrl+L: the address selected whole")
t.ok(x["p"] == "This tab: enter a web address", "placeholder This tab: enter a web address")
b.key("Escape")
b.wait_for(lambda: b.window()["overlay"]["kind"] == "none", what="field away")

# keys typed straight after Ctrl+L are kept for the field, in order: sent at
# once to the overlay (where Ctrl+L puts the keys), before its field is there,
# and one straying to the page under it
b.key("L", CTRL)
for ch in "ab":
    b.call({"do": "field.key", "key": ch, "to": "overlay"})
b.call({"do": "field.key", "key": "c", "to": "page"})
x = settle(lambda x: x["v"] == "abc", "held keys", root="overlay")
t.ok(x["v"] == "abc", "keys typed before the field had them land in it, in order")
b.key("Escape")
b.key("Escape")
b.wait_for(lambda: b.window()["overlay"]["kind"] == "none", what="field away")

# a blank tab: Return on nothing shakes the field, red edge
b.key("T", CTRL)
settle(lambda x: x["f"] and x["v"] == "", "new tab field")
b.key("Return")
time.sleep(0.1)
shaking = b.ui("(() => { const f = document.querySelector('.field'); return f.classList.contains('refused') && f.getAnimations().some(a => a.playState === 'running') })()")
t.ok(shaking, "refused: a red edge and a shake")
keys("q")
time.sleep(0.3)
t.ok(b.ui("document.querySelector('.field').classList.contains('refused')") is False, "the red goes at the next key")
b.key("Backspace")
settle(lambda x: x["v"] == "", "emptied")

# the site chip: red, Tab, words; Backspace on the empty field takes it out
keys("red")
try:
    b.wait_for(lambda: b.window()["field"].get("offer"), what="offer")
except AssertionError:
    print({k: b.window()["field"].get(k) for k in ("text", "shown", "offer", "mode", "open")}, inp())
    raise
row = b.ui("document.querySelector('.suggestion.offer')?.textContent")
t.ok(row and "Search Reddit" in row and "Tab" in row, f"the list offers Search Reddit with its Tab key: {row!r}")
b.key("Tab")
x = settle(lambda x: x["chip"] == "Reddit", "chip")
t.ok(x["v"] == "" and x["p"] == "Search Reddit", "Tab: the chip, an empty field, Search Reddit")
b.key("Backspace")
x = settle(lambda x: x["chip"] is None, "chip gone")
t.ok(x["p"] == "Enter a web address", "Backspace on the empty field takes the site out")

# Alt+Return: a new tab behind, the blank tab stays
keys("cats")
time.sleep(0.3)
blank = b.active()["id"]
n = len(b.window()["tabs"])
b.key("Return", "alt")
b.wait_for(lambda: len(b.window()["tabs"]) == n + 1, what="tab behind")
t.ok(b.window()["activeID"] == blank, "Alt+Return: the search in a new tab behind")

# Ctrl+K with Ctrl held: each Ctrl+K a row further, letting go goes there
b.cmd("tab.new", url="https://example.com/")
time.sleep(0.8)
order = [s["tabID"] for s in b.cmd("field.summon") or []]
b.cmd("field.summon")  # put away (raised without Ctrl held)
time.sleep(0.2)
b.key("K", CTRL)
f = b.wait_for(lambda: (lambda f: f if f["mode"] == "switcher" else None)(b.window()["field"]), what="switcher")
second = f["suggestions"][1]["tabID"]
b.key("K", CTRL)
time.sleep(0.2)
t.ok(b.window()["field"]["selected"] == 1, "Ctrl+K again with Ctrl held: one row down")
b.call({"do": "key", "key": "Control"})
b.wait_for(lambda: b.window()["activeID"] == second, what="landed")
t.ok(not b.window()["field"]["open"], "letting go of Ctrl goes to the row walked to")

t.done()

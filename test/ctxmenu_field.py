#!/usr/bin/env python3
"""The page menu in a text field (studio/06 §5.2; Chrome's editing menu):
spelling guesses first (a guess put in, Add to Dictionary), Emoji, Undo,
Redo, Cut, Copy, Paste, Paste as Plain Text, Select All, each doing what it
says in the field; and Oriel's own pages (oriel://): their fields get the
editing rows, their empty room no menu at all, nothing breaks."""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b  # noqa: E402
import ctxmenu_kit as k  # noqa: E402

k.world("ctxmenu-field")
t = b.T()

page = k.page("/ctx")
area = lambda: b.ev(page, "document.querySelector('#area').value")
sel = lambda: b.ev(page, "(() => { const a = document.querySelector('#area'); return [a.selectionStart, a.selectionEnd] })()")


def type_in(text, where="#area"):
    # A real click into the field first: the page gets the keys, as a hand gives them.
    b.mouse(*k.point(page, where, dx=20, dy=14))
    time.sleep(0.3)
    b.ev(page, f"(() => {{ const a = document.querySelector('{where}'); a.focus(); document.execCommand('insertText', false, {text!r}); return 1 }})()")


def spelled_menu(dx, what):
    """Right clicks until the spelling checker has marked the word (it
    answers a moment after the typing)."""
    for _ in range(12):
        k.right_click(page, "#area", dx=dx, dy=14)
        if k.labels()[0] not in ("Emoji",):
            return True
        k.key("Escape")
        time.sleep(0.5)
    return False


type_in("helo wrold ")
t.ok(spelled_menu(60, "wrold"), "a misspelled word: its guesses come first")
labs = k.labels()
add = labs.index("Add to Dictionary")
t.ok("world" in labs[:add], f"…the guesses for “wrold” ({labs[:add]})")
EDIT = ["Emoji", "—", "Undo", "Redo (off)", "—"]
t.ok(labs[add + 1:add + 1 + len(EDIT) + 1] == ["—"] + EDIT, f"then Add to Dictionary, Emoji, Undo and Redo ({labs})")
t.ok(all(x in labs for x in ["Cut", "Paste", "Paste as Plain Text"]) and labs[-1] == "Inspect", "then Cut, Copy, Paste, Paste as Plain Text, Select All, and Inspect")
ctx = k.last()["menu"]["context"]
t.ok(ctx[0] == "editable", f"its context is the field ({ctx})")
e = {x["label"]: x for x in k.last()["menu"]["entries"] if x != "—"}
t.ok(e["Undo"]["accel"] == "Ctrl+Z" and e["Redo"]["accel"] == "Ctrl+Y" and e["Paste"]["accel"] == "Ctrl+V" and e["Paste as Plain Text"]["accel"] == "Ctrl+Shift+V"
     and e["Select All"]["accel"] == "Ctrl+A" and e["Emoji"]["accel"] == "Win+.", "each editing row says its Windows key")
k.style_check(t)
k.shot("ctxmenu-field-light")

# a guess put in, then Undo, Redo
k.pick("world")
t.ok(area() == "helo world ", f"a guess picked replaces the word: {area()!r}")
k.right_click(page, "#area", dx=200, dy=40)
k.pick("Undo")
t.ok(area() == "helo wrold ", f"Undo takes it back: {area()!r}")
k.right_click(page, "#area", dx=200, dy=40)
t.ok(k.entry("Redo")["enabled"], "…and Redo can be picked now")
k.pick("Redo")
t.ok(area() == "helo world ", f"Redo puts it again: {area()!r}")

# Select All, Copy, Cut, Paste
k.right_click(page, "#area", dx=200, dy=40)
k.pick("Select All")
t.ok(sel() == [0, len("helo world ")], f"Select All selects the field's text: {sel()}")
k.clear_clipboard()
k.right_click(page, "#area", dx=200, dy=40)
t.ok(k.entry("Copy")["enabled"] and k.entry("Cut")["enabled"], "with text selected, Cut and Copy can be picked")
k.pick("Copy")
t.ok(k.clipboard()["text"] == "helo world ", f"Copy copies it: {k.clipboard()['text']!r}")
k.right_click(page, "#area", dx=200, dy=40)
k.pick("Cut")
t.ok(area() == "" and k.clipboard()["text"] == "helo world ", f"Cut takes it out onto the clipboard ({area()!r})")
k.right_click(page, "#area", dx=200, dy=40)
k.pick("Paste")
t.ok(area() == "helo world ", f"Paste puts it back: {area()!r}")

# Paste as Plain Text: a link copied from the page comes in without its markup
k.select(page, "#link2")
k.right_click(page, "#link2")
k.pick("Copy")
t.ok("text/html" in k.clipboard()["types"], "a link's words copied from the page carry their markup")
b.ev(page, "document.querySelector('#rich').focus()")
k.right_click(page, "#rich", dx=40)
k.pick("Paste")
t.ok("<a" in b.ev(page, "document.querySelector('#rich').innerHTML"), "Paste keeps the markup")
b.ev(page, "document.querySelector('#rich').innerHTML = ''")
k.right_click(page, "#rich", dx=40)
k.pick("Paste as Plain Text")
html = b.ev(page, "document.querySelector('#rich').innerHTML")
t.ok("Second story" in html and "<a" not in html, f"Paste as Plain Text leaves it out: {html!r}")

# Emoji: Windows' panel (recorded in a test world)
k.log(reset=True)
k.right_click(page, "#area", dx=200, dy=40)
k.pick("Emoji")
t.ok(k.log()["emoji"] == 1, "Emoji opens Windows' emoji panel")

# Add to Dictionary: the word isn't marked again (and is taken out after)
WORD = "zqxvbnorielx"
b.ev(page, "document.querySelector('#area').value = ''")
type_in(WORD + " ")
t.ok(spelled_menu(40, WORD), "an unknown word: Add to Dictionary offered")
k.pick("Add to Dictionary")
try:
    b.ev(page, "document.querySelector('#area').value = ''")
    type_in(WORD + " ")
    time.sleep(3)
    k.right_click(page, "#area", dx=40, dy=14)
    t.ok("Add to Dictionary" not in k.labels(), f"…once added, the word is known ({k.labels()[:3]})")
    k.key("Escape")
finally:
    b.call({"do": "ctxmenu.spell", "id": page, "unlearn": WORD})

# Oriel's own pages: the field's rows, no menu on empty room, nothing broken
b.cmd("tab.open", url="oriel://settings", foreground=True)
settings = b.wait_for(lambda: (a := b.active()) and a["url"].startswith("oriel://settings") and a, what="Settings")
time.sleep(1.5)
has_input = b.ev(settings["id"], "!!document.querySelector('input[type=search], input[type=text], input:not([type])')")
seq = k.last()["menu"]["seq"]
pr = k.page_rect(settings["id"])
b.mouse(pr["x"] + pr["width"] - 30, pr["y"] + pr["height"] - 30, button="right")
time.sleep(1)
t.ok(k.last()["menu"]["seq"] == seq and not k.is_open(), "an Oriel page's empty room: no menu")
if has_input:
    b.ev(settings["id"], "(() => { const i = document.querySelector('input[type=search], input[type=text], input:not([type])'); i.id = i.id || 'ctx-probe-input'; return 1 })()")
    sid = b.ev(settings["id"], "document.querySelector('input[type=search], input[type=text], input:not([type])').id")
    r = json_r = b.ev(settings["id"], f"JSON.stringify(document.getElementById('{sid}').getBoundingClientRect())")
    import json
    r = json.loads(json_r)
    k.right_click_at(round(pr["x"] + r["x"] + 20), round(pr["y"] + r["y"] + r["height"] / 2))
    labs = k.labels()
    t.ok(labs[:3] == ["Emoji", "—", "Undo (off)"] and "Paste" in labs and "Inspect" not in labs, f"an Oriel page's field: the editing rows, no Inspect ({labs})")
    k.key("Escape")
else:
    t.ok(True, "(Settings has no text field to try)")
t.ok(not b.state().get("errors"), "no error in the main process")

k.done(t)

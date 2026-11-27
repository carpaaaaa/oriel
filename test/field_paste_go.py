#!/usr/bin/env python3
"""Right-click an address field for Paste and Go when the clipboard holds a
website's address, as in Safari (Search 1.0.22, PasteAndGoTests): in the
window's field (a blank tab's, and Ctrl+L's over a page), the address in the
tab and the field raised from any app. The menu: Undo, Redo, Cut, Copy,
Paste, Paste and Go, Select All, as Oriel draws its menus. Plain Paste still
only fills the field; words, a version number, an email address or another
scheme's address offer no Paste and Go. Escape closes the menu over a page,
not the field. The clipboard is kept and given back."""
import atexit
import json
import sys
import time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b  # noqa: E402
import settings_c_web as web  # noqa: E402

server, P = web.start(tls=False)
for name in ("start", "pasted", "intab", "over", "launched"):
    web.PAGES["/" + name] = f"<title>{name}</title>{name}"

b.use("field-pastego")
b.folder().mkdir(parents=True, exist_ok=True)
(b.folder() / "prefs.json").write_text(json.dumps({"launcher.on": True, "launcher.key": json.dumps({"name": "Ctrl+Shift+Space"}),
                                                   "search.engine": "custom", "search.custom": f"http://127.0.0.1:{P}/search?q=%s"}))
b.launch()
t = b.T()
b.call({"do": "ctxmenu.clipboard", "op": "save"})


def give_back():
    try:
        b.call({"do": "ctxmenu.clipboard", "op": "restore"}, timeout=5)
    except Exception:
        pass


atexit.register(give_back)


def clip(text):
    b.call({"do": "field.clipboard", "text": text})


def views():
    return b.call({"do": "field.views"})


def rect(sel, root):
    v = b.ui(f"JSON.stringify(document.querySelector({json.dumps(sel)})?.getBoundingClientRect() ?? null)", root=root)
    return json.loads(v) if v else None


def right_click(sel, root="chrome"):
    r = rect(sel, root)
    assert r, f"no {sel} in {root}"
    v = views()["ui" if root == "chrome" else "overlay"]
    b.mouse(round(v["x"] + r["x"] + 12), round(v["y"] + r["y"] + r["height"] / 2), button="right")


def items(host):
    js = (f"(() => {{ const m = document.querySelector({json.dumps(host + ' .menu')}); if (!m) return null;"
          " return JSON.stringify([...m.children].map(e => e.classList.contains('menu-sep') ? '—' : e.dataset.label + (e.classList.contains('off') ? ' (off)' : ''))) })()")
    v = b.ui(js, root="overlay")
    return json.loads(v) if v else None


def menu(host, within=4):
    try:
        return b.wait_for(lambda: items(host), within=within, what=f"the menu in {host}")
    except AssertionError:
        return None


def pick(host, label):
    ok = b.ui(f"(() => {{ const m = document.querySelector({json.dumps(host + ' .menu')}); const e = m && [...m.querySelectorAll('.menu-item')].find(x => x.dataset.label === {json.dumps(label)});"
              " if (!e) return false; e.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true })); e.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0 })); return true })()", root="overlay")
    assert ok, f"no row {label!r} in {items(host)}"
    time.sleep(0.6)


OVER = ".menu-host:not([data-field-menu])"   # the overlay's menus, for the interface's fields
OWN = "[data-field-menu]"                     # the field over the page draws its own
URL = f"127.0.0.1:{P}/pasted?q=go"
FULL = f"http://127.0.0.1:{P}/pasted?q=go"

# What counts as a website's address (Omnibox.swift AddressEditor.website).
for text in ["words to look up", "todo", "1.2.3", "name@example.test", "oriel://settings", "file:///tmp/file", "javascript:alert(1)",
             "about:blank", "https:///path", "https://example.test\nhttps://other.test", "https://example.test and words", ""]:
    clip(text)
    t.ok(b.cmd("field.clip")["url"] is None, f"{text!r}: no Paste and Go")
clip("example.test/path?q=go#here")
t.ok(b.cmd("field.clip")["url"] == "https://example.test/path?q=go#here", "a website without its scheme: Paste and Go, as https")
clip("  https://example.test/a  ")
t.ok(b.cmd("field.clip")["url"] == "https://example.test/a", "a whole address, spaces round it left out")

# 1. A blank tab's field.
blank = b.cmd("tab.new")
time.sleep(0.8)
clip(URL)
right_click(".field input")
got = menu(OVER)
t.ok(got == ["Undo (off)", "Redo (off)", "—", "Cut (off)", "Copy (off)", "Paste", "Paste and Go", "—", "Select All (off)"],
     f"a blank tab's field: the editing rows, Paste and Go after Paste ({got})")
pick(OVER, "Paste and Go")
a = b.wait_for(lambda: (x := b.active()) and x["title"] == "pasted" and x, within=15, what="pasted")
t.ok(a["id"] == blank and a["url"] == FULL, f"Paste and Go: the blank tab goes there ({a['url']})")

# 2. Plain Paste only fills the field.
b.cmd("tab.new")
time.sleep(0.8)
right_click(".field input")
menu(OVER)
pick(OVER, "Paste")
value = b.ui("document.querySelector('.field input').value")
t.ok(value == URL and b.active()["empty"], f"Paste only fills the field ({value!r}, the tab still blank)")
focused = b.ui("document.activeElement === document.querySelector('.field input')")
t.ok(focused, "…and the field has the keys again")
right_click(".field input")
got = menu(OVER)
t.ok(got and "Cut (off)" in got and "Copy (off)" in got and "Select All" in got and "Undo" in got,
     f"words in it, none selected: Select All and Undo can be picked, Cut and Copy not ({got})")
pick(OVER, "Select All")
sel = json.loads(b.ui("JSON.stringify((() => { const i = document.querySelector('.field input'); return [i.selectionStart, i.selectionEnd] })())"))
t.ok(sel == [0, len(URL)], f"Select All selects what is in it ({sel})")
right_click(".field input")
got = menu(OVER)
t.ok(got and "Cut" in got and "Copy" in got, f"selected: Cut and Copy can be picked ({got})")
clip("")
pick(OVER, "Copy")
copied = b.call({"do": "ctxmenu.clipboard"})["text"]
t.ok(copied == URL, f"Copy copies it ({copied!r})")

# 3. Words on the clipboard: no Paste and Go.
clip("words to look up")
right_click(".field input")
got = menu(OVER)
t.ok(got and "Paste" in got and "Paste and Go" not in got, f"words on the clipboard: Paste, no Paste and Go ({got})")
b.key("Escape")
time.sleep(0.5)

# 4. Ctrl+L's field over a page: its own menu, the field stays.
b.cmd("tab.go", id=b.active()["id"], input=f"http://127.0.0.1:{P}/start")
b.wait_for(lambda: b.active()["title"] == "start", within=15, what="a page")
here = b.active()["id"]
b.cmd("field.open", target="here")
time.sleep(0.8)
clip(f"127.0.0.1:{P}/over")
right_click(".field input", root="overlay")
got = menu(OWN)
t.ok(got is not None and "Paste and Go" in got, f"over a page: the field's own menu, with Paste and Go ({got})")
t.ok(b.window()["field"]["open"], "…and the field is still up")
b.key("Escape")
time.sleep(0.5)
t.ok(items(OWN) is None and b.window()["field"]["open"], "Escape closes the menu, not the field")
right_click(".field input", root="overlay")
menu(OWN)
pick(OWN, "Paste and Go")
a = b.wait_for(lambda: (x := b.active()) and x["title"] == "over" and x, within=15, what="over")
t.ok(a["id"] == here and not b.window()["field"]["open"], f"Paste and Go: this tab goes there, the field put away ({a['url']})")

# 5. The address in the tab.
b.cmd("field.editTab", id=here)
time.sleep(0.8)
clip(f"127.0.0.1:{P}/intab")
right_click(".field-tab-input")
got = menu(OVER)
t.ok(got is not None and "Paste and Go" in got, f"the address in the tab: Paste and Go ({got})")
t.ok(b.window().get("tabEdit") is not None, "…the tab's address still being edited while the menu is up")
pick(OVER, "Paste and Go")
a = b.wait_for(lambda: (x := b.active()) and x["title"] == "intab" and x, within=15, what="intab")
t.ok(a["id"] == here and b.window().get("tabEdit") is None, f"Paste and Go: that tab goes there, the edit ends ({a['url']})")

# 6. The field raised from any app.
b.call({"do": "settingsb.launch"})
time.sleep(0.8)
launched = b.active()
t.ok(launched["empty"], "the key from any app: a new tab's field")
clip(f"127.0.0.1:{P}/launched")
right_click(".field input")
got = menu(OVER)
t.ok(got is not None and "Paste and Go" in got, f"…with Paste and Go ({got})")
pick(OVER, "Paste and Go")
a = b.wait_for(lambda: (x := b.active()) and x["title"] == "launched" and x, within=15, what="launched")
t.ok(a["id"] == launched["id"], f"…which opens it in that tab ({a['url']})")
give_back()
t.done()

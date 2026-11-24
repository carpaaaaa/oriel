#!/usr/bin/env python3
"""The extensions in the window (studio/04 §2): the puzzle and the pinned
buttons in the column's foot, the puzzle's list, the popup hung from the
button and sized as Chrome, the badge, the questions to add and remove,
turning off, Load Unpacked, the managing page, installing from a link and
"Add to Oriel" on the Chrome Web Store."""
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b

FIXTURE = Path(__file__).resolve().parent / "fixtures" / "dnr-test"
DARK_READER = "eimadpbcbfnmbkopoojfekhnkhdbieeh"

b.use("extensions-ui")
b.launch()
t = b.T()

ui = lambda js: b.ui(js)
over = lambda js: b.ui(js, root="overlay")
ext_state = lambda: b.window().get("ext") or {}
rect = lambda sel: json.loads(ui(f"(() => {{ const e = document.querySelector({json.dumps(sel)}); return e ? JSON.stringify(e.getBoundingClientRect()) : 'null' }})()"))

t.ok(rect(".ext-puzzle") is None, "no puzzle without extensions")

ext = b.call({"do": "extensions.loadUnpacked", "path": str(FIXTURE), "copy": True})
EXT = ext["id"]
b.wait_for(lambda: rect(".foot .ext-puzzle"), what="puzzle")
p = rect(".foot .ext-puzzle")
t.ok(round(p["width"]) == 26 and round(p["height"]) == 26, f"the puzzle sits in the column's foot, 26 x 26 ({p['width']} x {p['height']})")
row = next(e for e in ext_state()["list"] if e["id"] == EXT)
t.ok(row["enabled"] and row["action"] and not row["pinned"] and row["name"] == "DNR test", "the extension is in the window's state")

# Pinned next to the puzzle, with its icon (the initial when it has none).
b.cmd("ext.pin", id=EXT, pinned=True)
b.wait_for(lambda: rect(f".foot .ext-button[data-ext='{EXT}']"), what="pinned button")
t.ok(True, "pinning puts its button next to the puzzle")
t.ok(ui(f"document.querySelector(\".ext-button[data-ext='{EXT}'] .ext-initial\")?.textContent") == "D", "an extension without an icon shows its initial")

# The puzzle's list: 280 wide, a row per extension with a button.
p = rect(".foot .ext-puzzle")
b.mouse(p["x"] + 13, p["y"] + 13)
b.wait_for(lambda: b.window()["overlay"].get("name") == "ext.list", what="list")
time.sleep(0.3)
card = json.loads(over("JSON.stringify(document.querySelector('.ext-list').getBoundingClientRect())"))
t.ok(round(card["width"]) == 280, f"the list is 280 wide ({card['width']})")
t.ok(over(f"!!document.querySelector(\".ext-row[data-ext='{EXT}']\")") is True, "with a row for the extension")
t.ok(over("[...document.querySelectorAll('.ext-foot-item span')].map(s => s.textContent).join('|')") == "Chrome Web Store…|Load Unpacked…|Manage Extensions…", "and the three items below")
m = ext_state()["menu"]
t.ok(m["rect"]["x"] > p["x"] + p["width"] and m["arrow"]["side"] == "left", "it opens toward the page, beside the column, its arrow at the puzzle")

# A row presses the extension: its popup, hung from the puzzle.
over(f"document.querySelector(\".ext-row[data-ext='{EXT}'] .ext-name\").click()")
pop = b.wait_for(lambda: (x := b.call({"do": "extensions.popup"}))["open"] and x["shown"] and not x["loading"] and x, within=8, what="popup")
t.ok(pop["url"] == f"chrome-extension://{EXT}/popup.html" and pop["title"] == "DNR test popup", "the row opens the popup page")
t.ok(abs(pop["bounds"]["width"] - 216) <= 4 and abs(pop["bounds"]["height"] - 96) <= 4, f"sized to its page as Chrome does ({pop['bounds']['width']} x {pop['bounds']['height']})")
t.ok(b.window()["overlay"].get("name") == "ext.popup", "with its card under it")
t.ok(b.call({"do": "extensions.popupEval", "js": "typeof chrome.storage.local.get"})["value"] == "function", "the popup is the extension's own page, with its APIs")

# A link that opens a window becomes a tab in front, and the popup goes.
b.call({"do": "extensions.popupEval", "js": "setTimeout(() => window.open('https://example.com/from-popup'), 50); 1"})
b.wait_for(lambda: not b.call({"do": "extensions.popup"})["open"], within=5, what="popup closes")
b.wait_for(lambda: "from-popup" in (b.active() or {}).get("url", ""), within=5, what="tab in front")
t.ok(True, "a link from the popup opens in a tab in front and closes it")

# The pinned button: popup; again: closed. window.close() closes it too.
btn = rect(f".foot .ext-button[data-ext='{EXT}']")
b.mouse(btn["x"] + 13, btn["y"] + 13)
b.wait_for(lambda: b.call({"do": "extensions.popup"})["open"], within=5, what="popup from button")
pop = b.call({"do": "extensions.popup"})
t.ok(pop["bounds"]["x"] > btn["x"] + btn["width"], "the popup hangs from its button, toward the page")
b.mouse(btn["x"] + 13, btn["y"] + 13)
b.wait_for(lambda: not b.call({"do": "extensions.popup"})["open"], within=5, what="toggle")
t.ok(True, "the button again closes it")
b.mouse(btn["x"] + 13, btn["y"] + 13)
b.wait_for(lambda: (x := b.call({"do": "extensions.popup"}))["open"] and not x["loading"], within=5, what="popup again")
b.call({"do": "extensions.popupEval", "js": "setTimeout(() => window.close(), 50); 1"})
b.wait_for(lambda: not b.call({"do": "extensions.popup"})["open"], within=5, what="window.close")
t.ok(True, "window.close() in the popup closes it")

# The badge, from the extension.
b.cmd("tab.new", url=f"chrome-extension://{EXT}/test.html")
b.wait_for(lambda: b.active()["title"] == "DNR test page", what="extension page")
page = b.active()["id"]
b.ev(page, "chrome.action.setBadgeText({ text: '7' })")
b.wait_for(lambda: ui(f"document.querySelector(\".ext-button[data-ext='{EXT}'] .ext-badge\")?.textContent") == "7", within=5, what="badge")
t.ok(True, "the badge an extension sets shows on its button")

# Questions: remove asks; Cancel keeps it.
b.call({"do": "extensions.answer", "answers": ["Cancel"]})
b.cmd("ext.remove", id=EXT)
asked = b.call({"do": "extensions.asked"})["asked"]
t.ok(asked and asked[-1]["message"] == "Remove “DNR test”?" and asked[-1]["detail"] == "Its settings and data go with it.", "Remove asks first, in the Mac's words")
t.ok(any(e["id"] == EXT for e in b.call({"do": "extensions.list"})["extensions"]), "Cancel keeps it")

# Turning it off and on.
b.cmd("ext.enable", id=EXT, on=False)
b.wait_for(lambda: not any(e["id"] == EXT for e in b.call({"do": "extensions.list"})["extensions"]), what="off")
row = next(e for e in ext_state()["list"] if e["id"] == EXT)
t.ok(not row["enabled"] and rect(f".ext-button[data-ext='{EXT}']") is None, "off: not loaded, still listed, its button gone")
# Off, its ··· still opens, and Remove is there without turning it on (the user's 24 Nov 2026 report).
menu = b.call({"do": "ext.menu", "id": EXT})["labels"]
t.ok(menu == ["Pin to Toolbar", "-", "Remove “DNR test”…"] or menu == ["Unpin", "-", "Remove “DNR test”…"], f"off: its menu opens, with Remove ({menu})")
on_menu = None
b.cmd("ext.enable", id=EXT, on=True)
b.wait_for(lambda: any(e["id"] == EXT for e in b.call({"do": "extensions.list"})["extensions"]), what="on")
t.ok(True, "on again")
on_menu = b.call({"do": "ext.menu", "id": EXT})["labels"]
t.ok(on_menu and on_menu[-1] == "Remove “DNR test”…", f"on: its whole menu ({on_menu})")

# The managing page.
b.cmd("ext.manage", open=True)
b.wait_for(lambda: b.window()["overlay"].get("name") == "ext.manage", what="manage")
time.sleep(0.3)
t.ok(over("document.querySelector('.ext-plate h1')?.textContent") == "Extensions", "the managing page opens")
t.ok(over(f"document.querySelector(\".ext-line[data-ext='{EXT}'] .ext-line-detail\")?.textContent") == "Version 1.0 · From “dnr-test”", "a row says its version and where it came from")
t.ok(over("document.querySelector('.ext-field').placeholder") == "Paste a link to an extension, or its id", "the field to add from a link or an id")
b.cmd("ext.install", text="not an id")
t.ok((ext_state().get("said") or {}).get("text") == "That isn't a Chrome Web Store link or extension id", "a text without an id is refused")

# From a link to the Chrome Web Store: the question, then it's in.
b.call({"do": "extensions.answer", "answers": ["Add Extension"]})
b.cmd("ext.install", text=f"https://chromewebstore.google.com/detail/dark-reader/{DARK_READER}")
b.wait_for(lambda: any(e["id"] == DARK_READER for e in b.call({"do": "extensions.list"})["extensions"]), within=90, what="install")
asked = b.call({"do": "extensions.asked"})["asked"][-1]
t.ok(asked["message"] == "Add “Dark Reader” to Oriel?" and asked["detail"].startswith("It will be able to:\n• Read and change everything on every website"), f"Add asks first, with what it will be able to do ({asked['message']})")
t.ok((ext_state().get("said") or {}).get("text") == "Dark Reader is installed", "and says it's installed")
b.cmd("ext.manage", open=False)

# "Add to Oriel" on the Web Store page.
b.cmd("tab.new", url=f"https://chromewebstore.google.com/detail/{DARK_READER}")
store = b.active()["id"]
# A fresh profile meets Google's cookie question first: "Reject all".
time.sleep(4)
if "consent.google" in b.active()["url"]:
    b.ev(store, "[...document.querySelectorAll('button')].find(x => /^Reject all$/i.test(x.textContent.trim()))?.click()")
    b.wait_for(lambda: "chromewebstore.google.com" in b.active()["url"], within=20, what="back to the store")
LABEL = "[...document.querySelectorAll('button span')].map(s => s.textContent.trim()).find(t => /^(Add to|Added to|Remove from) /.test(t)) || null"
try:
    label = b.wait_for(lambda: (x := b.ev(store, LABEL)) == "Added to Oriel" and x, within=40, what="store button")
except AssertionError:
    label = b.ev(store, LABEL)
t.ok(label == "Added to Oriel", f"the Web Store's button says Oriel (got {label})")
offer = b.ev(store, "[...document.querySelectorAll('button')].filter(x => /^(Install|Switch to) /.test(x.textContent.trim()) && x.offsetParent).length")
t.ok(offer == 0, "and its offer to install Chrome is hidden")

# Removing: Remove, and it's gone with its data.
b.call({"do": "extensions.answer", "answers": ["Remove"]})
b.cmd("ext.remove", id=EXT)
b.wait_for(lambda: not any(e["id"] == EXT for e in b.call({"do": "extensions.list"})["extensions"]), what="removed")
t.ok(not any(e["id"] == EXT for e in ext_state()["list"]), "Remove takes it away")

# Load Unpacked from a folder comes back after a restart, pinned as it was.
b.cmd("ext.loadUnpacked", path=str(FIXTURE))
b.wait_for(lambda: (ext_state().get("said") or {}).get("text") == "DNR test is installed", what="unpacked")
again = next(e for e in ext_state()["list"] if e["name"] == "DNR test")
b.cmd("ext.pin", id=again["id"], pinned=True)
time.sleep(0.5)
b.quit()
b.use("extensions-ui", wipe=False)
b.launch()
b.wait_for(lambda: rect(f".foot .ext-button[data-ext='{again['id']}']"), within=15, what="pinned after restart")
t.ok(True, "an unpacked extension comes back after a restart, still pinned")
t.done()

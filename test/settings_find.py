#!/usr/bin/env python3
"""Find a setting as Search 1.0.22 has it: it takes the keys as Settings
opens, so a setting's name can be typed at once, where it waited for Ctrl+F
(#1611); Escape empties it, and empty, lets go, for Tab and the arrows to move
around Settings. The words are kept when you go to another tab and come back,
as the section is (#1655), and in the tab's address, so a reload keeps them."""
import json
import sys
import time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b

b.use("settings-find")
b.launch(env={"SEARCH_LOOK": "light"})
t = b.T()


def ev(tab, js):
    try:
        return b.ev(tab, js)
    except RuntimeError:
        return None


def typed(text):
    for ch in text:
        b.key(ch)
        time.sleep(0.03)


focused = "document.activeElement === document.querySelector('.st-find input')"
value = "document.querySelector('.st-find input').value"

b.cmd("app.settings")
b.wait_for(lambda: any(x.get("internal") == "settings" for x in b.window()["tabs"]), what="Settings tab")
tab = next(x for x in b.window()["tabs"] if x.get("internal") == "settings")["id"]
b.wait_for(lambda: ev(tab, "document.querySelectorAll('.sr').length"), what="rows")
time.sleep(0.4)

# 1. Opened, Find a setting has the keys: a name typed at once finds it.
t.ok(ev(tab, focused) is True, "Settings opens with Find a setting taking the keys")
typed("dark")
b.wait_for(lambda: ev(tab, value) == "dark", within=5, what="typed into the field")
time.sleep(0.3)
t.ok(ev(tab, "document.querySelector('.st-head h1').textContent") == "Settings matching “dark”", "typed at once, no Ctrl+F: the settings matching it")

# 2. The words are kept in the tab's address (a tab that sleeps or reloads keeps them).
b.wait_for(lambda: "find=dark" in (ev(tab, "location.search") or ""), within=3, what="address keeps the words")
t.ok(True, "the tab's address keeps the words")

# 3. Another tab, then back: the words are still there, and the field has the keys again
# (let go of first, so it is the tab coming back that gives them).
ev(tab, "document.activeElement.blur(); 1")
b.cmd("tab.new", url="data:text/html,<title>other</title><p>other")
b.wait_for(lambda: b.active()["title"] == "other", what="another tab")
time.sleep(0.4)
b.cmd("tab.select", id=tab)
b.wait_for(lambda: b.active()["id"] == tab, what="back to Settings")
time.sleep(0.5)
t.ok(ev(tab, value) == "dark" and "dark" in ev(tab, "document.querySelector('.st-head h1').textContent"), "back on Settings: the words are kept, with what they found")
t.ok(ev(tab, focused) is True, "and Find a setting has the keys again")
# Back by Ctrl+, from another tab: Settings at the section it shows, the words kept.
b.cmd("tab.select", id=next(x["id"] for x in b.window()["tabs"] if x["title"] == "other"))
time.sleep(0.4)
b.cmd("app.settings")
b.wait_for(lambda: b.active()["id"] == tab, what="Settings again by Ctrl+,")
time.sleep(0.6)
t.ok(ev(tab, value) == "dark", f"back by Ctrl+,: the words are kept too ({ev(tab, value)!r})")
b.wait_for(lambda: ev(tab, "document.hasFocus()") is True, within=3, what="the page has the keys")
t.ok(ev(tab, focused) is True, "and the page and Find a setting have the keys")
b.wait_for(lambda: "find=dark" in (b.active()["url"] or ""), within=3, what="the tab's address with the words")
t.ok(True, "and the tab's address still has them")
# Another section asked for (a link to Settings › Themes): the words give way to it.
b.cmd("settings.open", page="themes")
b.wait_for(lambda: ev(tab, "location.pathname") == "/themes", what="themes")
time.sleep(0.4)
t.ok(ev(tab, value) == "", "another section asked for: the words give way to it")
ev(tab, "(() => { const f = document.querySelector('.st-find input'); f.value = 'dark'; f.dispatchEvent(new Event('input', {bubbles: true})) })()")
ev(tab, "document.querySelector('.st-find input').focus(); 1")
time.sleep(0.5)

# 4. Escape empties it; empty, Escape lets go of the keys.
b.key("Escape")
time.sleep(0.3)
t.ok(ev(tab, value) == "" and ev(tab, focused) is True, "Escape empties it, keeping the keys")
b.wait_for(lambda: "find=" not in (ev(tab, "location.search") or ""), within=3, what="address without words")
t.ok(True, "emptied, the address forgets the words")
b.key("Escape")
time.sleep(0.3)
t.ok(ev(tab, focused) is False, "empty, Escape lets go of the keys")
b.key("Tab")
time.sleep(0.2)
t.ok(ev(tab, "document.activeElement && document.activeElement !== document.body && document.activeElement.tagName") not in (None, "INPUT"),
     f"then Tab moves around Settings ({ev(tab, 'document.activeElement && document.activeElement.tagName')})")

# 5. A reload (a tab that slept) comes back with the words in the field.
ev(tab, "(() => { const f = document.querySelector('.st-find input'); f.value = 'video'; f.dispatchEvent(new Event('input', {bubbles: true})) })()")
b.wait_for(lambda: "find=video" in (ev(tab, "location.search") or ""), within=3, what="video in the address")
ev(tab, "location.reload()")
time.sleep(0.6)
b.wait_for(lambda: ev(tab, "document.querySelectorAll('.sr').length"), what="rows again")
time.sleep(0.4)
t.ok(ev(tab, value) == "video" and "video" in (ev(tab, "document.querySelector('.st-head h1').textContent") or ""), "reloaded: the words, and what they find, are back")

# 6. Ctrl+F still takes the field back after letting go.
b.key("Escape")
b.key("Escape")
time.sleep(0.2)
b.key("f", "control")
time.sleep(0.3)
t.ok(ev(tab, focused) is True, "Ctrl+F takes Find a setting again")

t.ok(not b.state().get("errors"), "no error in the main process")
t.done()

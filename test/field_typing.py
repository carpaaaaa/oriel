#!/usr/bin/env python3
"""Typing words a site's name starts with, with real key events at a
person's pace (studio/03 §1.3, §1.9-1.10). Reported: typing "github", at
"gi" the field vanished and "Search GitHub" lay across the window: the
data module's `.offer` (position: fixed, the password question) also
styled the field's "Search <site>" row. The field's classes are its own
now; this checks the field stays where it is, with what was typed and the
right grey ending, the offer inside the list, no chip until Tab, and that
Return opens github.com: on a blank tab and over a page (Ctrl+L), light
and dark, with and without a history that has github.com."""
import json, sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b

t = b.T()


def key(k, to, *mods):
    b.call({"do": "field.key", "key": k, "modifiers": list(mods), "to": to})


def look(root):
    js = """(() => {
      const field = document.querySelector('.field'), input = document.querySelector('.field input')
      if (!field || !input) return null
      const r = field.getBoundingClientRect()
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
      const list = document.querySelector('.field-list')?.getBoundingClientRect()
      const rows = [...document.querySelectorAll('.field-row')].map(e => e.getBoundingClientRect())
      const fixed = [...document.querySelectorAll('.field-wrap *')].filter(e => getComputedStyle(e).position === 'fixed').length
      const offer = document.querySelector('.field-offer')?.getBoundingClientRect()
      // the list hangs under the field, as wide as it; the offer row is in it
      const under = !list || (list.top >= r.bottom && Math.abs(list.width - r.width) < 1)
      const offerIn = !offer || (offer.top >= list.top && offer.bottom <= list.bottom && offer.width < r.width && offer.height < 60)
      return JSON.stringify({
        shown: r.width > 300 && r.height === 50 && !!hit && field.contains(hit),
        v: input.value, s: input.selectionStart, e: input.selectionEnd,
        inList: under && offerIn && (!list || rows.every(x => x.top >= list.top - 1 && x.bottom <= list.bottom + 1 && x.height < 60 && x.width <= list.width)),
        fixed, offer: document.querySelector('.field-offer')?.textContent ?? null,
        chip: document.querySelector('.field-chip-name')?.textContent ?? null })
    })()"""
    v = b.ui(js, root=root)
    return json.loads(v) if v else None


def typing(word, root, to, label, ending=None, offered=True):
    ok = True
    for i in range(1, len(word) + 1):
        key(word[i - 1], to)
        time.sleep(0.15)
        # The list comes in at .98 for 140 ms: judged once it has settled,
        # within a second. A field gone for good stays gone.
        ok_now = lambda x: x and x["shown"] and x["inList"] and x["fixed"] == 0 and x["v"].startswith(word[:i]) and x["chip"] is None
        end = time.time() + 1.0
        x = look(root)
        while not ok_now(x) and time.time() < end:
            time.sleep(0.1)
            x = look(root)
        good = ok_now(x)
        if not good:
            print(f"   after {word[:i]!r}: {x}")
            ok = False
            break
    t.ok(ok, f"{label}: typing {word!r} letter by letter, the field stays, the list under it, no chip")
    if ok and offered:
        x = look(root)
        t.ok(x["offer"] and x["offer"].startswith("Search "), f"{label}: {word!r} offers {x['offer']!r} inside the list, under the field")
    if ending is not None and ok:
        x = look(root)
        t.ok(x["v"] == word + ending and x["s"] == len(word) and x["e"] == len(word + ending), f"{label}: {word!r} shows {word + ending!r}, the ending selected: {x['v']!r}")
    return ok


def clear(root, to):
    # Escape on a blank tab clears what was typed (App.swift take).
    key("Escape", to)
    time.sleep(0.3)
    x = look(root)
    assert x and x["v"] == "", x


for mode in ("light", "dark"):
    for history in (True, False):
        label = f"{mode}, {'with' if history else 'no'} history"
        b.use(f"field-typing-{mode}-{'h' if history else 'n'}")
        b.launch(env={"SEARCH_LOOK": mode})
        time.sleep(1.0)
        if history:
            for _ in range(3):
                b.call({"do": "data.visit", "url": "https://github.com/", "title": "GitHub"})
        # the offer row is what broke the field: the sites typed here, as site
        # shortcuts of the user's own (no ready-made site, studio/03 §1.10)
        b.cmd("prefs.set", key="search.keywords", value=[
            {"keyword": "gh", "template": "https://github.com/search?q=%s"},
            {"keyword": "red", "template": "https://www.reddit.com/search/?q=%s"},
            {"keyword": "yt", "template": "https://www.youtube.com/results?search_query=%s"},
            {"keyword": "ama", "template": "https://www.amazon.com/s?k=%s"},
            {"keyword": "wiki", "template": "https://en.wikipedia.org/w/index.php?search=%s"},
        ])
        # a blank tab, once its field is there with the keys
        b.wait_for(lambda: b.ui("document.activeElement === document.querySelector('.field input')"), what="the field has the keys")
        typing("github", "chrome", "ui", label + ", blank tab", ".com" if history else None)
        if history:
            key("Return", "ui")
            b.wait_for(lambda: b.active()["url"].startswith("https://github.com"), what="github.com")
            t.ok(True, f"{label}: Return opens github.com")
        else:
            clear("chrome", "ui")
            for word in ("yt", "red", "ama", "wiki"):
                typing(word, "chrome", "ui", label + ", blank tab")
                clear("chrome", "ui")
            # Tab, and only Tab, puts the site in the field
            typing("red", "chrome", "ui", label)
            key("Tab", "ui")
            time.sleep(0.3)
            x = look("chrome")
            t.ok(x and x["shown"] and x["chip"] == "Reddit" and x["v"] == "", f"{label}: Tab puts Reddit in the field, which stays")
            key("Escape", "ui")
            time.sleep(0.2)
            b.cmd("field.commit", text="data:text/html,<title>p</title><p>page")
            b.wait_for(lambda: b.active()["title"] == "p", what="page")
        # over a page: Ctrl+L
        time.sleep(0.4)
        key("L", "page", "control")
        b.wait_for(lambda: b.window()["overlay"]["kind"] == "field" and look("overlay"), what="field over the page")
        time.sleep(0.3)
        typing("github", "overlay", "overlay", label + ", over a page", ".com" if history else None)
        if history:
            key("Return", "overlay")
            b.wait_for(lambda: b.active()["url"].startswith("https://github.com") and b.window()["overlay"]["kind"] == "none", what="github.com here")
            t.ok(True, f"{label}: Return over the page opens github.com in it")
        b.quit()

t.done()

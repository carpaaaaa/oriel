#!/usr/bin/env python3
"""Settings' area B, links and new tabs (studio/08 B): each row changed, its
effect seen.
  - Show where links go (links.show note, StatusLine.swift)
  - Swipe back closes a tab a link opened (tabs.swipeBackCloses, §3.15)
  - Email links open in (mail.webmail, Webmail.swift)
  - Show the Home bookmarks on a new tab (home.grid, HomeGrid.swift)"""
import json
import sys
import time
from pathlib import Path
from urllib.parse import quote

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b  # noqa: E402
import tabs_kit as k  # noqa: E402

t = b.T()
k.world("settings-b-links")
# A bookmark folder called Home, as Bookmarks.homeSites reads it.
b.folder().mkdir(parents=True, exist_ok=True)
(b.folder() / "bookmarks.json").write_text(json.dumps([
    {"id": "F1", "title": " home ", "children": [
        {"id": "B1", "title": "Alpha", "url": k.url("alpha")},
        {"id": "B2", "title": "Beta", "url": k.url("beta")},
        {"id": "F2", "title": "Inner", "children": []},
    ]},
    {"id": "B3", "title": "Elsewhere", "url": k.url("elsewhere")},
]))
k.launch()

# Show where links go: a card at the page's foot while the pointer is on a link.
page = "data:text/html," + quote("<title>links</title><body style='margin:0'><a id=l href='https://example.com/far/away' style='position:absolute;left:60px;top:60px;padding:30px;background:#eee'>a link</a><a id=m href='mailto:ann@example.com?subject=Hi%20there&body=Line%201%0D%0ALine%202&cc=bob@example.com'>mail</a>")
lt = k.cmd("tab.open", url=page, foreground=True)
b.wait_for(lambda: k.tab(lt)["title"] == "links" and not k.tab(lt)["loading"], what="links page")
time.sleep(0.8)
area = b.call({"do": "settingsb.linkCard"})["page"]
t.ok(area and area["width"] > 200, "the page is on screen")
hover = lambda x, y: b.call({"do": "settingsb.hover", "x": area["x"] + x, "y": area["y"] + y})
hover(90, 75)
b.wait_for(lambda: (c := b.call({"do": "settingsb.linkCard"}))["url"] == "https://example.com/far/away" and c["bounds"] and c["bounds"]["width"] > 0, what="card")
bx = b.call({"do": "settingsb.linkCard"})["bounds"]
t.ok(bx["width"] > 40 and bx["x"] == area["x"] and bx["y"] + bx["height"] - 4 == area["y"] + area["height"], "a link under the pointer: its address in a card at the page's foot, on the left")
hover(400, 300)
b.wait_for(lambda: (c := b.call({"do": "settingsb.linkCard"}))["url"] == "" and (not c["bounds"] or c["bounds"]["width"] == 0), what="card gone")
t.ok(True, "off the link: the card goes")
k.cmd("prefs.set", key="links.show", value=False)
hover(90, 75); time.sleep(0.8)
t.ok(b.call({"do": "settingsb.linkCard"})["url"] == "", "off: no card")
k.cmd("prefs.set", key="links.show", value=True)

# Email links open in (Webmail.swift)
compose = lambda m, w: b.call({"do": "settingsb.compose", "mailto": m, "webmail": w})["url"]
m = "mailto:ann@example.com?subject=Hi%20there&body=Line%201%0D%0ALine%202&cc=bob@example.com"
t.ok(compose(m, "none") is None, "Your mail app: no compose page")
t.ok(compose(m, "gmail") == "https://mail.google.com/mail/?view=cm&fs=1&to=ann%40example.com&cc=bob%40example.com&su=Hi%20there&body=Line%201%0ALine%202", "Gmail's compose page, the draft filled in")
t.ok(compose(m, "outlook").startswith("https://outlook.live.com/mail/0/deeplink/compose?to=ann%40example.com&cc="), "Outlook.com's")
t.ok(compose(m, "fastmail").startswith("https://app.fastmail.com/mail/compose?to="), "Fastmail's")
t.ok(compose(m, "proton") == "https://mail.proton.me/inbox#mailto=" + quote("mailto:ann@example.com?cc=bob@example.com&subject=Hi%20there&body=Line%201%0D%0ALine%202", safe="-._~"), "Proton Mail's, the whole mailto in the fragment")
t.ok(compose("mailto:a@x.com?subject=one&subject=two&body=%0D%0A", "gmail") == "https://mail.google.com/mail/?view=cm&fs=1&to=a%40x.com&su=one&body=%0A", "the first subject only, CRLF made a line break")
k.cmd("prefs.set", key="mail.webmail", value="gmail")
before = len(k.tabs())
b.ev(lt, "document.getElementById('m').click(); true")
b.wait_for(lambda: len(k.tabs()) == before + 1, what="compose tab")
s = k.st()
nt = k.active(s)
t.ok(nt["url"].startswith("https://mail.google.com/mail/?view=cm&fs=1&to=ann%40example.com"), "a mailto: clicked in a page: Gmail's compose page, in front")
ids = [x["id"] for x in k.tabs(s)]
t.ok(ids.index(nt["id"]) == ids.index(lt) + 1, "beside the page it was clicked in")
k.cmd("prefs.set", key="mail.webmail", value="none")

# Swipe back closes a tab a link opened (§3.15)
op = k.page("opener")
b.ev(op, f"window.open('{k.url('child')}'); true")
b.wait_for(lambda: (x := k.active()) and k.name_of(x["url"]) == "child" and not x["loading"], what="child")
child = k.active()["id"]
b.call({"do": "settingsb.swipe", "id": child}); time.sleep(1.0)
t.ok(k.tab(child) is not None, "off: a swipe back on a link's first page leaves the tab")
k.cmd("prefs.set", key="tabs.swipeBackCloses", value=True)
b.call({"do": "settingsb.swipe", "id": child})
b.wait_for(lambda: k.tab(child) is None, what="child closed")
t.ok(k.win()["activeID"] == op, "on: it closes, and you land on the tab you were on")
b.ev(op, f"location.href = '{k.url('second')}'; true")
b.wait_for(lambda: k.tab(op)["title"] == "second" and not k.tab(op)["loading"], what="second")
time.sleep(0.5)
b.call({"do": "settingsb.swipe", "id": op})
b.wait_for(lambda: (x := k.tab(op)) and x["title"] == "opener", what="back")
t.ok(True, "a page with something before it goes back, as a swipe always does")
b.call({"do": "settingsb.swipe", "id": op, "deltaX": 40})
b.wait_for(lambda: (x := k.tab(op)) and x["title"] == "second", what="forward")
t.ok(True, "and forward the other way")
t.ok(k.tab(op) is not None, "a tab no link opened never closes on a swipe")

# Show the Home bookmarks on a new tab (HomeGrid.swift)
k.cmd("tab.blank"); k.settle(0.6)
grid = lambda: b.ui("JSON.stringify([...document.querySelectorAll('[data-home-grid] .home-tile')].map(e => e.textContent))")
t.ok(json.loads(grid()) == [], "off, as it comes: a blank tab shows no tiles")
k.cmd("prefs.set", key="home.grid", value=True); k.settle(0.6)
t.ok(json.loads(grid()) == ["Alpha", "Beta"], "on: the sites of the folder called Home, in their order, folders left out")
blank = k.active()["id"]
b.ui("document.querySelector('[data-home-grid] .home-tile').click(), true")
b.wait_for(lambda: (x := k.tab(blank)) and x["title"] == "alpha", what="tile opens")
t.ok(not k.tab(blank)["empty"], "a tile opens its site in that tab")
t.done()

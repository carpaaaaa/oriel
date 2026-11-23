#!/usr/bin/env python3
"""The field's list and its grey ending (studio/03 §1.3, Browser.placeOffers,
History.completion, readAsSearches), with a history and bookmarks of the
test's own given through the bench (field.fake stands in for data.suggest)."""
import sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b

b.use("field-suggest")
b.launch()
t = b.T()

H, BM, KNOWN = "history", "bookmark", "url"
b.call({"do": "field.fake", "places": [
    {"kind": H, "title": "GitHub", "url": "https://github.com/"},
    {"kind": H, "title": "Claude Code", "url": "https://github.com/anthropics/claude-code"},
    {"kind": BM, "title": "Gmail", "url": "https://mail.google.com/mail/u/0/"},
    {"kind": BM, "title": "News one", "url": "https://news.one.com/"},
    {"kind": BM, "title": "News two", "url": "https://news.two.com/"},
    {"kind": BM, "title": "News three", "url": "https://news.three.com/"},
    {"kind": H, "title": "News site", "url": "https://news.site.com/"},
    {"kind": BM, "title": "GitHub bookmarked", "url": "https://github.com/"},
    {"kind": KNOWN, "title": "X", "url": "https://x.com"},
    {"kind": H, "title": "naruto vs - Google Search", "url": "https://www.google.com/search?q=naruto+vs"},
    {"kind": H, "title": "naruto vs - Google Search", "url": "https://www.google.com/search?q=naruto%20vs"},
    {"kind": H, "title": "Example", "url": "https://www.example.org/"},
]})


def field():
    return b.window()["field"]


def typed(text, deleting=False):
    return b.cmd("field.type", text=text, deleting=deleting)


def rows(f=None):
    return [(s.get("how"), s["title"], s.get("detail")) for s in (f or field())["suggestions"]]


# the first tab is blank: its field is the tab's own
f = b.wait_for(lambda: field().get("mode") and field(), what="the field's state")
t.ok(f["mode"] == "blank" and f["placeholder"] == "Enter a web address", "a blank tab's field: Enter a web address")
t.ok(f["suggestions"] == [], "an empty field offers nothing")

# places first, at most three, then the search
r = typed("gi")
f = field()
t.ok(rows(f)[0][:2] == ("bookmark", "github.com"), "a bookmark first, a page both bookmarked and visited is one row, the bookmark's")
t.ok(rows(f)[-1] == ("search", "gi", "Google"), "the search last, named by the engine")
t.ok(len([x for x in rows(f) if x[0] != "search"]) <= 3, "three places at most")
# History's rows are finished first, then the bookmarks' (Browser.swift:8084-8086):
# github.com's row is the bookmark's, so "gi" finishes as the visited page.
want = "thub.com/anthropics/claude-code"
t.ok(r["ending"] == want and f["ending"] == want and f["shown"] == "github.com/anthropics/claude-code", f"gi finishes towards history first: {r} {f['shown']!r}")

# one letter finishes only a front door you have been to
r = typed("g")
t.ok(r["ending"] == "ithub.com", "g: the front door of a visited site")
r = typed("x")
t.ok(r["ending"] is None, "x: a name merely known waits for a second letter")
r = typed("x.")
t.ok(r["ending"] == "com", "x.: two letters finish a known name")
r = typed("github.com/ant")
t.ok(r["ending"] == "hropics/claude-code", "a deeper page is finished from its address")

# deleting never puts the ending back
r = typed("gith", deleting=True)
t.ok(r["ending"] is None and field()["ending"] is None and field()["shown"] == "gith", "a deleting key gets no ending back")

# no search row for what is an address
typed("github.com")
t.ok(all(x[0] != "search" for x in rows()), "no search row when the words are an address")

# bookmarks leave history's front door its place
typed("news")
got = rows()
t.ok([x[1] for x in got[:3]] == ["news.one.com", "news.two.com", "news.site.com"], f"two bookmarks then history's front door: {got[:3]}")

# a search page from history reads as its words; the same search twice is one
typed("naruto")
got = rows()
searched = [x for x in got if x[0] == "searched"]
t.ok(len(searched) == 1 and searched[0][1:] == ("naruto vs", "Google"), f"a past search reads as its words: {got}")
typed("naruto vs")
t.ok(not [x for x in rows() if x[0] == "searched"], "the search the field already offers isn't shown twice")

# walking the list
typed("gi")
b.cmd("field.move", by=1)
f = field()
t.ok(f["selected"] == 0 and f["shown"] == "github.com", "down picks the first row and the field shows it")
n = len(f["suggestions"])
for _ in range(n):
    b.cmd("field.move", by=1)
f = field()
t.ok(f["selected"] == -1 and f["shown"] == "github.com/anthropics/claude-code", f"past the last row, back to what was typed: {f['selected']} {f['shown']!r}")
b.cmd("field.move", by=-1)
t.ok(field()["selected"] == n - 1, "up from the words goes to the last row")
b.cmd("field.move", by=-1)
b.cmd("field.move", by=-1)
before = field()["sync"]
b.cmd("field.escape")
t.ok(field()["selected"] == -1 and field()["sync"] > before, "Escape lets go of the row first")

# Return with the grey ending: the completed address, here (a blank tab)
typed("gi")
tab = b.active()["id"]
b.cmd("field.submit", text=field()["shown"])
b.wait_for(lambda: b.active()["url"].startswith("https://github.com/anthropics/claude-code"), what="github")
t.ok(b.active()["id"] == tab, "Return on a blank tab goes there in the same tab")
t.ok(field()["open"] is False and field()["text"] == "", "the field is put away")

# a row picked by the arrows wins
b.cmd("tab.new")
time.sleep(0.3)
typed("example")
b.cmd("field.move", by=1)
pick = field()["suggestions"][0]["url"]
b.cmd("field.submit", text=field()["shown"])
b.wait_for(lambda: b.active()["url"].startswith(pick.rstrip("/")), what="picked row")
t.ok(True, "Return takes the row walked to")

# refused: nothing to go to, the field shakes
b.cmd("tab.new")
time.sleep(0.3)
before = field()["refused"]
b.cmd("field.submit", text="")
t.ok(field()["refused"] == before + 1 and b.active()["empty"], "Return on an empty field is refused")
b.cmd("field.submit", text="   ")
t.ok(field()["refused"] == before + 2, "spaces alone are refused too")

# Alt+Return: a new tab behind; Alt+Shift+Return: in front
blank = b.active()["id"]
count = len(b.window()["tabs"])
typed("cats")
b.cmd("field.submit", text="cats", newTab=True)
b.wait_for(lambda: len(b.window()["tabs"]) == count + 1, what="tab behind")
w = b.window()
t.ok(w["activeID"] == blank, "Alt+Return opens a new tab behind")
t.ok(any(x["url"] == "https://www.google.com/search?q=cats" for x in w["tabs"]), "...with the search")
typed("dogs")
b.cmd("field.submit", text="dogs", newTab=True, front=True)
b.wait_for(lambda: b.active()["url"] == "https://www.google.com/search?q=dogs", what="tab in front")
t.ok(True, "Alt+Shift+Return opens it in front")

# a site in the field (§1.9): "red", Tab, then the words
b.cmd("tab.new")
time.sleep(0.3)
typed("red")
f = field()
t.ok(f["offer"] and f["offer"]["name"] == "Reddit", "red offers Search Reddit")
b.cmd("field.tab")
f = field()
t.ok(f["chip"] and f["chip"]["name"] == "Reddit" and f["text"] == "" and f["offer"] is None, "Tab puts Reddit in the field, the words go")
t.ok(f["placeholder"] == "Search Reddit", "placeholder: Search Reddit")
typed("cats")
f = field()
t.ok(rows(f)[0] == ("search", "cats", "Reddit") and f["suggestions"][0]["url"] == "https://www.reddit.com/search/?q=cats", "the words search Reddit")
b.cmd("field.unchip")
t.ok(field()["chip"] is None, "Backspace on the empty field takes the site out")
typed("red")
b.cmd("field.tab")
typed("dogs")
b.cmd("field.submit", text="dogs")
b.wait_for(lambda: b.active()["url"] == "https://www.reddit.com/search/?q=dogs", what="reddit")
t.ok(True, "Return searches the site in the chip")

# Tab with no site offered walks the list; Shift+Tab walks back
b.cmd("tab.new")
time.sleep(0.3)
typed("exam")
t.ok(field()["offer"] is None and field()["suggestions"], "exam: no site to offer, a list")
b.cmd("field.tab")
t.ok(field()["selected"] == 0, "Tab walks the list like Down")
b.cmd("field.tab", back=True)
t.ok(field()["selected"] == -1, "Shift+Tab walks back")

# a blank tab keeps what was typed in it (Tab.draft)
typed("half typed")
blank = b.active()["id"]
other = next(x["id"] for x in b.window()["tabs"] if x["id"] != blank and not x["empty"])
b.cmd("tab.select", id=other)
time.sleep(0.3)
t.ok(field()["text"] == "", "another tab: the field is empty")
b.cmd("tab.select", id=blank)
time.sleep(0.3)
t.ok(field()["text"] == "half typed" and field()["shown"] == "half typed", "back on the blank tab, its words are there")

# Escape on a blank tab: the words, then the tab itself, back to the last one
b.cmd("field.escape")
t.ok(field()["text"] == "" and b.active()["id"] == blank, "Escape clears the words, the tab stays")
b.cmd("field.escape")
w = b.window()
t.ok(w["activeID"] == other and all(x["id"] != blank for x in w["tabs"]), "Escape again closes the unused tab, back to the one touched last")

# Ctrl+L over a page: its address, selected; Escape puts it away
url = b.active()["url"]
b.cmd("field.open", target="here")
time.sleep(0.3)
f = field()
t.ok(f["open"] and f["mode"] == "thisTab" and f["text"] == url and f["selectFrom"] is None, "Ctrl+L: this tab, its address selected whole")
t.ok(f["placeholder"] == "This tab: enter a web address", "placeholder: This tab: enter a web address")
t.ok(b.window()["overlay"]["kind"] == "field", "over the page, in the overlay")
b.cmd("field.open", target="here")
time.sleep(0.2)
t.ok(not field()["open"] and b.window()["overlay"]["kind"] == "none", "Ctrl+L again puts it away")
b.cmd("field.open", target="here")
b.cmd("field.escape")
time.sleep(0.2)
t.ok(not field()["open"] and b.window()["overlay"]["kind"] == "none" and b.active()["url"] == url, "Escape puts it away, the page as it was")

# Ctrl+K: the open tabs, the most recent first and already picked
b.cmd("field.summon")
time.sleep(0.2)
f = field()
t.ok(f["mode"] == "switcher" and f["placeholder"] == "Switch to an open tab", "Ctrl+K: Switch to an open tab")
t.ok(f["selected"] == 0 and all(s["how"] == "open" for s in f["suggestions"]), "open tabs only, the first picked")
t.ok(all(s["tabID"] != b.window()["activeID"] for s in f["suggestions"]), "not the tab in front")
target = f["suggestions"][0]["tabID"]
b.cmd("field.submit", text=f["shown"])
time.sleep(0.3)
t.ok(b.window()["activeID"] == target and not field()["open"], "Ctrl+K then Return: the most recent tab")
b.cmd("field.summon")
typed("zzqqxx")
f = field()
t.ok(f["suggestions"][-1]["detail"] == "Search in a new tab" and f["note"] is None, "words no tab answers: Search in a new tab")
b.cmd("field.summon")
time.sleep(0.2)
t.ok(not field()["open"], "Ctrl+K again puts it away")
b.call({"do": "field.fake", "places": []})
b.cmd("tab.new")
time.sleep(0.2)
for x in b.window()["tabs"]:
    if x["id"] != b.active()["id"]:
        b.cmd("tab.close", id=x["id"])
time.sleep(0.3)
b.cmd("field.summon")
time.sleep(0.2)
t.ok(field()["note"] == "No other tabs open", "alone: No other tabs open")
typed("abc")
t.ok(field()["note"] is None and field()["suggestions"][-1]["detail"] == "Search in this tab", "words on a blank tab: Search in this tab")
b.cmd("field.escape")

t.done()

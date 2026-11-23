#!/usr/bin/env python3
"""History and bookmarks (studio/05 §3): the Mac's files, what the field is
offered (frecency, title and address, bookmarks first), the cap, credentials
kept out, bookmarks added, moved, removed and toggled."""
import json
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b

APPLE_EPOCH = 978307200  # 1 January 2001, in seconds since 1970

b.use("data-places")
folder = b.folder()
folder.mkdir(parents=True, exist_ok=True)

# A history.json and a bookmarks.json as Search on the Mac writes them.
now_apple = time.time() - APPLE_EPOCH
(folder / "history.json").write_text(json.dumps([
    {"url": "https://maclegacy.example.test/a", "key": "stale-key", "title": "From the Mac", "count": 4, "last": now_apple - 3600},
    {"url": "https://user:secret@oldcred.example.test/page", "key": "x", "title": "Old", "count": 2, "last": now_apple - 7200},
]))
(folder / "bookmarks.json").write_text(json.dumps([
    {"id": "6F9619FF-8B86-D011-B42D-00C04FC964FF", "title": "Mac folder", "children": [
        {"id": "7F9619FF-8B86-D011-B42D-00C04FC964FF", "title": "Rust Reference", "url": "https://doc.rust-lang.org/reference/"},
    ]},
]))

b.launch()
t = b.T()


def req(name, **kw):
    return b.call({"do": name, **kw})


def offers(text, limit=3):
    return [(o["kind"], o["url"]) for o in req("data.suggest", text=text, limit=limit)["offers"]]


def saved(name):
    req("data.flush")
    return json.loads((folder / name).read_text())


# The Mac's files read as they are.
h = req("data.history")["file"]
legacy = [v for v in h if "maclegacy" in v["url"]]
t.ok(legacy and legacy[0]["count"] == 4 and legacy[0]["title"] == "From the Mac", "a Mac history.json is read")
t.ok(legacy and legacy[0]["key"] == "https://maclegacy.example.test/a", "keys come from the address, not from the file")
t.ok(not any("secret" in json.dumps(v) for v in h), "a password in an old address is dropped on reading (05 §3.5)")
t.ok(not any("secret" in json.dumps(v) for v in saved("history.json")), "and leaves history.json")
t.ok(req("data.isBookmarked", url="https://doc.rust-lang.org/reference/")["value"], "a Mac bookmarks.json is read")

# Visits: deep pages credit the front door; only http and https; no credentials.
for _ in range(3):
    req("data.visit", url="https://github.com/team/api", title="team/api")
req("data.visit", url="https://news.example.org/story/1#comments", title="Story")
req("data.visit", url="ftp://files.example.org/x", title="ftp")
req("data.visit", url="data:text/html,hi", title="data")
req("data.visit", url="https://alice:pw123@private.example.net/inbox", title="Inbox")
file = saved("history.json")
by = {v["key"]: v for v in file}
t.ok(by.get("https://github.com/team/api", {}).get("count") == 3, "a visit counts")
t.ok(by.get("https://github.com/", {}).get("count") == 3 and by["https://github.com/"]["title"] == "", "the front door counts each deep visit, untitled")
t.ok("https://news.example.org/story/1" in by, "the key has no fragment")
t.ok(not any(k.startswith(("ftp:", "data:")) for k in by), "only http and https are kept")
t.ok(not any("pw123" in json.dumps(v) for v in file) and "https://private.example.net/inbox" in by, "a name and password in the address are taken off")
keys = list(file[0].keys())
t.ok(keys == ["url", "key", "title", "count", "last"], f"the Mac's keys, in its order ({keys})")
last = by["https://github.com/team/api"]["last"]
t.ok(abs(last - (time.time() - APPLE_EPOCH)) < 60, "dates in seconds since 2001, as the Mac writes them")

# A title that lands after the visit.
req("data.visit", url="https://late.example.com/", title="")
req("data.title", url="https://late.example.com/", title="Late Title")
t.ok(any(v["title"] == "Late Title" for v in saved("history.json")), "a title that lands later is kept")

# What the field is offered (History.suggestions, Browser.placeOffers).
o = offers("git")
t.ok(o[:1] == [("history", "https://github.com/")], f"the front door first, not the deep page ({o})")
o = offers("team api")
t.ok(("history", "https://github.com/team/api") in o, f"words of the address, in any order ({o})")
o = offers("story")
t.ok(any(u.startswith("https://news.example.org/story/1") for _, u in o), f"by title ({o})")
o = offers("gmai")
t.ok(("url", "https://mail.google.com/") in o, f"a known site on the first day ({o})")
o = offers("githbu")
t.ok(o and o[0][1] == "https://github.com/", f"a typo still finds it ({o})")
t.ok(offers("") == [], "an empty field proposes nothing")
o = offers("gith")
t.ok(not any(u == "https://github.com/" and k == "url" for k, u in o), "a visited known site is not offered twice")

# Frecency: often beats once; recent beats old.
req("data.take", places=[
    {"url": "https://often.example.com/", "title": "Often", "count": 40, "daysAgo": 2},
    {"url": "https://oftenly.example.com/", "title": "Oftenly", "count": 1, "daysAgo": 2},
    {"url": "https://stale.example.com/", "title": "Stale", "count": 40, "daysAgo": 200},
    {"url": "https://staler.example.com/", "title": "Staler", "count": 3, "daysAgo": 1},
])
o = offers("often")
t.ok(o[:1] == [("history", "https://often.example.com/")], f"visited often comes first ({o})")
o = offers("stale")
t.ok(o[:1] == [("history", "https://staler.example.com/")], f"three visits yesterday beat forty half a year ago ({o})")
# Taking the same again keeps the larger count, not the sum.
req("data.take", places=[{"url": "https://often.example.com/", "title": "Often", "count": 40, "daysAgo": 2}])
t.ok({v["key"]: v for v in saved("history.json")}["https://often.example.com/"]["count"] == 40, "bringing in again doesn't double a count")

# Bookmarks first; a page both kept and visited is one row, the bookmark's.
for _ in range(5):
    req("data.visit", url="https://docs.example.com/", title="Docs home")
req("data.visit", url="https://docs.example.com/visited-only", title="Visited only")
added = b.cmd("bookmark.add", url="https://docs.example.com/design", title="Design Docs", folder=None)
t.ok(added and added["added"], "a bookmark is added")
again = b.cmd("bookmark.add", url="https://docs.example.com/design", title="Design Docs", folder=None)
t.ok(again and not again["added"], "the same address is never added twice")
o = offers("docs")
t.ok(o[:1] == [("bookmark", "https://docs.example.com/design")], f"bookmarks before history ({o})")
t.ok(("history", "https://docs.example.com/") in o, f"the front door from history stays ({o})")
b.cmd("bookmark.add", url="https://docs.example.com/", title="Docs", folder=None)
o = offers("docs")
t.ok(sum(1 for _, u in o if u == "https://docs.example.com/") == 1, f"a page both kept and visited is one row ({o})")
t.ok(("bookmark", "https://docs.example.com/") in o, f"and it is the bookmark's ({o})")
o = offers("rust reference")
t.ok(o[:1] == [("bookmark", "https://doc.rust-lang.org/reference/")], f"by name, in a folder ({o})")
o = offers("reference rust")
t.ok(o[:1] == [("bookmark", "https://doc.rust-lang.org/reference/")], f"words in any order ({o})")
t.ok(not any(k == "bookmark" for k, _ in offers("r")), "one letter offers no bookmark")
for n in ["one", "two", "three", "four"]:
    b.cmd("bookmark.add", url=f"https://zebra-{n}.example/", title=f"Zebra {n}", folder=None)
o = offers("zebra")
t.ok(len(o) == 3 and all(k == "bookmark" for k, _ in o), f"three places at most ({o})")

# The file: the Mac's shape, ids as Swift writes them.
marks = saved("bookmarks.json")
t.ok(marks[0]["title"] == "Mac folder" and list(marks[0].keys()) == ["id", "title", "children"], "a folder: id, title, children")
site = next(m for m in marks if m.get("title") == "Design Docs")
t.ok(list(site.keys()) == ["id", "title", "url"], "a site: id, title, url; no empty children")
t.ok(re.fullmatch(r"[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}", site["id"]) is not None, "ids are upper-case UUIDs, as Swift writes them")

# Folders, moving, renaming, removing.
f = b.cmd("bookmark.folder", title="Work")
b.cmd("bookmark.move", id=site["id"], folder=f["id"])
marks = saved("bookmarks.json")
work = next(m for m in marks if m["title"] == "Work")
t.ok([c["title"] for c in work.get("children", [])] == ["Design Docs"], "moved into a folder")
b.cmd("bookmark.move", id=f["id"], folder=f["id"])
t.ok(any(m["title"] == "Work" for m in saved("bookmarks.json")), "a folder can't go into itself")
b.cmd("bookmark.rename", id=site["id"], title="Design")
t.ok(saved("bookmarks.json")[[m["title"] for m in saved("bookmarks.json")].index("Work")]["children"][0]["title"] == "Design", "renamed")
nxt = b.cmd("bookmark.add", url="https://next.example.com/", title="Next")
marks = saved("bookmarks.json")
work = next(m for m in marks if m["title"] == "Work")
t.ok(any(c.get("url") == "https://next.example.com/" for c in work["children"]), "the next one goes to the folder picked last (05 §3.2)")
b.cmd("bookmark.remove", id=site["id"])
t.ok(not req("data.isBookmarked", url="https://docs.example.com/design")["value"], "removed")

# Ctrl+D on the page in front: kept, then let go.
b.cmd("field.commit", text="data:text/html,<title>Page</title>")
time.sleep(1.0)
st = b.state()
tab = b.active(st)
t.ok(b.state()["windows"][0].get("data", {}).get("bookmarked") is False, "the window says the page isn't kept")
b.cmd("bookmark.toggle")
time.sleep(0.2)
t.ok(b.state()["windows"][0]["data"]["bookmarked"] is True, "Ctrl+D keeps it, and the window says so")
b.cmd("bookmark.toggle")
time.sleep(0.2)
t.ok(b.state()["windows"][0]["data"]["bookmarked"] is False, "again lets it go")

# The cap: 2000 in the file, by score.
req("data.take", places=[{"url": f"https://bulk{n}.example.com/p", "title": f"Bulk {n}", "count": 1 + n % 7, "daysAgo": n % 90} for n in range(2600)])
file = saved("history.json")
t.ok(len(file) == 2000, f"the file keeps 2000 places ({len(file)})")
t.ok(any(v["key"] == "https://often.example.com/" for v in file), "the often visited stay")

# A file that can't be read is moved aside, never overwritten.
b.quit()
(folder / "bookmarks.json").write_text("{ not json")
b.launch()
t.ok(any(p.name.startswith("bookmarks.unreadable-") for p in folder.iterdir()), "an unreadable bookmarks.json is kept aside")
t.ok(req("data.bookmarks")["count"] == 0, "and the list starts empty")
h = req("data.history")["file"]
t.ok(any(v["key"] == "https://often.example.com/" for v in h), "history comes back after a restart")

t.done()

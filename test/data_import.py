#!/usr/bin/env python3
"""Bring Things Over without passwords (studio/05 §1): browsers found in the
Windows layout (AppData\\Local, AppData\\Roaming, a packaged Arc) and the Mac's,
profiles and the one used last, counting without decrypting, bookmarks into
the top or a folder of the browser's name, history (the last places, counts
not doubled), extensions to reinstall, what came from where, Replace, and a
bookmarks file. Made-up profiles from test/fixtures/data/make.mjs."""
import json
import os
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b

ROOT = Path(__file__).resolve().parent.parent
b.use("data-import")
folder = b.folder()
home = folder / "Import"
home.mkdir(parents=True, exist_ok=True)
subprocess.run(["node", str(ROOT / "test/fixtures/data/make.mjs"), str(home)], check=True, capture_output=True)
b.launch()
t = b.T()
SHOTS = os.environ.get("SHOTS_DIR")


def req(name, **kw):
    return b.call({"do": name, **kw})


def panel():
    return b.state()["windows"][0].get("data", {}).get("import")


def counted(source):
    def ready():
        p = panel()
        if not p or p["looking"]:
            return None
        v = next(s for s in p["sources"] if s["id"] == source)
        prof = p["chosen"].get(source, v["usual"] or "")
        return p["previews"].get(f"{source}/{prof or ''}")
    return b.wait_for(ready, what=f"{source} counted")


def bring(source, **wants):
    b.cmd("import.pick", source=source)
    counted(source)
    for k in ["passwords", "bookmarks", "history", "extensions", "replace"]:
        if k in wants:
            b.cmd("import.option", key=k, on=wants[k])
    return b.cmd("import.run")


def texts(said):
    return [s["text"] for s in said]


def saved_marks():
    req("data.flush")
    return json.loads((folder / "bookmarks.json").read_text())


# What is found, from the files alone.
found = {s["id"]: s for s in req("data.importSources")["sources"]}
t.ok(list(found) == ["Chrome", "Arc", "Brave", "Edge", "Vivaldi", "Opera GX", "Firefox"], f"the browsers on this PC, Windows and Mac layouts ({list(found)})")
chrome = found["Chrome"]
t.ok([(p["id"], p["name"]) for p in chrome["profiles"]] == [("Default", "Person 1"), ("Profile 1", "Work")], f"profiles named from Local State, no Guest Profile ({chrome['profiles']})")
t.ok(chrome["usual"] == "Profile 1", "the profile used last comes first (last_used)")
pv = chrome["preview"]
t.ok(pv["bookmarks"] == 4, f"bookmarks counted: bar, Other, Mobile; no bookmarklet ({pv['bookmarks']})")
t.ok(pv["places"] == 2, f"places: not hidden, not chrome://, visited ({pv['places']})")
t.ok(pv["passwords"] == 7 and pv["passwordsLocked"] == 2 and pv["passwordsReadable"] == 5,
     f"passwords counted from both files, v20 apart, nothing decrypted ({pv['passwords']}, {pv['passwordsReadable']}, {pv['passwordsLocked']})")
t.ok(chrome["canBring"] == "Bookmarks, history and passwords", f"what it can bring ({chrome['canBring']})")
gx = found["Opera GX"]
t.ok(sorted(p["id"] for p in gx["profiles"]) == [".", "_side_profiles/a1b2c3"], f"Opera GX: its own folder and its side profile ({gx['profiles']})")
t.ok(found["Arc"]["preview"]["bookmarks"] == 1, "Arc from its packaged folder")
ff = found["Firefox"]
t.ok(ff["usual"] == "abcd1234.default-release" and {p["name"] for p in ff["profiles"]} == {"default-release", "locked-one"},
     f"Firefox: profiles.ini names, the Install section's default ({ff['usual']})")
t.ok(ff["preview"]["bookmarks"] == 4 and ff["preview"]["places"] == 1, f"Firefox counted: tags left out, hidden left out ({ff['preview']})")
t.ok(found["Brave"]["preview"]["places"] == 1, "Brave in the Mac's layout")

# The panel.
b.cmd("import.open")
p = b.wait_for(lambda: (panel() or {}).get("looking") is False and panel(), what="panel")
t.ok(b.window()["overlay"]["kind"] == "panel", "the panel floats over the page")
t.ok(p["pick"] == "Chrome", "the first browser is picked")
counted("Chrome")
time.sleep(0.4)
text = b.ui("document.body.innerText", root="overlay")
for want in ["Bring things over", "Nothing in the other browser changes.", "On this PC", "Chrome", "2 profiles · 4 bookmarks · 2 places · 7 passwords",
             "In a “Chrome” folder, or at the top if you have none yet", "The last 2 places", "Bring them in", "File…"]:
    t.ok(want in text, f"the panel says {want!r}")
t.ok("Most recent: Work" in b.ui("document.querySelector('.bt-profile').innerText", root="overlay"), "Profile: Most recent: Work")
t.ok("Oriel" in text, "the app is called Oriel")
if SHOTS:
    b.shot(f"{SHOTS}/data-import-panel.png")

# Chrome first: its bookmarks become the top level.
said = texts(bring("Chrome", passwords=False))
t.ok(said == ["4 bookmarks", "2 places"], f"said after ({said})")
marks = saved_marks()
t.ok([m["title"] for m in marks] == ["Work Wiki", "Tools", "Other", "Mobile"], f"at the top, the bar first, then Other and Mobile ({[m['title'] for m in marks]})")
t.ok(req("data.isBookmarked", url="https://ci.work.example/")["value"], "folders and all")
h = {v["key"]: v for v in req("data.history")["file"]}
t.ok(h.get("https://wiki.work.example/", {}).get("count") == 30, "history with its counts")
t.ok("https://hidden.work.example/" not in h and not any(k.startswith("chrome:") for k in h), "hidden and chrome:// pages left out")
offers = [o["url"] for o in req("data.suggest", text="wiki")["offers"]]
t.ok("https://wiki.work.example/" in offers, "the field knows it at once")
rec = req("data.records")["records"]["Chrome"]
t.ok(rec["bookmarks"] == 4 and rec["places"] == 2 and len(rec["bookmarkIDs"]) == 7, f"what came from Chrome is remembered ({rec['bookmarks']}, {rec['places']}, {len(rec['bookmarkIDs'])})")
p = panel()
chrome_view = next(s for s in p["sources"] if s["id"] == "Chrome")
t.ok(chrome_view.get("record", {}).get("bookmarks") == 4, "the row says it was brought")
time.sleep(0.3)
text = b.ui("document.body.innerText", root="overlay")
t.ok("Brought before" in text and "4 bookmarks and 2 places," in text, "Brought before, in a line")
t.ok("Replace what came from Chrome before" in text, "Replace is offered once something came")

# Again: nothing twice; counts kept, not added.
said = texts(bring("Chrome", passwords=False))
t.ok(said == ["0 new bookmarks, 4 already here", "2 places"], f"again: already here ({said})")
h = {v["key"]: v for v in req("data.history")["file"]}
t.ok(h["https://wiki.work.example/"]["count"] == 30, "history counts not doubled")

# Brave, from the Mac's layout: into a folder of its name.
said = texts(bring("Brave", passwords=False))
marks = saved_marks()
brave = next((m for m in marks if m["title"] == "Brave"), None)
t.ok(brave and [c["title"] for c in brave["children"]] == ["Brave Search"], "another browser's bookmarks in a folder of its name")
t.ok(said[0] == "1 bookmarks", f"said as the Mac says it ({said})")

# Firefox: bookmarks from places.sqlite, the profile in use only.
said = texts(bring("Firefox", passwords=False))
marks = saved_marks()
fox = next((m for m in marks if m["title"] == "Firefox"), None)
t.ok(fox and [c["title"] for c in fox["children"]] == ["MDN", "Reading", "Menu Site", "Other"], f"Firefox: toolbar, menu, Other ({fox and [c['title'] for c in fox['children']]})")
t.ok(not req("data.isBookmarked", url="https://tagged.example/")["value"], "Firefox's tags are not bookmarks")
t.ok(not req("data.isBookmarked", url="https://locked.fox.example/")["value"], "only the profile in use")
t.ok("1 places" in said, f"Firefox history ({said})")

# Replace: what came from Chrome goes, a folder you added to stays.
tools = next(m for m in saved_marks() if m["title"] == "Tools")
b.cmd("bookmark.add", url="https://mine.example/", title="Mine", folder=tools["id"])
work = home / "AppData/Local/Google/Chrome/User Data/Profile 1/Bookmarks"
data = json.loads(work.read_text())
data["roots"]["bookmark_bar"]["children"] = [c for c in data["roots"]["bookmark_bar"]["children"] if c.get("name") != "Work Wiki"]
data["roots"]["bookmark_bar"]["children"].append({"id": "99", "type": "url", "name": "New Wiki", "url": "https://newwiki.work.example/"})
work.write_text(json.dumps(data))
b.cmd("import.close")
b.cmd("import.open", source="Chrome")
b.wait_for(lambda: (panel() or {}).get("looking") is False, what="panel again")
said = texts(bring("Chrome", passwords=False, history=False, replace=True))
marks = saved_marks()
t.ok(not req("data.isBookmarked", url="https://wiki.work.example/")["value"], "Replace: what Chrome no longer has went")
t.ok(req("data.isBookmarked", url="https://newwiki.work.example/")["value"], "and what it has now came")
tools = next((m for m in marks if m["title"] == "Tools"), None)
t.ok(tools and {c["title"] for c in tools["children"]} == {"Mine", "CI"}, f"a folder you put something in stays, with it ({tools})")
t.ok(said[0] == "4 bookmarks", f"said ({said})")

# Replace with a file that can't be read: nothing taken out.
work.write_text("{ broken")
said = texts(bring("Chrome", passwords=False, history=False, replace=True))
t.ok(said and said[0].startswith("Couldn't read all of Chrome's bookmarks: what came from it before was kept"), f"an unreadable file is not an empty browser ({said})")
t.ok(req("data.isBookmarked", url="https://newwiki.work.example/")["value"], "what came before is still here")

# Extensions: the Default profile's, from the Web Store, by id.
b.cmd("import.profile", source="Chrome", profile="Default")
pv = counted("Chrome")
t.ok(pv["extensions"] == ["cjpalhdlnbpafiamejdnhcphjbkeiagm", "nngceckbapebfimnlniiiahkandclblb"],
     f"only the person's, from the Chrome Web Store: not built in, not themes, not Edge's ({pv['extensions']})")
time.sleep(0.3)
t.ok("2 found: installed fresh from the Chrome Web Store, you say yes to each one" in b.ui("document.body.innerText", root="overlay"), "the extensions line")
said = texts(bring("Chrome", passwords=False, bookmarks=False, history=False, extensions=True))
t.ok(said == ["2 extensions to confirm"], f"handed to the extensions module ({said})")

# All profiles.
b.cmd("import.profile", source="Chrome", profile="")
pv = counted("Chrome")
t.ok(pv["bookmarks"] == 1, f"All profiles: the readable ones ({pv['bookmarks']})")

# A bookmarks file another browser exported.
said = b.cmd("import.file", path=str(home / "Exports/bookmarks.html"))["said"]
t.ok(texts(said) == ["2 bookmarks"], f"a Netscape file ({texts(said)})")
marks = saved_marks()
page = next((m for m in marks if m["title"] == "bookmarks"), None)
titles = [c["title"] for c in (page or {}).get("children", [])]
t.ok(titles == ["Bar & Grill", "Recipes"], f"the bar's pages first, entities decoded ({titles})")
t.ok(page and page["children"][1]["children"][0]["title"] == "Pasta été", "numbered entities decoded")

b.cmd("import.close")
time.sleep(0.2)
t.ok(b.window()["overlay"]["kind"] == "none", "closed")
t.done()

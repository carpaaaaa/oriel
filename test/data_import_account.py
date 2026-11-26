#!/usr/bin/env python3
"""Chrome signed in to a Google account keeps its bookmarks apart, in
AccountBookmarks (the same format as Bookmarks), and the local file can be
empty or missing: Oriel read only Bookmarks and found none to bring in (a
friend's Chrome, 26 Nov 2026). Both files are read now, as one: a profile
with only the account's brings them; with both, a bookmark both hold comes
once and a folder of the same name takes the bookmarks of both."""
import json
import os
import subprocess
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b

ROOT = Path(__file__).resolve().parent.parent
t = b.T()


def req(name, **kw):
    return b.call({"do": name, **kw})


def saved_marks():
    req("data.flush")
    return json.loads((b.folder() / "bookmarks.json").read_text(encoding="utf-8"))


def titles(nodes):
    return [n["title"] for n in nodes]


def flat(nodes):
    for n in nodes:
        if n.get("children") is not None:
            yield from flat(n["children"])
        else:
            yield n["url"]


def bring_chrome():
    b.cmd("import.open", source="Chrome")
    b.wait_for(lambda: (b.state()["windows"][0].get("data", {}).get("import") or {}).get("looking") is False, what="panel")
    b.cmd("import.pick", source="Chrome")

    def ready():
        p = b.state()["windows"][0].get("data", {}).get("import")
        if not p or p["looking"]:
            return None
        v = next(s for s in p["sources"] if s["id"] == "Chrome")
        return p["previews"].get(f"Chrome/{p['chosen'].get('Chrome', v['usual'] or '') or ''}")
    preview = b.wait_for(ready, what="Chrome counted")
    for k, on in (("passwords", False), ("history", False), ("extensions", False)):
        b.cmd("import.option", key=k, on=on)
    b.cmd("import.run")
    return preview


def world(name):
    b.use(name)
    home = b.folder() / "Import"
    home.mkdir(parents=True, exist_ok=True)
    subprocess.run(["node", str(ROOT / "test/fixtures/data/make.mjs"), str(home)], check=True, stdout=subprocess.DEVNULL)
    return home / "AppData/Local/Google/Chrome/User Data/Profile 1"


# 1. Only the account's file: its bookmarks come, as the local file's did.
work = world("data-import-account-only")
(work / "Bookmarks").rename(work / "AccountBookmarks")
b.launch()
preview = bring_chrome()
t.ok(preview["bookmarks"] > 0, f"a profile with only AccountBookmarks has bookmarks to bring ({preview['bookmarks']})")
marks = saved_marks()
t.ok(titles(marks) == ["Work Wiki", "Tools", "Other", "Mobile"], f"the bar first, then Other and Mobile, as with Bookmarks ({titles(marks)})")
t.ok("https://wiki.work.example/" in set(flat(marks)), "the account's bookmarks are there")
b.quit()

# 2. Both files: one of each, a bookmark both hold once.
work = world("data-import-account-both")
local = json.loads((work / "Bookmarks").read_text(encoding="utf-8"))
account = json.loads((work / "Bookmarks").read_text(encoding="utf-8"))
account["roots"]["bookmark_bar"]["children"].append({"id": "98", "type": "url", "name": "Account Only", "url": "https://account.only.example/"})
local["roots"]["bookmark_bar"]["children"].append({"id": "97", "type": "url", "name": "Local Only", "url": "https://local.only.example/"})
(work / "Bookmarks").write_text(json.dumps(local))
(work / "AccountBookmarks").write_text(json.dumps(account))
b.launch()
bring_chrome()
urls = list(flat(saved_marks()))
t.ok("https://account.only.example/" in urls and "https://local.only.example/" in urls, "the bookmarks of both files come")
t.ok(urls.count("https://wiki.work.example/") == 1, "a bookmark both hold comes once")
t.ok(not b.state().get("errors"), "no error in the main process")
b.quit()
t.done()

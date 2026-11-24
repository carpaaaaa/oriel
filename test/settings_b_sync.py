#!/usr/bin/env python3
"""Settings' area B: Sync with your other computers (sync.folder; studio/05
§4.2, §4.5.2; Sync.swift, SyncMerge.swift). The other computer is a Mac's
file, written here as Search on a Mac writes it, so the test is also that
Oriel and Search read each other's files."""
import json
import shutil
import sys
import tempfile
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b  # noqa: E402
import tabs_kit as k  # noqa: E402

FIRST = "00000000-0000-0000-0000-000000000001"
PROFILE = "profile-00000000-0000-0000-0000-0000000000A1"
MAC = "9F1B6C3E-1D2A-4B5C-8D7E-0F1A2B3C4D5E"
W = "6C1F0A52-3B7D-4E8A-9C21-5D4E3F2A1B0C"
P = "1E2D3C4B-5A69-4788-9766-554433221100"
B = "A1B2C3D4-E5F6-4711-8899-AABBCCDDEEFF"

t = b.T()
k.world("settings-b-sync")
k.launch()
share = Path(tempfile.mkdtemp(prefix="oriel-sync-"))
inside = share / "Search Sync"
values = lambda: b.cmd("settings.values")
prefs = lambda: values()["prefs"]
sync = lambda: b.call({"do": "settingsb.sync"})
run = lambda: b.call({"do": "settingsb.syncPass"}, timeout=60)


def mac_file(scope, items):
    """The Mac's file, as SyncFile with JSONEncoder(.sortedKeys) has it."""
    (inside / scope).mkdir(parents=True, exist_ok=True)
    f = {"device": MAC, "format": 1, "items": items, "name": "MacBook Air", "scope": scope, "written": time.time()}
    (inside / scope / f"{MAC}.json").write_text(json.dumps(f, sort_keys=True))


def own(scope):
    f = inside / scope / f"{sync()['device']}.json"
    return json.loads(f.read_text()) if f.exists() else None


def e(v, at=1000.0):
    return {"d": MAC, "t": at, "v": json.dumps(v, sort_keys=True, separators=(",", ":"))} if v is not None else {"d": MAC, "t": at}


# What this PC has before it joins.
mine = k.page("mine")
b.cmd("bookmark.add", url=k.url("mine"), title="Mine")
k.cmd("tab.pin", id=mine); time.sleep(0.4)
b.cmd("settings.set", id="quit.confirm", value=True)
b.wait_for(lambda: (k.read("bookmarks.json") or []) != [], what="bookmark written")
mine_bm = k.read("bookmarks.json")[0]["id"]

# The Mac was there first.
mac_file("app", {
    "set:shield": e(False), "set:look": e("dark"), "set:quit.confirm": e(False),
    "set:future.thing": e(1),
})
mac_file(PROFILE, {
    f"space:{FIRST}": e({"colour": 0, "name": "Personal"}),
    f"space:{W}": e({"colour": 3, "icon": "briefcase", "name": "Work", "sharesSignIns": True}),
    "order:spaces": e([FIRST, W]),
    f"gradient:{W}": e({"angle": 135, "colours": ["#00B7A8", "#53A3F2"], "grain": False}),
    f"strength:{W}": e("rich"),
    f"pin:{W}:{P}": e({"home": "https://mac.example/", "letter": "M"}),
    f"title:pin:{P}": e("From the Mac"),
    f"order:pins:{W}": e([P]),
    f"bm:{B}": e({"title": "Mac bookmark", "url": "https://mac.example/b"}),
    "kids:root": e([B]),
})

t.ok(not sync()["on"], "off, as it comes")
b.call({"do": "settings.answers", "folder": str(share)})
b.cmd("settings.set", id="sync", value=True)
b.wait_for(lambda: sync()["on"], what="sync on")
run()
p = prefs()
t.ok(p["sync.folder"] == str(share), "on: the folder chosen in the Settings row")
t.ok(p["shield"] is False and p["look"] == "dark" and p["quit.confirm"] is False, "joining: where both have a setting, the folder's wins")
spaces = {s["id"]: s for s in k.read("spaces.json")}
w = spaces.get(W)
t.ok(w and w["name"] == "Work" and w["colour"] == 3 and w.get("icon") == "briefcase", "the Mac's space comes, its name, colour and icon")
t.ok(w and w.get("gradient", {}).get("colours") == ["#00B7A8", "#53A3F2"] and w.get("strength") == "rich", "with its gradient and strength")
pins = k.read("pins.json")
t.ok([x["id"] for x in pins.get(W, [])] == [P] and pins[W][0]["title"] == "From the Mac", "its pin, titled as agreed")
t.ok(len(pins.get(FIRST, [])) == 1, "this PC's own pin stays: nothing here is lost")
titles = lambda: [x["title"] for x in k.read("bookmarks.json") or []]
b.wait_for(lambda: titles() == ["Mac bookmark", "Mine"], what=f"bookmarks merged ({titles()})")
t.ok(True, "bookmarks: the Mac's, and this PC's own after them")
app = own("app")
t.ok(app and app["format"] == 1 and app["scope"] == "app" and app["name"] and app["device"] == sync()["device"], "this PC's own file, in the Mac's format")
t.ok(app and app["items"]["set:shield"] == e(False) and app["items"]["set:future.thing"] == e(1), "the winning entries as the Mac stamped them; an item it can't read travels untouched")
prof = own(PROFILE)
t.ok(prof and prof["items"][f"space:{FIRST}"]["v"] == '{"colour":0,"name":"Personal"}', "the same text Search on a Mac writes for a space")
t.ok(prof and not any(key.startswith(("tab", "session", "history")) for key in prof["items"]), "never open tabs or history")
t.ok(sync()["summary"].endswith(", with MacBook Air") and values()["facts"]["sync"] == sync()["summary"], "the row says the folder and the Mac it syncs with")

# A change here wins over what the Mac said before.
k.cmd("space.rename", id=W, name="Work stuff"); time.sleep(0.3)
run()
x = own(PROFILE)["items"][f"space:{W}"]
t.ok('"name":"Work stuff"' in x["v"] and x["d"] == sync()["device"] and x["t"] > 1000, "renamed here: stamped later, with this PC's id")
t.ok(json.loads(own(PROFILE)["items"]["kids:root"]["v"]) == [B, mine_bm], "this PC's bookmark now in the folder's list too")

# The Mac changes later: the folder's change is seen and applied.
later = time.time() + 60
mac_file("app", {"set:shield": e(False), "set:look": e("dark"), "set:quit.confirm": e(True, later), "set:future.thing": e(1)})
items = json.loads((inside / PROFILE / f"{MAC}.json").read_text())["items"]
items[f"bm:{B}"] = e(None, later)
items["kids:root"] = e([mine_bm], later)
mac_file(PROFILE, items)
b.wait_for(lambda: prefs()["quit.confirm"] is True and [x["title"] for x in k.read("bookmarks.json")] == ["Mine"], within=40, what="the Mac's later change")
t.ok(True, "a file in the folder changing: a pass soon; a later setting and a deleted bookmark arrive")

# Off: this PC's files leave the folder; what is here stays.
b.cmd("settings.set", id="sync", value=False)
b.wait_for(lambda: not sync()["on"], what="off")
t.ok(own("app") is None and own(PROFILE) is None and not (b.folder() / "sync-app.json").exists(), "off: this PC's files leave the folder, what it agreed forgotten")
t.ok(W in {s["id"] for s in k.read("spaces.json")}, "and what came stays")
mac_file("app", {"set:shield": e(True, later + 60)})
run(); time.sleep(0.5)
t.ok(prefs()["shield"] is False, "off: the folder's changes are not read")

# A folder that isn't there: nothing happens, the row says why.
b.call({"do": "settings.answers", "folder": str(share / "gone")})
b.cmd("settings.set", id="sync", value=True)
b.wait_for(lambda: sync()["on"], what="on again")
run()
t.ok(sync()["summary"].endswith(": the folder isn’t there") and prefs()["shield"] is False, "a folder not there: nothing changes, the row says so")
b.cmd("settings.set", id="sync", value=False)
shutil.rmtree(share, ignore_errors=True)
t.done()

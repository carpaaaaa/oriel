#!/usr/bin/env python3
"""Window states for building the interface without the main process
(test/fixtures/window-state-*.json), and the check that they hold.

    python3 test/tabs_fixtures.py           # check the fixtures
    python3 test/tabs_fixtures.py --write   # make them again from Oriel itself

Each is a WindowState as the main process sends it (src/shared/state.ts and
src/shared/modules/tabs.ts), taken from a real run: session files written by
hand (the Mac's format), Oriel started on them, its state read. Tabs other
than the one in front come back asleep, so nothing is fetched but a local
page, whose address is then written as a real site's."""
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b  # noqa: E402

FIX = Path(__file__).resolve().parent / "fixtures"
FIRST = "00000000-0000-0000-0000-000000000001"
APPLE = 978307200

KEYS = {"rev", "windowID", "chrome", "look", "focused", "maximized", "fullScreen", "controlsWidth", "space", "spaces",
        "tabs", "pins", "pinFolders", "groups", "splits", "activeID", "sidebar", "field", "extensions", "downloads", "prefs"}
TAB = {"id", "url", "title", "loading", "audible", "muted", "asleep", "empty", "canGoBack", "canGoForward"}


def check():
    t = b.T()
    files = sorted(FIX.glob("window-state-*.json"))
    t.ok(len(files) >= 4, f"{len(files)} fixtures")
    for f in files:
        s = json.loads(f.read_text())
        name = f.stem
        t.ok(KEYS <= set(s), f"{name}: every WindowState key")
        ids = [x["id"] for x in s["tabs"]]
        t.ok(all(TAB <= set(x) and x.get("label") for x in s["tabs"]), f"{name}: every tab has TabView's keys and a label")
        t.ok(s["activeID"] in ids, f"{name}: the tab in front is in the row")
        t.ok(all(p["tabID"] in ids and p.get("letter") for p in s["pins"]), f"{name}: each pin has its tab and letter")
        t.ok(ids[:len(s["pins"])] == [p["tabID"] for p in s["pins"]], f"{name}: the pins first in the row, in order")
        groups = {g["id"] for g in s["groups"]}
        t.ok(all(x.get("groupID") in groups for x in s["tabs"] if x.get("groupID")), f"{name}: grouped tabs in groups it has")
        t.ok(s["space"] in [x["id"] for x in s["spaces"]], f"{name}: the space on screen is a space")
        folders = {x["id"] for x in s["pinFolders"]}
        t.ok(all(p["folder"] in folders for p in s["pins"] if p.get("folder")), f"{name}: pin folders that exist")
        t.ok("127.0.0.1" not in f.read_text(), f"{name}: no test addresses left")
    t.done()


def write():
    import tabs_kit as k

    def entry(url, title, **kw):
        e = {"url": url, "title": title, "muted": False, "touched": time.time() - APPLE - 3600}
        e.update(kw)
        return e

    def dump(name, i=0, patch=None, real=None):
        s = b.state()["windows"][i]
        for key in ("bounds", "overlay"):
            s.pop(key, None)
        text = json.dumps(s, indent=1, ensure_ascii=False)
        for local, site in (real or {}).items():
            origin = "/".join(site[0].split("/")[:3])
            text = text.replace(k.url("favicon.ico"), origin + "/favicon.ico")
            text = text.replace(k.url(local), site[0]).replace(f'"{local}"', json.dumps(site[1]))
        s = json.loads(text)
        if patch:
            patch(s)
        s["rev"] = 1
        FIX.mkdir(exist_ok=True)
        (FIX / f"window-state-{name}.json").write_text(json.dumps(s, indent=1, ensure_ascii=False) + "\n")
        print("wrote", name, len(s["tabs"]), "tabs")

    def files(world, session=None, pins=None, folders=None, space_list=None, others=None, **prefs):
        k.world(world, **prefs)
        d = b.folder()
        d.mkdir(parents=True, exist_ok=True)
        if session is not None:
            (d / "session.json").write_text(json.dumps(session))
        if pins is not None:
            (d / "pins.json").write_text(json.dumps(pins))
        if folders is not None:
            (d / "pin-folders.json").write_text(json.dumps(folders))
        if space_list is not None:
            (d / "spaces.json").write_text(json.dumps(space_list))
        for fname, shape in (others or {}).items():
            (d / fname).write_text(json.dumps(shape))

    def front_local(name):
        b.wait_for(lambda: (x := k.active()) and x["live"] and not x["loading"], what=f"{name} in front")
        time.sleep(0.4)

    U = "https://"
    pin_ids = ["6F1C1A0E-0D4B-4F5B-9C3A-1E5B2C7D8A01", "6F1C1A0E-0D4B-4F5B-9C3A-1E5B2C7D8A02", "6F1C1A0E-0D4B-4F5B-9C3A-1E5B2C7D8A03",
               "6F1C1A0E-0D4B-4F5B-9C3A-1E5B2C7D8A04", "6F1C1A0E-0D4B-4F5B-9C3A-1E5B2C7D8A05"]
    G1, G2 = "2B7E9F10-5C3D-4A8B-8E21-77C1D0A4B001", "2B7E9F10-5C3D-4A8B-8E21-77C1D0A4B002"
    pins = [
        {"id": pin_ids[0], "letter": "M", "home": U + "mail.google.com/mail/u/0/", "title": "Inbox", "titled": True},
        {"id": pin_ids[1], "letter": "C", "home": U + "calendar.google.com/", "title": "Calendar", "titled": True},
        {"id": pin_ids[2], "letter": "G", "home": U + "github.com/", "title": "GitHub"},
        {"id": pin_ids[3], "letter": "F", "home": U + "www.figma.com/files/recent", "title": "Figma", "titled": True},
    ]

    # 1. Many tabs: square pins, an open group, a folded one, a named tab, a muted one.
    tabs = [entry(p["home"], p["title"], pin=p["letter"], pinID=p["id"], home=p["home"]) for p in pins]
    titles = ["Hacker News", "The Verge", "Electron: WebContentsView", "MDN: Array.prototype.flatMap", "Stack Overflow: Solid reconcile",
              "Wikipedia: Oriel window", "YouTube: Lo-fi beats", "Linear: Oriel board", "Notion: Notes", "Vercel dashboard",
              "Google Docs: Plan", "Reddit: r/electronjs", "npm: solid-js", "Chromium Code Search", "Figma: Column v3",
              "Apple Developer: Liquid Glass", "Spotify: Focus", "Weather in Milan", "Maps: Duomo", "Booking: Lisbon"]
    hosts = ["news.ycombinator.com/", "www.theverge.com/", "www.electronjs.org/docs/latest/api/web-contents-view", "developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/flatMap",
             "stackoverflow.com/questions/1", "en.wikipedia.org/wiki/Oriel_window", "www.youtube.com/watch?v=jfKfPfyJRdk", "linear.app/oriel", "www.notion.so/notes",
             "vercel.com/dashboard", "docs.google.com/document/d/1", "www.reddit.com/r/electronjs/", "www.npmjs.com/package/solid-js", "source.chromium.org/",
             "www.figma.com/file/1", "developer.apple.com/design/", "open.spotify.com/", "weather.com/", "maps.google.com/", "www.booking.com/"]
    for i, (h, title) in enumerate(zip(hosts, titles)):
        kw = {}
        if i in (2, 3, 4):
            kw["groupID"] = G1
        if i in (7, 8, 9):
            kw["groupID"] = G2
        if i == 6:
            kw["muted"] = True
        if i == 10:
            kw["name"] = "The plan"
        tabs.append(entry(U + h, title, **kw))
    tabs.append(entry(k.url("front"), "front"))
    session = {"tabs": tabs, "active": len(tabs) - 1,
               "groups": [{"id": G1, "name": "Electron", "collapsed": False, "colour": 1},
                          {"id": G2, "name": "Work", "collapsed": True, "colour": 3}], "splits": []}
    files("tabs-fix-many", session=session, pins={FIRST: pins})
    b.launch(); front_local("front")
    def many(s):
        by = {x["label"]: x for x in s["tabs"]}
        by["YouTube: Lo-fi beats"]["audible"] = True
        by["Hacker News"].update(asleep=False, loading=True)
        by["The Verge"].update(asleep=False, error={"code": -105, "description": "Couldn't find this site.\nCheck the address or your connection.", "url": U + "www.theverge.com/"})
    dump("many", patch=many, real={"front": (U + "www.figma.com/design/oriel-column", "Oriel column, Figma")})
    b.quit()

    # 2. Pinned rows in folders, pins every space shows (Arc's sidebar).
    F1, F2, F3 = "9A0D1E2F-3B4C-4D5E-8F60-718293A4B5C1", "9A0D1E2F-3B4C-4D5E-8F60-718293A4B5C2", "9A0D1E2F-3B4C-4D5E-8F60-718293A4B5C3"
    rows = [
        {"id": pin_ids[4], "letter": "O", "home": U + "oriel.app/", "title": "Oriel", "listed": True, "titled": True},
        {"id": "6F1C1A0E-0D4B-4F5B-9C3A-1E5B2C7D8A06", "letter": "D", "home": U + "docs.google.com/", "title": "Docs", "listed": True, "folder": F1, "titled": True},
        {"id": "6F1C1A0E-0D4B-4F5B-9C3A-1E5B2C7D8A07", "letter": "S", "home": U + "sheets.google.com/", "title": "Sheets", "listed": True, "folder": F1, "titled": True},
        {"id": "6F1C1A0E-0D4B-4F5B-9C3A-1E5B2C7D8A08", "letter": "L", "home": U + "linear.app/", "title": "Linear", "listed": True, "folder": F2, "titled": True},
        {"id": "6F1C1A0E-0D4B-4F5B-9C3A-1E5B2C7D8A09", "letter": "R", "home": U + "www.reddit.com/", "title": "Reddit", "listed": True, "folder": F3, "titled": True},
    ]
    tabs = [entry(p["home"], p["title"], pin=p["letter"], pinID=p["id"], home=p["home"], listed=True) for p in rows] + [entry(k.url("front"), "front")]
    files("tabs-fix-rows", session={"tabs": tabs, "active": len(tabs) - 1, "splits": []},
          pins={FIRST: rows, "shared": pins[:2]},
          folders={FIRST: [{"id": F1, "name": "Writing", "collapsed": False}, {"id": F2, "name": "Work", "collapsed": False, "parent": F1},
                           {"id": F3, "name": "Later", "collapsed": True}]},
          **{"pins.list": True, "pins.folders": True, "spaces": True})
    b.launch(); front_local("front")
    dump("pin-rows", real={"front": (U + "www.are.na/oriel", "Oriel references")})
    b.quit()

    # 3. Spaces: three, the window on the second, signed out, with its own row.
    W, H = "4C2E8D1A-6B3F-4E7A-9D10-2F8C5B7E1A01", "4C2E8D1A-6B3F-4E7A-9D10-2F8C5B7E1A02"
    spaces = [{"id": FIRST, "name": "Personal", "colour": 0},
              {"id": W, "name": "Work", "colour": 1, "icon": "briefcase", "sharesSignIns": True},
              {"id": H, "name": "Studio", "colour": 5, "icon": "paintpalette", "sharesSignIns": False, "gradient": {"colours": ["#8E6CFF", "#FF7AB6"], "angle": 135}, "strength": "rich"}]
    work = {"tabs": [entry(U + "linear.app/oriel", "Oriel · Linear"), entry(U + "github.com/carpaaaaa/oriel/pulls", "Pull requests"), entry(k.url("front"), "front")],
            "active": 2, "groups": [], "splits": []}
    files("tabs-fix-spaces", session={"tabs": [entry(U + "news.ycombinator.com/", "Hacker News")], "active": 0, "splits": []},
          space_list=spaces, others={f"session-{W}.json": work}, **{"spaces": True})
    (b.folder() / "windows.json").write_text(json.dumps([{"id": "7D3C1B2A-0000-4000-8000-000000000001", "space": W, "rows": {}}]))
    b.launch(); front_local("front")
    dump("spaces", real={"front": (U + "vercel.com/oriel/deployments", "Deployments · Vercel")})
    b.quit()

    # 4. A new window: one empty tab, the field in its place.
    files("tabs-fix-empty")
    b.launch(); time.sleep(0.6)
    dump("empty")
    b.quit()

    # 5. Tabs across the top: pins, a group, two tabs picked, ⌃Tab held.
    tabs = [entry(p["home"], p["title"], pin=p["letter"], pinID=p["id"], home=p["home"]) for p in pins[:2]]
    tabs += [entry(U + "www.youtube.com/", "YouTube", groupID=G1), entry(U + "music.youtube.com/", "YouTube Music", groupID=G1),
             entry(U + "www.bbc.com/news", "BBC News"), entry(U + "www.corriere.it/", "Corriere della Sera"), entry(k.url("front"), "front")]
    files("tabs-fix-top", session={"tabs": tabs, "active": len(tabs) - 1, "groups": [{"id": G1, "name": "Watch", "collapsed": False, "colour": 4}], "splits": []},
          pins={FIRST: pins[:2]}, **{"tabs.layout": "top"})
    b.launch(); front_local("front")
    w = b.state()["windows"][0]
    loose = [x["id"] for x in w["tabs"] if not x.get("pinID") and not x.get("groupID")]
    b.cmd("tab.pick", id=loose[0], mode="toggle")
    b.cmd("tab.switch", by=1)
    dump("top", real={"front": (U + "www.nytimes.com/", "The New York Times")})
    b.quit()


if __name__ == "__main__":
    if "--write" in sys.argv:
        write()
    check()

#!/usr/bin/env python3
"""Everything a person can change comes back at the next launch (studio/01
§1.2, §1.4, §1.10, §9.1-§9.11; studio/06 §1.15-§1.17): settings, windows
(place, size, maximized, full screen, snapped, monitor, the space shown, the
column folded, its width and side, tabs on top), each space's tabs with the
one in front, groups and splits, pins and their folders, spaces (name,
colour, icon, gradient, order), extensions (on, off, pinned, the side
panel's width), site permissions and zoom, search engine and site searches,
themes, changed shortcuts, history, bookmarks, passwords, downloads,
cookies and site storage.

First after a normal quit, then each ending that is not one, changes made a
moment before (still waiting in their timers): SIGTERM and SIGINT (Task
Manager, Ctrl+C; not on Windows, which has no such signals), Windows ending
the session (query-session-end, session-end, then the process killed at
once) and the Mac's and Linux's shutdown.

What the Mac doesn't keep on purpose is checked as not kept: private tabs,
⇧⌘T's closed tabs and windows, a tab's back and forward (studio/01 §1.6,
§2.24, §2.35, §3.x "ghosts")."""
import json
import os
import re
import signal
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b  # noqa: E402
import tabs_kit as k  # noqa: E402
import settings_web as web  # noqa: E402

FIRST = "00000000-0000-0000-0000-000000000001"
STUDIO = "5E4C0000-0000-4000-8000-0000000000A7"
IS_WIN = sys.platform == "win32"
API = Path(__file__).resolve().parent / "fixtures" / "api-test"
DNR = Path(__file__).resolve().parent / "fixtures" / "dnr-test"
_server, ORIGIN = web.start()
web.PAGES["/files"] = "<title>files</title><body>files</body>"

t = b.T()


# reading what Oriel shows (never the files: what comes back is what counts)

def placement():
    return b.call({"do": "persist.placement"})


def pid():
    return placement()["pid"]


def place_of(p):
    """A window's place as compared: the file's fields, the monitor by id."""
    out = {key: p.get(key) for key in ("frame", "maximized", "fullScreen", "snapped")}
    out["display"] = (p.get("display") or {}).get("id")
    return out


def row_view(s, i):
    w = k.win(s, i)
    tabs = w["tabs"]
    name = lambda id: next((k.name_of(x["url"]) or x["label"] for x in tabs if x["id"] == id), None)
    groups = {g["id"]: g for g in w["groups"]}
    return {
        "tabs": [(k.name_of(x["url"]), x["label"], bool(x.get("muted")), bool(x.get("pinID")), groups.get(x.get("groupID"), {}).get("name"))
                 for x in tabs if not x["empty"]],
        "front": name(w["activeID"]),
        "groups": sorted((g["name"], g["colour"], bool(g["folded"])) for g in w["groups"]),
        "splits": [([name(id) for id in sp["tabs"]], [round(x, 3) for x in sp["sizes"]]) for sp in w["splits"]],
    }


def snapshot():
    """Everything compared, the window shown as it was left."""
    s = b.state()
    ts = k.st()
    # What each key is worth (a key set back to its default is no key at all).
    values = b.cmd("settings.values")["prefs"]
    snap = {"prefs": {key: values.get(key) for key in WATCHED}}
    snap["spaces"] = [(x["id"], x["name"], x["colour"], x.get("icon"), json.dumps(x.get("gradient"), sort_keys=True), x.get("strength")) for x in s["spaces"]]
    snap["pins"] = sorted((p["id"], p.get("letter"), k.name_of(p.get("home")), p["space"], bool(p.get("listed")), p.get("name")) for p in s["pins"])
    snap["folders"] = {sp: sorted((f["name"], bool(f.get("collapsed"))) for f in fs) for sp, fs in ts["folders"].items()}
    places = {w["id"]: w for w in placement()["windows"]}
    snap["windows"] = []
    for i, w in enumerate(ts["windows"]):
        sw = next(x for x in s["windows"] if x["windowID"] == w["id"])
        shown = w["space"]
        rows = {}
        for space in [x["id"] for x in s["spaces"]] if ts["spacesOn"] else [shown]:
            if space != k.win(None, i)["space"]:
                k.cmd("space.select", i, id=space)
                b.wait_for(lambda: k.win(None, i)["space"] == space, what="space shown")
            rows[space] = row_view(k.st(), i)
        if k.win(None, i)["space"] != shown:
            k.cmd("space.select", i, id=shown)
            b.wait_for(lambda: k.win(None, i)["space"] == shown, what="back to its space")
        side = sw["sidebar"]
        snap["windows"].append({
            "place": place_of(places[w["id"]]["now"]), "space": shown, "rows": rows,
            "sidebar": {key: side.get(key) for key in ("layout", "width", "folded", "side")},
        })
    ext = {e["id"]: e for e in (b.window().get("ext") or {}).get("list", [])}
    snap["extensions"] = sorted((id, e["enabled"], e["pinned"]) for id, e in ext.items())
    snap["permissions"] = sorted((p["origin"], p["kind"], p["choice"]) for p in b.cmd("permission.list")["saved"])
    snap["history"] = sorted({k.name_of(p["url"]) for p in b.cmd("history.list")["pages"] if p["url"].startswith(k.BASE)})
    snap["bookmarks"] = sorted((x["title"], x.get("url")) for x in b.cmd("bookmark.list", query="Saved"))
    snap["passwords"] = sorted((x.get("host") or x.get("site"), x.get("user")) for x in b.cmd("passwords.list", query="example")["logins"])
    snap["downloads"] = sorted(d["name"] for d in b.call({"do": "settings.state"})["downloads"]["completed"])
    return snap


def compare(before, after, what):
    for key in before:
        if key == "windows":
            t.ok(len(after["windows"]) == len(before["windows"]), f"{what}: {len(before['windows'])} windows come back")
            for i, (x, y) in enumerate(zip(before["windows"], after["windows"])):
                for part in ("place", "space", "sidebar", "rows"):
                    same = x[part] == y[part]
                    t.ok(same, f"{what}: window {i + 1}, its {part}" + ("" if same else f"\n         was {x[part]}\n         now {y[part]}"))
            continue
        same = before[key] == after[key]
        t.ok(same, f"{what}: {key}" + ("" if same else f"\n         was {before[key]}\n         now {after[key]}"))


def rect(s):
    x, y, w, h = (int(float(n)) for n in re.findall(r"-?[\d.]+", s))
    return {"x": x, "y": y, "width": w, "height": h}


def frame_of(r):
    return "{{%d, %d}, {%d, %d}}" % (r["x"], r["y"], r["width"], r["height"])


def wait_gone(p, within=20):
    if IS_WIN:
        # os.kill(p, 0) would end it on Windows: wait on the process instead.
        import ctypes
        k32 = ctypes.WinDLL("kernel32")
        k32.OpenProcess.restype = ctypes.c_void_p
        k32.WaitForSingleObject.argtypes = [ctypes.c_void_p, ctypes.c_uint]
        k32.CloseHandle.argtypes = [ctypes.c_void_p]
        h = k32.OpenProcess(0x00100000 | 0x1000, False, p)  # SYNCHRONIZE | PROCESS_QUERY_LIMITED_INFORMATION
        if not h:
            return True
        done = k32.WaitForSingleObject(h, int(within * 1000)) == 0
        k32.CloseHandle(h)
        return done
    end = time.time() + within
    while time.time() < end:
        try:
            os.kill(p, 0)
        except OSError:
            return True
        time.sleep(0.1)
    return False


def kill_hard(p):
    """As Windows does once session-end is answered: no time to write."""
    os.kill(p, signal.SIGTERM if IS_WIN else signal.SIGKILL)


def settled():
    """Every window up as its line says: shown, its interface loaded, maximized
    or full screen if it was (persistence/windows.ts waits for the interface)."""
    b.wait_for(lambda: all(w["visible"] and not w["loading"] and not w["settling"] for w in placement()["windows"]), within=40, what="windows settled")
    time.sleep(0.3)


def launch():
    k.launch()

    settled()


def relaunch():
    b.quit()
    time.sleep(0.5)
    launch()


def relaunch_after(p):
    gone = wait_gone(p)
    if b.PROC:
        try:
            b.PROC.wait(15)
        except Exception:
            b.PROC.kill()
    time.sleep(0.5)
    print("       windows.json:", [{key: w.get(key) for key in ("frame", "maximized", "folded", "space")} for w in (k.read("windows.json") or [])])
    launch()
    return gone


def wake(id):
    k.cmd("tab.select", 0, id=id)
    b.wait_for(lambda: (x := k.tab(id)) and x["live"] and not x["loading"], what="tab awake")
    time.sleep(0.3)


def site(name, i=None):
    """k.page with more time, saying what the tab was if it never came."""
    id = k.cmd("tab.open", i, url=k.url(name), foreground=True)
    try:
        b.wait_for(lambda: (x := k.tab(id)) and x["title"] == name and not x["loading"], within=30, what=f"page {name}")
    except AssertionError:
        print("       tab was:", {key: (k.tab(id) or {}).get(key) for key in ("url", "title", "loading", "live", "asleep")})
        raise
    return id


WATCHED = [
    "search.engine", "search.keywords", "look", "home.theme", "home.theme.image", "sidebar", "sidebar.position",
    "sidebar.width", "spaces", "pins.folders", "tabs.sleep", "tabs.sleep.pace", "shortcuts", "quit.confirm",
    "sidepanel.width", "spaces.orderKept", "downloads",
]
ZOOM = "zoom." + k.BASE.split("//")[1]  # zoom.<host:port> (studio/06 §1.16)
WATCHED.append(ZOOM)


# ---------------------------------------------------------------------------
# 0. prefs.json holds only what differs from its default (studio/06 §1.17).

k.world("persist-prefs")
launch()
b.cmd("settings.set", id="search.engine", value="duckduckgo")
b.cmd("settings.set", id="quit.confirm", value=False)
b.cmd("settings.set", id="tabs.sleep", value="sooner")
b.cmd("settings.set", id="tabs.sleep", value="normal")
relaunch()
written = k.read("prefs.json")
# The updater keeps when it last looked (update.checked), as the Mac keeps its
# own in defaults: bookkeeping, not a default written out.
written = {k_: v for k_, v in written.items() if k_ != "update.checked"}
t.ok(written == {"search.engine": "duckduckgo"}, f"prefs.json: only the key changed, never a default ({written})")
t.ok(b.state()["prefs"].get("quit.confirm") is False and b.state()["prefs"].get("tabs.sleep") is True, "the defaults are still what Oriel reads")
b.quit()


# ---------------------------------------------------------------------------
# 0b. The last window closed with its X (the app ends, §1.7 on Windows): it
#     comes back where it was, even moved a moment before.

k.world("persist-close")
launch()
work0 = b.call({"do": "window.frame"})["frame"]["workArea"]
b.call({"do": "window.place", "visual": True, "x": work0["x"] + 30, "y": work0["y"] + 20, "width": 900, "height": 600})
time.sleep(1.5)  # written once (windows.json 1 s after a move)
last = {"x": work0["x"] + 70, "y": work0["y"] + 50, "width": 960, "height": 620}
b.call({"do": "window.place", "visual": True, **last})
p0 = pid()
try:
    b.cmd("window.close")
except Exception:
    pass  # the app may be gone before it answers
t.ok(relaunch_after(p0), "the last window closed: the app ends")
t.ok(placement()["windows"][0]["visual"] == last, f"and the window comes back where it was last put ({placement()['windows'][0]['visual']})")
b.quit()


# ---------------------------------------------------------------------------
# 1. Everything, then a normal quit.

k.world("persist-all")
folder = b.folder()
folder.mkdir(parents=True, exist_ok=True)
# A space with a gradient (Oriel has no row to make one yet: it must survive the rest).
(folder / "spaces.json").write_text(json.dumps([
    {"id": FIRST, "name": "Personal", "colour": 0},
    {"id": STUDIO, "name": "Studio", "colour": 0, "icon": "book", "gradient": {"colours": ["#FF6A00", "#7A00FF"], "angle": 30, "grain": True}, "strength": "rich"},
]))
picture = folder / "theme.png"
picture.write_bytes(bytes.fromhex("89504E470D0A1A0A0000000D4948445200000001000000010806000000"
                                  "1F15C4890000000D49444154789C6360000002000154A24F5D0000000049454E44AE426082"))
launch()
win = lambda i=0: k.wid(i)

# settings
for key, value in [("search.engine", "kagi"), ("look", "dark"), ("tabs.layout", "right"), ("spaces", True), ("pins.folders", True), ("tabs.sleep", "sooner")]:
    b.cmd("settings.set", id=key, value=value)
# the blank tab's own picture, chosen as in Settings, Themes (copied into the data folder)
b.call({"do": "themes.answer", "file": str(picture)})
b.cmd("themes.choose")
b.cmd("prefs.set", key="search.keywords", value=[{"keyword": "yt", "template": "https://www.youtube.com/results?search_query=%s"}])
b.cmd("prefs.set", key="shortcuts", value={"tab.new": {"keys": ["Ctrl+Shift+K"]}})

# extensions: one pinned and turned off; one whose side panel was made wider
dnr = b.call({"do": "extensions.loadUnpacked", "path": str(DNR), "copy": True})["id"]
b.cmd("ext.pin", id=dnr, pinned=True)
b.cmd("ext.enable", id=dnr, on=False)
api = b.call({"do": "extensions.loadUnpacked", "path": str(API), "copy": True})["id"]


def panel_now():
    return b.call({"do": "extensions.panel", "window": k.wid(0)})


def open_panel():
    """In the first window, named (another may have the keys)."""
    b.cmd("tab.new", window=k.wid(0), url=f"chrome-extension://{api}/test.html")
    b.wait_for(lambda: b.active()["title"] == "API test page", what="extension page")
    page = b.active()["id"]
    b.ev(page, "chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).then(() => 1)")
    b.cmd("ext.press", window=k.wid(0), id=api)
    b.wait_for(lambda: (x := panel_now())["open"] and x["title"] == "API test panel" and x, within=8, what="panel")
    time.sleep(0.5)  # laid out in its room
    return page, panel_now()


page, panel = open_panel()
t.ok(panel["bounds"]["width"] == 380, f"the side panel starts 380 wide ({panel['bounds']})")
b.cmd("ext.panelWidth", width=452)
b.wait_for(lambda: b.call({"do": "extensions.panel"})["bounds"]["width"] == 452, what="panel wider")
b.call({"do": "extensions.panelEval", "window": k.wid(0), "js": "setTimeout(() => window.close(), 50); 1"})
b.wait_for(lambda: not panel_now()["open"], within=5, what="panel closed")
k.cmd("tab.close", 0, id=page)

# the window: its place, the column's width, folded
work = b.call({"do": "window.frame"})["frame"]["workArea"]
spot = {"x": work["x"] + 60, "y": work["y"] + 40, "width": 1000, "height": 680}
b.call({"do": "window.place", "visual": True, **spot})
b.cmd("sidebar.resize", width=300)

# Personal's tabs: a pin in a folded folder, a listed pin, a named tab, a muted one, a group, a split
pin = site("pinned"); k.cmd("tab.pin", id=pin)
pin2 = site("listed"); k.cmd("tab.pin", id=pin2)
pins = {p["home"]: p["id"] for p in b.state()["pins"]}
k.cmd("pin.listed", id=pins[k.url("listed")], listed=True)
folder_id = k.cmd("pinFolder.new", pin=pins[k.url("pinned")], name="Reading")
k.cmd("pinFolder.fold", id=folder_id, folded=True)
named = site("named"); k.cmd("tab.rename", id=named, name="Kept name")
muted = site("muted"); k.cmd("tab.mute", id=muted, muted=True)
g1 = site("g1"); g2 = site("g2")
gid = k.cmd("group.new", ids=[g1, g2]); k.cmd("group.rename", id=gid, name="Trip"); k.cmd("group.colour", id=gid, colour=3)
k.cmd("group.fold", id=gid, folded=True)
left = site("left")
k.cmd("split.toggle"); k.settle(0.4)
right = k.win()["activeID"]
k.cmd("tab.go", id=right, input=k.url("right"))
b.wait_for(lambda: k.tab(right)["title"] == "right", what="right page")
k.cmd("split.resize", first=left, sizes=[0.3, 0.7])
store = site("store")
b.ev(store, "document.cookie = 'kept=yes; max-age=86400; path=/'; localStorage.setItem('kept', 'yes'); true")
k.cmd("tab.select", id=named)

# zoom and permissions for the site
k.cmd("view.zoom", by=1.25)
b.cmd("permission.set", origin=k.BASE, kind="camera", value=True)
b.cmd("permission.set", origin=k.BASE, kind="location", value=False)

# spaces: a new one renamed, coloured, with an icon, moved left; the window left on it
work_id = k.cmd("space.create", name="Work"); k.settle(0.4)
k.cmd("space.rename", id=work_id, name="Work stuff")
k.cmd("space.colour", id=work_id, colour=3)
k.cmd("space.icon", id=work_id, icon="leaf")
k.cmd("space.order", id=work_id, by=-1)
site("w1"); site("w2")

# bookmarks, passwords, a download (into the world's folder, never the real Downloads)
(folder / "Downloads").mkdir(exist_ok=True)
b.cmd("settings.set", id="downloads", value=str(folder / "Downloads"))
b.cmd("bookmark.add", url=k.url("saved"), title="Saved page", folder=None)
b.cmd("passwords.add", host="https://login.example.com", user="me@example.com", password="kept-1")
files = k.cmd("tab.open", url=ORIGIN + "/files", foreground=True)
b.wait_for(lambda: k.tab(files)["title"] == "files" and not k.tab(files)["loading"], what="files page")
b.ev(files, "(() => { const a = document.createElement('a'); a.href = '/file/kept.bin?size=4096'; a.download = ''; document.body.appendChild(a); a.click(); a.remove(); return 1 })()")
b.wait_for(lambda: any(d["name"] == "kept.bin" for d in b.call({"do": "settings.state"})["downloads"]["completed"]), what="download done")
k.cmd("tab.close", id=files)

# a second window, maximized, on Personal
b.cmd("window.new"); k.settle(1.0)
k.cmd("space.select", 1, id=FIRST); k.settle(0.3)
site("second", i=1)
b.cmd("window.maximize", window=win(1))
b.wait_for(lambda: placement()["windows"][1]["state"] == "maximized", what="second maximized")
b.call({"do": "window.focus", "window": win(0)})

# what the Mac doesn't keep: a private tab, a closed tab for ⇧⌘T, a page's back history
# (all in the first window, named: the new one may have the keys now)
gone = site("closed-one", i=0); k.cmd("tab.close", 0, id=gone)
shy = k.cmd("tab.newPrivate", 0); b.cmd("tab.go", window=win(0), id=shy, input=k.url("secret")); time.sleep(0.8)
k.cmd("tab.close", 0, id=shy)
k.cmd("tab.go", 0, id=site("hist-a", i=0), input=k.url("hist-b"))
b.wait_for(lambda: (x := k.by_name("hist-b")) and not x["loading"] and x["canGoBack"], what="history page")
k.cmd("sidebar.toggle", 0)
k.settle(0.3)

before = snapshot()
t.ok(before["windows"][0]["place"]["frame"] == "{{%d, %d}, {1000, 680}}" % (spot["x"], spot["y"]), "the window is where it was put")
t.ok(before["windows"][1]["place"]["maximized"] is True, "the second window maximized")
t.ok(before["windows"][0]["sidebar"] == {"layout": "side", "width": 300, "folded": True, "side": "right"}, f"the column: 300, folded, on the right ({before['windows'][0]['sidebar']})")
t.ok(before["prefs"]["sidepanel.width"] == 452, "the side panel's width is a setting")
t.ok(before["prefs"][ZOOM] == 1.25, "the site's zoom is a setting")

relaunch()
after = snapshot()
compare(before, after, "after quitting")

# not kept on purpose (the Mac doesn't either)
s = k.st()
every = [x for w in s["windows"] for r in w["rows"].values() for x in r["tabs"]]
t.ok(not any(k.name_of(x["url"]) == "secret" for x in every), "not kept: private tabs (studio/01 §2.35)")
t.ok(all(not w["ghosts"] for w in s["windows"]) and s["closedWindows"] == 0, "not kept: ⇧⌘T's closed tabs and windows (§1.6, §9.15)")
hb = k.by_name("hist-b")
t.ok(hb is None or not hb["canGoBack"], "not kept: a tab's back and forward (§2.24)")

wins = k.read("windows.json")
t.ok(set(wins[0]) >= {"id", "frame", "space", "rows", "display"} and wins[0].get("folded") is True, "windows.json: frame, space, rows, folded, and the monitor")
t.ok(wins[1].get("maximized") is True and wins[1]["frame"].startswith("{{"), "a maximized window: maximized, and the frame it comes back to")
sp = next(x for x in after["spaces"] if x[0] == STUDIO)
t.ok('"angle": 30' in sp[4] and sp[5] == "rich", "a space's gradient and strength come through other changes to spaces.json")
t.ok(after["windows"][0]["space"] == work_id, "the window shows the space it was left on")
t.ok(b.call({"do": "field.address", "text": "yt"})["site"] == "Youtube", "a site shortcut is searched from the field again (yt offers its site)")
kept_picture = Path(after["prefs"]["home.theme.image"] or "")
t.ok(after["prefs"]["home.theme"] == "custom" and kept_picture.is_file() and kept_picture.parent.name == "Theme",
     f"the theme: its own picture, kept in the data folder ({kept_picture})")

store_id = k.by_name("store")["id"] if k.by_name("store") else None
if not store_id:
    k.cmd("space.select", 0, id=FIRST); k.settle(0.4)
    store_id = k.by_name("store")["id"]
wake(store_id)
t.ok(b.ev(store_id, "document.cookie") == "kept=yes" and b.ev(store_id, "localStorage.getItem('kept')") == "yes", "cookies and site storage")
wake(k.by_name("named")["id"])
zoom = b.call({"do": "window.frame", "window": k.wid(0)})["frame"]["zoom"]
t.ok(abs((zoom or 0) - before["prefs"][ZOOM]) < 0.01, f"the site's zoom is on its page ({zoom})")
b.call({"do": "window.place", "window": k.wid(0), "visual": True, "x": work["x"], "y": work["y"], "width": min(1300, work["width"]), "height": 700})
page, panel = open_panel()
t.ok(panel["bounds"]["width"] == 452, f"the side panel opens as wide as it was left ({panel['bounds']['width']})")
b.call({"do": "extensions.panelEval", "window": k.wid(0), "js": "setTimeout(() => window.close(), 50); 1"})
b.wait_for(lambda: not panel_now()["open"], within=5, what="panel closed")
k.cmd("tab.close", 0, id=page)

b.call({"do": "tabs.write"})


# ---------------------------------------------------------------------------
# 2. Endings that are not a quit, right after a few changes (still in their
#    timers: settings 0.4 s, windows.json 1 s, the session 1.2 s, bookmarks 0.4 s).

endings = []
if not IS_WIN:
    endings += [("SIGTERM", lambda p: os.kill(p, signal.SIGTERM)), ("SIGINT", lambda p: os.kill(p, signal.SIGINT))]
endings.append(("session end", lambda p: (b.call({"do": "persist.end", "how": "end"}), kill_hard(p))))
endings.append(("session end asked, then killed", lambda p: (b.call({"do": "persist.end", "how": "query"}), kill_hard(p))))
if not IS_WIN:
    endings.append(("shutdown", lambda p: (b.call({"do": "persist.end", "how": "shutdown"}), kill_hard(p))))

for n, (what, end) in enumerate(endings, 1):
    tag = f"late{n}"
    k.cmd("space.select", 0, id=STUDIO)
    b.wait_for(lambda: k.win()["space"] == STUDIO, what="Studio shown")
    time.sleep(1.5)
    expected = snapshot()
    p = pid()
    w0 = expected["windows"][0]
    engine = ["bing", "ecosia", "qwant", "brave", "startpage"][n % 5]
    where = {"x": work["x"] + 20 * n, "y": work["y"] + 40 + 10 * n, "width": 900 + 10 * n, "height": 640}  # its shadow's margin inside the work area (a Mac keeps it under the menu bar)
    # the changes (to the first window, by its id: none has the keys in a test world), then the end at once
    k.cmd("space.select", 0, id=FIRST)
    late = k.cmd("tab.open", 0, url=k.url(tag), foreground=True)
    b.cmd("settings.set", id="search.engine", value=engine)
    b.call({"do": "window.place", "window": k.wid(0), "visual": True, **where})
    k.cmd("sidebar.toggle", 0)
    b.cmd("bookmark.add", url=k.url(tag + "-mark"), title=f"Saved {tag}", folder=None)
    end(p)
    t.ok(relaunch_after(p), f"{what}: the app ended")
    got = snapshot()
    w1 = got["windows"][0]
    row = w1["rows"][FIRST]
    t.ok(got["prefs"]["search.engine"] == engine, f"{what}: the setting changed just before")
    t.ok(w1["place"]["frame"] == frame_of(where), f"{what}: the window where it was just put ({w1['place']['frame']})")
    t.ok(w1["sidebar"]["folded"] == (not w0["sidebar"]["folded"]), f"{what}: the column folded or unfolded just before")
    t.ok(w1["space"] == FIRST, f"{what}: the space shown just before")
    t.ok(row["front"] == tag and any(x[0] == tag for x in row["tabs"]), f"{what}: the tab opened just before, in front")
    t.ok((f"Saved {tag}", k.url(tag + "-mark")) in got["bookmarks"], f"{what}: the bookmark added just before")
    # the rest as it was
    expected["prefs"]["search.engine"] = engine
    w0["place"]["frame"] = frame_of(where)
    w0["sidebar"]["folded"] = w1["sidebar"]["folded"]
    w0["space"] = FIRST
    w0["rows"][FIRST]["front"] = tag
    row["tabs"] = [x for x in row["tabs"] if x[0] != tag]
    expected["bookmarks"] = sorted(expected["bookmarks"] + [(f"Saved {tag}", k.url(tag + "-mark"))])
    got["history"] = [h for h in got["history"] if not h.startswith("late")]
    expected["history"] = [h for h in expected["history"] if not h.startswith("late")]
    compare(expected, got, f"{what}, the rest")
    k.cmd("tab.close", 0, id=k.by_name(tag)["id"])


# ---------------------------------------------------------------------------
# 3. Monitors that are gone or moved (§1.2 point 6).

b.quit()
wins = k.read("windows.json")
real = wins[0]["display"]
dx = 300
was = rect(real["frame"])
was["x"] -= dx
moved = dict(wins[0], frame=frame_of({"x": work["x"] + 100 - dx, "y": work["y"] + 80, "width": 800, "height": 600}),
             display={"id": real["id"], "frame": frame_of(was)})
lost = {key: v for key, v in wins[1].items() if key != "maximized"}
lost.update(frame="{{-30000, -30000}, {900, 600}}", display={"id": 987654321, "frame": "{{-30000, -30000}, {1920, 1080}}"})
(folder / "windows.json").write_text(json.dumps([moved, lost]))
launch()
ws = placement()["windows"]
t.ok(ws[0]["visual"] == {"x": work["x"] + 100, "y": work["y"] + 80, "width": 800, "height": 600}, f"its monitor moved in the arrangement: the window goes with it ({ws[0]['visual']})")
primary = b.call({"do": "window.frame", "window": ws[1]["id"]})["frame"]["workArea"]
v = ws[1]["visual"]
t.ok(v["width"] == 900 and v["height"] == 600 and abs(v["x"] - (primary["x"] + (primary["width"] - 900) / 2)) <= 1, f"its monitor gone: on the primary one, centred, same size ({v})")
b.quit()


# ---------------------------------------------------------------------------
# 4. Windows only: full screen and Snap.

if IS_WIN:
    launch()
    spot = {"x": work["x"] + 20, "y": work["y"] + 20, "width": min(900, work["width"] - 40), "height": min(600, work["height"] - 40)}
    b.call({"do": "window.place", "window": k.wid(0), "visual": True, **spot})
    b.cmd("window.fullScreen", window=k.wid(0), on=True)
    b.wait_for(lambda: placement()["windows"][0]["state"] == "fullScreen", what="full screen")
    relaunch()
    t.ok(b.wait_for(lambda: placement()["windows"][0]["state"] == "fullScreen", what="full screen again"), "full screen comes back full screen")
    b.cmd("window.fullScreen", window=k.wid(0), on=False)
    b.wait_for(lambda: placement()["windows"][0]["state"] == "free", what="out of full screen")
    # Windows says the state before it has put the bounds back: wait for them.
    try:
        b.wait_for(lambda: placement()["windows"][0]["visual"] == spot, within=3, what="back where it was")
    except AssertionError:
        pass
    back = placement()["windows"][0]
    t.ok(back["visual"] == spot, f"and leaves it to where it was before ({back['visual']} vs {spot}, {back['state']}, saved {k.read('windows.json')[0].get('frame')})")
    b.quit()
    wins = k.read("windows.json")
    snap_rect = {"x": work["x"], "y": work["y"], "width": max(640, work["width"] // 2), "height": work["height"]}  # never under 640 (§1.4)
    wins[0]["snapped"] = "{{%d, %d}, {%d, %d}}" % (snap_rect["x"], snap_rect["y"], snap_rect["width"], snap_rect["height"])
    (folder / "windows.json").write_text(json.dumps(wins[:1]))
    launch()
    t.ok(placement()["windows"][0]["visual"] == snap_rect, "a window that was snapped comes back where Snap had put it")
    b.quit()
else:
    print("  (full screen and Snap: Windows only)")

launch()
t.done()

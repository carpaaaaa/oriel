#!/usr/bin/env python3
"""Export Spaces… (Search 1.0.22, Tests/spaces_moving_on.py,
SpacesExportTests): in Settings › Bring things over (and Settings › Keyboard &
Mouse, to give it a key), every space saved to a file. A bookmarks page any
browser imports: a folder per space with its pins, its folders of pinned rows
nested as they are and its open tabs in a folder of their own (tab groups as
folders), the pins every space shows in a folder of their own. Or Search's own
spaces file, which also keeps each space's colour, icon and profile, and which
Bring Things Over › File… reads back as spaces, once."""
import json
import re
import shutil
import sys
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b


class Site(BaseHTTPRequestHandler):
    def do_GET(self):
        name = self.path.split("n=")[-1]
        body = f"<!doctype html><title>{name}</title><p>{name}".encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a):
        pass


srv = ThreadingHTTPServer(("127.0.0.1", 0), Site)
threading.Thread(target=srv.serve_forever, daemon=True).start()
BASE = f"http://127.0.0.1:{srv.server_port}"
out = Path(tempfile.mkdtemp(prefix="oriel-spaces-"))
t = b.T()


def url(n):
    return f"{BASE}/?n={n}"


def do(command, **args):
    """A command whose arguments include `name` (b.cmd's own first parameter)."""
    return b.call({"do": "cmd", "cmd": {"do": command, **args}}).get("value")


def open_tab(n):
    b.cmd("tab.new", url=url(n))
    b.wait_for(lambda: (b.active() or {}).get("title") == n, within=15, what=n)
    return b.active()["id"]


def pin_of(tab):
    return next(p for p in b.window()["pins"] if p.get("tabID") == tab)


def tree(html):
    """The page's folders and links, nested, as any browser reads <DL> lists."""
    root = {"name": None, "items": []}
    stack = [root]
    pending = None
    for m in re.finditer(r'<DT><H3>(.*?)</H3>|<DT><A HREF="([^"]*)">(.*?)</A>|<DL><p>|</DL><p>', html):
        tok = m.group(0)
        if m.group(1) is not None:
            pending = {"name": m.group(1), "items": []}
        elif m.group(2) is not None:
            stack[-1]["items"].append((m.group(3), m.group(2)))
        elif tok == "<DL><p>":
            if pending is not None:
                stack[-1]["items"].append(pending)
                stack.append(pending)
                pending = None
            elif len(stack) == 1 and not root["items"]:
                pass
        else:
            if len(stack) > 1:
                stack.pop()
    return root


def folder(node, name):
    return next((x for x in node["items"] if isinstance(x, dict) and x["name"] == name), None)


def links(node):
    return [x[0] for x in node["items"] if isinstance(x, tuple)]


try:
    # A world with two spaces, pins, folders, groups, open tabs.
    b.use("data-spaces-export")
    b.launch()
    b.cmd("settings.set", id="spaces", value=True)
    b.cmd("settings.set", id="pins.list", value=True)
    time.sleep(0.5)
    mail = open_tab("mail")
    b.cmd("tab.pin", id=mail)
    news = open_tab("news")
    b.cmd("tab.pin", id=news)
    b.wait_for(lambda: len(b.window()["pins"]) == 2, what="two squares")
    b.cmd("pin.share", id=pin_of(news)["id"], everywhere=True)
    read = open_tab("read")
    b.cmd("tab.pinRow", id=read)
    later = open_tab("later")
    b.cmd("tab.pinRow", id=later)
    loose = open_tab("loose")
    b.cmd("tab.pinRow", id=loose)
    b.wait_for(lambda: sum(1 for p in b.window()["pins"] if p.get("listed")) == 3, what="three rows")
    do("pinFolder.new", pin=pin_of(read)["id"], name="Reading")
    b.wait_for(lambda: any(f["name"] == "Reading" for f in b.window()["pinFolders"]), what="Reading")
    reading = next(f for f in b.window()["pinFolders"] if f["name"] == "Reading")["id"]
    do("pinFolder.new", pin=pin_of(later)["id"], parent=reading, name="Later")
    b.wait_for(lambda: any(f["name"] == "Later" for f in b.window()["pinFolders"]), what="Later")
    r1, r2 = open_tab("paper-one"), open_tab("paper-two")
    b.cmd("group.new", ids=[r1, r2])
    b.wait_for(lambda: b.window()["groups"], what="a group")
    do("group.rename", id=b.window()["groups"][0]["id"], name="Research")
    open_tab("plain")
    do("space.create", name="Work", icon="building.2")
    b.wait_for(lambda: any(s["name"] == "Work" for s in b.window()["spaces"]), what="Work")
    work = next(s for s in b.window()["spaces"] if s["name"] == "Work")["id"]
    b.cmd("space.colour", id=work, colour=3)
    open_tab("standup")
    time.sleep(0.5)

    print("- the row in Settings")
    b.cmd("app.settings")
    b.wait_for(lambda: any(x.get("internal") == "settings" for x in b.window()["tabs"]), what="Settings tab")
    st = next(x for x in b.window()["tabs"] if x.get("internal") == "settings")["id"]
    b.wait_for(lambda: b.ev(st, "document.querySelectorAll('.sr').length"), what="rows")
    row = b.ev(st, "document.querySelector(\"[data-row='general.exportSpaces']\")?.innerText") or ""
    t.ok("Export spaces" in row and "Every space, its pins, folders and open tabs, to a file" in row and "Export Spaces…" in row,
         f"Settings › General, under Bring things over: Export spaces, with Export Spaces… ({row!r})")
    keys = b.call({"do": "field.keys"})["bindings"]
    t.ok(any(k["id"] == "file.exportSpaces" and k["title"] == "Export Spaces…" for k in keys), "and in the shortcuts' table, to give it a key")

    print("- the bookmarks page")
    page = out / "Oriel Spaces.html"
    r = b.cmd("settings.do", id="general.exportSpaces", arg=str(page))
    t.ok(r and r.get("said") == "2 spaces exported" and page.exists(), f"Export Spaces… writes the page and says so ({r and r.get('said')})")
    html = page.read_text(encoding="utf-8")
    t.ok(html.startswith("<!DOCTYPE NETSCAPE-Bookmark-file-1>") and "<H1>Spaces</H1>" in html, "a Netscape bookmarks page, titled Spaces")
    top = folder(tree(html), "Spaces") or tree(html)
    names = [x["name"] for x in top["items"] if isinstance(x, dict)]
    t.ok(names == ["Every Space", "Personal", "Work"], f"the pins every space shows first, then a folder per space ({names})")
    every = folder(top, "Every Space")
    t.ok(links(every) == ["news"], f"Every Space holds the shared pin ({links(every)})")
    personal = folder(top, "Personal")
    t.ok(links(personal) == ["mail", "loose"], f"a space's squares first, then its loose rows ({links(personal)})")
    rd = folder(personal, "Reading")
    t.ok(rd and links(rd) == ["read"] and folder(rd, "Later") and links(folder(rd, "Later")) == ["later"], "its folders of rows nested as they are")
    tabs = folder(personal, "Open Tabs")
    t.ok(tabs and folder(tabs, "Research") and links(folder(tabs, "Research")) == ["paper-one", "paper-two"] and "plain" in links(tabs),
         f"its open tabs in a folder of their own, a group as a folder ({tabs and [x if isinstance(x, tuple) else x['name'] for x in tabs['items']]})")
    t.ok("oriel://" not in html and "settings" not in links(tabs), "no Oriel page in it")
    t.ok(links(folder(folder(top, "Work"), "Open Tabs")) == ["standup"], "Work, with its open tab")
    # Any browser reads it: Oriel's own bookmarks import, for one.
    got = b.cmd("import.file", path=str(page))
    t.ok(got and got["bookmarks"] >= 9, f"a bookmarks page Bring Things Over reads as bookmarks ({got and got['said']})")

    print("- Search's spaces file")
    js = out / "Oriel Spaces.json"
    r = b.cmd("settings.do", id="general.exportSpaces", arg=str(js))
    data = json.loads(js.read_text(encoding="utf-8"))
    t.ok(r.get("said") == "2 spaces exported" and data["format"] == "search-spaces" and data["version"] == 1, "a .json name: Search's spaces file")
    t.ok(re.fullmatch(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ", data["exported"]) is not None, f"dated as Search writes it ({data['exported']})")
    p0 = data["profiles"][0]
    sp = {s["name"]: s for s in p0["spaces"]}
    t.ok(p0["name"] == "Personal" and list(sp) == ["Personal", "Work"] and [p["title"] for p in p0["everySpace"]] == ["news"], "the profile, its spaces, its shared pins")
    t.ok(sp["Work"]["colour"] == 3 and sp["Work"]["icon"] == "building.2", "each space's colour and icon")
    rows = {p["title"]: p for p in sp["Personal"]["pins"]}
    fid = {f["name"]: f for f in sp["Personal"]["folders"]}
    t.ok(not rows["mail"]["listed"] and rows["read"]["listed"] and rows["read"]["folder"] == fid["Reading"]["id"]
         and fid["Later"]["parent"] == fid["Reading"]["id"] and "folder" not in rows["loose"], "which pins are rows, and their folders nested")
    grp = sp["Personal"]["groups"]
    t.ok(len(grp) == 1 and grp[0]["name"] == "Research" and sum(1 for x in sp["Personal"]["tabs"] if x.get("group") == grp[0]["id"]) == 2, "open tabs with their group")
    t.ok(all(k in sp["Personal"] for k in ("pins", "folders", "tabs", "groups", "colour", "name")), "every key Search's reader needs")
    b.quit()

    print("- read back in another Oriel")
    b.use("data-spaces-export-back")
    b.launch()
    b.cmd("settings.set", id="pins.list", value=True)
    time.sleep(0.4)
    got = b.cmd("import.file", path=str(js))
    t.ok(got and got["said"][0]["text"] == "1 new space, 5 pins, 4 tabs", f"Bring Things Over › File… takes it as spaces ({got and got['said']})")
    w = b.window()
    names = [s["name"] for s in w["spaces"]]
    t.ok(b.state()["prefs"].get("spaces") is True and names == ["Personal", "Work"], f"two spaces turn Spaces on: Personal (the one there) and Work ({names})")
    wk = next(s for s in w["spaces"] if s["name"] == "Work")
    t.ok(wk["colour"] == 3 and wk["icon"] == "building.2", "Work with its colour and icon")
    pins = b.window()["pins"]
    t.ok(any(p["home"] == url("news") and p.get("everywhere") for p in pins), "the shared pin, shared again")
    t.ok(any(p["home"] == url("mail") and not p.get("listed") for p in pins), "the square, a square")
    fl = {f["name"]: f for f in b.window()["pinFolders"]}
    rd = next((p for p in pins if p["home"] == url("read")), None)
    lt = next((p for p in pins if p["home"] == url("later")), None)
    t.ok("Reading" in fl and "Later" in fl and fl["Later"].get("parent") == fl["Reading"]["id"] and rd and rd.get("listed") and rd.get("folder") == fl["Reading"]["id"]
         and lt and lt.get("folder") == fl["Later"]["id"], f"the rows in their folders, nested as they were ({list(fl)})")
    tabs = [x for x in b.window()["tabs"] if not x.get("pinID")]
    research = next((g for g in b.window()["groups"] if g["name"] == "Research"), None)
    grouped = [x["url"] for x in tabs if research and x.get("groupID") == research["id"]]
    t.ok(research and grouped == [url("paper-one"), url("paper-two")] and all(x.get("asleep") for x in tabs if x["url"].startswith(BASE)),
         f"the open tabs asleep, the group as it was ({grouped})")
    b.cmd("space.select", id=wk["id"])
    b.wait_for(lambda: b.window()["space"] == wk["id"], what="Work shown")
    time.sleep(0.4)
    row = [x["url"] for x in b.window()["tabs"] if x["url"].startswith(BASE) and not x.get("pinID")]
    t.ok(row == [url("standup")], f"Work's row comes with its tab ({row})")
    again = b.cmd("import.file", path=str(js))
    t.ok(again and again["said"][0]["text"] == "Those spaces were all here already", f"once: brought again, nothing twice ({again and again['said']})")
    t.ok(len(b.window()["spaces"]) == 2, "no space twice")
except Exception as error:
    import traceback
    traceback.print_exc()
    t.ok(False, f"ran to the end ({error})")
finally:
    shutil.rmtree(out, ignore_errors=True)
t.done()

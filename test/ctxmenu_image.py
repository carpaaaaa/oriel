#!/usr/bin/env python3
"""The page menu on a picture (studio/06 §5.3, ImageMenu.swift:148-180):
Open Image in New Tab, in Split View, Save Image As… (Windows' Save dialog,
answered by the test, then the file in the folder chosen, listed as a
download), Copy Image (a real image on the clipboard), Copy Image Address,
Search Image with Google; a picture that is a link has both menus."""
import sys
import time
from pathlib import Path
from urllib.parse import quote

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b  # noqa: E402
import ctxmenu_kit as k  # noqa: E402

OUT = Path(__file__).resolve().parent.parent / "out" / "ctxmenu-image"
OUT.mkdir(parents=True, exist_ok=True)
for f in OUT.iterdir():
    f.unlink()
k.world("ctxmenu-image", downloads=str(OUT))
t = b.T()
SRC = k.url("/pic.png")

page = k.page("/ctx")
at = k.right_click(page, "#img")
WANT = ["Open Image in New Tab", "Open Image in Split View", "—", "Save Image As…", "Copy Image", "Copy Image Address", "—",
        "Search Image with Google", "—", "Inspect"]
t.ok(k.labels() == WANT, f"a picture: open it, save it, copy it, search with it ({k.labels()})")
t.ok(k.last()["menu"]["context"] == ["image"], "its context is the image")
k.near_click(t, at)
k.hover("Copy Image")
k.shot("ctxmenu-image-light")

# Copy Image: the picture itself
k.clear_clipboard()
k.pick("Copy Image")
c = b.wait_for(lambda: (x := k.clipboard())["image"] and x, within=5, what="an image on the clipboard")
t.ok(c["image"] == "image/png" and c["imageBytes"] > 100, f"Copy Image puts the picture on the clipboard as an image ({c['types']}, {c['imageBytes']} bytes)")

# Copy Image Address
k.right_click(page, "#img")
k.pick("Copy Image Address")
t.ok(k.clipboard()["text"] == SRC, f"Copy Image Address copies its address: {k.clipboard()['text']}")

# Open Image in New Tab: behind, after its page
k.right_click(page, "#img")
k.pick("Open Image in New Tab")
w = b.state()["windows"][0]
ids = [x["id"] for x in w["tabs"]]
new = ids[ids.index(page) + 1] if ids.index(page) + 1 < len(ids) else None
t.ok(new and k.tab(new)["url"] == SRC and w["activeID"] == page, "Open Image in New Tab: the picture in a tab behind its page")
if new:
    b.cmd("tab.close", id=new)

# Open Image in Split View
k.right_click(page, "#img")
k.pick("Open Image in Split View")
w = b.state()["windows"][0]
split = next((s for s in w["splits"] if page in s["tabs"]), None)
t.ok(split and k.tab(split["tabs"][1])["url"] == SRC and w["activeID"] == split["tabs"][1], f"Open Image in Split View: beside its page ({split and split['tabs']})")
if split:
    b.cmd("split.separate")
    b.cmd("tab.close", id=split["tabs"][1])
b.cmd("tab.select", id=page)
time.sleep(0.5)

# Save Image As…: the dialog, then the file where it was asked to go
target = OUT / "kept picture.png"
k.log(reset=True, saveAs=str(target))
k.right_click(page, "#img")
k.pick("Save Image As…")
b.wait_for(lambda: target.exists() and target.stat().st_size == len(k.PICTURE), within=10, what="the saved picture")
d = k.log()["dialogs"]
t.ok(d and d[-1]["title"] == "Save Image As" and d[-1]["defaultPath"] == str(OUT / "pic.png"),
     f"Save Image As… opens Windows' Save dialog at Downloads, named after the picture: {d}")
t.ok(target.read_bytes() == k.PICTURE, "…and writes the picture where it was told, as it is")
listed = b.cmd("download.list")
names = [x["name"] for x in listed["current"] + listed["completed"]]
t.ok("kept picture.png" in names, f"…listed among the downloads ({names})")

# Cancel in the dialog saves nothing
k.log(reset=True, saveAs=None)
k.right_click(page, "#img")
k.pick("Save Image As…")
time.sleep(1)
t.ok(len(k.log()["dialogs"]) == 1 and sorted(f.name for f in OUT.iterdir() if not f.name.startswith(".")) == ["kept picture.png"],
     "Cancel in the dialog: nothing saved")

# Search Image with Google
k.right_click(page, "#img")
k.pick("Search Image with Google")
s = b.wait_for(lambda: (a := b.active()) and a["id"] != page and a, what="the search tab")
t.ok(s["url"] == "https://lens.google.com/uploadbyurl?url=" + quote(SRC, safe=""), f"Search Image with Google: Google Lens with its address, in front ({s['url']})")
b.cmd("tab.close", id=s["id"])
b.cmd("tab.select", id=page)
time.sleep(0.4)

# with Bing chosen, Bing searches by picture
b.cmd("prefs.set", key="search.engine", value="bing")
k.right_click(page, "#img")
t.ok("Search Image with Bing" in k.labels(), f"with Bing chosen: Search Image with Bing ({k.labels()})")
k.key("Escape")
b.cmd("prefs.set", key="search.engine", value="custom")
time.sleep(0.3)

# a picture that is a link: the link's rows, then the picture's
k.right_click(page, "#imglink img")
labs = k.labels()
t.ok(labs[:4] == ["Open Link in New Tab", "Open Link in New Window", "Open Link in Private Window", "Open Link in Split View"]
     and "Open Image in New Tab" in labs and labs.index("Open Image in New Tab") > labs.index("Copy Clean Link") and "Copy Image" in labs,
     f"a picture in a link: the link's rows first, then the picture's ({labs})")
t.ok(k.last()["menu"]["context"] == ["link", "image"], "…its context is both")
k.pick("Open Link in New Tab")
w = b.state()["windows"][0]
ids = [x["id"] for x in w["tabs"]]
t.ok(k.tab(ids[ids.index(page) + 1])["url"] == k.url("/target?from=img"), "…Open Link in New Tab opens the link, not the picture")

k.done(t)

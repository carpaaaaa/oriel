#!/usr/bin/env python3
"""The guards of studio/09 (controllo finale):
§1.1 the interface and the overlay never leave their page (a link that would
     replace them, as a drop does, opens in a tab instead; window.open gets
     nothing), and the interface's IPC answers only the interface;
§1.4 a website can't open oriel:// pages (window.open, target=_blank, a link,
     a redirect), nor script, data: or a file, while an Oriel page still can;
§1.2 the test knobs (SEARCH_PROBE, ORIEL_UPDATE_FEED...) are read only
     through testhooks.ts, which turns them off in an installed copy."""
import re
import sys
import time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b
import settings_web as web

server, origin = web.start()
web.PAGES["/site"] = ("<title>site</title><body>a website"
                      "<a id=blank target=_blank href='oriel://passwords'>passwords</a>"
                      "<a id=self href='oriel://history'>history</a></body>")
web.PAGES["/dropped"] = "<title>dropped</title><body>a link dropped on the column</body>"
web.PAGES["/other"] = "<title>other</title><body>another site</body>"
web.REDIRECTS["/to-settings"] = "oriel://settings/privacy"

b.use("security-guards")
b.launch(env={"ORIEL_GUARD_KNOB": "on"})
t = b.T()


def ev(tab, js):
    try:
        return b.ev(tab, js)
    except RuntimeError:
        return None


def ui(js, root="chrome"):
    try:
        return b.ui(js, root)
    except RuntimeError as e:
        return f"error: {e}"


def tabs():
    return b.window()["tabs"]


def has_tab(pred):
    return any(pred(x) for x in tabs())


def guard():
    try:
        return b.call({"do": "guard.state"})
    except RuntimeError:
        return {"navigations": [], "opens": [], "views": []}


# 1. The interface stays on its page (studio/09 §1.1).
home = ui("location.href")
t.ok(str(home).startswith("file:"), f"the interface is its own file ({str(home)[:40]}...)")
ui(f"location.href = {origin + '/dropped'!r}; 1")
time.sleep(1.5)
t.ok(ui("location.protocol") == "file:" and ui("location.href") == home, f"the interface can't be taken to a website (now {str(ui('location.href'))[:60]})")
t.ok(ui("typeof window.search") == "object", "the interface keeps its bridge")
t.ok(has_tab(lambda x: (x.get("url") or "").endswith("/dropped")),
     "a link that would replace the interface (a drop) opens in a tab instead, as on the Mac")
ui(f"location.href = {origin + '/site'!r}; 1", root="overlay")
time.sleep(1.0)
t.ok(ui("location.protocol", root="overlay") == "file:" and ui("typeof window.search", root="overlay") == "object", "the overlay can't be taken to a website either")
before = len(tabs())
ui(f"window.open({origin + '/other'!r}); 1")
time.sleep(1.0)
t.ok(len(tabs()) == before and not has_tab(lambda x: (x.get("url") or "").endswith("/other")), "window.open from the interface gets nothing")
g = guard()
t.ok(any(n["how"] == "navigate" for n in g["navigations"]) and any(n["how"] == "window.open" for n in g["navigations"]), f"the bench saw the refusals ({len(g['navigations'])})")
t.ok(all(v["ui"].startswith("file:") and v["overlay"].startswith("file:") for v in g["views"]), "every window's interface and overlay are still the interface's file")

# 2. A sender that isn't an interface gets no command (studio/09 §1.1).
try:
    r = b.call({"do": "guard.stranger", "url": origin + "/site", "cmd": {"do": "tab.new", "url": origin + "/stranger"}})
except RuntimeError as e:
    r = {"cmd": f"no probe: {e}", "hello": "", "overlay": ""}
time.sleep(0.5)
t.ok(str(r["cmd"]).startswith("refused") and not has_tab(lambda x: (x.get("url") or "").endswith("/stranger")),
     f"a view with the bridge that isn't an interface runs no command ({r['cmd']})")
t.ok(r["hello"] == "nothing" and r["overlay"] == "nothing", f"and gets no state ({r['hello']}, {r['overlay']})")
ok = ui("window.search.cmd({do: 'internal.state', slice: 'prefs'}).then(v => typeof v, e => 'refused: ' + e.message)")
t.ok(ok == "object", f"the real interface still runs its commands ({ok})")

# 3. A website can't open Oriel's pages (studio/09 §1.4).
b.cmd("tab.new", url=origin + "/site")
b.wait_for(lambda: (b.active() or {}).get("title") == "site", what="website")
site = b.active()["id"]
time.sleep(0.4)
internal = lambda kind: has_tab(lambda x: x.get("internal") == kind)
ev(site, "window.open('oriel://passwords'); 1")
time.sleep(1.0)
t.ok(not internal("passwords"), "window.open('oriel://passwords') from a site opens nothing")
ev(site, "document.getElementById('blank').click(); 1")
time.sleep(1.0)
t.ok(not internal("passwords"), "a target=_blank link to oriel://passwords opens nothing")
# A right click on that link: Copy Link, no Open Link (Chrome blocks chrome:// links so).
rect = b.wait_for(lambda: b.call({"do": "ctxmenu.page", "id": site})["rect"], within=5, what="page placed")
at = ev(site, "(() => { const r = document.getElementById('blank').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2] })()")
seq = (b.call({"do": "ctxmenu.last"})["menu"] or {}).get("seq", 0)
b.mouse(round(rect["x"] + at[0]), round(rect["y"] + at[1]), button="right")
try:
    menu = b.wait_for(lambda: (m := b.call({"do": "ctxmenu.last"})["menu"]) and m["seq"] > seq and m, within=5, what="page menu")
    words = [e["label"] for e in menu["entries"] if e != "—"]
except AssertionError:
    words = ["no menu"]
t.ok("Copy Link" in words and not any(w.startswith("Open Link") for w in words), f"its menu offers Copy Link, not Open Link ({words[:4]})")
b.key("Escape")
ev(site, "document.getElementById('self').click(); 1")
time.sleep(1.0)
now = next(x for x in tabs() if x["id"] == site)
t.ok(not internal("history") and not now.get("internal") and now["url"].startswith(origin), f"a link to oriel://history doesn't navigate the site there ({now['url']})")
ev(site, f"location.href = {origin + '/to-settings'!r}; 1")
time.sleep(1.5)
now = next(x for x in tabs() if x["id"] == site)
t.ok(not now.get("internal") and not str(now["url"]).startswith("oriel:") and not internal("settings"), f"a redirect to oriel://settings goes nowhere ({now['url']})")
b.cmd("tab.select", id=site)
ev(site, f"location.href = {origin + '/site'!r}; 1")
b.wait_for(lambda: ev(site, "document.title") == "site", what="site again")
for bad in ["data:text/html,<title>data</title>", "file:///etc/hosts", "javascript:alert(1)"]:
    ev(site, f"window.open({bad!r}); 1")
time.sleep(1.0)
t.ok(not has_tab(lambda x: re.match(r"^(data|file|javascript):", x.get("url") or "")), "nor script, data: or a file of this computer")
opens = guard()["opens"]
t.ok(sum(1 for o in opens if o["url"].startswith("oriel:")) >= 2, f"the bench saw the refused opens ({[o['url'][:24] for o in opens]})")
ev(site, f"window.open({origin + '/other'!r}); 1")
try:
    b.wait_for(lambda: has_tab(lambda x: (x.get("url") or "").endswith("/other")), what="another site")
except AssertionError:
    pass
t.ok(has_tab(lambda x: (x.get("url") or "").endswith("/other")), "a website still opens another website in a tab")
b.cmd("settings.open")
b.wait_for(lambda: internal("settings"), what="Settings tab")
st = next(x for x in tabs() if x.get("internal") == "settings")["id"]
b.wait_for(lambda: ev(st, "typeof window.oriel") == "object", what="Settings drawn", within=30)
ev(st, "window.open('oriel://history'); 1")
try:
    b.wait_for(lambda: internal("history"), what="History from Settings")
except AssertionError:
    pass
t.ok(internal("history"), "an Oriel page may still open another Oriel page")

# 4. Test knobs only outside a package (studio/09 §1.2).
src = Path(__file__).resolve().parent.parent / "src"
direct = []
for f in src.rglob("*.ts"):
    if f.name == "testhooks.ts":
        continue
    for n, line in enumerate(f.read_text(encoding="utf-8").splitlines(), 1):
        if re.search(r"process\.env(\.|\[\s*['\"`])(SEARCH|ORIEL)_", line) or re.search(r"process\.env\[(?!\s*['\"`])", line):
            direct.append(f"{f.relative_to(src)}:{n}")
t.ok(not direct, f"every test knob is read through testhooks.ts ({direct[:5]})")
h = b.call({"do": "guard.hooks", "name": "ORIEL_GUARD_KNOB"})
t.ok(h["allowed"] and h["env"] == "on", "with electron . (not packaged) the knobs work")
t.ok(h["packaged"] is False and h["packagedEnv"] is None, "an installed copy (app.isPackaged) would read none of them")
p = b.call({"do": "guard.hooks", "name": "SEARCH_PROBE"})
t.ok(p["env"] and p["packagedEnv"] is None, "nor SEARCH_PROBE, so no bench socket")

t.ok(not b.state().get("errors"), "no error in the main process")
server.shutdown()
t.done()

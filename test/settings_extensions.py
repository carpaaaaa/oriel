#!/usr/bin/env python3
"""Settings › Extensions as Search for Mac draws it (ExtensionsUI.swift
ExtensionsPage, studio/04 §2.5-2.6): the empty state; an unpacked extension
appearing by itself with its icon, name, version and folder; "Runs on" (all
sites, sites you name, on click) really keeping its script off the other
sites; pinning, Options, turning off and on from its row; Remove asking first
and taking it away; the puzzle only while one is installed."""
import http.server
import json
import socketserver
import sys
import threading
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b

FIXTURE = Path(__file__).resolve().parent / "fixtures" / "settings-ext"


class Site(http.server.BaseHTTPRequestHandler):
    """One small page, reached as 127.0.0.1 and as localhost: two sites."""

    def do_GET(self):
        body = b"<!doctype html><title>site page</title><p>hello"
        self.send_response(200)
        self.send_header("Content-Type", "text/html")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a):
        pass


server = socketserver.ThreadingTCPServer(("127.0.0.1", 0), Site)
server.daemon_threads = True
PORT = server.server_address[1]
threading.Thread(target=server.serve_forever, daemon=True).start()
A = f"http://127.0.0.1:{PORT}"
B = f"http://localhost:{PORT}"

b.use("settings-extensions")
b.launch()
t = b.T()


def ev(tab, js):
    try:
        return b.ev(tab, js)
    except RuntimeError:
        return None


def ext_row(st=None):
    return next((e for e in ((st or b.window()).get("ext") or {}).get("list", []) if e["id"] == EXT), None)


def kept_manifest():
    """The copy Oriel keeps (Unpacked/settings-ext): its manifest now, and
    whether the one it came with is kept beside it."""
    return json.loads((KEPT / "manifest.json").read_text()), (KEPT / ".oriel-manifest.json").exists()


def open_settings():
    r = b.cmd("settings.open", page="extensions")
    b.wait_for(lambda: ev(r["tab"], "!!document.querySelector('.extset')"), what="Settings › Extensions")
    return r["tab"]


LIST = ".dd-list.popmenu:not(.leaving)"


def open_menu(tab, button):
    """A row's menu, its button pressed. The page losing focus puts a menu
    away, as Windows' do: pressed again until it stays."""
    for _ in range(4):
        b.wait_for(lambda: not ev(tab, "document.querySelector('.dd-list.popmenu')"), within=3, what="no menu up")
        ev(tab, "(() => { const b = document.querySelector(%s); b.dispatchEvent(new PointerEvent('pointerdown', {button: 0, bubbles: true})) })()" % json.dumps(button))
        time.sleep(0.4)
        if ev(tab, f"document.querySelectorAll('{LIST} .dd-row').length"):
            return True
    return False


def menu_pick(tab, button, label):
    """Opens a row's menu and picks a row by its words."""
    if not open_menu(tab, button):
        return False
    return ev(tab, "(() => { const r = [...document.querySelectorAll('%s .dd-row')].find(r => r.textContent.trim() === %s); if (!r || r.getAttribute('aria-disabled') === 'true') return false; r.click(); return true })()" % (LIST, json.dumps(label)))


def menu_words(tab, button):
    if not open_menu(tab, button):
        return []
    words = ev(tab, f"[...document.querySelectorAll('{LIST} .dd-row')].map(r => r.textContent.trim())")
    ev(tab, "window.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape'}))")
    return words


def mark(url):
    """A page opened in a tab of its own: did the extension's script run there?"""
    b.cmd("tab.new", url=url)
    b.wait_for(lambda: (b.active() or {}).get("url", "").startswith(url) and b.active()["title"] == "site page", what=f"page {url}")
    tab = b.active()["id"]
    time.sleep(0.4)
    return tab, ev(tab, "document.documentElement.dataset.settingsExt || ''")


settings = open_settings()

# 1. None yet: the Mac's words, and no puzzle in the window.
b.wait_for(lambda: ev(settings, "document.querySelector('.extset .st-nothing')?.textContent"), what="empty state")
t.ok(ev(settings, "document.querySelector('.extset .st-nothing').textContent") == "No extensions yet.", "with none installed, the page says No extensions yet.")
t.ok(b.ui("!!document.querySelector('.ext-puzzle')") is False, "and the window has no puzzle")
heads = ev(settings, "[...document.querySelectorAll('.extset .st-line-title, .extset-add-head > span')].map(e => e.textContent)")
t.ok(heads == ["Add from the Chrome Web Store", "From another browser", "Load an unpacked extension"], f"the Mac's cards, in its order ({heads})")
t.ok(ev(settings, "document.querySelector('.extset-field').placeholder") == "Paste a link to an extension, or its id", "the field takes a link or an id")
t.ok(ev(settings, "[...document.querySelectorAll('.extset .pill-st')].map(p => p.textContent)") == ["Open the Store", "Add", "Bring them over…", "Choose…"],
     "Open the Store, Add, Bring them over… and Choose…")
t.ok(ev(settings, "[...document.querySelectorAll('.extset .pill-st')].find(p => p.textContent === 'Add').disabled") is True, "Add waits for an id")
t.ok("Safari" not in ev(settings, "document.querySelector('.extset').innerText"), "nothing of the Mac's Safari apps")

# 2. Loaded unpacked: it appears by itself, with its icon, name, version, folder.
ext = b.call({"do": "extensions.loadUnpacked", "path": str(FIXTURE), "copy": True})
EXT = ext["id"]
KEPT = Path(ext["path"])
row = f".extset-row[data-ext='{EXT}']"
b.wait_for(lambda: ev(settings, f"!!document.querySelector(\"{row}\")"), what="row appears")
t.ok(True, "the extension appears in the page without reloading it")
t.ok(ev(settings, f"document.querySelector(\"{row} .extset-name\").textContent") == "Settings Test", "with its name")
t.ok(ev(settings, f"document.querySelector(\"{row} .extset-detail\").textContent") == "Version 2.1 · From “settings-ext”", "its version and the folder it came from")
icon = ev(settings, f"(() => {{ const i = document.querySelector(\"{row} .extset-icon img\"); return i && {{src: i.src.slice(0, 22), w: i.naturalWidth, box: i.getBoundingClientRect().width}} }})()")
t.ok(icon and icon["src"] == "data:image/png;base64," and icon["w"] == 44 and round(icon["box"]) == 22, f"and its own icon, 22 wide ({icon})")
t.ok(not ev(settings, "!!document.querySelector('.extset .st-nothing')"), "No extensions yet. is gone")
t.ok(ev(settings, f"document.querySelector(\"{row} .st-sw\").getAttribute('aria-checked')") == "true", "its switch is on")
t.ok(ev(settings, f"document.querySelector(\"{row} .extset-runs\").textContent") == "All sites", "Runs on: All sites")
t.ok(ev(settings, f"document.querySelector(\"{row} .extset-more\").getAttribute('aria-label')") == "More for Settings Test", "its … is More for Settings Test")
b.wait_for(lambda: b.ui("!!document.querySelector('.ext-puzzle')"), what="puzzle")
t.ok(True, "with one installed, the window has its puzzle")
words = menu_words(settings, f"{row} .extset-more")
t.ok(words == ["Pin to Toolbar", "Options", "Reload", "Remove"], f"the … menu: {words}")
words = menu_words(settings, f"{row} .extset-runs")
t.ok(words == ["All Sites It Asks For", "Only Sites I Name", "Only When I Click It"], f"the Runs on menu: {words}")

# 3. Runs on: every site, as it asked.
tab_a, m = mark(A + "/one")
t.ok(m == "ran", f"All sites: its script runs on 127.0.0.1 ({m!r})")
tab_b, m = mark(B + "/one")
t.ok(m == "ran", f"and on localhost ({m!r})")

# Only the sites named.
b.cmd("tab.select", id=settings)
t.ok(menu_pick(settings, f"{row} .extset-runs", "Only Sites I Name"), "Only Sites I Name, from the capsule")
b.wait_for(lambda: (ext_row() or {}).get("sites", {}).get("mode") == "some", what="mode some")
b.wait_for(lambda: ev(settings, f"!!document.querySelector(\"{row} .extset-site-field\")"), what="site list")
t.ok(ev(settings, f"document.querySelector(\"{row} .extset-runs\").textContent") == "Some sites", "the capsule says Some sites")
t.ok(ev(settings, f"document.querySelector(\"{row} .extset-site-field\").placeholder") == "Add a site, like example.com", "a field to add a site")
t.ok(ev(settings, f"document.querySelector(\"{row} .extset-site-note\").textContent") == "Subdomains included. Elsewhere it runs once you click its button, on that tab until it leaves the site.",
     "with the Mac's note")
ev(settings, f"(() => {{ const f = document.querySelector(\"{row} .extset-site-field\"); f.value = 'http://127.0.0.1:{PORT}/x'; f.dispatchEvent(new Event('input', {{bubbles: true}})) }})()")
ev(settings, f"[...document.querySelectorAll(\"{row} .extset-site-add .pill-st\")].find(p => p.textContent === 'Add').click()")
b.wait_for(lambda: (ext_row() or {}).get("sites", {}).get("hosts") == ["127.0.0.1"], what="host added")
b.wait_for(lambda: ev(settings, f"document.querySelector(\"{row} .extset-host span\")?.textContent") == "127.0.0.1", what="host listed")
t.ok(True, "a site typed as an address is kept as its host, and listed")
loaded = lambda: any(e["id"] == EXT for e in b.call({"do": "extensions.list"})["extensions"])
b.wait_for(lambda: (kept_manifest()[0].get("content_scripts") or [{}])[0].get("matches") == ["*://127.0.0.1/*"] and loaded(), what="loaded again")
m_kept, original = kept_manifest()
t.ok(m_kept["content_scripts"][0]["matches"] == ["*://127.0.0.1/*"] and m_kept["host_permissions"] == ["*://127.0.0.1/*"] and original,
     f"its kept copy is held to that site ({m_kept.get('content_scripts')}, {m_kept.get('host_permissions')})")
_, m = mark(A + "/two")
t.ok(m == "ran", f"Some sites: it runs on the site named ({m!r})")
_, m = mark(B + "/two")
t.ok(m == "", f"and not on another ({m!r})")

# On click: no site until its button is pressed there, then that tab's site.
b.cmd("tab.select", id=settings)
t.ok(menu_pick(settings, f"{row} .extset-runs", "Only When I Click It"), "Only When I Click It")
b.wait_for(lambda: (ext_row() or {}).get("sites", {}).get("mode") == "click", what="mode click")
b.wait_for(lambda: ev(settings, f"document.querySelector(\"{row} .extset-runs\").textContent") == "On click", what="capsule")
t.ok(ev(settings, f"document.querySelector(\"{row} .extset-site-note\").textContent") == "It runs on a page once you click its button there, on that tab until it leaves the site.",
     "the note for On click, and no field")
b.wait_for(lambda: kept_manifest()[0].get("content_scripts") is None and loaded(), what="held to no site")
t.ok(kept_manifest()[0].get("host_permissions") == [], "its kept copy asks for no site at all")
click_tab, m = mark(A + "/three")
t.ok(m == "", f"On click: not on the site before the click ({m!r})")
b.cmd("ext.press", id=EXT)
b.wait_for(lambda: ev(click_tab, "document.documentElement.dataset.settingsExt || ''") == "ran", within=15, what="script after click")
t.ok(True, "pressing its button runs it on that tab's site")
pop = b.wait_for(lambda: (x := b.call({"do": "extensions.popup"}))["open"] and x["shown"] and not x["loading"] and x, within=8, what="popup")
t.ok(pop["url"] == f"chrome-extension://{EXT}/popup.html", f"and its popup opens as usual ({pop['url']})")
b.cmd("ext.popupClose")
_, m = mark(B + "/four")
t.ok(m == "", f"another site stays without it ({m!r})")
# The tab leaves the site: the click's grant goes with it.
b.cmd("tab.go", id=click_tab, input=B + "/elsewhere")
b.wait_for(lambda: kept_manifest()[0].get("content_scripts") is None and any(e["id"] == EXT for e in b.call({"do": "extensions.list"})["extensions"]), within=10, what="grant gone")
_, m = mark(A + "/five")
t.ok(m == "", f"once its tab left the site, the site is without it again ({m!r})")

# All sites again: the manifest as it came.
b.cmd("tab.select", id=settings)
t.ok(menu_pick(settings, f"{row} .extset-runs", "All Sites It Asks For"), "All Sites It Asks For")
b.wait_for(lambda: (ext_row() or {}).get("sites", {}).get("mode") == "all", what="mode all")
b.wait_for(lambda: kept_manifest()[1] is False, what="original back")
m_kept, _ = kept_manifest()
t.ok(m_kept["content_scripts"][0]["matches"] == ["<all_urls>"], "every site again: its manifest as it came")
t.ok(not ev(settings, f"!!document.querySelector(\"{row} .extset-sites\")"), "and the site list goes")

# 4. Pin from the … menu: its button by the puzzle.
t.ok(menu_pick(settings, f"{row} .extset-more", "Pin to Toolbar"), "Pin to Toolbar")
b.wait_for(lambda: (ext_row() or {}).get("pinned") is True, what="pinned")
b.wait_for(lambda: b.ui(f"!!document.querySelector(\".ext-button[data-ext='{EXT}']\")"), what="pinned button")
t.ok(True, "pinned: its button is beside the puzzle")
b.wait_for(lambda: ev(settings, "document.querySelectorAll('.dd-list.popmenu').length") == 0, what="menu closed")
words = menu_words(settings, f"{row} .extset-more")
t.ok(words[0] == "Unpin", f"and the menu says Unpin ({words})")

# Options opens its page in a tab.
t.ok(menu_pick(settings, f"{row} .extset-more", "Options"), "Options")
b.wait_for(lambda: (b.active() or {}).get("url") == f"chrome-extension://{EXT}/options.html", what="options tab")
t.ok(True, "Options opens its options page in a tab")
b.cmd("tab.select", id=settings)

# 5. Off and on from its switch.
ev(settings, f"document.querySelector(\"{row} .st-sw\").click()")
b.wait_for(lambda: (ext_row() or {}).get("enabled") is False, what="off")
b.wait_for(lambda: ev(settings, f"document.querySelector(\"{row} .st-sw\").getAttribute('aria-checked')") == "false", what="switch off")
t.ok(not any(e["id"] == EXT for e in b.call({"do": "extensions.list"})["extensions"]), "its switch turns it off: not loaded, still listed")
t.ok(ev(settings, f"!!document.querySelector(\"{row} .extset-icon img\")") is False, "off, the puzzle piece stands for its icon, as on the Mac")
ev(settings, f"document.querySelector(\"{row} .st-sw\").click()")
b.wait_for(lambda: any(e["id"] == EXT for e in b.call({"do": "extensions.list"})["extensions"]), what="on")
b.wait_for(lambda: ev(settings, f"!!document.querySelector(\"{row} .extset-icon img\")"), what="icon back")
t.ok(True, "and on again")

# Settings' find field finds where an extension runs.
ev(settings, "(() => { const f = document.querySelector('.st-find input'); f.value = 'site access'; f.dispatchEvent(new Event('input', {bubbles: true})) })()")
time.sleep(0.3)
t.ok("Where an extension runs" in (ev(settings, "document.querySelector('.st-column').innerText") or ""), "site access finds Where an extension runs")
ev(settings, "(() => { const f = document.querySelector('.st-find input'); f.value = ''; f.dispatchEvent(new Event('input', {bubbles: true})) })()")
b.wait_for(lambda: ev(settings, f"!!document.querySelector(\"{row}\")"), what="row back")

# 6. Remove asks first; Cancel keeps it, Remove takes it away.
b.call({"do": "extensions.answer", "answers": ["Cancel"]})
t.ok(menu_pick(settings, f"{row} .extset-more", "Remove"), "Remove")
b.wait_for(lambda: len(b.call({"do": "extensions.asked"})["asked"]) > 0, what="asked")
asked = b.call({"do": "extensions.asked"})["asked"][-1]
t.ok(asked["message"] == "Remove “Settings Test”?" and asked["detail"] == "Its settings and data go with it." and asked["buttons"] == ["Remove", "Cancel"],
     f"Remove asks first, in the Mac's words ({asked})")
time.sleep(0.5)
t.ok(ev(settings, f"!!document.querySelector(\"{row}\")") is True, "Cancel keeps it")
b.call({"do": "extensions.answer", "answers": ["Remove"]})
t.ok(menu_pick(settings, f"{row} .extset-more", "Remove"), "Remove again")
b.wait_for(lambda: not ev(settings, f"!!document.querySelector(\"{row}\")"), what="row gone")
t.ok(not any(e["id"] == EXT for e in b.call({"do": "extensions.list"})["extensions"]), "Remove takes it away, and the page follows")
b.wait_for(lambda: ev(settings, "document.querySelector('.extset .st-nothing')?.textContent") == "No extensions yet.", what="empty again")
t.ok(True, "No extensions yet. once more")
b.wait_for(lambda: not b.ui("!!document.querySelector('.ext-puzzle')"), what="puzzle gone")
t.ok(True, "and the puzzle goes with the last one")

server.shutdown()
t.done()

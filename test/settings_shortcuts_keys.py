#!/usr/bin/env python3
"""Keyboard & Mouse › Shortcuts as Search for Mac's editor (ShortcutsPage.swift,
Shortcuts.swift; studio/03 §4.1-4.2) with Windows' keys (keys.ts): every
command with its key, a card to a menu; click a key and press another, Oriel's
own keys standing aside meanwhile; the keys Windows keeps refused; a key
another command has moves after "press again"; Clear, Reset, Reset All; an
extension's command too. The keys changed work in the window, and are kept as
differences under `shortcuts`."""
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
    def do_GET(self):
        body = b"<!doctype html><title>a page</title><p>hello"
        self.send_response(200)
        self.send_header("Content-Type", "text/html")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a):
        pass


server = socketserver.ThreadingTCPServer(("127.0.0.1", 0), Site)
server.daemon_threads = True
SITE = f"http://127.0.0.1:{server.server_address[1]}"
threading.Thread(target=server.serve_forever, daemon=True).start()

b.use("settings-shortcuts-keys")
b.launch()
t = b.T()


def ev(tab, js):
    try:
        return b.ev(tab, js)
    except RuntimeError:
        return None


def press(key, *mods, to="page"):
    b.call({"do": "field.key", "key": key, "modifiers": list(mods), "to": to})


def shortcuts():
    return b.state()["prefs"].get("shortcuts") or {}


def tabs():
    return len(b.window()["tabs"])


r = b.cmd("settings.open", page="keyboard")
S = r["tab"]
b.wait_for(lambda: ev(S, "document.querySelectorAll('.kbset-row').length"), what="the editor")
time.sleep(0.4)


def box(cmd):
    return f"[data-command='{cmd}'] .kbset-key"


def label(cmd):
    return ev(S, f"document.querySelector(\"{box(cmd)}\")?.textContent")


def click(cmd):
    ev(S, f"document.querySelector(\"{box(cmd)}\").click()")


def hunt(text):
    ev(S, "(() => { const f = document.querySelector('.kbset .st-hunt input'); f.value = %s; f.dispatchEvent(new Event('input', {bubbles: true})) })()" % json.dumps(text))
    time.sleep(0.2)


def rows():
    return ev(S, "[...document.querySelectorAll('.kbset-row')].map(r => r.dataset.command)")


def front():
    b.cmd("tab.select", id=S)
    time.sleep(0.5)


# 1. The list: the menus' sections, each command with its Windows key.
caps = ev(S, "[...document.querySelectorAll('.kbset-section .st-caption')].map(c => c.textContent)")
ORDER = ["Oriel", "File", "Edit", "View", "Tabs", "Spaces", "Profiles", "Bookmarks", "History", "Extensions"]
# A menu whose commands have nothing behind them on Windows yet isn't listed (Bookmarks).
t.ok(caps[:5] == ORDER[:5] and "History" in caps and caps == [c for c in ORDER if c in caps], f"a card to a menu, in the menus' order ({caps})")
t.ok("Spaces" not in caps and "Profiles" not in caps, "Spaces only with spaces on; no Profiles")
t.ok(ev(S, "document.querySelector('.kbset .st-hunt input').placeholder") == "Search commands or keys", "a field to find a command or a key")
t.ok(label("file.newTab") == "Ctrl+T" and label("file.closeTab") == "Ctrl+W" and label("tabs.duplicate") == "Ctrl+D", "New Tab Ctrl+T, Close Tab Ctrl+W, Duplicate Tab Ctrl+D")
t.ok(ev(S, "document.querySelector(\"[data-command='file.closeTab'] .st-line-detail\")?.textContent") == "Also Ctrl+F4", "Windows' other key for it is said")
t.ok(label("app.passwords") == "Alt+Shift+L", "keys as Windows writes them (Alt+Shift+L)")
numbers = ev(S, "(() => { const l = [...document.querySelectorAll(\"[data-section='Tabs'] .st-line\")].find(l => l.querySelector('.st-line-title').textContent === 'Tab 1 to 9'); return l && [l.querySelector('.kbset-key').textContent, l.querySelector('.st-line-detail').textContent, l.querySelector('.kbset-key').tagName] })()")
t.ok(numbers == ["Ctrl+1 to Ctrl+9", "The ninth is the last. With spaces on, they can switch spaces instead", "SPAN"], f"Tab 1 to 9 shown, not changed here ({numbers})")
listed = rows()
t.ok(not {"app.quit", "view.fullScreen", "escape", "stop", "window.close", "pin.home", "tabs.recentBack", "tab.1"} & set(listed),
     "fixed keys aren't listed, as the Mac's Command.all hasn't them: only Tab 1 to 9")
t.ok(ev(S, "document.querySelectorAll('.kbset-key.fixed').length") == 1, "and Tab 1 to 9 is the one key shown fixed")
t.ok(not ev(S, "[...document.querySelectorAll('.kbset .pill-st')].some(p => p.textContent === 'Reset All to Defaults')"), "nothing changed: no Reset All")
t.ok(ev(S, f"document.querySelector(\"{box('file.newTab')}\").title") == "Click, then press the new shortcut", "the box says how")

# A page to try keys on, and a closed tab to reopen.
b.cmd("tab.new", url=SITE + "/page")
b.wait_for(lambda: (b.active() or {}).get("title") == "a page", what="page")
P = b.active()["id"]
b.cmd("tab.new", url=SITE + "/closed")
b.wait_for(lambda: (b.active() or {}).get("title") == "a page" and b.active()["id"] != P, what="second page")
b.cmd("tab.close", id=b.active()["id"])
front()

# 2. Listening: Oriel's own keys stand aside, so Ctrl+Shift+T reaches the box.
click("tabs.duplicate")
t.ok(label("tabs.duplicate") == "Type a shortcut", "clicked: Type a shortcut")
n = tabs()
press("T", "control", "shift")
b.wait_for(lambda: label("tabs.duplicate") == "Used by Reopen Closed Tab, press again", within=5, what="used by")
t.ok(True, "a key another command has: Used by Reopen Closed Tab, press again")
time.sleep(0.4)
t.ok(tabs() == n, "and Oriel didn't reopen a tab: its keys stood aside")
press("Escape")
b.wait_for(lambda: label("tabs.duplicate") == "Ctrl+D", within=5, what="escape")
t.ok(not shortcuts(), "Escape stops, nothing changed")

# The keys Windows keeps, the tab numbers, a key alone.
click("file.newTab")
press("C", "control")
b.wait_for(lambda: label("file.newTab") == "Can't be changed", within=3, what="reserved")
t.ok(True, "Ctrl+C: Can't be changed")
press("1", "control")
b.wait_for(lambda: label("file.newTab") == "Picks a tab", within=3, what="tab number")
t.ok(True, "Ctrl+1: Picks a tab")
press("K")
b.wait_for(lambda: label("file.newTab") == "Add Ctrl or Alt", within=3, what="alone")
t.ok(True, "K alone: Add Ctrl or Alt")
press("Escape")
b.wait_for(lambda: label("file.newTab") == "Ctrl+T", within=3, what="escape")

# 3. A new key for Duplicate Tab.
click("tabs.duplicate")
press("Y", "control", "shift")
b.wait_for(lambda: label("tabs.duplicate") == "Ctrl+Shift+Y", within=5, what="new key")
t.ok(ev(S, f"document.querySelector(\"{box('tabs.duplicate')}\").classList.contains('changed')"), "Ctrl+Shift+Y, in bold as changed")
t.ok(shortcuts() == {"tabs.duplicate": {"keys": ["Ctrl+Shift+Y"]}}, f"kept as a difference under shortcuts ({shortcuts()})")
b.wait_for(lambda: ev(S, "[...document.querySelectorAll('.kbset .pill-st')].some(p => p.textContent === 'Reset All to Defaults')"), what="reset all")
t.ok(True, "Reset All to Defaults is offered")

# It works in the window; the old key is the page's again.
b.cmd("tab.select", id=P)
time.sleep(0.4)
n = tabs()
press("Y", "control", "shift")
b.wait_for(lambda: tabs() == n + 1, within=5, what="duplicate")
t.ok(True, "Ctrl+Shift+Y duplicates the tab")
b.cmd("tab.select", id=P)
time.sleep(0.3)
n = tabs()
press("D", "control", to="ui")
time.sleep(0.8)
t.ok(tabs() == n, "Ctrl+D no longer does")

# 4. A key another command has, pressed twice, moves.
front()
click("file.newWindow")
press("Y", "control", "shift")
b.wait_for(lambda: label("file.newWindow") == "Used by Duplicate Tab, press again", within=5, what="press again")
press("Y", "control", "shift")
b.wait_for(lambda: label("file.newWindow") == "Ctrl+Shift+Y", within=5, what="moved")
t.ok(label("tabs.duplicate") == "None", "pressed again, it moves: Duplicate Tab has none")
said = b.wait_for(lambda: ev(S, "document.querySelector('.st-said')?.textContent"), within=3, what="announcement")
t.ok(said == "Ctrl+Shift+Y moved from Duplicate Tab", f"and Oriel says so ({said})")
t.ok(shortcuts() == {"tabs.duplicate": {"keys": None}, "file.newWindow": {"keys": ["Ctrl+Shift+Y"]}}, f"both kept as differences ({shortcuts()})")

# 5. Reset to Default, from the line's right-click menu.
ev(S, "(() => { const r = document.querySelector(\"[data-command='tabs.duplicate']\"); const b = r.getBoundingClientRect(); r.dispatchEvent(new MouseEvent('contextmenu', {bubbles: true, cancelable: true, clientX: b.x + 40, clientY: b.y + 10})) })()")
b.wait_for(lambda: ev(S, "document.querySelectorAll('.dd-list.popmenu:not(.leaving) .dd-row').length") == 2, within=3, what="line menu")
menu = ev(S, "[...document.querySelectorAll('.dd-list.popmenu:not(.leaving) .dd-row')].map(r => [r.textContent, r.getAttribute('aria-disabled')])")
t.ok(menu == [["Clear Shortcut", "true"], ["Reset to Default", "false"]], f"right-click: Clear Shortcut (off, it has none) and Reset to Default ({menu})")
ev(S, "[...document.querySelectorAll('.dd-list.popmenu:not(.leaving) .dd-row')].find(r => r.textContent === 'Reset to Default').click()")
b.wait_for(lambda: label("tabs.duplicate") == "Ctrl+D", within=5, what="reset")
t.ok(shortcuts() == {"file.newWindow": {"keys": ["Ctrl+Shift+Y"]}}, f"Reset to Default brings Ctrl+D back ({shortcuts()})")
b.cmd("tab.select", id=P)
time.sleep(0.4)
n = tabs()
press("D", "control", to="ui")
b.wait_for(lambda: tabs() == n + 1, within=5, what="ctrl+d again")
t.ok(True, "and Ctrl+D duplicates again")

# 6. Find by name or by key.
front()
hunt("dupl")
t.ok(rows() == ["tabs.duplicate"], f"dupl finds Duplicate Tab alone ({rows()})")
hunt("ctrl shift t")
t.ok("file.reopen" in rows(), "a key, as typed, finds its command")
hunt("nothing like this")
t.ok(ev(S, "document.querySelector('.kbset .st-nothing')?.textContent") == "No command called that, or on that key", "nothing found says so")
hunt("")

# 7. Backspace takes a key off; Reset All puts every key back.
click("file.newTab")
press("Backspace")
b.wait_for(lambda: label("file.newTab") == "None", within=5, what="cleared")
t.ok(shortcuts().get("file.newTab") == {"keys": None}, "Backspace takes it off")
ev(S, "[...document.querySelectorAll('.kbset .pill-st')].find(p => p.textContent === 'Reset All to Defaults').click()")
b.wait_for(lambda: not shortcuts(), within=5, what="reset all")
b.wait_for(lambda: label("file.newTab") == "Ctrl+T" and label("file.newWindow") == "Ctrl+N", within=5, what="labels back")
t.ok(True, "Reset All to Defaults: every key as it was")
t.ok(not ev(S, "[...document.querySelectorAll('.kbset .pill-st')].some(p => p.textContent === 'Reset All to Defaults')"), "and the pill goes")

# Windows' other keys stay beside a new one: Close Tab keeps Ctrl+F4.
click("file.closeTab")
press("K", "control", "shift")
b.wait_for(lambda: label("file.closeTab") == "Ctrl+Shift+K", within=5, what="close tab key")
t.ok(shortcuts() == {"file.closeTab": {"keys": ["Ctrl+Shift+K", "Ctrl+F4"]}}, f"a new key for Close Tab keeps Ctrl+F4 ({shortcuts()})")
t.ok(ev(S, "document.querySelector(\"[data-command='file.closeTab'] .st-line-detail\")?.textContent") == "Also Ctrl+F4", "and still says Also Ctrl+F4")
b.cmd("tab.new", url=SITE + "/to-close")
b.wait_for(lambda: (b.active() or {}).get("url", "").endswith("/to-close") and b.active()["title"] == "a page", what="tab to close")
n = tabs()
press("W", "control", to="ui")
time.sleep(0.8)
t.ok(tabs() == n, "Ctrl+W, moved away, closes nothing")
press("F4", "control", to="ui")
b.wait_for(lambda: tabs() == n - 1, within=5, what="ctrl+f4")
t.ok(True, "Ctrl+F4 still closes the tab")
front()
# Zoom In's other keys are the same + key spelled otherwise (KeyCombo): a new key takes their place.
if label("view.zoomIn"):
    click("view.zoomIn")
    press("Z", "alt", "shift")
    b.wait_for(lambda: label("view.zoomIn") == "Alt+Shift+Z", within=5, what="zoom key")
    t.ok(shortcuts().get("view.zoomIn") == {"keys": ["Shift+Alt+Z"]}, f"Zoom In: the new key alone, as the Mac's + key ({shortcuts().get('view.zoomIn')})")
ev(S, "[...document.querySelectorAll('.kbset .pill-st')].find(p => p.textContent === 'Reset All to Defaults').click()")
b.wait_for(lambda: not shortcuts(), within=5, what="reset all again")

# 8. An extension's command: listed under Extensions, its key changed and reset.
ext = b.call({"do": "extensions.loadUnpacked", "path": str(FIXTURE)})
cmd = f"ext:{ext['id']}:say-hello"
b.wait_for(lambda: label(cmd), within=10, what="extension command")
t.ok(label(cmd) == "Ctrl+Shift+Y" and ev(S, f"document.querySelector(\"[data-command='{cmd}'] .st-line-detail\").textContent") == "Settings Test",
     "under Extensions: Say hello, from Settings Test, on its manifest's key")
click(cmd)
press("Right", "control")
b.wait_for(lambda: label(cmd) == "Not for an extension", within=3, what="not for an extension")
t.ok(True, "an arrow: Not for an extension")
press("U", "alt", "shift")
b.wait_for(lambda: label(cmd) == "Alt+Shift+U", within=5, what="ext key")
bound = b.call({"do": "extensions.commands"})["bound"]
t.ok(bound.get("Shift+Alt+U", {}).get("command") == "say-hello" and "Ctrl+Shift+Y" not in bound, f"the extension has its new key ({bound})")
ev(S, f"(() => {{ const r = document.querySelector(\"[data-command='{cmd}']\"); r.dispatchEvent(new MouseEvent('contextmenu', {{bubbles: true, cancelable: true, clientX: 50, clientY: 50}})) }})()")
b.wait_for(lambda: ev(S, "document.querySelectorAll('.dd-list.popmenu:not(.leaving) .dd-row').length") == 2, within=3, what="menu")
ev(S, "[...document.querySelectorAll('.dd-list.popmenu:not(.leaving) .dd-row')].find(r => r.textContent === 'Reset to Default').click()")
b.wait_for(lambda: label(cmd) == "Ctrl+Shift+Y", within=5, what="ext reset")
t.ok(b.call({"do": "extensions.commands"})["bound"].get("Ctrl+Shift+Y", {}).get("command") == "say-hello" and not shortcuts(), "Reset to Default: its manifest's key again")

server.shutdown()
t.done()

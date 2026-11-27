#!/usr/bin/env python3
"""Oriel as the default browser (studio/06 §1.1 general.default and
mail.default, studio/07 §4.1, studio/03 §3.1). Windows lets no app make
itself the default: Make default opens Oriel's own page in Settings › Apps ›
Default apps (ms-settings:defaultapps?registeredAppUser=Oriel) and the row
says what to click there; what Windows chose is read again when Oriel comes
back to the front. The portable copy, and a copy Windows doesn't list, say
so instead of opening Settings. The first launch offers it once, as the
Mac's welcome does. Links and files on the command line (the installer's
"Oriel.exe" -- "%1") open in Oriel, at launch and handed over by a second
launch.

The registry is never read here: the bench answers for Windows
(settings.default). The installed keys, Settings' Set default and a real
`start https://...` are test/default_browser.py's, on Windows."""
import json
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b
import settings_web as web

ROOT = Path(__file__).resolve().parent.parent
SHOTS = os.environ.get("SHOTS_DIR")
t = b.T()
server, origin = web.start()

DETAIL = "Make Oriel the browser Outlook, Slack and the rest send links to"
ASKED = "In Windows Settings, click Set default at the top"
IS = "Oriel is the default browser on this PC"
PORTABLE = "Portable Oriel can't be the default browser. Install Oriel to make it one"
UNLISTED = "Windows doesn't list Oriel as a browser. Installing Oriel again puts it there"
USER_LINK = "ms-settings:defaultapps?registeredAppUser=Oriel"
MACHINE_LINK = "ms-settings:defaultapps?registeredAppMachine=Oriel"


def ev(tab, js):
    try:
        return b.ev(tab, js)
    except RuntimeError:
        return None


def windows(**answer):
    """What Windows would say now; front=True: Oriel comes to the front."""
    return b.call({"do": "settings.default", **answer})


def opened():
    return b.call({"do": "settings.state"})["opened"]


def said():
    return b.call({"do": "settings.state"})["said"]


def settings():
    b.cmd("app.settings")
    b.wait_for(lambda: any(x.get("internal") == "settings" for x in b.window()["tabs"]), what="Settings", within=30)
    tab = next(x for x in b.window()["tabs"] if x.get("internal") == "settings")["id"]
    b.wait_for(lambda: ev(tab, "document.querySelectorAll('.sr').length"), what="rows", within=30)
    time.sleep(0.3)
    return tab


def row(tab, rid):
    return ev(tab, """(() => { const r = document.querySelector("[data-row='%s']"); if (!r) return null
      const pill = r.querySelector('.sr-control .pill-st')
      return { detail: r.querySelector('.sr-detail')?.textContent ?? '', control: pill ? pill.textContent : r.querySelector('.st-done') ? 'check' : null } })()""" % rid)


def click(tab, sel):
    return ev(tab, "(() => { const e = document.querySelector(%s); if (!e) return false; e.click(); return true })()" % json.dumps(sel))


def until(tab, rid, detail, control, what):
    try:
        b.wait_for(lambda: row(tab, rid) == {"detail": detail, "control": control}, what=what, within=10)
        return True
    except AssertionError:
        return False


# 1. The row, as Windows answers.
b.use("settings-default")
b.launch(env={"SEARCH_LOOK": "light"})
tab = settings()
r = row(tab, "general.default")
t.ok(r == {"detail": DETAIL, "control": "Make default"}, f"not the default: the Mac's words and Make default ({r})")

before = len(opened())
click(tab, "[data-row='general.default'] .pill-st")
t.ok(until(tab, "general.default", ASKED, "Make default", "asked"), f"pressed: the row says what to click in Windows Settings ({row(tab, 'general.default')})")
t.ok(opened()[before:] == [USER_LINK], f"…and opens Oriel's page in Settings › Apps › Default apps ({opened()[before:]})")
if SHOTS:
    b.call({"do": "settings.shot", "id": tab, "path": f"{SHOTS}/default-asked.png"})

# Set default pressed in Windows: nothing changes until Oriel comes back.
windows(browser=True)
time.sleep(0.6)
t.ok(row(tab, "general.default")["control"] == "Make default", "Windows' answer is read when Oriel comes to the front, not on a timer")
windows(front=True)
t.ok(until(tab, "general.default", IS, "check", "default"), f"back in front: Oriel is the default, with the tick ({row(tab, 'general.default')})")
t.ok("Links now open here" in said(), f"…and says Links now open here, as the Mac does ({said()[-3:]})")
b.wait_for(lambda: ev(tab, "document.querySelector('.st-said')?.textContent") == "Links now open here", what="announced on the page")
t.ok(True, "the page shows Links now open here")
if SHOTS:
    b.call({"do": "settings.shot", "id": tab, "path": f"{SHOTS}/default-is.png"})

# Another browser chosen later: the button is back, with the first words.
windows(browser=False, front=True)
t.ok(until(tab, "general.default", DETAIL, "Make default", "not again"), f"another browser chosen: Make default again ({row(tab, 'general.default')})")

# Settings opening reads Windows afresh.
windows(browser=True)
ev(tab, "location.reload()")
time.sleep(0.5)
b.wait_for(lambda: ev(tab, "document.querySelectorAll('.sr').length"), what="rows again")
t.ok(until(tab, "general.default", IS, "check", "fresh"), "Settings opening reads what Windows chose")
windows(browser=False, front=True)
until(tab, "general.default", DETAIL, "Make default", "reset")

# An install for everyone: its page is registeredAppMachine.
windows(scope="machine", front=True)
before = len(opened())
click(tab, "[data-row='general.default'] .pill-st")
time.sleep(0.3)
t.ok(opened()[before:] == [MACHINE_LINK], f"installed for everyone: registeredAppMachine ({opened()[before:]})")
windows(scope="user", front=True)

# Email links, with a webmail chosen.
b.cmd("settings.set", id="mail.webmail", value="gmail")
b.wait_for(lambda: (row(tab, "mail.default") or {}).get("control") == "Make default", what="mail row")
before = len(opened())
click(tab, "[data-row='mail.default'] .pill-st")
t.ok(until(tab, "mail.default", "In Windows Settings, find MAILTO and choose Oriel", "Make default", "mail asked"),
     f"email links: says where MAILTO is ({row(tab, 'mail.default')})")
t.ok(opened()[before:] == [USER_LINK], "…on the same page of Settings")
windows(mail=True, front=True)
t.ok(until(tab, "mail.default", "Email links from other apps open here", "check", "mail default"), "back: email links open here, with the tick")
t.ok("Email links now open here" in said(), "…and says Email links now open here")

# The portable copy, and a copy Windows doesn't list: said, no button.
windows(mail=False, portable=True, front=True)
t.ok(until(tab, "general.default", PORTABLE, None, "portable"), f"portable: says it can't, no button ({row(tab, 'general.default')})")
r = row(tab, "mail.default")
t.ok(r == {"detail": "Portable Oriel can't open email links from other apps. Install Oriel for that", "control": None}, f"…for email links too ({r})")
if SHOTS:
    b.call({"do": "settings.shot", "id": tab, "path": f"{SHOTS}/default-portable.png"})
windows(portable=False, scope=None, front=True)
t.ok(until(tab, "general.default", UNLISTED, None, "unlisted"), f"not listed by Windows: says so, no button ({row(tab, 'general.default')})")
before = len(opened())
b.cmd("settings.do", id="general.default")
time.sleep(0.2)
t.ok(len(opened()) == before, "nothing opens Settings when it would land nowhere")
windows(scope="user", front=True)

# How Windows' answer is read (reg query ... /s): UserChoiceLatest first.
older = ("\r\nHKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\https\\UserChoice\r\n"
         "    Hash    REG_SZ    abc=\r\n    ProgId    REG_SZ    ChromeHTML\r\n\r\n")
newer = older + ("HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\https\\UserChoiceLatest\\ProgId\r\n"
                 "    ProgId    REG_SZ    OrielURL\r\n\r\n")
t.ok(windows(registry=older)["progId"] == "ChromeHTML", "UserChoice's ProgId is read")
t.ok(windows(registry=newer)["progId"] == "OrielURL", "UserChoiceLatest, where Windows 11 has it, comes first")
t.ok(windows(registry="")["progId"] is None, "nothing chosen: nothing read")

# The command line as Windows writes it: "Oriel.exe" -- "%1".
files = Path(tempfile.mkdtemp(prefix="oriel-default-"))
page = files / "Page one.html"
page.write_text("<title>One</title><p>one</p>")
(files / "notes.txt").write_text("x")
links = windows(args=["C:\\Oriel\\Oriel.exe", "--", str(page), "https://example.com/", "mailto:a@example.com",
                      "page.html", str(files / "notes.txt"), str(files), "--allow-file-access-from-files"])["links"]
t.ok(links == [page.as_uri(), "https://example.com/", "mailto:a@example.com"],
     f"links and web files on the command line, nothing else ({links})")
t.ok(not b.state().get("errors"), "no error in the main process")
b.quit()

# 2. Launched with a file, then handed more by a second launch. Links from
# other apps open in a small window by default (links.little, as on the Mac).
b.use("settings-default-args")
web.PAGES["/two"] = "<title>Two</title><p>two</p>"


def shown(url):
    """Open in a small window or in a tab of any window."""
    littles = b.call({"do": "settingsb.littles"})["littles"]
    return any(l.get("url") == url for l in littles) or any(x.get("url") == url for w in b.state()["windows"] for x in w["tabs"])


littles = lambda: b.call({"do": "settingsb.littles"})["littles"]
# Started by a link for a small window: that window alone, the browser's kept
# away (studio/01 §10.27 keepWindowsAway; the user's report, 27 Nov 2026:
# the browser window came up over the small one).
b.launch("--", str(page), ready=lambda: littles())
b.wait_for(lambda: shown(page.as_uri()), what="the file at launch", within=20)
t.ok(True, "launched with a file: it opens (in a small window, as links from other apps do)")
t.ok(b.state()["windows"] == [], "…alone: no browser window comes up over it")


def second(*args):
    electron = ROOT / "node_modules" / ".bin" / ("electron.cmd" if b.IS_WIN else "electron")
    env = dict(os.environ, SEARCH_PROBE=b.WORLD, SEARCH_CHROME="windows")
    p = subprocess.Popen([str(electron), str(ROOT), *args], env=env, cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, shell=b.IS_WIN)
    try:
        return p.wait(30)
    except subprocess.TimeoutExpired:
        p.kill()
        return None


page2 = files / "two.xhtml"
page2.write_text('<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Two</title></head><body>two</body></html>')
code = second("--", str(page2))
t.ok(code == 0, f"a second launch hands over and quits ({code})")
b.wait_for(lambda: shown(page2.as_uri()), what="the handed file", within=20)
t.ok(True, "…its file opens in the first Oriel")
second("--", origin + "/two")
b.wait_for(lambda: shown(origin + "/two"), what="the handed link", within=20)
t.ok(len(b.state()["windows"]) == 0 and len(littles()) == 3, "…a link too, in the same Oriel, a small window of its own")
# Open in Oriel with no browser window: one is made and the page is its tab.
l = littles()[-1]
got = b.call({"do": "settingsb.littleKeep", "id": l["id"]})["tab"]
b.wait_for(lambda: len(b.state()["windows"]) == 1, what="a browser window", within=20)
t.ok(got and any(x["id"] == got and x["url"] == origin + "/two" for x in b.window()["tabs"]), "Open in Oriel with Oriel's window closed: a window, the page in it")
n = len(littles()) + len(b.window()["tabs"])
second()
time.sleep(1)
t.ok(len(littles()) + len(b.window()["tabs"]) == n and len(b.state()["windows"]) == 1, "a second launch with nothing opens nothing new")
b.quit()

# With links in a small window off: in a tab of the window.
b.use("settings-default-args-tab")
folder = b.folder()
folder.mkdir(parents=True, exist_ok=True)
(folder / "prefs.json").write_text(json.dumps({"links.little": False}))
b.launch("--", str(page))
b.wait_for(lambda: any(x.get("url") == page.as_uri() for x in b.window()["tabs"]), what="the file in a tab", within=20)
t.ok(True, "with small windows off, the file opens in a tab")
t.ok(not b.state().get("errors"), "no error in the main process")
b.quit()

# 3. The first launch's offer (Welcome.swift's links page), once.
OFFER = {"ORIEL_DEFAULT_OFFER": "1", "SEARCH_LOOK": "light"}


def offer_up():
    o = b.window().get("overlay") or {}
    return o.get("kind") == "panel" and o.get("name") == "settings.default"


def plate():
    return b.ui("document.querySelector('.df-plate')?.innerText ?? null", root="overlay")


b.use("settings-default-offer")
b.launch(env=OFFER)
b.wait_for(offer_up, what="the offer at the first launch", within=20)
b.wait_for(plate, what="the plate drawn")
text = plate()
t.ok("Links from other apps." in text and "It can be this one." in text and "Make Oriel the default" in text,
     f"the first launch offers it, in the Mac's words ({text!r})")
t.ok("—" not in text and "–" not in text, "no long dashes")
t.ok(windows()["offered"], "offered once (browser.offered)")
if SHOTS:
    time.sleep(0.6)  # past its fade in
    b.shot(Path(SHOTS) / "default-offer.png")
before = len(opened())
b.ui("document.querySelector('.df-make').click()", root="overlay")
b.wait_for(lambda: "Set default" in (plate() or ""), what="what to click")
t.ok("In Windows Settings, click Set default at the top" in plate(), "Make Oriel the default: says what to click in Settings")
t.ok(opened()[before:] == [USER_LINK], "…and opens Oriel's page there")
windows(browser=True, front=True)
b.wait_for(lambda: "Oriel is the default browser" in (plate() or ""), what="ticked")
t.ok("Done" in plate(), "back in front: Oriel is the default browser, and Done")
if SHOTS:
    b.shot(Path(SHOTS) / "default-offer-done.png")
b.ui("document.querySelector('.df-ok').click()", root="overlay")
b.wait_for(lambda: not offer_up(), what="put away")
t.ok(windows()["offer"] is None, "Done puts it away")
b.quit()

b.use("settings-default-offer", wipe=False)
b.launch(env=OFFER)
time.sleep(2)
t.ok(not offer_up(), "not again at the next launch")
b.quit()

b.use("settings-default-offer-x")
b.launch(env=OFFER)
b.wait_for(offer_up, what="the offer", within=20)
b.wait_for(plate, what="drawn")
b.ui("document.querySelector('.up-x').click()", root="overlay")
b.wait_for(lambda: not offer_up(), what="closed")
t.ok(len(opened()) == 0, "its X puts it away, and nothing is opened")
b.quit()

for name, fake, why in (("default", {"browser": True}, "already the default"), ("portable", {"portable": True}, "the portable copy"),
                        ("unlisted", {"scope": None}, "not listed by Windows")):
    b.use(f"settings-default-offer-{name}")
    b.launch(env={**OFFER, "ORIEL_DEFAULT_FAKE": json.dumps(fake)})
    time.sleep(2)
    t.ok(not offer_up() and not windows()["offered"], f"no offer for {why}")
    b.quit()

b.use("settings-default-quiet")
b.launch()
time.sleep(2)
t.ok(not offer_up(), "a test world gets no offer unless it asks (other tests stay as they were)")
server.shutdown()
t.done()

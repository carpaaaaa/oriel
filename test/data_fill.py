#!/usr/bin/env python3
"""Passwords in pages (studio/05 §2.3-2.6): the question after a sign-in that
took (Save, Update, Not now, Never here), none after one refused, none for a
known pair; the accounts under a sign-in box (http only for http, half a
second before a click counts, arrows and Enter), the name of a first step
carried to the password page, Windows Hello before filling when Settings
asks (a minute's grace), and Remove All behind a proof. A local site on
127.0.0.1 plays the sign-in."""
import json
import os
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b

LOGIN = ("<!doctype html><title>Sign in</title><h1>{msg}</h1>"
         "<form method=post action=/login><input id=u name=username autocomplete=username>"
         "<input id=p name=password type=password autocomplete=current-password>"
         "<button id=go type=submit>Sign in</button></form>")
PAGES = {
    "/login": LOGIN.format(msg="Sign in"),
    "/home": "<!doctype html><title>Home</title>Welcome",
    "/step1": ("<!doctype html><title>Step 1</title><form action=/step2 method=get>"
               "<input id=e type=text name=identifier autocomplete=username><button id=next>Next</button></form>"),
    "/step2": ("<!doctype html><title>Step 2</title><form method=post action=/login>"
               "<input id=p type=password name=password autocomplete=current-password><button id=go>Sign in</button></form>"),
}


class Site(BaseHTTPRequestHandler):
    def reply(self, code, body="", location=None):
        data = body.encode()
        self.send_response(code)
        if location:
            self.send_header("Location", location)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        self.reply(200, PAGES.get(self.path.split("?")[0], "<title>404</title>"))

    def do_POST(self):
        form = parse_qs(self.rfile.read(int(self.headers.get("Content-Length", 0))).decode())
        if form.get("password", [""])[0].startswith("right"):
            self.reply(303, location="/home")
        else:
            self.reply(200, LOGIN.format(msg="Wrong password"))

    def log_message(self, *a):
        pass


srv = ThreadingHTTPServer(("127.0.0.1", 0), Site)
threading.Thread(target=srv.serve_forever, daemon=True).start()
SITE = f"http://127.0.0.1:{srv.server_port}"

b.use("data-fill")
SHOTS = os.environ.get("SHOTS_DIR")
b.launch()
t = b.T()


def req(name, **kw):
    return b.call({"do": name, **kw})


def forms():
    return req("data.forms")


loads = 0


def open_page(path, title):
    # A new document each time, told apart by its address: the old one has
    # the same title, and its boxes may be the ones just picked into.
    global loads
    loads += 1
    url = f"{SITE}{path}{'&' if '?' in path else '?'}load={loads}"
    tab = b.active()
    if tab and not tab["empty"]:
        b.cmd("tab.go", input=url)
    else:
        b.cmd("field.commit", text=url)
    # Generous: the first page of a cold app on a slow runner (Windows on ARM).
    try:
        b.wait_for(lambda: (b.active() or {}).get("url") == url and b.active().get("title") == title and not b.active()["loading"], within=45, what=title)
    except AssertionError:
        a = b.active() or {}
        print("       active tab:", {k: a.get(k) for k in ("url", "title", "loading", "empty", "error")})
        raise
    time.sleep(0.3)
    return b.active()["id"]


def typed(tab, box, value):
    b.ev(tab, f"(() => {{ const e = document.getElementById('{box}'); e.focus(); e.value = {value!r}; e.dispatchEvent(new Event('input', {{ bubbles: true }})); }})()")


def sign_in(user, password, then="Home"):
    tab = open_page("/login", "Sign in")
    typed(tab, "u", user)
    typed(tab, "p", password)
    b.ev(tab, "document.getElementById('go').click()")
    b.wait_for(lambda: b.active()["title"] in (then, "Sign in") and not b.active()["loading"], what="after sign-in")
    time.sleep(0.8)
    return tab


def overlay_text():
    return b.ui("document.body.innerText", root="overlay")


# A sign-in that took: Save.
sign_in("alice", "right")
f = b.wait_for(lambda: forms()["offering"], what="the question")
t.ok(f == {"host": "127.0.0.1", "user": "alice", "changed": False}, f"offered after the page moved on ({f})")
b.wait_for(lambda: forms()["overlay"] == {"kind": "panel", "name": "data.save"}, what="the bubble")
time.sleep(0.3)
text = overlay_text()
if SHOTS:
    b.shot(f"{SHOTS}/data-save-question.png")
t.ok("Save the password for alice on 127.0.0.1?" in text, f"the question, as the Mac asks it ({text!r})")
t.ok("Save" in text and "Not now" in text and "Never here" in text, "Save, Not now, Never here")
said = b.cmd("save.answer", answer="save")
t.ok(said == "Password saved for 127.0.0.1", f"saved ({said})")
kept = {(k["host"], k["user"]): k for k in req("data.vault")["logins"]}
t.ok(kept.get(("127.0.0.1", "alice"), {}).get("clear") is True, "kept as one from plain http")
t.ok(req("data.secret", host="127.0.0.1", user="alice")["value"] == "right", "the password")
t.ok(forms()["overlay"]["kind"] == "none", "the bubble goes")

# Refused: still a password box, no question.
sign_in("alice", "wrong", then="Sign in")
time.sleep(1.5)
t.ok(forms()["offering"] is None, "a refused sign-in is not offered")

# The same pair again: nothing asked.
used = kept[("127.0.0.1", "alice")].get("used", 0)
time.sleep(0.05)
sign_in("alice", "right")
time.sleep(1.0)
t.ok(forms()["offering"] is None, "a pair already kept asks nothing")
t.ok(next(k for k in req("data.vault")["logins"] if k["user"] == "alice").get("used", 0) > used, "only its last use moves")

# Another password for the same name: Update, without Never here.
sign_in("alice", "right2")
f = b.wait_for(lambda: forms()["offering"], what="update")
t.ok(f["changed"] is True, "the same account with another password")
time.sleep(0.4)
text = overlay_text()
t.ok("Update the password for alice on 127.0.0.1?" in text and "Never here" not in text, f"Update ({text!r})")
b.cmd("save.answer", answer="notNow")
t.ok(req("data.secret", host="127.0.0.1", user="alice")["value"] == "right", "Not now keeps what was there")

# Never here: the site isn't asked again.
sign_in("bob", "right")
b.wait_for(lambda: forms()["offering"], what="bob")
t.ok(b.cmd("save.answer", answer="never") == "Never for 127.0.0.1", "Never for the site")
sign_in("carol", "right")
time.sleep(1.0)
t.ok(forms()["offering"] is None, "a never site is not asked")
b.cmd("passwords.forgetNever")

# The accounts under the box; a page in the clear gets only what was kept from one.
b.cmd("passwords.add", host="https://127.0.0.1", user="secure", password="tls-only")
tab = open_page("/login", "Sign in")
b.ev(tab, "document.getElementById('p').focus()")
fl = b.wait_for(lambda: forms()["fill"], what="the list")
t.ok([a["user"] for a in fl["accounts"]] == ["alice"], f"this site's accounts, http ones on an http page ({fl['accounts']})")
t.ok(forms()["overlay"] == {"kind": "panel", "name": "data.fill"}, "the list hangs over the page")
t.ok(b.cmd("fill.pick", index=0) is False, "a click in the first half second is not a choice")
time.sleep(0.3)
text = overlay_text()
t.ok("alice" in text and "127.0.0.1" in text and "Saved in Oriel" in text, f"rows and foot ({text!r})")
time.sleep(0.6)
b.ev(tab, "document.getElementById('p').focus()")
b.wait_for(lambda: forms()["fill"], what="the list again")
time.sleep(0.6)
if SHOTS:
    b.shot(f"{SHOTS}/data-account-list.png")
t.ok(b.cmd("fill.pick", index=0) is True, "a pick fills")
t.ok(b.ev(tab, "document.getElementById('u').value + '|' + document.getElementById('p').value") == "alice|right", "name and password put in the page")
t.ok(b.active()["title"] == "Sign in", "and nothing sent: never on its own")

# The list goes with its box: a sign-in moving on to its next step takes the
# box out of the page (no focusout), or changes its own address; the list
# stayed over whatever came next (the user's 24 Nov 2026 report, YouTube under it).
for how, js in (("the box taken out of the page", "document.getElementById('p').remove()"),
                ("the page changing its own address", "history.pushState({}, '', '/step-two')"),
                ("going to another page", "location.href = '/home'")):
    tab = open_page("/login", "Sign in")
    b.ev(tab, "document.getElementById('p').focus()")
    b.wait_for(lambda: forms()["fill"], what="the list")
    time.sleep(0.3)
    b.ev(tab, js)
    try:
        gone = b.wait_for(lambda: forms()["fill"] is None and (forms()["overlay"] or {}).get("kind") == "none", within=3, what=how)
    except AssertionError:
        gone = False
    t.ok(gone, f"{how}: the list goes ({forms()['overlay']})")

# Arrows and Enter, from the page: a real click into the name box first.
tab = open_page("/login", "Sign in")
card = json.loads(b.ui("JSON.stringify(document.querySelector('.card').getBoundingClientRect())"))
box = json.loads(b.ev(tab, "JSON.stringify(document.getElementById('u').getBoundingClientRect())"))
b.mouse(card["x"] + box["x"] + box["width"] / 2, card["y"] + box["y"] + box["height"] / 2)
b.wait_for(lambda: forms()["fill"], what="the list from the name box")
req("data.pageKey", key="ArrowDown")
b.wait_for(lambda: (forms()["fill"] or {}).get("lit") == 0, what="lit")
req("data.pageKey", key="Enter")
b.wait_for(lambda: b.ev(tab, "document.getElementById('p').value") == "right", what="filled by Enter")
time.sleep(0.5)
t.ok(b.active()["title"] == "Sign in", "Enter on a lit row fills, and the form isn't sent")

# Windows Hello before filling, when Settings asks; a minute's grace.
b.cmd("prefs.set", key="passwords.fill.prove", value=True)
req("data.prove", answer=None)


def pick_fresh():
    tab = open_page("/login", "Sign in")
    b.ev(tab, "document.getElementById('p').focus()")
    b.wait_for(lambda: forms()["fill"], what="list")
    time.sleep(0.6)
    ok = b.cmd("fill.pick", index=0)
    return tab, ok


tab, ok = pick_fresh()
t.ok(ok is False and b.ev(tab, "document.getElementById('p').value") == "" and forms()["fillAsked"] == 1, "no yes, nothing filled")
req("data.prove", answer=True)
tab, ok = pick_fresh()
t.ok(ok is True and forms()["fillAsked"] == 2, "a yes fills")
tab, ok = pick_fresh()
t.ok(ok is True and forms()["fillAsked"] == 2, "within the minute, not asked again")
req("data.fillAge", ms=61000)
tab, ok = pick_fresh()
t.ok(ok is True and forms()["fillAsked"] == 3, "after the minute, asked again")
b.cmd("prefs.set", key="passwords.fill.prove", value=False)

# A first step: its name goes with the password page after it.
tab = open_page("/step1", "Step 1")
b.ev(tab, "document.getElementById('e').focus()")
fl = b.wait_for(lambda: forms()["fill"], what="list on a first step")
t.ok(fl["nameOnly"] is True, "a first step's box: a pick puts in the name alone")
typed(tab, "e", "alice")
b.ev(tab, "document.getElementById('next').click()")
b.wait_for(lambda: b.active()["title"] == "Step 2" and not b.active()["loading"], what="step 2")
time.sleep(0.3)
tab = b.active()["id"]
typed(tab, "p", "right3")
b.ev(tab, "document.getElementById('go').click()")
f = b.wait_for(lambda: forms()["offering"], what="offer after two steps")
t.ok(f == {"host": "127.0.0.1", "user": "alice", "changed": True}, f"the name from the step before ({f})")
t.ok(b.cmd("save.answer", answer="save") == "Password updated for 127.0.0.1", "Update")
t.ok(req("data.secret", host="127.0.0.1", user="alice")["value"] == "right3", "updated")

# Show and Remove All ask for the owner first.
req("data.prove", answer=False)
t.ok(b.cmd("passwords.reveal", host="127.0.0.1", user="alice") is None, "Show: no without the owner")
req("data.prove", answer=True)
t.ok(b.cmd("passwords.reveal", host="127.0.0.1", user="alice") == {"password": "right3", "seconds": 15}, "Show: 15 seconds")
listed = b.cmd("passwords.list", query="127")["logins"]
t.ok({(k["host"], k["user"]) for k in listed} == {("127.0.0.1", "alice"), ("127.0.0.1", "secure")} and all("password" not in k for k in listed), "the list: no secrets")
req("data.prove", answer=False)
t.ok(b.cmd("passwords.removeAll")["removed"] == 0, "Remove All: no without the owner")
req("data.prove", answer=True)
r = b.cmd("passwords.removeAll")
t.ok(r["removed"] == 2 and r["said"] == "Removed 2 passwords", f"Remove All ({r})")

srv.shutdown()
t.done()

#!/usr/bin/env python3
"""oriel://passwords (Passwords.swift PasswordsPanel; studio/05 §2, 06 §1.7):
opened by Passwords… and Settings › Passwords › Open…, kept passwords by
site, Add, Show only after the proof (Windows Hello; answered by the test),
ten dots whatever the length, Remove. Copy is left out: it would write to
the clipboard of whoever works beside the test."""
import sys
import time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b

b.use("settings-passwords")
b.launch()
t = b.T()


def ev(tab, js):
    try:
        return b.ev(tab, js)
    except RuntimeError:
        return None


def text(tab):
    return ev(tab, "document.body.innerText") or ""


b.cmd("settings.do", id="passwords.open")
b.wait_for(lambda: any(x.get("internal") == "passwords" for x in b.window()["tabs"]), what="Passwords tab")
tab = next(x for x in b.window()["tabs"] if x.get("internal") == "passwords")["id"]
b.wait_for(lambda: "Nothing kept yet" in text(tab), what="empty list")
t.ok(ev(tab, "document.querySelector('.plate-title').textContent") == "Passwords", "Settings › Passwords › Open… opens oriel://passwords")
t.ok("Nothing kept yet. Sign in somewhere and say yes, or bring yours in below." in text(tab), "empty: Nothing kept yet…")
t.ok(ev(tab, "document.querySelector('.st-hunt input').placeholder") == "Search sites and accounts", "Search sites and accounts")
t.ok("keychain" not in text(tab) and "macOS" not in text(tab), "the foot names Windows, not the keychain")

# Add a password with the form.
ev(tab, "[...document.querySelectorAll('.pill-st')].find(p => p.textContent === 'Add').click()")
time.sleep(0.3)
ev(tab, """(() => { const set = (el, v) => { el.value = v; el.dispatchEvent(new Event('input', {bubbles: true})) };
  const f = document.querySelectorAll('.pw-field'); set(f[0], 'example.com'); set(f[1], 'me@example.com'); set(f[2], 'hunter22') })()""")
ev(tab, "[...document.querySelectorAll('.pw-add .pill-st')].find(p => p.textContent === 'Save').click()")
b.wait_for(lambda: ev(tab, "document.querySelectorAll('.pw-site').length") == 1, what="kept")
t.ok(ev(tab, "document.querySelector('.pw-host').textContent") == "example.com", "kept under its site")
t.ok(ev(tab, "document.querySelector('.pw-sub').textContent") == "me@example.com", "its account beside it")
t.ok("1 password" in text(tab), "the foot counts 1 password")

# Open the site: ten dots; Show only after the proof.
ev(tab, "document.querySelector('.pw-site-row').click()")
time.sleep(0.3)
t.ok(ev(tab, "document.querySelector('.pw-secret').textContent") == "••••••••••", "ten dots, whatever its length")
b.call({"do": "data.prove", "answer": False})
ev(tab, "[...document.querySelectorAll('.pw-account .st-quick')].find(q => q.textContent === 'Show').click()")
time.sleep(0.5)
t.ok(ev(tab, "document.querySelector('.pw-secret').textContent") == "••••••••••", "Show without the proof shows nothing")
b.call({"do": "data.prove", "answer": True})
ev(tab, "[...document.querySelectorAll('.pw-account .st-quick')].find(q => q.textContent === 'Show').click()")
b.wait_for(lambda: ev(tab, "document.querySelector('.pw-secret').textContent") == "hunter22", what="shown")
t.ok(True, "Show after the proof shows the password")
ev(tab, "[...document.querySelectorAll('.pw-account .st-quick')].find(q => q.textContent === 'Hide').click()")
time.sleep(0.2)
t.ok(ev(tab, "document.querySelector('.pw-secret').textContent") == "••••••••••", "Hide puts the dots back")

# Search, then Remove.
ev(tab, "(() => { const f = document.querySelector('.st-hunt input'); f.value = 'nothing-like-it'; f.dispatchEvent(new Event('input', {bubbles: true})) })()")
time.sleep(0.2)
t.ok("Nothing matches." in text(tab), "a search with no match: Nothing matches.")
ev(tab, "(() => { const f = document.querySelector('.st-hunt input'); f.value = ''; f.dispatchEvent(new Event('input', {bubbles: true})) })()")
time.sleep(0.2)
ev(tab, "document.querySelector('.pw-site-row').click()")
time.sleep(0.2)
if not ev(tab, "!!document.querySelector('.pw-account')"):
    ev(tab, "document.querySelector('.pw-site-row').click()")
    time.sleep(0.2)
ev(tab, "[...document.querySelectorAll('.pw-account .st-quick')].find(q => q.textContent === 'Remove').click()")
b.wait_for(lambda: "Nothing kept yet" in text(tab), what="removed")
t.ok(not b.call({"do": "data.vault"})["logins"], "Remove forgets it")

# Passwords… (Alt+Shift+L's command) comes back to the same tab.
b.cmd("app.passwords")
t.ok(len([x for x in b.window()["tabs"] if x.get("internal") == "passwords"]) == 1, "Passwords… goes to the same tab")
t.ok(not b.state().get("errors"), "no error in the main process")
t.done()

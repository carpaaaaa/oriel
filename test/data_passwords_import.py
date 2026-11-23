#!/usr/bin/env python3
"""Passwords from other browsers (studio/05 §1.3, §1.5, §1.8, §1.13; studio/07
§2): the CSV export first, Chromium v10 read with the key DPAPI opens (a test
world's stand-in off Windows) only after a yes, v20 (App-Bound) counted and
never tried, Firefox's key4.db without a primary password, never sites, and
the vault: encrypted, no duplicates, nothing in the clear."""
import json
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b

ROOT = Path(__file__).resolve().parent.parent
b.use("data-pwimport")
folder = b.folder()
home = folder / "Import"
home.mkdir(parents=True, exist_ok=True)
subprocess.run(["node", str(ROOT / "test/fixtures/data/make.mjs"), str(home)], check=True, capture_output=True)
b.launch()
t = b.T()


def req(name, **kw):
    return b.call({"do": name, **kw})


def panel():
    return b.state()["windows"][0].get("data", {}).get("import")


def counted(source):
    def ready():
        p = panel()
        if not p or p["looking"]:
            return None
        v = next(s for s in p["sources"] if s["id"] == source)
        prof = p["chosen"].get(source, v["usual"] or "")
        return p["previews"].get(f"{source}/{prof or ''}")
    return b.wait_for(ready, what=f"{source} counted")


def bring(source, consent=None, **wants):
    b.cmd("import.pick", source=source)
    counted(source)
    if consent is not None:
        b.cmd("import.consent", source=source, on=consent)
    for k, on in {"passwords": True, "bookmarks": False, "history": False, **wants}.items():
        b.cmd("import.option", key=k, on=on)
    return [s["text"] for s in b.cmd("import.run")]


def secret(host, user):
    return req("data.secret", host=host, user=user)["value"]


def vault():
    return req("data.vault")


b.cmd("import.open")
b.wait_for(lambda: (panel() or {}).get("looking") is False, what="panel")

# Counting asks no key of Windows.
counted("Chrome")
t.ok(req("data.keyAsks")["value"] == 0, "counting decrypts nothing and asks for no key (05 §1.1)")
time.sleep(0.3)
text = b.ui("document.body.innerText", root="overlay")
t.ok("5 can be read here; 2 are locked to Chrome: bring those in from its CSV file" in text, "the panel says which passwords can come and which are locked")
t.ok("Allow Oriel to read them" in text, "and asks before reading them")

# No yes, nothing read.
said = bring("Chrome", consent=False)
t.ok(said == ["Passwords not read: allow Oriel to read Chrome's passwords, or bring in its CSV file"], f"without a yes ({said})")
t.ok(req("data.keyAsks")["value"] == 0 and not vault()["logins"], "no key asked, nothing kept")

# With a yes: v10 read, v20 left alone, android and planted values refused.
said = bring("Chrome", consent=True)
t.ok(said == ["3 passwords (1 skipped: no address); 1 couldn't be decrypted with Chrome's key; 2 locked to Chrome: bring those in from its CSV file"], f"said ({said})")
t.ok(secret("login.work.example", "alice") == "work-pass-1", "a v10 password, AES-256-GCM with the Local State key")
t.ok(secret("account.work.example", "alice") == "account-pass", "Login Data For Account too")
kept = {(k["host"], k["user"]): k for k in vault()["logins"]}
t.ok(kept.get(("intranet.work.example", "alice"), {}).get("clear") is True, "one from plain http is kept as such")
t.ok(("bound.work.example", "bob") not in kept, "v20 (App-Bound) never read")
t.ok(("planted.work.example", "eve") not in kept, "a value in the clear in the profile is refused")
used = kept[("login.work.example", "alice")].get("used", 0) / 1000
t.ok(abs(used - (time.time() - 3 * 86400)) < 120, "when it was last used comes along")
t.ok("ads.example" in vault()["never"], "a site Chrome was told never to save becomes never here (05 §2.6)")
t.ok(req("data.keyAsks")["value"] >= 1, "the key was asked for at the click")

# The vault on disk: sealed.
raw = vault()["file"]
doc = json.loads(raw)
t.ok(doc["format"] == 1 and doc["key"].startswith(("test:", "safe:")), "the vault's key sealed (DPAPI by safeStorage on Windows)")
t.ok(not any(w in raw for w in ["work-pass-1", "account-pass", "intranet-pass"]), "no password in the clear in vault.json")
t.ok(all(set(r) >= {"host", "user", "secret", "created"} for r in doc["logins"]), "one row per account: site, name, sealed secret")
req("data.vaultReload")
t.ok(secret("login.work.example", "alice") == "work-pass-1", "read back from the file")

# Again: nothing twice.
before = len(vault()["logins"])
bring("Chrome", consent=True)
t.ok(len(vault()["logins"]) == before, "bringing in again adds nothing twice")

# Edge: all locked; the CSV steps.
said = bring("Edge", consent=True)
t.ok(said == ["Edge locks its passwords to itself: export them from it and bring in the CSV file"], f"Edge: v20 only ({said})")
b.cmd("import.how", source="Edge")
time.sleep(0.3)
text = b.ui("document.body.innerText", root="overlay")
t.ok("In Edge, open edge://wallet/passwords, choose Export passwords, and save the file." in text, "the CSV steps, with where Edge keeps them")

# Opera GX: the site's hash before the password.
said = bring("Opera GX", consent=True)
t.ok(said == ["1 password"] and secret("game.example", "player1") == "gx-pass", f"Opera GX, hash prefix skipped ({said})")

# Firefox: key4.db and logins.json, AES and old 3DES; the primary password case.
said = bring("Firefox")
t.ok(said == ["2 passwords (1 skipped: no address)"], f"Firefox ({said})")
t.ok(secret("accounts.fox.example", "fox-user") == "fox-pass", "AES-256-CBC login (PBES2 key)")
t.ok(secret("old.fox.example", "legacy") == "des-pass", "3DES login")
t.ok("nosave.fox.example" in vault()["never"], "disabledHosts become never")
b.cmd("import.profile", source="Firefox", profile="zzzz9999.locked")
said = bring("Firefox")
t.ok(said == ["Firefox has a primary password: export your passwords from it and bring in the CSV file"], f"a primary password is never asked for ({said})")

# The CSV, the way in for every browser.
csv = home / "Exports" / "Chrome Passwords.csv"
res = b.cmd("import.file", path=str(csv))
said = [s["text"] for s in res["said"]]
t.ok(said == ["2 passwords, 3 skipped", "The exported file holds your passwords in the clear: delete it now"], f"CSV ({said})")
t.ok(secret("bound.work.example", "bob") == 'pa,ss"word', "quoted fields, commas and doubled quotes")
t.ok(secret("two.edge.example", "u2") == "edge-two", "a note over two lines doesn't break the row")
t.ok(("com.vendor.app", "droid") not in {(k["host"], k["user"]) for k in vault()["logins"]}, "an Android app's login is not a site")
time.sleep(0.3)
t.ok("Move it to the Recycle Bin" in b.ui("document.body.innerText", root="overlay"), "deleting the file is offered")
b.cmd("import.trashFile", path=str(csv))
t.ok(not csv.exists(), "the file is gone from where it was")
recs = req("data.records")["records"]
t.ok(recs["Chrome"]["passwords"] >= 3 and recs["Chrome Passwords"]["passwords"] == 2, "what came from where, passwords too")

# Never sites stop the question; Settings can forget them.
t.ok(set(vault()["never"]) >= {"ads.example", "nosave.fox.example"}, "never list kept in settings (passwords.never)")
b.cmd("passwords.forgetNever")
t.ok(vault()["never"] == [], "Forget: every site can ask again")

t.done()

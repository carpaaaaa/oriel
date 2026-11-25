#!/usr/bin/env python3
"""The guided export (Oriel's own, import/export.ts): Chrome, Edge and Brave
lock their passwords to themselves (v20), so Start opens the browser at its
Export page and the CSV it writes is picked up as it lands, brought into the
vault and sent to the Recycle Bin. Only a file written after Start and
holding url, username and password columns is taken; Cancel and closing the
panel stop the waiting. The browser itself is a stand-in never started, and
the folders to look in are the test's own (ORIEL_EXPORT_DIRS)."""
import os
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b

ROOT = Path(__file__).resolve().parent.parent
b.use("data-exportguided")
folder = b.folder()
home = folder / "Import"
home.mkdir(parents=True, exist_ok=True)
subprocess.run(["node", str(ROOT / "test/fixtures/data/make.mjs"), str(home)], check=True, stdout=subprocess.DEVNULL)
drop = folder / "Dropbox"
drop.mkdir(parents=True, exist_ok=True)
b.launch(env={"ORIEL_EXPORT_DIRS": str(drop)})
t = b.T()


def panel():
    return b.state()["windows"][0].get("data", {}).get("import")


def req(name, **kw):
    return b.call({"do": name, **kw})


# An old export lying in the folder is left alone.
old = drop / "Old Passwords.csv"
old.write_text("name,url,username,password,note\nx,https://old.example/,olduser,oldpass,\n", encoding="utf-8")
os.utime(old, (time.time() - 3600, time.time() - 3600))

b.cmd("import.open")
b.wait_for(lambda: (panel() or {}).get("looking") is False, what="panel")
sources = {s["id"]: s for s in panel()["sources"]}
t.ok(sources["Chrome"].get("assist") is True and not sources["Firefox"].get("assist"), "Chrome is offered the guided export, Firefox is not")

b.cmd("import.pick", source="Chrome")
b.wait_for(lambda: panel() and panel()["previews"], within=30, what="Chrome counted")
time.sleep(0.5)
text = b.ui("document.body.innerText", root="overlay") or ""
t.ok("Press Start: Chrome opens its Export page" in text, "the panel says what Start does")

t.ok(b.cmd("import.export", source="Chrome") is not False and (panel().get("waiting") or {}).get("source") == "Chrome", "Start: waiting for Chrome's file")
launched = req("data.exportLaunched")["value"]
t.ok(launched and launched["args"][-1] == "chrome://password-manager/settings", f"Chrome is opened at its Export page ({launched})")
t.ok(any(a.startswith("--profile-directory=") for a in launched["args"]), "in the profile chosen")

time.sleep(2.5)
(drop / "budget.csv").write_text("month,amount\njan,10\n", encoding="utf-8")
time.sleep(2.5)
p = panel()
t.ok(p.get("waiting") and not p.get("brought"), "the old export and a CSV that holds no passwords bring nothing in")

export = drop / "Chrome Passwords.csv"
export.write_text("name,url,username,password,note\nalpha,https://alpha.guided.example/,anna,secret-one,\n"
                  "beta,https://beta.guided.example/,ben,\"se,cret\"\"two\",\n", encoding="utf-8")
p = b.wait_for(lambda: (panel() or {}).get("brought") and panel(), within=20, what="the export brought in")
said = [s["text"] for s in p["brought"]]
t.ok(not p.get("waiting") and said[0].startswith("2 passwords") and "The file went to the Recycle Bin" in said, f"brought in and said ({said})")
t.ok(not export.exists() and (folder / "Recycle Bin" / "Chrome Passwords.csv").exists(), "the file is out of the folder and in the Recycle Bin")
t.ok(old.exists() and (drop / "budget.csv").exists(), "the other files stayed")
logins = req("data.vault")["logins"]
t.ok(any("alpha.guided.example" in x["host"] and x["user"] == "anna" for x in logins) and any("beta.guided.example" in x["host"] for x in logins), "both are in the vault")
t.ok(req("data.secret", host="beta.guided.example", user="ben")["value"] == 'se,cret"two', "a password with a comma and a quote comes whole")

# Cancel, and closing the panel, stop the waiting.
b.cmd("import.export", source="Chrome")
t.ok((panel().get("waiting") or {}).get("source") == "Chrome", "again: waiting")
b.cmd("import.exportStop")
t.ok(not panel().get("waiting"), "Cancel stops the waiting")
b.cmd("import.export", source="Chrome")
b.cmd("import.close")
late = drop / "Late Passwords.csv"
late.write_text("name,url,username,password,note\nz,https://z.guided.example/,zed,zpass,\n", encoding="utf-8")
time.sleep(3.5)
t.ok(late.exists(), "closing the panel stops the waiting: a late file is not touched")
t.done()

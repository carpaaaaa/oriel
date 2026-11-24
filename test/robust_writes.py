#!/usr/bin/env python3
"""Writes that can't be cut in half (studio/09 §3): extensions.json and the
manifest Oriel rewrites for an extension it keeps (dnr/war.ts) are written
beside and renamed over, never in place; and a write Windows holds (an
antivirus, an indexer) waits between tries with the processor free.

A file written in place keeps its inode: a hard link made before the write
sees the new text. A file renamed over gets a new inode: the link keeps the
old text. That tells the two apart without timing anything."""
import json
import os
import shutil
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b

FIXTURE = Path(__file__).resolve().parent / "fixtures" / "dnr-test"

b.use("robust-writes")
b.launch()
t = b.T()
folder = b.folder()

# 1. The manifest of a package Oriel keeps, turned to use_dynamic_url off.
copy = folder / "Unpacked" / "dnr-test"
shutil.rmtree(copy, ignore_errors=True)
shutil.copytree(FIXTURE, copy)
link = folder / "manifest-link.json"
link.unlink(missing_ok=True)
os.link(copy / "manifest.json", link)
ext = b.call({"do": "extensions.loadUnpacked", "path": str(copy)})
now = json.loads((copy / "manifest.json").read_text())
dyn = [e.get("use_dynamic_url") for e in now.get("web_accessible_resources", []) if isinstance(e, dict)]
t.ok(dyn and not any(dyn), f"the kept copy is prepared (use_dynamic_url {dyn})")
t.ok('"use_dynamic_url": true' in link.read_text(), "the manifest was renamed over, not written in place")
t.ok(not list(copy.glob("*.tmp")), "no file left beside it")

# 2. extensions.json.
b.cmd("ext.pin", id=ext["id"], pinned=True)
saved = folder / "extensions.json"
b.wait_for(lambda: saved.exists() and ext["id"] in json.loads(saved.read_text()).get("pinned", []), what="pinned and saved")
link2 = folder / "extensions-link.json"
link2.unlink(missing_ok=True)
os.link(saved, link2)
b.cmd("ext.pin", id=ext["id"], pinned=False)
b.wait_for(lambda: ext["id"] not in json.loads(saved.read_text()).get("pinned", []), what="unpinned and saved")
t.ok(ext["id"] in json.loads(link2.read_text()).get("pinned", []), "extensions.json was renamed over, not written in place")
t.ok(not list(folder.glob("extensions.json.*.tmp")), "no file left beside it")

# 3. A rename that keeps failing: ten tries, 50 ms apart, the processor free.
r = b.call({"do": "guards.heldWrite"})
t.ok(r["threw"] and r["wallMs"] >= 400, f"it tried for the whole wait, then said so ({r['wallMs']} ms)")
t.ok(r["cpuMs"] < 150, f"waiting between tries doesn't keep the processor busy ({r['cpuMs']} ms of {r['wallMs']} ms)")

t.ok(not b.state().get("errors"), "no error in the main process")
t.done()

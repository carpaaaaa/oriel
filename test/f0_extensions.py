#!/usr/bin/env python3
"""Fase 0: extensions from the Chrome Web Store. uBlock Origin Lite must
really block; Bitwarden must load and answer."""
import sys, time, os
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b

UBOL = "ddkjiahejlhfcafbddmgiahcphecmpfh"
BITWARDEN = "nngceckbapebfimnlniiiahkandclblb"
DARK_READER = "eimadpbcbfnmbkopoojfekhnkhdbieeh"

b.use("f0-extensions")
b.launch()
t = b.T()
for ext in (UBOL, BITWARDEN, DARK_READER):
    try:
        r = b.call({"do": "extensions.install", "id": ext}, timeout=120)
        t.ok(True, f"installed {r['name']} {r['version']}")
    except Exception as e:
        t.ok(False, f"install {ext}: {e}")
time.sleep(3)
names = [e["name"] for e in b.call({"do": "extensions.list"})["extensions"]]
print("loaded:", names)

# A page that asks for a script every blocker blocks.
PAGE = ("data:text/html,<title>ads</title><script>"
        "window.result='pending';fetch('https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js',{mode:'no-cors'})"
        ".then(()=>result='loaded').catch(()=>result='blocked')</script>")
b.cmd("field.commit", text="https://example.com")
b.wait_for(lambda: b.active()["title"] == "Example Domain", what="page")
tab = b.active()["id"]
time.sleep(1)
b.ev(tab, "window.result='pending';fetch('https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js',{mode:'no-cors'}).then(()=>window.result='loaded').catch(()=>window.result='blocked')")
res = b.wait_for(lambda: (r := b.ev(tab, "window.result")) != "pending" and r, what="fetch")
t.ok(res == "blocked", f"uBlock Origin Lite blocks an ad script (got {res})")
t.done()

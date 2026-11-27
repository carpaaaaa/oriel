#!/usr/bin/env python3
"""Chrome themes (Search 1.0.22, ChromeThemeTests): a theme from the Chrome
Web Store is no longer installed only to change nothing. Oriel says themes
aren't supported and where its own colours are (a space's menu › Colour…,
Settings › Themes): from the store page's own button (asked before anything
is downloaded), from Add to Oriel by a link or id, and from Load Unpacked. An
extension that also carries "theme" but runs something is still offered."""
import json
import shutil
import sys
import tempfile
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b

SAID = "Chrome themes aren't supported in Oriel. Colour a space from its menu › Colour…, or choose a new tab's picture in Settings › Themes"
THEME = {"name": "Ocean Blue", "version": "1.0", "manifest_version": 3,
         "theme": {"colors": {"frame": [0, 60, 140], "toolbar": [0, 90, 200]}}}

b.use("extensions-themes")
b.launch()
t = b.T()
ext_state = lambda: b.window().get("ext") or {}
listed = lambda: b.call({"do": "extensions.list"})["extensions"]
asked = lambda: b.call({"do": "extensions.asked"})["asked"]

# 1. The store page's button, a theme: said on the window, refused, nothing asked to add.
before = len(asked())
r = b.call({"do": "ext.beforeStoreInstall", "id": "a" * 32, "name": "Ocean Blue", "manifest": THEME})
t.ok(r.get("action") == "deny", f"the store's button, a theme: refused ({r})")
new = asked()[before:]
t.ok(len(new) == 1 and new[0]["message"] == "Chrome themes aren't supported in Oriel"
     and "menu › Colour…" in new[0]["detail"] and "Settings › Themes" in new[0]["detail"] and new[0]["buttons"] == ["OK"],
     f"the window says so, and where Oriel's colours are ({new})")
t.ok((ext_state().get("said") or {}).get("text") == SAID and (ext_state().get("said") or {}).get("bad"), "and Settings › Extensions says it too")

# 2. An extension is still asked about, as before.
b.call({"do": "extensions.answer", "answers": ["Cancel"]})
before = len(asked())
r = b.call({"do": "ext.beforeStoreInstall", "id": "b" * 32, "name": "Helper",
            "manifest": {"name": "Helper", "version": "1", "manifest_version": 3, "action": {}, "theme": {"colors": {}}}})
new = asked()[before:]
t.ok(r.get("action") == "deny" and len(new) == 1 and new[0]["message"].startswith("Add “Helper”") if new else False,
     f"an extension that runs something, a theme key or not: the usual question ({new})")

# 3. Load Unpacked, a theme's folder: refused, nothing loaded.
folder = Path(tempfile.mkdtemp(prefix="oriel-theme-")) / "ocean"
folder.mkdir()
(folder / "manifest.json").write_text(json.dumps(THEME))
count = len(listed())
b.cmd("ext.loadUnpacked", path=str(folder))
b.wait_for(lambda: (ext_state().get("said") or {}).get("text") == SAID, within=8, what="refused")
time.sleep(0.4)
t.ok(len(listed()) == count and not any(e["name"] == "Ocean Blue" for e in ext_state().get("list", [])), "Load Unpacked, a theme: refused, nothing installed")

# 4. Settings › Extensions open: the line at its foot.
b.cmd("settings.open", page="extensions")
b.wait_for(lambda: any(x.get("internal") == "settings" for x in b.window()["tabs"]), what="Settings tab")
st = next(x for x in b.window()["tabs"] if x.get("internal") == "settings")["id"]
b.wait_for(lambda: b.ev(st, "location.pathname") == "/extensions", what="Extensions")
time.sleep(1.0)
b.cmd("ext.loadUnpacked", path=str(folder))
b.wait_for(lambda: "Chrome themes aren't supported" in (b.ev(st, "document.querySelector('.st-said')?.textContent") or ""), within=8, what="the line in Settings")
t.ok(True, "Settings › Extensions says themes aren't supported, and where Oriel's colours are")

shutil.rmtree(folder.parent, ignore_errors=True)
t.ok(not b.state().get("errors"), "no error in the main process")
t.done()

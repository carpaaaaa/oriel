#!/usr/bin/env python3
"""Fase 0: extensions from the Chrome Web Store. uBlock Origin Lite must
really block; Bitwarden must load and answer; no worker dies at start on
chrome.commands (studio/04 §3.5, §8.4)."""
import sys, time, os, re
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
exts = {e["id"]: e for e in b.call({"do": "extensions.list"})["extensions"]}
print("loaded:", [e["name"] for e in exts.values()])

st = b.call({"do": "extensions.dnrState", "id": UBOL})
t.ok(st["loaded"] and st["staticRules"] > 15000, f"uBlock Origin Lite's static rulesets are loaded ({st.get('staticRules')} rules: {st.get('enabled')})")
# Its worker runs and talks to the engine: it adds its regex rules itself.
st = b.wait_for(lambda: (s := b.call({"do": "extensions.dnrState", "id": UBOL}))["dynamicRules"] > 0 and s, within=20, what="uBOL dynamic rules")
t.ok(st["dynamicRules"] > 100, f"uBlock Origin Lite's worker added its dynamic rules ({st['dynamicRules']})")

b.cmd("field.commit", text="https://example.com")
b.wait_for(lambda: b.active()["title"] == "Example Domain", what="page")
tab = b.active()["id"]
time.sleep(1)
# The ad script never arrives: uBOL either blocks it or (for this one, as in
# Chrome) hands the page its own harmless stub instead.
res = b.ev(tab, "fetch('https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js').then(r => r.url, () => 'blocked')")
t.ok(res == "blocked" or res.startswith(f"chrome-extension://{UBOL}/web_accessible_resources/"), f"uBlock Origin Lite stops the ad script (got {res})")
res = b.ev(tab, "fetch('https://www.googletagmanager.com/gtm.js?id=GTM-XXXX', {mode: 'no-cors'}).then(() => 'loaded', () => 'blocked')")
t.ok(res == "blocked", f"uBlock Origin Lite blocks a tracker (got {res})")

# Its redirect rules lead to its stubs, and a page can load them.
sim = b.call({"do": "extensions.dnrSimulate", "url": "https://adservice.google.com/adsid/integrator.js", "type": "xmlhttprequest", "initiator": "https://tubia.com"})
t.ok(sim["action"] == "redirect" and sim["url"].startswith(f"chrome-extension://{UBOL}/web_accessible_resources/"), f"uBOL redirects to its stub ({sim.get('url')})")
status = b.ev(tab, "fetch(%r).then(r => r.status, e => 'error ' + e)" % sim.get("url", ""))
t.ok(status == 200, f"the stub loads from a web page (got {status})")

# Bitwarden: chrome.commands is there in its pages and its worker.
popup = exts.get(BITWARDEN, {}).get("popup")
b.cmd("tab.new", url=f"chrome-extension://{BITWARDEN}/{popup}")
time.sleep(2)
bw = b.active()["id"]
t.ok(b.ev(bw, "typeof chrome.commands.onCommand.addListener === 'function' && browser === chrome") is True, "Bitwarden's pages have chrome.commands, and browser is chrome")
names = b.ev(bw, "chrome.commands.getAll().then(l => l.map(c => c.name))") or []
t.ok("_execute_action" in names, f"Bitwarden's commands.getAll ({names})")

log = (b.ROOT / "out" / f"bench-{b.WORLD}.log").read_text(errors="replace")
errors = re.findall(r"Message:\s+(.*onCommand.*)\n\s+ID:\s+(\w+)", log)
t.ok(not errors, f"no extension fails on onCommand (got {errors})")
t.ok("Service worker registration failed" not in log, "every worker starts")
timing = b.call({"do": "extensions.dnrTiming"})
print(f"  dnr on real requests: {timing['requests']} requests, mean {timing['meanUs']} µs, max {timing['maxUs']} µs")
t.done()

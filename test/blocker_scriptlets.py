#!/usr/bin/env python3
"""uBlock Origin's scriptlets for YouTube don't stall the page (the user's
report on 0.1.4, "YouTube works terribly"): nine edit-inbound-object
scriptlets wrap JSON.stringify there, and each copied every object before
looking at it; YouTube stalled for seconds. Run with the engine's real
scriptlets (out/main/blocker/engine.bin, built by npm run build): with
Oriel's version (src/main/pages/blocker/scriptlets.ts) JSON.stringify stays
fast, and every object comes out exactly as with uBlock Origin's own code
(the ones its rules edit, edited; the others untouched)."""
import json
import subprocess
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b

ROOT = b.ROOT
RUN = str(Path(__file__).resolve().parent / "fixtures" / "scriptlets_run.mjs")
t = b.T()


def run(mode):
    r = subprocess.run(["node", RUN, str(ROOT), mode], capture_output=True, text=True, timeout=300)
    if r.returncode:
        print(r.stderr[-1500:])
        return None
    return json.loads(r.stdout.strip().splitlines()[-1])


raw, quick = run("raw"), run("quick")
t.ok(raw and quick and raw["scriptlets"] >= 5, f"YouTube's edit-inbound-object scriptlets from the real lists ({raw and raw['scriptlets']})")
if raw and quick:
    print(f"  JSON.stringify of a big object: {raw['bigMs']:.1f} ms as uBlock Origin's code runs them, {quick['bigMs']:.1f} ms in Oriel")
    print(f"  of a tiny one: {raw['smallUs']:.1f} µs, {quick['smallUs']:.1f} µs")
    t.ok(quick["bigMs"] < 25 and quick["bigMs"] * 10 < raw["bigMs"], "a big object: no full copy for each scriptlet")
    t.ok(quick["smallUs"] < 50, "a tiny object: a few microseconds")
    t.ok(quick["edits"] == raw["edits"], "every object comes out exactly as with uBlock Origin's own code")
    t.ok('"clientScreen":"CHANNEL"' in quick["edits"][0] and '"clientScreen"' not in quick["edits"][4], "the edits still happen where the rules ask, and only there")
print(f"{t.passed} passed, {t.failed} failed")
sys.exit(1 if t.failed else 0)

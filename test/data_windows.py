#!/usr/bin/env python3
"""Windows only (studio/05 §2.5, §2.11): Windows Hello before a password is
filled, shown or copied, else the Windows password. A runner has no face,
finger or PIN, so this proves what it can: the WinRT factories answer (the
one that owns the dialog by Oriel's window included), the call starts, with
no device it goes on to the Windows password's dialog, the app keeps
answering while either is up, and it ends (a Cancel, no hang)."""
import json
import sys
import threading
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b

if sys.platform != "win32":
    print("skipped: Windows only")
    sys.exit(0)

b.use("data-windows")
b.launch()
t = b.T()

f = b.call({"do": "data.helloFactories"})
print("       factories:", f)
t.ok(f["statics"] == "0x00000000", f"UserConsentVerifier answers ({f['statics']})")
t.ok(f["interop"] == "0x00000000", f"its window-owned interop answers: the dialog can sit in front of Oriel ({f['interop']})")

result = {}


def ask():
    try:
        result["reply"] = b.call({"do": "data.helloTrace", "reason": "fill your password for example.com", "within": 10000}, timeout=120)
    except Exception as e:  # noqa: BLE001
        result["error"] = repr(e)


worker = threading.Thread(target=ask, daemon=True)
started = time.time()
worker.start()

# The app answers while Hello or the password dialog is up.
slowest = 0.0
closed = []
said = ""
while worker.is_alive() and time.time() - started < 90:
    t0 = time.time()
    b.state()
    slowest = max(slowest, time.time() - t0)
    now = json.dumps((b.call({"do": "data.helloNow"}).get("trace") or {}).get("steps"))
    if now != said:
        print(f"       {time.time() - started:5.1f} s  {now}")
        said = now
    # What a person would do on a machine with nothing to recognise: Cancel.
    if time.time() - started > 3:
        c = b.call({"do": "data.helloClose"})
        if c["closed"]:
            print("       closed:", c["closed"], "of", c["seen"])
        closed += c["closed"]
    time.sleep(0.4)
worker.join(5)

t.ok(not worker.is_alive(), f"it ends: no hang ({time.time() - started:.1f} s)")
t.ok(slowest < 2.0, f"the app keeps answering meanwhile (slowest {slowest:.2f} s)")
trace = (result.get("reply") or {}).get("trace") or b.call({"do": "data.helloNow"}).get("trace") or {}
print("       trace:", json.dumps(trace))
print("       dialogs closed:", closed, result.get("error", ""))
steps = trace.get("steps", [])
t.ok(any(s == "factory 0x00000000" for s in steps), "the call starts")
t.ok(trace.get("availability") is not None, f"Hello says whether it can ask ({trace.get('availability')})")
if trace.get("availability") not in (None, 0):
    t.ok("to the password" in steps, "nothing to ask with: on to the Windows password")
    t.ok(trace.get("password") is not None, f"the password dialog was called ({trace.get('password')})")
t.ok(trace.get("verdict") in ("refused", "unavailable", "timeout"), f"no yes without a person ({trace.get('verdict')})")
t.done()

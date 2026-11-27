#!/usr/bin/env python3
"""Tabs you aren't looking at load a few at a time (Search 1.0.22,
LoadTurns.swift, Tests/tabs_loading.py): twelve tabs opened behind the one
on screen, each on a page of its own server that takes about two seconds to
come. With three turns (`load.turns`): never more than three of them ask
their server at once and the rest wait; a tab picked while it waits starts at
once, not after the rest; every one of them loads in the end; all reloaded
at once, the same again. Unset, the turns are half the processors, from two
to eight. Counted where it counts: the requests the servers see at once."""
import json
import os
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b  # noqa: E402

COUNT, TURNS = 12, 3
LOCK = threading.Lock()
NOW = {"in": 0, "most": 0}
STARTED = {}


class Slow(BaseHTTPRequestHandler):
    """A page that comes in four parts half a second apart, its title last."""
    protocol_version = "HTTP/1.0"

    def log_message(self, *a):
        pass

    def do_GET(self):
        if not self.path.startswith("/page/"):
            self.send_response(404)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        n = self.path.rsplit("/", 1)[-1].split("?")[0]
        with LOCK:
            NOW["in"] += 1
            NOW["most"] = max(NOW["most"], NOW["in"])
            STARTED.setdefault(n, time.time())
        try:
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(b"<!doctype html><title>coming</title><p>")
            self.wfile.flush()
            for _ in range(4):
                time.sleep(0.5)
                self.wfile.write(b"text " * 100)
                self.wfile.flush()
            self.wfile.write(f"<script>document.title='Page {n}'</script>".encode())
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass
        finally:
            with LOCK:
                NOW["in"] -= 1


class Quick(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_GET(self):
        data = b"<!doctype html><title>front</title>front"
        self.send_response(200)
        self.send_header("Content-Type", "text/html")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


# A server for each page: Chromium's few connections to one host would make
# them wait their turn anyway.
PORTS = []
for _ in range(COUNT):
    server = ThreadingHTTPServer(("127.0.0.1", 0), Slow)
    server.daemon_threads = True
    threading.Thread(target=server.serve_forever, daemon=True).start()
    PORTS.append(server.server_port)
quick = ThreadingHTTPServer(("127.0.0.1", 0), Quick)
threading.Thread(target=quick.serve_forever, daemon=True).start()
FRONT = f"http://127.0.0.1:{quick.server_port}/front"


def turns():
    return b.call({"do": "field.turns"})


def titles():
    return sorted(x["title"] for x in b.state()["tabs"] if x["title"].startswith("Page "))


def reset():
    with LOCK:
        NOW["most"] = NOW["in"]
        STARTED.clear()


def watch(seconds, until=None):
    seen, end = [], time.time() + seconds
    while time.time() < end:
        now = turns()
        seen.append(now)
        if until and until(now):
            break
        time.sleep(0.1)
    return seen


def settled():
    now = turns()
    return not now["waiting"] and not now["loading"] and NOW["in"] == 0


b.use("field-loadturns")
b.folder().mkdir(parents=True, exist_ok=True)
(b.folder() / "prefs.json").write_text(json.dumps({"load.turns": TURNS}))
b.launch()
t = b.T()

front = b.cmd("tab.new", url=FRONT)
b.wait_for(lambda: (b.active() or {}).get("title") == "front", within=20, what="the page in front")
reset()
ids = [b.cmd("tab.open", url=f"http://127.0.0.1:{port}/page/{n}", foreground=False) for n, port in enumerate(PORTS)]
seen = watch(1.5)
t.ok(0 < NOW["most"] <= TURNS, f"opened behind: never more than {TURNS} ask their server at once ({NOW['most']})")
t.ok(max(len(s["loading"]) for s in seen) <= TURNS and max(len(s["waiting"]) for s in seen) >= COUNT - TURNS - 1,
     f"the rest wait their turn (waiting {[len(s['waiting']) for s in seen[:4]]})")
t.ok(b.active()["id"] == front, "the tab in front stays in front")

# The last one opened is still waiting: picked, it starts now.
before = turns()
last = ids[-1]
was_waiting = last in before["waiting"]
asked = time.time()
b.cmd("tab.select", id=last)
b.wait_for(lambda: str(COUNT - 1) in STARTED, within=3, what="the picked tab's request")
t.ok(was_waiting and STARTED[str(COUNT - 1)] - asked < 0.8, f"a tab picked while it waits starts at once ({STARTED[str(COUNT - 1)] - asked:.2f} s)")
t.ok(NOW["most"] <= TURNS + 1, f"…beside the {TURNS} in their turn, not in place of one ({NOW['most']})")

b.wait_for(settled, within=40, what="every page loaded")
t.ok(len(titles()) == COUNT, f"every page has loaded in the end ({len(titles())} of {COUNT})")

# All at once again, as a reload of many tabs, the page in front a quick one.
b.cmd("tab.select", id=front)
time.sleep(0.5)
reset()
for id in ids:
    b.cmd("tab.reload", id=id)
seen = watch(1.5)
t.ok(0 < NOW["most"] <= TURNS, f"reloaded at once: never more than {TURNS} out of sight ask together ({NOW['most']})")
b.wait_for(settled, within=40, what="every page reloaded")
t.ok(len(titles()) == COUNT and len(STARTED) == COUNT, f"and every one of them comes back ({len(STARTED)} asked again)")

# Unset: half the processors, from two to eight.
b.cmd("prefs.set", key="load.turns", value=0)
cpus = os.cpu_count() or 2
t.ok(turns()["at"] == min(8, max(2, cpus // 2)), f"unset: half the processors, two to eight ({turns()['at']} of {cpus})")
t.done()

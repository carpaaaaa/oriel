#!/usr/bin/env python3
"""An address typed that sends you to another site still finishes from its
own first letters (Search 1.0.22, Tests/typed_redirect_completes.py): typed
twitter.com lands on x.com, and "tw" used to be searched for, since only
x.com was kept in History. Kept under the name typed too, as Chrome keeps
it, with the title of the page it led to; a search typed is not kept as an
address. Here localhost sends to 127.0.0.1 as twitter.com sends to x.com."""
import json
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b  # noqa: E402


class H(BaseHTTPRequestHandler):
    def do_GET(self):
        port = self.server.server_port
        if self.headers.get("Host", "").startswith("localhost"):
            self.send_response(301)
            self.send_header("Location", f"http://127.0.0.1:{port}/home")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        title = "Results" if self.path.startswith("/search") else "Home / Probe"
        data = f"<!doctype html><title>{title}</title>home".encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/html")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *a):
        pass


srv = ThreadingHTTPServer(("127.0.0.1", 0), H)
threading.Thread(target=srv.serve_forever, daemon=True).start()
PORT = srv.server_port

b.use("field-typedredirect")
# Searches go to this computer, never to an engine out there.
(b.folder()).mkdir(parents=True, exist_ok=True)
(b.folder() / "prefs.json").write_text(json.dumps({"search.engine": "custom", "search.custom": f"http://127.0.0.1:{PORT}/search?q=%s"}))
b.launch()
t = b.T()


def field(text):
    b.cmd("field.type", text=text)
    time.sleep(0.5)
    return b.window()["field"]


def active():
    return b.active()


b.cmd("tab.new", url=f"http://127.0.0.1:{PORT}/start")
b.wait_for(lambda: (active() or {}).get("title") == "Home / Probe", within=20, what="a first page")
b.cmd("field.commit", text=f"localhost:{PORT}")
landed = b.wait_for(lambda: (a := active()) and a["url"].endswith("/home") and a["title"] == "Home / Probe" and a, within=20, what="the site it sends you to")
t.ok(landed["url"] == f"http://127.0.0.1:{PORT}/home", f"typing the address lands on the site it sends you to ({landed['url']})")
time.sleep(1.0)

f = field("localh")
t.ok((f.get("ending") or "").startswith("ost"), f"its first letters finish it again ({f.get('ending')!r})")
rows = [(s["title"], s.get("how"), s.get("detail")) for s in f["suggestions"]]
row = next((r for r in rows if r[0].startswith("localhost")), None)
t.ok(row is not None and row[1] == "visited", f"…offered as the address typed ({rows})")
t.ok(row is not None and row[2] == "Home / Probe", f"…with the title of the page it led to ({row})")
f = field("127.0")
t.ok(bool(f.get("ending")), f"the site it went to still finishes too ({f.get('ending')!r})")
b.cmd("field.type", text="")

# A search is not an address: nothing typed is kept for it.
b.cmd("field.commit", text="hello there")
b.wait_for(lambda: (a := active()) and a["title"] == "Results" and a, within=20, what="the search")
time.sleep(1.0)
f = field("hel")
rows = [(s["title"], s.get("how")) for s in f["suggestions"]]
t.ok(not any(r[0].lower().startswith("hello") and r[1] == "visited" for r in rows), f"a search typed is not kept as an address ({rows})")
b.cmd("field.type", text="")

# A typed address that stays on its site is kept once, as before.
b.cmd("field.commit", text=f"127.0.0.1:{PORT}/same")
b.wait_for(lambda: (a := active()) and a["url"].endswith("/same") and a, within=20, what="the same site")
time.sleep(1.0)
v = [x["url"] for x in b.call({"do": "tabs.visits"})["visits"]]
t.ok(v[-1] == f"http://127.0.0.1:{PORT}/same" and v.count(f"http://127.0.0.1:{PORT}/same") == 1,
     f"an address that doesn't send you elsewhere: kept once, as before ({v[-3:]})")
t.ok(f"http://localhost:{PORT}/" in v and f"http://localhost:{PORT}/search?q=hello%20there" not in v, "the typed name was handed to History; no search was")
t.done()

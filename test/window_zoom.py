#!/usr/bin/env python3
"""Page zoom kept for each site (studio/01 §2.22): a step at a time along
Chrome's levels (the user's choice over the Mac's times 1.1), between 25% and
500%, Ctrl+0 back to the default, remembered for the host (pref zoom.<host>)
and forgotten when equal to the default; another host keeps its own."""
import sys, threading, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b


class Page(BaseHTTPRequestHandler):
    def do_GET(self):
        body = b"<title>zoom</title><body>zoom</body>"
        self.send_response(200)
        self.send_header("Content-Type", "text/html")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a):
        pass


server = ThreadingHTTPServer(("127.0.0.1", 0), Page)
threading.Thread(target=server.serve_forever, daemon=True).start()
port = server.server_address[1]
one, other = f"http://127.0.0.1:{port}/", f"http://localhost:{port}/"
key = f"zoom.127.0.0.1:{port}"

b.use("window-zoom")
b.launch()
t = b.T()


def zoom():
    return b.call({"do": "window.frame"})["frame"]["zoom"]


def prefs():
    return b.state()["prefs"]


def near(a, c):
    return a is not None and abs(a - c) < 0.002


b.cmd("field.commit", text=one)
b.wait_for(lambda: b.active()["title"] == "zoom" and not b.active()["loading"], what="page")
time.sleep(0.3)
t.ok(near(zoom(), 1), "a site starts at the default zoom")

b.cmd("view.zoom", by=1.1)
t.ok(near(zoom(), 1.1), "Ctrl+= the next level, 110%")
t.ok(near(prefs().get(key, 0), 1.1), "the zoom is kept for the site")

b.cmd("tab.go", input=other)
b.wait_for(lambda: b.active()["url"].startswith("http://localhost") and not b.active()["loading"], what="other host")
time.sleep(0.3)
t.ok(near(zoom(), 1), "another site keeps its own zoom")
b.cmd("tab.go", input=one)
b.wait_for(lambda: b.active()["url"].startswith("http://127.0.0.1") and not b.active()["loading"], what="back")
time.sleep(0.3)
t.ok(near(zoom(), 1.1), "back on the site, its zoom comes back")

for _ in range(20):
    b.cmd("view.zoom", by=1.1)
t.ok(near(zoom(), 5), "never over 500%, Chrome's last level")
for _ in range(30):
    b.cmd("view.zoom", by=1 / 1.1)
t.ok(near(zoom(), 0.25), "never under 25%, its first")

b.cmd("view.zoom", reset=True)
t.ok(near(zoom(), 1), "Ctrl+0: back to the default")
t.ok(key not in prefs(), "a zoom equal to the default is forgotten")
server.shutdown()
t.done()

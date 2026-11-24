#!/usr/bin/env python3
"""See through the floating video (float.fade, Oriel's own; Settings › Video),
in a hidden world.

Away from the pointer the floating video lets what is behind show through,
as much as the slider says (at its end a fifth stays); the slider at 0, it
is solid again and nothing watches. Both ways of floating: Oriel's window
and Chromium's picture in picture, found among the process's windows. A
picture in picture opened by the page itself counts too, and closing it
from the page is heard.

    npm run build && python3 test/pages_float_fade.py
"""
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b  # noqa: E402

WORLD = "pages-float-fade"

# A video drawn on a canvas, playing without a file.
VIDEO = b"""<!doctype html><title>video</title><body style="margin:0;background:#111">
<video id=v width=960 height=540 muted autoplay playsinline></video><canvas id=c width=640 height=360 hidden></canvas>
<script>
const c = document.getElementById('c'), g = c.getContext('2d'), v = document.getElementById('v')
let t = 0
setInterval(() => { t++; for (let i = 0; i < 8; i++) { g.fillStyle = 'hsl(' + ((i * 45 + t * 4) % 360) + ' 90% 55%)'; g.fillRect(i * 80, 0, 80, 360) } }, 33)
v.srcObject = c.captureStream(30); v.play()
</script>"""


class Site(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(VIDEO)))
        self.end_headers()
        self.wfile.write(VIDEO)

    def log_message(self, *a):
        pass


srv = ThreadingHTTPServer(("127.0.0.1", 0), Site)
threading.Thread(target=srv.serve_forever, daemon=True).start()
BASE = f"http://127.0.0.1:{srv.server_port}"
t = b.T()


def fl():
    return b.call({"do": "pages.state"})["float"]


def main():
    b.use(WORLD)
    try:
        b.launch()
        b.cmd("settings.set", id="float.fade", value=0.75)
        tab = b.cmd("tab.open", url=f"{BASE}/video", foreground=True)
        b.wait_for(lambda: b.ev(tab, "(() => { const v = document.querySelector('video'); return !!v && !v.paused && v.readyState >= 2 })()"), what="the video playing")

        print("- Oriel's window")
        t.ok((b.cmd("view.float") or {}).get("floating") is True, "floats")
        # The fade eases in: waited until it has arrived (unless the pointer is on it).
        f = b.wait_for(lambda: (lambda x: x if abs(x["fade"]["alpha"] - 0.4) < 0.02 or x["fade"].get("on") else None)(fl()), within=4, what="see-through")
        t.ok(True, f"away from the pointer, 0.4 ({f['fade']['alpha']:.2f})")
        b.cmd("settings.set", id="float.fade", value=0)
        f = b.wait_for(lambda: (lambda x: x if x["fade"]["alpha"] == 1 and not x["fade"]["watching"] else None)(fl()), within=4, what="solid again")
        t.ok(True, "the slider at 0: solid, nothing watching")
        b.cmd("view.float")
        b.wait_for(lambda: not fl()["floating"], within=3, what="landed")

        print("- picture in picture")
        b.cmd("settings.set", id="float.fade", value=0.75)
        b.cmd("settings.set", id="float.style", value="system")
        t.ok((b.cmd("view.float") or {}).get("picture") == "in", "in picture in picture")
        f = b.wait_for(lambda: (lambda x: x if x["fade"]["pipWindow"] is not None and x["fade"]["alpha"] < 0.5 else None)(fl()), within=5, what="its window found and faded")
        t.ok(f["pictured"] == tab, "the tab is the one pictured")
        b.ev(tab, "document.exitPictureInPicture()")
        b.wait_for(lambda: fl()["pictured"] is None, within=3, what="closed from the page, heard")
        t.ok(True, "closed from the page: heard")

        print("- picture in picture opened by the page")
        b.ev(tab, "document.querySelector('video').requestPictureInPicture().then(() => true)")
        f = b.wait_for(lambda: (lambda x: x if x["pictured"] == tab and x["fade"]["pipWindow"] is not None else None)(fl()), within=5, what="the page's own picture in picture")
        t.ok(True, "found and faded too")
        b.ev(tab, "document.exitPictureInPicture()")
    except Exception as error:
        import traceback
        traceback.print_exc()
        t.ok(False, f"ran to the end ({error})")
    t.done()


if __name__ == "__main__":
    main()

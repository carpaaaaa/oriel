#!/usr/bin/env python3
"""See through the floating video (float.fade, Oriel's own; Settings › Video),
in a hidden world.

Away from the pointer the floating video lets what is behind show through,
as much as the slider says (at its end a fifth stays); the slider at 0, it
is solid again and nothing watches. Just out it is solid for 2.5 seconds, so
you see where it went (0.1.10). With the pointer on it, it is solid; away,
it goes see-through again. A tab's own picture in picture button floats the
same window, so it fades the same. In a test world the window itself is
invisible: the number the fade keeps is read, not the window's opacity.

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


def pointer(on):
    b.call({"do": "pages.floatPointer", "on": on})


def main():
    b.use(WORLD)
    try:
        b.launch()
        b.cmd("settings.set", id="float.fade", value=0.75)
        tab = b.cmd("tab.open", url=f"{BASE}/video", foreground=True)
        b.wait_for(lambda: b.ev(tab, "(() => { const v = document.querySelector('video'); return !!v && !v.paused && v.readyState >= 2 })()"), what="the video playing")

        print("- the floating window")
        t.ok((b.cmd("view.float") or {}).get("floating") is True, "floats")
        f = fl()
        t.ok(f["fade"]["alpha"] == 1 and f["fade"]["watching"], "just out it is solid, with the slider at 0.75 (0.1.10)")
        time.sleep(1.5)
        t.ok(fl()["fade"]["alpha"] == 1, "and still solid a second and a half on")
        # The fade eases in after its 2.5 s: waited until it has arrived.
        f = b.wait_for(lambda: (lambda x: x if abs(x["fade"]["alpha"] - 0.4) < 0.02 else None)(fl()), within=8, what="see-through")
        t.ok(True, f"away from the pointer, 0.4 ({f['fade']['alpha']:.2f})")
        pointer(True)
        b.wait_for(lambda: fl()["fade"]["alpha"] == 1, within=5, what="solid under the pointer")
        t.ok(True, "the pointer on it: solid again")
        pointer(False)
        b.wait_for(lambda: abs(fl()["fade"]["alpha"] - 0.4) < 0.02, within=5, what="see-through again")
        t.ok(True, "the pointer away: see-through again")
        b.cmd("settings.set", id="float.fade", value=0.25)
        b.wait_for(lambda: abs(fl()["fade"]["alpha"] - 0.8) < 0.02, within=5, what="a lighter fade")
        t.ok(True, "the slider moved: the floating video follows at once (0.8)")
        b.cmd("settings.set", id="float.fade", value=0)
        f = b.wait_for(lambda: (lambda x: x if x["fade"]["alpha"] == 1 and not x["fade"]["watching"] else None)(fl()), within=5, what="solid again")
        t.ok(True, "the slider at 0: solid, nothing watching")
        pointer(None)
        b.cmd("view.float")
        b.wait_for(lambda: not fl()["floating"], within=3, what="landed")

        print("- from a tab's own picture in picture button")
        b.cmd("settings.set", id="float.fade", value=0.75)
        asked = b.ev(tab, "document.querySelector('video').requestPictureInPicture().then(() => 'in', e => e.name)")
        t.ok(asked == "in" and b.wait_for(lambda: fl()["floating"], within=5, what="floated from the site's button"), f"the site's button floats the video ({asked})")
        t.ok(fl()["fade"]["watching"] and fl()["fade"]["alpha"] == 1, "solid just out, as any")
        b.wait_for(lambda: abs(fl()["fade"]["alpha"] - 0.4) < 0.02, within=8, what="its see-through")
        t.ok(True, "and see-through after, as any")
        b.cmd("view.float")
        b.wait_for(lambda: not fl()["floating"], within=3, what="landed")
        b.cmd("settings.set", id="float.fade", value=0)
    except Exception as error:
        import traceback
        traceback.print_exc()
        t.ok(False, f"ran to the end ({error})")
    t.done()


if __name__ == "__main__":
    main()

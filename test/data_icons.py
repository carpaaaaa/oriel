#!/usr/bin/env python3
"""Site icons kept on disk (studio/01 §2.12-2.13): learned from what a tab
reports, written as icons/<ident>.png with the Mac's pages.json index, a PNG
and an .ico decoded, another page of the same site taking its site's icon,
the letter when a site's pages disagree, the icon there at once after a
restart and in the field's rows, private tabs' icons never written, and a page
forgotten from the history taking its icon with it."""
import hashlib
import json
import struct
import sys
import threading
import time
import zlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b


def png(size, rgb):
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))
    raw = b"".join(b"\0" + b"".join(bytes((255, 255, 255, 255)) if x == y else bytes((*rgb, 255)) for x in range(size)) for y in range(size))
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")


def ico_bmp(size, bgr):
    """An .ico with one 32-bit bitmap frame, as old sites still serve them."""
    pixels = b"".join(bytes((*bgr, 255)) for _ in range(size * size))
    mask = b"\0" * (((size + 31) // 32) * 4 * size)
    dib = struct.pack("<IiiHHIIiiII", 40, size, size * 2, 1, 32, 0, len(pixels) + len(mask), 0, 0, 0, 0) + pixels + mask
    return struct.pack("<HHH", 0, 1, 1) + struct.pack("<BBBBHHII", size, size, 0, 0, 1, 32, len(dib), 22) + dib


FILES = {
    "/icons/a.png": ("image/png", png(32, (30, 120, 200))),
    "/icons/b.ico": ("image/x-icon", ico_bmp(16, (40, 200, 60))),
}
PAGES = {
    "/a/page": '<!doctype html><title>A page</title><link rel=icon href="/icons/a.png">A',
    "/b/page": '<!doctype html><title>B page</title><link rel=icon href="/icons/b.ico">B',
}


class Site(BaseHTTPRequestHandler):
    def do_GET(self):
        path = self.path.split("?")[0]
        if path in FILES:
            kind, body = FILES[path]
        elif path in PAGES:
            kind, body = "text/html", PAGES[path].encode()
        else:
            self.send_response(404)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        self.send_response(200)
        self.send_header("Content-Type", kind)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a):
        pass


srv = ThreadingHTTPServer(("127.0.0.1", 0), Site)
threading.Thread(target=srv.serve_forever, daemon=True).start()
SITE = f"http://127.0.0.1:{srv.server_port}"
HOST = f"127.0.0.1:{srv.server_port}"

b.use("data-icons")
folder = b.folder()
b.launch()
t = b.T()


def req(name, **kw):
    return b.call({"do": name, **kw})


def index():
    return req("data.icons")["index"]


def visit(path, title):
    tab = b.active()
    if tab and not tab["empty"]:
        b.cmd("tab.go", input=SITE + path)
    else:
        b.cmd("field.commit", text=SITE + path)
    b.wait_for(lambda: (b.active() or {}).get("title") == title and not b.active()["loading"], what=title)


visit("/a/page", "A page")
entry = b.wait_for(lambda: index().get(HOST, {}).get("/a/page"), what="the icon kept for the page")
ident = hashlib.sha256((SITE + "/icons/a.png").encode()).hexdigest()[:32]
t.ok(entry["light"] == ident, f"kept under the first 16 bytes of SHA-256 of its address ({entry['light']})")
t.ok(abs(entry["seen"] - time.time()) < 60, "with when it was seen, seconds since 1970")
t.ok((folder / "icons" / f"{ident}.png").exists(), "the image in icons/, as PNG")
icon = req("data.icon", url=SITE + "/a/other")["value"]
t.ok(bool(icon) and icon.startswith("data:image/png;base64,"), "another page of the site takes the site's icon")

visit("/b/page", "B page")
b_entry = b.wait_for(lambda: index().get(HOST, {}).get("/b/page"), what="the .ico kept")
t.ok(b_entry["light"] != ident, "an .ico decoded, kept for its own page")
t.ok(req("data.icon", url=SITE + "/b/deeper")["value"] != req("data.icon", url=SITE + "/a/deeper")["value"], "two apps under one host keep their own icons (by path)")
t.ok(req("data.icon", url=SITE + "/c/x")["value"] is None, "pages that disagree, none sharing the path: the letter, not a guess")
t.ok(req("data.icon", url="https://elsewhere.example/")["value"] is None, "a site never seen has none")

# In the field's rows.
req("data.visit", url=SITE + "/a/page", title="A page")
rows = req("data.kinds", text="a page", limit=5)["rows"]
row = next((r for r in rows if r["url"] == SITE + "/a/page"), None)
t.ok(row is not None and str(row.get("favicon", "")).startswith("data:image/png"), "the field's rows carry the icon")

# Written for the next start: there at once.
b.quit()
saved = json.loads((folder / "icons" / "pages.json").read_text())
t.ok(saved.get(HOST, {}).get("/a/page", {}).get("light") == ident, "pages.json in the Mac's shape: site, path, light, seen")
b.launch()
t.ok(bool(req("data.icon", url=SITE + "/a/page")["value"]), "after a restart, there before any page says it")

# Forgetting a page from the history forgets its icon.
b.cmd("history.forget", url=SITE + "/b/page")
t.ok("/b/page" not in index().get(HOST, {}), "forgotten with the page")
t.ok(not (folder / "icons" / f"{b_entry['light']}.png").exists(), "and its file, worn by no other page")

# A private tab's icon is never written.
req("data.learnIcon", page="https://private.example/x", icon=SITE + "/icons/a.png", shy=True)
t.ok("private.example" not in index(), "a private tab's icon stays in memory")
t.ok(bool(req("data.icon", url="https://private.example/x", shy=True)["value"]), "where private tabs see it")
t.ok(req("data.icon", url="https://private.example/x")["value"] is None, "and no other tab does")

srv.shutdown()
t.done()

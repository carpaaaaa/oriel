#!/usr/bin/env python3
"""The Chrome Web Store (studio/04 §2.2, ways 1 and 2): Oriel's own bar on
every extension's page (icon, name, Add to Oriel, Adding…, Added to Oriel
and Remove), and the store's own button kept in place with its offer to
switch to Chrome hidden. A local server stands in for the store
(ORIEL_STORE_HOST, test worlds only) with a page shaped like the real one,
banner and button in one section; then, if it can be reached, the real
store, after Google's cookie question answered "Reject all"."""
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b

DARK_READER = "eimadpbcbfnmbkopoojfekhnkhdbieeh"
UBOL = "ddkjiahejlhfcafbddmgiahcphecmpfh"

DETAIL = """<!doctype html><title>Dark Reader - Chrome Web Store</title>
<main><section class="header">
  <div class="banner"><div><span>Switch to Chrome to install extensions and themes</span></div><button><span>Install Chrome</span></button></div>
  <div class="item"><h1>Dark Reader</h1><button id="store-add"><span>Add to Chrome</span></button></div>
</section><p>Overview</p></main>"""


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_GET(self):
        body = DETAIL if self.path.startswith("/detail/") else "<!doctype html><title>Extensions - Chrome Web Store</title><p>All extensions"
        data = body.encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/html")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
PORT = server.server_address[1]
threading.Thread(target=server.serve_forever, daemon=True).start()
STORE = f"store.localhost:{PORT}"

b.use("extensions-store")
b.launch(env={"ORIEL_STORE_HOST": STORE})
t = b.T()

offer = lambda: (b.window().get("ext") or {}).get("store")
layer = lambda: b.call({"do": "extensions.overlay"})["layer"]
over = lambda js: b.ui(js, root="overlay")


def go(url):
    b.cmd("tab.new", url=url)
    b.wait_for(lambda: not b.active()["loading"] and b.active()["url"].startswith(url[:30]), within=30, what=url)
    return b.active()["id"]


# Not an extension's page: no bar.
go(f"http://{STORE}/category/extensions")
time.sleep(0.8)
t.ok(offer() is None and layer()["kind"] == "none", "no bar on a store page that isn't an extension's")

# An extension's page: the bar, with its name.
page = go(f"http://{STORE}/detail/dark-reader/{DARK_READER}")
o = b.wait_for(lambda: (x := offer()) and x.get("name") and x, within=10, what="offer")
t.ok(o["id"] == DARK_READER and o["name"] == "Dark Reader" and not o["installed"], f"the bar knows the extension, its id from the address ({o})")
b.wait_for(lambda: layer().get("name") == "ext.store", within=5, what="bar shown")
time.sleep(0.5)
t.ok(over("document.querySelector('.ext-store-name')?.textContent") == "Dark Reader", "it shows the extension's name")
t.ok(over("document.querySelector('.ext-store-button')?.textContent") == "Add to Oriel", "and Add to Oriel")
bar = over("JSON.stringify((r => ({ w: r.width, h: r.height }))(document.querySelector('.ext-store').getBoundingClientRect()))")
import json
bar = json.loads(bar)
region = b.call({"do": "extensions.overlay"})["bounds"]
t.ok(round(bar["h"]) == 44 and abs(region["width"] - (bar["w"] + 44)) <= 2, f"44 tall, and the overlay takes only its size ({bar}, {region['width']})")
pg = next(x for x in b.state()["tabs"] if x["id"] == page)
t.ok(region["height"] == 44 + 44, "with room for its shadow")

# The store's own button stays, renamed; only its offer to switch goes.
time.sleep(0.5)
t.ok(b.ev(page, "(b => b.textContent.trim() + '|' + !!b.offsetParent)(document.getElementById('store-add'))") == "Add to Oriel|true",
     "the store's button stays in sight, as Add to Oriel")
t.ok(b.ev(page, "!document.querySelector('.banner span').offsetParent") is True, "its offer to switch to Chrome is hidden")

# Another layer takes the overlay; the bar comes back after.
b.cmd("field.open", target="here")
b.wait_for(lambda: layer()["kind"] == "field", within=5, what="field")
b.cmd("field.close")
b.wait_for(lambda: layer().get("name") == "ext.store", within=5, what="bar back")
t.ok(True, "the address field floats over it, and it comes back")

# Add: the question, Adding…, then Added to Oriel with Remove.
b.call({"do": "extensions.answer", "answers": ["Add Extension"]})
over("document.querySelector('.ext-store-button').click()")
b.wait_for(lambda: over("document.querySelector('.ext-store-state')?.textContent") == "Adding…", within=10, what="adding")
t.ok(True, "Adding… while it comes")
b.wait_for(lambda: (x := offer()) and x["installed"], within=90, what="installed")
asked = b.call({"do": "extensions.asked"})["asked"][-1]
t.ok(asked["message"] == "Add “Dark Reader” to Oriel?", "the same question as everywhere else")
b.wait_for(lambda: over("document.querySelector('.ext-store-state')?.textContent") == "Added to Oriel", within=5, what="added")
t.ok(over("document.querySelector('.ext-store-button')?.textContent") == "Remove", "then Added to Oriel, with Remove")
t.ok((offer() or {}).get("icon", "").startswith("crx://extension-icon/"), "and the extension's own icon")

b.call({"do": "extensions.answer", "answers": ["Remove"]})
over("document.querySelector('.ext-store-button').click()")
b.wait_for(lambda: (x := offer()) and not x["installed"], within=20, what="removed")
t.ok(not any(e["id"] == DARK_READER for e in b.call({"do": "extensions.list"})["extensions"]), "Remove asks and takes it away")

# Leaving for a page that isn't the store: the bar goes.
b.ev(page, f"location.href = 'http://{STORE.replace('store.', 'other.')}/'")
b.wait_for(lambda: offer() is None and layer()["kind"] == "none", within=10, what="bar gone")
t.ok(True, "it goes with the page")

# The real store, if it answers: its button in sight again, and the bar.
try:
    b.cmd("tab.new", url=f"https://chromewebstore.google.com/detail/ublock-origin-lite/{UBOL}")
    real = b.active()["id"]
    b.wait_for(lambda: not b.active()["loading"], within=30, what="real store")
    time.sleep(2)
    if "consent.google" in b.active()["url"]:
        b.ev(real, "[...document.querySelectorAll('button')].find(x => /^Reject all$/i.test(x.textContent.trim()))?.click()")
        b.wait_for(lambda: "chromewebstore.google.com" in b.active()["url"], within=20, what="back to the store")
    SEEN = "(b => b && b.offsetParent ? b.textContent.trim() : null)([...document.querySelectorAll('button')].find(x => /^Add to /.test(x.textContent.trim())))"
    try:
        seen = b.wait_for(lambda: (x := b.ev(real, SEEN)) == "Add to Oriel" and x, within=30, what="store button")
    except AssertionError:
        seen = b.ev(real, SEEN)
    t.ok(seen == "Add to Oriel", f"the real store: its Add to Oriel button is in sight ({seen})")
    try:
        o = b.wait_for(lambda: (x := offer()) and x.get("name") and x.get("icon") and x, within=20, what="real offer")
    except AssertionError:
        o = offer() or {}
    t.ok(o.get("id") == UBOL and o.get("name") == "uBlock Origin Lite", f"and Oriel's bar names it ({o.get('name')})")
    t.ok((o.get("icon") or "").startswith("https://"), "with the store's picture of it")
except Exception as e:  # noqa: BLE001
    print(f"  (the real store couldn't be checked: {e})")
t.done()

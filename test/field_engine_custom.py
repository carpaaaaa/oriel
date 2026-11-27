#!/usr/bin/env python3
"""A custom search engine can have a suggestions address (Settings ›
Browsing › Search with › Custom; Search 1.0.20, EngineSuggestTests,
Tests/engine_suggestions.py): optional, with %s where the words go (or
{searchTerms}), asked as you type only while Suggestions from your search
engine is on. Empty, and a custom engine still shows none; an http address
is not asked (a test world's fake engine on this computer is). Under the
custom engine's address in Settings, with the row's words saying where
what you type goes."""
import json
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b  # noqa: E402

asked = []


class Engine(BaseHTTPRequestHandler):
    def do_GET(self):
        q = parse_qs(urlparse(self.path).query).get("q", [""])[0]
        if self.path.startswith("/complete"):
            asked.append(q)
            body = json.dumps([q, [f"{q} one", f"{q} two"]]).encode()
            kind = "application/json"
        else:
            body = f"<title>found {q}</title>".encode()
            kind = "text/html"
        self.send_response(200)
        self.send_header("Content-Type", kind)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a):
        pass


server = HTTPServer(("127.0.0.1", 0), Engine)
threading.Thread(target=server.serve_forever, daemon=True).start()
P = server.server_address[1]
SEARCH = f"http://127.0.0.1:{P}/search?q=%s"
SUGGEST = f"http://127.0.0.1:{P}/complete?q={{searchTerms}}"

b.use("field-enginecustom")
b.folder().mkdir(parents=True, exist_ok=True)
(b.folder() / "prefs.json").write_text(json.dumps({"search.engine": "custom", "search.custom": SEARCH}))
b.launch(env={"SEARCH_LOOK": "light"})
t = b.T()
b.call({"do": "field.fake", "places": []})


def rows():
    return [(s.get("how"), s["title"], s["url"]) for s in b.window()["field"]["suggestions"]]


def ask(text, wait=0.6):
    asked.clear()
    b.cmd("field.type", text=text)
    time.sleep(wait)
    return rows()


r = ask("cats")
t.ok(not asked and all(x[0] != "suggested" for x in r), "suggestions off: a custom engine with an address asks nothing")
b.cmd("prefs.set", key="search.suggest", value=True)
r = ask("dogs")
t.ok(not asked and all(x[0] != "suggested" for x in r), "on, with no suggestions address: nothing asked, none shown")

b.cmd("prefs.set", key="search.customSuggest", value=SUGGEST)
b.cmd("field.type", text="bird")
got = b.wait_for(lambda: [x for x in rows() if x[0] == "suggested"], what="the custom engine's suggestions")
t.ok(asked[-1:] == ["bird"], f"on, with an address ({{searchTerms}} for the words): asked as you type ({asked})")
t.ok([x[1] for x in got] == ["bird one", "bird two"], f"its words under the field ({got})")
t.ok(got[0][2] == f"http://127.0.0.1:{P}/search?q=bird%20one", f"a suggestion searches the custom engine ({got[0][2]})")
r = ask("example.com")
t.ok(not asked, "never for an address")

b.cmd("prefs.set", key="search.customSuggest", value="http://suggest.example/complete?q=%s")
r = ask("fish")
t.ok(not asked and all(x[0] != "suggested" for x in r), "an http address out there is never asked")
b.cmd("prefs.set", key="search.customSuggest", value="")
b.cmd("field.type", text="")

# Settings › Browsing: the address under the custom engine's, and the row's words.
tab = b.cmd("settings.open", page="browsing")["tab"]


def ev(js):
    try:
        return b.ev(tab, js)
    except RuntimeError:
        return None


b.wait_for(lambda: ev("!!document.querySelector('.sr[data-row=\"search.suggest\"]')"), within=30, what="Settings")
time.sleep(0.4)
detail = lambda: ev("document.querySelector('.sr[data-row=\"search.suggest\"] .sr-detail')?.textContent")
fields = ev("[...document.querySelectorAll('.st-template input')].map(i => [i.getAttribute('aria-label'), i.placeholder])")
t.ok(fields == [["Search address", "https://example.com/search?q=%s"], ["Suggestions address", "https://example.com/suggest?q=%s"]],
     f"under Custom: its address, then the suggestions address with its example ({fields})")
label = ev("document.querySelector('.st-template-label')?.textContent")
t.ok(label == "Suggestions address (optional)", f"…named, optional ({label!r})")
t.ok(detail() == "A custom engine has no suggestions until you give it an address, so nothing is sent", f"none given: {detail()!r}")
ev("(() => { const i = document.querySelector('.st-template input[aria-label=\"Suggestions address\"]'); i.value = 'https://suggest.example/q?w=%s';"
   " i.dispatchEvent(new Event('change', {bubbles: true})) })()")
b.wait_for(lambda: b.state()["prefs"].get("search.customSuggest") == "https://suggest.example/q?w=%s", what="saved")
t.ok(True, "typed in Settings, the address is kept")
time.sleep(0.3)
t.ok(detail() == "What you type is sent to the suggestions address as you type", f"given: {detail()!r}")
b.cmd("prefs.set", key="search.customSuggest", value="ftp://x.example/%s")
time.sleep(0.3)
t.ok(detail() == "A custom engine's suggestions need an https address with %s, so nothing is sent", f"not https: {detail()!r}")
server.shutdown()
t.done()

#!/usr/bin/env python3
"""Suggestions from the search engine (studio/03 §1.8, EngineSuggest.swift),
asked of a fake engine on this computer (suggest.testURL, test worlds only):
off unless turned on, after a pause, under the field's own rows, at most
six, never for an address or a secret, never from a private window, never
from Ctrl+K, and the words of the last answer kept while the next comes."""
import json, sys, threading, time
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b

asked = []


class Engine(BaseHTTPRequestHandler):
    def do_GET(self):
        q = parse_qs(urlparse(self.path).query).get("q", [""])[0]
        asked.append(q)
        words = [q] + [f"{q} {n}" for n in ("one", "two", "three", "four", "five", "six", "seven")] + [f"{q} one"]
        body = json.dumps([q, words]).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a):
        pass


server = HTTPServer(("127.0.0.1", 0), Engine)
threading.Thread(target=server.serve_forever, daemon=True).start()
port = server.server_address[1]

b.use("field-engine")
b.launch()
t = b.T()
b.call({"do": "field.fake", "places": [{"kind": "history", "title": "Cats", "url": "https://cats.example/"}]})
b.cmd("prefs.set", key="suggest.testURL", value=f"http://127.0.0.1:{port}/complete?q=%s")


def rows():
    return [(s.get("how"), s["title"]) for s in b.window()["field"]["suggestions"]]


b.cmd("field.type", text="cats")
time.sleep(0.5)
t.ok(not asked and all(h != "suggested" for h, _ in rows()), "off by default: nothing asked, nothing shown")

b.cmd("prefs.set", key="search.suggest", value=True)
b.cmd("field.type", text="cat")
b.cmd("field.type", text="cats")
got = b.wait_for(lambda: [r for r in rows() if r[0] == "suggested"], what="engine rows")
t.ok(asked == ["cats"], f"one question, after the pause, for the last words only: {asked}")
t.ok([r[1] for r in got] == ["cats one", "cats two", "cats three", "cats four", "cats five", "cats six"], f"six at most, each once, not the words typed: {got}")
r = rows()
t.ok(r[0][0] == "visited" and r[1] == ("search", "cats") and r[2][0] == "suggested", f"under the field's own rows: {r[:3]}")
t.ok(b.window()["field"]["suggestions"][2]["url"] == "https://www.google.com/search?q=cats%20one", "a suggestion searches the engine")

# while the next answer comes, last time's words that still fit stay
asked.clear()
b.cmd("field.type", text="cats t")
r = rows()
t.ok([x[1] for x in r if x[0] == "suggested"] == ["cats two", "cats three"], f"the words still fitting stay meanwhile: {r}")
b.wait_for(lambda: asked == ["cats t"], what="asked again")

# never sent
for text in ["github.com", "abc123def456gh", "x:y", "a@b.co hi"]:
    asked.clear()
    b.cmd("field.type", text=text)
    time.sleep(0.4)
    t.ok(not asked, f"{text!r} is never sent")

# never from Ctrl+K
asked.clear()
b.cmd("field.summon")
b.cmd("field.type", text="dogs")
time.sleep(0.4)
t.ok(not asked, "Ctrl+K asks nobody")
b.cmd("field.summon")

# never from a private window
b.cmd("window.new", shy=True)
time.sleep(1.5)
shy = next(w for w in b.state()["windows"] if any(x.get("shy") for x in w["tabs"]))
asked.clear()
b.call({"do": "cmd", "cmd": {"do": "field.type", "text": "birds"}, "window": shy["windowID"]})
time.sleep(0.5)
t.ok(not asked, "a private window asks nobody")

server.shutdown()
t.done()

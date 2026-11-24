#!/usr/bin/env python3
"""The models are downloaded once and kept (studio/03 §6.3 "scaricare i
modelli su richiesta"): the first Italian page fetches Mozilla's list and the
three files of the Italian to English pair, each checked against its SHA-256,
into Oriel's own folder, with the tab's mark saying "downloading" and how
far; the next translation, and the next after a restart, fetch nothing. A
file that doesn't match its checksum is never kept and the menu says why.
Mozilla's list and CDN are played by a local server (SEARCH_TRANSLATE_CATALOG)
serving Mozilla's real records and files for it-en, kept by translate_bergamot.py's
shared folder (fetched from Mozilla once if missing)."""
import hashlib
import json
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b  # noqa: E402
import translate_kit as k  # noqa: E402

t = b.T()


def shared_pair():
    """The real it-en files and their records, from the shared folder."""
    catalog = k.SHARED_MODELS / "catalog.json"
    if catalog.exists():
        data = json.loads(catalog.read_text())["data"]
        recs = [r for r in data if r["fromLang"] == "it" and r["toLang"] == "en" and r["version"] == "1.0"]
        if len(recs) == 3 and all((k.SHARED_MODELS / "it-en" / "1.0" / r["name"]).exists() for r in recs):
            return recs
    return None


recs = shared_pair()
if not recs:
    print("  (fetching the real it-en model from Mozilla once, into out/translate-models)")
    k.world("translate-download-prime", shared_models=True)
    k.launch()
    tab = k.open_page("it")
    k.translate(tab, "en")
    k.wait_done(tab, 300)
    b.quit()
    recs = shared_pair()
assert recs, "no it-en model in the shared folder"

FILES = {}
records = []
for r in recs:
    r = json.loads(json.dumps(r))
    path = f"files/{r['name']}"
    FILES["/" + path] = (k.SHARED_MODELS / "it-en" / "1.0" / r["name"]).read_bytes()
    r["attachment"]["location"] = path
    records.append(r)
# French to English: files that don't match their checksum.
for kind, name in [("model", "model.fren.intgemm.alphas.bin"), ("lex", "lex.50.50.fren.s2t.bin"), ("vocab", "vocab.fren.spm")]:
    body = b"not a model " * 100
    FILES["/files/" + name] = body
    records.append({"name": name, "fromLang": "fr", "toLang": "en", "fileType": kind, "version": "1.0", "filter_expression": "",
                    "attachment": {"hash": "0" * 64, "size": len(body), "location": "files/" + name, "filename": name, "mimetype": "application/octet-stream"}})

HITS = {}


class CDN(BaseHTTPRequestHandler):
    def do_GET(self):
        p = self.path.split("?")[0]
        HITS[p] = HITS.get(p, 0) + 1
        body = json.dumps({"data": records}).encode() if p == "/records" else FILES.get(p)
        if body is None:
            self.send_response(404)
            self.end_headers()
            return
        self.send_response(200)
        self.send_header("Content-Type", "application/octet-stream")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        # Slowly enough to see the mark say how far.
        for i in range(0, len(body), 1 << 18):
            self.wfile.write(body[i:i + (1 << 18)])
            time.sleep(0.004)

    def log_message(self, *a):
        pass


srv = ThreadingHTTPServer(("127.0.0.1", 0), CDN)
threading.Thread(target=srv.serve_forever, daemon=True).start()
CATALOG = f"http://127.0.0.1:{srv.server_address[1]}/records"
it_files = [p for p in FILES if ".iten." in p]


def files_hits():
    return {p: HITS.get(p, 0) for p in it_files}


k.world("translate-download", env={"SEARCH_TRANSLATE_CATALOG": CATALOG})
k.launch()
kept = b.folder() / "Translations" / "it-en" / "1.0"

tab = k.open_page("it")
k.translate(tab, "en")
seen = []
end = time.time() + 60
while time.time() < end:
    m = k.mark(tab)
    if m:
        seen.append((m["phase"], m.get("progress")))
        if m["phase"] in ("done", "failed"):
            break
    time.sleep(0.03)
rep, mark = k.wait_done(tab, 120)
t.ok(mark and mark["phase"] == "done", f"translated: {mark}")
downs = [p for ph, p in seen if ph == "downloading"]
t.ok(len(downs) >= 2 and downs[-1] is not None and downs[-1] > downs[0], f"while it downloads, the mark says so and how far: {downs[:3]}…{downs[-2:]}")
t.ok(HITS.get("/records") == 1, "Mozilla's list fetched once")
t.ok(all(n == 1 for n in files_hits().values()), f"each of the pair's three files fetched once: {files_hits()}")
t.ok(all((kept / r["name"]).stat().st_size == r["attachment"]["size"] for r in recs), "kept in Oriel's folder, Translations/it-en/1.0")
t.ok(all(hashlib.sha256((kept / r["name"]).read_bytes()).hexdigest() == r["attachment"]["hash"] for r in recs), "each file matches its SHA-256")
t.ok(rep.get("downloadMs") is not None and rep.get("models") == ["it-en 1.0"], f"the report says it downloaded, the fast model: {rep.get('models')}")
t.ok("library" in k.text(tab, "#p2"), f"the page in English: {k.text(tab, '#p2')!r}")

# Again: nothing fetched.
b.cmd("page.untranslate", id=tab)
time.sleep(0.3)
k.translate(tab, "en")
rep, mark = k.wait_done(tab, 60)
t.ok(mark["phase"] == "done" and rep.get("downloadMs") is None, "translated again with nothing downloaded")
t.ok(all(n == 1 for n in files_hits().values()) and HITS.get("/records") == 1, "no request at all the second time")

# After a restart: still nothing.
b.quit()
time.sleep(1)
k.world("translate-download", env={"SEARCH_TRANSLATE_CATALOG": CATALOG}, wipe=False)
k.launch()
tab = k.open_page("it")
k.translate(tab, "en")
rep, mark = k.wait_done(tab, 60)
t.ok(mark and mark["phase"] == "done" and "library" in k.text(tab, "#p2"), "after a restart, translated")
t.ok(all(n == 1 for n in files_hits().values()) and HITS.get("/records") == 1, f"from what was kept: no request ({HITS.get('/records')} list, {files_hits()})")

# A file that doesn't match its checksum.
fr = k.open_page("fr")
k.translate(fr, "en")
rep, mark = k.wait_done(fr, 60)
t.ok(mark and mark["phase"] == "failed" and mark["error"].startswith("French wasn't translated"), f"a file that doesn't match: the menu says French wasn't translated: {mark}")
t.ok(not any((b.folder() / "Translations" / "fr-en").rglob("*.bin")) if (b.folder() / "Translations" / "fr-en").exists() else True, "and nothing of it is kept")
t.ok(k.text(fr, "#p1").startswith("La bibliothèque"), "the page stays as it came")

t.done()

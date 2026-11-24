#!/usr/bin/env python3
"""Translate Page for real (studio/03 §6.3): Bergamot, Firefox Translations'
engine, with Mozilla's own models (fetched once into out/translate-models,
shared by every run). Italian into English: the words come out in English,
the links and bold stay in their places, code and translate="no" stay as
they are, the attributes are translated; Show Original puts
the page back exactly. French into English. Italian into French through
English, as Firefox does. On a page quoting other languages each block goes
from its own (English kept, French from French). A page of usual length:
the first screen comes back quickly and the main process and the page keep
answering while the rest is translated (the engine has a thread of its own)."""
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b  # noqa: E402
import translate_kit as k  # noqa: E402

t = b.T()
k.world("translate-bergamot", shared_models=True)
k.launch()


def words(tab, sel, *expected):
    got = (k.text(tab, sel) or "").lower()
    return all(w in got for w in expected), got


# Italian into English.
tab = k.open_page("it")
before = k.body(tab)
b.ev(tab, "window.__a = document.querySelector('#a1').firstChild")
k.translate(tab, "en")
rep, mark = k.wait_done(tab, 300)
t.ok(mark and mark["phase"] == "done" and mark["from"] == "it", f"Italian into English, done: {mark}")
print(f"  (it-en: {rep.get('models')}, download {rep.get('downloadMs')} ms, load {rep.get('loadMs')} ms, page {rep.get('fullMs')} ms)")
for sel, ws in [("#p2", ("library", "nine", "morning", "sunday")), ("#p5", ("train", "florence", "station")),
                ("#li1", ("bread", "oil")), ("#li2", ("cheese", "wine")), ("#h", ("tuscan",))]:
    ok, got = words(tab, sel, *ws)
    t.ok(ok, f"{sel} in English: {got!r}")
ok, got = words(tab, "#p1", "read", "article", "secrets", "tradition")
t.ok(ok, f"the paragraph with a link and bold, in English: {got!r}")
t.ok(b.ev(tab, "(() => { const a = document.querySelector('#p1 > a#a1'); return !!a && a.getAttribute('href') === '/ricette' && /article|recipe/i.test(a.textContent) && !!document.querySelector('#p1 > b#b1') })()"),
     f"the link is still a link in its place, with English words: {k.text(tab, '#a1')!r}; the bold is where it was")
t.ok(b.ev(tab, "window.__a === document.querySelector('#a1').firstChild"), "in the same text node")
t.ok(k.text(tab, "#c1") == "ls -la", "code stays as it is")
ok, got = words(tab, "#p3", "command", "ls -la", "files")
t.ok(ok, f"and the sentence round it reads whole: {got!r}")
t.ok(k.text(tab, "#nt") == "Questo testo resta in italiano.", 'translate="no" stays in Italian')
t.ok("sea" in k.attr(tab, "#img", "alt").lower(), f"the image's alt: {k.attr(tab, '#img', 'alt')!r}")
t.ok("recipe" in k.attr(tab, "#in", "placeholder").lower(), f"the field's placeholder: {k.attr(tab, '#in', 'placeholder')!r}")
t.ok(b.ev(tab, "document.title") == "La cucina toscana", "the title stays the page's own (History keeps what the site says)")
b.cmd("page.untranslate", id=tab)
time.sleep(0.4)
t.ok(k.body(tab) == before, "Show Original: the page exactly as it came")

# French into English.
fr = k.open_page("fr")
k.translate(fr, "en")
rep, mark = k.wait_done(fr, 300)
t.ok(mark and mark["phase"] == "done" and mark["from"] == "fr", f"French into English: {mark}")
ok, got = words(fr, "#p1", "library", "nine", "sunday")
t.ok(ok, f"in English: {got!r}")
t.ok(b.ev(fr, "!!document.querySelector('#p2 > a#a1[href=\"/livres\"]') && !!document.querySelector('#p2 > b#b1')"), "its link and bold in place")

# Italian into French, through English.
tab2 = k.open_page("it")
k.translate(tab2, "fr")
rep, mark = k.wait_done(tab2, 300)
t.ok(mark and mark["phase"] == "done" and mark["to"] == "fr", f"Italian into French: {mark}")
t.ok(rep.get("models") and len(rep["models"]) == 2 and rep["models"][0].startswith("it-en") and rep["models"][1].startswith("en-fr"),
     f"through English, two models: {rep.get('models')}")
ok, got = words(tab2, "#p2", "bibliothèque")
t.ok(ok, f"in French: {got!r}")

# Each block from its own language.
mixed = k.open_page("mixed")
k.translate(mixed, "en")
rep, mark = k.wait_done(mixed, 300)
t.ok(mark and mark["phase"] == "done", "a page quoting French and English, into English")
t.ok(k.text(mixed, "#en1") == "The city museum is open every day from ten in the morning until six in the evening.", "the English quote stays as it is")
ok, got = words(mixed, "#fr1", "museum", "open")
t.ok(ok, f"the French quote is translated from French: {got!r}")
ok, got = words(mixed, "#it1", "museum", "open")
t.ok(ok, f"the Italian from Italian: {got!r}")
t.ok(rep["languages"].get("fr") == 1 and rep["languages"].get("en") == 1, f"languages met: {rep['languages']}")

# A page of usual length, with the engine warm.
med = k.open_page("medium")
chars = b.ev(med, "document.body.innerText.length")
k.translate(med, "en")
slow = 0
t0 = time.time()
while time.time() - t0 < 60:
    a = time.time()
    b.ev(med, "1 + 1")
    slow = max(slow, time.time() - a)
    m = k.mark(med)
    if m and m["phase"] in ("done", "failed"):
        break
    time.sleep(0.05)
rep, mark = k.wait_done(med, 120)
print(f"  (page of {chars} characters, {rep['units']} blocks: first screen {rep.get('firstSliceMs')} ms, whole page {rep.get('fullMs')} ms, {rep.get('requests')} requests)")
t.ok(mark["phase"] == "done", "a page of usual length is translated")
t.ok(rep.get("firstSliceMs", 1e9) < 4000, f"what is on screen first, quickly: {rep.get('firstSliceMs')} ms")
t.ok(slow < 0.5, f"the page and the main process keep answering meanwhile (slowest {slow * 1000:.0f} ms)")
untranslated = b.ev(med, "[...document.querySelectorAll('p')].filter(p => /(^|\\s)(è|sono|nella|perché|quindi|bisogna|conviene)(\\s|$)/.test(p.textContent)).length")
t.ok(untranslated == 0, f"no paragraph left in Italian ({untranslated})")

# Nothing of the page went out: only Mozilla's list (if stale) and files.
fetched = b.call({"do": "translate.fetched"})["fetched"]
t.ok(all(u.startswith("https://firefox.settings.services.mozilla.com/") or u.startswith("https://firefox-settings-attachments.cdn.mozilla.net/") for u in fetched),
     f"only Mozilla's list and model files were fetched ({len(fetched)})")

t.done()

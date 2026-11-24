#!/usr/bin/env python3
"""Translate Page, the page's side (studio/03 §6.3, Translate.swift), with the
stand-in translator that marks each piece "[it→en] " (SEARCH_TRANSLATE_FAKE,
as the Mac's tests do): every piece of text and the four attributes are
written in their own nodes (the same Text objects: React keeps working),
links and bold stay where they were, code and translate="no" are left
alone, what the page adds later follows, Show Original puts back exactly
what was there, a new page forgets the translation, a page already in the
language says so, and the sign and its menu show for the tab in front."""
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b  # noqa: E402
import translate_kit as k  # noqa: E402

t = b.T()
k.world("translate-page", fake=True)
k.launch()

tab = k.open_page("it")
before = k.body(tab)
# Hold on to nodes as a page's framework would.
b.ev(tab, "window.__nodes = [document.querySelector('#a1').firstChild, document.querySelector('#p2').firstChild, document.querySelector('#b1').firstChild]")

t.ok(k.translate(tab, "en") == {"started": True}, "page.translate starts")
rep, mark = k.wait_done(tab, 30)
t.ok(rep and rep.get("source") == "it", f"the page's language is found: {rep and rep.get('source')}")
t.ok(mark and mark["phase"] == "done" and mark["from"] == "it" and mark["to"] == "en", f"the tab's mark says done, from it to en: {mark}")
t.ok(k.mark(tab) and k.mark(tab)["phase"] == "done", "the window's state has the tab's mark (slice translate)")

M = "[it→en] "
t.ok(k.text(tab, "#p2").startswith(M + "La biblioteca"), "a paragraph is translated")
t.ok(k.text(tab, "#a1") == M + "articolo sulle ricette", "the link's words, in the link")
t.ok(k.text(tab, "#b1") == M + "nonna", "the bold words, in the bold")
t.ok(b.ev(tab, "document.querySelector('#p1 > a#a1') !== null && document.querySelector('#p1 > b#b1') !== null && document.querySelector('#a1').getAttribute('href') === '/ricette'"),
     "the link and the bold are where they were, the link's address kept")
t.ok(b.ev(tab, "window.__nodes[0] === document.querySelector('#a1').firstChild && window.__nodes[1] === document.querySelector('#p2').firstChild && window.__nodes[2] === document.querySelector('#b1').firstChild"),
     "the same text nodes hold the translation (no node added or replaced)")
t.ok(k.text(tab, "#c1") == "ls -la", "code is left alone")
t.ok(k.text(tab, "#p3").startswith(M + "Usa il comando ls -la " + M), "the sentence around the code is translated in its pieces")
t.ok(k.text(tab, "#nt") == "Questo testo resta in italiano.", 'translate="no" is left alone')
t.ok(k.attr(tab, "#img", "alt") == M + "Una bella foto del mare d'estate", "an image's alt is translated")
t.ok(k.attr(tab, "#in", "placeholder") == M + "Cerca una ricetta", "a field's placeholder is translated")
t.ok(b.ev(tab, "document.title") == "La cucina toscana", "the title stays the page's own (History keeps what the site says)")
t.ok(b.ev(tab, "document.querySelector('#in').value") == "", "a field's value is never touched")

# What the page adds later follows.
b.ev(tab, "document.querySelector('#later').innerHTML = '<p id=p9>Un nuovo paragrafo arriva <em>dopo</em> il caricamento.</p>'")
ok = b.wait_for(lambda: (k.text(tab, "#p9") or "").startswith(M), within=5, what="added paragraph translated")
t.ok(ok, f"a paragraph added later is translated: {k.text(tab, '#p9')}")
b.ev(tab, "document.querySelector('#li2').firstChild.nodeValue = 'Vino bianco e acqua'")
ok = b.wait_for(lambda: k.text(tab, "#li2") == M + "Vino bianco e acqua", within=5, what="changed text translated")
t.ok(ok, "text the page changes later is translated again")
rep, _ = k.report(tab)
t.ok(rep["rounds"] >= 2, f"each change is a round of its own: {rep['rounds']}")

# The right-click menu's request.
r = b.cmd("translate.menuLanguages", id=tab)
t.ok(r["languages"] == [{"code": "en", "name": "English"}], f"the menu offers English to begin with: {r['languages']}")
t.ok(r["tab"]["phase"] == "done", "and says the tab is translated")

# The sign, in the column's helm, for the tab in front; its menu.
sign = b.ui("(() => { const s = document.querySelector('.tr-sign'); return s && { phase: s.dataset.translateSign, title: s.title } })()")
t.ok(sign and sign["phase"] == "done" and sign["title"] == "Translated from Italian", f"the sign shows, 'Translated from Italian': {sign}")
rect = b.ui("(() => { const r = document.querySelector('.tr-sign').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.bottom } })()")
b.cmd("translate.menu", anchor=rect)
time.sleep(0.5)
st = b.state()
t.ok(st["windows"][0]["overlay"] == {"kind": "panel", "name": "translate.menu", "data": {"tab": tab}}, "the sign's menu opens in the overlay")
menu = b.ui("(() => { const m = document.querySelector('[data-translate-menu]'); return m && m.innerText })()", root="overlay")
t.ok(menu and "Translated from Italian" in menu and "Show Original" in menu and "Translated on this PC. Nothing is sent anywhere." in menu,
     f"the menu: heading, Show Original, nothing sent: {menu!r}")

# Show Original, from the menu: exactly what was there.
b.ui("document.querySelector('[data-translate-original]').click()", root="overlay")
b.wait_for(lambda: k.mark(tab) is None, within=5, what="mark gone")
time.sleep(0.3)
after = k.body(tab).replace('<p id="p9">Un nuovo paragrafo arriva <em>dopo</em> il caricamento.</p>', "").replace("Vino bianco e acqua", "Formaggio e vino rosso")
t.ok(after == before, "Show Original puts back the page exactly as it was")
t.ok(k.text(tab, "#p9") == "Un nuovo paragrafo arriva dopo il caricamento.", "the later paragraph too")
t.ok(b.state()["windows"][0]["overlay"]["kind"] == "none", "the menu goes")
t.ok(b.ui("document.querySelector('.tr-sign') === null"), "the sign goes")
b.ev(tab, "document.querySelector('#later').innerHTML = '<p id=p10>Dopo, niente più traduzione.</p>'")
time.sleep(1)
t.ok(k.text(tab, "#p10") == "Dopo, niente più traduzione.", "after Show Original, nothing added is translated")

# Again, into another language: from the page as it came.
k.translate(tab, "fr")
rep, mark = k.wait_done(tab, 30)
t.ok(mark["to"] == "fr" and k.text(tab, "#p2").startswith("[it→fr] La biblioteca"), "translated again into French, from the page as it came")
k.translate(tab, "en")
rep, mark = k.wait_done(tab, 30)
t.ok(k.text(tab, "#p2").startswith(M + "La biblioteca") and "[it→fr]" not in k.text(tab, "#p2"), "into English after French: never a translation of a translation")
b.cmd("page.untranslate", id=tab)
time.sleep(0.3)

# A new page: the translation is forgotten.
k.translate(tab, "en")
k.wait_done(tab, 30)
b.ev(tab, f"location.href = {json.dumps(k.BASE + '/fr')}")
b.wait_for(lambda: k.mark(tab) is None, within=5, what="mark gone on navigation")
time.sleep(0.8)
t.ok(k.text(tab, "#p1").startswith("La bibliothèque"), "the next page comes as it is")

# Already in the language.
en = k.open_page("en")
k.translate(en, "en")
rep, mark = k.wait_done(en, 30)
t.ok(mark and mark["phase"] == "failed" and mark["error"] == "This page is already in English", f"an English page into English says so: {mark}")
sign = b.ui("(() => { const s = document.querySelector('.tr-sign'); return s && s.dataset.translateSign })()")
t.ok(sign == "failed", "the sign shows the trouble")
t.ok(b.wait_for(lambda: k.mark(en) is None, within=11, what="failure mark gone"), "and goes after 8 seconds")

# Nothing of the page went anywhere: no request but the page's own.
t.ok(b.call({"do": "translate.fetched"})["fetched"] == [], "the stand-in fetched nothing")

t.done()

#!/usr/bin/env python3
"""Settings › Browsing › Reading mode (studio/06 §1.5 #76-#77, studio/03
§6.2): Ctrl+Shift+R shows a page's article alone; Read the site's own
Markdown shows the site's Markdown copy instead, when it has one; Reading
mode follows light and dark puts the article in the window's look, with a
switch in its corner kept for the next one. Off, the article is light."""
import sys
import time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b
import settings_c_web as web

server, P = web.start(tls=False)
H = f"http://127.0.0.1:{P}"
WORDS = "This is a sentence of the article, long enough to count as prose for reading mode. " * 4
web.PAGES["/article"] = ("<title>An article</title><link rel='stylesheet' href='/site.css'><body>"
                         "<nav><a href='/a'>Home</a> <a href='/b'>News</a> <a href='/c'>Sport</a></nav>"
                         "<h1>The headline</h1><article>" + "".join(f"<p>{WORDS}</p>" for _ in range(4)) +
                         "<p style='display:none'>hidden from people</p></article>"
                         "<aside><a href='/x'>Related one</a><a href='/y'>Related two</a></aside>")
web.PAGES["/site.css"] = ("body { background: rgb(255, 0, 0) }", "text/css")
web.PAGES["/twin"] = ("<title>Docs page</title><link rel='alternate' type='text/markdown' href='/twin.md'><body>"
                      "<h1>Docs page</h1><main>" + "".join(f"<p>{WORDS}</p>" for _ in range(3)) + "</main>")
web.PAGES["/twin.md"] = ("# From the Markdown\n\nA paragraph with **strong** words and a [link](https://example.com/x).\n\n"
                         "- one\n- two\n\n```\ncode <b>here</b>\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n<script>alert(1)</script>\n",
                         "text/markdown; charset=utf-8")

b.use("settings-c-reading")
b.launch()
t = b.T()


def setting(key, value):
    b.cmd("settings.set", id=key, value=value)
    time.sleep(1.0)


def ev(tab, js):
    try:
        return b.ev(tab, js)
    except RuntimeError:
        return None


def tab_titled(title, url):
    b.cmd("tab.new", url=url)
    b.wait_for(lambda: b.active()["title"] == title, within=30, what=title)
    tab = b.active()["id"]
    b.wait_for(lambda: ev(tab, "document.readyState") == "complete", within=30, what="loaded")
    time.sleep(0.4)
    return tab


def reading():
    return b.call({"do": "pages.state"})["reading"]


def bg(tab):
    return ev(tab, "getComputedStyle(document.body).backgroundColor")


# 1. Reading mode: the article alone, the page's styles gone, light.
# Reading mode follows light and dark is on by default since Search 1.0.22: off here first.
setting("reader.follows", False)
setting("look", "dark")
tab = tab_titled("An article", H + "/article")
b.cmd("view.reader")
b.wait_for(lambda: reading(), within=15, what="reading")
t.ok(reading()[0]["how"] == "guess", "Ctrl+Shift+R: the article, worked out from the page")
t.ok(ev(tab, "document.querySelector('#oriel-reader h1').textContent") == "The headline", "the headline on top")
t.ok(ev(tab, "document.querySelector('#oriel-reader').querySelectorAll('p').length") >= 5, "the article's paragraphs")
t.ok(ev(tab, "!document.querySelector('nav') && !document.querySelector('aside') && !document.body.textContent.includes('hidden from people')"), "no menu, no rail, nothing the page hid")
t.ok(ev(tab, "document.documentElement.getAttribute('data-oriel-look')") == "light" and bg(tab) == "rgb(255, 255, 255)",
     f"follows off: light, though the window is dark ({bg(tab)})")
t.ok(ev(tab, "!document.querySelector('[data-oriel-reader-look]')"), "and no switch in the corner")
b.cmd("view.reader")
b.wait_for(lambda: not reading() and ev(tab, "!!document.querySelector('nav')"), within=15, what="back to the page")
t.ok(bg(tab) == "rgb(255, 0, 0)", "again: the page as it was")

# 2. Reading mode follows light and dark.
setting("reader.follows", True)
b.wait_for(lambda: ev(tab, "document.readyState") == "complete", within=15, what="loaded")
b.cmd("view.reader")
b.wait_for(lambda: reading(), within=15, what="reading, follows")
t.ok(ev(tab, "document.documentElement.hasAttribute('data-oriel-look')") is False and bg(tab) == "rgb(28, 28, 28)",
     f"on: dark with the window ({bg(tab)})")
t.ok(ev(tab, "!!document.querySelector('[data-oriel-reader-look]')"), "with the switch in its corner")
b.call({"do": "eval", "id": tab, "js": "1"})
# The switch's light button (a closed shadow root: clicked where it is drawn).
box = ev(tab, "JSON.stringify(document.querySelector('[data-oriel-reader-look]').getBoundingClientRect())")
import json
r = json.loads(box)
x, y = r["x"] + 15, r["y"] + 14
b.call({"do": "pages.input", "id": tab, "events": [{"type": "mouseMove", "x": x, "y": y},
        {"type": "mouseDown", "x": x, "y": y, "button": "left", "clickCount": 1}, {"type": "mouseUp", "x": x, "y": y, "button": "left", "clickCount": 1}]})
b.wait_for(lambda: ev(tab, "document.documentElement.getAttribute('data-oriel-look')") == "light", within=10, what="light chosen")
time.sleep(0.5)
t.ok(bg(tab) == "rgb(255, 255, 255)" and b.state()["prefs"].get("reader.look") == "light", "the corner's choice turns it light, and is kept")
b.cmd("view.reader")
time.sleep(1)
tab2 = tab_titled("An article", H + "/article?2")
b.cmd("view.reader")
b.wait_for(lambda: len(reading()) >= 1 and ev(tab2, "!!document.getElementById('oriel-reader')"), within=15, what="next article")
t.ok(ev(tab2, "document.documentElement.getAttribute('data-oriel-look')") == "light", "the next article wears the kept choice")
b.cmd("view.reader")
setting("reader.follows", False)

# 3. Read the site's own Markdown.
tab3 = tab_titled("Docs page", H + "/twin")
b.cmd("view.reader")
b.wait_for(lambda: any(x["url"].endswith("/twin") for x in reading()), within=15, what="reading docs")
t.ok(next(x for x in reading() if x["url"].endswith("/twin"))["how"] == "guess", "off: the article is worked out, the Markdown isn't asked for")
b.cmd("view.reader")
time.sleep(1)
setting("reader.twins", True)
b.wait_for(lambda: ev(tab3, "document.readyState") == "complete", within=15, what="loaded")
b.cmd("view.reader")
b.wait_for(lambda: any(x["url"].endswith("/twin") for x in reading()), within=15, what="reading twin")
t.ok(next(x for x in reading() if x["url"].endswith("/twin"))["how"] == "markdown", "on: the site's Markdown copy is shown instead")
t.ok(ev(tab3, "document.querySelector('#oriel-reader h1').textContent") == "From the Markdown", "its first heading is the title")
t.ok(ev(tab3, "document.querySelector('.oriel-from').textContent") == f"127.0.0.1:{P} · markdown", "and it says where it is from")
t.ok(ev(tab3, "document.querySelector('#oriel-reader strong').textContent") == "strong" and ev(tab3, "document.querySelectorAll('#oriel-reader li').length") == 2
     and ev(tab3, "!!document.querySelector('#oriel-reader table td')"), "Markdown's emphasis, lists and tables")
t.ok(ev(tab3, "document.querySelector('#oriel-reader pre').textContent") == "code <b>here</b>" and ev(tab3, "!document.querySelector('#oriel-reader script, #oriel-reader pre b')"),
     "nothing in it can run: code is text, raw HTML is text")
t.ok(ev(tab3, "document.querySelector('#oriel-reader a').href") == "https://example.com/x", "its links")

t.done()

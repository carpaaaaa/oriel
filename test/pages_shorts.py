#!/usr/bin/env python3
"""Hide YouTube Shorts (Settings › Video, youtube.hideShorts; preload/page/sites.ts):
on a YouTube host, the Shorts shelves, the Shorts button, the Shorts chip and
Shorts among results go away as the switch is turned on, and come back as it
is turned off, without reloading; a Shorts page opens as the ordinary video.
A stand-in host plays YouTube (test.youtubeHosts)."""
import sys
import time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b
import settings_c_web as web

server, P = web.start(tls=False)
web.PAGES["/"] = ("<title>home</title><body>"
                  "<ytd-reel-shelf-renderer id='shelf' style='display:block;height:40px'>Shorts shelf</ytd-reel-shelf-renderer>"
                  "<ytd-guide-entry-renderer id='guide' style='display:block;height:30px'><a title='Shorts'>Shorts</a></ytd-guide-entry-renderer>"
                  "<ytd-video-renderer id='result' style='display:block;height:30px'><a href='/shorts/abcdefghijk'>a short</a></ytd-video-renderer>"
                  "<ytd-video-renderer id='video' style='display:block;height:30px'><a href='/watch?v=abcdefghijk'>a video</a></ytd-video-renderer>")
web.PAGES["/shorts/abcdefghijk"] = "<title>short</title><body>a short"
web.PAGES["/watch"] = "<title>watch</title><body>a video"

b.use("pages-shorts")
b.launch(web.rules("yt.example"))
t = b.T()
b.call({"do": "pages.testHosts", "test.youtubeHosts": ["yt.example"]})


def ev(tab, js):
    try:
        return b.ev(tab, js)
    except RuntimeError:
        return None


def setting(value):
    b.cmd("settings.set", id="youtube.hideShorts", value=value)
    time.sleep(1.0)


def go(path, title, tab=None):
    if tab:
        b.cmd("tab.go", id=tab, input=f"http://yt.example:{P}{path}")
    else:
        b.cmd("tab.new", url=f"http://yt.example:{P}{path}")
    b.wait_for(lambda: b.active()["title"] == title, within=30, what=title)
    tab = b.active()["id"]
    b.wait_for(lambda: ev(tab, "new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(1))))") == 1, within=30, what="painted")
    return tab


shown = lambda tab: ev(tab, "['shelf','guide','result','video'].map(i => getComputedStyle(document.getElementById(i)).display !== 'none')")

tab = go("/", "home")
t.ok(shown(tab) == [True, True, True, True], "off (the default): everything on the page shows")
setting(True)
t.ok(shown(tab) == [False, False, False, True], f"on: the shelf, the Shorts button and the short result go, the video stays ({shown(tab)})")
setting(False)
t.ok(shown(tab) == [True, True, True, True], "off again: they come back, no reload")
setting(True)
go("/shorts/abcdefghijk", "watch", tab)
url = next(x for x in b.state()["tabs"] if x["id"] == tab)["url"]
t.ok("/watch?v=abcdefghijk" in url, f"on: a Shorts page opens as the ordinary video ({url})")
setting(False)
t.done()

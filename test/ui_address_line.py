#!/usr/bin/env python3
"""Always show the address bar (Settings › Appearance › Window,
`address.shown`; studio/03 §1.6, studio/01 §4.3, §5.5; AddressLine.swift): a
row as tall as a tab under the column's band (6 under it), or before the tabs
across the top (Small 220, Medium 340, then 8). It shows the page's whole
address, cut in the middle, 12 grey; a tab with nothing in it says what to
type. A click brings ⌘L's field in the row itself, the address in it
selected, its places hanging under the row at its width (not over the page);
Escape, a click elsewhere or Ctrl+L again puts it away; Return goes there in
the same tab; Ctrl+L with the row in sight is that click; with the column
folded away, the field over the page as ever. Off by default.
Pictures: out/address-*.png, light and dark, both layouts."""
import json
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b  # noqa: E402
import ui_kit as k  # noqa: E402

OUT = b.ROOT / "out"
OUT.mkdir(exist_ok=True)
LONG = "/articles/2026/november/how-the-address-line-keeps-the-whole-address-in-sight-and-cuts-it-in-the-middle/index.html"


class Page(BaseHTTPRequestHandler):
    def do_GET(self):
        name = self.path.split("?")[0].strip("/").split("/")[0] or "home"
        body = f"<title>{name}</title><body style='margin:0;height:3000px'>{name}".encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/html")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a):
        pass


srv = ThreadingHTTPServer(("127.0.0.1", 0), Page)
threading.Thread(target=srv.serve_forever, daemon=True).start()
H = f"http://127.0.0.1:{srv.server_port}"

b.use("ui-address-line")
b.launch(*k.FRAMES)
b.cmd("prefs.set", key="fold.fullScreen", value=False)  # these test folding alone, not full screen with it

t = b.T()
time.sleep(1.0)
b.cmd("settings.set", id="look", value="light")
b.wait_for(lambda: b.ui("document.documentElement.dataset.look") == "light", what="light")
for _ in range(3):
    b.call({"do": "data.visit", "url": "https://github.com/", "title": "GitHub"})

TIP = "Type an address or a search   Ctrl+L"
LINE = ".address-line"


def ev(tab, js):
    try:
        return b.ev(tab, js)
    except RuntimeError:
        return None


def open_page(url, title):
    b.cmd("tab.new", url=url)
    b.wait_for(lambda: (b.active() or {}).get("title") == title and not b.active()["loading"], within=30, what=title)
    tab = b.active()["id"]
    b.wait_for(lambda: ev(tab, "new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(1))))") == 1, within=30, what="painted")
    time.sleep(0.3)
    return tab


def field():
    return b.window()["field"]


def input_state():
    v = b.ui("JSON.stringify((i => i && ({ v: i.value, s: i.selectionStart, e: i.selectionEnd, f: document.activeElement === i, fs: getComputedStyle(i).fontSize }))(document.querySelector('.address-line input')))")
    return json.loads(v) if v and v != "null" else None


def views():
    return b.call({"do": "field.views"})


def key(name, *mods, to="ui"):
    b.call({"do": "field.key", "key": name, "modifiers": list(mods), "to": to})


def click(sel):
    r = k.rect(sel)
    b.call({"do": "field.hover", "x": r["x"] + r["w"] / 2, "y": r["y"] + r["h"] / 2, "click": True, "to": "ui"})
    time.sleep(0.4)


def typed(word):
    for ch in word:
        key(ch)
        time.sleep(0.12)
    time.sleep(0.5)


def write(text):
    """The words in the row's input, as typing them leaves it."""
    b.ui(f"(i => {{ i.value = {json.dumps(text)}; i.dispatchEvent(new Event('input', {{ bubbles: true }})); }})(document.querySelector('.address-line input')); true")
    time.sleep(0.5)


def shut():
    """Escape, if the field is up."""
    if field().get("inline") or field()["open"]:
        key("Escape")
        time.sleep(0.4)


# 1. Off, the default: nothing in the column, nothing across the top
t.ok(b.state()["prefs"].get("address.shown") is False, "Always show the address bar: off by default")
t.ok(not b.ui("!!document.querySelector('.address-line')"), "off: no row")

# 2. On, the column: under the band, a tab's height, 6 under it, 10 in each side
b.cmd("prefs.set", key="address.shown", value=True)
b.wait_for(lambda: b.ui("!!document.querySelector('.address-line')"), what="the row")
time.sleep(0.4)
band, line, body = k.wrect(".band"), k.wrect(LINE), k.wrect(".side-body")
t.ok(k.near(line["h"], 28), f"as tall as a tab: {line['h']}")
t.ok(k.near(line["y"], band["y"] + band["h"]) and k.near(body["y"], line["y"] + line["h"] + 6), f"under the band, 6 above what follows: {line['y']} .. {body['y']}")
t.ok(k.near(line["x"], 10) and k.near(line["w"], 232 - 20), f"10 in at each side, the column's room: {line['x']}, {line['w']}")
sty = k.style(LINE, "border-top-left-radius", "background-color", "font-size", "color")
t.ok(sty["border-top-left-radius"] == "9px" and sty["font-size"] == "12px", f"radius 9, 12 high type: {sty}")
t.ok(k.same_colour(sty["background-color"], "rgba(0, 0, 0, 0.0419)"), f"the tab's hover grey on the frame: {sty['background-color']}")
text = b.ui("document.querySelector('.address-line .address-text').textContent")
t.ok(text == "Search or enter address", f"nothing in the tab: what to type ({text})")
t.ok(b.ui("document.querySelector('.address-line').title") == TIP, "its tooltip: the way to type, and the key")
t.ok(k.same_colour(k.style(".address-line .address-text", "color")["color"], "rgba(23, 23, 23, 0.3)"), "…in the placeholder's grey")

# 3. A tab with a page: the whole address, cut in the middle
one = open_page(H + "/one", "one")
text = b.ui("document.querySelector('.address-line .address-text').textContent")
t.ok(text == H + "/one", f"the page's whole address: {text}")
sty = k.style(".address-line .address-text", "color")
t.ok(k.same_colour(sty["color"], "rgb(140, 140, 140)"), f"in the muted grey: {sty['color']}")
two = open_page(H + LONG, "articles")
text = b.ui("document.querySelector('.address-line .address-text').textContent")
fits = b.ui("(e => e.scrollWidth <= e.clientWidth)(document.querySelector('.address-line .address-text'))")
t.ok("…" in text and text.startswith("http://127.0.0.1") and text.endswith("index.html") and fits and abs(len(text.split("…")[0]) - len(text.split("…")[1])) <= 1,
     f"too long: cut in the middle, both ends kept in equal parts, to fit ({text})")
wide = text
cut = text
b.cmd("sidebar.resize", width=420)
time.sleep(0.6)
text = b.ui("document.querySelector('.address-line .address-text').textContent")
t.ok(len(text) > len(wide) and text.startswith("http://127.0.0.1"), f"the column wider, more of it ({len(text)} against {len(wide)})")
b.cmd("sidebar.resize", width=232)
time.sleep(0.6)
b.shot(OUT / "address-column-light.png")

# 4. A click: ⌘L's field in the row, the address selected whole, not over the page
click(LINE)
b.wait_for(lambda: field().get("inline"), what="the field in the row")
b.wait_for(lambda: input_state(), what="its input")
st = input_state()
t.ok(st["v"] == H + LONG and st["s"] == 0 and st["e"] == len(st["v"]) and st["f"], f"the whole address, selected, with the keys ({st['v'][:32]}…)")
t.ok(st["fs"] == "12px", f"12 high, as the row's words: {st['fs']}")
t.ok(field()["open"] and field()["mode"] == "thisTab" and b.window()["overlay"]["kind"] != "field", f"this tab's field, not the one over the page ({b.window()['overlay']['kind']})")
row, inp = k.rect(LINE), k.rect(".address-line input")
t.ok(inp["x"] >= row["x"] and inp["x"] + inp["w"] <= row["x"] + row["w"] + 0.5 and inp["y"] >= row["y"] and inp["y"] + inp["h"] <= row["y"] + row["h"], f"inside the row's edges: {inp} in {row}")
ph = b.ui("(i => [i.placeholder, i.getAttribute('aria-label')])(document.querySelector('.address-line input'))")
t.ok(ph == ["Enter a web address", "Address"], f"cleared, it says what the empty tab's field does ({ph})")
t.ok(not b.ui("!!document.querySelector('.address-line .address-text')") and k.same_colour(k.style(LINE, "background-color")["background-color"], "rgba(0, 0, 0, 0.0628)"), "the live tab's grey while it has the field")

# 5. Typed: its places hang under the row at its width, in the overlay
typed("gi")
st = input_state()
t.ok(st["v"] == "github.com" or st["v"].startswith("gi"), f"typed over the address, with the grey ending: {st['v']!r}")
b.wait_for(lambda: views()["layer"] == "lineOffers", what="the places")
time.sleep(0.4)
v = views()
lst = k.rect(".field-taboffers", root="overlay")
row = k.rect(LINE)
top = v["overlay"]["y"] + lst["y"]
t.ok(abs(top - (v["ui"]["y"] + row["y"] + row["h"] + 4)) <= 1.5, f"4 under the row: {top:.1f} under {row['y'] + row['h']:.1f}")
t.ok(abs(lst["w"] - row["w"]) <= 1 and abs(v["overlay"]["x"] + lst["x"] - (v["ui"]["x"] + row["x"])) <= 1.5, f"as wide as the row, in line with it: {lst['w']:.1f} against {row['w']:.1f}")
n = b.ui("document.querySelectorAll('.field-taboffers .field-row').length", root="overlay")
t.ok(n >= 1, f"with its places ({n})")
t.ok(k.js("return !!document.querySelector('.field-wrap .field-list')") is False, "none hung from the field itself")
b.shot(OUT / "address-editing-light.png")
# Down walks the list (the row says so), Escape lets go of it first, then puts the field away
key("Down")
time.sleep(0.3)
t.ok(field()["selected"] == 0, "Down walks the list")
key("Escape")
time.sleep(0.3)
t.ok(field()["selected"] == -1 and field()["open"], "Escape lets go of the row first")
key("Escape")
b.wait_for(lambda: not field()["open"], what="put away")
time.sleep(0.4)
t.ok(not field()["inline"] and views()["layer"] == "none" and not b.ui("!!document.querySelector('.address-line input')"), "Escape: the field put away, the row as it was, the list gone")
t.ok(b.ui("document.querySelector('.address-line .address-text').textContent") == cut and b.active()["id"] == two, "the address as it was, the same tab")

# 6. A click elsewhere puts it away as Escape does
click(LINE)
b.wait_for(lambda: field().get("inline"), what="the field again")
typed("gi")
b.wait_for(lambda: views()["layer"] == "lineOffers", what="the places")
void = k.rect(".void")
b.call({"do": "field.hover", "x": void["x"] + 20, "y": void["y"] + 60, "click": True, "to": "ui"})
b.wait_for(lambda: not field()["open"], what="put away by a click")
time.sleep(0.4)
t.ok(views()["layer"] == "none" and not input_state(), "a click in the column: put away, its places gone")

# the field let go of the keys (a click on the page, which takes them): the same
click(LINE)
b.wait_for(lambda: field().get("inline"), what="the field once more")
b.wait_for(lambda: (input_state() or {}).get("f"), what="the keys in the row")
b.cmd("window.focusPage")
b.wait_for(lambda: not field()["open"], within=5, what="put away by the keys going")
t.ok(not field()["inline"], "the keys gone to the page: put away")

# 7. Return goes there in the same tab, the page given the keys
click(LINE)
b.wait_for(lambda: field().get("inline"), what="the field for Return")
write(f"127.0.0.1:{srv.server_port}/two")
key("Return")
b.wait_for(lambda: b.active()["url"] == H + "/two", what="gone to /two")
t.ok(b.active()["id"] == two and not field()["open"] and views()["layer"] == "none", "Return goes there in the same tab, the field and its list gone")
b.wait_for(lambda: b.active()["title"] == "two" and not b.active()["loading"], what="loaded")
t.ok(b.ui("document.querySelector('.address-line .address-text').textContent") == H + "/two", "the row says where it went")
# nowhere to go: refused, the field stays
click(LINE)
b.wait_for(lambda: field().get("inline"), what="the field to be refused in")
write("")
key("Return")
time.sleep(0.4)
t.ok(field()["open"] and field()["refused"] >= 1 and field().get("inline"), "words that go nowhere are refused as ever, the field stays")
shut()

# 8. Ctrl+L with the row in sight is that click; again, it is put away
b.cmd("window.focusPage")
time.sleep(0.4)
key("l", "control", to="page")
b.wait_for(lambda: field().get("inline"), what="Ctrl+L")
b.wait_for(lambda: input_state(), what="its input")
st = input_state()
t.ok(st["v"] == H + "/two" and st["s"] == 0 and st["e"] == len(st["v"]) and st["f"], f"Ctrl+L: the row's field, the address selected ({st['v']})")
t.ok(b.window()["overlay"]["kind"] != "field", "…not the field over the page")
key("l", "control")
b.wait_for(lambda: not field()["open"], what="Ctrl+L again")
t.ok(not field()["inline"], "Ctrl+L again puts it away")

# another tab in front ends it
click(LINE)
b.wait_for(lambda: field().get("inline"), what="the field for a tab change")
b.cmd("tab.select", id=one)
b.wait_for(lambda: not field()["open"], what="put away by another tab")
t.ok(not field()["inline"] and views()["layer"] == "none", "another tab in front: put away")
b.cmd("tab.select", id=two)
time.sleep(0.4)

# 9. The column folded away: no row, Ctrl+L brings the field over the page
b.cmd("sidebar.fold", folded=True)
b.wait_for(lambda: not b.ui("!!document.querySelector('.address-line')"), what="folded")
b.cmd("window.focusPage")
time.sleep(0.4)
key("l", "control", to="page")
b.wait_for(lambda: field()["open"], what="Ctrl+L with no row")
b.wait_for(lambda: views()["layer"] == "field", what="over the page")
t.ok(not field().get("inline"), "no row in sight: Ctrl+L's field over the page, as ever")
key("Escape", to="overlay")
b.wait_for(lambda: not field()["open"], what="put away")
b.cmd("sidebar.fold", folded=False)
b.wait_for(lambda: b.ui("!!document.querySelector('.address-line')"), what="unfolded")
time.sleep(1.0)  # the column slides back in
# folded with the field up in the row: it goes with the row
click(LINE)
b.wait_for(lambda: field().get("inline"), what="the field before folding")
b.cmd("sidebar.fold", folded=True)
b.wait_for(lambda: not field()["open"], what="put away by folding")
t.ok(not field().get("inline"), "the column folded with the field in the row: the field goes with it")
b.cmd("sidebar.fold", folded=False)
b.wait_for(lambda: b.ui("!!document.querySelector('.address-line')"), what="unfolded")
time.sleep(1.0)

# 10. An empty tab: the row says what to type, a click gives the keys to the tab's own field
b.cmd("tab.blank")
b.wait_for(lambda: b.active()["empty"], what="a blank tab")
time.sleep(0.4)
t.ok(b.ui("document.querySelector('.address-line .address-text').textContent") == "Search or enter address", "a blank tab: what to type")
click(LINE)
time.sleep(0.5)
t.ok(not field().get("inline") and b.ui("!!document.querySelector('.empty-page .field input') && document.activeElement === document.querySelector('.empty-page .field input')"),
     "a click on the row: the empty tab's own field has the keys")
b.cmd("tab.close", id=b.active()["id"])
b.wait_for(lambda: not b.active()["empty"], what="back to a page")
time.sleep(0.4)

# 11. Roomier tabs: the row as tall as they are
b.cmd("prefs.set", key="tabs.roomier", value=True)
time.sleep(0.5)
t.ok(k.near(k.wrect(LINE)["h"], 36), f"with roomier tabs, 36: {k.wrect(LINE)['h']}")
b.cmd("prefs.set", key="tabs.roomier", value=False)
time.sleep(0.4)

# 12. Dark
b.cmd("settings.set", id="look", value="dark")
b.wait_for(lambda: b.ui("document.documentElement.dataset.look") == "dark", what="dark")
time.sleep(0.5)
b.call({"do": "field.hover", "x": 600, "y": 500, "to": "ui"})
time.sleep(0.4)
t.ok(k.same_colour(k.style(LINE, "background-color")["background-color"], "rgba(255, 255, 255, 0.0595)"), f"dark: the tab's hover grey: {k.style(LINE, 'background-color')['background-color']}")
b.shot(OUT / "address-column-dark.png")
click(LINE)
b.wait_for(lambda: field().get("inline"), what="field, dark")
typed("gi")
b.wait_for(lambda: views()["layer"] == "lineOffers", what="places, dark")
time.sleep(0.4)
b.shot(OUT / "address-editing-dark.png")
shut()
b.cmd("settings.set", id="look", value="light")
b.wait_for(lambda: b.ui("document.documentElement.dataset.look") == "light", what="light")

# 13. Tabs across the top: before the tabs, Small 220, then 8
b.cmd("settings.set", id="tabs.layout", value="top")
b.wait_for(lambda: b.ui("!!document.querySelector('.strip-band > .address-line')"), what="the row across the top")
time.sleep(0.8)
line, row0 = k.wrect(LINE), k.wrect(".strip-row")
tabs = k.js("return [...document.querySelectorAll('.strip-tab')].map(e => e.getBoundingClientRect().width)")
t.ok(k.near(line["w"], 220) and k.near(line["h"], 28), f"Small: 220 wide, a tab high: {line['w']} × {line['h']}")
first = k.wrect(".strip-row")
t.ok(k.near(first["x"], line["x"] + line["w"] + 8 + 2), f"the tabs 8 after it and the band's 2: {first['x']} after {line['x'] + line['w']}")
near = k.wrect(".strip-near")
t.ok(near and k.near(line["x"], near["x"] + near["w"] + 2), f"after back, forward and reload: {line['x']} after {near and near['x'] + near['w']}")
text = b.ui("document.querySelector('.address-line .address-text').textContent")
t.ok(text.startswith("http://127.0.0.1") and b.ui("(e => e.scrollWidth <= e.clientWidth)(document.querySelector('.address-line .address-text'))"), f"the address cut to fit 220: {text}")
t.ok(k.js("return getComputedStyle(document.querySelector('.strip-band > .address-line')).marginRight") == "8px", "8 after it")
b.shot(OUT / "address-strip-light.png")
b.cmd("prefs.set", key="address.width", value="medium")
time.sleep(0.6)
line2 = k.wrect(LINE)
tabs2 = k.js("return [...document.querySelectorAll('.strip-tab')].map(e => e.getBoundingClientRect().width)")
t.ok(k.near(line2["w"], 340), f"Medium: 340 wide: {line2['w']}")
b.cmd("prefs.set", key="address.width", value="small")
time.sleep(0.6)

# its field across the top: the same field, its places under the row at its width
click(LINE)
b.wait_for(lambda: field().get("inline"), what="the field across the top")
st = input_state()
t.ok(st and st["v"] == H + "/two" and st["s"] == 0 and st["e"] == len(st["v"]) and st["f"] and st["fs"] == "12px", f"the address selected, 12 high ({st})")
typed("gi")
b.wait_for(lambda: views()["layer"] == "lineOffers", what="the places across the top")
time.sleep(0.4)
v = views()
lst = k.rect(".field-taboffers", root="overlay")
row = k.rect(LINE)
t.ok(abs(v["overlay"]["y"] + lst["y"] - (v["ui"]["y"] + row["y"] + row["h"] + 4)) <= 1.5 and abs(lst["w"] - 220) <= 1, f"under the row, 4 down, 220 wide ({lst['w']:.1f})")
t.ok(v["overlay"]["y"] >= row["y"] + row["h"] - 8, "over the page, under the strip")
b.shot(OUT / "address-strip-editing-light.png")
# a click on a tab elsewhere puts it away; the strip's tabs don't take the address
click(".strip-tab:not(.live)")
b.wait_for(lambda: not field()["open"], what="put away across the top")
t.ok(not field().get("inline") and views()["layer"] == "none", "a click on another tab: put away")
b.cmd("tab.select", id=two)
time.sleep(0.6)
click(".strip-tab.live")
b.wait_for(lambda: b.window().get("tabEdit"), what="its own address in the tab")
t.ok(not field().get("inline"), "the tab you're on still edits its own address in place, as before")
key("Escape")
time.sleep(0.4)

# Ctrl+L across the top
b.cmd("window.focusPage")
time.sleep(0.3)
key("l", "control", to="page")
b.wait_for(lambda: field().get("inline"), what="Ctrl+L across the top")
t.ok(input_state() is not None, "Ctrl+L across the top: the row's field")
shut()

# the tabs make room for it
b.cmd("prefs.set", key="address.shown", value=False)
time.sleep(0.8)
t.ok(not b.ui("!!document.querySelector('.address-line')"), "turned off: the row goes")
b.cmd("prefs.set", key="address.shown", value=True)
time.sleep(0.8)

# a window state laid on the strip: with room, the tabs 186; the row takes its share of the room from them
s = k.fixture("top")
few = {**s, "tabs": [x for x in s["tabs"] if x.get("pinID")] + [x for x in s["tabs"] if not x.get("pinID") and not x.get("groupID")][:2], "groups": []}
few["activeID"] = few["tabs"][-1]["id"]
few["prefs"] = {**few.get("prefs", {}), "address.shown": True, "address.width": "small"}
k.fake(few, look="light")
time.sleep(0.8)
w = k.js("return [...document.querySelectorAll('.strip-tab')].map(e => e.getBoundingClientRect().width)")
t.ok(w and all(k.near(x, 186) for x in w), f"with room, the tabs 186 beside the row: {w}")
FIT = ("const r = document.querySelector('.strip-row'); const f = rel(document.querySelector('.strip-far').getBoundingClientRect()); const c = document.querySelector('.window > .caption-buttons');"
       " return [r.scrollWidth - r.clientWidth, f.right, c ? rel(c.getBoundingClientRect()).x : W0.width, document.querySelector('.strip-tab').getBoundingClientRect().width]")
# Tabs are added one at a time until they shrink (a narrow window needs fewer than a wide one).
for extra in range(0, 9):
    crowd = {**s, "tabs": s["tabs"] + [{**s["tabs"][-1], "id": f"y{i}", "label": f"Tab {i}", "title": f"Tab {i}", "url": f"https://example{i}.com/"} for i in range(extra)]}
    crowd["prefs"] = {**crowd.get("prefs", {}), "address.shown": True, "address.width": "medium"}
    k.fake(crowd, look="light")
    time.sleep(0.8)
    fit = k.js(FIT)
    if fit[3] < 186:
        break
t.ok(fit[0] <= 0 and fit[1] <= fit[2] + 0.5 and fit[3] < 186, f"crowded with Medium ({extra} more tabs): the tabs shrink to fit beside the row, nothing hidden, the far end before the window's buttons: {fit}")
k.thaw()

# 14. The column of icons has no room for it: no row, and Ctrl+L's field over the page
b.cmd("settings.set", id="tabs.layout", value="icons")
b.wait_for(lambda: not b.ui("!!document.querySelector('.address-line')") and b.ui("!!document.querySelector('.sidebar.icons')"), what="the column of icons")
b.cmd("window.focusPage")
time.sleep(0.4)
key("l", "control", to="page")
b.wait_for(lambda: views()["layer"] == "field", what="Ctrl+L, icons")
t.ok(not field().get("inline"), "the column of icons: no row, Ctrl+L's field over the page")
key("Escape", to="overlay")
b.wait_for(lambda: not field()["open"], what="put away")
b.cmd("settings.set", id="tabs.layout", value="left")
b.wait_for(lambda: b.ui("!!document.querySelector('.address-line')"), what="titles again")
t.ok(True, "titles in the column again: the row")

t.done()

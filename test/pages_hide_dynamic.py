#!/usr/bin/env python3
"""Hide Elements names exactly what was picked (Search 1.0.21), keeps it
hidden on pages that build their content after they load (Search 1.0.22),
and takes every element like the one pointed at with Alt (Search 1.0.22):
the Mac's Tests/hide_elements.py (one, many), hide_elements_dynamic.py and
hide_elements_popup.py, in a world of its own.

The pages, all on one site, the grocery ones built 200 ms after load:
  one, many  a promo and a dialog picked on one; on many, more like them
  drive      products beside a cart; next visit the cart is built first
  shuffle    the same products in another order, and one more
  gone       the product picked isn't there on the next visit
  near       next visit, a product of almost the same name in its place
  ids        cards that carry their own product id
  promos     Alt-click: every card like it goes, and new ones next visit
  legacy     a rule saved before (a selector alone), still worn
  same       the site open in two tabs and a small window: a pick goes from all at once

    npm run build && python test/pages_hide_dynamic.py
"""
import json
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b  # noqa: E402

WORLD = "pages-hide-dynamic"
FRAMES = ["--disable-gpu-vsync", "--disable-frame-rate-limit", "--disable-backgrounding-occluded-windows"]

PRODUCTS = ["Lait demi-écrémé Lactel 1L", "Beurre doux Président 250g", "Pâtes Barilla 500g",
            "Café moulu Carte Noire 250g", "Yaourt nature x8"]
CART = ["Pommes Golden 1kg", "Jus d'orange 1L", "Riz basmati 1kg", "Œufs x12",
        "Farine T55 1kg", "Sucre 1kg", "Thé vert x20"]


def card(name, price, button, pid=None, kind="card"):
    data = f" data-product-id='{pid}'" if pid else ""
    return (f"<div class='{kind}'{data} style='padding:14px;margin:6px;width:220px;height:90px;background:#eee;box-sizing:content-box'>"
            f"<h3 style='margin:0 0 8px'>{name}</h3><span>{price} €</span> <button>{button}</button></div>")


def grid(order, ids=False):
    return "<div class=grid style='display:flex;flex-wrap:wrap'>" + "".join(
        card(PRODUCTS[i], f"{i + 1},05", "Ajouter", 9000 + i if ids else None) for i in order) + "</div>"


def cart():
    return "<div class=cart style='display:flex;flex-wrap:wrap'>" + "".join(card(n, f"{i + 2},30", "Retirer") for i, n in enumerate(CART)) + "</div>"


# What #app is built from, by page and by visit (the first, then any later).
LAYOUTS = {
    "drive": (lambda: grid([0, 1, 2, 3]) + cart(), lambda: cart() + grid([0, 1, 2, 3])),
    "shuffle": (lambda: grid([0, 1, 2, 3]), lambda: grid([4, 3, 0, 1, 2])),
    "gone": (lambda: grid([0, 1, 2, 3]), lambda: grid([0, 1, 3, 4])),
    "near": (lambda: grid([0, 1, 2, 3]),
             lambda: grid([0, 1, 2, 3]).replace(PRODUCTS[2], "Pâtes Panzani 500g").replace("3,05", "2,15")),
    "promos": (lambda: "<div class=grid style='display:flex;flex-wrap:wrap'>" + "".join(
                   card(n, "1,00", "Ajouter", kind="card promo" if i % 2 else "card") for i, n in enumerate(PRODUCTS))
               + "<p id=plain style='height:30px'>Livraison offerte</p></div>",
               lambda: "<div class=grid style='display:flex;flex-wrap:wrap'>" + "".join(
                   card(n, "1,00", "Ajouter", kind="card promo" if i % 2 == 0 else "card") for i, n in enumerate(PRODUCTS))
               + "</div>"),
    "ids": (lambda: grid([0, 1, 2, 3], ids=True), lambda: cart() + grid([3, 2, 1, 0], ids=True)),
}
visits = {}

STATIC = {
    # One of a kind on the first visit, one of several on the next (idea 1133).
    "one": "<div id=feed><div class=promo style='height:40px'>Ad A</div><p>post</p></div>"
           "<div role=dialog style='height:40px'>Sign up</div>",
    "many": "<div id=feed><div class=promo style='height:40px'>Ad A</div><p>post</p>"
            "<div class=promo>Ad B</div><div class=promo>Ad C</div></div>"
            "<div role=dialog style='height:40px'>Sign up</div><div role=dialog>Other</div>",
    "legacy": "<div id=legacy style='height:40px'>Old rule</div><div class=promo>Kept</div>",
    "same": "<div id=banner style='height:120px;background:#fc0'>Sale banner</div><p id=keep>words</p>",
}


def built(name):
    first, later = LAYOUTS[name]
    n = visits.get(name, 0)
    visits[name] = n + 1
    html = (first if n == 0 else later)()
    return ("<div id=app><p>Chargement…</p></div><script>setTimeout(function () {"
            f"document.getElementById('app').innerHTML = {json.dumps(html)}; }}, 200)</script>")


class Site(BaseHTTPRequestHandler):
    def do_GET(self):
        name = self.path.split("?")[0].strip("/")
        html = built(name) if name in LAYOUTS else STATIC.get(name, "<p>nothing")
        body = f"<!doctype html><meta charset=utf-8><title>{name}</title><body style='margin:0'>{html}".encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a):
        pass


srv = ThreadingHTTPServer(("127.0.0.1", 0), Site)
threading.Thread(target=srv.serve_forever, daemon=True).start()
BASE = f"http://127.0.0.1:{srv.server_port}"
t = b.T()


# helpers (as test/pages_hide.py's)

def hstate():
    return b.call({"do": "hide.state"})


def said():
    s = hstate()["said"]
    return s[-1] if s else None


def pointing():
    return bool(hstate()["pointing"])


def inpage(tab, js):
    return b.call({"do": "hide.page", "id": tab, "js": js}).get("value")


def ev(tab, js):
    try:
        return b.ev(tab, js)
    except RuntimeError:
        return None


def tab_rec(id):
    return next((x for x in b.state()["tabs"] if x["id"] == id), None)


def painted(tab):
    b.wait_for(lambda: ev(tab, "new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(1))))") == 1,
               within=30, what="painted")
    time.sleep(0.3)


def open_tab(name, base=BASE):
    id = b.cmd("tab.open", url=f"{base}/{name}", foreground=True)
    b.wait_for(lambda: (x := tab_rec(id)) and not x["loading"] and x["title"] == name, within=30, what=name)
    painted(id)
    if name in LAYOUTS:
        b.wait_for(lambda: ev(id, "document.querySelectorAll('.card').length") or 0, within=10, what="the cards built")
        time.sleep(0.3)
    return id


def reload(tab, name):
    ev(tab, "location.reload()")
    time.sleep(0.3)
    b.wait_for(lambda: (x := tab_rec(tab)) and not x["loading"], within=20, what="reloaded")
    painted(tab)
    if name in LAYOUTS:
        b.wait_for(lambda: ev(tab, "document.querySelectorAll('.card').length") or 0, within=10, what="the cards built")
    time.sleep(0.4)


def send(tab, *events):
    b.call({"do": "pages.input", "id": tab, "events": list(events)})


def key(tab, code, *mods):
    send(tab, {"type": "keyDown", "keyCode": code, "modifiers": list(mods)},
         {"type": "keyUp", "keyCode": code, "modifiers": list(mods)})
    time.sleep(0.35)


AT = {}


def move_to(tab, x, y):
    AT[tab] = (round(x), round(y))
    send(tab, {"type": "mouseMove", "x": AT[tab][0], "y": AT[tab][1]})
    time.sleep(0.25)


def move(tab, sel):
    """The pointer coming to rest over `sel`, on its corner if it is a box
    (where none of its children are), at its middle otherwise."""
    js = (f"(() => {{ const e = document.querySelector({json.dumps(sel)}); if (!e) return null; e.scrollIntoView({{block: 'center'}});"
          " return JSON.stringify(e.getBoundingClientRect()) })()")
    got = b.wait_for(lambda: ev(tab, js), within=5, what=f"{sel} on the page ({ev(tab, 'location.href')})")
    r = json.loads(got)
    time.sleep(0.2)
    corner = r["height"] > 30
    move_to(tab, r["right"] - 4 if corner else r["left"] + r["width"] / 2, r["bottom"] - 4 if corner else r["top"] + r["height"] / 2)


def card_sel(title):
    return f"[data-probe-card={json.dumps(title, ensure_ascii=False)}]"


def tag_cards(tab):
    """A name the test can find each card by, in the page's own world."""
    ev(tab, "document.querySelectorAll('.card').forEach(c => c.setAttribute('data-probe-card', c.querySelector('h3').textContent)); 1")


def press(tab, *mods):
    x, y = AT[tab]
    send(tab, {"type": "mouseDown", "x": x, "y": y, "button": "left", "clickCount": 1, "modifiers": list(mods)},
         {"type": "mouseUp", "x": x, "y": y, "button": "left", "clickCount": 1, "modifiers": list(mods)})
    time.sleep(0.8)


def start(tab):
    key(tab, "H", "control", "shift")
    b.wait_for(pointing, within=5, what="pointing")


def stop(tab):
    key(tab, "Escape")
    b.wait_for(lambda: not pointing(), within=5, what="pointing stopped")


def pick(tab, sel):
    start(tab)
    move(tab, sel)
    press(tab)
    stop(tab)


def kept(host="127.0.0.1"):
    """hidden.json as written (0.4 s after the last change)."""
    time.sleep(0.7)
    try:
        return json.loads((b.folder() / "hidden.json").read_text(encoding="utf-8")).get(host, [])
    except (OSError, ValueError):
        return []


GONE = ("[...document.querySelectorAll('.card')].filter(e => getComputedStyle(e).display === 'none')"
        ".map(e => e.querySelector('h3').textContent).join('|')")


def overlay():
    return b.state()["windows"][0]["overlay"]


def ojs(expr):
    v = b.ui(f"JSON.stringify((() => {{ {expr} }})())", root="overlay")
    return json.loads(v) if v else None


def restore_all(tab):
    b.cmd("tab.select", id=tab)
    time.sleep(0.2)
    b.cmd("hide.restoreAll")
    time.sleep(0.5)


# the cases

def case_one_of_many():
    print("- what was picked is that one thing: on a later visit with more like it, only it goes (1.0.21)")
    tab = open_tab("one")
    pick(tab, "#feed > .promo")
    pick(tab, "[role=dialog]")
    names = [v["selector"] for v in kept()]
    t.ok(len(names) == 2 and all(ev(tab, f"document.querySelectorAll({json.dumps(n)}).length") == 1 for n in names),
         f"each selector names one element now ({names})")
    t.ok(not any(n in (".promo", "div.promo", "[role=dialog]", "div[role=\"dialog\"]") for n in names),
         "no class or role on its own, which would name every one like it")
    b.cmd("tab.go", id=tab, input=BASE + "/many")
    b.wait_for(lambda: (x := tab_rec(tab)) and not x["loading"] and x["title"] == "many", within=20, what="many")
    painted(tab)
    gone = ev(tab, "[...document.querySelectorAll('#feed > *, [role=dialog]')].filter(e => getComputedStyle(e).display === 'none')"
                   ".map(e => e.textContent.trim()).join('|')")
    t.ok(gone == "Ad A|Sign up", f"on the next visit, only those two go ({gone})")
    restore_all(tab)


def built_later(name, title, expect):
    tab = open_tab(name)
    tag_cards(tab)
    pick(tab, card_sel(title))
    t.ok(ev(tab, GONE) == title, f"{name}: gone at once ({ev(tab, GONE)!r})")
    t.ok((said() or "").startswith("Hidden"), f"{name}: said so ({said()!r})")
    veil = (kept() or [{}])[0]
    t.ok(bool(veil.get("print")) and veil["print"].startswith("div\n"), f"{name}: kept with what it was ({veil.get('selector')!r})")
    reload(tab, name)
    t.ok(ev(tab, GONE) == expect, f"{name}: next visit, {expect or 'nothing'} hidden and nothing else ({ev(tab, GONE)!r})")
    if name == "drive":
        # Resting on its row brings back what was hidden, not what now sits at its place.
        tag_cards(tab)
        key(tab, "U", "control", "shift")
        b.wait_for(lambda: overlay().get("name") == "hide.list", within=5, what="the list")
        ojs("const r = document.querySelector('.hide-row'); r.dispatchEvent(new PointerEvent('pointerenter')); return 1")
        time.sleep(0.6)
        shown = ev(tab, f"getComputedStyle(document.querySelector({json.dumps(card_sel(title))})).display")
        ring = ev(tab, "[...document.querySelectorAll('.card')].filter(e => getComputedStyle(e).outlineStyle === 'solid').map(e => e.querySelector('h3').textContent).join('|')")
        t.ok(shown == "block" and ring == title, f"drive: resting on its row shows that product, outlined ({shown}, {ring!r})")
        ojs("document.querySelector('.hide-plate').dispatchEvent(new PointerEvent('pointerleave')); return 1")
        time.sleep(0.5)
        t.ok(ev(tab, GONE) == title, "drive: leaving the card hides it again")
        key(tab, "Escape")
    reload(tab, name)
    t.ok(ev(tab, GONE) == expect, f"{name}: and the visit after ({ev(tab, GONE)!r})")
    restore_all(tab)


def case_built_later():
    print("- a product picked on a page built after load, then the page built otherwise (1.0.22)")
    built_later("drive", PRODUCTS[2], PRODUCTS[2])     # the cart now comes first
    built_later("shuffle", PRODUCTS[2], PRODUCTS[2])   # the grid in another order
    built_later("gone", PRODUCTS[2], "")               # not there at all
    built_later("near", PRODUCTS[2], "")               # another product where it was
    built_later("ids", PRODUCTS[2], PRODUCTS[2])       # cards that carry an id


def case_all_like_it():
    print("- Alt-click: every card like the one picked, counted first, and new ones on later visits (1.0.22)")
    tab = open_tab("promos")
    tag_cards(tab)
    start(tab)
    move(tab, card_sel(PRODUCTS[1]))
    plain = (inpage(tab, "globalThis.__orielHide.outlined()") or {}).get("says", "")
    send(tab, {"type": "keyDown", "keyCode": "Alt", "modifiers": ["alt"]})
    time.sleep(0.3)
    says = (inpage(tab, "globalThis.__orielHide.outlined()") or {}).get("says", "")
    t.ok("like it" not in plain and says.endswith("all 2 like it"), f"with Alt the outline says how many ({plain!r} then {says!r})")
    press(tab, "alt")
    send(tab, {"type": "keyUp", "keyCode": "Alt", "modifiers": []})
    stop(tab)
    t.ok(ev(tab, GONE) == f"{PRODUCTS[1]}|{PRODUCTS[3]}", f"every promo goes, and only those ({ev(tab, GONE)!r})")
    t.ok((said() or "").startswith("Hidden"), f"said so ({said()!r})")
    lines = kept()
    t.ok([v["selector"] for v in lines] == ["div.card.promo"] and not lines[0].get("print"), f"one line in the list, a pattern ({lines})")
    label = lines[0]["label"] if lines else ""
    t.ok(label.startswith(f"All like “{PRODUCTS[1][:10]}") and label.endswith("” (2)"), f"named for what it takes ({label!r})")
    reload(tab, "promos")
    t.ok(ev(tab, GONE) == f"{PRODUCTS[0]}|{PRODUCTS[2]}|{PRODUCTS[4]}", f"next visit, the new promos go too ({ev(tab, GONE)!r})")
    # A plain click still hides just the one.
    reload(tab, "promos")
    tag_cards(tab)
    pick(tab, card_sel(PRODUCTS[1]))
    t.ok(set(ev(tab, GONE).split("|")) == {PRODUCTS[0], PRODUCTS[1], PRODUCTS[2], PRODUCTS[4]},
         f"a plain click on a card that isn't a promo takes that one only ({ev(tab, GONE)!r})")
    t.ok(len(kept()) == 2, "one more line")
    # Nothing else like it: said, and nothing hidden or kept.
    start(tab)
    move(tab, ".grid")
    press(tab, "alt")
    stop(tab)
    t.ok(any("nothing else here looks like it" in s for s in hstate()["said"][-3:]), f"Alt on a thing with nothing like it: said ({hstate()['said'][-3:]})")
    t.ok(len(kept()) == 2, "and nothing more kept")
    # Put back like any other.
    key(tab, "U", "control", "shift")
    b.wait_for(lambda: overlay().get("name") == "hide.list", within=5, what="the list")
    ojs("const r = document.querySelector('.hide-row[data-selector=\"div.card.promo\"]'); r.dispatchEvent(new PointerEvent('pointerenter'));"
        " r.querySelector('.st-quick').click(); return 1")
    time.sleep(0.7)
    t.ok(ev(tab, GONE) == PRODUCTS[1], f"Restore puts every one of them back ({ev(tab, GONE)!r})")
    key(tab, "Escape")
    restore_all(tab)


def case_legacy():
    print("- a rule saved before (a selector alone) is still worn")
    tab = open_tab("legacy", base=f"http://localhost:{srv.server_port}")
    t.ok(ev(tab, "getComputedStyle(document.getElementById('legacy')).display") == "none", "the old rule hides its element")
    t.ok(ev(tab, "getComputedStyle(document.querySelector('.promo')).display") == "block", "and nothing else")


def case_every_page():
    print("- taken off a site, it goes at once from every page of it open, a small window's too (1.0.21)")
    a = open_tab("same")
    bb = open_tab("same")
    little = open_tab("same")
    b.cmd("tab.little", id=little)
    lw = b.wait_for(lambda: (b.call({"do": "settingsb.littles"})["littles"] or [None])[0], within=10, what="the small window")
    lev = lambda js: b.call({"do": "settingsb.littleEval", "id": lw["id"], "js": js})["value"]
    b.wait_for(lambda: lev("document.readyState === 'complete' && !!document.getElementById('banner')"), within=20, what="the small window's page")
    b.cmd("tab.select", id=a)
    time.sleep(0.3)
    pick(a, "#banner")
    t.ok(ev(a, "getComputedStyle(document.getElementById('banner')).display") == "none", "gone where it was picked")
    t.ok(ev(bb, "getComputedStyle(document.getElementById('banner')).display") == "none", "gone from the site's other tab, without a reload")
    t.ok(lev("getComputedStyle(document.getElementById('banner')).display") == "none", "gone from the small window's page too")
    start(a)
    key(a, "Z", "control")
    stop(a)
    t.ok(ev(bb, "getComputedStyle(document.getElementById('banner')).display") == "block"
         and lev("getComputedStyle(document.getElementById('banner')).display") == "block", "put back, it comes back everywhere at once")


def main():
    b.use(WORLD)
    # A rule saved by Oriel 0.1.33 and before: a selector alone (localhost, a site of its own).
    b.folder().mkdir(parents=True, exist_ok=True)
    (b.folder() / "hidden.json").write_text(json.dumps({"localhost": [{"selector": "#legacy", "label": "Old", "date": 0}]}), encoding="utf-8")
    b.launch(*FRAMES)
    time.sleep(0.8)
    try:
        case_legacy()
        case_one_of_many()
        case_built_later()
        case_all_like_it()
        case_every_page()
    except Exception as error:
        import traceback
        traceback.print_exc()
        t.ok(False, f"ran to the end ({error})")
    t.done()


if __name__ == "__main__":
    main()

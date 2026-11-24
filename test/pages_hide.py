#!/usr/bin/env python3
"""Hide Elements (studio/01 §10.38-§10.41; Curtain.swift, Hidden.swift, the
Mac's Tests/hide_elements.py and hide_elements_csp.py), in a hidden world.

Ctrl+Shift+H points at the page: the pointer's moves, presses and ↑ ↓ are
real input sent to the page (bench pages.input), so the picker hears what a
hand gives it. A click takes the thing off, and "Hidden" is said only once
the page shows it gone; Ctrl+Z puts the last one back; Esc stops; a reload
ends the pointing. What is taken off is kept by site in hidden.json and worn
again after Oriel restarts, before the page's first frame. A page's own
!important (a more particular rule, or its style attribute) and a security
policy that refuses styles don't keep anything on screen. The page menu's
Hide Element takes off what the right click was on. Ctrl+Shift+U lists what
is hidden on the site: resting on a row shows it, Restore and Restore all
put things back. A private tab writes nothing down.

    npm run build && python3 test/pages_hide.py
"""
import json
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b  # noqa: E402

WORLD = "pages-hide"
# A test window covered by others on the Mac is "occluded": Chromium would
# drop its pages' input.
FRAMES = ["--disable-gpu-vsync", "--disable-frame-rate-limit", "--disable-backgrounding-occluded-windows"]

# The page's own listeners: a press that reaches the page is counted.
COUNT = ("<script>window.pressed = 0; for (const k of ['pointerdown', 'mousedown', 'click'])"
         " addEventListener(k, () => pressed++, true)</script>")


def banner(name, style=""):
    return (f"<div id=banner-{name} class=cookie-banner style='position:fixed;left:0;right:0;bottom:0;"
            f"height:120px;background:#fc0;{style}'><p id=words-{name} style='margin:20px'>We use cookies</p>"
            f"<button>OK</button></div>")


PAGES = {
    "/plain": ({}, COUNT + "<p id=intro>A page with a banner</p>" + banner("plain")
               # Read while the page is parsed, before its first frame.
               + "<script>window.early = getComputedStyle(document.getElementById('banner-plain')).display</script>"),
    "/outranked": ({}, "<style>#page #wrap div#banner-outranked.cookie-banner { display: block !important }</style>"
                   "<div id=page><div id=wrap>" + banner("outranked") + "</div></div>"),
    "/inline": ({}, banner("inline", "display: block !important")),
    "/csp": ({"Content-Security-Policy": "style-src 'self'"},
             "<style>#probe { color: rgb(255, 0, 0) }</style><p id=probe>probe</p>" + banner("csp")),
    "/csp-nonce": ({"Content-Security-Policy": "style-src 'nonce-abc'"},
                   "<style nonce=abc>p { color: rgb(51, 51, 51) }</style>" + banner("nonce")),
    "/menu": ({}, "<p id=para style='margin:20px'>Words to keep</p>"
              "<div id=ad aria-label=Sponsored style='margin:20px;width:300px;height:200px;background:#ccc'>AD</div>"
              "<textarea id=box style='margin:20px'></textarea>"),
    "/shy": ({}, "<div id=promo style='margin:20px;width:300px;height:100px;background:#9cf'>Promo</div>"),
    "/left": ({}, COUNT + banner("left")),
    "/elsewhere": ({}, "<p>elsewhere"),
}


class Site(BaseHTTPRequestHandler):
    def do_GET(self):
        path = self.path.split("?")[0]
        headers, html = PAGES.get(path, ({}, "<p>nothing"))
        body = f"<!doctype html><meta charset=utf-8><title>{path.strip('/')}</title><body style='margin:0'>{html}".encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        for k, v in headers.items():
            self.send_header(k, v)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a):
        pass


srv = ThreadingHTTPServer(("127.0.0.1", 0), Site)
threading.Thread(target=srv.serve_forever, daemon=True).start()
BASE = f"http://127.0.0.1:{srv.server_port}"
t = b.T()


# helpers

def hstate():
    return b.call({"do": "hide.state"})


def said():
    s = hstate()["said"]
    return s[-1] if s else None


def pointing():
    return bool(hstate()["pointing"])


def inpage(tab, js):
    """In the picker's own world (the preload's), not the page's."""
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


def open_tab(path):
    id = b.cmd("tab.open", url=BASE + path, foreground=True)
    b.wait_for(lambda: (x := tab_rec(id)) and not x["loading"] and x["title"] == path.strip("/"), within=30, what=path)
    painted(id)
    return id


def send(tab, *events):
    b.call({"do": "pages.input", "id": tab, "events": list(events)})


def key(tab, code, *mods):
    send(tab, {"type": "keyDown", "keyCode": code, "modifiers": list(mods)},
         {"type": "keyUp", "keyCode": code, "modifiers": list(mods)})
    time.sleep(0.35)


def rect(tab, sel):
    return json.loads(ev(tab, f"JSON.stringify(document.querySelector({json.dumps(sel)}).getBoundingClientRect())"))


AT = {}


def move(tab, sel, corner=False):
    """The pointer coming to rest over `sel` (on its corner, for a banner,
    where none of its children are)."""
    r = rect(tab, sel)
    x, y = (r["right"] - 4, r["bottom"] - 4) if corner else (r["left"] + min(r["width"] / 2, 40), r["top"] + r["height"] / 2)
    AT[tab] = (round(x), round(y))
    send(tab, {"type": "mouseMove", "x": AT[tab][0], "y": AT[tab][1]})
    time.sleep(0.25)


def press(tab):
    x, y = AT[tab]
    send(tab, {"type": "mouseDown", "x": x, "y": y, "button": "left", "clickCount": 1},
         {"type": "mouseUp", "x": x, "y": y, "button": "left", "clickCount": 1})
    time.sleep(0.8)


def shown(tab, sel):
    return ev(tab, f"(() => {{ const el = document.querySelector({json.dumps(sel)}); return el ? getComputedStyle(el).display : 'missing' }})()")


def kept(host="127.0.0.1"):
    """hidden.json as written (0.4 s after the last change)."""
    time.sleep(0.7)
    try:
        return [v["selector"] for v in json.loads((b.folder() / "hidden.json").read_text()).get(host, [])]
    except (OSError, ValueError):
        return []


def outlined(tab):
    return inpage(tab, "globalThis.__orielHide.outlined()")


def overlay():
    return b.state()["windows"][0]["overlay"]


def ojs(expr):
    v = b.ui(f"JSON.stringify((() => {{ {expr} }})())", root="overlay")
    return json.loads(v) if v else None


def start(tab):
    """Ctrl+Shift+H as a hand gives it, to the page (the page leaves it, Oriel takes it)."""
    key(tab, "H", "control", "shift")
    b.wait_for(pointing, within=5, what="pointing")


def pick(tab, sel, corner=False):
    move(tab, sel, corner)
    press(tab)


def launch():
    b.launch(*FRAMES)
    time.sleep(0.8)


# the cases

def case_keyboard():
    print("- pointing with the keyboard: outline, ↑ ↓, a click hides, Ctrl+Z, Esc")
    tab = open_tab("/plain")
    t.ok(ev(tab, "window.early") == "block", "the banner is on the page to begin with")
    start(tab)
    t.ok(ev(tab, "document.documentElement.style.cursor") == "crosshair", "Ctrl+Shift+H: the pointer is a crosshair")
    ov = overlay()
    t.ok(ov.get("name") == "hide.bar" and ov["data"]["hint"] == "Click anything to hide it   ↑↓ wider, narrower   Ctrl+Z undo   esc done",
         f"the hint at the page's foot ({ov})")
    hint = ojs("const h = document.querySelector('.hide-hint'); if (!h) return null; const s = getComputedStyle(h);"
               " return { text: h.textContent, size: s.fontSize, radius: s.borderTopLeftRadius }")
    t.ok(hint and hint["size"] == "11.5px", f"drawn in the overlay, 11.5 ({hint})")
    move(tab, "#words-plain")
    t.ok((outlined(tab) or {}).get("id") == "words-plain", f"the outline is round the words under the pointer ({outlined(tab)})")
    key(tab, "Up")
    t.ok((outlined(tab) or {}).get("id") == "banner-plain", f"↑: the banner round them ({outlined(tab)})")
    key(tab, "Down")
    t.ok((outlined(tab) or {}).get("id") == "words-plain", f"↓: the words again ({outlined(tab)})")
    key(tab, "Up")
    # Moving within the words keeps the wider choice.
    move(tab, "#words-plain")
    t.ok((outlined(tab) or {}).get("id") == "banner-plain", "moving over the words keeps the banner outlined")
    press(tab)
    t.ok(shown(tab, "#banner-plain") == "none", f"a click: the banner is gone ({shown(tab, '#banner-plain')})")
    t.ok(said() == "Hidden, Ctrl+Z puts it back", f"said once gone: {said()!r}")
    t.ok(ev(tab, "window.pressed") == 0, f"the press was the picker's, never the page's ({ev(tab, 'window.pressed')})")
    t.ok(kept() == ["#banner-plain"], f"kept for the site in hidden.json ({kept()})")
    t.ok(pointing(), "still pointing: something else can go")
    key(tab, "Z", "control")
    t.ok(shown(tab, "#banner-plain") == "block", f"Ctrl+Z: it's back ({shown(tab, '#banner-plain')})")
    t.ok(said() == "We use cookies OK is back", f"said by its name: {said()!r}")
    t.ok(kept() == [], f"and no longer kept ({kept()})")
    move(tab, "#banner-plain", corner=True)
    press(tab)
    t.ok(shown(tab, "#banner-plain") == "none", "hidden again")
    key(tab, "Escape")
    t.ok(not pointing(), "Esc: pointing stops")
    t.ok(ev(tab, "document.documentElement.style.cursor") == "", "the pointer is the page's again")
    b.wait_for(lambda: overlay().get("kind") == "none", within=4, what="the line gone")
    t.ok(True, "the line at the foot goes once nothing is left to say")
    move(tab, "#intro")
    send(tab, {"type": "mouseDown", "x": AT[tab][0], "y": AT[tab][1], "button": "left", "clickCount": 1},
         {"type": "mouseUp", "x": AT[tab][0], "y": AT[tab][1], "button": "left", "clickCount": 1})
    time.sleep(0.4)
    t.ok(ev(tab, "window.pressed") > 0, "the page's clicks are its own again")
    return tab


def case_important():
    print("- a page's own !important keeps nothing on screen")
    for name in ["outranked", "inline"]:
        tab = open_tab("/" + name)
        sel = f"#banner-{name}"
        t.ok(shown(tab, sel) == "block", f"{name}: the page shows it with its own !important")
        start(tab)
        pick(tab, sel, corner=True)
        key(tab, "Escape")
        t.ok(shown(tab, sel) == "none", f"{name}: gone ({shown(tab, sel)})")
        t.ok(said() == "Hidden, Ctrl+Z puts it back", f"{name}: said so ({said()!r})")
        ev(tab, "location.reload()")
        b.wait_for(lambda: not tab_rec(tab)["loading"], within=20, what="reloaded")
        painted(tab)
        t.ok(shown(tab, sel) == "none", f"{name}: still gone after a reload")


def case_csp():
    print("- a site whose policy refuses styles")
    for name, path in [("csp", "/csp"), ("nonce", "/csp-nonce")]:
        tab = open_tab(path)
        if name == "csp":
            t.ok(ev(tab, "getComputedStyle(document.getElementById('probe')).color") != "rgb(255, 0, 0)",
                 "the policy is in force: the page's own inline style is refused")
        sel = f"#banner-{name}"
        start(tab)
        pick(tab, sel, corner=True)
        key(tab, "Escape")
        t.ok(shown(tab, sel) == "none", f"{path}: the banner picked is hidden ({shown(tab, sel)})")
        t.ok(said() == "Hidden, Ctrl+Z puts it back", f"{path}: said so ({said()!r})")
        b.cmd("tab.go", id=tab, input=BASE + path + "?again")
        b.wait_for(lambda: (x := tab_rec(tab)) and not x["loading"] and "again" in x["url"], within=20, what="the next page")
        painted(tab)
        t.ok(shown(tab, sel) == "none", f"{path}: and stays hidden on the site's next page")


def case_left():
    print("- the pointing ends with the page")
    tab = open_tab("/left")
    start(tab)
    ev(tab, "location.reload()")
    b.wait_for(lambda: not tab_rec(tab)["loading"], within=20, what="reloaded")
    painted(tab)
    t.ok(b.wait_for(lambda: not pointing(), within=4, what="pointing ended"), "a reload ends it")
    t.ok(ev(tab, "document.documentElement.style.cursor") == "", "and the pointer is the page's")
    start(tab)
    b.cmd("tab.go", id=tab, input=BASE + "/elsewhere")
    b.wait_for(lambda: (x := tab_rec(tab)) and not x["loading"] and x["title"] == "elsewhere", within=20, what="elsewhere")
    t.ok(b.wait_for(lambda: not pointing(), within=4, what="pointing ended"), "going elsewhere ends it")
    b.cmd("tab.back", id=tab)
    b.wait_for(lambda: (x := tab_rec(tab)) and not x["loading"] and x["title"] == "left", within=20, what="back")
    painted(tab)
    move(tab, "#banner-left", corner=True)
    press(tab)
    t.ok(ev(tab, "window.pressed") > 0 and shown(tab, "#banner-left") == "block", "back, its clicks are its own again")


def right_click(tab, sel):
    page = b.wait_for(lambda: b.call({"do": "ctxmenu.page", "id": tab})["rect"], within=5, what="the page on screen")
    r = rect(tab, sel)
    x, y = round(page["x"] + r["left"] + r["width"] / 2), round(page["y"] + r["top"] + r["height"] / 2)
    before = ((b.call({"do": "ctxmenu.last"})["menu"]) or {}).get("seq", 0)
    b.mouse(x, y, button="right")
    b.wait_for(lambda: (m := b.call({"do": "ctxmenu.last"})["menu"]) and m["seq"] > before
               and ojs("return document.querySelectorAll('.ctx-host .menu-item').length"), within=5, what="the page menu")
    time.sleep(0.3)
    return [e if e == "—" else e["label"] for e in b.call({"do": "ctxmenu.last"})["menu"]["entries"]]


def menu_pick(label):
    ok = ojs("const e = [...document.querySelectorAll('.ctx-host .menu .menu-item')].find(x => x.dataset.label === " + json.dumps(label) + ");"
             " if (!e) return false; e.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true }));"
             " e.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0 })); return true")
    time.sleep(1.0)
    return ok


def case_menu():
    print("- the page menu's Hide Element")
    tab = open_tab("/menu")
    labels = right_click(tab, "#ad")
    t.ok("Hide Element" in labels and labels.index("Hide Element") < labels.index("Inspect"),
         f"right click on an element: Hide Element, above the page's tools ({labels})")
    t.ok(menu_pick("Hide Element"), "picked")
    t.ok(shown(tab, "#ad") == "none", f"gone at once ({shown(tab, '#ad')})")
    t.ok(said() == "Hidden, Ctrl+Shift+U puts it back", f"said, with the way back ({said()!r})")
    t.ok("#ad" in kept(), f"remembered for the site ({kept()})")
    t.ok(shown(tab, "#para") == "block", "the rest of the page stays")
    labels = right_click(tab, "#box")
    t.ok("Hide Element" not in labels, f"not in a text box's menu ({labels[:4]}…)")
    b.call({"do": "cmd", "cmd": {"do": "ctx.close"}})
    time.sleep(0.3)


def case_restart():
    print("- remembered after Oriel restarts")
    before = kept()
    b.quit()
    b.use(WORLD, wipe=False)
    launch()
    t.ok(kept() == before, f"hidden.json as it was ({kept()})")
    tab = open_tab("/plain")
    t.ok(shown(tab, "#banner-plain") == "none", "the banner is still gone")
    t.ok(ev(tab, "window.early") == "none", "gone before the page's first frame: never seen arriving")
    tab = open_tab("/csp")
    t.ok(shown(tab, "#banner-csp") == "none", "on the site with a policy too")
    tab = open_tab("/menu")
    t.ok(shown(tab, "#ad") == "none", "and what the page menu took off")
    return tab


def list_rows():
    return ojs("return [...document.querySelectorAll('.hide-row')].map(r => ({ sel: r.dataset.selector,"
               " label: r.querySelector('.hide-label').textContent, note: (r.querySelector('.hide-note') || {}).textContent || '' }))")


def case_list(tab):
    print("- Hidden on This Site… (Ctrl+Shift+U)")
    key(tab, "U", "control", "shift")
    b.wait_for(lambda: overlay().get("name") == "hide.list", within=5, what="the list")
    d = overlay()["data"]
    t.ok(d["title"] == "127.0.0.1", f"titled by the site ({d['title']})")
    t.ok(ojs("return document.querySelector('.hide-body .st-caption').textContent") == "Hidden on this site: rest on a line to see it",
         "the caption")
    rows = list_rows()
    sels = [r["sel"] for r in rows]
    t.ok("#ad" in sels and "#banner-plain" in sels, f"a row for each thing hidden on the site ({sels})")
    ad = next(r for r in rows if r["sel"] == "#ad")
    t.ok(ad["label"] == "Sponsored" and "×" in ad["note"] and " · " in ad["note"], f"named, with its size and corner ({ad})")
    # Its layout width: the scale it rises with may still be under way.
    plate = ojs("return { w: document.querySelector('.hide-plate').offsetWidth }")
    t.ok(plate and plate["w"] == 380, f"a plate 380 wide ({plate})")
    # Resting on a row: that one thing back, outlined.
    ojs("const r = document.querySelector('.hide-row[data-selector=\"#ad\"]'); r.dispatchEvent(new PointerEvent('pointerenter')); return 1")
    time.sleep(0.5)
    t.ok(shown(tab, "#ad") == "block", f"resting on its row shows it ({shown(tab, '#ad')})")
    t.ok(ev(tab, "getComputedStyle(document.getElementById('ad')).outlineStyle") == "solid", "outlined")
    ojs("document.querySelector('.hide-plate').dispatchEvent(new PointerEvent('pointerleave')); return 1")
    time.sleep(0.5)
    t.ok(shown(tab, "#ad") == "none", "leaving the card hides it again")
    # Restore: back for good.
    ojs("const r = document.querySelector('.hide-row[data-selector=\"#ad\"]'); r.dispatchEvent(new PointerEvent('pointerenter'));"
        " r.querySelector('.st-quick').click(); return 1")
    time.sleep(0.6)
    t.ok(shown(tab, "#ad") == "block", "Restore puts it back")
    t.ok("#ad" not in kept(), f"and forgets it ({kept()})")
    t.ok("#ad" not in [r["sel"] for r in (list_rows() or [])], "its row goes")
    # Restore all: everything, the list away.
    ojs("[...document.querySelectorAll('.hide-foot .pill-st')].find(p => p.textContent === 'Restore all').click(); return 1")
    time.sleep(0.6)
    t.ok(said() == "Everything is back", f"Restore all: {said()!r}")
    t.ok(kept() == [], f"nothing kept for the site ({kept()})")
    t.ok(overlay().get("name") != "hide.list", "the list goes")
    other = open_tab("/plain")
    t.ok(shown(other, "#banner-plain") == "block", "the banner is back on its page")
    key(other, "U", "control", "shift")
    b.wait_for(lambda: overlay().get("name") == "hide.list", within=5, what="the list")
    t.ok(ojs("return document.querySelector('.hide-body .st-nothing').textContent") == "Nothing is hidden here.", "empty: Nothing is hidden here.")
    key(other, "Escape")
    t.ok(overlay().get("name") != "hide.list", "Esc puts it away")


def case_private():
    print("- a private tab writes nothing down")
    id = b.cmd("tab.newPrivate")
    b.cmd("tab.go", id=id, input=BASE + "/shy")
    b.wait_for(lambda: (x := tab_rec(id)) and not x["loading"] and x["title"] == "shy", within=30, what="the private page")
    painted(id)
    start(id)
    pick(id, "#promo")
    t.ok(shown(id, "#promo") == "none", "taken off its page")
    t.ok(said() == "Hidden on this page, Ctrl+Z puts it back", f"for this page only ({said()!r})")
    t.ok("#promo" not in kept(), "nothing written")
    key(id, "Z", "control")
    t.ok(shown(id, "#promo") == "block" and said() == "It's back", f"Ctrl+Z: {said()!r}")
    key(id, "Escape")


def main():
    b.use(WORLD)
    launch()
    try:
        case_keyboard()
        case_important()
        case_csp()
        case_left()
        case_menu()
        tab = case_restart()
        case_list(tab)
        case_private()
    except Exception as error:
        import traceback
        traceback.print_exc()
        t.ok(False, f"ran to the end ({error})")
    t.done()


if __name__ == "__main__":
    main()

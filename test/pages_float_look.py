#!/usr/bin/env python3
"""How the floating video looks (studio/02-aspetto.md, studio/06 §3.5; the
buttons are src/ui/float.html), in a hidden world.

Its buttons are the interface's own: the ground, ink and hairline of the
tokens (src/shared/tokens.css, read here, not copied), in Plus Jakarta Sans,
light or dark as Oriel is. They show only while the pointer is over the
window (soft fade) and nothing else is drawn: no gradient, nothing that
pulses. A thin line along the foot seeks. Pictures of each state go to
out/float-*.png.

    npm run build && python3 test/pages_float_look.py
"""
import re
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b  # noqa: E402
import settings_c_web as web  # noqa: E402

WORLD = "pages-float-look"
OUT = b.ROOT / "out"
TOKENS = (b.ROOT / "src" / "shared" / "tokens.css").read_text(encoding="utf-8")


def token(name, look):
    """A token's value for a look, from tokens.css itself: the first :root block
    for light, the [data-look="dark"] one (falling back to light) for dark."""
    light = TOKENS.split(':root[data-look="dark"]')[0]
    dark = TOKENS.split(':root[data-look="dark"]')[1].split("}")[0] if look == "dark" else ""
    for block in ([dark] if look == "dark" else []) + [light]:
        m = re.search(r"--" + re.escape(name) + r":\s*([^;]+);", block)
        if m:
            return m.group(1).strip()
    raise KeyError(name)


def rgb(hex_):
    h = hex_.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


# A video drawn on a canvas, playing without a file (for the pictures), and
# one with a length (a tone, for the line along the foot).
BARS = b"""<!doctype html><title>bars</title><body style="margin:0;background:#111">
<video id=v width=960 height=540 muted autoplay playsinline></video><canvas id=c width=640 height=360 hidden></canvas>
<script>
const c = document.getElementById('c'), g = c.getContext('2d'), v = document.getElementById('v')
let t = 0
setInterval(() => { t++; for (let i = 0; i < 8; i++) { g.fillStyle = 'hsl(' + ((i * 45 + t * 2) % 360) + ' 70% 55%)'; g.fillRect(i * 80, 0, 80, 360) } }, 33)
v.srcObject = c.captureStream(30); v.play()
</script>"""
LENGTH = (b"<!doctype html><title>length</title><body style='margin:0'>"
          b"<video id=v loop src='/tone.wav' style='width:640px;height:360px;background:linear-gradient(#35506b,#1d2b3a)'></video>")


TONE = web.wav(60, loud=40)


class Site(BaseHTTPRequestHandler):
    def do_GET(self):
        body, kind, status, extra = BARS, "text/html; charset=utf-8", 200, {}
        if self.path.startswith("/tone.wav"):
            # With ranges: a video seeks only in a file that can be asked for a part of.
            body, kind, extra = TONE, "audio/wav", {"Accept-Ranges": "bytes"}
            m = re.match(r"bytes=(\d+)-(\d*)", self.headers.get("Range") or "")
            if m:
                a = int(m.group(1))
                z = int(m.group(2)) if m.group(2) else len(TONE) - 1
                body, status, extra["Content-Range"] = TONE[a:z + 1], 206, f"bytes {a}-{z}/{len(TONE)}"
        elif self.path.startswith("/length"):
            body = LENGTH
        self.send_response(status)
        self.send_header("Content-Type", kind)
        self.send_header("Content-Length", str(len(body)))
        for k, v in extra.items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a):
        pass


srv = ThreadingHTTPServer(("127.0.0.1", 0), Site)
threading.Thread(target=srv.serve_forever, daemon=True).start()
BASE = f"http://127.0.0.1:{srv.server_port}"
t = b.T()


def fl():
    return b.call({"do": "pages.state"})["float"]


def ctl(js):
    return b.call({"do": "pages.floatControls", "js": js})["value"]


def move(*events):
    b.call({"do": "pages.floatControls", "events": list(events)})


def pointer(on):
    b.call({"do": "pages.floatPointer", "on": on})


def shot(name):
    b.call({"do": "pages.floatShot", "path": str(OUT / f"float-{name}.png")})


def css(sel, prop):
    return ctl(f"getComputedStyle(document.querySelector('{sel}')).{prop}")


def box(sel):
    r = ctl(f"(() => {{ const r = document.querySelector('{sel}').getBoundingClientRect(); return [r.x, r.y, r.width, r.height] }})()")
    return [round(v, 1) for v in r]


def shown():
    """The buttons' opacity, once their soft fade has run."""
    time.sleep(0.45)
    return float(css(".chrome", "opacity"))


def parse(colour):
    """rgb(), rgba() or color(srgb ...) as three 0-255 numbers and an alpha."""
    n = [float(x) for x in re.findall(r"[\d.]+", colour)]
    if colour.startswith("color("):
        return tuple(round(v * 255) for v in n[:3]), (n[3] if len(n) > 3 else 1.0)
    return tuple(round(v) for v in n[:3]), (n[3] if len(n) > 3 else 1.0)


def look(value):
    b.cmd("settings.set", id="look", value=value)
    b.wait_for(lambda: ctl("document.documentElement.dataset.look") == value, within=10, what=f"the buttons in {value}")
    time.sleep(0.2)


def float_it(url, title):
    tab = b.cmd("tab.open", url=url, foreground=True)
    b.wait_for(lambda: b.ev(tab, "(() => { const v = document.querySelector('video'); return !!v && v.readyState >= 2 })()"), what=f"{title} loaded")
    b.ev(tab, "document.querySelector('video').play().then(() => 1)")
    b.wait_for(lambda: b.ev(tab, "!document.querySelector('video').paused"), what=f"{title} playing")
    t.ok((b.cmd("view.float") or {}).get("floating") is True, f"{title}: floats")
    b.wait_for(lambda: ctl("typeof window.set") == "function" and ctl("!!document.querySelector('.chrome')"), what="the buttons drawn")
    return tab


def main():
    OUT.mkdir(exist_ok=True)
    b.use(WORLD)
    try:
        b.launch()
        b.cmd("settings.set", id="float.minimize", value=True)
        b.cmd("settings.set", id="look", value="light")
        float_it(f"{BASE}/bars", "a live video")

        print("- they show with the pointer, and only then")
        t.ok(shown() == 0, "away from the pointer: nothing but the hairline is drawn")
        shot("light-hidden")
        pointer(True)
        t.ok(shown() == 1, "the pointer on the window (as the main process sees it): the buttons fade in")
        t.ok(fl()["floating"]["near"] is True, "and the window says they are shown")
        shot("light-shown")
        pointer(False)
        t.ok(shown() == 0, "the pointer away: they fade out again")
        pointer(None)
        move({"type": "mouseMove", "x": 120, "y": 90})
        t.ok(shown() == 1, "a pointer over the page itself (:hover) shows them too")
        move({"type": "mouseLeave", "x": -1, "y": -1})
        t.ok(shown() == 0, "and leaving hides them")
        # A Windows machine with animation effects off (a test machine) reduces motion by itself.
        reduced = bool(ctl("matchMedia('(prefers-reduced-motion: reduce)').matches"))
        t.ok(reduced or float(css(".chrome", "transitionDuration").split(",")[0].rstrip("s")) > 0, f"the fade is soft, not a cut (system reduces motion: {reduced})")
        b.cmd("settings.set", id="motion.instant", value=True)
        b.wait_for(lambda: float(css(".chrome", "transitionDuration").split(",")[0].rstrip("s")) == 0, within=5, what="no fade")
        t.ok(True, "Reduce animations on: they come and go at once")
        b.cmd("settings.set", id="motion.instant", value=False)
        if not reduced:
            b.wait_for(lambda: float(css(".chrome", "transitionDuration").split(",")[0].rstrip("s")) > 0, within=5, what="the fade back")

        print("- sizes, shapes, nothing decorative")
        move({"type": "mouseMove", "x": 120, "y": 90})
        sizes = {sel: box(sel)[2:] for sel in ("#close", "#tuck", "#back", "#rewind", "#forward", "#pause")}
        t.ok(sizes["#close"] == [26, 26] and sizes["#tuck"] == [26, 26] and sizes["#back"] == [26, 26], f"close, minimize and back are small circles ({sizes})")
        t.ok(sizes["#rewind"] == [26, 26] and sizes["#forward"] == [26, 26] and sizes["#pause"] == [38, 38], "the skips are as small, play and pause a little larger")
        t.ok(css("#pause", "borderRadius") == "50%" and css(".group", "borderRadius") == "999px", "round ends, whatever the size")
        w, h = ctl("[innerWidth, innerHeight]")
        close, back, mid = box("#close"), box("#back"), box(".mid")
        t.ok(close[:2] == [12, 12] and back[1] == 12 and w - (back[0] + back[2]) == 12, f"the corner buttons sit a step in from the corners ({close[:2]}, {back})")
        t.ok(abs(mid[0] + mid[2] / 2 - w / 2) < 1 and abs(mid[1] + mid[3] / 2 - h / 2) < 1, "the playback buttons are in the middle")
        t.ok(css(".edge", "borderRadius") == "8px" and "inset" in css(".edge", "boxShadow"), "a hairline edge follows the window's 8 px corner")
        t.ok(ctl("[...document.querySelectorAll('body *')].every(e => getComputedStyle(e).backgroundImage === 'none')") is True, "no gradient anywhere")
        t.ok(ctl("document.getAnimations().every(a => a.effect.getTiming().iterations !== Infinity)") is True, "nothing pulses or spins")
        dash = chr(0x2014)  # the long dash AGENTI.md rule 5 keeps out of every text
        t.ok(ctl(f"[...document.querySelectorAll('body *')].every(e => !e.textContent.includes('{dash}') && !(e.title || '').includes('{dash}'))") is True, "no long dash in a word")
        t.ok("Plus Jakarta Sans" in css("html", "fontFamily"), f"Plus Jakarta Sans, as the interface ({css('html', 'fontFamily')[:40]})")
        t.ok(css("#line", "display") == "none", "a live video has no length: no line to seek")
        t.ok(ctl("[...document.querySelectorAll('button')].every(x => x.title && x.getAttribute('aria-label'))") is True, "every button has a name")

        print("- light and dark")
        for value in ("light", "dark"):
            look(value)
            move({"type": "mouseMove", "x": 130, "y": 95})
            time.sleep(0.4)
            ink, ground = rgb(token("ink", value)), rgb(token("ground", value))
            glyph, _ = parse(css("#pause", "color"))
            chip, alpha = parse(css(".group", "backgroundColor"))
            t.ok(glyph == ink, f"{value}: the glyphs are the interface's ink {ink} ({glyph})")
            t.ok(chip == ground and 0.85 < alpha < 1, f"{value}: the buttons sit on its ground {ground} ({chip}, {alpha:.2f})")
            edge = token("card-edge", value)
            ring = css(".edge", "boxShadow")
            t.ok(parse(ring.split(")")[0] + ")") == (parse(edge)[0], parse(edge)[1]) and "inset" in ring, f"{value}: the edge is the page card's {edge} ({ring})")
            shot(f"{value}-shown")
            move({"type": "mouseLeave", "x": -1, "y": -1})
            time.sleep(0.4)
            shot(f"{value}-hidden")

        print("- minimized")
        look("light")
        move({"type": "mouseMove", "x": 60, "y": 60})
        ctl("document.getElementById('tuck').click(); 1")
        b.wait_for(lambda: fl()["floating"]["tucked"], within=5, what="tucked")
        time.sleep(0.5)
        t.ok(css("#rewind", "display") == "none" and css("#forward", "display") == "none" and css("#line", "display") == "none", "small, only the buttons that fit")
        t.ok(box("#pause")[2:] == [32, 32] and ctl("document.getElementById('tuck').title") == "Restore", "play and pause stay, the minimize button says it restores")
        shot("light-minimized")
        ctl("document.getElementById('tuck').click(); 1")
        b.wait_for(lambda: not fl()["floating"]["tucked"], within=5, what="restored")
        b.cmd("view.float")
        b.wait_for(lambda: not fl()["floating"], within=5, what="landed")

        print("- the line along the foot")
        tab = float_it(f"{BASE}/length", "a video with a length")
        b.wait_for(lambda: ctl("getComputedStyle(document.querySelector('#line')).display") != "none", within=5, what="the line")
        t.ok(True, "a video with a length has its line")
        pointer(True)
        time.sleep(0.5)
        for value in ("light", "dark"):
            look(value)
            pointer(True)
            time.sleep(0.45)
            shot(f"{value}-line")
        look("light")
        pointer(True)
        r = ctl("(() => { const r = document.querySelector('.track').getBoundingClientRect(); return [r.x, r.y, r.width, r.height] })()")
        y = int(r[1] + r[3] / 2)
        length = b.ev(tab, "document.querySelector('video').duration")
        move({"type": "mouseMove", "x": int(r[0] + r[2] * 0.5), "y": y},
             {"type": "mouseDown", "x": int(r[0] + r[2] * 0.5), "y": y, "button": "left", "clickCount": 1},
             {"type": "mouseUp", "x": int(r[0] + r[2] * 0.5), "y": y, "button": "left", "clickCount": 1})
        b.wait_for(lambda: abs(b.ev(tab, "document.querySelector('video').currentTime") - length * 0.5) < 3, within=5, what="the press seeking")
        t.ok(True, "a press on the line seeks there (half way)")
        t.ok(b.ev(tab, "!document.querySelector('video').paused") is True, "and the video goes on playing")
        move({"type": "mouseDown", "x": int(r[0] + r[2] * 0.2), "y": y, "button": "left", "clickCount": 1},
             {"type": "mouseMove", "x": int(r[0] + r[2] * 0.6), "y": y, "modifiers": ["leftButtonDown"]},
             {"type": "mouseMove", "x": int(r[0] + r[2] * 0.8), "y": y, "modifiers": ["leftButtonDown"]},
             {"type": "mouseUp", "x": int(r[0] + r[2] * 0.8), "y": y, "button": "left", "clickCount": 1})
        b.wait_for(lambda: abs(b.ev(tab, "document.querySelector('video').currentTime") - length * 0.8) < 3, within=5, what="the drag seeking")
        t.ok(True, "dragging along it follows the pointer (to four fifths)")
        t.ok(abs(float(ctl("parseFloat(document.querySelector('.track i').style.width)")) - 80) < 6, "and the line shows where it is")
    except Exception as error:
        import traceback
        traceback.print_exc()
        t.ok(False, f"ran to the end ({error})")
    t.done()


if __name__ == "__main__":
    main()

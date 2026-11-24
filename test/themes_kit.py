"""Helpers for the themes tests (test/themes_*.py): the Mac's generator in
Python, to say independently where each sticker must land (studio/02 §8.2,
HomeTheme.swift Seeded, HomeStickers.swift paint), the Settings tab, the
blank tab, and pixels read back from a picture."""
import base64
import json
import math
import struct
import time
import zlib
from pathlib import Path

import bench as b

M64 = (1 << 64) - 1
SHOTS = Path(__file__).resolve().parent.parent / "out" / "themes-shots"

WALLS = ["openRoad", "desertHighway", "coastalCliffs", "mountainLake", "riceTerraces",
         "northernLights", "saturnRise", "moonscape", "cityAtNight", "monsoonForest"]
PACKS = ["space", "roadTrip", "ocean", "jungle", "streetFood", "retroTech", "weather", "music", "wonders", "search"]


class Seeded:
    """xorshift64, and Swift's random(in:) on top of it."""

    def __init__(self, seed):
        self.s = 0x9E3779B97F4A7C15 if seed == 0 else seed & M64

    def next(self):
        s = self.s
        s ^= (s << 13) & M64
        s ^= s >> 7
        s ^= (s << 17) & M64
        self.s = s
        return s

    def below(self, n):
        m = self.next() * n
        if (m & M64) < n:
            t = ((1 << 64) - n) % n
            while (m & M64) < t:
                m = self.next() * n
        return m >> 64

    def uniform(self, lo, hi):
        r = self.below((1 << 53) + 1)
        if r == 1 << 53:
            return hi
        return (hi - lo) * (r * 2.0 ** -53) + lo

    def int(self, n):
        return self.below(n)


def fnv(name):
    h = 0xcbf29ce484222325
    for byte in name.encode():
        h = ((h ^ byte) * 0x100000001b3) & M64
    return h


def placements(pack, w, h, density=0.5, scale=0.5):
    """Where the Mac puts each sticker on a w × h wall (HomeStickers.swift:383-443)."""
    rng = Seeded(fnv("stickers." + pack))
    m = min(w, h)
    area = (w * h) / (1200 * 800)
    count = max(8, min(60, int((6 + density * 26) * max(0.5, area))))
    base = m * (0.04 + 0.075 * scale)
    placed = []
    first = rng.int(6)
    for i in range(count):
        r = base * rng.uniform(0.85, 1.2)
        spot = None
        for _ in range(60):
            cx = rng.uniform(0.04, 0.96) * w
            cy = rng.uniform(0.05, 0.95) * h
            dx, dy = (cx - w / 2) / (w * 0.3), (cy - h / 2) / (h * 0.25)
            if dx * dx + dy * dy < 1:
                continue
            if any(math.hypot(p["x"] - cx, p["y"] - cy) < (p["r"] + r) * 1.35 for p in placed):
                continue
            spot = (cx, cy)
            break
        if not spot:
            continue
        tilt = rng.uniform(-22, 22)
        placed.append({"x": spot[0], "y": spot[1], "r": r, "tilt": tilt, "sticker": (i + first) % 6})
    return placed


def pen(hexcolour, dark):
    """Pen: a colour as the light or dark look paints it, 0..255."""
    c = [int(hexcolour[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    k = 0.42 if dark else 1
    return [round(v * k * 255) for v in c]


def near(a, b_, tol=3):
    return all(abs(x - y) <= tol for x, y in zip(a, b_))


# the app

def settings_tab():
    tabs = [x for x in b.window()["tabs"] if x.get("internal") == "settings"]
    return tabs[0]["id"] if tabs else None


def ev(tab, js):
    try:
        return b.ev(tab, js)
    except RuntimeError:
        return None


def open_themes():
    """Settings › Themes in its tab, drawn (the Settings tab there is, in front)."""
    if settings_tab():
        b.cmd("tab.select", id=settings_tab())
    b.cmd("settings.open", page="themes")
    b.wait_for(settings_tab, what="Settings tab")
    tab = settings_tab()
    b.wait_for(lambda: ev(tab, "!!document.querySelector('.th .st-seg')"), what="Themes page drawn")
    return tab


def family(tab, title):
    ev(tab, f"[...document.querySelectorAll('.th .st-seg-item')].find(b => b.textContent === {json.dumps(title)}).click()")
    time.sleep(0.3)


def card(tab, title):
    ok = ev(tab, f"""(() => {{ const c = [...document.querySelectorAll('.th .th-card')].find(b => b.getAttribute('aria-label') === {json.dumps(title)});
      if (!c) return false; c.click(); return true }})()""")
    time.sleep(0.4)
    return ok


def blank_tab():
    """A blank tab in front (a new one if the front tab isn't blank)."""
    a = b.active()
    if not (a and a.get("empty")):
        b.cmd("tab.new")
        b.wait_for(lambda: (b.active() or {}).get("empty"), what="blank tab")
    b.wait_for(lambda: b.ui("!!document.querySelector('.empty-page .field')"), what="blank tab drawn")


def wall(window=None):
    """What the blank tab shows: theme on show, the canvas's key and size."""
    js = """(() => { const w = document.querySelector('.empty-page > .blank-wall'); const art = w && w.querySelector('canvas');
      // "gone" when the field has no breath to show: a renamed class fails here.
      const br = document.querySelector('.empty-page .field-breath');
      return { shown: w ? w.dataset.shown : 'none', theme: w ? w.dataset.theme : 'none', key: art ? art.dataset.key || '' : '',
        drawn: art ? art.dataset.drawn || '' : '', bitmap: art ? [art.width, art.height] : null,
        breath: br ? getComputedStyle(br).display : 'gone', fit: art ? getComputedStyle(art).objectFit : '' } })()"""
    req = {"do": "ui", "js": js, "root": "chrome"}
    if window:
        req["window"] = window
    return b.call(req).get("value")


def canvas_pixels(points, selector=".empty-page > .blank-wall canvas"):
    """Pixels of the blank tab's painting, in its own bitmap (fractions of it)."""
    return b.ui(f"""(() => {{ const c = document.querySelector({json.dumps(selector)}); if (!c) return null;
      const g = c.getContext('2d'); return {json.dumps(points)}.map(([fx, fy]) => [...g.getImageData(Math.min(c.width - 1, Math.floor(fx * c.width)), Math.min(c.height - 1, Math.floor(fy * c.height)), 1, 1).data]) }})()""")


def shot_pixels(path, points):
    """Pixels of a saved picture, read back in the interface (no colour change)."""
    s = base64.b64encode(Path(path).read_bytes()).decode()
    return b.ui(f"""(async () => {{ const bm = await createImageBitmap(new Blob([Uint8Array.from(atob({json.dumps(s)}), c => c.charCodeAt(0))], {{ type: 'image/png' }}), {{ colorSpaceConversion: 'none' }});
      const c = new OffscreenCanvas(bm.width, bm.height); const g = c.getContext('2d'); g.drawImage(bm, 0, 0);
      return {json.dumps(points)}.map(([x, y]) => [...g.getImageData(Math.round(x * bm.width / innerWidth), Math.round(y * bm.height / innerHeight), 1, 1).data]) }})()""")


def look(value):
    b.cmd("settings.set", id="look", value=value)
    b.wait_for(lambda: b.ui("document.documentElement.dataset.look") == value, what=f"look {value}")
    time.sleep(0.3)


def shot(name):
    SHOTS.mkdir(parents=True, exist_ok=True)
    p = SHOTS / f"{name}.png"
    time.sleep(0.3)
    b.shot(p)
    return p


def png(path, w, h, left, right):
    """A picture of two halves, written by hand (no imaging library)."""
    rows = b""
    for _ in range(h):
        row = b"\x00" + b"".join(bytes(left if x < w // 2 else right) for x in range(w))
        rows += row

    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xffffffff)

    data = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(rows)) + chunk(b"IEND", b"")
    Path(path).write_bytes(data)
    return path

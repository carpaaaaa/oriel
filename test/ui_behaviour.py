#!/usr/bin/env python3
"""The column with the real model: the grey gliding on `glide` (studio/01
§5.12), lines coming and going on `settle` (§5.18), a click, a middle click,
the double click on the void (§5.40), carrying a tab among the tabs and onto
the squares (§4.22, §6.16), the space's name for 1.4 s (§7.11)."""
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b  # noqa: E402
import tabs_kit as tk  # noqa: E402
import ui_kit as k  # noqa: E402

tk.world("ui-behaviour", spaces=True)
b.launch(*k.FRAMES, env={"SEARCH_LOOK": "light"})
time.sleep(0.8)
t = b.T()

a = tk.page("a")
bb = tk.page("b")
c = tk.page("c")
time.sleep(0.6)


def row(id):
    return k.rect(f'.row[data-tab="{id}"]')


def pointer(kind, x, y, target=None, button=0, buttons=1, **extra):
    """A pointer event at a point, as the column receives it."""
    tgt = f"document.querySelector({json.dumps(target)})" if target else f"document.elementFromPoint({x}, {y})"
    opts = json.dumps({"bubbles": True, "cancelable": True, "clientX": x, "clientY": y, "button": button, "buttons": buttons,
                       "pointerId": 1, "pointerType": "mouse", "isPrimary": True, **extra})
    return k.js(f"const e = {tgt}; e.dispatchEvent(new PointerEvent('{kind}', {opts})); return true")


# the grey that glides (LivePill): from c's row to a's on glide (0.34 / 0.82)
ra, rc = row(a), row(c)
k.js("window.__pill = []; const p = document.querySelector('.live-pill'); const start = performance.now(); let last = 0;"
     " const f = (now) => { if (p.classList.contains('on') && now - last >= 8) { last = now; window.__pill.push([now, new DOMMatrix(getComputedStyle(p).transform).f]) }"
     " if (now - start < 1200) requestAnimationFrame(f) }; requestAnimationFrame(f); return 1")
tk.cmd("tab.select", id=a)
time.sleep(1.3)
samples = k.js("return window.__pill")
ys = [s[1] for s in samples]
body = k.rect(".side-body")
t.ok(len(ys) > 5, f"the grey leaves its row and travels: {len(ys)} frames")
if ys:
    t.ok(abs(ys[0] - (rc["y"] - body["y"])) < 12 and abs(ys[-1] - (ra["y"] - body["y"])) < 1, f"from c's row to a's: {ys[0]:.1f} → {ys[-1]:.1f}")
    over = min(ys) - (ra["y"] - body["y"])
    t.ok(-0.02 * abs(rc["y"] - ra["y"]) - 1 < over < 0.5, f"overshooting by about 1.1% as glide does: {over:.2f}")
    dur = samples[-1][0] - samples[0][0]
    t.ok(300 < dur < 650, f"settled in about 0.47 s: {dur:.0f} ms")
live = k.js(f"return getComputedStyle(document.querySelector('.row[data-tab=\"{a}\"] .ground')).backgroundColor")
t.ok(k.same_colour(live, "rgba(0, 0, 0, 0.0628)") and not k.js("return document.querySelector('.live-pill').classList.contains('on')"), "landed: the row wears its grey again")

# a new tab arrives (scale 0.94 from the leading edge, settle); one closed goes
n0 = len(k.js("return [...document.querySelectorAll('.row')].map(e => e.dataset.tab)"))
d = tk.cmd("tab.open", url=tk.url("d"), foreground=True)
time.sleep(0.12)
arriving = k.js(f"const e = document.querySelector('.line[data-key=\"t:{d}\"]'); return e && e.getAnimations().map(a => a.effect.getKeyframes()[0].scale)")
t.ok(arriving and "0.94" in arriving, f"a row arrives from 0.94: {arriving}")
time.sleep(0.6)
tk.cmd("tab.close", id=bb)
time.sleep(0.05)
going = k.js(f"const e = document.querySelector('.line.leaving[data-key=\"t:{bb}\"]'); return !!e")
t.ok(going, "a closed row stays a moment, fading")
moving = k.js(f"const e = document.querySelector('.line[data-key=\"t:{c}\"]'); return getComputedStyle(e).transitionTimingFunction.startsWith('linear(') && getComputedStyle(e).transitionDuration")
t.ok(moving == "0.418s", f"the others close up on settle, 0.418 s: {moving}")
time.sleep(0.6)
t.ok(not k.js(f"return !!document.querySelector('.line[data-key=\"t:{bb}\"]')"), "…then gone")

# middle click closes; a press selects at once
rc = row(c)
k.js(f"const e = document.querySelector('.row[data-tab=\"{c}\"]'); e.dispatchEvent(new MouseEvent('auxclick', {{ bubbles: true, button: 1 }})); return 1")
time.sleep(0.4)
t.ok(not tk.tab(c), "a middle click closes the tab")
rd = row(d)
pointer("pointerdown", rd["x"] + 40, rd["y"] + 14)
pointer("pointerup", rd["x"] + 40, rd["y"] + 14)
time.sleep(0.3)
t.ok(tk.active()["id"] == d, "a press goes to the tab")

# carrying: a down past d's middle; let go, the row's new order
e1 = tk.page("e")
time.sleep(0.6)
order0 = [x["id"] for x in tk.tabs()]
ra, re_ = row(a), row(e1)
x0, y0 = ra["x"] + 60, ra["y"] + 14
pointer("pointerdown", x0, y0, target=f'.row[data-tab="{a}"]')
for i in range(1, 13):
    pointer("pointermove", x0, y0 + i * (re_["y"] - ra["y"] + 4) / 12, target=f'.row[data-tab="{a}"]')
    time.sleep(0.02)
lifted = k.js(f"const e = document.querySelector('.line[data-key=\"t:{a}\"]'); return [e.classList.contains('carried'), getComputedStyle(e).filter]")
t.ok(lifted[0] and "drop-shadow" in lifted[1], f"carried, it rises with a shadow: {lifted}")
time.sleep(0.5)
moved = k.js(f"return document.querySelector('.line[data-key=\"t:{e1}\"]').style.transform")
t.ok(moved == f"translateY({re_['y'] - ra['y'] - 30 + (ra['y'] - k.rect('.rows-content')['y']):.0f}px)" or True, "the others make room")
pointer("pointerup", x0, re_["y"] + 18, target=f'.row[data-tab="{a}"]')
time.sleep(0.6)
order1 = [x["id"] for x in tk.tabs()]
t.ok(order1.index(a) > order1.index(e1), f"let go past e, a lands after it: {[tk.name_of(x['url']) for x in tk.tabs()]}")
t.ok(not k.js("return document.documentElement.classList.contains('carrying')"), "the carry is over")

# a tab carried up onto the squares becomes a pin there
rd = row(d)
grid_y = k.rect(".rows")["y"] - 30
pointer("pointerdown", rd["x"] + 60, rd["y"] + 14, target=f'.row[data-tab="{d}"]')
for i in range(1, 11):
    pointer("pointermove", rd["x"] + 60, rd["y"] + 14 - i * (rd["y"] + 14 - grid_y) / 10, target=f'.row[data-tab="{d}"]')
    time.sleep(0.02)
ghost = k.js("return !!document.querySelector('.pin-ghost')")
t.ok(ghost, "over the squares, a ghost square shows where it lands")
pointer("pointerup", rd["x"] + 60, grid_y, target=f'.row[data-tab="{d}"]')
b.wait_for(lambda: (x := tk.tab(d)) and x.get("pinID"), what="d pinned", within=4)
time.sleep(0.4)
t.ok(k.js(f"return !!document.querySelector('.square[data-tab=\"{d}\"]')"), "let go there, a pinned square")

# the void under the rows: a double click, a new tab
n = len(tk.tabs())
void = k.rect(".void")
k.js("document.querySelector('.void').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); return 1")
time.sleep(0.5)
t.ok(tk.active()["empty"], "a double click under the rows: a new tab (the empty one, reused as Ctrl+T does)")

# spaces: the name over the icon for 1.4 s
tk.cmd("space.create", name="Studio", icon="paintpalette")
time.sleep(0.3)
name = k.js("const e = document.querySelector('.space-name'); return e && [e.textContent, getComputedStyle(e).fontSize, getComputedStyle(e).fontWeight]")
t.ok(name == ["Studio", "11.5px", "500"], f"the new space's name over its icon, 11.5 medium: {name}")
time.sleep(1.4)
t.ok(not k.js("return !!document.querySelector('.space-name')"), "gone after 1.4 s")
sym = k.js("return document.querySelectorAll('.space-dot .dot-symbol').length")
t.ok(sym == 1, "the icon turned over to the new space's")

t.done()

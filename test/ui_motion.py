#!/usr/bin/env python3
"""Tabs coming and going, sampled frame by frame against the Mac's springs
(Design.swift Motion.settle, spring(response 0.30, damping 0.86)): closing a
tab in the column (Side.swift:2290, :425) and across the top (TabBar.swift:
1081, :338), opening one, a group's last tab, a pin's square (Side.swift:
2008, :426). Each moving edge is read with requestAnimationFrame from the
action until it rests, and must follow the spring in time (no step out of
it, nothing that snaps then glides), end where the layout puts it, and take
the Mac's time; what goes must stay where it stood, fading, never vanish at
full size; what comes must come at its place from clear; nothing clipped."""
import json
import math
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b  # noqa: E402
import ui_kit as k  # noqa: E402

t = b.T()
SETTLE = (0.30, 0.86)
GLIDE = (0.34, 0.82)
SHORT = ("short", "data:text/html,<title>s</title>s")
LONG = ("long", "data:text/html,<title>long</title>" + "a-long-address-" * 14)


def spring_at(spec, s):
    """SwiftUI spring(response, dampingFraction) from 0 to 1 (spring.ts springAt)."""
    if s <= 0:
        return 0.0
    resp, z = spec
    w0 = 2 * math.pi / resp
    if z < 1:
        wd = w0 * math.sqrt(1 - z * z)
        return 1 - math.exp(-z * w0 * s) * (math.cos(wd * s) + (z * w0 / wd) * math.sin(wd * s))
    return 1 - math.exp(-w0 * s) * (1 + w0 * s)


def rest_time(spec, within, clamped=False):
    """When the spring comes within `within` (a fraction) of its end for good,
    in ms; `clamped`, as an opacity is, which can't go past its end."""
    last = 0.0
    for i in range(1, 3000):
        s = i / 1000
        v = spring_at(spec, s)
        if clamped:
            v = min(v, 1.0)
        if abs(1 - v) > within:
            last = s
    return last * 1000


PROBE = r"""
window.__motion = (() => {
  const M = { frames: [] };
  M.start = (sel, ms, box) => {
    M.frames = [];
    // From the first frame: the timeline's time stands still while nothing
    // is drawn, so a time read before it is stale.
    let t0 = null;
    // Read once the frame's callbacks have all run, as it is painted, at
    // the time its animations were sampled for.
    const step = () => setTimeout(() => {
      const now = document.timeline.currentTime;
      if (t0 === null) t0 = now;
      const items = {};
      for (const e of document.querySelectorAll(sel)) {
        const key = e.dataset.key || e.dataset.tab || e.dataset.ghostTab || e.classList[0];
        if (!key) continue;
        const r = e.getBoundingClientRect();
        items[key] = [r.x, r.y, r.width, r.height, +getComputedStyle(e).opacity];
      }
      const c = box && document.querySelector(box);
      const cr = c && c.getBoundingClientRect();
      M.frames.push({ t: now - t0, items, box: cr ? [cr.y, cr.bottom] : null });
      if (now - t0 < ms) requestAnimationFrame(step);
    });
    requestAnimationFrame(step);
  };
  return M;
})(); true
"""


def sample(sel, action, ms=1000, box=None):
    """Frames of `sel` (each by data-key, data-tab or data-ghost-tab) from just
    before `action` until `ms` later."""
    b.ui(PROBE)
    b.ui(f"window.__motion.start({json.dumps(sel)}, {ms}, {json.dumps(box)}); true")
    time.sleep(0.08)
    action()
    time.sleep(ms / 1000 + 0.3)
    return json.loads(b.ui("JSON.stringify(window.__motion.frames)"))


X, Y, W, H, O = range(5)


def series(frames, key, field):
    return [(f["t"], f["items"][key][field]) for f in frames if key in f["items"]]


def glides(name, s, want_from, want_to, spec=SETTLE, tol=0.7, floor=1.2, clamped=False):
    """`s` [(t, v)] goes from want_from to want_to following `spec` in time."""
    if not s:
        return t.ok(False, f"{name}: never drawn")
    v0, v1 = s[0][1], s[-1][1]
    dist = want_to - want_from
    ok_ends = abs(v0 - want_from) <= tol and abs(v1 - want_to) <= tol
    if not t.ok(ok_ends, f"{name}: from {want_from:.1f} to {want_to:.1f} ({v0:.2f} → {v1:.2f})"):
        return False
    moved = [tt for tt, v in s if abs(v - v0) > 0.02 * abs(dist) + 0.05]
    if not moved:
        return t.ok(False, f"{name}: never moved")
    first = moved[0]
    prev_t = max([tt for tt, v in s if tt < first] or [first - 17])
    curve = (lambda u: min(1.0, spring_at(spec, u))) if clamped else (lambda u: spring_at(spec, u))
    ideal = lambda t0, tt: v0 + dist * curve((tt - t0) / 1000)
    best = None
    t0 = prev_t - 20
    while t0 <= first:
        dev = max(abs(v - ideal(t0, tt)) for tt, v in s)
        if best is None or dev < best[0]:
            best = (dev, t0)
        t0 += 0.25
    dev, t0 = best
    allowed = max(floor, 0.06 * abs(dist))
    t.ok(dev <= allowed, f"{name}: on the spring all the way, at most {dev:.2f} off (≤ {allowed:.2f})")
    # No step out of the spring between two frames: a layout that snaps, then glides.
    worst = 0.0
    for (ta, va), (tb, vb) in zip(s, s[1:]):
        step = abs(vb - va) - abs(ideal(t0, tb) - ideal(t0, ta))
        worst = max(worst, step)
    t.ok(worst <= max(floor * 0.8, 0.08 * abs(dist)), f"{name}: no frame jumps ahead of the spring ({worst:.2f} at most)")
    # The Mac's time: within 1% of the end for good.
    # Frames missed (a busy machine, other tests beside) leave the crossing
    # somewhere in the gap: between the last frame still out and the next.
    near = 0.01 * abs(dist)
    out = [i for i, (tt, v) in enumerate(s) if abs(v - v1) > near]
    last = out[-1] if out else 0
    lo = s[last][0] - t0
    hi = (s[last + 1][0] if last + 1 < len(s) else s[last][0]) - t0
    mac = rest_time(spec, 0.01, clamped)
    took = f"{lo:.0f}" if hi - lo < 20 else f"{lo:.0f}–{hi:.0f}"
    return t.ok(lo - 45 <= mac <= hi + 45, f"{name}: rests in {took} ms, the Mac's spring in {mac:.0f} ms")


def fades(name, s, frm, to, spec=SETTLE):
    """Opacity from `frm` to `to` on the spring, never at full size gone in one frame."""
    if not s:
        return t.ok(False, f"{name}: never drawn")
    vals = [v for _, v in s]
    ok = abs(vals[0] - frm) <= 0.05 and abs(vals[-1] - to) <= 0.02
    mono = all((b2 - a) * (to - frm) >= -0.01 for a, b2 in zip(vals, vals[1:]))
    t.ok(ok and mono, f"{name}: opacity {frm} → {to}, steadily ({vals[0]:.2f} → {vals[-1]:.2f})")
    return glides(name + " (opacity)", s, frm, to, spec, tol=0.03, floor=0.05, clamped=True)


def still(name, s, tol=0.6):
    vals = [v for _, v in s]
    return t.ok(vals and max(vals) - min(vals) <= tol, f"{name}: stays where it was ({min(vals or [0]):.2f}–{max(vals or [0]):.2f})")


def started_together(name, a, b2, tol=20):
    def start(s):
        v0 = s[0][1]
        m = [tt for tt, v in s if abs(v - v0) > 0.05]
        return m[0] if m else None
    sa, sb = start(a), start(b2)
    return t.ok(sa is not None and sb is not None and abs(sa - sb) <= tol, f"{name} ({sa and round(sa)} and {sb and round(sb)} ms)")


def tabs():
    return [x for x in b.window()["tabs"]]


def open_tabs(n, prefix="t"):
    b.cmd("tab.go", input=f"data:text/html,<title>{prefix}0</title>{prefix}0")
    for i in range(1, n):
        b.cmd("tab.new", url=f"data:text/html,<title>{prefix}{i}</title>{prefix}{i}")
    b.wait_for(lambda: len(tabs()) == n and all(x["title"] for x in tabs()), what=f"{n} tabs")
    time.sleep(1.0)


# ---------------------------------------------------------------- the column
b.use("ui-motion")
b.launch(*k.FRAMES, env={"SEARCH_LOOK": "light"})
time.sleep(0.8)
open_tabs(6)
ids = [x["id"] for x in tabs()]
ROWS = ".rows .line"

# Closing a tab in the middle: it fades where it is, scaling to 0.94 from its
# leading edge, under the rows below closing up 30 on settle.
gone = ids[2]
fr = sample(ROWS, lambda: b.cmd("tab.close", id=gone), box=".rows")
g = f"t:{gone}"
y0 = series(fr, g, Y)[0][1]
still("column, closing row: its left edge", series(fr, g, X))
fades("column, closing row", series(fr, g, O), 1, 0)
glides("column, closing row: its height (scale 0.94)", series(fr, g, H), 28, 28 * 0.94)
below = f"t:{ids[3]}"
glides("column, the row below", series(fr, below, Y), y0 + 30, y0)
glides("column, New tab at the end", series(fr, "new", Y), series(fr, "new", Y)[0][1], series(fr, "new", Y)[0][1] - 30)
started_together("column: the rows below start as the closing row starts going", series(fr, g, O), series(fr, below, Y))
still("column, the row above", series(fr, f"t:{ids[1]}", Y))
gone_at = max(f["t"] for f in fr if g in f["items"])
t.ok(gone_at < 1000 and all(g not in f["items"] for f in fr[-5:]), f"column: the closing row is let go once it has gone ({gone_at:.0f} ms)")
# The closing row is drawn under the rows coming up over it (the stack's order).
b.cmd("tab.close", id=ids[4])
time.sleep(0.12)
z = k.js("const z = s => [...document.querySelectorAll(s)].map(e => +getComputedStyle(e).zIndex); return [z('.rows .line.leaving:not(.wash)'), z('.rows .line[data-kind=row]:not(.leaving)')]")
t.ok(z[0] and z[1] and max(z[0]) < min(z[1]), f"column: the closing row under the rows closing up over it (z {z})")
time.sleep(0.6)

# Closing the last tab: New tab comes up 30 and is never cut off by the rows' box.
ids = [x["id"] for x in tabs()]
gone = ids[-1]
fr = sample(ROWS, lambda: b.cmd("tab.close", id=gone), box=".rows")
ny = series(fr, "new", Y)
glides("column, closing the last tab: New tab", ny, ny[0][1], ny[0][1] - 30)
clipped = []
for f in fr:
    top, bottom = f["box"]
    for key, (x, y, w, h, o) in f["items"].items():
        if o > 0.02 and (y + h > bottom + 0.5 or y < top - 0.5):
            clipped.append((round(f["t"]), key[:10], round(y + h - bottom, 1)))
t.ok(not clipped, f"column: nothing cut off by the rows' box while it closes up ({clipped[:3]})")
box_bottom = [(f["t"], f["box"][1]) for f in fr]
glides("column: the rows' box shrinks with them", box_bottom, box_bottom[0][1], box_bottom[0][1] - 30)

# Opening a tab: it scales in from 0.94 and fades in at its place, New tab
# moving down 30 on settle; the rows' box is there for it at once.
before = {x["id"] for x in tabs()}
ny0 = k.js("const e = document.querySelector('.rows .line[data-key=new]'); return e.getBoundingClientRect().y")
fr = sample(ROWS, lambda: b.cmd("tab.new", url="data:text/html,<title>new</title>new"), box=".rows")
made = next(x["id"] for x in tabs() if x["id"] not in before)
m = f"t:{made}"
ms = series(fr, m, O)
t.ok(ms and ms[0][1] <= 0.15, f"column, the new row: comes from clear, not at once ({ms and round(ms[0][1], 2)})")
fades("column, the new row", ms, 0, 1)
glides("column, the new row: its height (from 0.94)", series(fr, m, H), 28 * 0.94, 28)
my = series(fr, m, Y)
still("column, the new row: at its place from the first frame", [(tt, v) for tt, v in my], tol=1.0)
glides("column, New tab making room", series(fr, "new", Y), ny0, ny0 + 30)

# A press on the tab you're on: its address comes into the row on glide
# (Side.swift:2283): the row keeps its frame, the mark and the title fade
# where they stood as the field fades in; Escape and they fade back. Short
# and long addresses, the column narrow and wide.
LIVE_ROW = ".row.live, .row.live .body > .mark, .row.live .body > .titles, .row.live .field-tab-input"
for width, (name, url) in [(232, SHORT), (232, LONG), (180, LONG), (400, SHORT)]:
    b.cmd("sidebar.resize", width=width)
    b.cmd("tab.go", input=url)
    b.wait_for(lambda: b.active()["url"] == url and not b.active().get("loading"), what=f"{name} page")
    time.sleep(0.8)
    live = b.active()["id"]
    label = f"column {width}, {name} address"
    fr = sample(LIVE_ROW, lambda: b.cmd("field.editTab", id=live), ms=900)
    still(f"{label}: the row keeps its place", series(fr, live, X))
    still(f"{label}: …and its width", series(fr, live, W))
    still(f"{label}: the title fades where it stood", series(fr, "titles", X))
    fades(f"{label}: the title", series(fr, "titles", O), 1, 0, GLIDE)
    fades(f"{label}: the mark", series(fr, "mark", O), 1, 0, GLIDE)
    fi = series(fr, "field-tab-input", O)
    t.ok(fi and fi[0][1] <= 0.15, f"{label}: the field comes from clear ({fi and round(fi[0][1], 2)})")
    fades(f"{label}: the field", fi, 0, 1, GLIDE)
    row = series(fr, live, X)[-1][1], series(fr, live, W)[-1][1]
    fx = [(x, w) for x, w in ((v[X], v[W]) for f in fr for kk, v in f["items"].items() if kk == "field-tab-input")]
    t.ok(all(x >= row[0] + 9.5 and x + w <= row[0] + row[1] - 9.5 for x, w in fx), f"{label}: the field within the row, 10 from either side")
    fr = sample(LIVE_ROW, lambda: b.cmd("field.tabCancel"), ms=800)
    fades(f"{label}, Escape: the title back", series(fr, "titles", O), 0, 1, GLIDE)
b.cmd("sidebar.resize", width=232)
b.quit()

# ---------------------------------------------------- Ctrl+S, the column folding
# Away on the fold-in spring (0.13 / 1.0), back on the fold-out one (0.14 /
# 0.86) (Design.swift Motion.fold, Fold.swift moveColumn), the page with it:
# each frame the card's edge is beside the column's and the page view is put
# there in that frame (the main process's placements, window.pageTrace).
FOLD_IN, FOLD_OUT = (0.13, 1.0), (0.14, 0.86)
FOLD_PROBE = r"""
window.__fold = (() => {
  const M = { frames: [] };
  M.start = ms => {
    M.frames = []; let t0 = null;
    const step = () => setTimeout(() => {
      const now = document.timeline.currentTime; if (t0 === null) t0 = now;
      const c = document.querySelector('.card').getBoundingClientRect();
      const s = document.querySelector('.window > .sidebar > .side-body');
      M.frames.push({ t: now - t0, at: performance.timeOrigin + now, card: [c.x, c.y, c.width, c.height], col: s ? s.getBoundingClientRect().x : null });
      if (now - t0 < ms) requestAnimationFrame(step);
    });
    requestAnimationFrame(step);
  };
  return M;
})(); true
"""
b.use("ui-motion-fold")
b.launch(*k.FRAMES, env={"SEARCH_LOOK": "light"})
time.sleep(0.8)
b.cmd("tab.go", input="data:text/html,<title>page</title><body style='background:%23fd8'>a page")
b.wait_for(lambda: b.active()["title"] == "page", what="a page")
time.sleep(1.0)
docked = k.js("const c = document.querySelector('.card').getBoundingClientRect(); return [c.x, c.y, c.width, c.height]")
col0 = k.js("return document.querySelector('.window > .sidebar > .side-body').getBoundingClientRect().x")
gap = k.js("return parseFloat(getComputedStyle(document.querySelector('.window')).getPropertyValue('--card-gap'))")
for phase, spec, frm, to in (("away", FOLD_IN, docked[0], None), ("back", FOLD_OUT, None, docked[0])):
    b.ui(FOLD_PROBE)
    b.call({"do": "window.pageTrace", "on": True})
    b.ui("window.__fold.start(700); true")
    time.sleep(0.08)
    b.cmd("sidebar.toggle")
    time.sleep(1.0)
    trace = b.call({"do": "window.pageTrace", "on": False})["trace"]
    fr = json.loads(b.ui("JSON.stringify(window.__fold.frames)"))
    folded_x = docked[0] - 232 + gap
    frm = folded_x if frm is None else frm
    to = folded_x if to is None else to
    label = f"Ctrl+S, the column {phase}"
    cx = [(f["t"], f["card"][0]) for f in fr]
    glides(f"{label}: the page's card", cx, frm, to, spec)
    cols = [(f["t"], f["col"]) for f in fr if f["col"] is not None]
    glides(f"{label}: the column", cols, col0 if phase == "away" else col0 - 232, col0 - 232 if phase == "away" else col0, spec)
    apart = [round(f["card"][0] - f["col"], 2) for f in fr if f["col"] is not None]
    t.ok(apart and min(apart) >= 232 - 0.6 and max(apart) <= 232 + gap + 0.6,
         f"{label}: the card's edge beside the column's every frame, never under it nor parted past the gap ({min(apart or [0])}–{max(apart or [0])})")
    # The page view, where the main process put it: in step with each frame.
    moving = [f for f in fr if abs(f["card"][0] - frm) > 0.5 and abs(f["card"][0] - to) > 0.5]
    missed = [round(f["t"]) for f in moving
              if not any(abs(p["rect"]["x"] - f["card"][0]) <= 1 and f["at"] - 3 <= p["t"] <= f["at"] + 12 for p in trace)]
    t.ok(moving and len(missed) <= 1, f"{label}: the page view put at the card's edge in each frame it moves ({len(moving)} frames, missed {missed[:4]})")
    xs = [p["rect"]["x"] for p in trace]
    xs = [x for i, x in enumerate(xs) if i == 0 or x != xs[i - 1]]
    steps = [abs(b2 - a) for a, b2 in zip(xs, xs[1:])]
    worst = max([s2 - 2.5 * max(steps[i - 1] if i else 0, steps[i + 1] if i + 1 < len(steps) else 0) for i, s2 in enumerate(steps)] or [0])
    t.ok(len(xs) > 8 and worst <= 2, f"{label}: the page view moves in even steps, none much bigger than the ones beside it ({len(xs)} places)")
    end = trace[-1]["rect"] if trace else None
    want = [round(v) for v in fr[-1]["card"]]
    t.ok(end and [end["x"], end["y"], end["width"], end["height"]] == want and abs(want[0] - round(to)) <= 1,
         f"{label}: the page view ends where the card does ({end} / {want})")
b.quit()

# ------------------------------------------------------ a group's last tab, a pin
b.use("ui-motion-group")
b.launch(*k.FRAMES, env={"SEARCH_LOOK": "light"})
time.sleep(0.8)
open_tabs(4, "g")
ids = [x["id"] for x in tabs()]
gid = b.cmd("group.new", ids=[ids[1]])
b.cmd("group.colour", id=gid, colour=1)
time.sleep(0.8)
keys = k.js("return [...document.querySelectorAll('.rows .line')].map(e => e.dataset.key)")
t.ok(f"g:{gid}" in keys and f"w:{gid}" in keys, f"a blue group of one, its heading and wash drawn ({len(keys)} lines)")
fr = sample(ROWS, lambda: b.cmd("group.close", id=gid))
fades("group's last tab closing: its heading", series(fr, f"g:{gid}", O), 1, 0)
fades("…its wash, with it rather than gone at once", series(fr, f"w:{gid}", O), 1, 0)
still("…its heading stays where it was", series(fr, f"g:{gid}", Y))
rest = [x["id"] for x in tabs() if x["id"] != ids[1]]
ry = series(fr, f"t:{rest[1]}", Y)
glides("…the rows under it come up on settle", ry, ry[0][1], ry[-1][1])
t.ok(ry[0][1] - ry[-1][1] > 40, f"…by the heading, the row and their gaps ({ry[0][1] - ry[-1][1]:.0f})")

# A pin's square going (unpinned to a row): the rows under the grid follow its height on settle.
b.cmd("tab.pin", id=rest[0])
time.sleep(0.9)
fr = sample(".rows .line, .pins .square", lambda: b.cmd("tab.unpin", id=rest[0]))
ny = series(fr, "new", Y)
glides("unpinning the only pin: New tab follows the grid's height on settle", ny, ny[0][1], ny[-1][1])
b.quit()

# ---------------------------------------------------------- across the top
b.use("ui-motion-strip")
(b.folder()).mkdir(parents=True, exist_ok=True)
(b.folder() / "prefs.json").write_text(json.dumps({"tabs.layout": "top"}))
b.launch(*k.FRAMES, env={"SEARCH_LOOK": "light"})
time.sleep(0.8)
open_tabs(7)
ids = [x["id"] for x in tabs()]
TABS = ".strip-row .strip-tab"
w_before = k.js("return [...document.querySelectorAll('.strip-tab')].map(e => e.getBoundingClientRect().width)")
t.ok(len(set(round(w, 1) for w in w_before)) == 1 and w_before[0] < 186, f"seven tabs share the room, narrower than 186 ({w_before[0]:.1f})")

# Closing a tab in the middle: it stays where it was, scaling to 0.9 from its
# leading edge as it fades; those after it come left and every tab widens to
# the new share on settle.
gone = ids[2]
fr = sample(TABS, lambda: b.cmd("tab.close", id=gone))
w0 = series(fr, gone, W)[0][1]
x0 = series(fr, gone, X)[0][1]
still("strip, closing tab: its left edge", series(fr, gone, X))
fades("strip, closing tab", series(fr, gone, O), 1, 0)
glides("strip, closing tab: its width (scale 0.9)", series(fr, gone, W), w0, w0 * 0.9)
after = k.js("return [...document.querySelectorAll('.strip-tab')].map(e => [e.dataset.tab, e.getBoundingClientRect().x, e.getBoundingClientRect().width])")
share = after[0][2]
t.ok(len(after) == 6 and all(abs(a[2] - share) < 0.6 for a in after), f"…six left, one width each ({share:.1f})")
for i in (0, 1, 3, 4, 6):
    tid = ids[i]
    end = next(a for a in after if a[0] == tid)
    glides(f"strip, tab {i}: its width", series(fr, tid, W), w0, end[2])
    if i:
        glides(f"strip, tab {i}: its left edge", series(fr, tid, X), series(fr, tid, X)[0][1], end[1])
    else:
        still("strip, the first tab: its left edge", series(fr, tid, X))
started_together("strip: the others start as the closing tab starts going", series(fr, gone, O), series(fr, ids[3], X))
t.ok(all(gone not in f["items"] for f in fr[-5:]), "strip: the closing tab is let go once it has gone")

# Opening a tab: it comes at its place, from clear and 0.9, while the others
# narrow on settle to make room.
before = {x["id"] for x in tabs()}
fr = sample(TABS, lambda: b.cmd("tab.new", url="data:text/html,<title>new</title>new"))
made = next(x["id"] for x in tabs() if x["id"] not in before)
end = k.js(f"const e = document.querySelector('.strip-tab[data-tab=\"{made}\"]'); const r = e.getBoundingClientRect(); return [r.x, r.width]")
ms = series(fr, made, O)
t.ok(ms and ms[0][1] <= 0.15, f"strip, the new tab: comes from clear ({ms and round(ms[0][1], 2)})")
fades("strip, the new tab", ms, 0, 1)
glides("strip, the new tab: its width (from 0.9)", series(fr, made, W), end[1] * 0.9, end[1])
still("strip, the new tab: its left edge at its place from the first frame", series(fr, made, X), tol=1.0)
first = ids[0]
fx = series(fr, first, W)
glides("strip, the first tab narrowing", fx, fx[0][1], end[1])

# A press on the tab you're on, across the top: it widens to 340 on glide
# (TabBar.swift:991, :337), never past the strip's room, its mark and title
# fading as the field fades in. With the tabs filling the row, the last tab
# widening stays in sight: the run follows its far edge every frame instead
# of leaving it cut off past the strip's end.
EDIT = ".strip-row, .strip-tab.live, .strip-tab.live > .mark, .strip-tab.live > .strip-title, .strip-tab.live .field-tab-input"


def strip_edit(label, others):
    live = b.active()["id"]
    each = k.js(f"return document.querySelector('.strip-tab[data-tab=\"{live}\"]').getBoundingClientRect().width")
    room = k.js("const s = document.querySelector('.strip-row'); return s.getBoundingClientRect().width")
    before = {o: k.js(f"return document.querySelector('.strip-tab[data-tab=\"{o}\"]').getBoundingClientRect().x") for o in others}
    fr = sample(EDIT, lambda: b.cmd("field.editTab", id=live), ms=900)
    want = min(340, k.js("const b = document.querySelector('.tabbar'); const n = document.querySelector('.strip-near'); return b.clientWidth - parseFloat(getComputedStyle(b).paddingRight) - 12 - (n ? n.offsetWidth + 2 : 0) - 12"))
    glides(f"{label}: the tab widens", series(fr, live, W), each, want, GLIDE)
    fades(f"{label}: its title", series(fr, "strip-title", O), 1, 0, GLIDE) if series(fr, "strip-title", O) else None
    fades(f"{label}: its mark", series(fr, "mark", O), 1, 0, GLIDE)
    fi = series(fr, "field-tab-input", O)
    t.ok(fi and fi[0][1] <= 0.15, f"{label}: the field comes from clear ({fi and round(fi[0][1], 2)})")
    fades(f"{label}: the field", fi, 0, 1, GLIDE)
    out, jumps, prev = [], 0.0, None
    for f in fr:
        if live in f["items"] and "strip-row" in f["items"]:
            x, _, w, _, _ = f["items"][live]
            rx, _, rw, _, _ = f["items"]["strip-row"]
            if x + w > rx + rw + 0.6 or x < rx - 0.6:
                out.append((round(f["t"]), round(x + w - rx - rw, 1)))
            if prev:
                jumps = max(jumps, abs(x - prev[0]) - abs(w - prev[1]))
            prev = (x, w)
    t.ok(not out, f"{label}: never past the strip's ends while it widens ({out[:3]}, the row {room:.0f} wide)")
    t.ok(jumps <= 0.8, f"{label}: the run moves only as the tab widens, no jump ({jumps:.2f})")
    for o in others:
        now = k.js(f"return document.querySelector('.strip-tab[data-tab=\"{o}\"]').getBoundingClientRect().x")
        t.ok(abs(now - before[o]) < 0.6, f"{label}: the tab before it stays where it was ({before[o]:.1f} → {now:.1f})")
    fr = sample(EDIT, lambda: b.cmd("field.tabCancel"), ms=800)
    glides(f"{label}, Escape: the tab narrows back", series(fr, live, W), want, each, GLIDE)
    fades(f"{label}, Escape: its mark back", series(fr, "mark", O), 0, 1, GLIDE)


ids = [x["id"] for x in tabs()]
strip_edit("strip, tabs filling the row, the last one's address", [])
for x in ids[:-3]:
    b.cmd("tab.close", id=x)
time.sleep(0.8)
for name, url in (SHORT, LONG):
    b.cmd("tab.go", input=url)
    b.wait_for(lambda: b.active()["url"] == url and not b.active().get("loading"), what=f"{name} page")
    time.sleep(0.8)
    left = [x["id"] for x in tabs()]
    strip_edit(f"strip, three tabs, a {name} address", [i for i in left if i != b.active()["id"]][:1])

# The window resized: the tabs follow at once, not on settle.
t.ok(k.js("return getComputedStyle(document.querySelector('.strip-tab')).transitionProperty").startswith("width"), "tabs widen on settle as tabs come and go")
k.js("document.querySelector('.tabbar').classList.add('resizing'); return 1")
t.ok(k.js("return getComputedStyle(document.querySelector('.strip-tab')).transitionProperty") in ("all", "none") or
     k.js("return getComputedStyle(document.querySelector('.strip-tab')).transitionDuration") == "0s", "…and at once while the window resizes")
t.done()

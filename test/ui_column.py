#!/usr/bin/env python3
"""The column's look, measured in the DOM against the Mac's numbers
(studio/02 §4.2, §2.2, §3.3, §6; studio/01 §5.5-§5.22, §6.2, §6.25, §6.48,
§7.11), on the window states in test/fixtures. SHOTS_DIR=<folder> keeps a
picture of each, light and dark."""
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b  # noqa: E402
import ui_kit as k  # noqa: E402

SHOTS = os.environ.get("SHOTS_DIR")
b.use("ui-column")
b.launch(*k.FRAMES, env={"SEARCH_LOOK": "light"})
t = b.T()
time.sleep(0.8)


def shot(name):
    if SHOTS:
        try:
            b.shot(Path(SHOTS) / f"{name}.png")
        except RuntimeError as e:  # the display asleep: no picture, the measures stand
            print(f"  (no picture of {name}: {e})")


def lines(kind=None):
    sel = ".rows .line" + (f"[data-kind={kind}]" if kind else "")
    return k.js(f"return [...document.querySelectorAll('{sel}')].map(e => {{ const r = rel(e.getBoundingClientRect());"
                " return { key: e.dataset.key, x: r.x, y: r.y, w: r.width, h: r.height } })")


# --- many tabs, pins, two groups (light) ---
s = k.fixture("many")
k.fake(s, look="light")
time.sleep(0.6)
shot("column-many-light")
side = k.rect(".sidebar")
t.ok(k.near(side["w"], 232), f"the column is 232 wide: {side['w']}")
band = k.rect(".band")
t.ok(k.near(band["h"], 52), f"its band is 52 high: {band['h']}")
doors = k.js("return [...document.querySelectorAll('.helm > .door')].map(e => { const r = rel(e.getBoundingClientRect()); return [r.x, r.y, r.width, r.height, getComputedStyle(e).borderTopLeftRadius] })")
t.ok(len(doors) == 3, "back, forward and reload")
t.ok(k.near(doors[0][0], 10) and k.near(doors[1][0], 40) and k.near(doors[2][0], 70), f"doors from the edge, 26 + 4 apart (Windows: no lights): {[d[0] for d in doors]}")
t.ok(all(k.near(d[2], 26) and k.near(d[3], 26) and d[4] == "8px" for d in doors), "each door 26 × 26, radius 8")
t.ok(k.near(doors[0][1] + 13, 26), f"centred in the band: {doors[0][1] + 13}")
t.ok(k.js("return [...document.querySelectorAll('.helm > .door')].slice(0, 2).every(e => e.disabled && getComputedStyle(e).opacity === '0.5')"), "with nowhere to go, back and forward dimmed to half (Search 1.0.22)")

sq = k.js("return [...document.querySelectorAll('.square')].map(e => { const r = rel(e.getBoundingClientRect()); return [r.x, r.y, r.width, r.height, getComputedStyle(e.querySelector('.ground')).borderTopLeftRadius, getComputedStyle(e.querySelector('.ground')).backgroundColor] })")
t.ok(len(sq) == 4, f"four pinned squares: {len(sq)}")
t.ok([round(x[0]) for x in sq] == [10, 64, 118, 172] and all(k.near(x[2], 50) and k.near(x[3], 34) for x in sq),
     f"one row of four, 50 × 34, 4 apart, filling 212: {[(round(x[0]), x[2], x[3]) for x in sq]}")
t.ok(all(x[4] == "9px" for x in sq), "squares' radius 9 at 34")
t.ok(k.same_colour(sq[0][5], "rgba(0, 0, 0, 0.0314)"), f"a resting square on the frame's tile grey: {sq[0][5]}")
letter = k.style(".square .pin-letter", "font-size", "font-weight", "color")
t.ok(letter["font-size"] == "12px" and letter["font-weight"] == "500", f"its letter 12 medium: {letter}")

ls = lines()
first = ls[0]
t.ok(k.near(first["y"], 52 + 34 + 10), f"the rows start 10 under the squares: {first['y']}")
g = lines("group")
t.ok(len(g) == 2 and all(k.near(x["h"], 24) for x in g), f"group headings 24 high: {[x['h'] for x in g]}")
rows = lines("row")
in_group = [r for r in rows if k.near(r["x"], 24)]
t.ok(len(in_group) == 3, f"the open group's three tabs set in by 14: {len(in_group)}")
t.ok(k.near(in_group[0]["w"], 232 - 20 - 14 - 4), f"…and 4 in from the right, the group being coloured: {in_group[0]['w']}")
t.ok(k.near(in_group[0]["y"], g[0]["y"] + 24 + 2), "2 under the heading")
t.ok(all(k.near(r["h"], 28) for r in rows), "rows 28 high")
loose = [r for r in rows if k.near(r["x"], 10)]
steps = {round(b2["y"] - a["y"], 2) for a, b2 in zip(loose, loose[1:])}
t.ok(steps == {30.0}, f"2 between the rows: {steps}")
t.ok(len(rows) == 3 + 15, f"the folded group shows none but the tab in front: {len(rows)} rows")
wash = k.js("const e = document.querySelector('.line[data-kind=wash] .group-wash'); return e && getComputedStyle(e).backgroundColor")
t.ok(wash == "rgba(66, 133, 245, 0.07)", f"the blue group's wash at 7%: {wash}")
head = k.style(".group-heading .name", "font-size", "font-weight", "color")
t.ok(head["font-size"] == "12.5px" and head["font-weight"] == "500" and head["color"] == "rgb(140, 140, 140)", f"its name 12.5 medium, muted: {head}")

# The live grey glides in, then fades onto the row (quick): on a busy machine
# (tests in parallel) that can outlast the pause above.
try:
    b.wait_for(lambda: k.same_colour(k.js("return getComputedStyle(document.querySelector('.row.live .ground')).backgroundColor"), "rgba(0, 0, 0, 0.0628)"), within=3, what="the live grey")
except AssertionError:
    pass
live = k.js("const e = document.querySelector('.row.live'); const g = e.querySelector('.ground'); const m = e.querySelector('.mark').getBoundingClientRect();"
            " const r = e.getBoundingClientRect(); const ti = e.querySelector('.titles').getBoundingClientRect();"
            " return { bg: getComputedStyle(g).backgroundColor, radius: getComputedStyle(g).borderTopLeftRadius, mx: m.x - r.x, mw: m.width, mh: m.height,"
            " mr: getComputedStyle(e.querySelector('.mark')).borderTopLeftRadius, tx: ti.x - r.x,"
            " rest: e.querySelector('.rest')?.textContent, name: e.querySelector('.rest-name') && getComputedStyle(e.querySelector('.rest-name')).fontWeight,"
            " size: getComputedStyle(e.querySelector('.rest')).fontSize }")
t.ok(k.same_colour(live["bg"], "rgba(0, 0, 0, 0.0628)") and live["radius"] == "9px", f"the tab in front on the frame's wash grey, radius 9: {live['bg']}")
t.ok(k.near(live["mx"], 10) and k.near(live["mw"], 15) and k.near(live["mh"], 15), f"the mark 15, 10 in: {live}")
t.ok(live["mr"] == "3.3px", f"the mark's radius 22%: {live['mr']}")
t.ok(k.near(live["tx"], 10 + 15 + 8), f"the title 8 after the mark: {live['tx']}")
t.ok(live["rest"] == "figma.com" and live["name"] == "500" and live["size"] == "12.5px", f"the site at rest in its title's place, medium: {live['rest']}")
other = k.style(".row:not(.live):not(.put-away) .title", "color", "font-size")
t.ok(k.same_colour(other["color"], "rgba(0, 0, 0, 0.4241)") and other["font-size"] == "12.5px", f"other titles 12.5 in the frame's muted grey: {other}")
letter = k.style(".row .mark .letter", "font-size", "font-weight", "background-color", "color")
t.ok(letter["font-size"] == "8.4px" and letter["font-weight"] == "500" and letter["background-color"] == "rgba(23, 23, 23, 0.06)",
     f"the site's letter 8.4 medium on ink at 6%: {letter}")
put = k.js("const e = document.querySelector('.row.put-away .titles'); return e && getComputedStyle(e).opacity")
t.ok(put == "0.45", f"a grouped tab with its page put away, dimmed to 0.45: {put}")
ring = k.js("const e = document.querySelector('.row .state .ring'); if (!e) return null; const c = e.querySelector('circle');"
            " return [+e.getAttribute('width'), c.getAttribute('stroke-width'), getComputedStyle(e).animationDuration, getComputedStyle(e).opacity]")
t.ok(ring and k.near(ring[0], 10) and ring[1] == "1.4" and ring[2] == "0.85s" and ring[3] == "0.7", f"the ring 10, a stroke of 1.4, round in 0.85 s, at 70%: {ring}")
spk = k.rect(".row .state .speaker")
t.ok(spk and k.near(spk["w"], 15), "the speaker on a 15 box")
newtab = k.js("const e = document.querySelector('.quiet'); return [getComputedStyle(e).color, e.textContent, e.getBoundingClientRect().height]")
t.ok(k.same_colour(newtab[0], "rgba(0, 0, 0, 0.1309)") and newtab[1] == "New tab" and k.near(newtab[2], 28), f"New tab, faint, a row high: {newtab}")
foot = k.wrect(".foot")
t.ok(k.near(foot["h"], 36) and k.near(foot["y"] + foot["h"], k.rect(".window")["h"], tol=40), f"the foot 36 high at the bottom: {foot}")
mask = k.js("return [...document.styleSheets].flatMap(s => { try { return [...s.cssRules] } catch { return [] } }).some(r => r.cssText.includes('.row.closable:not(.status):hover .body') && r.cssText.includes('calc(100% - 42px)') && r.cssText.includes('calc(100% - 26px)'))")
t.ok(mask, "under the pointer the title fades under the cross: 16 of gradient, 26 clear")
x = k.js("return [...document.styleSheets].flatMap(s => { try { return [...s.cssRules] } catch { return [] } }).find(r => r.selectorText === '.row .x')?.cssText")
t.ok(x and "width: 30px" in x and "right: -0.5px" in x, "the cross's reach 30 wide, its disc 7 from the end")

cal = k.js("const e = document.querySelector('.row .title'); const s = document.createElement('span'); s.style.cssText = 'position:absolute;white-space:nowrap';"
           " const c = getComputedStyle(e); for (const k of ['fontFamily', 'fontSize', 'fontWeight', 'letterSpacing', 'fontFeatureSettings']) s.style[k] = c[k]; document.body.appendChild(s);"
           " const w = ['Rec…', 'Wea…'].map(t => { s.textContent = t; return s.getBoundingClientRect().width }); s.remove(); return w")
# Plus Jakarta Sans at 0em (the user's typeface, main 80f8b50): 31.41 and
# 35.09 against SF Pro's 32 and 35, so within 0.7 rather than respaced.
t.ok(k.near(cal[0], 32, 0.7) and k.near(cal[1], 35, 0.7), f"titles as wide as SF Pro's: 'Rec…' 32, 'Wea…' 35 at 12.5 (Design.swift:224): {cal}")

# dark
k.fake(s, look="dark")
time.sleep(0.4)
shot("column-many-dark")
d = k.js("return [getComputedStyle(document.querySelector('.row.live .ground')).backgroundColor, getComputedStyle(document.querySelector('.square .ground')).backgroundColor,"
         " getComputedStyle(document.querySelector('.row:not(.live):not(.put-away) .title')).color]")
t.ok(all(k.same_colour(a, w) for a, w in zip(d, ["rgba(255, 255, 255, 0.0865)", "rgba(255, 255, 255, 0.0432)", "rgba(255, 255, 255, 0.5459)"])), f"dark: the frame's greys in white: {d}")
wash = k.js("const e = document.querySelector('.line[data-kind=wash] .group-wash'); return e && getComputedStyle(e).backgroundColor")
t.ok(wash == "rgba(66, 133, 245, 0.11)", f"…the group's wash at 11%: {wash}")

# --- pinned rows and folders ---
k.fake(k.fixture("pin-rows"), look="light")
time.sleep(0.6)
shot("column-pin-rows-light")
sq = k.js("return [...document.querySelectorAll('.square')].map(e => { const r = e.getBoundingClientRect(); return [Math.round(r.x), r.width] })")
t.ok(len(sq) == 2 and all(k.near(w, 68) for _, w in sq), f"two squares keep a row of three places: {sq}")
folders = k.js("return [...document.querySelectorAll('.folder-heading')].map(e => [e.querySelector('.name').textContent, parseFloat(getComputedStyle(e).paddingLeft), e.classList.contains('folded'), e.getBoundingClientRect().height])")
t.ok([f[0] for f in folders] == ["Writing", "Work", "Later"], f"folders in their order: {[f[0] for f in folders]}")
t.ok([f[1] for f in folders] == [10, 24, 10], f"set in 14 a level: {[f[1] for f in folders]}")
t.ok(folders[2][2] and all(k.near(f[3], 28) for f in folders), "Later folded; headings a row high")
order = k.js("return [...document.querySelectorAll('.rows .line')].sort((a, b) => a.getBoundingClientRect().y - b.getBoundingClientRect().y).map(e => e.querySelector('.name, .title, .quiet-title')?.textContent || e.dataset.key)")
t.ok(order[:7] == ["Writing", "Work", "Linear", "Docs", "Sheets", "Later", "Oriel"], f"each level's folders, then its pins; Reddit hidden in Later: {order[:8]}")
keep = lines("keep")
t.ok(len(keep) == 1 and k.near(keep[0]["h"], 18), "the keep line, 18 high, between what stays and what goes")
rule = k.style(".keep-line .rule", "height", "background-color")
t.ok(rule["height"] == "1px" and rule["background-color"] == "rgb(232, 232, 232)", f"…a hairline: {rule}")
dot = k.js("const e = document.querySelector('.space-dot'); const r = e.getBoundingClientRect(); return [r.width, r.height, getComputedStyle(e).borderTopLeftRadius]")
t.ok(dot == [26, 26, "8px"], f"the space's icon at the foot, 26, radius 8: {dot}")

# --- spaces: colour and gradient washes ---
s = k.fixture("spaces")
k.fake(s, look="light")
time.sleep(0.5)
shot("column-spaces-light")
w = k.js("const l = [...document.querySelectorAll('.wash-layer')].pop(); return l && [l.style.background, getComputedStyle(document.querySelector('.wash')).position]")
t.ok(w and w[0] == "rgba(66, 133, 245, 0.07)" and w[1] == "fixed", f"Work's blue over the chrome at 7%, the window's size: {w}")
wr, ww = k.rect(".wash"), k.rect(".window")
t.ok(wr and all(k.near(wr[x], ww[x]) for x in ("x", "y", "w", "h")), f"…the drawn window's, never over its clear margin: {wr} in {ww}")
dot = k.js("const e = document.querySelector('.space-dot'); return [getComputedStyle(e).color, getComputedStyle(e).backgroundColor]")
t.ok(dot == ["rgb(66, 133, 245)", "rgba(66, 133, 245, 0.14)"], f"its icon in its colour on 14% of it: {dot}")
studio = s["spaces"][2]["id"]
k.fake({**s, "space": studio}, look="light")
time.sleep(0.5)
shot("column-gradient-light")
w = k.js("const l = [...document.querySelectorAll('.wash-layer')].pop(); return l && l.style.background")
t.ok(w and w.startswith("linear-gradient(135deg") and w.count("rgba(") == 24 and ", 0.18)" in w,
     f"Studio's gradient: 24 stops in OKLab at 135°, Rich at 18%: {w[:80] if w else w}")
k.fake({**s, "space": studio}, look="dark")
time.sleep(0.4)
shot("column-gradient-dark")
w = k.js("const l = [...document.querySelectorAll('.wash-layer')].pop(); return l && l.style.background")
t.ok(w and ", 0.22)" in w, "…22% in the dark")

# --- the column of icons ---
k.fake({**k.fixture("many"), "sidebar": {**k.fixture("many")["sidebar"], "icons": True}}, look="light")
time.sleep(0.5)
shot("column-icons-light")
tiles = k.js("return [...document.querySelectorAll('.tile')].slice(0, 3).map(e => { const r = rel(e.getBoundingClientRect()); return [r.x, r.y, r.width, r.height] })")
t.ok(k.near(k.rect(".sidebar")["w"], 52), "Icons only: 52 wide")
t.ok(all(k.near(x[0], 10) and k.near(x[2], 32) and k.near(x[3], 32) for x in tiles), f"tiles of 32, 10 from the edge: {tiles}")
t.ok(k.near(tiles[1][1] - tiles[0][1], 34), "2 apart")

k.thaw()
t.done()

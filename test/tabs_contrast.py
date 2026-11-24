#!/usr/bin/env python3
"""High contrast text (studio/01 §5.15, studio/02 §2.1-§2.2; Side.swift:1927-1932,
2318-2324, TabBar.swift:1009-1014, 1102, 1129, 1265-1268, Icons.swift:757-782,
TabGroups.swift:108-112, PinFolderViews.swift:127-131): off by default, a tab
that isn't live has its title in the soft grey, as on the Mac (Palette.muted,
white 0.55 light, 0.58 dark, reached by Greys.frame's muted on the column's
ground and Greys.white's on the strip's); with Settings › Appearance › Tabs ›
High contrast text on, in ink (white 0.09, 0.93). So do the pins' letters, the
sites' letters and the group and pin folder headings. Measured in the column
and across the top, light and dark, off and on: first in the real window
through Settings, then on the fixtures."""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b  # noqa: E402
import tabs_kit as tk  # noqa: E402
import ui_kit as uk  # noqa: E402

KEY = "tabs.highContrast"
# Palette.NS (Design.swift:33-35): white levels, light and dark, as 0-255.
MUTED = {"light": 0.55 * 255, "dark": 0.58 * 255}
INK = {"light": 0.09 * 255, "dark": 0.93 * 255}
# Greys.muted (Design.swift:93-98): the title's grey for the ground it lies on.
GREY = {
    ("side", "light"): "rgba(0, 0, 0, 0.4241)", ("side", "dark"): "rgba(255, 255, 255, 0.5459)",
    ("top", "light"): "rgba(0, 0, 0, 0.45)", ("top", "dark"): "rgba(255, 255, 255, 0.5281)",
}

t = b.T()
tk.world("tabs-contrast")
b.launch(*uk.FRAMES, env={"SEARCH_LOOK": "light"})
time.sleep(0.8)


def over(colour, ground):
    """The grey a translucent colour lands on over an opaque ground."""
    c, g = uk.rgba(colour), uk.rgba(ground)
    if len(c) < 4 or len(g) < 3:
        return None
    return [c[i] * c[3] + g[i] * (1 - c[3]) for i in range(3)]


def lands(colour, ground, want, tol=1.5):
    got = over(colour, ground)
    return got is not None and all(abs(x - want) <= tol for x in got)


def shown(colour, ground):
    got = over(colour, ground)
    return "?" if got is None else "%.1f" % got[0]


PROBE = {
    # The column: the window's frame behind it (app.css .window).
    "side": """
      const col = e => e ? getComputedStyle(e).color : null;
      const row = [...document.querySelectorAll('.sidebar .row:not(.live)')].find(r => r.querySelector('.title')?.textContent === TITLE);
      return { ground: getComputedStyle(document.querySelector('.window')).backgroundColor,
        on: document.querySelector('.sidebar')?.classList.contains('contrast'), hovered: !!row?.matches(':hover'),
        title: col(row?.querySelector('.title')), live: col(document.querySelector('.sidebar .row.live .title')),
        mark: col(row?.querySelector('.mark .letter')), pin: col(document.querySelector('.sidebar .square:not(.live) .pin-letter')),
        group: col(document.querySelector('.sidebar .group-heading')), folder: col(document.querySelector('.sidebar .folder-heading')) }""",
    # Across the top: the strip's own white.
    "top": """
      const col = e => e ? getComputedStyle(e).color : null;
      const tab = [...document.querySelectorAll('.strip-tab:not(.live)')].find(r => r.querySelector('.title')?.textContent === TITLE);
      return { ground: getComputedStyle(document.querySelector('.tabbar')).backgroundColor,
        on: document.querySelector('.tabbar')?.classList.contains('contrast'), hovered: !!tab?.matches(':hover'),
        title: col(tab?.querySelector('.title')), live: col(document.querySelector('.strip-tab.live .title')),
        mark: col(tab?.querySelector('.mark .letter')), pin: col(document.querySelector('.strip-pin:not(.live) .pin-letter')),
        group: col(document.querySelector('.strip-group-name')), folder: null }""",
}


def probe(layout, title):
    return uk.js(f"const TITLE = {title!r};" + PROBE[layout])


def title_checks(m, layout, look, high, where):
    """The title of a tab that isn't live: Greys.muted landing on Palette.muted, or ink."""
    if m["hovered"]:
        print(f"  (the pointer is on the measured tab: {where})")
    want = INK[look] if high else MUTED[look]
    t.ok(bool(m["on"]) == high, f"{where}: the switch {'on' if high else 'off'} reaches the {layout} ({m['on']})")
    t.ok(m["title"] is not None and lands(m["title"], m["ground"], want),
         f"{where}: a tab not live, its title lands on {want:.1f} ({m['title']} over {m['ground']} = {shown(m['title'], m['ground'])})")
    if not high:
        t.ok(uk.same_colour(m["title"], GREY[(layout, look)]), f"{where}: as Greys.muted for its ground, {GREY[(layout, look)]} ({m['title']})")
    t.ok(m["live"] is not None and lands(m["live"], m["ground"], INK[look], 1), f"{where}: the live tab's title in ink either way ({m['live']})")


# 1. The real window, through Settings: the column, then across the top.
t.ok(b.state()["prefs"].get(KEY) is False, "High contrast text: off by default")
a = tk.page("alpha")
tk.page("beta")
tk.settle(0.6)
for layout in ("side", "top"):
    if layout == "top":
        b.cmd("settings.set", id="tabs.layout", value="top")
        tk.settle(0.8)
    for high in (False, True):
        b.cmd("settings.set", id=KEY, value=high)
        tk.settle(0.5)
        m = probe(layout, "alpha")
        title_checks(m, layout, "light", high, f"real window, {layout}, {'on' if high else 'off'}")
t.ok(b.state()["prefs"].get(KEY) is True, "the switch is kept in the prefs")
b.cmd("settings.set", id=KEY, value=False)
b.cmd("settings.set", id="tabs.layout", value="left")
tk.settle(0.6)

# 2. The fixtures, light and dark, off and on: every text the Mac covers.
CASES = [("side", "many", "Hacker News"), ("top", "top", "BBC News")]
for layout, fixture, title in CASES:
    for look in ("light", "dark"):
        for high in (False, True):
            s = uk.fixture(fixture)
            s["prefs"] = {**s.get("prefs", {}), KEY: high, "glyph": "letters"}
            uk.fake(s, look=look)
            time.sleep(0.4)
            m = probe(layout, title)
            where = f"{layout}, {look}, {'on' if high else 'off'}"
            title_checks(m, layout, look, high, where)
            # A pin's letter: Palette.muted in the column (Side.swift:1929-1932), the
            # tab's own grey across the top (TabBar.swift:1014, 1266); ink with the switch.
            want = INK[look] if high else MUTED[look]
            t.ok(m["pin"] is not None and lands(m["pin"], m["ground"], want),
                 f"{where}: a pin's letter lands on {want:.1f} ({m['pin']} = {shown(m['pin'], m['ground'])})")
            # The site's letter (Mark) and the group's name: Palette.muted, opaque.
            t.ok(m["mark"] is not None and lands(m["mark"], m["ground"], want),
                 f"{where}: the site's letter {want:.1f} ({m['mark']})")
            t.ok(m["group"] is not None and lands(m["group"], m["ground"], want),
                 f"{where}: the group's name {want:.1f} ({m['group']})")
    uk.thaw()

# A pin folder's heading (pins as rows, with folders).
for look in ("light", "dark"):
    for high in (False, True):
        s = uk.fixture("pin-rows")
        s["prefs"] = {**s.get("prefs", {}), KEY: high}
        uk.fake(s, look=look)
        time.sleep(0.4)
        m = probe("side", "Oriel references")
        want = INK[look] if high else MUTED[look]
        t.ok(m["folder"] is not None and lands(m["folder"], m["ground"], want),
             f"pin rows, {look}, {'on' if high else 'off'}: a pin folder's heading {want:.1f} ({m['folder']})")
uk.thaw()
t.done()

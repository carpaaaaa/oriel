#!/usr/bin/env python3
"""A mouse's sideways wheel, a tilt or a thumb wheel, goes through the spaces
in the column the way two fingers moved the same way on a touchpad do (Search
1.0.22, #1646; SpaceSwipe.swift): on Windows both scroll right, deltaX above
zero, toward the next space. One turn of the wheel, notches close together,
or one stroke brings one space; only what goes more sideways than up or down
counts, and never over a field being typed in."""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b  # noqa: E402
import ui_kit as k  # noqa: E402

b.use("ui-space-wheel")
b.launch(*k.FRAMES, env={"SEARCH_LOOK": "light"})
t = b.T()
time.sleep(0.6)


def wheel(dx, dy=0, sel=".sidebar .rows", mode=0):
    k.js(f"const e = document.querySelector({sel!r}); e.dispatchEvent(new WheelEvent('wheel', {{ deltaX: {dx}, deltaY: {dy}, deltaMode: {mode}, bubbles: true, cancelable: true }})); return 1")


def space():
    return b.window()["space"]


b.cmd("settings.set", id="spaces", value=True)
time.sleep(0.4)
first = space()
for name in ("Two", "Three", "Four"):
    b.call({"do": "cmd", "cmd": {"do": "space.create", "name": name}})
    time.sleep(0.5)
order = [s["id"] for s in b.window()["spaces"]]
t.ok(len(order) == 4 and order[0] == first, f"four spaces ({len(order)})")
b.cmd("space.select", id=first)
time.sleep(0.6)

# A notch to the right (a tilt right, two fingers moving left): the next space.
wheel(120)
time.sleep(0.5)
t.ok(space() == order[1], f"a sideways notch to the right: the next space ({order.index(space()) if space() in order else space()})")
# A turn of the wheel brings one space: notches close together wait for it to rest.
time.sleep(0.4)
for _ in range(4):
    wheel(120)
    time.sleep(0.05)
time.sleep(0.5)
t.ok(space() == order[2], f"four notches in one turn: one space, not four ({order.index(space()) if space() in order else space()})")
time.sleep(0.4)
wheel(120)
time.sleep(0.5)
t.ok(space() == order[3], "the wheel rested, a notch again: the one after")
time.sleep(0.4)
wheel(120)
time.sleep(0.5)
t.ok(space() == order[3], "past the last space: it stays")
time.sleep(0.4)
wheel(-120)
time.sleep(0.5)
t.ok(space() == order[2], "to the left: the one before")
time.sleep(0.4)

# A stroke on a touchpad: small steps, one space once it has gone about a notch.
for _ in range(3):
    wheel(-8)
    time.sleep(0.03)
time.sleep(0.2)
t.ok(space() == order[2], "a short stroke, 24 across: nothing yet")
for _ in range(6):
    wheel(-8)
    time.sleep(0.03)
time.sleep(0.5)
t.ok(space() == order[1], "the stroke going on past a notch: one space, the one before")
time.sleep(0.4)

# More up and down than sideways: scrolling the tabs, never a space.
wheel(40, 120)
time.sleep(0.5)
t.ok(space() == order[1], "more up and down than sideways: no space")
time.sleep(0.4)

# Over a field being typed in: it moves along the text.
k.js("const i = document.createElement('input'); i.id = 'wheel-probe'; document.querySelector('.sidebar .side-body').append(i); return 1")
wheel(120, sel="#wheel-probe")
time.sleep(0.5)
t.ok(space() == order[1], "over a field being typed in: no space")
k.js("document.getElementById('wheel-probe').remove(); return 1")
t.done()

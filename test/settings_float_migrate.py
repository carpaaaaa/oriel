#!/usr/bin/env python3
"""The floating video's one switch (float.enabled; studio/06 §1.5 #78) from
what earlier versions kept: the choice between Oriel's window and Chromium's
picture in picture (float.style, either value) meant "on", so a settings
file that has it comes up with the video on; a switch turned off stays off
the next time. Each in a world of its own, hidden.

    npm run build && python3 test/settings_float_migrate.py
"""
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b  # noqa: E402

t = b.T()


def start(world, prefs):
    b.use(world)
    folder = b.folder()
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "prefs.json").write_text(json.dumps(prefs), encoding="utf-8")
    b.launch()


def enabled():
    return b.call({"do": "pages.state"})["float"]["enabled"]


def written():
    time.sleep(0.5)
    return json.loads((b.folder() / "prefs.json").read_text(encoding="utf-8"))


try:
    for style in ("system", "search"):
        start(f"float-migrate-{style}", {"float.style": style})
        t.ok(enabled() is True, f"float.style {style}: the floating video is on")
        t.ok(b.state()["prefs"].get("float.enabled") is True, "as the switch says it")
        b.cmd("settings.set", id="float.enabled", value=False)
        kept = False
        for _ in range(20):
            if written().get("float.enabled") is False:
                kept = True
                break
        t.ok(enabled() is False and kept, "turned off, it is kept")
        b.quit()

    # Off, as it was left.
    start("float-migrate-off", {"float.enabled": False})
    t.ok(enabled() is False, "a switch left off is off the next time")
    b.cmd("settings.set", id="float.enabled", value=True)
    t.ok(enabled() is True and "float.enabled" not in written(), "back on, it is the default again and not written")
except Exception as error:
    import traceback
    traceback.print_exc()
    t.ok(False, f"ran to the end ({error})")
t.done()

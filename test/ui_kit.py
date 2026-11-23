"""Helpers for the tabs interface's tests (test/ui_*.py): a fixture laid on
the column, the DOM measured, the overlay read."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b  # noqa: E402

FIX = Path(__file__).resolve().parent / "fixtures"


def fixture(name, **over):
    s = json.loads((FIX / f"window-state-{name}.json").read_text())
    for k, v in over.items():
        if isinstance(v, dict) and isinstance(s.get(k), dict):
            s[k] = {**s[k], **v}
        else:
            s[k] = v
    return s


def fake(s, look=None):
    """Lay a window state on the interface, frozen against the main process."""
    keep = {k: v for k, v in s.items() if k not in ("rev", "windowID", "chrome", "focused", "maximized", "fullScreen", "controlsWidth")}
    if look:
        keep["look"] = look
    b.ui(f"window.__tabsUI.fake({json.dumps(keep)}); true")


def thaw():
    b.ui("window.__tabsUI.thaw(); true")


def js(expr, root="chrome"):
    v = b.ui(f"JSON.stringify((() => {{ {expr} }})())", root=root)
    return json.loads(v) if v else None


def rect(sel, root="chrome"):
    return js(f"const e = document.querySelector({json.dumps(sel)}); if (!e) return null; const r = e.getBoundingClientRect();"
              " return { x: r.x, y: r.y, w: r.width, h: r.height }", root)


def style(sel, *props, root="chrome", pseudo=None):
    p = ", " + json.dumps(pseudo) if pseudo else ""
    return js(f"const e = document.querySelector({json.dumps(sel)}); if (!e) return null; const s = getComputedStyle(e{p});"
              f" return Object.fromEntries({json.dumps(list(props))}.map(k => [k, s.getPropertyValue(k)]))", root)


def near(a, want, tol=0.6):
    return a is not None and abs(a - want) <= tol


def settle(t=0.6):
    import time
    time.sleep(t)

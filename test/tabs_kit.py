#!/usr/bin/env python3
"""What the tabs module's tests share (not a test itself): a local site whose
pages are named by their path, prefs written before launch, and the module's
own view of the model (bench request tabs.state).

    import tabs_kit as k
    k.world("tabs-close", **{"tabs.newAfterLast": True})
    a = k.page("a")            # a tab on http://127.0.0.1:<port>/a, in front
"""
import json
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b  # noqa: E402

APPLE = 978307200  # seconds from 1970 to 2001


class Site(BaseHTTPRequestHandler):
    def do_GET(self):
        name = self.path.lstrip("/").split("?")[0] or "home"
        if name.startswith("slow"):
            time.sleep(3)
        if name == "untitled":
            body = "<body>no title here</body>"
        elif name.startswith("long"):
            body = f"<title>{name}</title><body style='height:9000px'>{name}</body>"
        elif name.startswith("form"):
            body = f"<title>{name}</title><input id=f><textarea id=t></textarea>"
        elif name.startswith("cookie"):
            body = f"<title>{name}</title><script>document.title = document.cookie || 'none'</script>"
        else:
            body = f"<title>{name}</title><body>{name}</body>"
        data = body.encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *a):
        pass


_server = ThreadingHTTPServer(("127.0.0.1", 0), Site)
threading.Thread(target=_server.serve_forever, daemon=True).start()
BASE = f"http://127.0.0.1:{_server.server_address[1]}"


def url(name):
    return f"{BASE}/{name}"


def name_of(u):
    return u.rsplit("/", 1)[-1] if u and u.startswith(BASE) else u


def world(name, wipe=True, **prefs):
    """A world of its own, prefs written before Oriel reads them."""
    b.use(name, wipe=wipe)
    if prefs:
        set_prefs(**prefs)


def set_prefs(**prefs):
    f = b.folder() / "prefs.json"
    f.parent.mkdir(parents=True, exist_ok=True)
    old = json.loads(f.read_text()) if f.exists() else {}
    old.update(prefs)
    f.write_text(json.dumps(old))


def launch():
    b.launch()
    time.sleep(0.6)


def st():
    return b.call({"do": "tabs.state"})


def win(s=None, i=0):
    return (s or st())["windows"][i]


def tabs(s=None, i=0):
    return win(s, i)["tabs"]


def names(s=None, i=0):
    return [name_of(t["url"]) if t["url"] else ("<blank>" if t["empty"] else t["label"]) for t in tabs(s, i)]


def active(s=None, i=0):
    w = win(s, i)
    return next((t for t in w["tabs"] if t["id"] == w["activeID"]), None)


def tab(id, s=None):
    s = s or st()
    for w in s["windows"]:
        for row in w["rows"].values():
            for t in row["tabs"]:
                if t["id"] == id:
                    return t
    return None


def by_name(name, s=None, i=0):
    return next((t for t in tabs(s, i) if name_of(t["url"]) == name), None)


def wid(i=0):
    return win(None, i)["id"]


def cmd(_command, _i=None, **args):
    """Any command; `_i` the window by its place (args may use `name`)."""
    req = {"do": "cmd", "cmd": {"do": _command, **args}}
    if _i is not None:
        req["window"] = wid(_i)
    return b.call(req).get("value")


def page(name, i=None, wait=True):
    """A tab with a page, in front, as a link from another app opens one."""
    id = cmd("tab.open", i, url=url(name), foreground=True)
    if wait:
        b.wait_for(lambda: (t := tab(id)) and t["title"] == name and not t["loading"], what=f"page {name}")
    return id


def settle(s=0.4):
    time.sleep(s)


def read(name):
    f = b.folder() / name
    return json.loads(f.read_text()) if f.exists() else None


def files():
    return sorted(p.name for p in b.folder().iterdir() if p.suffix == ".json" or ".unreadable-" in p.name)


def relaunch():
    """Quit as a person would and start again in the same world."""
    b.quit()
    time.sleep(0.5)
    b.launch()
    time.sleep(0.8)

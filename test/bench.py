#!/usr/bin/env python3
"""Drive Search for Windows in a test world, as the Mac's Tests/split_view.py
drives Search: SEARCH_PROBE=<world> gives the app its own settings folder and
socket, so a test never touches the Search someone is using.

    import bench as b
    b.use("my-test")          # its own world
    b.launch()                # build first: npm run build
    st = b.state()
    b.cmd("tab.new", url="https://example.com")
    b.shot("/tmp/x.png")
    b.quit()
"""
import json
import os
import shutil
import socket
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WORLD = "bench"
PROC = None
IS_WIN = sys.platform == "win32"


def appdata():
    if IS_WIN:
        return Path(os.environ["APPDATA"])
    if sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support"
    return Path.home() / ".config"


def folder():
    return appdata() / f"Search for Windows ({WORLD})"


def address():
    if IS_WIN:
        return r"\\.\pipe\search-bench-" + "".join(c if c.isalnum() or c in "_-" else "_" for c in WORLD)
    return str(folder() / "bench.sock")


def use(world, wipe=True):
    global WORLD
    WORLD = world
    if wipe and folder().exists():
        shutil.rmtree(folder(), ignore_errors=True)


def launch(*args, chrome="windows", env=None, wait=30):
    global PROC
    electron = ROOT / "node_modules" / ".bin" / ("electron.cmd" if IS_WIN else "electron")
    e = dict(os.environ, SEARCH_PROBE=WORLD, SEARCH_CHROME=chrome, **(env or {}))
    PROC = subprocess.Popen([str(electron), str(ROOT), *args], env=e, cwd=ROOT,
                            stdout=open(ROOT / "out" / f"bench-{WORLD}.log", "w"), stderr=subprocess.STDOUT,
                            shell=IS_WIN)
    end = time.time() + wait
    while time.time() < end:
        try:
            if state().get("windows"):
                return
        except OSError:
            pass
        time.sleep(0.25)
    raise RuntimeError("Search didn't come up; see out/bench-%s.log" % WORLD)


def call(req, timeout=30):
    data = (json.dumps(req) + "\n").encode()
    if IS_WIN:
        with open(address(), "r+b", buffering=0) as pipe:
            pipe.write(data)
            line = b""
            while not line.endswith(b"\n"):
                line += pipe.read(1)
    else:
        with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as s:
            s.settimeout(timeout)
            s.connect(address())
            s.sendall(data)
            line = b""
            while not line.endswith(b"\n"):
                chunk = s.recv(65536)
                if not chunk:
                    break
                line += chunk
    reply = json.loads(line)
    if not reply.get("ok"):
        raise RuntimeError(reply.get("error"))
    return reply


def state():
    return call({"do": "state"})


def cmd(name, window=None, **args):
    req = {"do": "cmd", "cmd": {"do": name, **args}}
    if window:
        req["window"] = window
    return call(req).get("value")


def ev(tab, js):
    return call({"do": "eval", "id": tab, "js": js}).get("value")


def ui(js, root="chrome"):
    return call({"do": "ui", "js": js, "root": root}).get("value")


def shot(path):
    return call({"do": "shot", "path": str(path)})


def key(k, *mods):
    return call({"do": "key", "key": k, "modifiers": list(mods)})


def mouse(x, y, button="left", clicks=1):
    return call({"do": "mouse", "x": x, "y": y, "button": button, "clicks": clicks})


def window():
    return state()["windows"][0]


def active(st=None):
    w = (st or state())["windows"][0]
    return next((t for t in w["tabs"] if t["id"] == w["activeID"]), None)


def wait_for(pred, within=15, every=0.2, what="condition"):
    end = time.time() + within
    last = None
    while time.time() < end:
        last = pred()
        if last:
            return last
        time.sleep(every)
    raise AssertionError(f"timed out waiting for {what} (last: {last!r})")


def quit():
    try:
        call({"do": "quit"}, timeout=5)
    except Exception:
        pass
    if PROC:
        try:
            PROC.wait(10)
        except Exception:
            PROC.kill()


class T:
    """Tiny checker: t.ok(cond, "what") ... t.done()"""

    def __init__(self):
        self.failed = 0
        self.passed = 0

    def ok(self, cond, what):
        if cond:
            self.passed += 1
            print(f"  ok   {what}")
        else:
            self.failed += 1
            print(f"  FAIL {what}")
        return cond

    def done(self):
        print(f"{self.passed} passed, {self.failed} failed")
        quit()
        sys.exit(1 if self.failed else 0)

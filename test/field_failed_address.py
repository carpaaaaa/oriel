#!/usr/bin/env python3
"""A page that never arrived keeps the address it failed at (Search 1.0.20,
Tests/failed_url_field.py): an OAuth sign-in handing a CLI's code back to
http://localhost:<port>/callback with nothing listening there. A link, a
form, a server's 302 and a script's redirect each go there; each time the
tab says the site refused, and its address (what Copy Address copies) and
the field Ctrl+L raises hold that address, query and all, not the page it
was leaving. Back goes to the sign-in page; Reload tries the failed address
again, and a server started on its port then answers it."""
import socket
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b  # noqa: E402

REFUSED = "The site refused the connection."


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


CLOSED = free_port()
FAIL = f"http://localhost:{CLOSED}/cb?code=abc&state=xyz"
LATER = free_port()
LATER_URL = f"http://localhost:{LATER}/callback?code=c0de&state=s7"


class Pages(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/302":
            self.send_response(302)
            self.send_header("Location", FAIL)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        if self.path == "/js":
            body = f"<!doctype html><title>js</title><script>setTimeout(() => location.replace({FAIL!r}), 300)</script>"
        else:
            body = (f"<!doctype html><title>signin</title><p>Sign in"
                    f"<a id=link href='{FAIL}'>continue</a> <a id=later href='{LATER_URL}'>later</a>"
                    f"<form id=form action='http://localhost:{CLOSED}/cb' method=get>"
                    f"<input name=code value=abc><input name=state value=xyz></form>")
        data = body.encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/html")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *a):
        pass


class Callback(BaseHTTPRequestHandler):
    def do_GET(self):
        data = b"<!doctype html><title>signed in</title><p>You can close this tab."
        self.send_response(200)
        self.send_header("Content-Type", "text/html")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *a):
        pass


srv = ThreadingHTTPServer(("127.0.0.1", 0), Pages)
threading.Thread(target=srv.serve_forever, daemon=True).start()
SITE = f"http://localhost:{srv.server_port}"

b.use("field-failedaddress")
b.launch()
t = b.T()


def tab(id):
    return next(x for x in b.state()["tabs"] if x["id"] == id)


def field_text():
    """What Ctrl+L puts in the field, then put away."""
    b.cmd("field.open", target="here")
    time.sleep(0.4)
    text = b.window()["field"]["text"]
    b.cmd("field.close")
    time.sleep(0.3)
    return text


def signin(id):
    b.cmd("tab.go", id=id, input=f"{SITE}/signin")
    b.wait_for(lambda: tab(id)["title"] == "signin" and not tab(id)["loading"], within=20, what="the sign-in page")


def failed_at(id, how, url=FAIL):
    got = b.wait_for(lambda: (tab(id).get("error") or {}).get("description") == REFUSED and tab(id), within=15, what=how)
    t.ok(bool(got), f"{how}: says {REFUSED!r}")
    now = tab(id)
    t.ok(now["url"] == url and now["error"]["url"] == url, f"{how}: the tab's address (what Copy Address copies) is the failed one ({now['url']})")
    typed = field_text()
    t.ok(typed == url, f"{how}: Ctrl+L's field holds it, query and all ({typed})")


id = b.cmd("tab.new", url=f"{SITE}/signin")
b.wait_for(lambda: tab(id)["title"] == "signin", within=20, what="the sign-in page")

b.ev(id, "document.getElementById('link').click(); 1")
failed_at(id, "a link")
b.cmd("tab.back", id=id)
back = b.wait_for(lambda: tab(id)["title"] == "signin" and not tab(id).get("error") and tab(id), within=10, what="back")
t.ok(back["url"] == f"{SITE}/signin", f"Back returns to the sign-in page ({back['url']})")

b.ev(id, "document.getElementById('form').submit(); 1")
failed_at(id, "a form")

signin(id)
b.cmd("tab.go", id=id, input=f"{SITE}/302")
failed_at(id, "a server's 302")

signin(id)
b.cmd("tab.go", id=id, input=f"{SITE}/js")
failed_at(id, "a script's redirect")

# Reload asks for the failed address again: now something answers it.
signin(id)
b.ev(id, "document.getElementById('later').click(); 1")
failed_at(id, "a callback not yet listening", url=LATER_URL)
cb = ThreadingHTTPServer(("127.0.0.1", LATER), Callback)
threading.Thread(target=cb.serve_forever, daemon=True).start()
b.cmd("tab.reload", id=id)
got = b.wait_for(lambda: tab(id)["title"] == "signed in" and tab(id), within=15, what="the callback")
t.ok(got["url"] == LATER_URL and not got.get("error"), f"Reload tries the failed address again, and it answers ({got['url']})")
t.done()

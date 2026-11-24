"""A small web server on this computer for the pages module's tests
(test/settings_c_*.py): the same port answers http and https (a TLS hello is
told apart by its first byte), every request is kept with its headers, and
pages are served by path. Names that aren't local (site.example and the
like) reach it through Chromium's --host-resolver-rules, so Shield's third
parties and HTTPS first can be tried without the network."""
import os
import socket
import ssl
import subprocess
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PAGES = {}      # path -> (body, content type, extra headers) or a callable(handler) -> same
REQUESTS = []   # (scheme, host, path, headers dict)
LOCK = threading.Lock()


def wav(seconds=3.0, rate=8000):
    """A quiet tone, as a WAV file: enough for a <video> to play."""
    import math
    import struct
    n = int(seconds * rate)
    data = b"".join(struct.pack("<h", int(3000 * math.sin(2 * math.pi * 440 * i / rate))) for i in range(n))
    return (b"RIFF" + struct.pack("<I", 36 + len(data)) + b"WAVEfmt " + struct.pack("<IHHIIHH", 16, 1, 1, rate, rate * 2, 2, 16)
            + b"data" + struct.pack("<I", len(data)) + data)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_GET(self):
        path = self.path.split("?")[0]
        scheme = "https" if isinstance(self.connection, ssl.SSLSocket) else "http"
        with LOCK:
            REQUESTS.append((scheme, (self.headers.get("Host") or "").split(":")[0], self.path, dict(self.headers.items())))
        page = PAGES.get(path)
        if callable(page):
            page = page(self)
        if page is None:
            self.send_response(404)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        body, kind, extra = (page + (None, {}))[:3] if isinstance(page, tuple) else (page, None, {})
        if isinstance(body, str):
            body = body.encode()
        self.send_response(200)
        self.send_header("Content-Type", kind or "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        for k, v in (extra or {}).items():
            for one in (v if isinstance(v, list) else [v]):
                self.send_header(k, one)
        self.end_headers()
        self.wfile.write(body)


class Dual(ThreadingHTTPServer):
    daemon_threads = True
    context = None
    tls = True

    def get_request(self):
        sock, addr = self.socket.accept()
        if self.tls:
            try:
                sock.settimeout(5)
                first = sock.recv(1, socket.MSG_PEEK)
                sock.settimeout(None)
                if first == b"\x16":
                    sock = self.context.wrap_socket(sock, server_side=True)
            except Exception:
                pass
        return sock, addr


def certificate():
    folder = tempfile.mkdtemp(prefix="oriel-tls-")
    key, cert = os.path.join(folder, "key.pem"), os.path.join(folder, "cert.pem")
    subprocess.run(["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", key, "-out", cert,
                    "-days", "2", "-subj", "/CN=oriel-test"], check=True, capture_output=True)
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ctx.load_cert_chain(cert, key)
    return ctx


def start(tls=True):
    """A server on 127.0.0.1: (server, port). tls=False answers http only."""
    server = Dual(("127.0.0.1", 0), Handler)
    server.tls = tls
    if tls:
        server.context = certificate()
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, server.server_address[1]


def rules(*names):
    """--host-resolver-rules sending these names to this computer."""
    return "--host-resolver-rules=" + ", ".join(f"MAP {n} 127.0.0.1" for n in names)


def seen(path_part, host=None):
    with LOCK:
        return [r for r in REQUESTS if path_part in r[2] and (host is None or r[1] == host)]


def clear():
    with LOCK:
        REQUESTS.clear()

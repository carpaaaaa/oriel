"""A small web server on this computer for the settings tests: pages that ask
for permissions, files to download (slow, without a length, failing)."""
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PAGES = {}
GATES = {}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_GET(self):
        path = self.path.split("?")[0]
        if path in PAGES:
            body = PAGES[path].encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if path.startswith("/file/"):
            # /file/<name>?size=<bytes>&slow=<seconds per 64 KB>&nolength=1&fail=<after bytes>&gate=<name>
            q = dict(p.split("=") for p in self.path.split("?")[1].split("&")) if "?" in self.path else {}
            size = int(q.get("size", 200000))
            slow = float(q.get("slow", 0))
            fail = int(q.get("fail", -1))
            gate = q.get("gate")
            self.send_response(200)
            self.send_header("Content-Type", "application/octet-stream")
            self.send_header("Content-Disposition", f'attachment; filename="{path[6:]}"')
            if not q.get("nolength"):
                self.send_header("Content-Length", str(size))
            self.end_headers()
            sent = 0
            try:
                while sent < size:
                    if gate and not GATES.get(gate, threading.Event()).is_set() and sent >= 65536:
                        GATES.setdefault(gate, threading.Event()).wait(30)
                    if fail >= 0 and sent >= fail:
                        self.connection.shutdown(2)
                        return
                    n = min(65536, size - sent)
                    self.wfile.write(b"x" * n)
                    self.wfile.flush()
                    sent += n
                    if slow:
                        time.sleep(slow)
            except (BrokenPipeError, ConnectionResetError, OSError):
                pass
            return
        self.send_response(404)
        self.end_headers()


def start():
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, f"http://127.0.0.1:{server.server_address[1]}"


def gate(name):
    return GATES.setdefault(name, threading.Event())

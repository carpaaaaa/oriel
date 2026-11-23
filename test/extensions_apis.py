#!/usr/bin/env python3
"""The APIs Electron lacks (studio/04 §3.1, §5.3, §5.4, §5.6): the side panel
beside the page, the offscreen document, native messaging with a fake host
(test/fixtures/native), identity.launchWebAuthFlow against a local server,
tabGroups' enums; then Bitwarden, from the Web Store, opens its popup."""
import json
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b

FIXTURE = Path(__file__).resolve().parent / "fixtures" / "api-test"
HOST = Path(__file__).resolve().parent / "fixtures" / "native" / "echo_host.py"
BITWARDEN = "nngceckbapebfimnlniiiahkandclblb"
EXT = None


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_GET(self):
        if self.path.startswith("/auth-redirect"):
            self.send_response(302)
            self.send_header("Location", f"https://{EXT}.chromiumapp.org/cb?code=42")
            self.end_headers()
            return
        if self.path.startswith("/auth-script"):
            body = f"<!doctype html><title>sign in</title><script>setTimeout(() => location.href = 'https://{EXT}.chromiumapp.org/cb?code=7', 300)</script>"
        else:
            body = "<!doctype html><title>sign in</title><p>Sign in"
        data = body.encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/html")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
PORT = server.server_address[1]
threading.Thread(target=server.serve_forever, daemon=True).start()

b.use("extensions-apis")
b.launch()
t = b.T()

ext = b.call({"do": "extensions.loadUnpacked", "path": str(FIXTURE), "copy": True})
EXT = ext["id"]
b.cmd("tab.new", url=f"chrome-extension://{EXT}/test.html")
b.wait_for(lambda: b.active()["title"] == "API test page", what="extension page")
page = b.active()["id"]
api = lambda js: b.ev(page, "(async () => { try { return await (%s) } catch (e) { return 'error: ' + e.message } })()" % js)

w = b.ev(page, "new Promise(r => chrome.runtime.sendMessage({ ask: 'spaces' }, r))")
t.ok(w == {"sidePanel": "function", "offscreen": "function", "identity": "function", "tabGroups": "blue"}, f"the worker has sidePanel, offscreen, identity and tabGroups ({w})")

# --- sidePanel (studio/04 §5.6)
t.ok(api("chrome.sidePanel.getOptions({})") == {"path": "panel.html", "enabled": True}, "getOptions: the manifest's page")
before = b.call({"do": "extensions.panel"})["page"]
api("chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })")
t.ok(api("chrome.sidePanel.getPanelBehavior()") == {"openPanelOnActionClick": True}, "setPanelBehavior")
b.cmd("ext.press", id=EXT)
panel = b.wait_for(lambda: (x := b.call({"do": "extensions.panel"}))["open"] and x["title"] == "API test panel" and x, within=8, what="panel")
t.ok(panel["url"] == f"chrome-extension://{EXT}/panel.html", "the button opens its side panel")
t.ok(panel["bounds"]["width"] == 380, f"380 wide to start ({panel['bounds']['width']})")
t.ok(panel["bounds"]["x"] + panel["bounds"]["width"] == before["x"] + before["width"] and panel["page"]["width"] == before["width"] - 380 - 8,
     "beside the page, on the side away from the tabs; the page makes room")
t.ok(panel["bounds"]["height"] == before["height"] and panel["bounds"]["y"] == before["y"], "as tall as the page")
b.call({"do": "extensions.panelEval", "js": "setTimeout(() => window.close(), 50); 1"})
b.wait_for(lambda: not b.call({"do": "extensions.panel"})["open"], within=5, what="panel close")
t.ok(b.call({"do": "extensions.panel"})["page"]["width"] == before["width"], "window.close() closes it and the page gets its room back")
win = api("chrome.windows.getCurrent()")
api("chrome.sidePanel.open({ windowId: %d })" % win["id"])
b.wait_for(lambda: b.call({"do": "extensions.panel"})["open"], within=5, what="open()")
t.ok(True, "sidePanel.open({windowId})")
api("chrome.sidePanel.setOptions({ enabled: false })")
b.wait_for(lambda: not b.call({"do": "extensions.panel"})["open"], within=5, what="disabled")
t.ok(True, "turned off while open, it closes")
api("chrome.sidePanel.setOptions({ enabled: true })")

# --- offscreen (studio/04 §5.4)
t.ok(api("chrome.offscreen.createDocument({ url: 'offscreen.html', reasons: ['DOM_PARSER'], justification: 'test' })") is None, "createDocument")
t.ok(api("chrome.offscreen.hasDocument()") is True, "hasDocument")
off = b.call({"do": "extensions.offscreen", "id": EXT, "js": "document.title"})
t.ok(off["open"] and off["value"] == "API test offscreen", "the document runs out of sight")
t.ok(b.wait_for(lambda: api("chrome.storage.local.get('offscreenRan').then(v => v.offscreenRan || 0)"), within=5, what="ran") > 0, "with the extension's APIs")
t.ok(api("chrome.offscreen.createDocument({ url: 'offscreen.html', reasons: ['DOM_PARSER'], justification: 'test' })") == "error: Only a single offscreen document may be created.", "only one")
t.ok(api("chrome.offscreen.closeDocument()") is None and api("chrome.offscreen.hasDocument()") is False, "closeDocument")
t.ok(api("chrome.offscreen.closeDocument()") == "error: No current offscreen document.", "closing none says so")
t.ok(api("chrome.offscreen.createDocument({ url: 'https://example.com/', reasons: ['DOM_PARSER'], justification: 'test' })") == "error: The offscreen document must belong to this extension.", "only its own pages")

# --- native messaging (studio/04 §5.3), a host in Oriel's own folder
hosts = b.folder() / "NativeMessagingHosts"
hosts.mkdir(parents=True, exist_ok=True)
(hosts / "com.oriel.test_echo.json").write_text(json.dumps({
    "name": "com.oriel.test_echo", "description": "test", "path": str(HOST), "type": "stdio",
    "allowed_origins": [f"chrome-extension://{EXT}/"]}))
(hosts / "com.oriel.test_closed.json").write_text(json.dumps({
    "name": "com.oriel.test_closed", "description": "test", "path": str(HOST), "type": "stdio",
    "allowed_origins": ["chrome-extension://abcdefghijklmnopabcdefghijklmnop/"]}))
r = api("chrome.runtime.sendNativeMessage('com.oriel.test_echo', { hi: 'caffè ✓' })")
t.ok(r == {"echo": {"hi": "caffè ✓"}, "count": 1, "origin": f"chrome-extension://{EXT}/"}, f"sendNativeMessage: one answer, bytes counted right ({r})")
r = api("""new Promise(done => {
  const port = chrome.runtime.connectNative('com.oriel.test_echo'), got = []
  port.onMessage.addListener(m => { got.push(m.text ? m.text.length : m.echo); if (got.length === 3) { port.disconnect(); done(got) } })
  port.postMessage({ n: 1 }); port.postMessage({ big: 300000 }); port.postMessage('last')
})""")
t.ok(r == [{"n": 1}, 300000, "last"], f"connectNative: messages in order, a big one across many reads ({str(r)[:80]})")
r = api("""new Promise(done => {
  const port = chrome.runtime.connectNative('com.oriel.test_echo')
  port.onDisconnect.addListener(() => done('disconnected'))
  port.postMessage({ bye: true })
  setTimeout(() => done('still open'), 4000)
})""")
t.ok(r == "disconnected", "a host that exits disconnects the port")
r = api("""new Promise(done => {
  const port = chrome.runtime.connectNative('com.oriel.test_closed')
  port.onDisconnect.addListener(() => done('refused'))
  port.postMessage({})
  setTimeout(() => done('connected'), 3000)
})""")
t.ok(r == "refused", "a host that doesn't name the extension is refused")
r = api("chrome.runtime.sendNativeMessage('com.oriel.nobody', {})")
t.ok(r in (None, "error: Specified native messaging host not found."), f"an unknown host answers nothing ({r})")

# --- identity (studio/04 §3.1, ExtensionAuth)
t.ok(api("chrome.identity.getRedirectURL('cb')") == f"https://{EXT}.chromiumapp.org/cb", "getRedirectURL")
r = api(f"chrome.identity.launchWebAuthFlow({{ url: 'http://127.0.0.1:{PORT}/auth-redirect' }})")
t.ok(r == f"https://{EXT}.chromiumapp.org/cb?code=42", f"non-interactive: ends at its chromiumapp.org address ({r})")
r = api(f"chrome.identity.launchWebAuthFlow({{ url: 'http://127.0.0.1:{PORT}/auth-page' }})")
t.ok(r == "error: User interaction required.", f"non-interactive: a page to see fails ({r})")
r = api(f"chrome.identity.launchWebAuthFlow({{ url: 'http://127.0.0.1:{PORT}/auth-script', abortOnLoadForNonInteractive: false, timeoutMsForNonInteractive: 5000 }})")
t.ok(r == f"https://{EXT}.chromiumapp.org/cb?code=7", f"non-interactive, waiting for a script to move on ({r})")
tabs = len(b.window()["tabs"])
r = api(f"chrome.identity.launchWebAuthFlow({{ url: 'http://127.0.0.1:{PORT}/auth-script', interactive: true }})")
t.ok(r == f"https://{EXT}.chromiumapp.org/cb?code=7", f"interactive: in a tab ({r})")
b.wait_for(lambda: len(b.window()["tabs"]) == tabs, within=5, what="flow tab closed")
t.ok(True, "and its tab goes away")
b.ev(page, f"window.flow = chrome.identity.launchWebAuthFlow({{ url: 'http://127.0.0.1:{PORT}/auth-page', interactive: true }}).then(u => u, e => 'error: ' + e.message)")
flow_tab = b.wait_for(lambda: (a := b.active()) and a["title"] == "sign in" and a["id"], within=8, what="flow tab")
b.cmd("tab.close", id=flow_tab)
t.ok(b.ev(page, "window.flow") == "error: The user did not approve access.", "closing its tab is a no")
t.ok(api("chrome.identity.getAuthToken({ interactive: false })") == "error: getAuthToken needs a Google account signed into Chrome; this extension would need launchWebAuthFlow instead", "getAuthToken refused in the Mac's words")

# --- tabGroups, minimal
t.ok(api("chrome.tabGroups.query({})") == [] and api("chrome.tabGroups.TAB_GROUP_ID_NONE") == -1, "tabGroups: no groups, its constants there")

# --- Bitwarden opens its popup
r = b.call({"do": "extensions.install", "id": BITWARDEN}, timeout=120)
time.sleep(3)
b.cmd("ext.press", id=BITWARDEN)
pop = b.wait_for(lambda: (x := b.call({"do": "extensions.popup"}))["open"] and x["shown"] and not x["loading"] and x, within=20, what="Bitwarden popup")
t.ok(pop["url"].startswith(f"chrome-extension://{BITWARDEN}/popup/"), f"Bitwarden's button opens its popup ({pop['url']})")
time.sleep(3)
size = b.call({"do": "extensions.popup"})["bounds"]
t.ok(size["width"] >= 300 and size["height"] >= 300, f"its page draws and sizes the popup ({size['width']} x {size['height']})")
text = b.call({"do": "extensions.popupEval", "js": "document.body.innerText.slice(0, 200)"})["value"]
t.ok(bool(text and text.strip()), f"with its content ({text.strip()[:60]!r})")
t.done()

#!/usr/bin/env python3
"""declarativeNetRequest (studio/04 §3.5, §8.4, checklist B) and
chrome.commands (studio/04 §2.3), with the extension in
test/fixtures/dnr-test and a local server on *.localhost (Chromium sends
every *.localhost to this machine), so nothing depends on the network."""
import json
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b

FIXTURE = Path(__file__).resolve().parent / "fixtures" / "dnr-test"


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def send(self, body, ctype="application/json", extra=()):
        data = body.encode()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Expose-Headers", "*")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Content-Length", str(len(data)))
        for k, v in extra:
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self):
        self.send("")

    def do_POST(self):
        self.do_GET()

    def do_GET(self):
        host = self.headers.get("Host", "").split(":")[0]
        if self.path.startswith("/page"):
            return self.send("<!doctype html><title>dnr page</title><body>page on " + host, "text/html")
        if self.path.startswith("/echo"):
            return self.send(json.dumps({k.lower(): v for k, v in self.headers.items()}))
        extra = []
        if self.path.startswith("/res/hdr"):
            extra = [("X-Remove-Me", "1"), ("X-Kept", "1")]
        if self.path.startswith("/res/hb-yes"):
            extra = [("X-Block-Me", "yes")]
        if self.path.startswith("/res/hb-no"):
            extra = [("X-Block-Me", "no")]
        if self.path.endswith(".js"):
            return self.send("window.fromServer = 'yes'", "text/javascript")
        self.send(json.dumps({"host": host, "path": self.path, "method": self.command}), extra=extra)


server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
PORT = server.server_address[1]
threading.Thread(target=server.serve_forever, daemon=True).start()

b.use("extensions-dnr")
b.launch()
t = b.T()

# Copied and prepared as Load Unpacked does (use_dynamic_url turned off,
# src/main/extensions/dnr/war.ts).
ext = b.call({"do": "extensions.loadUnpacked", "path": str(FIXTURE), "copy": True})
EXT = ext["id"]
t.ok((Path(ext["path"]) / ".oriel-prepared").exists() and '"use_dynamic_url": false' in (Path(ext["path"]) / "manifest.json").read_text(), "the kept copy is prepared")
time.sleep(1)
st = b.call({"do": "extensions.dnrState", "id": EXT})
t.ok(st["enabled"] == ["base"], f"rulesets enabled as the manifest says (got {st['enabled']})")
t.ok(st["staticRules"] == 21, f"valid static rules loaded, bad ones left out (got {st['staticRules']})")
t.ok(len(st["warnings"]) == 3, f"three bad rules reported (got {st['warnings']})")


def open_page(host):
    b.cmd("tab.new", url=f"http://{host}:{PORT}/page")
    b.wait_for(lambda: b.active()["title"] == "dnr page" and not b.active()["loading"], what=f"page on {host}")
    return b.active()["id"]


PROBE = """(async () => { try { const r = await fetch(%s, %s); const body = await r.text();
  let json = null; try { json = JSON.parse(body) } catch {}
  return { status: r.status, url: r.url, json, headers: Object.fromEntries(r.headers) } } catch (e) { return 'blocked' } })()"""


def fetch(tab, url, init=None):
    return b.ev(tab, PROBE % (json.dumps(url), json.dumps(init or {})))


def blocked(tab, url, init=None):
    return fetch(tab, url, init) == "blocked"


u = lambda host, path: f"http://{host}:{PORT}{path}"

site = open_page("site.localhost")

# Actions and conditions of the static ruleset.
t.ok(blocked(site, u("ads.localhost", "/res/x")), "block: ||ads.localhost^")
t.ok(not blocked(site, u("ads.localhost", "/res/allowed/x")), "allow with higher priority wins over block")
t.ok(blocked(site, u("cdn.localhost", "/res/banner/1")), "initiatorDomains: blocked from site.localhost")
t.ok(not blocked(site, u("cdn.localhost", "/res/track.gif?x=1")) and blocked(site, u("cdn.localhost", "/res/track.gif")), "end anchor |")
t.ok(blocked(site, u("cdn.localhost", "/res/sep?a")) and blocked(site, u("cdn.localhost", "/res/sep")) and not blocked(site, u("cdn.localhost", "/res/seppia")), "separator ^ (and at the end)")
t.ok(blocked(site, u("cdn.localhost", "/res/wild/a/b/end")) and not blocked(site, u("cdn.localhost", "/res/wild/a/b/fin")), "wildcard *")
t.ok(blocked(site, u("cdn.localhost", "/res/third-only/")) and not blocked(site, u("site.localhost", "/res/third-only/")), "domainType thirdParty")
t.ok(blocked(site, u("cdn.localhost", "/res/rd/")) and not blocked(site, u("safe.cdn.localhost", "/res/rd/")) and not blocked(site, u("other.localhost", "/res/rd/")), "requestDomains and excludedRequestDomains")
t.ok(blocked(site, u("cdn.localhost", "/res/post-only/"), {"method": "POST", "body": "x"}) and not blocked(site, u("cdn.localhost", "/res/post-only/")), "requestMethods")
t.ok(blocked(site, u("cdn.localhost", "/res/CaseSens/")) and not blocked(site, u("cdn.localhost", "/res/casesens/")), "isUrlFilterCaseSensitive")
t.ok(blocked(site, u("cdn.localhost", "/res/re/123")) and not blocked(site, u("cdn.localhost", "/res/re/12a")), "regexFilter")
r = fetch(site, u("site.localhost", "/res/to-cdn/x"))
t.ok(r != "blocked" and r["json"]["host"] == "cdn.localhost" and r["json"]["path"] == "/res/moved", f"redirect transform host and path (got {r})")
r = fetch(site, u("site.localhost", "/res/qt?utm_source=x&keep=old&z=1"))
t.ok(r != "blocked" and r["json"]["path"] == "/res/qt?keep=new&z=1&added=1", f"redirect queryTransform (got {r if r == 'blocked' else r['json']['path']})")
r = fetch(site, u("site.localhost", "/sub/hello"))
t.ok(r != "blocked" and r["json"]["host"] == "cdn.localhost" and r["json"]["path"] == "/res/sub-hello", f"redirect regexSubstitution (got {r})")
script = b.ev(site, """new Promise(r => { const s = document.createElement('script'); s.src = %s;
  s.onload = () => r(window.fromExt || 'loaded without the flag'); s.onerror = () => r('error'); document.head.append(s) })""" % json.dumps(u("site.localhost", "/to-ext/x.js")))
t.ok(script == "yes", f"redirect extensionPath to a web accessible file (got {script})")
sim = b.call({"do": "extensions.dnrSimulate", "url": "http://up.localhost/x", "type": "script", "initiator": "http://site.localhost"})
t.ok(sim["action"] == "redirect" and sim["url"] == "https://up.localhost/x", f"upgradeScheme (got {sim})")
r = fetch(site, u("cdn.localhost", "/echo"), {"headers": {"x-remove-req": "1"}})
t.ok(r != "blocked" and r["json"].get("x-dnr") == "yes" and "x-remove-req" not in r["json"], f"modifyHeaders on request headers (got {r if r == 'blocked' else r['json']})")
r = fetch(site, u("cdn.localhost", "/res/hdr"))
t.ok(r != "blocked" and r["headers"].get("x-added") == "1" and "x-remove-me" not in r["headers"] and r["headers"].get("x-kept") == "1", f"modifyHeaders on response headers (got {r if r == 'blocked' else r['headers']})")
t.ok(blocked(site, u("cdn.localhost", "/res/hb-yes")) and not blocked(site, u("cdn.localhost", "/res/hb-no")), "responseHeaders condition")

trusted = open_page("trusted.localhost")
t.ok(not blocked(trusted, u("ads.localhost", "/res/x")), "allowAllRequests on the page lets its requests through")
t.ok(blocked(site, u("ads.localhost", "/res/x")), "other pages still blocked")

# The API from the extension's own page, through the preload.
b.cmd("tab.new", url=f"chrome-extension://{EXT}/test.html")
b.wait_for(lambda: b.active()["title"] == "DNR test page", what="extension page")
page = b.active()["id"]
dnr = lambda js: b.ev(page, "(async () => { try { return await (%s) } catch (e) { return 'error: ' + e.message } })()" % js)

t.ok(b.ev(page, "browser === chrome"), "browser is chrome in extension pages")
t.ok(dnr("chrome.declarativeNetRequest.getEnabledRulesets()") == ["base"], "getEnabledRulesets")
cb = b.ev(page, "new Promise(r => chrome.declarativeNetRequest.getEnabledRulesets(r))")
t.ok(cb == ["base"], "callbacks work too")
t.ok(dnr("chrome.declarativeNetRequest.MAX_NUMBER_OF_REGEX_RULES") == 1000 and dnr("chrome.declarativeNetRequest.DYNAMIC_RULESET_ID") == "_dynamic", "constants")

t.ok(not blocked(site, u("cdn.localhost", "/res/extra/")), "disabled ruleset doesn't block")
dnr("chrome.declarativeNetRequest.updateEnabledRulesets({ enableRulesetIds: ['extra'] })")
t.ok(dnr("chrome.declarativeNetRequest.getEnabledRulesets()") == ["base", "extra"] and blocked(site, u("cdn.localhost", "/res/extra/")), "updateEnabledRulesets turns one on")
t.ok("Invalid ruleset id" in dnr("chrome.declarativeNetRequest.updateEnabledRulesets({ enableRulesetIds: ['nope'] })"), "unknown ruleset refused")

dnr("chrome.declarativeNetRequest.updateStaticRules({ rulesetId: 'base', disableRuleIds: [1] })")
t.ok(dnr("chrome.declarativeNetRequest.getDisabledRuleIds({ rulesetId: 'base' })") == [1] and not blocked(site, u("ads.localhost", "/res/x")), "updateStaticRules turns a rule off")
dnr("chrome.declarativeNetRequest.updateStaticRules({ rulesetId: 'base', enableRuleIds: [1] })")
t.ok(blocked(site, u("ads.localhost", "/res/x")), "and back on")

dyn = [
    {"id": 1, "priority": 3, "action": {"type": "block"}, "condition": {"urlFilter": "/dyn/"}},
    {"id": 2, "action": {"type": "redirect", "redirect": {"url": u("cdn.localhost", "/res/redirected")}}, "condition": {"urlFilter": "/redir-url/"}},
    {"id": 3, "priority": 9, "action": {"type": "allow"}, "condition": {"urlFilter": "||ads.localhost^*/res/dyn-allowed"}},
    {"id": 4, "action": {"type": "redirect", "redirect": {"regexSubstitution": f"chrome-extension://{EXT}/blocked.html#\\0"}}, "condition": {"regexFilter": "^http://strict\\.localhost.*", "resourceTypes": ["main_frame"]}},
]
t.ok(dnr("chrome.declarativeNetRequest.updateDynamicRules({ addRules: %s })" % json.dumps(dyn)) is None, "updateDynamicRules")
t.ok(blocked(site, u("cdn.localhost", "/res/dyn/")), "dynamic block")
r = fetch(site, u("site.localhost", "/res/redir-url/"))
t.ok(r != "blocked" and r["json"]["path"] == "/res/redirected", "dynamic redirect to a url")
t.ok(not blocked(site, u("ads.localhost", "/res/dyn-allowed")), "dynamic allow beats a static block")
b.cmd("tab.new", url=u("strict.localhost", "/page"))
landed = b.wait_for(lambda: b.active()["title"] == "blocked by DNR test" and b.active()["url"], within=8, what="strict block page")
t.ok(landed.startswith(f"chrome-extension://{EXT}/blocked.html#http://strict.localhost"), f"main frame redirected to the extension's page (got {landed})")
b.cmd("tab.select", id=site)
t.ok([x["id"] for x in dnr("chrome.declarativeNetRequest.getDynamicRules()")] == [1, 2, 3, 4], "getDynamicRules")
t.ok([x["id"] for x in dnr("chrome.declarativeNetRequest.getDynamicRules({ ruleIds: [2] })")] == [2], "getDynamicRules with ruleIds")
e = dnr("chrome.declarativeNetRequest.updateDynamicRules({ addRules: [{ id: 1, action: { type: 'block' }, condition: { urlFilter: '/x/' } }] })")
t.ok(e == "error: Rule with id 1 does not have a unique ID.", f"duplicate id refused as Chrome does (got {e})")
e = dnr("chrome.declarativeNetRequest.updateDynamicRules({ addRules: [{ id: 9, action: { type: 'block' }, condition: { regexFilter: '(?<=a)b' } }] })")
t.ok(isinstance(e, str) and e.startswith("error: Rule with id 9 specified an invalid regular expression"), f"bad regex refused (got {e})")
e = dnr("chrome.declarativeNetRequest.updateDynamicRules({ addRules: [{ id: 9, action: { type: 'block' }, condition: { urlFilter: '/x/', tabIds: [1] } }] })")
t.ok(isinstance(e, str) and "only supported for session-scoped rules" in e, "tabIds only on session rules")
t.ok(dnr("chrome.declarativeNetRequest.isRegexSupported({ regex: '^https?://[a-z]+\\\\.com/' })") == {"isSupported": True}, "isRegexSupported: yes")
t.ok(dnr("chrome.declarativeNetRequest.isRegexSupported({ regex: '(?=x)' })") == {"isSupported": False, "reason": "syntaxError"}, "isRegexSupported: lookahead is not RE2")

# A regex that would backtrack without end, in the main process, on every
# request (studio/09 §1.9): RE2 is linear, JavaScript isn't, so it is refused
# as too complex, and the browser keeps answering.
e = dnr("chrome.declarativeNetRequest.updateDynamicRules({ addRules: [{ id: 10, action: { type: 'block' }, condition: { regexFilter: '(a+)+$' } }] })")
t.ok(isinstance(e, str) and e.startswith("error: Rule with id 10 specified a more complex regex than allowed"), f"(a+)+$ refused as too complex (got {e})")
t.ok(dnr("chrome.declarativeNetRequest.isRegexSupported({ regex: '(a+)+$' })") == {"isSupported": False, "reason": "memoryLimitExceeded"}, "isRegexSupported agrees: (a+)+$ is too complex")
t.ok(dnr("chrome.declarativeNetRequest.isRegexSupported({ regex: '(a|ab)+$' })") == {"isSupported": False, "reason": "memoryLimitExceeded"}, "and so is a repeated group whose alternatives start alike")
t.ok(dnr("chrome.declarativeNetRequest.isRegexSupported({ regex: '^https?://([a-z0-9-]+\\\\.)*example\\\\.com/' })") == {"isSupported": True}, "a nested group with a separator each round stays (filter lists use it)")
t.ok(dnr("chrome.declarativeNetRequest.isRegexSupported({ regex: 'a{1001}' })") == {"isSupported": False, "reason": "syntaxError"}, "a count over 1000 isn't RE2")
start = time.time()
r = fetch(site, u("cdn.localhost", "/res/" + "a" * 60 + "!"))
took = time.time() - start
t.ok(r != "blocked" and took < 5, f"a long run of a's in an address doesn't stall the browser ({took:.2f} s)")

tab_id = b.call({"do": "extensions.tabId", "tab": site})["tabId"]
dnr("chrome.declarativeNetRequest.updateSessionRules({ addRules: [{ id: 1, action: { type: 'block' }, condition: { urlFilter: '/sess/', tabIds: [%d] } }] })" % tab_id)
t.ok(blocked(site, u("cdn.localhost", "/res/sess/")) and not blocked(trusted, u("cdn.localhost", "/res/sess/")), "session rule with tabIds")
t.ok(len(dnr("chrome.declarativeNetRequest.getSessionRules()")) == 1, "getSessionRules")

matched = dnr("chrome.declarativeNetRequest.getMatchedRules({ tabId: %d })" % tab_id)
ids = {(m["rule"]["rulesetId"], m["rule"]["ruleId"]) for m in matched["rulesMatchedInfo"]}
t.ok(("base", 1) in ids and ("_session", 1) in ids, "getMatchedRules")
outcome = dnr("chrome.declarativeNetRequest.testMatchOutcome({ url: 'http://ads.localhost/a', type: 'script', initiator: 'http://site.localhost' })")
t.ok(outcome == {"matchedRules": [{"ruleId": 1, "rulesetId": "base"}]}, f"testMatchOutcome (got {outcome})")

dnr("chrome.declarativeNetRequest.setExtensionActionOptions({ displayActionCountAsBadgeText: true })")
b.cmd("tab.select", id=site)
time.sleep(0.3)
b.ev(site, "location.reload()")
b.wait_for(lambda: b.active()["title"] == "dnr page" and not b.active()["loading"], what="reload")
for _ in range(3):
    blocked(site, u("ads.localhost", "/res/count"))
badge = b.call({"do": "extensions.badge", "id": EXT, "tabId": tab_id})["text"]
t.ok(badge == "3", f"blocked requests counted on the badge (got {badge})")

# The worker sees the same API.
w = b.ev(page, "new Promise(r => chrome.runtime.sendMessage('worker', r))")
t.ok(w["same"] and w["rulesets"] == ["base", "extra"], f"the worker has the API too (got {w and w.get('rulesets')})")

# chrome.commands
cmds = {c["name"]: c for c in w["commands"]}
t.ok(cmds["say-hi"]["shortcut"] == "Ctrl+Shift+Y" and cmds["say-hi"]["description"] == "Say hi", "commands.getAll gives the suggested key")
t.ok(cmds["_execute_action"]["shortcut"] == "Alt+Shift+K", "the windows key wins over default")
t.ok(cmds["taken"]["shortcut"] == "", "a key the browser keeps stays unassigned")
t.ok(cmds["no-key"]["shortcut"] == "", "a command without key")
mod = "meta" if sys.platform == "darwin" else "control"
b.cmd("tab.select", id=site)
time.sleep(0.4)
b.key("Y", mod, "shift")
got = b.wait_for(lambda: (v := b.ev(page, "chrome.storage.local.get('lastCommand').then(v => v.lastCommand || null)")) and v, within=5, what="onCommand")
t.ok(got == "say-hi", "the key reaches chrome.commands.onCommand")
t.ok(b.ev(page, "chrome.storage.local.get('commandTab').then(v => v.commandTab)").startswith(f"http://site.localhost:{PORT}/page"), "with the active tab")
b.key("K", "alt", "shift")
opened = b.wait_for(lambda: b.ev(page, "chrome.storage.local.get('popupOpened').then(v => v.popupOpened || 0)"), within=5, what="popup")
t.ok(bool(opened), "_execute_action opens the popup")

# Saved across a restart; session rules are not.
time.sleep(0.5)
b.quit()
b.use("extensions-dnr", wipe=False)
b.launch()
b.call({"do": "extensions.loadUnpacked", "path": str(FIXTURE), "copy": True})
st = b.call({"do": "extensions.dnrState", "id": EXT})
t.ok(st["enabled"] == ["base", "extra"], "enabled rulesets kept after a restart")
t.ok(st["dynamicRules"] == 4 and st["sessionRules"] == 0, "dynamic rules kept, session rules gone")
t.done()

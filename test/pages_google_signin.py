#!/usr/bin/env python3
"""Google's sign-in button ("Continue with Google" on Pinterest and every site
with it): it asks FedCM first, and Chromium has the API but Oriel has no
account chooser behind it, so the call never answered and the button did
nothing (a friend's report, 26 Nov 2026). FedCM is off: the API isn't there,
a call to it is refused at once, and Google's script uses its pop-up."""
import sys
import time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b
import settings_web as web

server, origin = web.start()
web.PAGES["/page"] = "<title>signin</title><body>a page</body>"
t = b.T()

b.use("pages-google-signin")
b.launch()
b.cmd("tab.new", url=origin + "/page")
time.sleep(1.5)
tab = next(x["id"] for x in b.window()["tabs"] if x.get("title") == "signin")
ev = lambda js: b.ev(tab, js)
t.ok(ev("window.isSecureContext") is True, "the test page is a secure context (FedCM would be there on one)")
t.ok(ev("typeof IdentityCredential") == "undefined", "the FedCM API isn't there")
answer = ev("""(async () => {
  const p = navigator.credentials.get({ identity: { providers: [{ configURL: 'https://accounts.google.com/gsi/fedcm.json', clientId: '1.apps.googleusercontent.com' }] }, mediation: 'optional' })
    .then(() => 'answered', e => 'refused:' + e.name)
  return await Promise.race([p, new Promise(r => setTimeout(() => r('HANG'), 3000))])
})()""")
t.ok(isinstance(answer, str) and answer.startswith("refused:"), f"a call to it is refused at once, never left hanging ({answer})")
# Google's script tests for the API and, without it, opens its pop-up: a sized
# window.open from a click comes up as a tab (or a small window), as any pop-up does.
before = len(b.window()["tabs"])
ev("document.body.addEventListener('click', () => window.open('about:blank', 'gsi', 'width=590,height=830')); 1")
b.call({"do": "eval", "id": tab, "js": "document.body.click(); 1"})
time.sleep(1.5)
t.ok(len(b.window()["tabs"]) == before + 1 or len(b.call({"do": "settingsb.popupWindows"})["windows"]) > 0, "a sized pop-up from a click opens")
# Done, Google's pop-up hands the answer to the page and closes itself
# (window.close()): its tab goes and the page that opened it is in front again.
# It stayed as an empty dark page (a friend's report, 26 Nov 2026).
web.PAGES["/pop"] = "<title>pop</title><body>signing in<script>setTimeout(() => { opener && opener.postMessage('signed-in', '*'); window.close() }, 800)</script></body>"
b.quit()
b.use("pages-google-signin-close")
b.launch()
b.cmd("tab.new", url=origin + "/page")
time.sleep(1.5)
tab = next(x["id"] for x in b.window()["tabs"] if x.get("title") == "signin")
ev("window.got = null; addEventListener('message', e => window.got = e.data); 1")
ev("document.body.addEventListener('click', () => window.open('/pop', 'gsi2', 'width=500,height=600')); 1")
b.call({"do": "eval", "id": tab, "js": "document.body.click(); 1"})
b.wait_for(lambda: any(x.get("title") == "pop" for x in b.window()["tabs"]), what="the pop-up's tab")
b.wait_for(lambda: not any(x.get("title") == "pop" for x in b.window()["tabs"]), within=10, what="the pop-up's tab gone")
w_ = b.window()
t.ok(w_["activeID"] == tab, f"the pop-up closed itself: its tab is gone and the page that opened it is in front ({[(x.get('title'), x['id'] == w_['activeID']) for x in w_['tabs']]})")
t.ok(ev("window.got") == "signed-in", "and that page has the answer")
t.ok(not b.state().get("errors"), "no error in the main process")
b.quit()
server.shutdown()
t.done()

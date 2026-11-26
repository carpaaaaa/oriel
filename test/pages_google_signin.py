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
t.ok(not b.state().get("errors"), "no error in the main process")
b.quit()
server.shutdown()
t.done()

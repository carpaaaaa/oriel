#!/usr/bin/env python3
"""Offer passkeys (Settings › Passwords, studio/06 §1.7 #112; 08 area D,
passkeys): on (the default), a site's passkey calls are Chromium's own, to
Windows Hello; off, a site hears there is no passkey and no authenticator,
at once, while password credentials still pass. Never calls a real passkey
on: that would put the system's question on the screen."""
import sys
import time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b
import settings_web as web

server, origin = web.start()
web.PAGES["/login"] = "<title>login</title><body>login</body>"

b.use("settings-d-passkeys")
b.launch()
t = b.T()


def page():
    b.cmd("tab.new", url=origin + "/login")
    b.wait_for(lambda: b.active()["title"] == "login", what="page")
    time.sleep(0.3)
    return b.active()["id"]


CREATE = """navigator.credentials.create({ publicKey: { challenge: new Uint8Array(16), rp: { name: 'x' },
  user: { id: new Uint8Array(8), name: 'a', displayName: 'a' }, pubKeyCredParams: [{ type: 'public-key', alg: -7 }], timeout: 5000 } })
  .then(() => 'made', e => e.name)"""

# On: Chromium's own calls.
tab = page()
t.ok(b.state()["prefs"].get("passkeys", True) is not False, "on by default")
t.ok("[native code]" in b.ev(tab, "navigator.credentials.create.toString()"), "on: a site's passkey calls are Chromium's own")
t.ok("[native code]" in b.ev(tab, "PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable.toString()"), "on: the authenticator question is Chromium's")

# Off: no passkey, no authenticator; passwords still pass.
b.cmd("settings.set", id="passkeys", value=False)
tab = page()
t.ok(b.ev(tab, "PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()") is False, "off: no authenticator to offer one")
t.ok(b.ev(tab, "PublicKeyCredential.isConditionalMediationAvailable()") is False, "off: no passkey under the sign-in box")
start = time.time()
t.ok(b.ev(tab, CREATE) == "NotAllowedError" and time.time() - start < 2, "off: making a passkey is refused at once, with no question")
got = b.ev(tab, "navigator.credentials.get({ publicKey: { challenge: new Uint8Array(16), timeout: 5000 } }).then(() => 'got', e => e.name)")
t.ok(got == "NotAllowedError", "off: signing in with a passkey is refused")
t.ok(b.ev(tab, "typeof navigator.credentials.get === 'function' && typeof navigator.credentials.store === 'function'"), "password credentials are left alone")

# On again: new pages are Chromium's again.
b.cmd("settings.set", id="passkeys", value=True)
tab = page()
t.ok("[native code]" in b.ev(tab, "navigator.credentials.create.toString()"), "on again: Chromium's own calls in new pages")
t.ok(not b.state().get("errors"), "no error in the main process")
server.shutdown()
t.done()

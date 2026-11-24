#!/usr/bin/env python3
"""Site permissions as Search asks for them (studio/06 §2.6, §1.8): nothing is
given without asking; the question rises from the page's foot with the Mac's
words, ignores clicks in its first half second, one at a time; answers are
kept per origin under the Mac's keys (capture.<origin>|0|1|location|
notifications), listed in Settings › Privacy, reset there, all forgotten
with Forget choices. Camera and location are only ever refused here: a test
never opens a real device or asks the system."""
import sys
import time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b
import settings_web as web

server, origin = web.start()
web.PAGES["/ask"] = "<title>asks</title><body>asks</body>"
web.PAGES["/other"] = "<title>other</title><body>other</body>"

b.use("settings-permissions")
b.launch("--use-fake-device-for-media-stream")
t = b.T()


def ev(tab, js):
    try:
        return b.ev(tab, js)
    except RuntimeError:
        return None


def asking():
    return (b.window().get("settings") or {}).get("asking")


def prefs():
    return b.state()["prefs"]


b.cmd("tab.new", url=origin + "/ask")
b.wait_for(lambda: b.active()["title"] == "asks", what="page")
page = b.active()["id"]
time.sleep(0.3)

# 1. Before anything: not granted (Electron would have said yes to all).
t.ok(ev(page, "navigator.permissions.query({name: 'notifications'}).then(s => s.state)") != "granted", "notifications aren't granted before asking")
t.ok(ev(page, "navigator.permissions.query({name: 'camera'}).then(s => s.state)") != "granted", "the camera isn't granted before asking")

# 2. Notifications: the question, its words, the half second, Allow.
b.ev(page, "window.answer = null; Notification.requestPermission().then(r => window.answer = r); 1")
b.wait_for(asking, what="question")
q = asking()
t.ok(q["wants"] == "notifications" and q["host"] == "127.0.0.1", f"the question names the site and what it wants ({q})")
w = b.window()
t.ok(w["overlay"]["kind"] == "panel" and w["overlay"]["name"] == "settings.permission", "it floats over the page")
b.wait_for(lambda: b.ui("document.querySelector('.pq-text')?.textContent", root="overlay"), what="question drawn")
text = b.ui("document.querySelector('.pq-text')?.textContent", root="overlay")
t.ok(text == "127.0.0.1 wants to send you notifications", f"in the Mac's words ({text!r})")
buttons = b.ui("[...document.querySelectorAll('.pq-actions button')].map(b => b.textContent)", root="overlay")
t.ok(buttons == ["Allow", "Don't allow"], f"Allow and Don't allow ({buttons})")
early = b.cmd("permission.answer", answer="allow")
t.ok(early["taken"] is False, "a click in the first half second doesn't count")
time.sleep(0.6)
b.ui("document.querySelector('.pq-allow').click()", root="overlay")
b.wait_for(lambda: ev(page, "window.answer") == "granted", what="granted")
t.ok(True, "Allow: the page hears granted")
key = f"capture.{origin}|notifications"
t.ok(prefs().get(key) is True, f"kept as {key}")
t.ok(not asking() and b.window()["overlay"]["kind"] == "none", "the question goes")
t.ok(ev(page, "Notification.permission") == "granted", "Notification.permission says granted")
ev(page, "Notification.requestPermission().then(r => window.answer2 = r); 1")
b.wait_for(lambda: ev(page, "window.answer2") == "granted", what="asked again")
t.ok(not asking(), "asked again, answered from what was kept, no question")

# 3. Camera: Don't allow, kept as a refusal under both spellings; asked again, refused at once.
ev(page, "window.cam = null; navigator.mediaDevices.getUserMedia({video: true}).then(() => window.cam = 'yes', e => window.cam = e.name); 1")
b.wait_for(asking, what="camera question")
t.ok(asking()["wants"] == "camera", "the camera question")
t.ok(b.ui("document.querySelector('.pq-text').textContent", root="overlay") == "127.0.0.1 wants to use your camera", "127.0.0.1 wants to use your camera")
time.sleep(0.6)
b.ui("document.querySelector('.pq-deny').click()", root="overlay")
b.wait_for(lambda: ev(page, "window.cam"), what="camera refused")
t.ok(ev(page, "window.cam") == "NotAllowedError", "Don't allow: the page is refused")
p = prefs()
t.ok(p.get(f"capture.{origin}|0") is False, "kept as capture.<origin>|0 = false")
ev(page, "window.cam = null; navigator.mediaDevices.getUserMedia({video: true, audio: true}).then(() => window.cam = 'yes', e => window.cam = e.name); 1")
b.wait_for(lambda: ev(page, "window.cam"), what="combined refused")
t.ok(ev(page, "window.cam") == "NotAllowedError" and not asking(), "camera and microphone together: refused at once, the camera being refused")

# 4. Location: Allow once, Always allow, Don't allow.
ev(page, "window.loc = null; navigator.geolocation.getCurrentPosition(() => window.loc = 'yes', e => window.loc = 'refused ' + e.code); 1")
b.wait_for(asking, what="location question")
t.ok(asking()["wants"] == "location" and asking()["once"], "the location question")
buttons = b.ui("[...document.querySelectorAll('.pq-actions button')].map(b => b.textContent)", root="overlay")
t.ok(buttons == ["Allow once", "Always allow", "Don't allow"], f"Allow once, Always allow, Don't allow ({buttons})")
t.ok(b.ui("document.querySelector('.pq-text').textContent", root="overlay") == "127.0.0.1 wants to know your location", "127.0.0.1 wants to know your location")

# 5. One at a time: a second question while one waits is refused.
ev(page, "window.mic = null; navigator.mediaDevices.getUserMedia({audio: true}).then(() => window.mic = 'yes', e => window.mic = e.name); 1")
b.wait_for(lambda: ev(page, "window.mic"), what="second question")
t.ok(ev(page, "window.mic") == "NotAllowedError" and asking()["wants"] == "location", "a second question while one waits is refused")
t.ok(f"capture.{origin}|1" not in prefs(), "and nothing is kept for it")

# 6. Going to another tab refuses the question on screen.
b.cmd("tab.new", url=origin + "/other")
b.wait_for(lambda: b.active()["title"] == "other", what="other tab")
b.wait_for(lambda: (b.call({"do": "settings.state"})["asked"] or [{}])[-1].get("answer") == "left", what="refused on leaving")
t.ok(not asking(), "leaving the tab refuses its question")
t.ok(f"capture.{origin}|location" not in prefs(), "a question left unanswered keeps nothing")
# The page behind is hidden, and Chromium holds its answer; shown again, the
# page is still waiting and asks again: answered, it hears it.
b.cmd("tab.select", id=page)
b.wait_for(asking, what="asked again on return")
t.ok(asking()["wants"] == "location", "back on the page, its still-waiting question comes up again")
time.sleep(0.6)
b.cmd("permission.answer", answer="deny")
b.wait_for(lambda: ev(page, "window.loc"), what="location settled")
t.ok(ev(page, "window.loc") == "refused 1", "Don't allow: the page hears it (code 1)")
t.ok(prefs().get(f"capture.{origin}|location") is False, "and the refusal is kept")
b.cmd("tab.new", url=origin + "/other")
b.wait_for(lambda: b.active()["title"] == "other", what="other tab again")

# 7. A tab behind asks: its question waits until you go to it.
ev(page, "window.mic = null; navigator.mediaDevices.getUserMedia({audio: true}).then(() => window.mic = 'yes', e => window.mic = e.name); 1")
time.sleep(0.8)
t.ok(not asking(), "a tab behind doesn't ask over the page in front")
b.cmd("tab.select", id=page)
b.wait_for(asking, what="held question")
t.ok(asking()["wants"] == "microphone", "going to it, its question comes up")
time.sleep(0.6)
b.cmd("permission.answer", answer="deny")
b.wait_for(lambda: ev(page, "window.mic"), what="mic refused")

# 8. What WebKit never offers is refused without a question.
r = ev(page, "navigator.clipboard.readText().then(() => 'read', e => e.name)")
t.ok(r != "read" and not asking(), f"reading the clipboard is refused ({r})")
r = ev(page, "navigator.requestMIDIAccess ? navigator.requestMIDIAccess().then(() => 'yes', e => e.name) : 'none'")
t.ok(r != "yes", f"MIDI is refused ({r})")

# 9. Let sites ask to send notifications, off: refused without a question.
b.cmd("settings.set", id="notifications.ask", value=False)
b.cmd("tab.new", url=f"http://localhost:{server.server_address[1]}/ask")
b.wait_for(lambda: b.active()["title"] == "asks", what="localhost page")
other = b.active()["id"]
time.sleep(0.3)
r = ev(other, "Notification.requestPermission()")
t.ok(r == "denied" and not asking(), f"with Let sites ask off, notifications are refused at once ({r})")
b.cmd("settings.set", id="notifications.ask", value=True)

# 10. Settings › Privacy lists what was kept; Reset removes one; Forget choices all.
listed = b.cmd("permission.list")["saved"]
kinds = sorted((s["origin"], s["kind"], s["choice"]) for s in listed)
t.ok((origin, "notifications", "allow") in kinds and (origin, "camera", "refuse") in kinds and (origin, "microphone", "refuse") in kinds,
     f"Privacy lists each site's answers ({kinds})")
b.cmd("app.settings")
b.cmd("settings.open", page="privacy")
st = next(x for x in b.window()["tabs"] if x.get("internal") == "settings")["id"]
b.wait_for(lambda: ev(st, "document.querySelector('.perm-site') && document.querySelector('.perm-site').innerText"), what="site in Settings")
row = ev(st, "document.querySelector('.perm-site').innerText")
t.ok(origin in row and "4 permissions" in row, f"the site's row: origin and how many ({row!r})")
t.ok("Reset asks again next time. Devices already in use keep running." in ev(st, "document.body.innerText"), "the note above the list")
ev(st, "document.querySelector('.perm-site').click()")
time.sleep(0.2)
lines = ev(st, "[...document.querySelectorAll('.st-under .st-line')].map(l => l.innerText.replace(/\\n/g, ' | '))")
t.ok(any(l.startswith("Camera | Refuse") for l in lines) and any(l.startswith("Notifications | Allow") for l in lines), f"one line per permission, with its answer ({lines})")
ev(st, "[...document.querySelectorAll('.st-under .st-line')].find(l => l.innerText.startsWith('Camera')).querySelector('button').click()")
b.wait_for(lambda: f"capture.{origin}|0" not in prefs() or prefs().get(f"capture.{origin}|0") is None, what="camera reset")
t.ok(prefs().get(f"capture.{origin}|0") is None and prefs().get(f"capture.{origin}|1") is False, "Reset removes the camera's answer and only it")
b.cmd("settings.do", id="privacy.forget")
time.sleep(0.2)
t.ok(not any(k.startswith("capture.") and v is not None for k, v in prefs().items()), "Forget choices forgets them all")
t.ok(b.call({"do": "settings.state"})["said"][-1] == "Camera, microphone, location and notification choices forgotten", "and says so")

t.ok(not b.state().get("errors"), "no error in the main process")
server.shutdown()
t.done()

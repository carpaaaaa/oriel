#!/usr/bin/env python3
"""Settings › Browsing › Site shortcuts, as on the Mac (Keyword.swift,
Settings.swift keywordEditor, draftProblem, keywordDetail, saveDraft;
Browser.destination; SiteSearch.match with the keywords; studio/03 §1.9,
§1.10, studio/06 row 73).

No ready-made site: the row and its Add, nothing under it. A shortcut is the
word, then an http or https address with %s once where the words go; one
typed without its scheme is saved as https (Search 1.0.22, KeywordAddressTests);
one without %s, with %s in the host or twice, or not http(s), is refused with
the Mac's line and Save stays off. Saved, it is listed, clicked it opens to be
changed, its X deletes it. In the field the word, a space and the words, or
the word, Tab and the words, go to the address with the words in place of %s,
until it is deleted. An earlier Oriel's ready-made sites (search.sites) are
dropped and its own shortcuts kept working. Real key events in the field."""
import json
import sys
import time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b

YT = "https://www.youtube.com/results?search_query=%s"
UUID_RD = "3F2504E0-4F89-11D3-9A0C-0305E82C3301"
UUID_GH = "6B29FC40-CA47-1067-B31D-00DD010662DA"
# The searches never leave the machine: the address the tab goes to is enough.
OFFLINE = ["www.youtube.com", "www.google.com", "www.reddit.com", "github.com"]


def site(text):
    return b.call({"do": "field.address", "text": text})["site"]


def goes(text):
    return b.call({"do": "field.address", "text": text})["destination"]


def prefs():
    return b.state()["prefs"]


def shortcuts():
    return prefs().get("search.keywords") or []


# ---------------------------------------------------------------------------
# 1. What an earlier Oriel left: two ready-made sites turned on, a shortcut,
#    and one its Settings saved without https:// (the field never took it).

b.use("settings-shortcuts-old")
f = b.folder() / "prefs.json"
f.parent.mkdir(parents=True, exist_ok=True)
f.write_text(json.dumps({
    "search.sites": ["Wikipedia", "Amazon"],
    "search.keywords": [
        {"id": UUID_RD, "keyword": "rd", "template": "https://www.reddit.com/search/?q=%s"},
        {"id": UUID_GH, "keyword": "gh", "template": "github.com/search?q=%s"},
    ],
}))
b.launch(env={"SEARCH_LOOK": "light"})
t = b.T()
time.sleep(0.6)

t.ok(prefs().get("search.sites") is None, "the ready-made sites turned on before are dropped")
b.wait_for(lambda: "search.sites" not in json.loads(f.read_text()), what="search.sites gone from prefs.json")
t.ok(True, "...from prefs.json too")
for word in ("wiki", "amaz", "goo", "maps", "so"):
    t.ok(site(word) is None, f"{word!r}: no ready-made site offered")
kept = shortcuts()
t.ok([(k["id"], k["keyword"]) for k in kept] == [(UUID_RD, "rd"), (UUID_GH, "gh")], f"the shortcuts made before are kept, in their order: {kept}")
t.ok(kept[1]["template"] == "https://github.com/search?q=%s", f"the one saved without https:// gets it: {kept[1]['template']!r}")
t.ok(goes("rd cats") == "https://www.reddit.com/search/?q=cats", "rd cats still goes to Reddit")
t.ok(goes("gh cats") == "https://github.com/search?q=cats", "gh cats now goes to GitHub")
b.quit()

# ---------------------------------------------------------------------------
# 2. A new install: no shortcut, no ready-made site.

b.use("settings-shortcuts")
b.launch(env={"SEARCH_LOOK": "light"})
time.sleep(0.8)
b.call({"do": "ctxmenu.offline", "hosts": OFFLINE})


def key(k, *mods, to="ui"):
    b.call({"do": "field.key", "key": k, "modifiers": list(mods), "to": to})


def typed(word, to="ui"):
    for ch in word:
        key(ch, to=to)
        time.sleep(0.12)
    time.sleep(0.4)


def field():
    return b.window()["field"]


def blank():
    """A new tab, once its field has the keys."""
    b.cmd("tab.new")
    b.wait_for(lambda: b.active()["empty"] and b.ui("document.activeElement === document.querySelector('.field input')"), what="the field has the keys")
    time.sleep(0.3)


def went(url, what):
    try:
        b.wait_for(lambda: b.active()["url"] == url, what=what)
    except AssertionError:
        f, a = field(), b.active()
        print("   field:", {k: f.get(k) for k in ("text", "open", "offer", "chip")}, "tab:", {k: a.get(k) for k in ("url", "internal", "empty")})
        return False
    return True


t.ok(shortcuts() == [], "no site shortcut to begin with (Prefs.swift: empty until someone adds one)")
t.ok("search.sites" not in prefs(), "no ready-made sites key")
for word in ("red", "yt", "gh", "wiki", "goo", "maps", "amaz"):
    t.ok(site(word) is None, f"{word!r}: no ready-made site offered")
t.ok(goes("yt cats") == "https://www.google.com/search?q=yt%20cats", "yt cats is a search like any other words")
typed("red")
t.ok(field().get("offer") is None and not b.ui("!!document.querySelector('.field-offer')"), "typing red in the field offers no site")
key("Tab")
time.sleep(0.3)
t.ok(field().get("chip") is None, "...and Tab puts none in it")
key("Escape")
key("Escape")
time.sleep(0.3)

# Settings › Browsing
tab = b.cmd("settings.open", page="browsing")["tab"]


def ev(js):
    try:
        return b.ev(tab, js)
    except RuntimeError:  # the page not there yet
        return None


ROW = ".sr[data-row='search.keywords']"
b.wait_for(lambda: ev(f"!!document.querySelector({json.dumps(ROW)})"), what="Site shortcuts row", within=30)
time.sleep(0.3)


def detail():
    return ev(f"document.querySelector({json.dumps(ROW + ' .sr-detail')})?.textContent")


def pills():
    return ev(f"[...document.querySelectorAll({json.dumps(ROW + ' .sr-control .pill-st')})].map(p => [p.textContent, p.disabled])")


def editor():
    return ev("(() => { const e = document.querySelector('.kw.editing'); if (!e) return null; const [w, a] = e.querySelectorAll('input');"
              " return { word: w.value, address: a.value, wordHint: w.placeholder, addressHint: a.placeholder } })()")


def write(word=None, address=None):
    for i, v in ((0, word), (1, address)):
        if v is None:
            continue
        ev("(() => { const el = document.querySelectorAll('.kw.editing input')[%d]; el.value = %s;"
           " el.dispatchEvent(new Event('input', {bubbles: true})) })()" % (i, json.dumps(v)))
    time.sleep(0.15)


def enter():
    ev("document.querySelectorAll('.kw.editing input')[1].dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}))")
    time.sleep(0.3)


def press(title):
    ev("[...document.querySelectorAll(%s)].find(p => p.textContent === %s)?.click()" % (json.dumps(ROW + " .sr-control .pill-st"), json.dumps(title)))
    time.sleep(0.3)


def listed():
    return ev("[...document.querySelectorAll('.kw:not(.editing)')].map(r => [r.querySelector('.kw-word').textContent,"
              " r.querySelector('.kw-arrow').textContent, r.querySelector('.kw-template').textContent, r.querySelector('.kw-change').title])")


def style(sel, *props, pseudo=None):
    return ev("(() => { const s = getComputedStyle(document.querySelector(%s), %s); return %s })()"
              % (json.dumps(sel), json.dumps(pseudo), "{" + ", ".join(f"{json.dumps(p)}: s[{json.dumps(p)}]" for p in props) + "}"))


# What the Mac shows with none: the row, its words, Add, nothing under it.
t.ok(ev(f"document.querySelector({json.dumps(ROW + ' .sr-title')}).textContent") == "Site shortcuts", "the row: Site shortcuts")
t.ok(detail() == 'A word before your search sends it to that site: "yt cats"', f"the Mac's words under it: {detail()!r}")
t.ok(pills() == [["Add", False]], f"one pill, Add: {pills()}")
t.ok(ev("document.querySelectorAll('.kw, .kw-site-row').length") == 0, "no ready-made site and no shortcut listed under it")
ev("(() => { const f = document.querySelector('.st-find input'); f.value = 'search a site'; f.dispatchEvent(new Event('input', {bubbles: true})) })()")
time.sleep(0.3)
found = ev("[...document.querySelectorAll('.sr[data-row]')].map(r => r.dataset.row)")
t.ok("note.sitesearch" not in found, f"no note promising a ready-made site to search with Tab ({found})")
ev("(() => { const f = document.querySelector('.st-find input'); f.value = 'bang'; f.dispatchEvent(new Event('input', {bubbles: true})) })()")
time.sleep(0.3)
found = ev("[...document.querySelectorAll('.sr[data-row]')].map(r => r.dataset.row)")
t.ok(found == ["search.keywords"], f"the find field finds the row by its words ({found})")
ev("(() => { const f = document.querySelector('.st-find input'); f.value = ''; f.dispatchEvent(new Event('input', {bubbles: true})) })()")
b.cmd("settings.open", page="browsing")
b.wait_for(lambda: ev(f"!!document.querySelector({json.dumps(ROW + ' .sr-control .pill-st')})"), what="row again")
time.sleep(0.3)

# Add: Cancel and Save, the editor, the first words.
press("Add")
t.ok(pills() == [["Cancel", False], ["Save", True]], f"Add gives Cancel and Save, Save off: {pills()}")
t.ok(detail() == "Type a word, like yt, then the site's search address with %s where the words you type go", f"the first words: {detail()!r}")
e = editor()
t.ok(e and e["wordHint"] == "word" and e["addressHint"] == "e.g. https://youtube.com/results?search_query=%s",
     f"the Mac's two placeholders, the example a whole address, short enough to show its %s (Search 1.0.22): {e}")
hint = ev("document.querySelector('.kw-hint')?.textContent ?? null")
t.ok(hint is None, f"nothing said of http or https under the editor: an address without it is taken as https ({hint!r})")
hints = [style(".kw.editing input:nth-of-type(%d)" % n, "fontStyle", pseudo="::placeholder")["fontStyle"] for n in (1, 2)]
t.ok(hints == ["italic", "italic"], f"both in italics, plainly examples: {hints}")
look = style(".kw.editing", "marginLeft", "marginRight", "marginBottom", "paddingTop", "paddingLeft", "borderTopLeftRadius", "backgroundColor", "fontSize")
t.ok(look == {"marginLeft": "52px", "marginRight": "14px", "marginBottom": "6px", "paddingTop": "7px", "paddingLeft": "10px",
              "borderTopLeftRadius": "9px", "backgroundColor": "rgb(239, 239, 239)", "fontSize": "12.5px"},
     f"the editor: from the title's edge (52), 14 at the right, 7 by 10 inside, corners of 9, wash, 12.5 ({look})")
t.ok(round(ev("document.querySelector('.kw.editing input').getBoundingClientRect().width")) == 50, "the word's field is 50 wide")
t.ok(ev("document.querySelector('.kw.editing .kw-arrow').textContent") == "→", "an arrow between the word and the address")

# Refused as the Mac refuses it (Keyword.problem).
ADDRESS = "An http or https address with %s once, where the words go"
for word, address, why, what in [
    ("yt", "", ADDRESS, "a word and no address yet"),
    ("yt", "https://www.youtube.com/results?search_query=", ADDRESS, "no %s"),
    ("yt", "www.youtube.com/results?search_query=", ADDRESS, "no %s, and no https either"),
    ("yt", "%s.example.com", ADDRESS, "%s in the host, without https"),
    ("yt", "javascript:alert(%s)", ADDRESS, "javascript:"),
    ("yt", "https://www.youtube.com/results?search_query=%s&again=%s", ADDRESS, "%s twice"),
    ("yt", "https://%s.youtube.com/", ADDRESS, "%s in the host"),
    ("yt", "ftp://www.youtube.com/results?search_query=%s", ADDRESS, "ftp, not http or https"),
    ("", YT, "A word to type first, like yt", "an address and no word"),
    ("y t", YT, "One word, with no spaces in it", "two words"),
]:
    write(word, address)
    t.ok(detail() == why and pills() == [["Cancel", False], ["Save", True]], f"{what}: {detail()!r}, Save off")
write("yt", "www.youtube.com/results?search_query=")
enter()
t.ok(shortcuts() == [] and editor() is not None, "Return on a refused address saves nothing")
write("yt", "www.youtube.com/results?search_query=%s")
t.ok(detail() == "yt will search youtube.com" and pills() == [["Cancel", False], ["Save", False]],
     f"an address without https (Search 1.0.22): accepted, Save on ({detail()!r})")

# Accepted: the Mac's line, Save on, saved by Return or by Save.
write("yt", YT)
t.ok(detail() == "yt will search youtube.com", f"accepted: {detail()!r}")
t.ok(pills() == [["Cancel", False], ["Save", False]], "Save on")
write(" yt ", " www.youtube.com/results?search_query=%s ")
t.ok(detail() == "yt will search youtube.com", "spaces round the word and the address don't count")
press("Save")
b.wait_for(lambda: len(shortcuts()) == 1, what="the shortcut saved")
saved = shortcuts()[0]
t.ok(saved["keyword"] == "yt" and saved["template"] == YT and len(saved.get("id", "")) == 36,
     f"saved trimmed, as https, with an id of its own: {saved}")
t.ok(editor() is None and pills() == [["Add", False]], "the editor goes, Add is back")
t.ok(detail() == 'A word before your search sends it to that site: "yt cats"', "the row's own words are back")
t.ok(listed() == [["yt", "→", YT, "Click to change"]], f"it appears under the row: {listed()}")
row = style(".kw:not(.editing)", "marginLeft", "paddingTop", "borderTopLeftRadius", "backgroundColor")
t.ok(row == {"marginLeft": "52px", "paddingTop": "7px", "borderTopLeftRadius": "9px", "backgroundColor": "rgb(239, 239, 239)"}, f"listed like the editor: {row}")
t.ok(ev("!!document.querySelector('.kw:not(.editing) .kw-remove svg')"), "with its X to delete it")

# In the field: the word, a space, the words (Browser.destination).
t.ok(goes("yt cats") == "https://www.youtube.com/results?search_query=cats", "yt cats goes to the address with cats in place of %s")
t.ok(goes("YT  cute cats ") == "https://www.youtube.com/results?search_query=cute%20cats", "the word in any case, the words trimmed and encoded")
t.ok(goes("yt") == "https://www.google.com/search?q=yt", "the word alone is a search")
t.ok(site("yt") == "Youtube" and site("you") == "Youtube", f"the word, or the start of the site's name, offers the site ({site('yt')}, {site('you')})")
t.ok(site("red") is None, "and no other site")
blank()
typed("yt cats")
key("Return")
t.ok(went("https://www.youtube.com/results?search_query=cats", "yt cats"), "typed in the field, yt cats and Return go there")
# The word, Tab, the words (SiteSearch.match, lockSiteOffer).
blank()
typed("yt")
f = field()
t.ok((f.get("offer") or {}).get("name") == "Youtube" and "Search Youtube" in (b.ui("document.querySelector('.field-offer')?.textContent") or ""),
     f"yt offers Search Youtube with its Tab key: {f.get('offer')}")
key("Tab")
time.sleep(0.3)
t.ok((field().get("chip") or {}).get("name") == "Youtube" and field()["text"] == "", "Tab puts it in the field, the word goes")
typed("dogs")
key("Return")
t.ok(went("https://www.youtube.com/results?search_query=dogs", "chip"), "then dogs and Return go to the address with dogs")

# Back in Settings: a word already taken, then a change.
tab = b.cmd("settings.open", page="browsing")["tab"]
b.wait_for(lambda: b.active()["id"] == tab and listed(), what="Settings again")
time.sleep(0.3)
press("Add")
write("YT", "https://example.com/?q=%s")
t.ok(detail() == "yt already goes to youtube.com" and pills()[1] == ["Save", True], f"a word already taken, in any case: {detail()!r}")
press("Cancel")
t.ok(editor() is None and len(shortcuts()) == 1, "Cancel keeps nothing of it")
ev("document.querySelector('.kw-change').click()")
time.sleep(0.3)
e = editor()
t.ok(e and e["word"] == "yt" and e["address"] == YT, f"clicked, a saved shortcut opens in the editor to be changed: {e}")
t.ok(listed() == [], "...and isn't listed twice")
t.ok(detail() == "yt will search youtube.com", "not taken by itself")
write("ytb")
enter()
b.wait_for(lambda: shortcuts() and shortcuts()[0]["keyword"] == "ytb", what="changed")
t.ok(len(shortcuts()) == 1 and shortcuts()[0]["id"] == saved["id"], "changed in its place, the same one")
ev("document.querySelector('.kw-change').click()")
time.sleep(0.3)
write("yt")
press("Save")
b.wait_for(lambda: shortcuts() and shortcuts()[0]["keyword"] == "yt", what="changed back")

# Deleted: gone, and the word is words again.
ev("document.querySelector('.kw:not(.editing) .kw-remove').click()")
b.wait_for(lambda: shortcuts() == [], what="the shortcut deleted")
t.ok(True, "its X deletes it")
t.ok(listed() == [] and pills() == [["Add", False]], "gone from under the row")
t.ok(goes("yt cats") == "https://www.google.com/search?q=yt%20cats", "yt cats is a search again")
t.ok(site("yt") is None, "yt offers no site")
blank()
typed("yt")
t.ok(field().get("offer") is None, "in the field too")
typed(" cats")
key("Return")
t.ok(went("https://www.google.com/search?q=yt%20cats", "yt cats searched"), "yt cats and Return search Google with them")
t.ok(not b.state().get("errors"), "no error in the main process")
t.done()

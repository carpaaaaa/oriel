#!/usr/bin/env python3
"""New tab in a floating field (Settings › Tabs › Opening, `newtab.floating`;
studio/01 §3.5, §6.45; studio/03 §1.1, §1.5), with the Mac's values:
Browser.launch/dismiss/submit (Browser.swift:4841-4908, 8270-8282, 8335-8402),
App.swift's Escape and ⌘W, Omnibox.swift's veil, and Search's own tests
newtab_floating_group.py, field_close.py, field_keys.py, field_modes.py,
newtab_recent.py, newtab_arc.py and shift_return.py.

Off, Ctrl+T opens a blank tab as before. On, over a page: Ctrl+T raises the
field over that page and makes no tab; Return opens what was typed in a new
tab beside it, the page staying as it was; Escape, Ctrl+W, a click on the
veil or Ctrl+T again put it away, every tab where it was, and the words come
back with the next Ctrl+T. Over a blank tab it is the ordinary Ctrl+T."""
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b  # noqa: E402
import tabs_kit as k  # noqa: E402

k.world("field-floating-newtab", **{"newtab.floating": False})
k.launch()
t = b.T()


def key(name, *mods, to="page"):
    b.call({"do": "field.key", "key": name, "modifiers": list(mods), "to": to})
    time.sleep(0.35)


def field():
    return b.window()["field"]


def layer():
    return b.window()["overlay"]["kind"]


def ids():
    return [x["id"] for x in k.tabs()]


def front():
    return k.active()


def put(text):
    """Words into the overlay's field as typing puts them there."""
    js = """(() => { const i = document.querySelector('.field input'); if (!i) return false
      i.focus(); i.value = %s; i.setSelectionRange(i.value.length, i.value.length)
      i.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' })); return true })()""" % json.dumps(text)
    b.wait_for(lambda: b.ui(js, root="overlay"), what="the overlay's field")
    b.wait_for(lambda: field()["text"] == text, what=f"typed {text!r}")
    time.sleep(0.2)


def up():
    return field()["open"] and layer() == "field"


def raise_over(tab_id):
    k.cmd("tab.select", id=tab_id)
    time.sleep(0.4)
    key("T", "control")
    b.wait_for(up, what="the floating field")


def away(what):
    b.wait_for(lambda: not field()["open"] and layer() == "none", what=what)


a, bb, c = k.page("alpha"), k.page("bravo"), k.page("charlie")
host = k.BASE.replace("http://", "")
# The blank tab the window opened with, which Ctrl+T would take for its own.
for x in k.tabs():
    if x["empty"]:
        k.cmd("tab.close", id=x["id"])
time.sleep(0.3)

# setting off: Ctrl+T is a new blank tab, as it was
k.cmd("tab.select", id=bb)
time.sleep(0.4)
before = ids()
key("T", "control")
b.wait_for(lambda: len(ids()) == len(before) + 1 and front()["empty"], what="Ctrl+T, off")
t.ok(field()["mode"] == "blank" and layer() == "none", "off: Ctrl+T opens a blank tab with its own field")
key("Escape", to="ui")
b.wait_for(lambda: ids() == before and front()["id"] == bb, what="the unused blank tab gone")
t.ok(True, "off: Escape takes the unused blank tab away again")

# setting on
b.cmd("prefs.set", key="newtab.floating", value=True)
time.sleep(0.2)
before = ids()
raise_over(bb)
f = field()
t.ok(ids() == before and front()["id"] == bb, "on: Ctrl+T makes no tab, the page stays in front")
t.ok(f["mode"] == "newTab" and f["placeholder"] == "New tab: enter a web address" and f["label"] == "Address, new tab",
     f"the field says New tab: {f['placeholder']!r}, {f['label']!r}")
t.ok(f["text"] == "" and not f["suggestions"], "it comes up empty, nothing offered")
views = b.call({"do": "field.views"})
t.ok(views["overlay"]["width"] < views["ui"]["width"] or views["overlay"]["x"] > 0,
     f"over the page beside the column, not the whole window: {views['overlay']}")
look = json.loads(b.ui("""JSON.stringify((() => { const v = document.querySelector('.field-veil').getBoundingClientRect(),
  f = document.querySelector('.field').getBoundingClientRect(); return { vh: v.height, mid: f.y + f.height / 2, w: f.width } })())""", root="overlay"))
t.ok(abs(look["vh"] / 2 - look["mid"] - 30) <= 1.5, f"a little above the middle of the page (30 up): {look}")

# Return: what was typed, in a new tab beside the page, which stays as it was
put(f"{host}/delta")
key("Return", to="overlay")
b.wait_for(lambda: len(ids()) == len(before) + 1, what="the new tab")
b.wait_for(lambda: k.name_of(front()["url"]) == "delta", what="delta in front")
names = k.names()
t.ok(names.index("delta") == names.index("bravo") + 1, f"Return: a new tab right after the page it was raised over: {names}")
t.ok(k.name_of(k.tab(bb)["url"]) == "bravo", "the page under the field stays as it was")
t.ok(not field()["open"] and layer() == "none", "and the field is gone")

# Escape, Ctrl+T again, Ctrl+W, a click on the veil: put away, the words kept
before = ids()
raise_over(bb)
put("half typed")
key("Escape", to="overlay")
away("Escape")
t.ok(ids() == before and front()["id"] == bb, "Escape puts it away, every tab where it was")
key("T", "control")
b.wait_for(up, what="Ctrl+T")
f = field()
t.ok(f["text"] == "half typed" and f["selectFrom"] is None, f"the next Ctrl+T brings back what was typed, selected whole: {f['text']!r}")
sel = b.ui("(() => { const i = document.querySelector('.field input'); return [i.value, i.selectionStart, i.selectionEnd] })()", root="overlay")
t.ok(sel == ["half typed", 0, len("half typed")], f"...selected in the input: {sel}")
key("T", "control", to="overlay")
away("Ctrl+T again")
t.ok(ids() == before and front()["id"] == bb, "Ctrl+T again puts it away, every tab where it was")
key("T", "control")
b.wait_for(up, what="Ctrl+T")
t.ok(field()["text"] == "half typed", "...and the words come back once more")
key("W", "control", to="overlay")
away("Ctrl+W")
t.ok(ids() == before and front()["id"] == bb, "Ctrl+W puts it away and closes nothing")
key("T", "control")
b.wait_for(up, what="Ctrl+T")
ov = b.call({"do": "field.views"})["overlay"]
b.mouse(ov["x"] + 12, ov["y"] + ov["height"] - 12)
away("a click on the veil")
t.ok(ids() == before and front()["id"] == bb, "a click outside the field puts it away")
key("T", "control", "isautorepeat")
t.ok(not field()["open"] and ids() == before, "Ctrl+T held down: its repeat leaves the field down")
key("T", "control")
b.wait_for(up, what="Ctrl+T")
key("T", "control", "isautorepeat", to="overlay")
t.ok(up() and ids() == before, "Ctrl+T held down: its repeat leaves the field up")

# the other keys carry the words: Ctrl+K, Ctrl+L; Ctrl+L's own address never
put("carry")
key("K", "control", to="overlay")
f = field()
t.ok(f["mode"] == "switcher" and f["text"] == "carry", f"Ctrl+T, then Ctrl+K: the words stay, now finding open tabs ({f['mode']})")
key("T", "control", to="overlay")
f = field()
t.ok(f["mode"] == "newTab" and f["text"] == "carry", f"Ctrl+K, then Ctrl+T: New tab again, the words with it ({f['mode']})")
key("L", "control", to="overlay")
f = field()
t.ok(f["open"] and f["mode"] == "thisTab" and f["text"] == "carry", f"then Ctrl+L: still the words, for this page now ({f['mode']})")
key("Escape", to="overlay")
away("Escape")
key("L", "control")
b.wait_for(up, what="Ctrl+L")
key("T", "control", to="overlay")
f = field()
t.ok(f["mode"] == "newTab" and f["text"] == "", f"Ctrl+L, then Ctrl+T: the page's own address isn't carried ({f['text']!r})")
key("Escape", to="overlay")
away("Escape")

# after Return opened something, Ctrl+T starts empty
raise_over(bb)
t.ok(field()["text"] == "", "after Return opened something, Ctrl+T starts empty")

# the arrow keys and Tab walk the list; Escape lets go of the row first; Return takes it
b.call({"do": "field.fake", "places": [{"kind": "history", "title": "walked", "url": k.url("walked")},
                                       {"kind": "history", "title": "walker two", "url": k.url("walker")}]})
put("walk")
b.wait_for(lambda: len(field()["suggestions"]) >= 2, what="the list")
key("Down", to="overlay")
t.ok(field()["selected"] == 0, "Down picks the first row")
key("Tab", to="overlay")
t.ok(field()["selected"] == 1, "Tab walks the list like Down")
key("Tab", "shift", to="overlay")
t.ok(field()["selected"] == 0, "Shift+Tab walks back")
key("Up", to="overlay")
t.ok(field()["selected"] == -1 and up(), "Up off the top lets go of the list, the field stays")
key("Down", to="overlay")
key("Escape", to="overlay")
t.ok(field()["selected"] == -1 and up(), "Escape lets go of the row first, the field stays")
before = ids()
key("Down", to="overlay")
key("Return", to="overlay")
b.wait_for(lambda: len(ids()) == len(before) + 1 and k.name_of(front()["url"]) == "walked", what="the walked row")
t.ok(k.name_of(k.tab(bb)["url"]) == "bravo", "Return on a walked row: that place in a new tab, the page as it was")

# a row clicked: a new tab too
before = ids()
raise_over(bb)
put("walk")
b.wait_for(lambda: len(field()["suggestions"]) >= 2, what="the list")
b.cmd("field.take", index=1)
b.wait_for(lambda: len(ids()) == len(before) + 1 and k.name_of(front()["url"]) == "walker", what="the clicked row")
t.ok(k.name_of(k.tab(bb)["url"]) == "bravo", "a row clicked: a new tab, the page as it was")

# Shift+Return with an engine for it: a new tab too (Browser.submitToShiftEngine)
b.cmd("prefs.set", key="search.shiftCustom", value=k.url("s?q=%s"))
b.cmd("prefs.set", key="search.shift", value="custom")
before = ids()
raise_over(bb)
put("shifted words")
key("Return", "shift", to="overlay")
b.wait_for(lambda: len(ids()) == len(before) + 1, what="Shift+Return's tab")
t.ok("/s?q=shifted" in front()["url"] and k.name_of(k.tab(bb)["url"]) == "bravo",
     f"Shift+Return: searched with its engine in a new tab, the page as it was ({front()['url']})")
b.cmd("prefs.set", key="search.shift", value="")

# Return on nothing opens nothing
before = ids()
raise_over(bb)
refused = field()["refused"]
key("Return", to="overlay")
t.ok(field()["refused"] == refused + 1 and up() and ids() == before, "Return on an empty field opens nothing and says so")
key("Escape", to="overlay")
away("Escape")

# over a blank tab: the ordinary Ctrl+T, the blank tab reused and emptied
# (a blank tab as a double click on the strip makes one: never the floating field)
k.cmd("tab.new")
b.wait_for(lambda: front()["empty"], what="a blank tab")
blank = front()["id"]
b.cmd("field.type", text="draft words")
before = ids()
key("T", "control", to="ui")
time.sleep(0.3)
f = field()
t.ok(ids() == before and front()["id"] == blank and f["mode"] == "blank" and layer() == "none",
     f"over a blank tab: no floating field, the blank tab is the new tab ({f['mode']})")
t.ok(f["text"] == "" and f["shown"] == "", f"...its draft cleared, as Ctrl+T's blank tab always is ({f['text']!r})")
k.cmd("tab.select", id=bb)
time.sleep(0.3)
k.cmd("tab.close", id=blank)
time.sleep(0.3)

# the + button and the column's New tab are Ctrl+T's
before = ids()
k.cmd("tab.select", id=bb)
time.sleep(0.3)
k.cmd("tab.blank")
b.wait_for(up, what="the + button's field")
t.ok(ids() == before and field()["mode"] == "newTab", "the + button raises the same field, no tab made")
k.cmd("tab.blank")
away("the + button again")
t.ok(ids() == before, "...and puts it away again")

# another tab chosen in the column: the field goes, keeping nothing
raise_over(bb)
put("not kept")
k.cmd("tab.select", id=a)
away("another tab")
key("T", "control")
b.wait_for(up, what="Ctrl+T")
t.ok(field()["text"] == "", "another tab chosen puts the field away without keeping the words")
key("Escape", to="overlay")
away("Escape")

# groups: over a grouped tab, Return's tab is in no group; New Tab in Group puts it at the group's end
g1, g2, loose = k.page("g1"), k.page("g2"), k.page("loose")
k.cmd("group.new", ids=[g1, g2])
time.sleep(0.4)
gid = k.tab(g1)["groupID"]
t.ok(gid and k.tab(g2)["groupID"] == gid, "g1 and g2 in one group")
raise_over(g1)
put(f"{host}/fresh")
key("Return", to="overlay")
b.wait_for(lambda: k.by_name("fresh"), what="fresh")
fresh = k.by_name("fresh")
t.ok(not fresh.get("groupID") and front()["id"] == fresh["id"], "over a grouped tab: Return's tab is in no group, in front")
t.ok([n for n in k.names() if (x := k.by_name(n)) and x.get("groupID") == gid] == ["g1", "g2"], "...the group keeps its two tabs")
raise_over(loose)
put(f"{host}/beside")
key("Return", to="overlay")
b.wait_for(lambda: k.by_name("beside"), what="beside")
names = k.names()
t.ok(names.index("beside") == names.index("loose") + 1 and not k.by_name("beside").get("groupID"),
     f"over a tab in no group: right after it ({names})")
before = ids()
k.cmd("tab.select", id=loose)
time.sleep(0.3)
k.cmd("group.newTab", id=gid)
b.wait_for(up, what="New Tab in Group's field")
t.ok(ids() == before and field()["mode"] == "newTab", "New Tab in Group, floating: the field, no tab yet")
put(f"{host}/ingroup")
key("Return", to="overlay")
b.wait_for(lambda: k.by_name("ingroup"), what="ingroup")
names = k.names()
t.ok(k.by_name("ingroup").get("groupID") == gid and names.index("ingroup") == names.index("g2") + 1 and front()["id"] == k.by_name("ingroup")["id"],
     f"...Return's tab goes to the end of that group, in front ({names})")
k.cmd("tab.select", id=loose)
time.sleep(0.3)
k.cmd("group.newTab", id=gid)
b.wait_for(up, what="New Tab in Group's field")
key("Escape", to="overlay")
away("Escape")
raise_over(loose)
put(f"{host}/aftergroup")
key("Return", to="overlay")
b.wait_for(lambda: k.by_name("aftergroup"), what="aftergroup")
t.ok(not k.by_name("aftergroup").get("groupID"), "Escape leaves nothing: the next Ctrl+T is outside groups again")

# a private tab: the field still comes up, and Return's tab is private
k.cmd("tab.newPrivate")
b.wait_for(lambda: front()["empty"] and front().get("shy"), what="a private tab")
b.cmd("field.commit", text=k.url("secret"))
b.wait_for(lambda: k.name_of(front()["url"]) == "secret", what="secret")
shy = front()["id"]
before = ids()
raise_over(shy)
put(f"{host}/secret2")
key("Return", to="overlay")
b.wait_for(lambda: k.by_name("secret2"), what="secret2")
t.ok(k.by_name("secret2").get("shy") and len(ids()) == len(before) + 1, "from a private tab: the field comes up, Return's tab is private")
k.cmd("tab.close", id=k.by_name("secret2")["id"])
k.cmd("tab.close", id=shy)
time.sleep(0.4)

# The field in the middle of the window: the veil over the whole window, the field 24% down
b.cmd("prefs.set", key="field.window", value=True)
raise_over(bb)
v = b.call({"do": "field.views"})
t.ok(v["overlay"] == v["ui"], f"field.window: the veil covers the whole window, the column too ({v['overlay']} vs {v['ui']})")
hi = json.loads(b.ui("""JSON.stringify((() => { const f = document.querySelector('.field').getBoundingClientRect()
  return { top: f.top, cx: f.x + f.width / 2, w: innerWidth, h: innerHeight, width: f.width } })())""", root="overlay"))
t.ok(abs(hi["top"] - hi["h"] * 0.24) <= 1.5 and abs(hi["cx"] - hi["w"] / 2) <= 1.5,
     f"...the field centred on the window, its top 24% down ({hi})")
t.ok(field()["high"], "...said in the field's state")
key("Escape", to="overlay")
away("Escape")
key("L", "control")
b.wait_for(up, what="Ctrl+L")
t.ok(b.call({"do": "field.views"})["overlay"] == v["ui"], "Ctrl+L's field is in the middle of the window too")
key("Escape", to="overlay")
away("Escape")
b.cmd("prefs.set", key="field.window", value=False)

# Recent places in the new tab: the last three places not open, none picked
b.cmd("prefs.set", key="newtab.recent", value=True)
recent = [k.page(n) for n in ("r1", "r2", "r3", "r4")]
for r in recent:
    k.cmd("tab.close", id=r)
time.sleep(0.6)
raise_over(bb)
b.wait_for(lambda: len(field()["suggestions"]) == 3, what="recent places")
f = field()
t.ok([k.name_of(s["url"]) for s in f["suggestions"]] == ["r4", "r3", "r2"] and f["selected"] == -1,
     f"newtab.recent: the three newest places not open, nothing picked ({[k.name_of(s['url']) for s in f['suggestions']]})")
before = ids()
key("Down", to="overlay")
key("Return", to="overlay")
b.wait_for(lambda: len(ids()) == len(before) + 1 and k.name_of(front()["url"]) == "r4", what="r4")
t.ok(k.name_of(k.tab(bb)["url"]) == "bravo", "Down then Return: that place in a new tab")
k.cmd("tab.select", id=a)
time.sleep(0.3)
key("L", "control")
b.wait_for(up, what="Ctrl+L")
b.cmd("field.type", text="")
time.sleep(0.3)
t.ok(not field()["suggestions"], "only Ctrl+T's field lists them, not Ctrl+L's")
key("Escape", to="overlay")
away("Escape")
b.cmd("prefs.set", key="newtab.recent", value=False)

# Ctrl+T finds your open tabs: the open tab picked as you type, Return goes there
b.cmd("prefs.set", key="newtab.arc", value=True)
zebra = k.page("zebra")
before = ids()
raise_over(bb)
put("zeb")
b.wait_for(lambda: field()["suggestions"] and field()["suggestions"][0].get("tabID") == zebra, what="the open tab offered")
f = field()
t.ok(f["selected"] == 0 and f["text"] == "zeb" and f["shown"] == "zeb", f"newtab.arc: the open tab is picked as you type, the words stay ({f['shown']!r})")
key("Return", to="overlay")
b.wait_for(lambda: front()["id"] == zebra, what="zebra in front")
t.ok(ids() == before and not field()["open"], "Return goes to the open tab instead of opening it again")
raise_over(bb)
put(f"{host}/zeb")
b.wait_for(lambda: field()["suggestions"] and field()["suggestions"][0].get("tabID") == zebra, what="the open tab offered")
f = field()
t.ok(f["selected"] == 0 and f["ending"] == "ra", f"...the rest of its address in grey when the words start it ({f['ending']!r})")
key("Up", to="overlay")
f = field()
t.ok(f["selected"] == -1 and not f["ending"], "Up lets go of the tab and of its grey ending")
key("Return", to="overlay")
b.wait_for(lambda: len(ids()) == len(before) + 1 and k.name_of(front()["url"]) == "zeb", what="zeb")
t.ok(True, "...and Return opens what was typed, in a new tab")
b.cmd("prefs.set", key="newtab.arc", value=False)

# off again: Ctrl+T over a page is a blank tab again
b.cmd("prefs.set", key="newtab.floating", value=False)
k.cmd("tab.select", id=bb)
time.sleep(0.4)
before = ids()
key("T", "control")
b.wait_for(lambda: len(ids()) == len(before) + 1 and front()["empty"], what="Ctrl+T, off")
t.ok(field()["mode"] == "blank" and layer() == "none", "off again: Ctrl+T opens a blank tab as before")

t.done()

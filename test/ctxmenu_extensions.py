#!/usr/bin/env python3
"""Extensions' items in the page menu (studio/04 §5, chrome.contextMenus;
electron-chrome-extensions' getContextMenuItems): at the end, apart from
Oriel's rows; one item alone as it is, several under the extension's name;
%s is the words selected; picking one tells the extension (onClicked)."""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b  # noqa: E402
import ctxmenu_kit as k  # noqa: E402

FIXTURE = Path(__file__).resolve().parent / "fixtures" / "ctxmenu-ext"
k.world("ctxmenu-extensions")
t = b.T()

ext = b.call({"do": "extensions.loadUnpacked", "path": str(FIXTURE), "copy": True})["id"]
b.cmd("tab.new", url=f"chrome-extension://{ext}/test.html")
b.wait_for(lambda: b.active()["title"] == "Menu test page", what="the extension's page")
probe = b.active()["id"]
said = lambda: b.ev(probe, "new Promise(r => chrome.runtime.sendMessage({ ask: 'last' }, r))")

page = k.page("/ctx")


def menu_with_item():
    for _ in range(10):
        k.right_click(page, "#empty")
        if "Menu test item" in k.labels():
            return True
        k.key("Escape")
        time.sleep(0.5)
    return False


t.ok(menu_with_item(), "the extension's item is in the page's menu")
labs = k.labels()
t.ok(labs[-3:] == ["Inspect", "—", "Menu test item"], f"…at the end, apart from Oriel's rows ({labs[-4:]})")
k.pick("Menu test item")
b.wait_for(lambda: said() == "menu-page|" + k.url("/ctx"), within=5, what="onClicked")
t.ok(True, "picking it tells the extension, with the page's address (onClicked)")

# words selected: both items match, grouped under the extension's name
k.select(page, "#text")
k.right_click(page, "#text", dx=40)
group = k.entry("Menu test")
t.ok(group and [e["label"] for e in group["submenu"]] == ["Menu test item", "Say “Gentle words to pick from this page”"],
     f"two items: under the extension's name, %s being the words ({group})")
t.ok(k.labels()[-2:] == ["—", "Menu test ▸"], "…still last, apart")
k.pick("Menu test")
b.wait_for(lambda: k.dom_items(1), within=3, what="the extension's items")
k.pick("Say “Gentle words to pick from this page”", menu=1)
b.wait_for(lambda: said() == "menu-say|Gentle words to pick from this page", within=5, what="onClicked with the words")
t.ok(True, "…and the one picked gets the words selected")

k.done(t)

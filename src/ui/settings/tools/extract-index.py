#!/usr/bin/env python3
"""Reads SettingsIndex.swift (Search 1.0.19) and writes index.json: every
group and row of Settings, texts exactly as the Mac has them (studio/06 §0,
"consiglio di metodo"). Windows adaptations are applied later, in
catalog.ts, so this file stays a faithful copy.

    python3 src/ui/settings/tools/extract-index.py [path/to/SettingsIndex.swift]
"""
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
DEFAULT = Path(__file__).resolve().parents[4] / "ref/search-mac/Sources/Search/SettingsIndex.swift"
SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT
text = SRC.read_text()

CONSTANTS = {
    "Motion.slidesKey": "sidebar.slides", "Motion.lightKey": "motion.light", "Motion.instantKey": "motion.instant",
    "SleepPace.key": "tabs.sleep.pace", "Preferences.waitsKey": "media.click",
    "Preferences.spacesOnCommandKey": "spaces.commandNumbers", "Preferences.spaceButtonsKey": "spaces.buttons",
    "Updater.installKey": "update.install", "OptIn.joinedKey": "optin.joined", "OptIn.betaKey": "optin.iphoneBeta",
    "SafariApps.key": "extensions.safariApps", "Preferences.freshKey": "start.fresh", "Preferences.confirmQuitKey": "quit.confirm",
    "SpaceRoutes.key": "spaces.links", "SpaceRoutes.rulesKey": "spaces.links.rules",
}

STRING = r'"((?:[^"\\]|\\.)*)"'


def unescape(s):
    return s.replace('\\"', '"').replace("\\\\", "\\")


def blocks(body):
    """Each .init( ... ) of an array literal, strings respected."""
    out, i = [], 0
    while True:
        i = body.find(".init(", i)
        if i < 0:
            return out
        depth, j, in_str = 0, i + 5, False
        while j < len(body):
            c = body[j]
            if in_str:
                if c == "\\":
                    j += 2
                    continue
                if c == '"':
                    in_str = False
            elif c == '"':
                in_str = True
            elif c == "(":
                depth += 1
            elif c == ")":
                depth -= 1
                if depth == 0:
                    break
            j += 1
        out.append(body[i + 6: j])
        i = j


def field(b, name):
    m = re.search(r"\b" + name + r":\s*" + STRING, b)
    return unescape(m.group(1)) if m else None


def array(b, name):
    m = re.search(r"\b" + name + r":\s*\[((?:[^\]\"]|" + STRING + r")*)\]", b, re.S)
    if not m:
        return []
    out = []
    for lit, const in re.findall(STRING + r"|([A-Z][A-Za-z_]*\.[A-Za-z_]+)", m.group(1)):
        out.append(CONSTANTS[const] if const else unescape(lit))
    return out


groups_src = text[text.index("static let groups"): text.index("static func group(")]
items_src = text[text.index("static let items"): text.index("] as [SettingsItem]).filter(offered)")]

groups = []
for b in blocks(groups_src):
    groups.append({"id": field(b, "id"), "page": re.search(r"page:\s*\.(\w+)", b).group(1),
                   "title": field(b, "title"), "icon": field(b, "icon")})

items = []
for b in blocks(items_src):
    kind = re.search(r"kind:\s*\.(\w+)", b)
    item = {"id": field(b, "id"), "group": field(b, "group"), "icon": field(b, "icon"),
            "title": field(b, "title"), "detail": field(b, "detail") or ""}
    more = field(b, "more")
    if more:
        item["more"] = more
    keys = array(b, "keys")
    if keys:
        item["keys"] = keys
    words = array(b, "words")
    if words:
        item["words"] = words
    if kind:
        item["kind"] = kind.group(1)
    parent = field(b, "parent")
    if parent:
        item["parent"] = parent
    if re.search(r"findOnly:\s*true", b):
        item["findOnly"] = True
    items.append(item)

out = HERE.parent / "index.json"
out.write_text(json.dumps({"source": "Search 1.0.19 SettingsIndex.swift", "groups": groups, "items": items},
                          ensure_ascii=False, indent=1) + "\n")
print(f"{len(groups)} groups, {len(items)} rows -> {out}")

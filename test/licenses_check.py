#!/usr/bin/env python3
"""Licenses (studio/09 §6): every package in THIRD_PARTY_LICENSES.md has its
text or, when it carries none (bergamot, MPL-2.0; koffi's binaries), the
license's name and a link to the official text; koffi's binaries that are
installed are listed; LICENSE keeps Search's notice word for word, then
Oriel's. Needs no app: it runs scripts/licenses.mjs into a scratch file."""
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
passed = failed = 0


def ok(cond, what):
    global passed, failed
    if cond:
        passed += 1
        print(f"  ok   {what}")
    else:
        failed += 1
        print(f"  FAIL {what}")


out = Path(tempfile.mkdtemp()) / "licenses.md"
koffi = sorted(f"@koromix/{d}" for d in os.listdir(ROOT / "node_modules" / "@koromix") if d.startswith("koffi-")) if (ROOT / "node_modules" / "@koromix").exists() else []
r = subprocess.run(["node", "scripts/licenses.mjs", "--out", str(out), "--expect", ",".join(koffi)], cwd=ROOT, capture_output=True, text=True)
ok(r.returncode == 0, f"the list is made, with every koffi binary installed here ({r.stdout.strip()} {r.stderr.strip()})")
text = out.read_text(encoding="utf-8") if out.exists() else ""
# Sections are the "## " lines outside the license texts' fences.
sections, fenced = [], False
for line in text.splitlines():
    if line.startswith("```"):
        fenced = not fenced
    if line.startswith("## ") and not fenced:
        sections.append(line[3:] + "\n")
    elif sections:
        sections[-1] += line + "\n"
bare = [s.splitlines()[0] for s in sections if "```" not in s and not re.search(r"https?://", s)]
ok(sections and not bare, f"every package has its text or a link to it ({bare[:5]})")
berg = next((s for s in sections if s.startswith("@browsermt/bergamot-translator")), "")
ok("MPL-2.0: https://www.mozilla.org/en-US/MPL/2.0/" in berg and "Source: https://github.com/browsermt/bergamot-translator" in berg,
   "bergamot: MPL-2.0, its official text and where its source is")
listed = {s.split()[0] for s in sections}
ok(all(k in listed for k in koffi) and koffi, f"koffi's binaries installed here are listed ({koffi})")
r = subprocess.run(["node", "scripts/licenses.mjs", "--out", str(out), "--expect", "@koromix/koffi-nowhere"], cwd=ROOT, capture_output=True, text=True)
ok(r.returncode != 0 and "koffi-nowhere" in r.stderr, "a package the release expects and that isn't there stops it")

lines = [l for l in (ROOT / "LICENSE").read_text(encoding="utf-8").splitlines() if l.startswith("Copyright")]
ok(lines[:2] == ["Copyright (c) 2026 Office Commun", "Copyright (c) 2026 Oriel contributors"], f"LICENSE: Search's notice as it is, then Oriel's ({lines})")
original = ROOT.parent.parent.parent / "ref" / "search-mac" / "LICENSE"
for candidate in [ROOT / "ref" / "search-mac" / "LICENSE", original]:
    if candidate.exists():
        theirs = [l for l in candidate.read_text(encoding="utf-8").splitlines() if l.startswith("Copyright")]
        ok(theirs and lines[0] == theirs[0], f"word for word as in {candidate.relative_to(candidate.parents[2])}")
        break

print(f"{passed} passed, {failed} failed")
sys.exit(1 if failed else 0)

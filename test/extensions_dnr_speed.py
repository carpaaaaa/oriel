#!/usr/bin/env python3
"""How fast declarativeNetRequest matches (studio/04 §8.4: hundreds of
thousands of rules without slowing navigation). Uses uBlock Origin Lite's
real rule files from the Web Store, alone and topped up to 300 000 rules,
then real pages with every uBOL ruleset turned on."""
import glob
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b

UBOL = "ddkjiahejlhfcafbddmgiahcphecmpfh"
b.use("extensions-dnr-speed")
b.launch()
t = b.T()
r = b.call({"do": "extensions.install", "id": UBOL}, timeout=120)
path = next(e["path"] for e in b.call({"do": "extensions.list"})["extensions"] if e["id"] == UBOL)
files = sorted(glob.glob(f"{path}/rulesets/main/*.json"))
regex = sorted(glob.glob(f"{path}/rulesets/regex/*.json"))
print(f"uBOL {r['version']}: {len(files)} rule files")


def show(name, x):
    print(f"  {name}: {x['rules']} rules ({x['realRules']} real), compile {x['compileMs']} ms, index {x['indexMs']} ms, ~{x['heapMB']} MB;"
          f" {x['requests']} requests: mean {x['meanUs']} µs (cpu {x['cpuUs']} µs), p50 {x['p50Us']} µs, p99 {x['p99Us']} µs, max {x['maxUs']} µs ({x['hits']} matched)")
    print(f"    index: {x['index']}")


x = b.call({"do": "extensions.dnrBench", "files": files + regex, "total": 0, "requests": 50000}, timeout=300)
show("all uBOL lists", x)
t.ok(x["cpuUs"] < 60, f"all of uBOL's lists: under 60 µs of CPU per request ({x['cpuUs']} µs)")
y = b.call({"do": "extensions.dnrBench", "files": files + regex, "total": 300000, "requests": 50000}, timeout=300)
show("300 000 rules", y)
t.ok(y["cpuUs"] < 60, f"300 000 rules: under 60 µs of CPU per request ({y['cpuUs']} µs)")
t.ok(y["p50Us"] < 60, f"300 000 rules: median under 60 µs ({y['p50Us']} µs)")

# Every uBOL ruleset on, then real pages.
on = b.call({"do": "extensions.dnrState", "id": UBOL})["enabled"]
more = [Path(f).stem for f in files if Path(f).stem not in on][:50 - len(on)]  # Chrome allows 50
b.call({"do": "extensions.dnr", "id": UBOL, "method": "updateEnabledRulesets", "args": [{"enableRulesetIds": more}]})
st = b.call({"do": "extensions.dnrState", "id": UBOL})
print(f"  enabled {len(st['enabled'])} rulesets, {st['staticRules']} static rules")
for url in ("https://www.repubblica.it", "https://www.corriere.it", "https://edition.cnn.com"):
    try:
        b.cmd("tab.new", url=url)
        b.wait_for(lambda: not b.active()["loading"], within=40, what=url)
    except Exception as e:
        print("  ", url, e)
    time.sleep(3)
tm = b.call({"do": "extensions.dnrTiming"})
print(f"  real pages: {tm['requests']} requests, mean {tm['meanUs']} µs, max {tm['maxUs']} µs")
t.ok(tm["requests"] > 50 and tm["meanUs"] < 100, f"real pages: mean per request under 100 µs ({tm['meanUs']} µs over {tm['requests']})")
t.done()

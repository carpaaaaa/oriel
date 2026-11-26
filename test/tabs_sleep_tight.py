#!/usr/bin/env python3
"""Memory tight (tabs/sleep.ts memoryTight): with Windows short of memory, a
tab left alone sleeps after 2 minutes whatever the pace says; with memory to
spare the pace is as chosen (Normal, 30 minutes). ORIEL_MEMORY_TIGHT=1 plays
Windows short of memory."""
import sys
import time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b

t = b.T()

b.use("tabs-sleep-tight")
b.launch()
s = b.call({"do": "tabs.sleepAfter"})
t.ok(s["after"] == 1800, f"memory to spare: Normal, 30 minutes ({s})")
b.quit()

b.use("tabs-sleep-tight-low")
b.launch(env={"ORIEL_MEMORY_TIGHT": "1"})
s = b.call({"do": "tabs.sleepAfter"})
t.ok(s["tight"] and s["after"] == 120, f"short of memory: 2 minutes ({s})")
b.cmd("settings.set", id="tabs.sleep.pace", value="sooner")
time.sleep(0.3)
t.ok(b.call({"do": "tabs.sleepAfter"})["after"] == 120, "Sooner too: 2 minutes")
b.cmd("tab.new", url="data:text/html,<title>left</title>left")
time.sleep(1)
left = next(x["id"] for x in b.window()["tabs"] if x.get("title") == "left")
b.cmd("tab.new", url="data:text/html,<title>front</title>front")
time.sleep(1)
slept = b.call({"do": "tabs.tidy", "within": 0})["slept"]
t.ok(left in slept, "a tab left alone sleeps")
t.ok(not b.state().get("errors"), "no error in the main process")
b.quit()
t.done()

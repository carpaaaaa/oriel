#!/usr/bin/env python3
"""Pictures of the main states, light and dark, for looking at by eye and for
comparing with Search on the Mac. SHOTS_DIR=<folder>."""
import os, sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b

out = Path(os.environ.get("SHOTS_DIR", "shots"))
out.mkdir(parents=True, exist_ok=True)

for look in ("light", "dark"):
    b.use(f"tour-{look}")
    b.launch(env={"SEARCH_LOOK": look})
    time.sleep(1.5)
    b.shot(out / f"{look}-1-empty.png")
    b.cmd("field.input", text="wiki")
    time.sleep(1.5)
    b.shot(out / f"{look}-2-typing.png")
    b.cmd("field.commit", text="https://en.wikipedia.org/wiki/Web_browser")
    b.wait_for(lambda: not b.active()["loading"] and b.active()["title"], within=90, what="page")  # over the network, on slow runners too
    for url in ("https://example.com", "https://www.iana.org/help/example-domains"):
        b.cmd("tab.new", url=url, background=True)
    time.sleep(3)
    b.shot(out / f"{look}-3-pages.png")
    b.cmd("field.open", target="here")
    time.sleep(0.8)
    b.shot(out / f"{look}-4-field-over-page.png")
    b.cmd("field.close")
    b.quit()
print("pictures in", out)

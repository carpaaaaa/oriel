import sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b
b.use("extensions-dnr-speed", wipe=False)
b.launch(env={"ORIEL_DNR_SLOW": "1"})
try:
    time.sleep(4)
    for url in ("https://www.repubblica.it", "https://www.corriere.it"):
        b.cmd("tab.new", url=url)
        try:
            b.wait_for(lambda: not b.active()["loading"], within=40, what=url)
        except Exception as e:
            print(e)
        time.sleep(3)
    print(b.call({"do": "extensions.dnrTiming"}))
finally:
    b.quit()

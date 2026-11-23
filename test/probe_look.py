import sys, time, json
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b
SHOTS = Path("/private/tmp/claude-501/-Users-carpa--claude-spares-spare-Dr7gTw/bfb01a30-6252-45bb-8d2d-4449016908b6/scratchpad")
FIXTURE = Path(__file__).resolve().parent / "fixtures" / "dnr-test"
b.use("extensions-look")
b.launch()
try:
    ext = b.call({"do": "extensions.loadUnpacked", "path": str(FIXTURE), "copy": True})
    b.cmd("ext.pin", id=ext["id"], pinned=True)
    b.cmd("tab.new", url="https://example.com")
    time.sleep(2)
    p = json.loads(b.ui("JSON.stringify(document.querySelector('.ext-puzzle').getBoundingClientRect())"))
    b.mouse(p["x"] + 13, p["y"] + 13)
    time.sleep(1)
    b.shot(SHOTS / "ext-list.png")
    b.cmd("ext.menuClose")
    btn = json.loads(b.ui(f"JSON.stringify(document.querySelector(\".ext-button[data-ext='{ext['id']}']\").getBoundingClientRect())"))
    b.mouse(btn["x"] + 13, btn["y"] + 13)
    time.sleep(1.5)
    b.shot(SHOTS / "ext-popup.png")
    b.cmd("ext.popupClose")
    b.cmd("ext.manage", open=True)
    time.sleep(1)
    b.shot(SHOTS / "ext-manage.png")
finally:
    b.quit()

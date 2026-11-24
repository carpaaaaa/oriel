#!/usr/bin/env python3
"""Automatic updates for real, on real Windows (studio/06 §4; the popup asked
for on 24 Nov 2026): an Oriel installed from a published release finds the
newest published release on GitHub, downloads it, shows its popup, and is
that version afterwards.

    python test/update_real.py <installed version> <newest version>

1. As a person has it (no test world, no feed of ours, GitHub's own): the
   older Oriel installed with its installer, opened; the newer installer is
   downloaded on its own; the popup is on the screen (a picture); closing
   Oriel installs it; the next launch is the newer version and opens.
2. The popup's Update and Restart (a test world, so the bench can see the
   popup; the feed is GitHub's latest release): the plate with the newer
   version, a real click on Update and Restart, Oriel closes, installs and
   opens again as the newer version.

Windows only. SHOTS_DIR=<folder> for the pictures."""
import ctypes, os, platform, shutil, struct, subprocess, sys, time, urllib.request, zlib
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b

if sys.platform != "win32":
    print("update_real.py runs on Windows only")
    sys.exit(0)

from ctypes import wintypes as wt

FROM, TO = sys.argv[1], sys.argv[2]
REPO = "carpaaaaa/oriel"
ARCH = "arm64" if platform.machine().lower() in ("arm64", "aarch64") else "x64"
LOCAL = Path(os.environ["LOCALAPPDATA"])
INSTALL = LOCAL / "Programs" / "Oriel"
EXE = INSTALL / "Oriel.exe"
CACHE = LOCAL / "oriel-updater"
OUT = Path(os.environ.get("SHOTS_DIR", "shots")) / "update"
OUT.mkdir(parents=True, exist_ok=True)
t = b.T()

user32 = ctypes.WinDLL("user32", use_last_error=True)
gdi32 = ctypes.WinDLL("gdi32")
try:
    user32.SetProcessDpiAwarenessContext(ctypes.c_void_p(-4))
except Exception:
    pass
user32.GetDC.restype = ctypes.c_void_p
user32.GetDC.argtypes = [ctypes.c_void_p]
user32.ReleaseDC.argtypes = [ctypes.c_void_p, ctypes.c_void_p]
gdi32.CreateCompatibleDC.restype = ctypes.c_void_p
gdi32.CreateCompatibleDC.argtypes = [ctypes.c_void_p]
gdi32.CreateCompatibleBitmap.restype = ctypes.c_void_p
gdi32.CreateCompatibleBitmap.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_int]
gdi32.SelectObject.restype = ctypes.c_void_p
gdi32.SelectObject.argtypes = [ctypes.c_void_p, ctypes.c_void_p]
gdi32.BitBlt.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_void_p, ctypes.c_int, ctypes.c_int, ctypes.c_uint]
gdi32.GetDIBits.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_uint, ctypes.c_uint, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_uint]
gdi32.DeleteObject.argtypes = [ctypes.c_void_p]
gdi32.DeleteDC.argtypes = [ctypes.c_void_p]
EnumWindowsProc = ctypes.WINFUNCTYPE(wt.BOOL, wt.HWND, wt.LPARAM)
user32.PostMessageW.argtypes = [wt.HWND, ctypes.c_uint, wt.WPARAM, wt.LPARAM]


class BITMAPINFOHEADER(ctypes.Structure):
    _fields_ = [("biSize", wt.DWORD), ("biWidth", wt.LONG), ("biHeight", wt.LONG), ("biPlanes", wt.WORD), ("biBitCount", wt.WORD),
                ("biCompression", wt.DWORD), ("biSizeImage", wt.DWORD), ("biXPelsPerMeter", wt.LONG), ("biYPelsPerMeter", wt.LONG),
                ("biClrUsed", wt.DWORD), ("biClrImportant", wt.DWORD)]


def grab(name):
    """A picture of the whole screen."""
    x, y = user32.GetSystemMetrics(76), user32.GetSystemMetrics(77)
    w, h = user32.GetSystemMetrics(78), user32.GetSystemMetrics(79)
    screen = user32.GetDC(None)
    mem = gdi32.CreateCompatibleDC(screen)
    bmp = gdi32.CreateCompatibleBitmap(screen, w, h)
    gdi32.SelectObject(mem, bmp)
    gdi32.BitBlt(mem, 0, 0, w, h, screen, x, y, 0x00CC0020 | 0x40000000)
    bi = BITMAPINFOHEADER(40, w, -h, 1, 32, 0, 0, 0, 0, 0, 0)
    buf = ctypes.create_string_buffer(w * h * 4)
    gdi32.GetDIBits(mem, bmp, 0, h, buf, ctypes.byref(bi), 0)
    gdi32.DeleteObject(bmp)
    gdi32.DeleteDC(mem)
    user32.ReleaseDC(None, screen)
    data = buf.raw
    raw = bytearray()
    for row in range(h):
        line = data[row * w * 4:(row + 1) * w * 4]
        rgb = bytearray(w * 3)
        rgb[0::3], rgb[1::3], rgb[2::3] = line[2::4], line[1::4], line[0::4]
        raw += b"\0" + rgb

    def chunk(kind, body):
        return struct.pack(">I", len(body)) + kind + body + struct.pack(">I", zlib.crc32(kind + body) & 0xffffffff)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(bytes(raw), 6)) + chunk(b"IEND", b"")
    (OUT / f"{name}.png").write_bytes(png)


def click(x, y):
    vx, vy = user32.GetSystemMetrics(76), user32.GetSystemMetrics(77)
    vw, vh = user32.GetSystemMetrics(78), user32.GetSystemMetrics(79)
    user32.mouse_event(0x1 | 0x8000 | 0x4000, int((x - vx) * 65535 / max(1, vw - 1)), int((y - vy) * 65535 / max(1, vh - 1)), 0, 0)
    user32.SetCursorPos(int(x), int(y))
    time.sleep(0.15)
    user32.mouse_event(0x2, 0, 0, 0, 0)
    time.sleep(0.05)
    user32.mouse_event(0x4, 0, 0, 0, 0)


def wait(pred, within, every=1.0):
    end = time.time() + within
    last = None
    while time.time() < end:
        try:
            last = pred()
        except Exception:
            last = None
        if last:
            return last
        time.sleep(every)
    return last


def version_of(exe):
    if not exe.exists():
        return None
    r = subprocess.run(["powershell", "-NoProfile", "-Command", f"(Get-Item '{exe}').VersionInfo.ProductVersion"], capture_output=True, text=True)
    v = r.stdout.strip()
    # Windows says 0.1.2.0 for 0.1.2.
    return ".".join(v.split(".")[:3]) if v else None


def oriels():
    """Oriel processes running from where it's installed."""
    r = subprocess.run(["powershell", "-NoProfile", "-Command",
                        f"Get-Process Oriel -ErrorAction SilentlyContinue | Where-Object {{ $_.Path -like '{INSTALL}*' }} | Select-Object -ExpandProperty Id"],
                       capture_output=True, text=True)
    return [int(x) for x in r.stdout.split() if x.strip().isdigit()]


def close_oriel():
    """As the window's X does: WM_CLOSE to each of its windows; the last closed quits."""
    pids = set(oriels())
    def each(hwnd, _):
        pid = wt.DWORD()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
        if pid.value in pids and user32.IsWindowVisible(hwnd):
            user32.PostMessageW(hwnd, 0x0010, 0, 0)
        return True
    user32.EnumWindows(EnumWindowsProc(each), 0)


def kill_oriel():
    subprocess.run(["powershell", "-NoProfile", "-Command", "Get-Process Oriel -ErrorAction SilentlyContinue | Stop-Process -Force"], capture_output=True)
    time.sleep(2)


def install(version):
    kill_oriel()
    uninstaller = INSTALL / "Uninstall Oriel.exe"
    if uninstaller.exists():
        subprocess.run([str(uninstaller), "/S"], check=False)
        wait(lambda: not EXE.exists(), 60)
        time.sleep(3)
    shutil.rmtree(CACHE, ignore_errors=True)
    setup = Path(os.environ.get("RUNNER_TEMP", os.environ["TEMP"])) / f"Oriel-Setup-{version}-{ARCH}.exe"
    url = f"https://github.com/{REPO}/releases/download/v{version}/Oriel-Setup-{version}-{ARCH}.exe"
    print(f"  installing {url}")
    urllib.request.urlretrieve(url, setup)
    subprocess.run([str(setup), "/S"], check=True)
    wait(lambda: version_of(EXE) == version, 120)
    got = version_of(EXE)
    t.ok(got == version, f"Oriel {version} installed with its installer ({got} at {EXE})")
    return got == version


def pending():
    """What the updater fetched, waiting for Oriel to quit."""
    folder = CACHE / "pending"
    return sorted(p.name for p in folder.iterdir()) if folder.exists() else []


def clean_env():
    return {k: v for k, v in os.environ.items() if not (k.startswith("SEARCH_") or k.startswith("ORIEL_"))}


# A fresh Windows image can show its first-run privacy screen over everything.
subprocess.run(["powershell", "-NoProfile", "-Command", "Get-Process WWAHost, CloudExperienceHostBroker, UserOOBEBroker -ErrorAction SilentlyContinue | Stop-Process -Force"], capture_output=True)
print(f"Oriel {FROM} installed, {TO} published ({ARCH})")
t.ok(FROM != TO, f"a newer version is out ({FROM} → {TO})")

# 1. As a person has it.
try:
    if install(FROM):
        # Real user data: what an earlier run left is wiped (a fresh install).
        shutil.rmtree(Path(os.environ["APPDATA"]) / "Oriel", ignore_errors=True)
        subprocess.Popen([str(EXE)], env=clean_env(), cwd=str(INSTALL))
        t.ok(wait(lambda: oriels(), 30), f"Oriel {FROM} opens")
        got = wait(lambda: (lambda p: p if any(TO in n for n in p) and "update-info.json" in p else None)(pending()), 300, 2)
        print(f"  the updater's folder: {pending()}")
        t.ok(got, f"Oriel {FROM} found {TO} on GitHub and downloaded it on its own")
        time.sleep(6)
        grab(f"1-popup-{FROM}-to-{TO}")
        t.ok(oriels(), "still open with the update ready (picture: 1-popup)")
        close_oriel()
        quit_ok = wait(lambda: not oriels(), 60)
        t.ok(quit_ok, "the window's X closes Oriel")
        now = wait(lambda: version_of(EXE) == TO and not oriels() and version_of(EXE), 240, 3)
        t.ok(now == TO, f"closing it installed {TO} (Oriel.exe says {version_of(EXE)})")
        subprocess.Popen([str(EXE)], env=clean_env(), cwd=str(INSTALL))
        t.ok(wait(lambda: oriels(), 30), f"Oriel {TO} opens after the update")
        time.sleep(12)
        grab(f"2-after-update-{TO}")
        t.ok(oriels(), f"Oriel {TO} still running (picture: 2-after-update, What's New in a tab)")
        kill_oriel()
except Exception:
    import traceback
    traceback.print_exc()
    t.ok(False, "part 1 went through to the end")
    kill_oriel()

# 2. The popup's Update and Restart, seen through the bench.
try:
    if install(FROM):
        b.use("update-real")
        env = dict(clean_env(), SEARCH_PROBE=b.WORLD, ORIEL_UPDATE_FEED=f"https://github.com/{REPO}/releases/latest/download")
        subprocess.Popen([str(EXE)], env=env, cwd=str(INSTALL))
        t.ok(wait(lambda: b.state().get("windows"), 40), f"Oriel {FROM} opens (a test world)")
        up = lambda: b.call({"do": "settings.updater"})
        ready = wait(lambda: (lambda u: u if u.get("popup") and u["popup"].get("ready") else None)(up()), 300, 2)
        t.ok(ready and ready["popup"]["version"] == TO, f"the popup offers {TO}, downloaded and ready ({(ready or {}).get('popup')})")
        plate = b.ui("(() => { const e = document.querySelector('.up-plate'); const g = document.querySelector('.up-go'); return e && g && { title: e.querySelector('.up-title').textContent, go: g.textContent.trim(), disabled: g.disabled, r: g.getBoundingClientRect().toJSON() } })()", root="overlay")
        t.ok(plate and TO in plate["title"] and plate["go"] == "Update and Restart" and not plate["disabled"], f"the plate over the window: {plate and plate['title']!r}, {plate and plate['go']!r}")
        grab(f"3-popup-bench-{TO}")
        if plate:
            wid = b.call({"do": "tabs.state"})["windows"][0]["id"]
            f = b.call({"do": "window.frame", "window": wid})["frame"]
            s = f["scale"]
            reg = b.call({"do": "window.edges", "window": wid})["region"]
            x = (f["bounds"]["x"] + reg["x"] + plate["r"]["x"] + plate["r"]["width"] / 2) * s
            y = (f["bounds"]["y"] + reg["y"] + plate["r"]["y"] + plate["r"]["height"] / 2) * s
            subprocess.run(["powershell", "-NoProfile", "-Command", "Get-Process WWAHost, CloudExperienceHostBroker, UserOOBEBroker -ErrorAction SilentlyContinue | Stop-Process -Force"], capture_output=True)
            time.sleep(1)
            click(x, y)
            gone = wait(lambda: not oriels(), 60)
            t.ok(gone, "Update and Restart: Oriel closes")
            now = wait(lambda: version_of(EXE) == TO and version_of(EXE), 240, 3)
            t.ok(now == TO, f"…installs {TO} (Oriel.exe says {version_of(EXE)})")
            back = wait(lambda: oriels(), 90, 2)
            t.ok(back, f"…and opens again as {TO}")
            time.sleep(8)
            grab(f"4-restarted-{TO}")
        kill_oriel()
except Exception:
    import traceback
    traceback.print_exc()
    t.ok(False, "part 2 went through to the end")
    kill_oriel()

print(f"{t.passed} passed, {t.failed} failed")
sys.exit(1 if t.failed else 0)

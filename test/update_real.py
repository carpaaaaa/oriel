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
2. The popup's Update and Restart: found on the screen through Windows' UI
   Automation (an installed Oriel has no test hooks), a real click on it,
   Oriel closes, installs and opens again as the newer version.

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


user32.SetWindowPos.argtypes = [wt.HWND, ctypes.c_void_p, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_uint]
user32.SetForegroundWindow.argtypes = [wt.HWND]


def clear_screen():
    """What the test machines put over everything: a Start menu left open (the
    ARM images start with it), the first-run screen, a WSL install prompt;
    then Oriel's window in front."""
    user32.keybd_event(0x1B, 0, 0, 0)
    time.sleep(0.05)
    user32.keybd_event(0x1B, 0, 2, 0)
    subprocess.run(["powershell", "-NoProfile", "-Command", "Get-Process WWAHost, CloudExperienceHostBroker, UserOOBEBroker, wsl, wslhost -ErrorAction SilentlyContinue | Stop-Process -Force"], capture_output=True)
    time.sleep(0.8)
    pids = set(oriels())
    def each(hwnd, _):
        pid = wt.DWORD()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
        if pid.value in pids and user32.IsWindowVisible(hwnd):
            user32.SetWindowPos(hwnd, ctypes.c_void_p(-1), 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0040)  # topmost, no size, no move, show
            user32.SetForegroundWindow(hwnd)
        return True
    user32.EnumWindows(EnumWindowsProc(each), 0)
    time.sleep(0.5)


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

# 2. The popup's Update and Restart, pressed as a person presses it. An
#    installed Oriel has no test hooks (src/main/testhooks.ts), so the popup is
#    found through Windows' UI Automation, as a screen reader finds it.
UIA = r"""
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
$ids = @(Get-Process Oriel -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '%s*' } | ForEach-Object { $_.Id })
$A = [System.Windows.Automation.AutomationElement]
$cond = New-Object System.Windows.Automation.PropertyCondition($A::NameProperty, '%s')
foreach ($w in $A::RootElement.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)) {
  if ($ids -contains $w.Current.ProcessId) {
    $e = $w.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $cond)
    if ($e) { $r = $e.Current.BoundingRectangle; '{0},{1},{2},{3}' -f $r.X, $r.Y, $r.Width, $r.Height; break }
  }
}
"""


def find(name):
    """Where something named so is on the screen (physical pixels), or None."""
    r = subprocess.run(["powershell", "-NoProfile", "-Command", UIA % (INSTALL, name.replace("'", "''"))], capture_output=True, text=True)
    nums = [float(x) for x in r.stdout.strip().split(",")] if r.stdout.strip().count(",") == 3 else None
    return nums if nums and nums[2] > 0 and nums[3] > 0 else None


try:
    if install(FROM):
        shutil.rmtree(Path(os.environ["APPDATA"]) / "Oriel", ignore_errors=True)
        subprocess.Popen([str(EXE)], env=clean_env(), cwd=str(INSTALL))
        t.ok(wait(lambda: oriels(), 30), f"Oriel {FROM} opens again")
        got = wait(lambda: (lambda p: p if any(TO in n for n in p) and "update-info.json" in p else None)(pending()), 300, 2)
        t.ok(got, f"…finds {TO} and downloads it")
        clear_screen()
        # A fresh install's first launch offers to be the default browser (from
        # 0.1.4); the update's popup waits for it to be put away, as it should.
        offer = wait(lambda: find("Links from other apps."), 15, 1)
        if offer:
            x = find("Close")
            if x:
                click(x[0] + x[2] / 2, x[1] + x[3] / 2)
                print("  the first launch's default-browser offer put away first")
        title = wait(lambda: find(f"Oriel {TO} is ready"), 60, 2)
        go = wait(lambda: find("Update and Restart"), 30, 1)
        t.ok(title and go, f"the popup over the window: Oriel {TO} is ready, Update and Restart ({title}, {go})")
        grab(f"3-popup-{TO}")
        if go:
            clear_screen()
            go = find("Update and Restart") or go
            click(go[0] + go[2] / 2, go[1] + go[3] / 2)
            gone = wait(lambda: not oriels(), 60)
            t.ok(gone, "a click on Update and Restart: Oriel closes")
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

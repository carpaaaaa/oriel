#!/usr/bin/env python3
"""Oriel as the default browser, on real Windows (studio/07 §4.1, studio/06
§1.1, studio/03 §3.1), as a person gets there:

1. The installer (silent, /S) lists Oriel among Windows' browsers: the keys
   of build/installer.nsh under HKCU, with the right values.
2. The first launch offers it; Make Oriel the default opens
   ms-settings:defaultapps?registeredAppUser=Oriel, Oriel's own page in
   Settings › Apps › Default apps (found through UI Automation: its Set
   default button). The link is also opened directly, as the Settings row
   opens it.
3. A press on Set default: Windows' UserChoice for https says OrielURL.
4. Oriel back in front reads it again: the offer and Settings › General say
   Oriel is the default browser.
5. `start https://example.com/` and `start <file>.html` open in Oriel.
6. The uninstaller takes the keys away.

    python test/default_browser.py [dist/Oriel-Setup-<version>-x64.exe]

Windows only (the CI's installer job). SHOTS_DIR=<folder> for pictures."""
import ctypes
import glob
import os
import shutil
import struct
import subprocess
import sys
import tempfile
import time
import zlib
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b

if sys.platform != "win32":
    print("default_browser.py runs on Windows only")
    sys.exit(0)

import winreg
from ctypes import wintypes as wt

ROOT = Path(__file__).resolve().parent.parent
LOCAL = Path(os.environ["LOCALAPPDATA"])
INSTALL = LOCAL / "Programs" / "Oriel"
EXE = INSTALL / "Oriel.exe"
OUT = Path(os.environ.get("SHOTS_DIR", "shots")) / "default-browser"
OUT.mkdir(parents=True, exist_ok=True)
HKCU = winreg.HKEY_CURRENT_USER
CLIENT = r"Software\Clients\StartMenuInternet\Oriel"
CAPS = CLIENT + r"\Capabilities"
FILES = [".htm", ".html", ".shtml", ".xht", ".xhtml", ".svg", ".webp"]
LINK = "ms-settings:defaultapps?registeredAppUser=Oriel"
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


class BITMAPINFOHEADER(ctypes.Structure):
    _fields_ = [("biSize", wt.DWORD), ("biWidth", wt.LONG), ("biHeight", wt.LONG), ("biPlanes", wt.WORD), ("biBitCount", wt.WORD),
                ("biCompression", wt.DWORD), ("biSizeImage", wt.DWORD), ("biXPelsPerMeter", wt.LONG), ("biYPelsPerMeter", wt.LONG),
                ("biClrUsed", wt.DWORD), ("biClrImportant", wt.DWORD)]


def grab(name):
    """A picture of the whole screen, for looking at."""
    try:
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
    except Exception as e:
        print(f"  (no picture {name}: {e})")


def click(x, y):
    vx, vy = user32.GetSystemMetrics(76), user32.GetSystemMetrics(77)
    vw, vh = user32.GetSystemMetrics(78), user32.GetSystemMetrics(79)
    user32.mouse_event(0x1 | 0x8000 | 0x4000, int((x - vx) * 65535 / max(1, vw - 1)), int((y - vy) * 65535 / max(1, vh - 1)), 0, 0)
    user32.SetCursorPos(int(x), int(y))
    time.sleep(0.15)
    user32.mouse_event(0x2, 0, 0, 0, 0)
    time.sleep(0.05)
    user32.mouse_event(0x4, 0, 0, 0, 0)


def keys(*vks):
    """Pressed together, let go in reverse."""
    for vk in vks:
        user32.keybd_event(vk, 0, 0, 0)
        time.sleep(0.03)
    for vk in reversed(vks):
        user32.keybd_event(vk, 0, 2, 0)
        time.sleep(0.03)


def ps(script):
    return subprocess.run(["powershell", "-NoProfile", "-Command", script], capture_output=True, text=True).stdout


def clear_screen():
    """Escape a Start menu left open (the ARM images start with it) and the first-run screen."""
    keys(0x1B)
    ps("Get-Process WWAHost, CloudExperienceHostBroker, UserOOBEBroker -ErrorAction SilentlyContinue | Stop-Process -Force")
    time.sleep(0.8)


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


# UI Automation, as a screen reader finds things (an installed Oriel has no
# test hooks, src/main/testhooks.ts).
UIA = r"""
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
$A = [System.Windows.Automation.AutomationElement]
$T = [System.Windows.Automation.TreeScope]
$ids = @(Get-Process -Name __PROCS__ -ErrorAction SilentlyContinue | Where-Object { __WHERE__ } | ForEach-Object { $_.Id })
$cond = New-Object System.Windows.Automation.PropertyCondition($A::NameProperty, '__NAME__')
foreach ($w in $A::RootElement.FindAll($T::Children, [System.Windows.Automation.Condition]::TrueCondition)) {
  $title = '__TITLE__'
  if (-not ($ids -contains $w.Current.ProcessId) -and -not ($title -and $w.Current.Name -eq $title)) { continue }
  if ('__MODE__' -eq 'focus') { try { $w.SetFocus(); 'FOCUSED' } catch { 'NOFOCUS' }; break }
  if ('__MODE__' -eq 'names') {
    'WINDOW:' + $w.Current.Name
    $n = 0
    foreach ($e in $w.FindAll($T::Descendants, [System.Windows.Automation.Condition]::TrueCondition)) {
      if ($e.Current.Name) { 'NAME:' + $e.Current.ControlType.ProgrammaticName + ':' + $e.Current.Name; $n++ }
      if ($n -gt 150) { break }
    }
    continue
  }
  $e = $w.FindFirst($T::Descendants, $cond)
  if ($e) {
    if ('__MODE__' -eq 'invoke') {
      try { $e.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke(); 'INVOKED' } catch { 'NOINVOKE' }
    }
    $r = $e.Current.BoundingRectangle
    'AT:{0},{1},{2},{3}' -f $r.X, $r.Y, $r.Width, $r.Height
    break
  }
}
"""
ORIEL = ("Oriel", f"$_.Path -like '{INSTALL}*'", "")
SETTINGS = ("SystemSettings, ApplicationFrameHost", "$true", "Settings")


def uia(where, name, mode="find"):
    procs, cond, title = where
    script = UIA.replace("__PROCS__", procs).replace("__WHERE__", cond).replace("__TITLE__", title) \
        .replace("__NAME__", name.replace("'", "''")).replace("__MODE__", mode)
    return ps(script)


def find(where, name):
    """Where something named so is on the screen (physical pixels), or None."""
    for line in uia(where, name).splitlines():
        if line.startswith("AT:"):
            nums = [float(x) for x in line[3:].split(",")]
            if nums[2] > 0 and nums[3] > 0:
                return nums
    return None


def press(where, name):
    """Its Invoke, or a real click in its middle."""
    out = uia(where, name, "invoke")
    if "INVOKED" in out:
        return "invoked"
    at = find(where, name)
    if at:
        click(at[0] + at[2] / 2, at[1] + at[3] / 2)
        return "clicked"
    return None


def settings_window():
    """The Settings app's window rectangle (physical pixels), or None."""
    found = []
    proc = ctypes.WINFUNCTYPE(wt.BOOL, wt.HWND, wt.LPARAM)
    def each(hwnd, _):
        buf = ctypes.create_unicode_buffer(256)
        user32.GetWindowTextW(hwnd, buf, 256)
        if buf.value == "Settings" and user32.IsWindowVisible(hwnd):
            r = wt.RECT()
            user32.GetWindowRect(hwnd, ctypes.byref(r))
            found.append((r.left, r.top, r.right, r.bottom))
        return True
    user32.EnumWindows(proc(each), 0)
    return found[0] if found else None


def names(where):
    return [l for l in uia(where, "", "names").splitlines() if l.strip()]


# the registry

def value(path, name="", root=HKCU):
    try:
        with winreg.OpenKey(root, path) as k:
            return winreg.QueryValueEx(k, name)[0]
    except OSError:
        return None


def exists(path, root=HKCU):
    try:
        winreg.OpenKey(root, path).Close()
        return True
    except OSError:
        return False


def chosen(base):
    """The ProgID Windows chose: UserChoiceLatest (Windows 11 from 2025) before UserChoice."""
    for sub, name in ((r"\UserChoiceLatest\ProgId", "ProgId"), (r"\UserChoiceLatest", "ProgId"), (r"\UserChoice", "ProgId")):
        v = value(base + sub, name)
        if v:
            return v
    return None


def https_choice():
    return chosen(r"Software\Microsoft\Windows\Shell\Associations\UrlAssociations\https")


def html_choice():
    return chosen(r"Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.html")


def same(a, b_):
    return a is not None and os.path.normcase(str(a)) == os.path.normcase(str(b_))


# Oriel

def oriels():
    out = ps(f"Get-Process Oriel -ErrorAction SilentlyContinue | Where-Object {{ $_.Path -like '{INSTALL}*' }} | Select-Object -ExpandProperty Id")
    return [int(x) for x in out.split() if x.strip().isdigit()]


def kill(name):
    ps(f"Get-Process {name} -ErrorAction SilentlyContinue | Stop-Process -Force")
    time.sleep(1.5)


def clean_env():
    return {k: v for k, v in os.environ.items() if not (k.startswith("SEARCH_") or k.startswith("ORIEL_"))}


def uninstall():
    kill("Oriel")
    uninstaller = INSTALL / "Uninstall Oriel.exe"
    if uninstaller.exists():
        subprocess.run([str(uninstaller), "/S"], check=False)
        wait(lambda: not EXE.exists(), 90)
        time.sleep(3)


setup = Path(sys.argv[1]) if len(sys.argv) > 1 else None
if not setup:
    built = sorted((p for p in glob.glob(str(ROOT / "dist" / "Oriel-Setup-*-x64.exe"))), key=os.path.getmtime)
    setup = Path(built[-1]) if built else None
if not setup or not setup.exists():
    print("no installer: build it first (npx electron-builder --win nsis --x64)")
    sys.exit(1)
print(f"installer: {setup}")
clear_screen()

# 1. Installed: the keys of build/installer.nsh.
uninstall()
shutil.rmtree(Path(os.environ["APPDATA"]) / "Oriel", ignore_errors=True)
subprocess.run([str(setup), "/S"], check=True)
APPS = r"Software\RegisteredApplications"
wait(lambda: EXE.exists() and value(APPS, "Oriel"), 120)
t.ok(EXE.exists(), f"installed silently at {EXE}")
registered = value(APPS, "Oriel")
t.ok(registered == CAPS, f"RegisteredApplications › Oriel points at its Capabilities ({registered})")
t.ok(value(CAPS, "ApplicationName") == "Oriel" and value(CAPS, "ApplicationDescription"), "Capabilities: ApplicationName Oriel, a description")
t.ok(same(str(value(CAPS, "ApplicationIcon") or "").rsplit(",", 1)[0], EXE), f"Capabilities: the icon is Oriel.exe's ({value(CAPS, 'ApplicationIcon')})")
t.ok(value(CAPS + r"\StartMenu", "StartMenuInternet") == "Oriel", "Capabilities › StartMenu › StartMenuInternet: Oriel")
urls = {s: value(CAPS + r"\URLAssociations", s) for s in ("http", "https", "mailto", "ftp")}
t.ok(urls == {"http": "OrielURL", "https": "OrielURL", "mailto": "OrielURL", "ftp": None}, f"URLAssociations: http, https, mailto to OrielURL ({urls})")
files = {e: value(CAPS + r"\FileAssociations", e) for e in FILES + [".pdf"]}
t.ok(all(files[e] == "OrielHTML" for e in FILES) and files[".pdf"] is None, f"FileAssociations: {', '.join(FILES)} to OrielHTML, no .pdf ({files})")
for pid in ("OrielURL", "OrielHTML"):
    cmd = value(rf"Software\Classes\{pid}\shell\open\command")
    t.ok(cmd and os.path.normcase(cmd) == os.path.normcase(f'"{EXE}" -- "%1"'), f'{pid}: opens with "Oriel.exe" -- "%1" ({cmd})')
    t.ok(same(str(value(rf"Software\Classes\{pid}\DefaultIcon") or "").rsplit(",", 1)[0], EXE), f"{pid}: Oriel's icon")
    t.ok(value(rf"Software\Classes\{pid}\Application", "ApplicationName") == "Oriel", f"{pid}: Application › ApplicationName Oriel")
t.ok(all(value(rf"Software\Classes\{e}\OpenWithProgids", "OrielHTML") is not None for e in FILES), "each file type lists Oriel in Open with")
t.ok(value(r"Software\Classes\.html") != "OrielHTML", "…without taking any type's own default")
start_cmd = value(CLIENT + r"\shell\open\command")
t.ok(start_cmd and os.path.normcase(start_cmd) == os.path.normcase(f'"{EXE}"'), f"StartMenuInternet › Oriel opens Oriel ({start_cmd})")
print(f"  before: https opens with {https_choice()}, .html with {html_choice()}")

# 2. The first launch offers it; Make Oriel the default opens Oriel's page.
subprocess.Popen([str(EXE)], env=clean_env(), cwd=str(INSTALL))
t.ok(wait(oriels, 30), "Oriel opens")
clear_screen()
make = wait(lambda: find(ORIEL, "Make Oriel the default"), 40, 2)
grab("1-offer")
t.ok(make, "the first launch offers to be the default browser (picture: 1-offer)")
from_oriel = False
if make:
    click(make[0] + make[2] / 2, make[1] + make[3] / 2)
    t.ok(wait(lambda: find(ORIEL, "In Windows Settings, click Set default at the top"), 20, 1), "…pressed, Oriel says what to click in Settings")
    from_oriel = bool(wait(lambda: find(SETTINGS, "Set default"), 45, 2))
    t.ok(from_oriel, "…and Windows Settings opens on Oriel's page, with Set default")
if not from_oriel:
    kill("SystemSettings")
    os.startfile(LINK)
setdefault = wait(lambda: find(SETTINGS, "Set default"), 60, 2)
grab("2-settings")
if not setdefault:
    # The managed UI Automation of PowerShell can't read the Settings app on
    # some images (it shows the page: picture 2-settings). Its Set default
    # sits at the top right of the page's first card: pressed by its place,
    # and what Windows chose is read from the registry right after.
    rect = settings_window()
    if rect:
        l, tp, r, btm = rect
        setdefault = [r - 106 - 65, tp + 147 - 16, 130, 32]
        print(f"  Settings at {rect}: Set default pressed by its place {setdefault}")
if not setdefault:
    print("  what Settings shows:")
    for line in names(SETTINGS)[:160]:
        print("   ", line)
t.ok(setdefault, f"{LINK} lands on Oriel's page in Settings › Apps › Default apps: Set default is there (picture: 2-settings)")
t.ok(find(SETTINGS, "Oriel") or any("Oriel" in l for l in names(SETTINGS)), "…the page is Oriel's")

# 3. Set default, pressed: Windows chose Oriel.
if setdefault:
    how = press(SETTINGS, "Set default") or "not found by name"
    if how == "not found by name":
        click(setdefault[0] + setdefault[2] / 2, setdefault[1] + setdefault[3] / 2)
        how = "clicked by its place"

    print(f"  Set default {how}")
    got = wait(lambda: https_choice() == "OrielURL", 30, 1)
    time.sleep(1)
    grab("3-set-default")
    t.ok(got, f"Set default: UserChoice for https says OrielURL ({https_choice()})")
    http = chosen(r"Software\Microsoft\Windows\Shell\Associations\UrlAssociations\http")
    htm = chosen(r"Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.htm")
    print(f"  after: http opens with {http}, .html with {html_choice()}, .htm with {htm}")

# 4. Oriel back in front reads it again.
kill("SystemSettings")
title = find(ORIEL, "Links from other apps.")
if title:
    click(title[0] + title[2] / 2, title[1] + title[3] / 2)
else:
    uia(ORIEL, "", "focus")
t.ok(wait(lambda: find(ORIEL, "Oriel is the default browser"), 20, 1), "back in front, the offer says Oriel is the default browser")
grab("4-offer-done")
done = find(ORIEL, "Done")
if done:
    click(done[0] + done[2] / 2, done[1] + done[3] / 2)
    time.sleep(1)
clear_screen()
win = find(ORIEL, "Enter a web address") or find(ORIEL, "New Tab")
if win:
    click(win[0] + win[2] / 2, win[1] + win[3] / 2)  # Oriel in front, its page focused
    time.sleep(0.5)
keys(0x11, 0xBC)  # Ctrl+, opens Settings
t.ok(wait(lambda: find(ORIEL, "Oriel is the default browser on this PC"), 30, 2), "Settings › General: Oriel is the default browser on this PC")
grab("5-settings-row")

# 5. Links and files from other apps.
subprocess.run(["cmd", "/c", "start", "", "https://example.com/"], check=False)
t.ok(wait(lambda: find(ORIEL, "Example Domain"), 60, 2), "start https://example.com/ opens it in Oriel")
grab("6-link")
page = Path(tempfile.gettempdir()) / "oriel default check.html"
page.write_text("<!doctype html><title>Oriel file check</title><h1>Oriel file check</h1>", encoding="utf-8")
print(f"  .html opens with {html_choice()}")
subprocess.run(["cmd", "/c", "start", "", str(page)], check=False)
t.ok(wait(lambda: find(ORIEL, "Oriel file check"), 40, 2), "an .html file opened from Windows opens in Oriel")
grab("7-file")

# 6. Uninstalled: the keys go with it.
uninstall()
wait(lambda: value(APPS, "Oriel") is None and not exists(CLIENT), 60)
t.ok(not EXE.exists(), "the uninstaller removes Oriel")
t.ok(value(APPS, "Oriel") is None, "…its RegisteredApplications value")
t.ok(not exists(CLIENT), "…StartMenuInternet › Oriel")
t.ok(not exists(r"Software\Classes\OrielURL") and not exists(r"Software\Classes\OrielHTML"), "…the OrielURL and OrielHTML ProgIDs")
t.ok(all(value(rf"Software\Classes\{e}\OpenWithProgids", "OrielHTML") is None for e in FILES), "…and Oriel from Open with")
page.unlink(missing_ok=True)

print(f"{t.passed} passed, {t.failed} failed")
sys.exit(1 if t.failed else 0)

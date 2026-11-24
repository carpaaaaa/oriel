#!/usr/bin/env python3
"""The one-click installer on real Windows, over what the old one left
(package.json build.nsis oneClick, from 0.1.5):

1. On a clean PC, /S installs Oriel for the person alone, in
   %LOCALAPPDATA%\\Programs\\Oriel, without starting it.
2. Over 0.1.4 installed with the old installer in a folder chosen by hand
   (/D=), the new setup as the updater runs it (--updated /S) and as a person
   runs it again (/S) both replace Oriel in that folder: no second copy in
   the default place, one entry in Apps.
3. The uninstaller takes it away.

    python test/installer_oneclick.py [dist/Oriel-Setup-<version>-x64.exe]

Windows only (the CI's installer job)."""
import glob, json, os, subprocess, sys, time, urllib.request, winreg
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b

if sys.platform != "win32":
    print("installer_oneclick.py runs on Windows only")
    sys.exit(0)

ROOT = Path(__file__).resolve().parent.parent
LOCAL = Path(os.environ["LOCALAPPDATA"])
DEFAULT = LOCAL / "Programs" / "Oriel"
# No space in it: subprocess would quote /D=, and NSIS reads /D= unquoted.
CUSTOM = Path(os.environ.get("RUNNER_TEMP", os.environ["TEMP"])) / "OrielHere"
t = b.T()

setup = Path(sys.argv[1]) if len(sys.argv) > 1 else None
if not setup:
    built = sorted(glob.glob(str(ROOT / "dist" / "Oriel-Setup-*-x64.exe")), key=os.path.getmtime)
    setup = Path(built[-1]) if built else None
if not setup or not setup.exists():
    print("no installer: build it first (npx electron-builder --win nsis --x64)")
    sys.exit(1)
NEW = json.loads((ROOT / "package.json").read_text())["version"]
print(f"installer: {setup} ({NEW})")
if NEW == "0.1.4":
    print("the setup is 0.1.4 itself: nothing to update over")
    sys.exit(1)


def version_of(exe):
    if not Path(exe).exists():
        return None
    r = subprocess.run(["powershell", "-NoProfile", "-Command", f"(Get-Item -LiteralPath '{exe}').VersionInfo.ProductVersion"], capture_output=True, text=True)
    v = r.stdout.strip()
    # Windows writes 0.1.4 as 0.1.4.0.
    return (v[:-2] if v.count(".") == 3 and v.endswith(".0") else v) or None


def running():
    r = subprocess.run(["tasklist", "/FI", "IMAGENAME eq Oriel.exe", "/FO", "CSV", "/NH"], capture_output=True, text=True)
    return "Oriel.exe" in r.stdout


def kill():
    subprocess.run(["taskkill", "/F", "/IM", "Oriel.exe", "/T"], capture_output=True)
    time.sleep(1)


def entries():
    """Apps & features entries named Oriel, for this person and for everyone."""
    out = []
    for hive in (winreg.HKEY_CURRENT_USER, winreg.HKEY_LOCAL_MACHINE):
        try:
            root = winreg.OpenKey(hive, r"Software\Microsoft\Windows\CurrentVersion\Uninstall")
        except OSError:
            continue
        i = 0
        while True:
            try:
                name = winreg.EnumKey(root, i)
            except OSError:
                break
            i += 1
            try:
                k = winreg.OpenKey(root, name)
                shown = winreg.QueryValueEx(k, "DisplayName")[0]
                if shown.startswith("Oriel"):
                    loc = ""
                    try:
                        loc = winreg.QueryValueEx(k, "InstallLocation")[0]
                    except OSError:
                        pass
                    out.append((shown, loc))
            except OSError:
                pass
    return out


def uninstall(folder):
    u = Path(folder) / "Uninstall Oriel.exe"
    if u.exists():
        subprocess.run([str(u), "/S"], check=False)
        time.sleep(4)


def run(args, wait=6):
    subprocess.run([str(setup), *args], check=True)
    time.sleep(wait)


# 1. A clean PC.
kill()
uninstall(DEFAULT)
uninstall(CUSTOM)
run(["/S"])
t.ok(version_of(DEFAULT / "Oriel.exe") == NEW, f"/S on a clean PC: Oriel {NEW} in {DEFAULT}")
t.ok(not running(), "a silent install doesn't start Oriel")
t.ok(len(entries()) == 1, f"one entry in Apps ({entries()})")
uninstall(DEFAULT)
t.ok(not (DEFAULT / "Oriel.exe").exists() and not entries(), "the uninstaller takes it away")

# 2. Over 0.1.4 in a folder of its own.
old = Path(os.environ.get("RUNNER_TEMP", os.environ["TEMP"])) / "Oriel-Setup-0.1.4-x64.exe"
urllib.request.urlretrieve("https://github.com/carpaaaaa/oriel/releases/download/v0.1.4/Oriel-Setup-0.1.4-x64.exe", old)
subprocess.run([str(old), "/S", f"/D={CUSTOM}"], check=True)
time.sleep(6)
kill()
t.ok(version_of(CUSTOM / "Oriel.exe") == "0.1.4", f"0.1.4 with the old installer in a folder chosen by hand ({CUSTOM})")
run(["--updated", "/S"])
kill()
t.ok(version_of(CUSTOM / "Oriel.exe") == NEW, f"as the updater runs it (--updated /S): Oriel {NEW} in that folder ({version_of(CUSTOM / 'Oriel.exe')})")
t.ok(not (DEFAULT / "Oriel.exe").exists(), "no second copy in the default place")
run(["/S"])
kill()
t.ok(version_of(CUSTOM / "Oriel.exe") == NEW and not (DEFAULT / "Oriel.exe").exists(), "run again by hand (/S): still that folder, still one copy")
e = entries()
# The Apps entry may not say where (electron-builder keeps InstallLocation under its own key).
t.ok(len(e) == 1 and (not e[0][1] or str(CUSTOM).lower() in e[0][1].lower()), f"one entry in Apps ({e})")

# 3. Gone.
uninstall(CUSTOM)
t.ok(not (CUSTOM / "Oriel.exe").exists() and not entries(), "the uninstaller takes it away")
t.done()

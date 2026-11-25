#!/usr/bin/env python3
"""The Microsoft Store's package of Oriel on real Windows (package.json
build.appx, build/appx-extensions.xml, settings/browser.ts storeFamily):

1. electron-builder made the package for this machine's processor, with the
   Store's identity (CharStudio.OrielBrowser, Char Studio's publisher).
2. Signed here with a test certificate of that publisher (the Store signs the
   real one), it installs with Add-AppxPackage.
3. Windows lists it for http, https, mailto and web pages (what Default apps
   offers), and it opens from the Start menu as Oriel, still running after
   a while; a picture of the screen is kept.
4. It uninstalls.

    python test/store_package.py [dist/Oriel-Store-<version>-<arch>.appx]

Windows only (the CI's store job). SHOTS_DIR=<folder> for the picture."""
import ctypes, glob, json, os, platform, struct, subprocess, sys, time, zlib
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b

if sys.platform != "win32":
    print("store_package.py runs on Windows only")
    sys.exit(0)

ROOT = Path(__file__).resolve().parent.parent
PKG = json.loads((ROOT / "package.json").read_text())
APPX = PKG["build"]["appx"]
NAME, PUBLISHER, APP_ID = APPX["identityName"], APPX["publisher"], APPX["applicationId"]
ARCH = "arm64" if platform.machine().lower() in ("arm64", "aarch64") else "x64"
OUT = Path(os.environ.get("SHOTS_DIR", "shots")) / "store"
OUT.mkdir(parents=True, exist_ok=True)
TEMP = Path(os.environ.get("RUNNER_TEMP", os.environ["TEMP"]))
t = b.T()


# Windows PowerShell with its own modules: the step's PowerShell 7 hands its
# PSModulePath down, and 5.1 can't load those (no Cert: drive, no Appx).
PSENV = {k: v for k, v in os.environ.items() if k.upper() != "PSMODULEPATH"}


def ps(cmd, check=False):
    r = subprocess.run(["powershell", "-NoProfile", "-Command", cmd], capture_output=True, text=True, env=PSENV)
    if check and r.returncode:
        print(r.stdout, r.stderr)
    return r


package = Path(sys.argv[1]) if len(sys.argv) > 1 else None
if not package:
    found = sorted(glob.glob(str(ROOT / "dist" / f"*Store*-{ARCH}.appx")), key=os.path.getmtime)
    package = Path(found[-1]) if found else None
t.ok(package and package.exists(), f"the Store's package for {ARCH} was made ({package})")
if not package or not package.exists():
    t.done()

# 1. What the package says about itself.
manifest = ps(f"""
Add-Type -AssemblyName System.IO.Compression.FileSystem
$z = [System.IO.Compression.ZipFile]::OpenRead('{package}')
$e = $z.GetEntry('AppxManifest.xml'); $r = New-Object System.IO.StreamReader($e.Open()); $r.ReadToEnd(); $z.Dispose()
""").stdout
(OUT / "AppxManifest.xml").write_text(manifest, encoding="utf-8")
t.ok(f'Name="{NAME}"' in manifest and f'Publisher="{PUBLISHER}"' in manifest, "the Store's identity: name and publisher")
for scheme in ("http", "https", "mailto"):
    t.ok(f'Protocol Name="{scheme}"' in manifest, f"listed for {scheme} links")
t.ok("<uap:FileType>.html</uap:FileType>" in manifest, "listed for web pages")
t.ok("runFullTrust" in manifest, "a desktop app (runFullTrust)")

# 2. A test certificate of the same publisher, the package signed with it.
pfx, password = TEMP / "oriel-test.pfx", "oriel-test"
script = TEMP / "oriel-test-cert.ps1"
script.write_text(f"""$ErrorActionPreference = 'Stop'
$c = New-SelfSignedCertificate -Type Custom -Subject '{PUBLISHER}' -KeyUsage DigitalSignature -FriendlyName 'Oriel test' -CertStoreLocation 'Cert:\\CurrentUser\\My' -TextExtension @('2.5.29.37={{text}}1.3.6.1.5.5.7.3.3', '2.5.29.19={{text}}')
$p = ConvertTo-SecureString -String '{password}' -Force -AsPlainText
Export-PfxCertificate -Cert $c -FilePath '{pfx}' -Password $p | Out-Null
Import-PfxCertificate -FilePath '{pfx}' -CertStoreLocation 'Cert:\\LocalMachine\\TrustedPeople' -Password $p | Out-Null
'ok'
""", encoding="utf-8")
r = subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(script)], capture_output=True, text=True, env=PSENV)
if not pfx.exists():
    print("  certificate script said:", r.stdout, r.stderr, sep="\n")
t.ok("ok" in r.stdout and pfx.exists(), "a test certificate of Char Studio's publisher, trusted on this machine")
kits = sorted(glob.glob(r"C:\Program Files (x86)\Windows Kits\10\bin\10.*\x64\signtool.exe")) + \
       sorted(glob.glob(str(Path(os.environ.get("LOCALAPPDATA", "")) / "electron-builder" / "Cache" / "winCodeSign" / "**" / "signtool.exe"), recursive=True))
signtool = kits[-1] if kits else None
signed = TEMP / f"oriel-signed-{ARCH}.appx"
signed.write_bytes(package.read_bytes())
r = subprocess.run([signtool, "sign", "/fd", "SHA256", "/f", str(pfx), "/p", password, str(signed)], capture_output=True, text=True) if signtool else None
t.ok(r is not None and r.returncode == 0, f"signed with it ({signtool}: {(r.stdout + r.stderr)[-200:] if r else 'no signtool'})")

# Install.
ps(f"Get-AppxPackage {NAME} | Remove-AppxPackage")
r = ps(f"Add-AppxPackage -Path '{signed}'; (Get-AppxPackage {NAME} | Select-Object PackageFullName, PackageFamilyName, Version, InstallLocation | ConvertTo-Json)", check=True)
try:
    info = json.loads(r.stdout[r.stdout.index("{"):])
except Exception:
    info = None
t.ok(info and info.get("PackageFamilyName", "").startswith(NAME + "_"), f"installed with Add-AppxPackage ({info})")
if not info:
    t.done()
family, full = info["PackageFamilyName"], info["PackageFullName"]
version = PKG["version"] + ".0"
t.ok(info.get("Version") == version, f"version {version} ({info.get('Version')})")

# 3. What Windows knows of it: the capabilities Default apps reads.
caps = ps(f"""
$k = 'HKCU:\\Software\\Classes\\Local Settings\\Software\\Microsoft\\Windows\\CurrentVersion\\AppModel\\Repository\\Packages\\{full}\\{APP_ID}\\Capabilities'
$u = Get-ItemProperty "$k\\URLAssociations" -ErrorAction SilentlyContinue
$f = Get-ItemProperty "$k\\FileAssociations" -ErrorAction SilentlyContinue
@{{ urls = @($u.PSObject.Properties.Name); files = @($f.PSObject.Properties.Name) }} | ConvertTo-Json -Compress
""").stdout.strip()
print(f"  capabilities: {caps}")
try:
    c = json.loads(caps)
except Exception:
    c = {"urls": [], "files": []}
t.ok(all(s in (c.get("urls") or []) for s in ("http", "https", "mailto")), "Windows lists Oriel for http, https and mailto (Default apps)")
t.ok(".html" in (c.get("files") or []), "and for .html files")

# Opens from the Start menu.
subprocess.run(["taskkill", "/F", "/IM", "Oriel.exe"], capture_output=True)
ps(f"Start-Process 'shell:AppsFolder\\{family}!{APP_ID}'")


def running():
    r = ps("Get-Process Oriel -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '*WindowsApps*' } | Select-Object -ExpandProperty Id")
    return [x for x in r.stdout.split() if x.strip()]


end = time.time() + 40
while time.time() < end and not running():
    time.sleep(1)
t.ok(running(), "opens from the Start menu, from its package")
time.sleep(10)
titles = ps("Get-Process Oriel -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -ExpandProperty MainWindowTitle").stdout.strip()
t.ok(running() and titles, f"still running after 10 s, with a window ({titles!r})")

# A picture of the screen.
user32, gdi32 = ctypes.WinDLL("user32"), ctypes.WinDLL("gdi32")
try:
    user32.SetProcessDpiAwarenessContext(ctypes.c_void_p(-4))
except Exception:
    pass
for f in ("GetDC", "CreateCompatibleDC", "CreateCompatibleBitmap", "SelectObject"):
    getattr(user32 if f == "GetDC" else gdi32, f).restype = ctypes.c_void_p
user32.GetDC.argtypes = [ctypes.c_void_p]
gdi32.CreateCompatibleDC.argtypes = [ctypes.c_void_p]
gdi32.CreateCompatibleBitmap.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_int]
gdi32.SelectObject.argtypes = [ctypes.c_void_p, ctypes.c_void_p]
gdi32.BitBlt.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_void_p, ctypes.c_int, ctypes.c_int, ctypes.c_uint]
gdi32.GetDIBits.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_uint, ctypes.c_uint, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_uint]
w, h = user32.GetSystemMetrics(0), user32.GetSystemMetrics(1)
screen = user32.GetDC(None)
mem = gdi32.CreateCompatibleDC(screen)
bmp = gdi32.CreateCompatibleBitmap(screen, w, h)
gdi32.SelectObject(mem, bmp)
gdi32.BitBlt(mem, 0, 0, w, h, screen, 0, 0, 0x00CC0020)
hdr = struct.pack("<IiiHHIIiiII", 40, w, -h, 1, 32, 0, 0, 0, 0, 0, 0)
bi = ctypes.create_string_buffer(hdr, 44)
buf = ctypes.create_string_buffer(w * h * 4)
gdi32.GetDIBits(mem, bmp, 0, h, buf, bi, 0)
raw = bytearray()
for row in range(h):
    line = buf.raw[row * w * 4:(row + 1) * w * 4]
    rgb = bytearray(w * 3)
    rgb[0::3], rgb[1::3], rgb[2::3] = line[2::4], line[1::4], line[0::4]
    raw += b"\0" + rgb


def chunk(kind, body):
    return struct.pack(">I", len(body)) + kind + body + struct.pack(">I", zlib.crc32(kind + body) & 0xffffffff)


(OUT / f"store-{ARCH}.png").write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(bytes(raw), 6)) + chunk(b"IEND", b""))

# 4. Gone.
subprocess.run(["taskkill", "/F", "/IM", "Oriel.exe"], capture_output=True)
time.sleep(2)
ps(f"Get-AppxPackage {NAME} | Remove-AppxPackage")
gone = not ps(f"Get-AppxPackage {NAME}").stdout.strip()
t.ok(gone, "uninstalls")
t.done()

$ErrorActionPreference = 'Stop'

# Oriel's own installer for the current user, run silently. The file isn't in
# this package: it is downloaded from the release and checked against its
# SHA-256 (also in SHA256SUMS.txt beside it).
$version = '0.1.11'
$x64 = @{ Url = "https://github.com/carpaaaaa/oriel/releases/download/v$version/Oriel-Setup-$version-x64.exe"; Checksum = 'd2338d95cd27eee4d88cf94c2bd4f5babcc802db3c5dcc48121459bdb7805655' }
$arm = @{ Url = "https://github.com/carpaaaaa/oriel/releases/download/v$version/Oriel-Setup-$version-arm64.exe"; Checksum = 'd6bc73b372e0620b3adce2f895ae808a283e3d1ef1f61e49accbb78ba1af6f70' }

# A Snapdragon PC gets the ARM installer, any other 64-bit PC the x64 one.
$isArm = ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') -or ($env:PROCESSOR_ARCHITEW6432 -eq 'ARM64')
$installer = if ($isArm) { $arm } else { $x64 }

$packageArgs = @{
  packageName    = $env:ChocolateyPackageName
  fileType       = 'exe'
  url64bit       = $installer.Url
  checksum64     = $installer.Checksum
  checksumType64 = 'sha256'
  silentArgs     = '/S /currentuser'
  validExitCodes = @(0)
}

Install-ChocolateyPackage @packageArgs

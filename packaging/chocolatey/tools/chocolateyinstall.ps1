$ErrorActionPreference = 'Stop'

# Oriel's own installer for the current user, run silently. The file isn't in
# this package: it is downloaded from the release and checked against its
# SHA-256 (also in SHA256SUMS.txt beside it).
$version = '0.1.12'
$x64 = @{ Url = "https://github.com/carpaaaaa/oriel/releases/download/v$version/Oriel-Setup-$version-x64.exe"; Checksum = '096521a8c3a7ec3c9d144209329c69c18a3f255413984bb3c098b1a0f6ddf8ea' }
$arm = @{ Url = "https://github.com/carpaaaaa/oriel/releases/download/v$version/Oriel-Setup-$version-arm64.exe"; Checksum = 'be97c5eccecfc214f5624bc154416676d1c9cea0d1212979dec06ebe98c42d99' }

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

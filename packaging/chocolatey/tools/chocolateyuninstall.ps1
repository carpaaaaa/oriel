$ErrorActionPreference = 'Stop'

# Oriel's own uninstaller, run silently for the current user.
[array]$key = Get-UninstallRegistryKey -SoftwareName 'Oriel*'

if ($key.Count -eq 1) {
  $uninstaller = ($key[0].UninstallString -replace '^"([^"]+)".*$', '$1')
  Uninstall-ChocolateyPackage -PackageName $env:ChocolateyPackageName -FileType 'exe' -SilentArgs '/S /currentuser' -File $uninstaller -ValidExitCodes @(0)
} elseif ($key.Count -eq 0) {
  Write-Warning "$env:ChocolateyPackageName has already been uninstalled by other means."
} else {
  Write-Warning "$($key.Count) matches found for Oriel. Nothing was uninstalled."
  $key | ForEach-Object { Write-Warning "- $($_.DisplayName)" }
}

param()
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Push-Location $root
try {
  npm run pack
  $wix = Get-Command wix -ErrorAction SilentlyContinue
  if (-not $wix) {
    throw 'WiX Toolset v4 is required for MSI. Install it with: winget install WiXToolset.WiXToolset'
  }
  & wix build installer/wix/PiperOSTool.wxs -arch x64 -o release/PiperOS-Tool-3.2.3-beta-x64.msi
} finally { Pop-Location }

param()
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Push-Location $root
try {
  npm run pack
  & powershell -ExecutionPolicy Bypass -File scripts/generate-msi-payload.ps1
  $wixCommand = Get-Command wix -ErrorAction SilentlyContinue
  $wixPath = if ($wixCommand) { $wixCommand.Source } else {
    Get-ChildItem 'C:\Program Files\WiX Toolset*\bin\wix.exe' -ErrorAction SilentlyContinue |
      Sort-Object FullName -Descending |
      Select-Object -First 1 -ExpandProperty FullName
  }
  if (-not $wixPath) {
    throw 'WiX CLI is required for MSI. Install it with: winget install --id WiXToolset.WiXCLI --exact'
  }
  & $wixPath build installer/wix/PiperOSTool.wxs installer/wix/PiperOSTool.Payload.wxs -arch x64 -o release/PiperOS-Tool-3.2.5-beta-x64.msi
} finally { Pop-Location }

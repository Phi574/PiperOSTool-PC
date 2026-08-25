param(
  [string]$Source = (Join-Path (Split-Path -Parent $PSScriptRoot) 'release\win-unpacked'),
  [string]$Output = (Join-Path (Split-Path -Parent $PSScriptRoot) 'installer\wix\PiperOSTool.Payload.wxs')
)

$ErrorActionPreference = 'Stop'
if (-not (Test-Path $Source)) { throw "Missing Electron payload: $Source" }

function Escape-Xml([string]$Value) { [System.Security.SecurityElement]::Escape($Value) }
function Wix-Id([string]$Value) { 'id_' + (($Value -replace '[^A-Za-z0-9_]', '_').Trim('_')) }

$root = (Resolve-Path $Source).Path
$files = Get-ChildItem $root -File -Recurse | Sort-Object FullName
$lines = [System.Collections.Generic.List[string]]::new()
$lines.Add('<?xml version="1.0" encoding="utf-8"?>')
$lines.Add('<Wix xmlns="http://wixtoolset.org/schemas/v4/wxs">')
$lines.Add('  <Fragment>')
$lines.Add('    <StandardDirectory Id="ProgramFiles64Folder">')
$lines.Add('      <Directory Id="INSTALLFOLDER" Name="PiperOS Tool">')
function Add-DirectoryTree([string]$Parent, [string]$Indent) {
  Get-ChildItem $Parent -Directory | Sort-Object Name | ForEach-Object {
    $relative = $_.FullName.Substring($root.Length).TrimStart('\')
    $lines.Add("$Indent<Directory Id=`"$(Wix-Id $relative)`" Name=`"$(Escape-Xml $_.Name)`">")
    Add-DirectoryTree $_.FullName "$Indent  "
    $lines.Add("$Indent</Directory>")
  }
}
Add-DirectoryTree $root '        '
$lines.Add('      </Directory>')
$lines.Add('    </StandardDirectory>')
$lines.Add('  </Fragment>')
$lines.Add('  <Fragment>')
$lines.Add('    <DirectoryRef Id="INSTALLFOLDER">')
$componentIds = [System.Collections.Generic.List[string]]::new()
foreach ($file in $files) {
  $relative = $file.FullName.Substring($root.Length).TrimStart('\')
  $parent = Split-Path $relative -Parent
  $directoryId = if ([string]::IsNullOrEmpty($parent)) { 'INSTALLFOLDER' } else { Wix-Id $parent }
  $componentId = Wix-Id "cmp_$relative"
  $fileId = Wix-Id "file_$relative"
  $componentIds.Add($componentId)
  $lines.Add("      <Component Id=`"$componentId`" Directory=`"$directoryId`" Guid=`"*`">")
  $lines.Add("        <File Id=`"$fileId`" Source=`"$(Escape-Xml $file.FullName)`" KeyPath=`"yes`">")
  if ($relative -eq 'PiperOS Tool.exe') {
    $lines.Add('          <Shortcut Id="PiperOSDesktopShortcut" Directory="DesktopFolder" Name="PiperOS Tool" Description="PiperOS View Remote for Windows" WorkingDirectory="INSTALLFOLDER" Advertise="no" />')
    $lines.Add('          <Shortcut Id="PiperOSStartMenuShortcut" Directory="ProgramMenuFolder" Name="PiperOS Tool" Description="PiperOS View Remote for Windows" WorkingDirectory="INSTALLFOLDER" Advertise="no" />')
  }
  $lines.Add('        </File>')
  $lines.Add('      </Component>')
}
$lines.Add('    </DirectoryRef>')
$lines.Add('  </Fragment>')
$lines.Add('  <Fragment>')
$lines.Add('    <ComponentGroup Id="PiperPayload">')
foreach ($componentId in $componentIds) { $lines.Add("      <ComponentRef Id=`"$componentId`" />") }
$lines.Add('    </ComponentGroup>')
$lines.Add('  </Fragment>')
$lines.Add('</Wix>')
[System.IO.File]::WriteAllLines($Output, $lines, [System.Text.UTF8Encoding]::new($false))

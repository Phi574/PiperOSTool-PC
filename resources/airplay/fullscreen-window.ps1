param([Parameter(Mandatory = $true)][int]$RootPid)

$ErrorActionPreference = 'SilentlyContinue'
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class PiperFullscreenWindow {
    public delegate bool EnumWindowsProc(IntPtr handle, IntPtr parameter);

    [StructLayout(LayoutKind.Sequential)]
    public struct Rect { public int Left; public int Top; public int Right; public int Bottom; }

    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc callback, IntPtr parameter);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr handle);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr handle, out Rect rect);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr handle, out uint processId);
    [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW")] public static extern IntPtr GetWindowLongPtr(IntPtr handle, int index);
    [DllImport("user32.dll", EntryPoint = "SetWindowLongPtrW")] public static extern IntPtr SetWindowLongPtr(IntPtr handle, int index, IntPtr value);
    [DllImport("user32.dll", SetLastError = true)] public static extern bool SetWindowPos(IntPtr handle, IntPtr insertAfter, int x, int y, int width, int height, uint flags);
    [DllImport("user32.dll")] public static extern int GetSystemMetrics(int index);
}
"@

$processIds = [System.Collections.Generic.HashSet[int]]::new()
[void]$processIds.Add($RootPid)
$target = $null

for ($attempt = 0; $attempt -lt 30 -and -not $target; $attempt++) {
    $processes = Get-CimInstance Win32_Process
    $changed = $true
    while ($changed) {
        $changed = $false
        foreach ($process in $processes) {
            if ($processIds.Contains([int]$process.ParentProcessId) -and $processIds.Add([int]$process.ProcessId)) { $changed = $true }
        }
    }

    $windows = [System.Collections.Generic.List[object]]::new()
    $callback = [PiperFullscreenWindow+EnumWindowsProc] {
        param($handle, $parameter)
        if (-not [PiperFullscreenWindow]::IsWindowVisible($handle)) { return $true }
        [uint32]$windowPid = 0
        [void][PiperFullscreenWindow]::GetWindowThreadProcessId($handle, [ref]$windowPid)
        if (-not $processIds.Contains([int]$windowPid)) { return $true }
        $rect = New-Object PiperFullscreenWindow+Rect
        if ([PiperFullscreenWindow]::GetWindowRect($handle, [ref]$rect)) {
            $width = $rect.Right - $rect.Left
            $height = $rect.Bottom - $rect.Top
            if ($width -ge 640 -and $height -ge 360) { $windows.Add([pscustomobject]@{ Handle = $handle; Area = $width * $height }) }
        }
        return $true
    }
    [void][PiperFullscreenWindow]::EnumWindows($callback, [IntPtr]::Zero)
    $target = $windows | Sort-Object Area -Descending | Select-Object -First 1
    if (-not $target) { Start-Sleep -Milliseconds 500 }
}

if ($target) {
    $handle = $target.Handle
    $style = [PiperFullscreenWindow]::GetWindowLongPtr($handle, -16).ToInt64()
    $style = ($style -band (-bnot (0x00C00000 -bor 0x00040000 -bor 0x00800000 -bor 0x00400000))) -bor [long]0x80000000
    [void][PiperFullscreenWindow]::SetWindowLongPtr($handle, -16, [IntPtr]::new($style))
    $width = [PiperFullscreenWindow]::GetSystemMetrics(0)
    $height = [PiperFullscreenWindow]::GetSystemMetrics(1)
    [void][PiperFullscreenWindow]::SetWindowPos($handle, [IntPtr](-1), 0, 0, $width, $height, 0x20 -bor 0x40)
}

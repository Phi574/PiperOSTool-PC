const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { buildUxPlayArguments, writeTemporaryUxPlayArguments } = require('./uxplay-config');

const execFileAsync = promisify(execFile);

class AppleReceiver {
  constructor(resourcesPath) {
    this.resourcesPath = resourcesPath;
    this.process = null;
    this.restoreUxPlayConfig = null;
    this.restoreUxPlayConfigTimer = null;
  }
  async restoreTemporaryConfig() {
    if (this.restoreUxPlayConfigTimer) clearTimeout(this.restoreUxPlayConfigTimer);
    this.restoreUxPlayConfigTimer = null;
    const restore = this.restoreUxPlayConfig;
    this.restoreUxPlayConfig = null;
    await restore?.().catch(() => undefined);
  }
  async clearBundledReceiverProcesses() {
    if (process.platform !== 'win32') return;
    const receiverDirectory = path.join(this.resourcesPath, 'airplay', 'uxplay');
    const escapedPath = receiverDirectory.replace(/'/g, "''");
    const script = `$root = [IO.Path]::GetFullPath('${escapedPath}').TrimEnd('\\') + '\\'; Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($root, [StringComparison]::OrdinalIgnoreCase) } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;
    await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 5000 }).catch(() => undefined);
  }
  async start(settings) {
    if (this.process && !this.process.killed) return { running: true, message: 'Receiver đang hoạt động.' };
    const receiverDirectory = path.join(this.resourcesPath, 'airplay');
    const executable = path.join(receiverDirectory, 'PiperAirPlayReceiver.exe');
    if (!fs.existsSync(executable)) throw new Error('Chưa có PiperOS AirPlay Receiver native. Cài lại gói MSI để khôi phục receiver.');
    await this.clearBundledReceiverProcesses();
    const requestedName = String(settings?.name || '').trim().slice(0, 48) || 'PiperOS View Remote PC';
    const resolution = ['1080p', '1440p', 'Native'].includes(settings?.resolution) ? settings.resolution : '1080p';
    // AirPlay mirroring tops out at 60 FPS on supported iPhones. Sending 120 to
    // the receiver adds decode/render pressure without producing extra frames.
    const fps = Number(settings?.fps) >= 60 ? 60 : 30;
    const uxplay = buildUxPlayArguments({ name: requestedName, resolution, fps });
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    const programData = process.env.ProgramData || 'C:\\ProgramData';
    this.restoreUxPlayConfig = await writeTemporaryUxPlayArguments({ appData, programData, text: uxplay.text });
    const args = ['--name', uxplay.name, '--resolution', resolution, '--fps', String(fps)];
    this.process = spawn(executable, args, { windowsHide: true, cwd: receiverDirectory, stdio: 'ignore' });
    const active = this.process;
    active.once('error', () => {
      if (this.process === active) this.process = null;
      void this.restoreTemporaryConfig();
    });
    active.once('exit', () => {
      if (this.process === active) this.process = null;
      void this.restoreTemporaryConfig();
    });
    // uxplay-windows reads its arguments.txt at startup and ignores arguments
    // passed by the PiperOS launcher. Restore the user's file after discovery
    // has started so their existing settings are not permanently changed.
    this.restoreUxPlayConfigTimer = setTimeout(() => { void this.restoreTemporaryConfig(); }, 8000);
    this.restoreUxPlayConfigTimer.unref?.();
    if (settings?.fullscreen && process.platform === 'win32') this.fillPrimaryDisplay(active.pid);
    return { running: true, message: `PiperOS AirPlay Receiver đang quảng bá ${uxplay.name} ở ${resolution}, tối đa ${fps} FPS${settings?.fullscreen ? ' và toàn màn hình' : ''}.` };
  }
  fillPrimaryDisplay(rootPid) {
    const script = path.join(this.resourcesPath, 'airplay', 'fullscreen-window.ps1');
    if (!fs.existsSync(script)) return;
    const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const helper = spawn(powershell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-RootPid', String(rootPid)], { windowsHide: true, stdio: 'ignore' });
    helper.unref();
  }
  async stop() {
    const active = this.process;
    this.process = null;
    if (!active || active.killed) {
      await this.restoreTemporaryConfig();
      return { running: false, message: 'PiperOS AirPlay Receiver đã dừng.' };
    }
    if (process.platform === 'win32' && active.pid) {
      await execFileAsync('taskkill.exe', ['/PID', String(active.pid), '/T', '/F'], { windowsHide: true, timeout: 5000 }).catch(() => undefined);
      await this.clearBundledReceiverProcesses();
    } else active.kill();
    await this.restoreTemporaryConfig();
    return { running: false, message: 'PiperOS AirPlay Receiver đã dừng.' };
  }
}

module.exports = { AppleReceiver };

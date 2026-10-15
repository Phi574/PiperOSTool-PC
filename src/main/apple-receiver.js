const fs = require('node:fs');
const path = require('node:path');
const { spawn, execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

class AppleReceiver {
  constructor(resourcesPath) { this.resourcesPath = resourcesPath; this.process = null; }
  async clearBundledReceiverProcesses() {
    if (process.platform !== 'win32') return;
    const receiverDirectory = path.join(this.resourcesPath, 'airplay', 'uxplay');
    const escapedPath = receiverDirectory.replace(/'/g, "''");
    const script = `$root = [IO.Path]::GetFullPath('${escapedPath}').TrimEnd('\\') + '\\'; Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($root, [StringComparison]::OrdinalIgnoreCase) } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;
    await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 5000 }).catch(() => undefined);
  }
  async start(settings) {
    if (this.process && !this.process.killed) return { running: true, message: 'Receiver đang hoạt động.' };
    const executable = path.join(this.resourcesPath, 'airplay', 'PiperAirPlayReceiver.exe');
    if (!fs.existsSync(executable)) throw new Error('Chưa có PiperAirPlayReceiver.exe. Cài gói native receiver trong MSI hoặc build theo third_party/airplay_receiver/NOTICE.md.');
    await this.clearBundledReceiverProcesses();
    const name = String(settings?.name || '').trim().slice(0, 48) || 'PiperOS View Remote PC';
    const resolution = ['1080p', '1440p', 'Native'].includes(settings?.resolution) ? settings.resolution : '1080p';
    const fps = [30, 60, 120].includes(Number(settings?.fps)) ? Number(settings.fps) : 60;
    this.process = spawn(executable, ['--name', name, '--resolution', resolution, '--fps', String(fps)], { windowsHide: true, cwd: path.dirname(executable), stdio: 'ignore' });
    const active = this.process;
    active.once('error', () => { if (this.process === active) this.process = null; });
    active.once('exit', () => { if (this.process === active) this.process = null; });
    return { running: true, message: `Đang quảng bá ${name} trên AirPlay.` };
  }
  async stop() {
    const active = this.process;
    this.process = null;
    if (!active || active.killed) return { running: false, message: 'PiperOS AirPlay Receiver đã dừng.' };
    if (process.platform === 'win32' && active.pid) {
      await execFileAsync('taskkill.exe', ['/PID', String(active.pid), '/T', '/F'], { windowsHide: true, timeout: 5000 }).catch(() => undefined);
      await this.clearBundledReceiverProcesses();
    } else active.kill();
    return { running: false, message: 'PiperOS AirPlay Receiver đã dừng.' };
  }
}

module.exports = { AppleReceiver };

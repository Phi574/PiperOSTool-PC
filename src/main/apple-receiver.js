const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

class AppleReceiver {
  constructor(resourcesPath) { this.resourcesPath = resourcesPath; this.process = null; }
  start(settings) {
    if (this.process && !this.process.killed) return { running: true, message: 'Receiver đang hoạt động.' };
    const executable = path.join(this.resourcesPath, 'airplay', 'PiperAirPlayReceiver.exe');
    if (!fs.existsSync(executable)) throw new Error('Chưa có PiperAirPlayReceiver.exe. Cài gói native receiver trong MSI hoặc build theo third_party/airplay_receiver/NOTICE.md.');
    this.process = spawn(executable, ['--name', settings.name, '--resolution', settings.resolution, '--fps', String(settings.fps)], { windowsHide: true });
    this.process.once('exit', () => { this.process = null; });
    return { running: true, message: `Đang quảng bá ${settings.name} trên AirPlay.` };
  }
  stop() { this.process?.kill(); this.process = null; }
}

module.exports = { AppleReceiver };

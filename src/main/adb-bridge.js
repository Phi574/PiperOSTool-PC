const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const path = require('node:path');

const execFileAsync = promisify(execFile);

function adbPath() {
  const candidates = [
    process.env.PIPEROS_ADB_PATH,
    process.env.ANDROID_SDK_ROOT && path.join(process.env.ANDROID_SDK_ROOT, 'platform-tools', 'adb.exe'),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk', 'platform-tools', 'adb.exe'),
    path.join(process.resourcesPath || '', 'resources', 'platform-tools', 'adb.exe'),
    'adb'
  ].filter(Boolean);
  return candidates.find((candidate) => candidate === 'adb' || require('node:fs').existsSync(candidate));
}

async function runAdb(args) {
  const { stdout, stderr } = await execFileAsync(adbPath(), args, { windowsHide: true, timeout: 15_000 });
  return { stdout: stdout.trim(), stderr: stderr.trim() };
}

async function listDevices() {
  await runAdb(['start-server']);
  const { stdout } = await runAdb(['devices', '-l']);
  return stdout.split(/\r?\n/).slice(1).map((line) => {
    const [serial, state, ...details] = line.trim().split(/\s+/);
    return { serial, state, details: details.join(' ') };
  }).filter((device) => device.serial);
}

// Wireless debugging devices appear in ADB as "host:port". The USB workflow
// must never offer them, even if the user previously ran `adb connect`.
async function listUsbDevices() {
  const devices = await listDevices();
  return devices.filter((device) => !device.serial.includes(':'));
}

async function setup() {
  const executable = adbPath();
  try {
    const version = await runAdb(['version']);
    const devices = await listUsbDevices();
    return { executable, version: version.stdout.split(/\r?\n/)[0], devices };
  } catch (error) {
    throw new Error(`Không tìm thấy hoặc không khởi động được ADB. Cài Android Platform Tools/driver OEM rồi thử lại. ${error.message}`);
  }
}

async function forward(serial, devicePort) {
  const { stdout } = await runAdb(['-s', serial, 'forward', 'tcp:0', `tcp:${devicePort}`]);
  const localPort = Number(stdout);
  if (!Number.isInteger(localPort) || localPort <= 0) throw new Error('Không thể tạo cổng USB cho PiperOS View Remote.');
  return { host: '127.0.0.1', port: localPort };
}

async function removeForward(serial, localPort) {
  await runAdb(['-s', serial, 'forward', '--remove', `tcp:${localPort}`]).catch(() => undefined);
}

module.exports = { listUsbDevices, setup, forward, removeForward };

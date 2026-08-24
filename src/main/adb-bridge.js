const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const path = require('node:path');

const execFileAsync = promisify(execFile);

function adbPath() {
  if (process.env.ANDROID_SDK_ROOT) return path.join(process.env.ANDROID_SDK_ROOT, 'platform-tools', 'adb.exe');
  return process.env.PIPEROS_ADB_PATH || 'adb';
}

async function runAdb(args) {
  const { stdout, stderr } = await execFileAsync(adbPath(), args, { windowsHide: true, timeout: 15_000 });
  return { stdout: stdout.trim(), stderr: stderr.trim() };
}

async function listDevices() {
  const { stdout } = await runAdb(['devices', '-l']);
  return stdout.split(/\r?\n/).slice(1).map((line) => {
    const [serial, state, ...details] = line.trim().split(/\s+/);
    return { serial, state, details: details.join(' ') };
  }).filter((device) => device.serial && device.state === 'device');
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

module.exports = { listDevices, forward, removeForward };

const fs = require('node:fs/promises');
const path = require('node:path');

const upstreamExecutable = 'uxplay-windows.exe';
const brandedExecutable = 'PiperOS-player.exe';

module.exports = async function brandAirPlayRuntime(context) {
  if (context.electronPlatformName !== 'win32') return;

  const airplayDirectory = path.join(context.appOutDir, 'resources', 'resources', 'airplay');
  const engineDirectory = path.join(airplayDirectory, 'uxplay');
  const launcherPath = path.join(airplayDirectory, 'PiperAirPlayReceiver.exe');
  const upstreamPath = path.join(engineDirectory, upstreamExecutable);
  const brandedPath = path.join(engineDirectory, brandedExecutable);

  if (!(await exists(launcherPath)) || !(await exists(upstreamPath))) return;
  const launcher = await fs.readFile(launcherPath);
  const from = Buffer.from(upstreamExecutable, 'utf16le');
  const to = Buffer.from(brandedExecutable, 'utf16le');
  if (from.length !== to.length) throw new Error('AirPlay branding names must have equal UTF-16 length.');

  let replaced = 0;
  let offset = 0;
  while ((offset = launcher.indexOf(from, offset)) !== -1) {
    to.copy(launcher, offset);
    offset += to.length;
    replaced += 1;
  }
  if (replaced === 0) throw new Error('PiperOS AirPlay launcher does not contain its expected UxPlay executable name.');

  await fs.copyFile(upstreamPath, brandedPath);
  await fs.writeFile(launcherPath, launcher);
  await fs.rm(upstreamPath);
};

async function exists(filePath) {
  try { await fs.access(filePath); return true; } catch { return false; }
}

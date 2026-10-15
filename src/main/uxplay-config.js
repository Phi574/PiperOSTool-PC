const fs = require('node:fs/promises');
const path = require('node:path');

function normalizeAirPlayName(value) {
  const normalized = String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
  return normalized || 'PiperOS-View-Remote-PC';
}

function buildUxPlayArguments({ name, resolution, fps }) {
  const safeName = normalizeAirPlayName(name);
  const safeFps = Number(fps) >= 60 ? 60 : 30;
  const resolutionArg = resolution === '1440p'
    ? '-s 2560x1440'
    : resolution === '1080p'
      ? '-s 1920x1080'
      : '';
  return {
    name: safeName,
    fps: safeFps,
    text: [`-n ${safeName}`, '-nh', resolutionArg, `-fps ${safeFps}`, '-vs d3d11videosink'].filter(Boolean).join(' ')
  };
}

async function writeTemporaryUxPlayArguments({ appData, programData, text }) {
  const machineConfig = path.join(programData, 'uxplay-windows', 'arguments.txt');
  if (await exists(machineConfig)) {
    throw new Error('Windows có cấu hình UxPlay cấp máy tính đang ghi đè tên receiver. Hãy xóa hoặc sửa ProgramData\\uxplay-windows\\arguments.txt rồi thử lại.');
  }

  const userConfig = path.join(appData, 'leapbtw', 'uxplay-windows', 'arguments.txt');
  const parent = path.dirname(userConfig);
  let previous = null;
  try { previous = await fs.readFile(userConfig); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }

  const replacement = Buffer.from(`${text}\r\n`, 'utf8');
  await fs.mkdir(parent, { recursive: true });
  await fs.writeFile(userConfig, replacement);

  let restored = false;
  return async () => {
    if (restored) return;
    restored = true;
    let current;
    try { current = await fs.readFile(userConfig); }
    catch (error) { if (error.code === 'ENOENT') return; throw error; }
    // Preserve any edits the user made while the receiver was starting.
    if (!current.equals(replacement)) return;
    if (previous) await fs.writeFile(userConfig, previous);
    else await fs.rm(userConfig, { force: true });
  };
}

async function exists(file) {
  try { await fs.access(file); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

module.exports = { buildUxPlayArguments, normalizeAirPlayName, writeTemporaryUxPlayArguments };

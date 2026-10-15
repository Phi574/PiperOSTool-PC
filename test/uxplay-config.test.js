const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { buildUxPlayArguments, writeTemporaryUxPlayArguments } = require('../src/main/uxplay-config');

test('builds PiperOS AirPlay arguments with a safe visible name and selected quality', () => {
  const args = buildUxPlayArguments({ name: 'PiperOS View Remote PC', resolution: '1440p', fps: 120 });
  assert.equal(args.name, 'PiperOS-View-Remote-PC');
  assert.equal(args.fps, 60);
  assert.equal(args.text, '-n PiperOS-View-Remote-PC -nh -s 2560x1440 -fps 60 -vs d3d11videosink');
});

test('temporarily replaces and restores the existing UxPlay user arguments', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'piperos-uxplay-'));
  const appData = path.join(root, 'Roaming');
  const programData = path.join(root, 'ProgramData');
  const config = path.join(appData, 'leapbtw', 'uxplay-windows', 'arguments.txt');
  await fs.mkdir(path.dirname(config), { recursive: true });
  await fs.writeFile(config, '-n uxplay-windows -nh\r\n');

  try {
    const restore = await writeTemporaryUxPlayArguments({ appData, programData, text: '-n PiperOS-Remote -nh' });
    assert.equal(await fs.readFile(config, 'utf8'), '-n PiperOS-Remote -nh\r\n');
    await restore();
    assert.equal(await fs.readFile(config, 'utf8'), '-n uxplay-windows -nh\r\n');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('does not overwrite a machine-wide UxPlay policy', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'piperos-uxplay-policy-'));
  const appData = path.join(root, 'Roaming');
  const programData = path.join(root, 'ProgramData');
  const config = path.join(programData, 'uxplay-windows', 'arguments.txt');
  await fs.mkdir(path.dirname(config), { recursive: true });
  await fs.writeFile(config, '-n ManagedReceiver -nh');

  try {
    await assert.rejects(
      writeTemporaryUxPlayArguments({ appData, programData, text: '-n PiperOS-Remote -nh' }),
      /cấu hình UxPlay cấp máy tính/
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

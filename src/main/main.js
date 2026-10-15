const { app, BrowserWindow, Menu, ipcMain, shell, screen } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { PiperRemoteClient, discoverRemote } = require('./remote-client');
const adb = require('./adb-bridge');
const { AppleReceiver } = require('./apple-receiver');
const { PcPairingService } = require('./pc-pairing-service');
const QRCode = require('qrcode');

let windowRef;
let client;
let forwarded;
let appleReceiver;
let pcPairing;
let pcPairingQuality = { width: 1920, fps: 60, stream: 1 };
let rendererServer;
let windowBoundsBeforeProjection;

function send(channel, payload) { windowRef?.webContents.send(channel, payload); }

function createWindow() {
  windowRef = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 900,
    minHeight: 620,
    backgroundColor: '#f4f6fa',
    title: 'PiperOS Tool',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  windowRef.on('enter-full-screen', () => send('window:fullscreen', true));
  windowRef.on('leave-full-screen', () => send('window:fullscreen', false));
  windowRef.loadURL(`http://localhost:${rendererServer.address().port}/`);
}

function startRendererServer() {
  const rendererRoot = path.join(__dirname, '..', 'renderer');
  const files = new Map([
    ['/', ['index.html', 'text/html; charset=utf-8']],
    ['/index.html', ['index.html', 'text/html; charset=utf-8']],
    ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
    ['/renderer.js', ['renderer.js', 'text/javascript; charset=utf-8']],
    ['/video-renderer.js', ['video-renderer.js', 'text/javascript; charset=utf-8']],
    ['/logo.png', ['logo.png', 'image/png']]
  ]);
  rendererServer = http.createServer((req, res) => {
    const entry = files.get(new URL(req.url, 'http://localhost').pathname);
    if (!entry) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': entry[1], 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' });
    fs.createReadStream(path.join(rendererRoot, entry[0])).pipe(res);
  });
  return new Promise((resolve, reject) => {
    rendererServer.once('error', reject);
    rendererServer.listen(0, 'localhost', () => resolve());
  });
}

function setupClient() {
  client = new PiperRemoteClient();
  client.on('connected', (value) => send('remote:connected', value));
  client.on('frame', (value) => send('remote:frame', value));
  client.on('audio-config', (value) => send('remote:audio-config', value));
  client.on('audio', (value) => send('remote:audio', value));
  client.on('device-info', (value) => send('remote:device-info', value));
  client.on('video-config', (value) => send('remote:video-config', value));
  client.on('video-frame', (value) => send('remote:video-frame', value));
  client.on('error', (message) => send('remote:error', message));
  client.on('closed', () => send('remote:closed'));
}

app.whenReady().then(async () => {
  // All commonly used actions live in the in-app toolbar; hide Electron's
  // placeholder File/Edit/View/Window/Help menu strip.
  Menu.setApplicationMenu(null);
  appleReceiver = new AppleReceiver(app.isPackaged ? path.join(process.resourcesPath, 'resources') : path.join(process.cwd(), 'resources'));
  setupClient();
  pcPairing = new PcPairingService(async (endpoint) => {
    try {
      await client.connect(
        endpoint,
        `PiperOS PC (${require('node:os').hostname()})`,
        pcPairingQuality.width,
        pcPairingQuality.fps,
        pcPairingQuality.stream
      );
    }
    catch (error) { send('remote:error', error.message); }
  });
  await startRendererServer();
  createWindow();
  app.on('activate', () => BrowserWindow.getAllWindows().length || createWindow());
});
app.on('window-all-closed', () => process.platform !== 'darwin' && app.quit());
app.on('before-quit', async () => {
  pcPairing?.stop();
  client?.close();
  await appleReceiver?.stop();
  rendererServer?.close();
  if (forwarded) await adb.removeForward(forwarded.serial, forwarded.port);
});

ipcMain.handle('remote:discover', (_, code) => discoverRemote(code?.trim() || null));
ipcMain.handle('remote:connect', async (_, endpoint, quality) => {
  await client.connect(endpoint, `PiperOS PC (${require('node:os').hostname()})`, quality.width, quality.fps, quality.stream);
  return true;
});
ipcMain.handle('remote:disconnect', async () => { client.close(); return true; });
ipcMain.on('remote:touch', (_, payload) => client.sendTouch(payload.action, payload.x, payload.y));
ipcMain.on('remote:key', (_, kind) => client.sendKey(kind));
ipcMain.handle('usb:devices', () => adb.listUsbDevices());
ipcMain.handle('usb:setup', () => adb.setup());
ipcMain.handle('usb:connect', async (_, serial, quality) => {
  if (forwarded) await adb.removeForward(forwarded.serial, forwarded.port);
  const tunnel = await adb.forward(serial);
  forwarded = { serial, port: tunnel.port };
  await client.connect(
    { ...tunnel, credential: 'piperos-usb-adb-v1', method: 'USB' },
    `PiperOS PC USB (${require('node:os').hostname()})`,
    quality.width,
    quality.fps,
    quality.stream
  );
  return tunnel;
});
ipcMain.handle('remote:pc-qr', async (_, quality) => {
  pcPairingQuality = {
    width: Number(quality?.width) || 1920,
    fps: Number(quality?.fps) || 60,
    stream: Number.isInteger(quality?.stream) ? quality.stream : 1
  };
  const pairing = await pcPairing.start();
  return { ...pairing, image: await QRCode.toDataURL(pairing.uri, { width: 360, margin: 2 }) };
});
ipcMain.handle('apple:start', (_, settings) => appleReceiver.start(settings));
ipcMain.handle('apple:stop', () => appleReceiver.stop());
ipcMain.handle('window:fullscreen', (_, enabled) => {
  windowRef?.setFullScreen(Boolean(enabled));
  return windowRef?.isFullScreen() ?? false;
});
ipcMain.handle('window:displays', () => screen.getAllDisplays().map((display, index) => ({
  id: display.id,
  name: display.label || `Màn hình ${index + 1}`,
  width: display.size.width,
  height: display.size.height,
  primary: display.id === screen.getPrimaryDisplay().id
})));
ipcMain.handle('window:projection', (_, enabled, displayId) => {
  if (!windowRef) return false;
  if (enabled) {
    const display = screen.getAllDisplays().find((item) => String(item.id) === String(displayId)) || screen.getPrimaryDisplay();
    if (!windowBoundsBeforeProjection) windowBoundsBeforeProjection = windowRef.getBounds();
    windowRef.setFullScreen(false);
    windowRef.setBounds(display.bounds);
    windowRef.setFullScreen(true);
  } else {
    windowRef.setFullScreen(false);
    if (windowBoundsBeforeProjection) windowRef.setBounds(windowBoundsBeforeProjection);
    windowBoundsBeforeProjection = null;
  }
  return windowRef.isFullScreen();
});
ipcMain.handle('system:open-external', (_, url) => shell.openExternal(url));

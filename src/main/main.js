const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('node:path');
const { PiperRemoteClient, discoverRemote } = require('./remote-client');
const adb = require('./adb-bridge');
const { FirebaseService } = require('./firebase-service');
const { AppleReceiver } = require('./apple-receiver');

let windowRef;
let client;
let forwarded;
let firebase;
let appleReceiver;

function send(channel, payload) { windowRef?.webContents.send(channel, payload); }

function createWindow() {
  windowRef = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1040,
    minHeight: 700,
    backgroundColor: '#f7f8fa',
    title: 'PiperOS Tool',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  windowRef.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
}

function setupClient() {
  client = new PiperRemoteClient();
  client.on('connected', (value) => send('remote:connected', value));
  client.on('frame', (value) => send('remote:frame', value));
  client.on('audio-config', (value) => send('remote:audio-config', value));
  client.on('audio', (value) => send('remote:audio', value));
  client.on('error', (message) => send('remote:error', message));
  client.on('closed', () => send('remote:closed'));
}

app.whenReady().then(() => {
  firebase = new FirebaseService(app.getPath('userData'), app.isPackaged ? path.join(process.resourcesPath, 'resources') : path.join(process.cwd(), 'resources'));
  appleReceiver = new AppleReceiver(app.isPackaged ? path.join(process.resourcesPath, 'resources') : path.join(process.cwd(), 'resources'));
  createWindow(); setupClient();
  app.on('activate', () => BrowserWindow.getAllWindows().length || createWindow());
});
app.on('window-all-closed', () => process.platform !== 'darwin' && app.quit());
app.on('before-quit', async () => {
  client?.close();
  if (forwarded) await adb.removeForward(forwarded.serial, forwarded.port);
});

ipcMain.handle('remote:discover', (_, code) => discoverRemote(code?.trim() || null));
ipcMain.handle('remote:connect', async (_, endpoint, quality) => {
  await client.connect(endpoint, `PiperOS PC (${require('node:os').hostname()})`, quality.width, quality.fps);
  return true;
});
ipcMain.handle('remote:disconnect', async () => { client.close(); return true; });
ipcMain.on('remote:touch', (_, payload) => client.sendTouch(payload.action, payload.x, payload.y));
ipcMain.on('remote:key', (_, kind) => client.sendKey(kind));
ipcMain.handle('usb:devices', () => adb.listDevices());
ipcMain.handle('usb:connect', async (_, serial, devicePort, credential, method) => {
  if (forwarded) await adb.removeForward(forwarded.serial, forwarded.port);
  const tunnel = await adb.forward(serial, devicePort);
  forwarded = { serial, port: tunnel.port };
  await client.connect({ ...tunnel, credential, method }, `PiperOS PC USB (${require('node:os').hostname()})`, 1920, 60);
  return tunnel;
});
ipcMain.handle('firebase:login', (_, email, password) => firebase.login(email, password));
ipcMain.handle('firebase:logout', () => firebase.logout());
ipcMain.handle('apple:start', (_, settings) => appleReceiver.start(settings));
ipcMain.handle('apple:stop', () => appleReceiver.stop());
ipcMain.handle('system:open-external', (_, url) => shell.openExternal(url));

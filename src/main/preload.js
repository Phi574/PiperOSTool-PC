const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('piperos', {
  discover: (code) => ipcRenderer.invoke('remote:discover', code),
  connect: (endpoint, quality) => ipcRenderer.invoke('remote:connect', endpoint, quality),
  disconnect: () => ipcRenderer.invoke('remote:disconnect'),
  touch: (payload) => ipcRenderer.send('remote:touch', payload),
  key: (kind) => ipcRenderer.send('remote:key', kind),
  usbDevices: () => ipcRenderer.invoke('usb:devices'),
  usbSetup: () => ipcRenderer.invoke('usb:setup'),
  usbConnect: (serial, quality) => ipcRenderer.invoke('usb:connect', serial, quality),
  createPcQr: (quality) => ipcRenderer.invoke('remote:pc-qr', quality),
  appleStart: (settings) => ipcRenderer.invoke('apple:start', settings),
  appleStop: () => ipcRenderer.invoke('apple:stop'),
  fullscreen: (enabled) => ipcRenderer.invoke('window:fullscreen', enabled),
  getDisplays: () => ipcRenderer.invoke('window:displays'),
  setProjectionMode: (enabled, displayId) => ipcRenderer.invoke('window:projection', enabled, displayId),
  openExternal: (url) => ipcRenderer.invoke('system:open-external', url),
  on: (channel, callback) => ipcRenderer.on(channel, (_, value) => callback(value))
});

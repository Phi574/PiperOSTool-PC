const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('piperos', {
  discover: (code) => ipcRenderer.invoke('remote:discover', code),
  connect: (endpoint, quality) => ipcRenderer.invoke('remote:connect', endpoint, quality),
  disconnect: () => ipcRenderer.invoke('remote:disconnect'),
  touch: (payload) => ipcRenderer.send('remote:touch', payload),
  key: (kind) => ipcRenderer.send('remote:key', kind),
  usbDevices: () => ipcRenderer.invoke('usb:devices'),
  usbConnect: (serial, port, credential, method) => ipcRenderer.invoke('usb:connect', serial, port, credential, method),
  firebaseLogin: (email, password) => ipcRenderer.invoke('firebase:login', email, password),
  firebaseLogout: () => ipcRenderer.invoke('firebase:logout'),
  appleStart: (settings) => ipcRenderer.invoke('apple:start', settings),
  appleStop: () => ipcRenderer.invoke('apple:stop'),
  openExternal: (url) => ipcRenderer.invoke('system:open-external', url),
  on: (channel, callback) => ipcRenderer.on(channel, (_, value) => callback(value))
});

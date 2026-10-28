const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('saldio', {
  platform: process.platform,
  version: process.env.SALDIO_VERSION || '0.1.0-beta.1',
  printReceipt: (html, width) => ipcRenderer.invoke('saldio:print', { html, width }),
});

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('picker', {
  onSources: (callback) => ipcRenderer.on('picker:sources', (_event, sources) => callback(sources)),
  choose: (id) => ipcRenderer.send('picker:choose', id),
  cancel: () => ipcRenderer.send('picker:choose', null),
});

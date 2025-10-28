const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  chooseFolder: () => ipcRenderer.invoke('choose-folder'),
  startSave: (filename) => ipcRenderer.invoke('start-save', { filename }),
  writeChunk: (id, chunk) => ipcRenderer.invoke('write-chunk', { id, chunk }),
  endSave: (id) => ipcRenderer.invoke('end-save', { id }),
  evaluateXPath: (xpath) => ipcRenderer.invoke('evaluate-xpath', { xpath })
});

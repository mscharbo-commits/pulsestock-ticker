const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('loginAPI', {
  loginSuccess: (payload) => ipcRenderer.invoke('login-success', payload),
  loginSkip:    ()        => ipcRenderer.invoke('login-skip'),
});

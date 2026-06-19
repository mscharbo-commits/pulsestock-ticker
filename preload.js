const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pulseAPI', {
  getSettings:    ()          => ipcRenderer.invoke('get-settings'),
  saveSettings:   (s)         => ipcRenderer.invoke('save-settings', s),
  getQuotes:      (tickers)   => ipcRenderer.invoke('get-quotes', tickers),
  openStock:      (ticker)    => ipcRenderer.invoke('open-stock', ticker),
  openExternal:   (url)       => ipcRenderer.invoke('open-external', url),
  quit:           ()          => ipcRenderer.invoke('quit-app'),
  setIgnoreMouse: (ignore)    => ipcRenderer.invoke('set-ignore-mouse', ignore),
  onOpenSettings: (cb)        => ipcRenderer.on('open-settings', cb),
  onUpdateTickers:(cb)        => ipcRenderer.on('update-tickers', (event, tickers) => cb(tickers)),
});

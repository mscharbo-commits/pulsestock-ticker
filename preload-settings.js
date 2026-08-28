const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('settingsAPI', {
  getPrefs:    ()       => ipcRenderer.invoke('get-ticker-prefs'),
  savePrefs:   (prefs)  => ipcRenderer.invoke('save-ticker-prefs', prefs),
  close:       ()       => ipcRenderer.invoke('close-settings-window'),
});

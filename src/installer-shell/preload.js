const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('installerShellAPI', {
    cancel: () => ipcRenderer.invoke('installer-shell:cancel'),
    getBootstrap: () => ipcRenderer.invoke('installer-shell:get-bootstrap'),
    pickInstallDir: (currentPath) => ipcRenderer.invoke('installer-shell:pick-install-dir', currentPath),
    submit: (payload) => ipcRenderer.invoke('installer-shell:submit', payload)
});

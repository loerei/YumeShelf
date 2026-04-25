const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('electronAPI', {
    checkConfig: () => ipcRenderer.invoke('check-config'),
    setupLibrary: (type) => ipcRenderer.invoke('setup-library', type),
    getGames: () => ipcRenderer.invoke('get-games'),
    launchYume: (data) => ipcRenderer.send('launch-yume', data),
    renameGame: (data) => ipcRenderer.invoke('rename-game', data),
    revealGame: (path) => ipcRenderer.send('reveal-game', path),
    deleteGame: (path) => ipcRenderer.invoke('delete-game', path),
    toggleFavorite: (folderName) => ipcRenderer.invoke('toggle-favorite', folderName),
    openFolder: () => ipcRenderer.send('open-folder'),
    getDefaultPath: () => ipcRenderer.invoke('get-default-path'),
    getIcon: (path) => ipcRenderer.invoke('get-icon', path)
});


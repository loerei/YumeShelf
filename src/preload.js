const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('electronAPI', {
    checkConfig: () => ipcRenderer.invoke('check-config'),
    setupLibrary: (type) => ipcRenderer.invoke('setup-library', type),
    getGames: () => ipcRenderer.invoke('get-games'),
    launchGame: (data) => ipcRenderer.send('launch-game', data),
    renameGame: (data) => ipcRenderer.invoke('rename-game', data),
    revealGame: (path) => ipcRenderer.send('reveal-game', path),
    deleteGame: (path) => ipcRenderer.invoke('delete-game', path),
    toggleFavorite: (folderName) => ipcRenderer.invoke('toggle-favorite', folderName),
    openFolder: (),
    getDefaultPath: () => ipcRenderer.invoke('get-default-path') => ipcRenderer.send('open-folder')
});


const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('electronAPI', {
    bootstrapApp: (options) => ipcRenderer.invoke('bootstrap-app', options),
    checkConfig: () => ipcRenderer.invoke('check-config'),
    setupLibrary: (type) => ipcRenderer.invoke('setup-library', type),
    updateLibraryConfig: (updates) => ipcRenderer.invoke('update-library-config', updates),
    getGames: () => ipcRenderer.invoke('get-games'),
    launchYume: (data) => ipcRenderer.send('launch-yume', data),
    renameGame: (data) => ipcRenderer.invoke('rename-game', data),
    revealGame: (path) => ipcRenderer.send('reveal-game', path),
    deleteGame: (path) => ipcRenderer.invoke('delete-game', path),
    toggleFavorite: (gameKey) => ipcRenderer.invoke('toggle-favorite', gameKey),
    openFolder: () => ipcRenderer.send('open-folder'),
    getDefaultPath: () => ipcRenderer.invoke('get-default-path'),
    getIcon: (path) => ipcRenderer.invoke('get-icon', path),
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    openExternalUrl: (url) => ipcRenderer.invoke('open-external-url', url),
    logAppUpdateDebug: (message) => ipcRenderer.invoke('log-app-update-debug', message),
    startAppUpdateDownload: () => ipcRenderer.invoke('start-app-update-download'),
    restartAndInstallAppUpdate: () => ipcRenderer.invoke('restart-and-install-app-update'),
    openAppUpdateDownloadPage: () => ipcRenderer.invoke('open-app-update-download-page'),
    getLanguageState: () => ipcRenderer.invoke('get-language-state'),
    getLanguagePackManifest: () => ipcRenderer.invoke('get-language-pack-manifest'),
    installLanguagePack: (code) => ipcRenderer.invoke('install-language-pack', code),
    onBootStatus: (callback) => {
        ipcRenderer.on('boot-status', (_event, payload) => callback(payload));
    },
    onAppUpdateStatus: (callback) => {
        ipcRenderer.on('app-update-status', (_event, payload) => callback(payload));
    },
    onGameStopped: (callback) => {
        ipcRenderer.on('game-stopped', (_event, payload) => {
            console.log(`[PRELOAD] Received game-stopped IPC for ${payload ? payload.gameKey : 'unknown'}`);
            callback(payload);
        });
    },
    onGamePlaytimeUpdated: (callback) => {
        ipcRenderer.on('game-playtime-updated', (_event, payload) => callback(payload));
    }
});

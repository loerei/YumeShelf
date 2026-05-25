import { contextBridge, ipcRenderer } from 'electron';
import type { ElectronAPI } from './shared/types/ipc';

const api: ElectronAPI = {
    bootstrapApp: (options: any) => ipcRenderer.invoke('bootstrap-app', options),
    checkConfig: () => ipcRenderer.invoke('check-config'),
    setupLibrary: (type: string) => ipcRenderer.invoke('setup-library', type),
    updateLibraryConfig: (updates: any) => ipcRenderer.invoke('update-library-config', updates),
    getGames: () => ipcRenderer.invoke('get-games'),
    getCategoryTree: () => ipcRenderer.invoke('get-category-tree'),
    createCategory: (payload: any) => ipcRenderer.invoke('create-category', payload),
    renameCategory: (payload: any) => ipcRenderer.invoke('rename-category', payload),
    deleteCategory: (categoryId: string) => ipcRenderer.invoke('delete-category', categoryId),
    assignGameCategories: (payload: any) => ipcRenderer.invoke('assign-game-categories', payload),
    removeGameCategory: (payload: any) => ipcRenderer.invoke('remove-game-category', payload),
    launchYume: (data: any) => ipcRenderer.send('launch-yume', data),
    renameGame: (data: any) => ipcRenderer.invoke('rename-game', data),
    revealGame: (path: string) => ipcRenderer.send('reveal-game', path),
    openPath: (path: string) => ipcRenderer.send('open-path', path),
    deleteGame: (path: string) => ipcRenderer.invoke('delete-game', path),
    getSaveFolder: (gameKey: string) => ipcRenderer.invoke('get-save-folder', gameKey),
    setSaveFolderOverride: (data: any) => ipcRenderer.invoke('set-save-folder-override', data),
    toggleFavorite: (gameKey: string) => ipcRenderer.invoke('toggle-favorite', gameKey),
    toggleRunInBackground: (gameKey: string) => ipcRenderer.invoke('toggle-run-in-background', gameKey),
    toggleAutoTranslate: (gameKey: string) => ipcRenderer.invoke('toggle-auto-translate', gameKey),
    openFolder: () => ipcRenderer.send('open-folder'),
    getDefaultPath: () => ipcRenderer.invoke('get-default-path'),
    getIcon: (path: string) => ipcRenderer.invoke('get-icon', path),
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    openExternalUrl: (url: string) => ipcRenderer.invoke('open-external-url', url),
    logAppUpdateDebug: (message: string) => ipcRenderer.invoke('log-app-update-debug', message),
    startAppUpdateDownload: () => ipcRenderer.invoke('start-app-update-download'),
    restartAndInstallAppUpdate: () => ipcRenderer.invoke('restart-and-install-app-update'),
    scheduleAppUpdateNextLaunch: () => ipcRenderer.invoke('schedule-app-update-next-launch'),
    beginDeferredAppUpdateInstall: () => ipcRenderer.invoke('begin-deferred-app-update-install'),
    openAppUpdateDownloadPage: () => ipcRenderer.invoke('open-app-update-download-page'),
    getLanguageState: () => ipcRenderer.invoke('get-language-state'),
    getLanguagePackManifest: () => ipcRenderer.invoke('get-language-pack-manifest'),
    installLanguagePack: (code: string) => ipcRenderer.invoke('install-language-pack', code),
    onBootStatus: (callback: (payload: any) => void) => {
        ipcRenderer.on('boot-status', (_event, payload) => callback(payload));
    },
    onAppUpdateStatus: (callback: (payload: any) => void) => {
        ipcRenderer.on('app-update-status', (_event, payload) => callback(payload));
    },
    onGameStopped: (callback: (payload: any) => void) => {
        ipcRenderer.on('game-stopped', (_event, payload) => {
            console.log(`[PRELOAD] Received game-stopped IPC for ${payload ? payload.gameKey : 'unknown'}`);
            callback(payload);
        });
    },
    onGamePlaytimeUpdated: (callback: (payload: any) => void) => {
        ipcRenderer.on('game-playtime-updated', (_event, payload) => callback(payload));
    },
    onTranslationStatus: (callback: (payload: any) => void) => {
        ipcRenderer.on('translation-status', (_event, payload) => callback(payload));
    },
    // Save Editor
    listSaveFiles: (gameKey: string) => ipcRenderer.invoke('save-editor:list-files', gameKey),
    loadSaveData: (data: any) => ipcRenderer.invoke('save-editor:load-data', data),
    writeSaveData: (data: any) => ipcRenderer.invoke('save-editor:write-data', data),
    updateMapping: (data: any) => ipcRenderer.invoke('save-editor:update-mapping', data),
    openSaveEditorWindow: (gameKey: string) => ipcRenderer.send('open-save-editor-window', gameKey),
    loadTranslations: (lang: string) => ipcRenderer.invoke('save-editor:load-translations', lang),
    saveTranslations: (lang: string, translations: any) => ipcRenderer.invoke('save-editor:save-translations', { lang, translations }),
    // System Startup & Tray Settings
    isDev: () => ipcRenderer.invoke('is-dev'),
    setAutoLaunch: (enabled: boolean) => ipcRenderer.invoke('set-auto-launch', enabled),
    getAutoLaunch: () => ipcRenderer.invoke('get-auto-launch'),
    setMinimizeToTray: (enabled: boolean) => ipcRenderer.send('set-minimize-to-tray', enabled)
};

contextBridge.exposeInMainWorld('electronAPI', api);

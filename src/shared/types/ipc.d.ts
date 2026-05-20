export interface ElectronAPI {
    // App Bootstrap & Configuration
    bootstrapApp: (options: any) => Promise<any>;
    checkConfig: () => Promise<any>;
    setupLibrary: (type: string) => Promise<any>;
    updateLibraryConfig: (updates: any) => Promise<any>;
    
    // Library & Games
    getGames: () => Promise<any>;
    getCategoryTree: () => Promise<any>;
    createCategory: (payload: any) => Promise<any>;
    renameCategory: (payload: any) => Promise<any>;
    deleteCategory: (categoryId: string) => Promise<any>;
    assignGameCategories: (payload: any) => Promise<any>;
    removeGameCategory: (payload: any) => Promise<any>;
    
    // Game Actions
    launchYume: (data: any) => void;
    renameGame: (data: any) => Promise<any>;
    revealGame: (path: string) => void;
    openPath: (path: string) => void;
    deleteGame: (path: string) => Promise<any>;
    
    // Settings & Utils
    getSaveFolder: (gameKey: string) => Promise<any>;
    setSaveFolderOverride: (data: any) => Promise<any>;
    toggleFavorite: (gameKey: string) => Promise<any>;
    toggleRunInBackground: (gameKey: string) => Promise<any>;
    openFolder: () => void;
    getDefaultPath: () => Promise<any>;
    getIcon: (path: string) => Promise<any>;
    getAppVersion: () => Promise<any>;
    openExternalUrl: (url: string) => Promise<any>;
    
    // App Updates
    logAppUpdateDebug: (message: string) => Promise<any>;
    startAppUpdateDownload: () => Promise<any>;
    restartAndInstallAppUpdate: () => Promise<any>;
    scheduleAppUpdateNextLaunch: () => Promise<any>;
    beginDeferredAppUpdateInstall: () => Promise<any>;
    openAppUpdateDownloadPage: () => Promise<any>;
    
    // Internationalization (i18n)
    getLanguageState: () => Promise<any>;
    getLanguagePackManifest: () => Promise<any>;
    installLanguagePack: (code: string) => Promise<any>;
    
    // Save Editor
    listSaveFiles: (gameKey: string) => Promise<string[]>;
    loadSaveData: (data: { gameKey: string, fileName: string }) => Promise<{ data: any, metadata: any }>;
    writeSaveData: (data: any) => Promise<any>;
    updateMapping: (data: any) => Promise<any>;
    openSaveEditorWindow: (gameKey: string) => void;
    loadTranslations: (lang: string) => Promise<any>;
    saveTranslations: (lang: string, translations: any) => Promise<any>;
    
    // System Startup & Tray Settings
    isDev: () => Promise<boolean>;
    setAutoLaunch: (enabled: boolean) => Promise<any>;
    getAutoLaunch: () => Promise<any>;
    setMinimizeToTray: (enabled: boolean) => void;
    
    // Event Listeners (Callbacks)
    onBootStatus: (callback: (payload: any) => void) => void;
    onAppUpdateStatus: (callback: (payload: any) => void) => void;
    onGameStopped: (callback: (payload: any) => void) => void;
    onGamePlaytimeUpdated: (callback: (payload: any) => void) => void;
}

declare global {
    interface Window {
        electronAPI: ElectronAPI;
    }
}

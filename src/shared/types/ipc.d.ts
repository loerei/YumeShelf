export interface IpcInvokes {
    // App Bootstrap & Configuration
    'bootstrap-app': { args: [options?: any]; return: any };
    'check-config': { args: []; return: any };
    'setup-library': { args: [type: 'default' | 'custom']; return: any };
    'update-library-config': { args: [updates: any]; return: any };

    // Library & Games
    'get-games': { args: []; return: any[] };
    'get-category-tree': { args: []; return: any };
    'create-category': { args: [payload: any]; return: any };
    'rename-category': { args: [payload: { categoryId: string; name: string }]; return: any };
    'delete-category': { args: [categoryId: string]; return: any };
    'assign-game-categories': { args: [payload: { gameId: string; categoryIds: string[] }]; return: any };
    'remove-game-category': { args: [payload: { gameId: string; categoryId: string }]; return: any };

    // Game Actions
    'rename-game': { args: [payload: { gameKey: string; newName: string }]; return: any };
    'delete-game': { args: [path: string]; return: any };

    // Settings & Utils
    'get-save-folder': { args: [gameKey: string]; return: { path: string | null; engine: string | null; confidence: string } };
    'set-save-folder-override': { args: [payload: { gameKey: string; folderPath: string }]; return: any };
    'toggle-favorite': { args: [gameKey: string]; return: any };
    'toggle-run-in-background': { args: [gameKey: string]; return: any };
    'toggle-auto-translate': { args: [gameKey: string]; return: any };
    
    // Translation
    'translation:check-support': { args: [gameKey: string]; return: { supported: boolean; engine: string | null } };
    'translation:start-sync': { args: [payload: { gameKey: string; targetLang: string }]; return: { success: boolean; error?: string } };
    'translation:cancel-sync': { args: [gameKey: string]; return: { success: boolean } };
    'translation:move-queue': { args: [payload: { gameKey: string; direction: 'up' | 'down' }]; return: { success: boolean } };
    
    'get-default-path': { args: []; return: string };
    'get-icon': { args: [path: string]; return: any };
    'get-app-version': { args: []; return: string };
    'open-external-url': { args: [url: string]; return: { ok: boolean; reason?: string } };

    // App Updates
    'log-app-update-debug': { args: [message: string]; return: { ok: boolean } };
    'start-app-update-download': { args: []; return: any };
    'restart-and-install-app-update': { args: []; return: any };
    'schedule-app-update-next-launch': { args: []; return: any };
    'begin-deferred-app-update-install': { args: []; return: any };
    'open-app-update-download-page': { args: []; return: any };

    // Internationalization (i18n)
    'get-language-state': { args: []; return: any };
    'get-language-pack-manifest': { args: []; return: any };
    'install-language-pack': { args: [code: string]; return: any };

    // Save Editor
    'save-editor:list-files': { args: [gameKey: string]; return: string[] };
    'save-editor:load-data': { args: [payload: { gameKey: string; fileName: string }]; return: { data: any; metadata: any } };
    'save-editor:write-data': { args: [payload: { gameKey: string; fileName: string; data: any }]; return: any };
    'save-editor:update-mapping': { args: [payload: { gameKey: string; name: string; offset: number; dataType: string }]; return: any };
    'save-editor:load-translations': { args: [lang: string]; return: any };
    'save-editor:save-translations': { args: [payload: { lang: string; translations: any }]; return: any };

    // System Startup & Tray Settings
    'is-dev': { args: []; return: boolean };
    'set-auto-launch': { args: [enabled: any]; return: any };
    'get-auto-launch': { args: []; return: any };

    // Library paths management
    'library:add-path': { args: []; return: any };
    'library:remove-path': { args: [targetPath: string]; return: any };
    'library:change-path': { args: [oldPath: string]; return: any };
}

export interface IpcSends {
    'launch-yume': [data: { gameKey: string; exePath: string; runInBackground: boolean }];
    'reveal-game': [path: string];
    'open-path': [path: string];
    'open-folder': [];
    'open-save-editor-window': [gameKey: string];
    'set-minimize-to-tray': [enabled: boolean];
}

export interface IpcEvents {
    'boot-status': [payload: any];
    'app-update-status': [payload: any];
    'game-stopped': [payload: { gameKey: string }];
    'game-playtime-updated': [payload: any];
    'translation-status': [payload: any];
}

export interface ElectronAPI {
    // Type-Safe Generic Bridge API
    invoke<K extends keyof IpcInvokes>(
        channel: K,
        ...args: IpcInvokes[K]['args']
    ): Promise<IpcInvokes[K]['return']>;

    send<K extends keyof IpcSends>(
        channel: K,
        ...args: IpcSends[K]
    ): void;

    on<K extends keyof IpcEvents>(
        channel: K,
        callback: (...args: IpcEvents[K]) => void
    ): () => void;

    // Legacy individual methods
    bootstrapApp: (options: any) => Promise<any>;
    checkConfig: () => Promise<any>;
    setupLibrary: (type: string) => Promise<any>;
    updateLibraryConfig: (updates: any) => Promise<any>;
    addLibraryPath: () => Promise<any>;
    removeLibraryPath: (path: string) => Promise<any>;
    changeLibraryPath: (oldPath: string) => Promise<any>;
    
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
    toggleAutoTranslate: (gameKey: string) => Promise<any>;
    checkTranslationSupport: (gameKey: string) => Promise<any>;
    startTranslationSync: (data: { gameKey: string, targetLang: string }) => Promise<any>;
    cancelTranslationSync: (gameKey: string) => Promise<any>;
    moveTranslationQueue: (data: { gameKey: string, direction: 'up' | 'down' }) => Promise<any>;
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
    onTranslationStatus: (callback: (payload: any) => void) => void;
}

declare global {
    interface Window {
        electronAPI: ElectronAPI;
    }
}

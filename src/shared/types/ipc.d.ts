import type { NormalizedSaveDto, SaveCodecOptions, SaveSchemaOptions, SaveUpdatesPayload } from '@yumeshelf/engine/types';
import type { GameEntry, LibraryConfig } from './game.js';

export interface SaveFolderInfo {
    path: string | null;
    engine: string | null;
    confidence: 'high' | 'medium' | 'low' | 'none';
    source?: 'override' | 'deterministic' | 'heuristic' | 'appdata' | 'none';
    overrideMissing?: boolean;
}

export interface LanguagePackMeta {
    code: string;
    bcp47: string | null;
    englishName: string;
    nativeName: string;
    packVersion: string;
    minAppVersion?: string | null;
    reviewedForAppVersion?: string | null;
    aliases?: string[];
    keywords?: string[];
    source: 'built-in' | 'downloaded' | 'remote';
}

export interface LanguageState {
    repoUrl: string;
    manifestUrl: string;
    appVersion: string;
    builtIn: LanguagePackMeta[];
    installed: LanguagePackMeta[];
    locales: Record<string, unknown>;
}

export interface ManifestPack {
    code: string;
    bcp47: string | null;
    englishName: string;
    nativeName: string;
    packVersion: string;
    minAppVersion?: string | null;
    reviewedForAppVersion?: string | null;
    aliases?: string[];
    keywords?: string[];
    downloadUrl?: string;
    sha256?: string;
}

export interface LanguagePackManifestResponse {
    ok: boolean;
    offline?: boolean;
    source?: string;
    error?: string;
    repoUrl?: string;
    packs: ManifestPack[];
}

export interface InstallLanguagePackResult {
    ok: boolean;
    installedCode?: string;
    error?: string;
    reason?: string;
    state?: LanguageState | null;
    offline?: boolean;
}

export type UpdateLibraryConfigRequest = Omit<Partial<LibraryConfig>, 'libraryPath'>;
export type UpdateLibraryConfigResponse = LibraryConfig;

export interface ElectronAPI {
    // App Bootstrap & Configuration
    bootstrapApp: (options: any) => Promise<any>;
    checkConfig: () => Promise<any>;
    setupLibrary: (type: string) => Promise<any>;
    updateLibraryConfig: (updates: UpdateLibraryConfigRequest) => Promise<UpdateLibraryConfigResponse>;
    setFolderAlias: (folderPath: string, alias: string) => Promise<{ ok: boolean; config?: LibraryConfig; error?: string }>;
    addLibraryPath: () => Promise<any>;
    removeLibraryPath: (path: string) => Promise<any>;
    changeLibraryPath: (oldPath: string) => Promise<any>;
    
    // Library & Games
    getGames: () => Promise<GameEntry[]>;
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
    addManualGame(data?: { folderPath?: string } | string): Promise<{ ok: boolean; game?: GameEntry; canceled?: boolean; error?: string }>;
    
    // Settings & Utils
    getSaveFolder: (gameKey: string) => Promise<SaveFolderInfo>;
    openSaveFolder: (gameKey: string) => Promise<{ ok: boolean; path?: string; error?: string }>;
    selectSaveFolder: () => Promise<{ canceled: boolean; folderPath: string | null }>;
    setSaveFolderOverride: (params: { gameKey: string; folderPath: string | null }) =>
        Promise<{ ok: boolean; saveFolderOverride?: string | null; error?: string }>;
    toggleFavorite: (gameKey: string, targetFavorite?: boolean) => Promise<boolean>;
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
    getLanguageState: () => Promise<LanguageState>;
    getLanguagePackManifest: () => Promise<LanguagePackManifestResponse>;
    installLanguagePack: (code: string) => Promise<InstallLanguagePackResult>;
    
    // Save Editor
    listSaveFiles: (gameKey: string) => Promise<string[]>;
    loadSaveData: (data: { gameKey: string; fileName: string; earlyExit?: boolean; stalenessTimeoutMs?: number; options?: SaveSchemaOptions }) => Promise<NormalizedSaveDto>;
    cancelLoadSaveData: (params: { gameKey: string; fileName: string }) => Promise<{ cancelled: boolean }>;
    onSaveLoadProgress: (callback: (payload: { gameKey: string, fileName: string, percent: number, current: number, total: number, unit: string, pos?: number, totalBytes?: number }) => void) => () => void;
    writeSaveData: (data: { gameKey: string; fileName: string; updates: SaveUpdatesPayload; options?: SaveCodecOptions & { isUpdates?: boolean; createBackup?: boolean; preserveBackup?: boolean; maxBackups?: number; maxBufferSizeBytes?: number; allowLargeSaves?: boolean } }) => Promise<{ ok: boolean; error?: string; code?: string }>;
    renameSaveFile: (data: { gameKey: string, oldFileName: string, newFileName: string, overwrite?: boolean }) => Promise<{ ok: boolean, error?: string, message?: string, renamed?: boolean, fileName?: string }>;
    deleteSaveFile: (data: { gameKey: string, fileName: string }) => Promise<{ ok: boolean }>;
    openSaveEditorWindow: (gameKey: string) => Promise<void>;
    translateBatch: (texts: string[], targetLang: string, options?: { timeoutMs?: number; maxBatchSize?: number; jobId?: string }) => Promise<Record<string, string>>;
    cancelTranslateBatch: (params: { jobId: string }) => Promise<{ cancelled: boolean }>;
    loadTranslations: (lang: string) => Promise<Record<string, string>>;
    saveTranslations: (lang: string, translations: Record<string, string>) => Promise<{ ok: boolean; error?: string }>;
    
    // System Startup & Tray Settings
    isDev: () => Promise<boolean>;
    setAutoLaunch: (enabled: boolean) => Promise<any>;
    getAutoLaunch: () => Promise<any>;
    setMinimizeToTray: (enabled: boolean) => void;
    
    // Event Listeners (Callbacks)
    onBootStatus: (callback: (payload: any) => void) => () => void;
    onAppUpdateStatus: (callback: (payload: any) => void) => () => void;
    onGameStopped: (callback: (payload: any) => void) => () => void;
    onGamePlaytimeUpdated: (callback: (payload: any) => void) => () => void;
    onTranslationStatus: (callback: (payload: any) => void) => () => void;
}

declare global {
    interface Window {
        electronAPI: ElectronAPI;
    }
}

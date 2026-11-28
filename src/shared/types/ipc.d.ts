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

export interface IpcCategoryNode {
    id: string;
    name: string;
    parentId?: string | null;
    children?: IpcCategoryNode[];
}

export interface IpcIconPayload {
    dataUrl?: string | null;
    iconFit?: 'cover' | 'contain';
    width?: number;
    height?: number;
    debug?: unknown;
}

export interface IpcBootstrapResult {
    config?: LibraryConfig | null;
    libraryConfig?: LibraryConfig | null;
    games?: readonly GameEntry[];
    categoryTree?: readonly IpcCategoryNode[];
    appVersion?: string;
    languageState?: LanguageState | null;
    bootChecks?: Record<string, unknown>;
    postUpdateNotice?: {
        readonly version?: string;
        readonly fromVersion?: string;
        readonly installed?: boolean;
    } | null;
    deferredAppUpdateInstall?: {
        readonly pending: boolean;
        readonly update?: unknown;
        readonly statusText?: string;
    } | null;
}

export interface IpcOkResult {
    ok: boolean;
    error?: string;
    reason?: string;
}

export interface IpcCategoryMutationResult extends IpcOkResult {
    tree?: IpcCategoryNode[];
    categoryTree?: IpcCategoryNode[];
}

export interface IpcLibraryPathMutationResult {
    ok?: boolean;
    canceled?: boolean;
    config?: LibraryConfig;
    games?: GameEntry[];
    error?: string;
    reason?: string;
}

export interface IpcTranslationSupportResult {
    supported: boolean;
    reason?: string;
    engine?: string;
}

export interface IpcTranslationSyncResult {
    ok: boolean;
    error?: string;
    reason?: string;
}

export interface SetAutoLaunchResult {
    success: boolean;
    devMode?: boolean;
    state?: 'off' | 'on' | 'minimized';
    error?: string;
}

export interface IpcAppUpdateResult {
    ok?: boolean;
    error?: string;
    reason?: string;
    [key: string]: unknown;
}

export interface BootStatusPayload {
    status?: string;
    step?: string;
    progress?: number;
    message?: string;
    [key: string]: unknown;
}

export interface AppUpdateStatusPayload {
    status?: string;
    version?: string;
    percent?: number;
    message?: string;
    [key: string]: unknown;
}

export interface GameStoppedPayload {
    gameKey?: string;
    exitCode?: number | null;
    elapsedMs?: number;
}

export interface GamePlaytimeUpdatedPayload {
    gameKey?: string;
    accruedMs?: number;
    playtime?: number;
}

export interface TranslationStatusPayload {
    gameKey?: string;
    status?: string;
    progress?: number;
    message?: string;
    [key: string]: unknown;
}

export interface ElectronAPI {
    // App Bootstrap & Configuration
    bootstrapApp: (options?: Record<string, unknown>) => Promise<IpcBootstrapResult>;
    checkConfig: () => Promise<LibraryConfig | null>;
    setupLibrary: (type: 'default' | 'custom') => Promise<LibraryConfig | boolean | null>;
    updateLibraryConfig: (updates: UpdateLibraryConfigRequest) => Promise<UpdateLibraryConfigResponse>;
    setFolderAlias: (folderPath: string, alias: string) => Promise<{ ok: boolean; config?: LibraryConfig; error?: string }>;
    addLibraryPath: () => Promise<LibraryConfig | null>;
    removeLibraryPath: (path: string) => Promise<LibraryConfig | null>;
    changeLibraryPath: (oldPath: string) => Promise<LibraryConfig | null>;
    
    // Library & Games
    getGames: () => Promise<GameEntry[]>;
    getCategoryTree: () => Promise<IpcCategoryNode[]>;
    createCategory: (payload: { name: string; parentId?: string | null }) => Promise<IpcCategoryMutationResult>;
    renameCategory: (payload: { categoryId: string; name: string }) => Promise<IpcCategoryMutationResult>;
    deleteCategory: (categoryId: string) => Promise<IpcCategoryMutationResult>;
    assignGameCategories: (payload: { gameId: string; categoryIds: string[] }) => Promise<IpcCategoryMutationResult>;
    removeGameCategory: (payload: { gameId: string; categoryId: string }) => Promise<IpcCategoryMutationResult>;
    
    // Game Actions
    launchYume: (data: { gameKey: string; exePath?: string; runInBackground?: boolean }) => void;
    renameGame: (data: { gameKey: string; newName: string }) => Promise<IpcOkResult>;
    revealGame: (path: string) => void;
    openPath: (path: string) => void;
    deleteGame: (path: string) => Promise<void | { ok: boolean; error?: string; reason?: string }>;
    addManualGame(data?: { folderPath?: string } | string): Promise<{ ok: boolean; game?: GameEntry; canceled?: boolean; error?: string }>;
    
    // Settings & Utils
    getSaveFolder: (gameKey: string) => Promise<SaveFolderInfo>;
    openSaveFolder: (gameKey: string) => Promise<{ ok: boolean; path?: string; error?: string }>;
    selectSaveFolder: () => Promise<{ canceled: boolean; folderPath: string | null }>;
    setSaveFolderOverride: (params: { gameKey: string; folderPath: string | null }) =>
        Promise<{ ok: boolean; saveFolderOverride?: string | null; error?: string }>;
    toggleFavorite: (gameKey: string, targetFavorite?: boolean) => Promise<boolean>;
    toggleRunInBackground: (gameKey: string) => Promise<boolean>;
    toggleAutoTranslate: (gameKey: string) => Promise<boolean>;
    checkTranslationSupport: (gameKey: string) => Promise<IpcTranslationSupportResult>;
    startTranslationSync: (data: { gameKey: string; targetLang: string }) => Promise<IpcTranslationSyncResult | void>;
    cancelTranslationSync: (gameKey: string) => Promise<IpcTranslationSyncResult | void>;
    moveTranslationQueue: (data: { gameKey: string; direction: 'up' | 'down' }) => Promise<IpcTranslationSyncResult | void>;
    openFolder: () => void;
    getDefaultPath: () => Promise<string>;
    getIcon: (path: string) => Promise<IpcIconPayload | string | null>;
    getAppVersion: () => Promise<string>;
    openExternalUrl: (url: string) => Promise<{ ok: boolean; reason?: string } | void>;
    
    // App Updates
    logAppUpdateDebug: (message: string) => Promise<IpcOkResult | void>;
    startAppUpdateDownload: () => Promise<IpcAppUpdateResult | void>;
    restartAndInstallAppUpdate: () => Promise<IpcAppUpdateResult | void>;
    scheduleAppUpdateNextLaunch: () => Promise<IpcAppUpdateResult | void>;
    beginDeferredAppUpdateInstall: () => Promise<IpcAppUpdateResult | void>;
    openAppUpdateDownloadPage: () => Promise<IpcAppUpdateResult | void>;
    
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
    setAutoLaunch: (enabled: boolean | 'off' | 'on' | 'minimized') => Promise<SetAutoLaunchResult | boolean>;
    getAutoLaunch: () => Promise<'off' | 'on' | 'minimized' | boolean>;
    setMinimizeToTray: (enabled: boolean) => void;
    
    // Event Listeners (Callbacks)
    onBootStatus: (callback: (payload: BootStatusPayload) => void) => () => void;
    onAppUpdateStatus: (callback: (payload: AppUpdateStatusPayload) => void) => () => void;
    onGameStopped: (callback: (payload: GameStoppedPayload) => void) => () => void;
    onGamePlaytimeUpdated: (callback: (payload: GamePlaytimeUpdatedPayload) => void) => () => void;
    onTranslationStatus: (callback: (payload: TranslationStatusPayload) => void) => () => void;
}

declare global {
    interface Window {
        electronAPI: ElectronAPI;
    }
}

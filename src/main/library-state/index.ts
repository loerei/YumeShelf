import * as scanner from './scanner';
import * as continuity from './continuity';
import * as config from './config';
import * as loader from './loader';
import * as actions from './actions';

export const {
    MAX_LIBRARY_MAX_DEPTH,
    MIN_LIBRARY_MAX_DEPTH,
    DEFAULT_LIBRARY_MAX_DEPTH,
    clampLibraryMaxDepth
} = scanner;

export const {
    buildLogicalGameId
} = continuity;

export const {
    resolveLibraryConfig,
    setupLibrary,
    updateLibraryConfig,
    resolveLibraryFolderToOpen
} = config;

export const {
    loadGamesForConfig
} = loader;

export const {
    renameGame,
    toggleFavorite,
    toggleRunInBackground,
    toggleAutoTranslate,
    addPlaytime,
    finalizeTrackedSession,
    getGameRecord,
    setSaveFolderOverride
} = actions;

/**
 * Shared context interface for library state operations
 */
export interface LibraryContext {
    categoryState: any;
    defaultGamesDir: string;
    dialog: any;
    fs: any;
    fsSync: any;
    loadDB: () => Promise<any>;
    saveDB: (db: any) => Promise<void>;
}

export function createLibraryState(options: LibraryContext) {
    const context: LibraryContext = {
        categoryState: options.categoryState,
        defaultGamesDir: options.defaultGamesDir,
        dialog: options.dialog,
        fs: options.fs,
        fsSync: options.fsSync,
        loadDB: options.loadDB,
        saveDB: options.saveDB
    };

    return {
        addPlaytime: (gameKey: string, durationMs: number) => addPlaytime(context, gameKey, durationMs),
        finalizeTrackedSession: (gameKey: string, durationMs: number, endedAt: number, exePath?: string) => finalizeTrackedSession(context, gameKey, durationMs, endedAt, exePath),
        getGameRecord: (gameKey: string) => getGameRecord(context, gameKey),
        loadGamesForConfig: (config: any) => loadGamesForConfig(context, config),
        renameGame: (gameKey: string, newName: string) => renameGame(context, gameKey, newName),
        resolveLibraryConfig: () => resolveLibraryConfig(context),
        resolveLibraryFolderToOpen: () => resolveLibraryFolderToOpen(context),
        setSaveFolderOverride: (gameKey: string, folderPath: string) => setSaveFolderOverride(context, gameKey, folderPath),
        setupLibrary: (type: 'default' | 'custom') => setupLibrary(context, type),
        toggleFavorite: (gameKey: string) => toggleFavorite(context, gameKey),
        toggleRunInBackground: (gameKey: string) => toggleRunInBackground(context, gameKey),
        toggleAutoTranslate: (gameKey: string) => toggleAutoTranslate(context, gameKey),
        updateLibraryConfig: (updates: any) => updateLibraryConfig(context, updates)
    };
}

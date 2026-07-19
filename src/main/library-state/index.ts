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
    addLibraryPath,
    removeLibraryPath,
    changeLibraryPath,
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
    dbFilePath: string;
}

export function createLibraryState(options: LibraryContext) {
    const loadDB = typeof (options as any).loadDB === 'function'
        ? (options as any).loadDB
        : async () => {
            try {
                return JSON.parse(await options.fs.readFile(options.dbFilePath, 'utf8'));
            } catch {
                return {};
            }
        };

    const saveDB = typeof (options as any).saveDB === 'function'
        ? (options as any).saveDB
        : async (db: any) => {
            await options.fs.writeFile(options.dbFilePath, JSON.stringify(db, null, 2));
        };

    const context = {
        categoryState: options.categoryState,
        defaultGamesDir: options.defaultGamesDir,
        dialog: options.dialog,
        fs: options.fs,
        fsSync: options.fsSync,
        loadDB,
        saveDB
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
        addLibraryPath: () => addLibraryPath(context),
        removeLibraryPath: (path: string) => removeLibraryPath(context, path),
        changeLibraryPath: (oldPath: string) => changeLibraryPath(context, oldPath),
        toggleFavorite: (gameKey: string) => toggleFavorite(context, gameKey),
        toggleRunInBackground: (gameKey: string) => toggleRunInBackground(context, gameKey),
        toggleAutoTranslate: (gameKey: string) => toggleAutoTranslate(context, gameKey),
        updateLibraryConfig: (updates: any) => updateLibraryConfig(context, updates),
        getDbFilePath: () => options.dbFilePath
    };
}

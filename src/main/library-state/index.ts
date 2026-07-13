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
    loadDB: () => Promise<any>;
    saveDB: (db: any) => Promise<void>;
}

class Mutex {
    private queue: Promise<any> = Promise.resolve();

    async run<T>(fn: () => Promise<T>): Promise<T> {
        const next = this.queue.then(fn);
        this.queue = next.catch(() => {});
        return next;
    }
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

    const mutex = new Mutex();

    return {
        addPlaytime: (gameKey: string, durationMs: number) => 
            mutex.run(() => addPlaytime(context, gameKey, durationMs)),
        finalizeTrackedSession: (gameKey: string, durationMs: number, endedAt: number, exePath?: string) => 
            mutex.run(() => finalizeTrackedSession(context, gameKey, durationMs, endedAt, exePath)),
        getGameRecord: (gameKey: string) => getGameRecord(context, gameKey),
        loadGamesForConfig: (config: any) => 
            mutex.run(() => loadGamesForConfig(context, config)),
        renameGame: (gameKey: string, newName: string) => 
            mutex.run(() => renameGame(context, gameKey, newName)),
        resolveLibraryConfig: () => resolveLibraryConfig(context),
        resolveLibraryFolderToOpen: () => resolveLibraryFolderToOpen(context),
        setSaveFolderOverride: (gameKey: string, folderPath: string) => 
            mutex.run(() => setSaveFolderOverride(context, gameKey, folderPath)),
        setupLibrary: (type: 'default' | 'custom') => 
            mutex.run(() => setupLibrary(context, type)),
        addLibraryPath: () => 
            mutex.run(() => addLibraryPath(context)),
        removeLibraryPath: (path: string) => 
            mutex.run(() => removeLibraryPath(context, path)),
        changeLibraryPath: (oldPath: string) => 
            mutex.run(() => changeLibraryPath(context, oldPath)),
        toggleFavorite: (gameKey: string) => 
            mutex.run(() => toggleFavorite(context, gameKey)),
        toggleRunInBackground: (gameKey: string) => 
            mutex.run(() => toggleRunInBackground(context, gameKey)),
        toggleAutoTranslate: (gameKey: string) => 
            mutex.run(() => toggleAutoTranslate(context, gameKey)),
        updateLibraryConfig: (updates: any) => 
            mutex.run(() => updateLibraryConfig(context, updates))
    };
}

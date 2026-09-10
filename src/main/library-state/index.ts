import * as scanner from './scanner';
import * as continuity from './continuity';
import * as config from './config';
import * as loader from './loader';
import * as actions from './actions';
import {
    writeAtomicJson,
    readJsonWithRetry,
    createSerializedQueue
} from '../core/shared-io';

export const {
    MAX_LIBRARY_MAX_DEPTH,
    MIN_LIBRARY_MAX_DEPTH,
    DEFAULT_LIBRARY_MAX_DEPTH,
    clampLibraryMaxDepth,
    isRecognizedExecutable,
    pickPreferredExecutable,
    collectGameCandidates,
    dedupeCandidates
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
    retryCount?: number;
    retryDelayMs?: number;
}

export function createLibraryState(options: LibraryContext) {
    let cachedDb: Record<string, any> | null = null;
    let isDegradedState = false;
    const serializedQueue = createSerializedQueue();

    const isDegraded = (): boolean => {
        if (!options.dbFilePath) return false;
        return isDegradedState;
    };

    const loadDB = typeof (options as any).loadDB === 'function'
        ? (options as any).loadDB
        : async (): Promise<Record<string, any>> => {
            if (!options.dbFilePath) {
                return cachedDb || {};
            }
            try {
                if (typeof options.fs?.stat === 'function') {
                    try {
                        const stats = await options.fs.stat(options.dbFilePath);
                        if (stats?.size === 0) {
                            isDegradedState = true;
                            return cachedDb || {};
                        }
                    } catch (statErr: any) {
                        if (statErr?.code === 'ENOENT') {
                            isDegradedState = false;
                            return {};
                        }
                    }
                }

                const data = await readJsonWithRetry<Record<string, any>>(options.dbFilePath, {
                    fs: options.fs,
                    retryCount: options.retryCount,
                    retryDelayMs: options.retryDelayMs
                });
                cachedDb = data;
                isDegradedState = false;
                return data;
            } catch (err: any) {
                if (err?.code === 'ENOENT') {
                    isDegradedState = false;
                    return {};
                }
                isDegradedState = true;
                return cachedDb || {};
            }
        };

    const persistDbDirectly = async (db: any): Promise<void> => {
        if (isDegraded()) {
            console.warn('[LIBRARY_STATE] Persistence aborted: database is in DEGRADED state.');
            return;
        }
        if (typeof (options as any).saveDB === 'function') {
            await (options as any).saveDB(db);
            cachedDb = db;
            return;
        }
        if (options.dbFilePath) {
            await writeAtomicJson(options.dbFilePath, db, {
                fs: options.fs,
                retryCount: options.retryCount,
                retryDelayMs: options.retryDelayMs
            });
            cachedDb = db;
        }
    };

    const saveDB = (db: any) => serializedQueue(() => persistDbDirectly(db));

    const context = {
        categoryState: options.categoryState,
        defaultGamesDir: options.defaultGamesDir,
        dialog: options.dialog,
        fs: options.fs,
        fsSync: options.fsSync,
        dbFilePath: options.dbFilePath,
        loadDB,
        saveDB: persistDbDirectly,
        persistDbDirectly,
        isDegraded,
        queue: serializedQueue
    };

    return {
        addPlaytime: (gameKey: string, durationMs: number) => serializedQueue(() => addPlaytime(context, gameKey, durationMs)),
        finalizeTrackedSession: (gameKey: string, durationMs: number, endedAt: number, exePath?: string) => serializedQueue(() => finalizeTrackedSession(context, gameKey, durationMs, endedAt, exePath)),
        getGameRecord: (gameKey: string) => getGameRecord(context, gameKey),
        loadGamesForConfig: (config: any) => loadGamesForConfig(context, config),
        renameGame: (gameKey: string, newName: string) => serializedQueue(() => renameGame(context, gameKey, newName)),
        resolveLibraryConfig: () => serializedQueue(() => resolveLibraryConfig(context)),
        resolveLibraryFolderToOpen: () => resolveLibraryFolderToOpen(context),
        setSaveFolderOverride: (gameKey: string, folderPath: string) => serializedQueue(() => setSaveFolderOverride(context, gameKey, folderPath)),
        setupLibrary: (type: 'default' | 'custom') => setupLibrary(context, type),
        addLibraryPath: () => addLibraryPath(context),
        removeLibraryPath: (path: string) => serializedQueue(() => removeLibraryPath(context, path)),
        changeLibraryPath: (oldPath: string) => changeLibraryPath(context, oldPath),
        toggleFavorite: (gameKey: string) => serializedQueue(() => toggleFavorite(context, gameKey)),
        toggleRunInBackground: (gameKey: string) => serializedQueue(() => toggleRunInBackground(context, gameKey)),
        toggleAutoTranslate: (gameKey: string) => toggleAutoTranslate(context, gameKey),
        updateLibraryConfig: (updates: any) => serializedQueue(() => updateLibraryConfig(context, updates)),
        saveDB,
        loadDB,
        isDegraded,
        getDbFilePath: () => options.dbFilePath
    };
}

import * as scanner from './scanner';
import * as continuity from './continuity';
import * as config from './config';
import * as loader from './loader';
import * as actions from './actions';
import {
    CURRENT_SCHEMA_VERSION,
    runStorageMigrations,
    registerMigrationForTest,
    resetMigrationsForTest,
    type LibraryDatabase,
    type StoredGameRecord
} from './migrations';
import { normalizeLibraryConfigShape } from './scanner';
import type { PlatformInput } from '../../shared/path-subsumption';
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

export {
    CURRENT_SCHEMA_VERSION,
    runStorageMigrations,
    registerMigrationForTest,
    resetMigrationsForTest,
    type LibraryDatabase,
    type StoredGameRecord
};

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
    targetPlatform?: PlatformInput;
    loadDB?: () => Promise<Record<string, any>>;
    saveDB?: (db: any) => Promise<void>;
    retryCount?: number;
    retryDelayMs?: number;
}

export function createLibraryState(options: LibraryContext) {
    let cachedDb: Record<string, any> | null = null;
    let isDegradedState = false;
    let migrationFailureEpoch = 0;
    let inFlightMigration: Promise<LibraryDatabase> | null = null;
    const targetPlatform = options.targetPlatform || (process.platform as PlatformInput);
    const serializedQueue = createSerializedQueue();

    const isDegraded = (): boolean => {
        if (!options.dbFilePath && !options.loadDB) return false;
        return isDegradedState;
    };

    const persistDbDirectly = async (db: any): Promise<void> => {
        if (isDegraded()) {
            console.warn('[LIBRARY_STATE] Persistence aborted: database is in DEGRADED state.', { dbFilePath: options.dbFilePath });
            throw new Error('Database is in degraded state');
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

    const loadDB = async (): Promise<LibraryDatabase> => {
        const failureEpochAtEntry = migrationFailureEpoch;
        let data: any;

        if (typeof options.loadDB === 'function') {
            try {
                data = await options.loadDB();
            } catch (err: any) {
                if (err?.code === 'ENOENT') {
                    isDegradedState = false;
                    return {
                        schemaVersion: CURRENT_SCHEMA_VERSION,
                        config: normalizeLibraryConfigShape({}, targetPlatform),
                        games: {}
                    };
                }
                isDegradedState = true;
                console.error('[LIBRARY_STATE] Storage load failed, entering degraded state:', {
                    dbFilePath: options.dbFilePath,
                    reason: 'read-error',
                    error: err
                });
                return (cachedDb || {}) as LibraryDatabase;
            }
        } else if (options.dbFilePath) {
            try {
                if (typeof options.fs?.stat === 'function') {
                    try {
                        const stats = await options.fs.stat(options.dbFilePath);
                        if (stats?.size === 0) {
                            isDegradedState = true;
                            console.error('[LIBRARY_STATE] Storage load failed, entering degraded state:', {
                                dbFilePath: options.dbFilePath,
                                reason: 'zero-byte-file',
                                error: null
                            });
                            return (cachedDb || {}) as LibraryDatabase;
                        }
                    } catch (statErr: any) {
                        if (statErr?.code === 'ENOENT') {
                            isDegradedState = false;
                            return {
                                schemaVersion: CURRENT_SCHEMA_VERSION,
                                config: normalizeLibraryConfigShape({}, targetPlatform),
                                games: {}
                            };
                        }
                    }
                }

                data = await readJsonWithRetry<Record<string, any>>(options.dbFilePath, {
                    fs: options.fs,
                    retryCount: options.retryCount,
                    retryDelayMs: options.retryDelayMs
                });
            } catch (err: any) {
                if (err?.code === 'ENOENT') {
                    isDegradedState = false;
                    return {
                        schemaVersion: CURRENT_SCHEMA_VERSION,
                        config: normalizeLibraryConfigShape({}, targetPlatform),
                        games: {}
                    };
                }
                isDegradedState = true;
                console.error('[LIBRARY_STATE] Storage load failed, entering degraded state:', {
                    dbFilePath: options.dbFilePath,
                    reason: 'read-error',
                    error: err
                });
                return (cachedDb || {}) as LibraryDatabase;
            }
        } else {
            return (cachedDb || {}) as LibraryDatabase;
        }

        if (!data || typeof data !== 'object' || Array.isArray(data)) {
            isDegradedState = true;
            console.error('[LIBRARY_STATE] Storage load failed, entering degraded state: invalid root database structure: expected plain object', {
                dbFilePath: options.dbFilePath
            });
            return (cachedDb || {}) as LibraryDatabase;
        }

        const initialVersion = data.schemaVersion ?? 0;

        if (initialVersion > CURRENT_SCHEMA_VERSION) {
            console.error('[STORAGE_MIGRATIONS] Database schema version is newer than supported version, entering degraded state:', {
                dbFilePath: options.dbFilePath,
                databaseVersion: initialVersion,
                maxSupportedVersion: CURRENT_SCHEMA_VERSION
            });
            isDegradedState = true;
            return (cachedDb || data) as LibraryDatabase;
        }

        if (initialVersion === CURRENT_SCHEMA_VERSION) {
            isDegradedState = false;
            cachedDb = data;
            return data as LibraryDatabase;
        }

        if (inFlightMigration !== null) {
            return await inFlightMigration;
        }

        if (migrationFailureEpoch !== failureEpochAtEntry || (cachedDb && (cachedDb.schemaVersion ?? 0) >= CURRENT_SCHEMA_VERSION)) {
            return (cachedDb || data) as LibraryDatabase;
        }

        const migrationPromise = (async () => {
            let catStateSnapshot: any = null;
            if (typeof context.categoryState?.loadCategoryState === 'function') {
                try {
                    const rawCat = await context.categoryState.loadCategoryState();
                    if (rawCat !== undefined) {
                        catStateSnapshot = JSON.parse(JSON.stringify(rawCat));
                    }
                } catch {
                    // category snapshot failure is non-fatal
                }
            }

            try {
                data = await runStorageMigrations(data, context, options.targetPlatform || targetPlatform);
                isDegradedState = false;
                await persistDbDirectly(data);
                console.info('[STORAGE_MIGRATIONS] Successfully completed and persisted storage migrations:', {
                    fromVersion: initialVersion,
                    currentVersion: data.schemaVersion
                });
                cachedDb = data;
                return data as LibraryDatabase;
            } catch (err: any) {
                if (catStateSnapshot !== null && typeof context.categoryState?.saveCategoryState === 'function') {
                    try {
                        await context.categoryState.saveCategoryState(catStateSnapshot);
                    } catch (rollbackErr: any) {
                        console.error('[STORAGE_MIGRATIONS] Secondary category rollback failed:', {
                            rollbackErr,
                            originalError: err
                        });
                    }
                }
                console.error('[STORAGE_MIGRATIONS] Migration runner failed, entering degraded state:', {
                    initialVersion,
                    targetVersion: CURRENT_SCHEMA_VERSION,
                    error: err
                });
                isDegradedState = true;
                migrationFailureEpoch++;
                return (cachedDb || data) as LibraryDatabase;
            }
        })();

        inFlightMigration = migrationPromise;
        migrationPromise
            .finally(() => {
                if (inFlightMigration === migrationPromise) {
                    inFlightMigration = null;
                }
            })
            .catch(() => {});

        return await migrationPromise;
    };

    const saveDB = (db: any) => serializedQueue(() => persistDbDirectly(db));

    const context = {
        categoryState: options.categoryState,
        defaultGamesDir: options.defaultGamesDir,
        dialog: options.dialog,
        fs: options.fs,
        fsSync: options.fsSync,
        dbFilePath: options.dbFilePath,
        targetPlatform,
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

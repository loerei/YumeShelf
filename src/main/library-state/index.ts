// @ts-nocheck
const scanner = require('./scanner');
const continuity = require('./continuity');

const {
    MAX_LIBRARY_MAX_DEPTH,
    MIN_LIBRARY_MAX_DEPTH,
    DEFAULT_LIBRARY_MAX_DEPTH,
    clampLibraryMaxDepth
} = scanner;

const {
    buildLogicalGameId
} = continuity;

const {
    resolveLibraryConfig,
    setupLibrary,
    updateLibraryConfig,
    resolveLibraryFolderToOpen
} = require('./config');

const {
    loadGamesForConfig
} = require('./loader');

const {
    renameGame,
    toggleFavorite,
    toggleRunInBackground,
    toggleAutoTranslate,
    addPlaytime,
    finalizeTrackedSession,
    getGameRecord,
    setSaveFolderOverride
} = require('./actions');

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

function createLibraryState(options: LibraryContext) {
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
        addPlaytime: (gameKey, durationMs) => addPlaytime(context, gameKey, durationMs),
        finalizeTrackedSession: (gameKey, durationMs, endedAt, exePath) => finalizeTrackedSession(context, gameKey, durationMs, endedAt, exePath),
        getGameRecord: (gameKey) => getGameRecord(context, gameKey),
        loadGamesForConfig: (config) => loadGamesForConfig(context, config),
        renameGame: (gameKey, newName) => renameGame(context, gameKey, newName),
        resolveLibraryConfig: () => resolveLibraryConfig(context),
        resolveLibraryFolderToOpen: () => resolveLibraryFolderToOpen(context),
        setSaveFolderOverride: (gameKey, folderPath) => setSaveFolderOverride(context, gameKey, folderPath),
        setupLibrary: (type) => setupLibrary(context, type),
        toggleFavorite: (gameKey) => toggleFavorite(context, gameKey),
        toggleRunInBackground: (gameKey) => toggleRunInBackground(context, gameKey),
        toggleAutoTranslate: (gameKey) => toggleAutoTranslate(context, gameKey),
        updateLibraryConfig: (updates) => updateLibraryConfig(context, updates)
    };
}

module.exports = {
    MAX_LIBRARY_MAX_DEPTH,
    MIN_LIBRARY_MAX_DEPTH,
    DEFAULT_LIBRARY_MAX_DEPTH,
    buildLogicalGameId,
    clampLibraryMaxDepth,
    createLibraryState
};

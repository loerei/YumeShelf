const path = require('path');
const scanner = require('./library-state/scanner');
const continuity = require('./library-state/continuity');

const {
    DEFAULT_LIBRARY_MAX_DEPTH,
    MIN_LIBRARY_MAX_DEPTH,
    MAX_LIBRARY_MAX_DEPTH,
    clampLibraryMaxDepth,
    normalizeLibraryConfigShape,
    normalizePathForComparison,
    buildGameKey,
    getLeafFolderName,
    getSmartName,
    collectGameCandidates,
    dedupeCandidates,
    isPlainObject
} = scanner;

const {
    buildLegacyMigrationMap,
    mapStoredGamesByFolderPath,
    buildMoveMigrationMap,
    normalizeGameRecord,
    buildLogicalGameId,
    buildLogicalGames
} = continuity;

function readStoredGames(db) {
    return isPlainObject(db.games) ? db.games : {};
}

function readLegacyGames(db) {
    return Object.entries(db)
        .filter(([key, value]) => key !== 'config' && key !== 'games' && isPlainObject(value) && typeof value.folderPath === 'string' && typeof value.exePath === 'string')
        .map(([legacyKey, value]) => ({ legacyKey, ...value }));
}

function removeLegacyGames(db) {
    for (const { legacyKey } of readLegacyGames(db)) {
        delete db[legacyKey];
    }
}

function createLibraryState({
    categoryState,
    defaultGamesDir,
    dialog,
    fs,
    fsSync,
    loadDB,
    saveDB
}) {
    async function resolveLibraryConfig() {
        if (process.argv.some(arg => arg.toLowerCase() === '--welcome' || arg.toLowerCase() === '-w')) return null;

        const db = await loadDB();
        const config = normalizeLibraryConfigShape(db.config);

        if (!config.libraryPath && fsSync.existsSync(defaultGamesDir)) {
            config.libraryPath = defaultGamesDir;
        } else if (config.libraryPath && !fsSync.existsSync(config.libraryPath) && fsSync.existsSync(defaultGamesDir)) {
            config.libraryPath = defaultGamesDir;
        }

        db.config = config;
        await saveDB(db);
        return config;
    }

    async function loadGamesForConfig(config) {
        const normalizedConfig = normalizeLibraryConfigShape(config);
        if (!normalizedConfig.libraryPath || !fsSync.existsSync(normalizedConfig.libraryPath)) return [];

        const db = await loadDB();
        const storedGames = readStoredGames(db);
        const storedGamesByFolderPath = mapStoredGamesByFolderPath(storedGames);
        const legacyGames = readLegacyGames(db);
        const candidates = dedupeCandidates(
            await collectGameCandidates(fs, normalizedConfig.libraryPath, normalizedConfig.libraryPath, 0, normalizedConfig.maxDepth)
        );
        const legacyMigrationMap = buildLegacyMigrationMap(candidates, legacyGames);
        const moveMigrationMap = buildMoveMigrationMap({
            candidates,
            libraryPath: normalizedConfig.libraryPath,
            storedGames
        });
        const nextGames = {};

        for (const candidate of candidates) {
            const gameKey = buildGameKey(normalizedConfig.libraryPath, candidate.folderPath);
            const folderPathKey = normalizePathForComparison(candidate.folderPath);
            const existingRecord = storedGames[gameKey]
                || storedGamesByFolderPath.get(folderPathKey)
                || legacyMigrationMap.get(folderPathKey)
                || moveMigrationMap.get(folderPathKey)
                || null;
            const folderName = getLeafFolderName(candidate.folderPath);
            let stats;
            try {
                stats = await fs.stat(candidate.folderPath);
            } catch {
                continue;
            }

            nextGames[gameKey] = {
                dateAdded: existingRecord?.dateAdded || stats.birthtimeMs,
                exePath: candidate.exePath,
                favorite: existingRecord?.favorite || false,
                folderName,
                folderPath: candidate.folderPath,
                lastPlayed: existingRecord?.lastPlayed || 0,
                migratedFromGameKey: existingRecord?.gameKey && existingRecord.gameKey !== gameKey
                    ? existingRecord.gameKey
                    : undefined,
                name: existingRecord?.name || getSmartName(candidate.exePath, folderName),
                relativePath: gameKey,
                playtime: existingRecord?.playtime || 0,
                runInBackground: existingRecord?.runInBackground || false,
                saveFolderOverride: existingRecord?.saveFolderOverride || undefined
            };
        }

        db.config = normalizedConfig;
        db.games = nextGames;
        removeLegacyGames(db);
        await saveDB(db);
        const normalizedGames = Object.entries(nextGames).map(([storedGameKey, record]) => normalizeGameRecord(storedGameKey, record));
        const categorySnapshot = categoryState && typeof categoryState.loadCategoryState === 'function'
            ? await categoryState.loadCategoryState()
            : { assignments: {} };
        return buildLogicalGames(normalizedGames, categorySnapshot.assignments || {});
    }

    async function setupLibrary(type) {
        const db = await loadDB();
        const currentConfig = normalizeLibraryConfigShape(db.config);
        let nextLibraryPath = '';

        if (type === 'default') {
            nextLibraryPath = defaultGamesDir;
            if (!fsSync.existsSync(nextLibraryPath)) {
                fsSync.mkdirSync(nextLibraryPath, { recursive: true });
            }
        } else {
            const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
            if (result.canceled) return null;
            nextLibraryPath = result.filePaths[0];
        }

        const nextConfig = normalizeLibraryConfigShape({
            ...currentConfig,
            libraryPath: nextLibraryPath
        });
        db.config = nextConfig;
        await saveDB(db);
        return nextConfig;
    }

    async function updateLibraryConfig(updates = {}) {
        const db = await loadDB();
        const currentConfig = normalizeLibraryConfigShape(db.config);
        const nextConfig = normalizeLibraryConfigShape({
            ...currentConfig,
            ...updates
        });
        db.config = nextConfig;
        await saveDB(db);
        return nextConfig;
    }

    async function resolveLibraryFolderToOpen() {
        const config = await resolveLibraryConfig();
        if (config?.libraryPath && fsSync.existsSync(config.libraryPath)) {
            return config.libraryPath;
        }
        if (fsSync.existsSync(defaultGamesDir)) {
            return defaultGamesDir;
        }
        return '';
    }

    async function renameGame(gameKey, newName) {
        const db = await loadDB();
        const games = readStoredGames(db);
        if (games[gameKey]) {
            games[gameKey].name = newName;
            db.games = games;
            await saveDB(db);
            return true;
        }

        const normalizedGames = Object.entries(games).map(([storedGameKey, record]) => normalizeGameRecord(storedGameKey, record));
        const targetGroup = buildLogicalGames(normalizedGames).find((record) => record.gameId === gameKey);
        if (!targetGroup) return false;
        targetGroup.instances.forEach((instance) => {
            if (games[instance.gameKey]) {
                games[instance.gameKey].name = newName;
            }
        });
        db.games = games;
        await saveDB(db);
        return true;
    }

    async function toggleFavorite(gameKey) {
        const db = await loadDB();
        const games = readStoredGames(db);
        if (games[gameKey]) {
            games[gameKey].favorite = !games[gameKey].favorite;
            db.games = games;
            await saveDB(db);
            return games[gameKey].favorite;
        }

        const normalizedGames = Object.entries(games).map(([storedGameKey, record]) => normalizeGameRecord(storedGameKey, record));
        const targetGroup = buildLogicalGames(normalizedGames).find((record) => record.gameId === gameKey);
        if (!targetGroup) return false;
        const nextFavorite = !targetGroup.favorite;
        targetGroup.instances.forEach((instance) => {
            if (games[instance.gameKey]) {
                games[instance.gameKey].favorite = nextFavorite;
            }
        });
        db.games = games;
        await saveDB(db);
        return nextFavorite;
    }

    async function toggleRunInBackground(gameKey) {
        const db = await loadDB();
        const games = readStoredGames(db);
        if (games[gameKey]) {
            games[gameKey].runInBackground = !games[gameKey].runInBackground;
            db.games = games;
            await saveDB(db);
            return games[gameKey].runInBackground;
        }

        const normalizedGames = Object.entries(games).map(([storedGameKey, record]) => normalizeGameRecord(storedGameKey, record));
        const targetGroup = buildLogicalGames(normalizedGames).find((record) => record.gameId === gameKey);
        if (!targetGroup) return false;
        const nextRunInBackground = !targetGroup.runInBackground;
        targetGroup.instances.forEach((instance) => {
            if (games[instance.gameKey]) {
                games[instance.gameKey].runInBackground = nextRunInBackground;
            }
        });
        db.games = games;
        await saveDB(db);
        return nextRunInBackground;
    }

    async function addPlaytime(gameKey, durationMs) {
        const db = await loadDB();
        const games = readStoredGames(db);
        
        let targetKey = null;
        if (games[gameKey]) {
            targetKey = gameKey;
        } else {
            const normalizedGames = Object.entries(games).map(([storedGameKey, record]) => normalizeGameRecord(storedGameKey, record));
            const targetGroup = buildLogicalGames(normalizedGames).find((record) => record.gameId === gameKey);
            if (targetGroup) {
                targetKey = targetGroup.gameKey;
            }
        }
        
        if (!targetKey || !games[targetKey]) return;
        games[targetKey].playtime = (games[targetKey].playtime || 0) + Math.max(0, durationMs || 0);
        db.games = games;
        await saveDB(db);
    }

    async function finalizeTrackedSession(gameKey, durationMs, endedAt, exePath) {
        const db = await loadDB();
        const games = readStoredGames(db);
        
        let targetKey = null;
        if (games[gameKey]) {
            targetKey = gameKey;
        } else {
            const normalizedGames = Object.entries(games).map(([storedGameKey, record]) => normalizeGameRecord(storedGameKey, record));
            const targetGroup = buildLogicalGames(normalizedGames).find((record) => record.gameId === gameKey);
            if (targetGroup) {
                if (exePath) {
                    const matchedInstance = targetGroup.instances.find(
                        (inst) => inst.exePath && path.resolve(inst.exePath) === path.resolve(exePath)
                    );
                    if (matchedInstance) {
                        targetKey = matchedInstance.gameKey;
                    }
                }
                if (!targetKey) {
                    targetKey = targetGroup.gameKey;
                }
            }
        }
        
        if (!targetKey || !games[targetKey]) return;
        games[targetKey].playtime = (games[targetKey].playtime || 0) + Math.max(0, durationMs || 0);
        games[targetKey].lastPlayed = endedAt || Date.now();
        db.games = games;
        await saveDB(db);
    }

    async function getGameRecord(gameKey) {
        const db = await loadDB();
        const games = readStoredGames(db);
        
        if (games[gameKey]) return games[gameKey];

        for (const [internalKey, record] of Object.entries(games)) {
            const logicalId = buildLogicalGameId({ ...record, gameKey: internalKey });
            if (logicalId === gameKey) {
                return record;
            }
        }

        return null;
    }

    async function setSaveFolderOverride(gameKey, folderPath) {
        const db = await loadDB();
        const games = readStoredGames(db);
        
        let targetKey = gameKey;
        if (!games[gameKey]) {
            for (const [internalKey, record] of Object.entries(games)) {
                const logicalId = buildLogicalGameId({ ...record, gameKey: internalKey });
                if (logicalId === gameKey) {
                    targetKey = internalKey;
                    break;
                }
            }
        }

        if (!games[targetKey]) return null;
        games[targetKey].saveFolderOverride = folderPath || undefined;
        db.games = games;
        await saveDB(db);
        return { ok: true, saveFolderOverride: games[targetKey].saveFolderOverride || null };
    }

    return {
        addPlaytime,
        finalizeTrackedSession,
        getGameRecord,
        loadGamesForConfig,
        renameGame,
        resolveLibraryConfig,
        resolveLibraryFolderToOpen,
        setSaveFolderOverride,
        setupLibrary,
        toggleFavorite,
        toggleRunInBackground,
        updateLibraryConfig
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

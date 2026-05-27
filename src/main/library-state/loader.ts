// @ts-nocheck
const scanner = require('./scanner');
const continuity = require('./continuity');

const {
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

async function loadGamesForConfig(context, config) {
    const { categoryState, fs, fsSync, loadDB, saveDB } = context;
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
            autoTranslate: existingRecord?.autoTranslate || false,
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

module.exports = {
    loadGamesForConfig
};

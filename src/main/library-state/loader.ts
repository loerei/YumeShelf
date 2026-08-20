import {
    normalizeLibraryConfigShape,
    normalizePathForComparison,
    buildGameKey,
    getLeafFolderName,
    getSmartName,
    collectGameCandidates,
    dedupeCandidates,
    isPlainObject,
    LibraryConfig
} from './scanner';
import { resolveGameTitle } from './title-resolver';

import {
    buildLegacyMigrationMap,
    mapStoredGamesByFolderPath,
    buildMoveMigrationMap,
    normalizeGameRecord,
    buildLogicalGames
} from './continuity';

function readStoredGames(db: any): Record<string, any> {
    return isPlainObject(db.games) ? db.games : {};
}

function readLegacyGames(db: any): any[] {
    return Object.entries(db)
        .filter(([key, value]) => key !== 'config' && key !== 'games' && isPlainObject(value) && typeof (value as any).folderPath === 'string' && typeof (value as any).exePath === 'string')
        .map(([legacyKey, value]) => ({ legacyKey, ...(value as any) }));
}

function removeLegacyGames(db: any): void {
    for (const { legacyKey } of readLegacyGames(db)) {
        delete db[legacyKey];
    }
}

export async function loadGamesForConfig(context: any, config: LibraryConfig): Promise<any[]> {
    const { categoryState, fs, fsSync, loadDB, saveDB } = context;
    const normalizedConfig = normalizeLibraryConfigShape(config);
    const activePaths = normalizedConfig.libraryPaths.filter((p: string) => p && fsSync.existsSync(p));
    if (activePaths.length === 0) return [];

    const db = await loadDB();
    const storedGames = readStoredGames(db);
    const storedGamesByFolderPath = mapStoredGamesByFolderPath(storedGames);
    const legacyGames = readLegacyGames(db);

    // Collect candidates from all active library paths and merge
    const allCandidatesNested = await Promise.all(
        activePaths.map((libraryPath: string) =>
            collectGameCandidates(fs, libraryPath, libraryPath, 0, normalizedConfig.maxDepth)
        )
    );
    const candidates = dedupeCandidates(allCandidatesNested.flat());

    const legacyMigrationMap = buildLegacyMigrationMap(candidates, legacyGames);

    // Build move migration map from all library paths
    const moveMigrationMaps = activePaths.map((libraryPath: string) =>
        buildMoveMigrationMap({ candidates, libraryPath, storedGames })
    );
    const moveMigrationMap = new Map<string, any>();
    for (const m of moveMigrationMaps) {
        for (const [k, v] of m.entries()) moveMigrationMap.set(k, v);
    }

    const nextGames: Record<string, any> = {};

    for (const candidate of candidates) {
        // Determine which libraryPath this candidate belongs to
        const owningLibPath = activePaths.find((lp: string) =>
            candidate.folderPath.toLowerCase().startsWith(lp.toLowerCase())
        ) || activePaths[0];
        const gameKey = buildGameKey(owningLibPath, candidate.folderPath);
        const folderPathKey = normalizePathForComparison(candidate.folderPath);
        const existingRecord = storedGames[gameKey]
            || storedGamesByFolderPath.get(folderPathKey)
            || legacyMigrationMap.get(folderPathKey)
            || moveMigrationMap.get(folderPathKey)
            || null;
        const folderName = getLeafFolderName(candidate.folderPath);
        let stats: any;
        try {
            stats = await fs.stat(candidate.folderPath);
        } catch {
            continue;
        }

        const resolvedTitle = await resolveGameTitle({
            folderPath: candidate.folderPath,
            exePath: candidate.exePath,
            preferredLocale: (normalizedConfig as any).preferredLocale,
            titleDisplayMode: (normalizedConfig as any).titleDisplayMode,
            displayProductCodes: (normalizedConfig as any).displayProductCodes,
            fs,
            fsSync
        });

        nextGames[gameKey] = {
            dateAdded: existingRecord?.dateAdded || stats.birthtimeMs,
            exePath: candidate.exePath,
            platform: candidate.platform || (candidate.exePath.toLowerCase().endsWith('.exe') ? 'windows' : 'linux'),
            favorite: existingRecord?.favorite || false,
            folderName,
            folderPath: candidate.folderPath,
            lastPlayed: existingRecord?.lastPlayed || 0,
            migratedFromGameKey: existingRecord?.gameKey && existingRecord.gameKey !== gameKey
                ? existingRecord.gameKey
                : undefined,
            name: existingRecord?.customName ? existingRecord.name : resolvedTitle,
            customName: !!existingRecord?.customName,
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

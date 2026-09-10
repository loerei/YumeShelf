import * as path from 'node:path';
import {
    normalizeLibraryConfigShape,
    normalizePathForComparison,
    buildGameKey,
    getLeafFolderName,
    collectGameCandidates,
    dedupeCandidates,
    isPlainObject,
    LibraryConfig
} from './scanner';
import { resolveGameTitle } from './title-resolver';
import { YumeEngine } from '@yumeshelf/engine';

import {
    buildLegacyMigrationMap,
    mapStoredGamesByFolderPath,
    buildMoveMigrationMap,
    normalizeGameRecord,
    buildLogicalGames
} from './continuity';

function isPathWithinDirectory(targetPath: string, parentDir: string): boolean {
    const normTarget = path.normalize(targetPath).toLowerCase();
    const normParent = path.normalize(parentDir).toLowerCase();
    if (normTarget === normParent) return true;
    const parentWithSep = normParent.endsWith(path.sep) ? normParent : normParent + path.sep;
    return normTarget.startsWith(parentWithSep);
}

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

    // Check if title display configuration has changed since last resolution
    const lastTitleConfig = isPlainObject(db.titleResolutionConfig) ? db.titleResolutionConfig : {};
    const titleConfigUnchanged = (
        lastTitleConfig.titleDisplayMode === normalizedConfig.titleDisplayMode &&
        lastTitleConfig.displayProductCodes === normalizedConfig.displayProductCodes &&
        (lastTitleConfig.preferredLocale || '') === (normalizedConfig.preferredLocale || '')
    );

    const candidateResults = await Promise.all(
        candidates.map(async (candidate) => {
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
                return null;
            }

            let resolvedTitle: string;
            const hasValidCachedName = typeof existingRecord?.name === 'string' && existingRecord.name.trim().length > 0;
            const hasMatchingExe = existingRecord?.exePath && (
                normalizePathForComparison(existingRecord.exePath) === normalizePathForComparison(candidate.exePath)
            );

            if (existingRecord?.customName && hasValidCachedName) {
                resolvedTitle = existingRecord.name;
            } else if (titleConfigUnchanged && hasValidCachedName && hasMatchingExe) {
                resolvedTitle = existingRecord.name;
            } else {
                try {
                    resolvedTitle = await resolveGameTitle({
                        folderPath: candidate.folderPath,
                        exePath: candidate.exePath,
                        preferredLocale: normalizedConfig.preferredLocale,
                        titleDisplayMode: normalizedConfig.titleDisplayMode,
                        displayProductCodes: normalizedConfig.displayProductCodes,
                        fs,
                        fsSync
                    });
                } catch {
                    resolvedTitle = folderName;
                }
            }

            const hasCachedEngine = hasMatchingExe && (
                typeof existingRecord?.engine === 'string' || existingRecord?.engine === null
            );
            let engine: string | null;
            if (hasCachedEngine) {
                engine = existingRecord.engine;
            } else {
                try {
                    const profile = await YumeEngine.inspectExecutable(candidate.exePath);
                    engine = YumeEngine.formatEngineName(profile) ?? null;
                } catch {
                    engine = null;
                }
            }

            const currentMtimeMs = typeof stats?.mtimeMs === 'number' ? stats.mtimeMs : (stats?.mtime ? new Date(stats.mtime).getTime() : 0);
            const hasCachedSize = (
                currentMtimeMs > 0 &&
                existingRecord?.sizeMtime === currentMtimeMs &&
                typeof existingRecord?.sizeBytes === 'number'
            );
            let sizeBytes: number;
            let sizeMtime: number;
            if (hasCachedSize) {
                sizeBytes = existingRecord.sizeBytes;
                sizeMtime = existingRecord.sizeMtime;
            } else {
                try {
                    const sizeResult = await YumeEngine.calculateDirectorySize(candidate.folderPath);
                    sizeBytes = sizeResult.sizeBytes;
                    sizeMtime = currentMtimeMs || sizeResult.mtimeMs;
                } catch {
                    sizeBytes = existingRecord?.sizeBytes || 0;
                    sizeMtime = currentMtimeMs;
                }
            }

            const record = {
                dateAdded: existingRecord?.dateAdded || stats?.birthtimeMs || Date.now(),
                engine,
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
                saveFolderOverride: existingRecord?.saveFolderOverride || undefined,
                sizeBytes,
                sizeMtime
            };

            return { gameKey, record };
        })
    );

    const scannedGames: Record<string, any> = {};
    for (const item of candidateResults) {
        if (item) {
            scannedGames[item.gameKey] = item.record;
        }
    }

    const persistPhase = async () => {
        if (context.isDegraded?.() === true) {
            console.warn('[LOADER] Persistence aborted: library state is in DEGRADED state.');
            return scannedGames;
        }

        const latestDb = await loadDB();
        if (context.isDegraded?.() === true) {
            console.warn('[LOADER] Persistence aborted: library state is in DEGRADED state after loadDB.');
            return scannedGames;
        }

        const latestStoredGames = readStoredGames(latestDb);
        const nextGames: Record<string, any> = {};

        for (const [gameKey, scannedRecord] of Object.entries(scannedGames)) {
            const latest = latestStoredGames[gameKey];
            if (latest) {
                const recordCopy = { ...scannedRecord };
                if (typeof latest.favorite === 'boolean') recordCopy.favorite = latest.favorite;
                if (typeof latest.playtime === 'number') recordCopy.playtime = latest.playtime;
                if (typeof latest.lastPlayed === 'number') recordCopy.lastPlayed = latest.lastPlayed;
                if (typeof latest.runInBackground === 'boolean') recordCopy.runInBackground = latest.runInBackground;
                if (typeof latest.autoTranslate === 'boolean') recordCopy.autoTranslate = latest.autoTranslate;
                if (latest.saveFolderOverride !== undefined) recordCopy.saveFolderOverride = latest.saveFolderOverride;
                if (latest.customName && latest.name) {
                    recordCopy.name = latest.name;
                    recordCopy.customName = true;
                }
                nextGames[gameKey] = recordCopy;
            } else {
                nextGames[gameKey] = scannedRecord;
            }
        }

        const inactivePaths = normalizedConfig.libraryPaths.filter((p: string) =>
            !activePaths.some((ap: string) => normalizePathForComparison(ap) === normalizePathForComparison(p))
        );

        if (inactivePaths.length > 0) {
            for (const [storedGameKey, record] of Object.entries(latestStoredGames)) {
                if (typeof (record as any)?.folderPath === 'string' && (record as any).folderPath.trim().length > 0) {
                    const matchesInactive = inactivePaths.some((ip: string) =>
                        isPathWithinDirectory((record as any).folderPath, ip)
                    );
                    if (matchesInactive && !nextGames[storedGameKey]) {
                        nextGames[storedGameKey] = record;
                    }
                }
            }
        }

        const mergedConfig = normalizeLibraryConfigShape(latestDb.config || normalizedConfig);
        const combinedPaths = Array.from(new Set([
            ...(latestDb.config?.libraryPaths || []),
            ...normalizedConfig.libraryPaths
        ]));
        mergedConfig.libraryPaths = combinedPaths.length > 0 ? combinedPaths : normalizedConfig.libraryPaths;
        mergedConfig.libraryPath = mergedConfig.libraryPaths[0] || '';

        latestDb.config = mergedConfig;
        latestDb.titleResolutionConfig = {
            titleDisplayMode: normalizedConfig.titleDisplayMode,
            displayProductCodes: normalizedConfig.displayProductCodes,
            preferredLocale: normalizedConfig.preferredLocale
        };
        latestDb.games = nextGames;
        removeLegacyGames(latestDb);
        await (context.persistDbDirectly || saveDB)(latestDb);
        return nextGames;
    };

    const finalGames = context.queue ? await context.queue(persistPhase) : await persistPhase();
    const normalizedGames = Object.entries(finalGames).map(([storedGameKey, record]) => normalizeGameRecord(storedGameKey, record));
    const categorySnapshot = categoryState && typeof categoryState.loadCategoryState === 'function'
        ? await categoryState.loadCategoryState()
        : { assignments: {} };
    return buildLogicalGames(normalizedGames, categorySnapshot.assignments || {});
}

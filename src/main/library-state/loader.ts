import {
    normalizeLibraryConfigShape,
    normalizePathForComparison,
    getLeafFolderName,
    collectGameCandidates,
    dedupeCandidates,
    isPlainObject,
    adaptFileSystem,
    LibraryConfig
} from './scanner';
import {
    type PlatformInput,
    resolvePlatform,
    normalizePathForPlatform,
    subsumeLibraryPaths,
    isSubsumedBy,
    buildGameKey
} from '../../shared/path-subsumption';
import { resolveGameTitle } from './title-resolver';
import { YumeEngine } from '@yumeshelf/engine';

import {
    mapStoredGamesByFolderPath,
    buildMoveMigrationMap,
    normalizeGameRecord,
    buildLogicalGames
} from './continuity';

function isRegularFileSafe(fsSync: any, targetPath: string): boolean {
    if (!fsSync?.statSync || typeof targetPath !== 'string' || !targetPath.trim()) return false;
    try {
        const stat = fsSync.statSync(targetPath, { throwIfNoEntry: false });
        if (!stat) return false;
        return typeof stat.isFile === 'function' ? stat.isFile() : Boolean(stat.isFile);
    } catch {
        return false;
    }
}

export async function loadGamesForConfig(
    context: any,
    config: LibraryConfig,
    targetPlatform?: PlatformInput
): Promise<any[]> {
    const { categoryState, fs, fsSync, loadDB, saveDB } = context;
    const resolvedPlatform = resolvePlatform(targetPlatform || context.targetPlatform);
    const normalizedConfig = normalizeLibraryConfigShape(config, resolvedPlatform);
    if (normalizedConfig.libraryPaths.length === 0) return [];

    const activePaths = normalizedConfig.libraryPaths.filter((p: string) => p && fsSync?.existsSync?.(p));

    const db = await loadDB();
    if (context.isDegraded?.() === true) {
        console.warn('[LOADER] Library database is in DEGRADED state, skipping scan and persistence:', { isDegraded: true });
        const storedGamesDegraded = db.games && typeof db.games === 'object' && !Array.isArray(db.games) ? db.games : {};
        const normalizedGamesDegraded = Object.entries(storedGamesDegraded).map(([storedGameKey, record]) =>
            normalizeGameRecord(storedGameKey, record)
        );
        let categorySnapshot = { assignments: {} };
        if (categoryState?.isDegraded?.() === true) {
            console.warn('[LOADER][CATEGORY_DEGRADED] Category state is in degraded mode, skipping category metadata overlay in loader:', { isDegraded: true });
        } else if (categoryState && typeof categoryState.loadCategoryState === 'function') {
            try {
                categorySnapshot = (await categoryState.loadCategoryState()) || { assignments: {} };
            } catch (err) {
                console.warn('[LOADER][CATEGORY_LOAD_FAIL] Failed to load category state during library scan:', { error: err });
            }
        }
        return buildLogicalGames(normalizedGamesDegraded, categorySnapshot.assignments || {});
    }

    const storedGames = db.games && typeof db.games === 'object' && !Array.isArray(db.games) ? db.games : {};

    if (activePaths.length === 0 && Object.keys(storedGames).length === 0) {
        return [];
    }

    let candidates: any[] = [];
    const moveMigrationMap = new Map<string, any>();
    const canonicalActiveRoots = subsumeLibraryPaths(activePaths, resolvedPlatform);

    if (activePaths.length > 0) {
        // Collect candidates from all active library paths and merge
        const allCandidatesNested = await Promise.all(
            activePaths.map((libraryPath: string) =>
                collectGameCandidates(fs, libraryPath, libraryPath, 0, normalizedConfig.maxDepth, resolvedPlatform)
            )
        );
        candidates = dedupeCandidates(allCandidatesNested.flat(), resolvedPlatform);

        // Build move migration map from all library paths
        const moveMigrationMaps = activePaths.map((libraryPath: string) =>
            buildMoveMigrationMap({ candidates, libraryPath, storedGames, targetPlatform: resolvedPlatform })
        );
        for (const m of moveMigrationMaps) {
            for (const [k, v] of m.entries()) moveMigrationMap.set(k, v);
        }
    }

    const storedGamesByFolderPath = mapStoredGamesByFolderPath(storedGames, resolvedPlatform);

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
            const owningLibPath = canonicalActiveRoots.find((root: string) =>
                isSubsumedBy(candidate.folderPath, root, resolvedPlatform)
            ) || canonicalActiveRoots[0] || activePaths[0];

            const gameKey = buildGameKey(owningLibPath, candidate.folderPath, resolvedPlatform);
            if (!gameKey || gameKey === '__proto__' || gameKey === 'constructor' || gameKey === 'prototype') {
                console.warn('[LOADER][UNSAFE_SCANNED_KEY] Skipping scanned candidate with unsafe canonical game key:', {
                    gameKey,
                    folderPath: candidate.folderPath
                });
                return null;
            }

            const folderPathKey = normalizePathForComparison(candidate.folderPath, resolvedPlatform);
            const existingRecord = storedGames[gameKey]
                || storedGamesByFolderPath.get(folderPathKey)
                || moveMigrationMap.get(folderPathKey)
                || null;
            const folderName = getLeafFolderName(candidate.folderPath);

            let stats: any;
            try {
                stats = await fs.stat(candidate.folderPath);
            } catch (err) {
                console.warn('[LOADER][STAT_FAIL] Failed to stat candidate folder:', {
                    folderPath: candidate.folderPath,
                    error: err
                });
                return null;
            }

            let resolvedTitle: string;
            const hasValidCachedName = typeof existingRecord?.name === 'string' && existingRecord.name.trim().length > 0;
            const hasMatchingExe = existingRecord?.exePath && (
                normalizePathForComparison(existingRecord.exePath, resolvedPlatform) === normalizePathForComparison(candidate.exePath, resolvedPlatform)
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
                } catch (err) {
                    console.warn('[LOADER][TITLE_RESOLVE] Failed to resolve title for game:', {
                        exePath: candidate.exePath,
                        folderPath: candidate.folderPath,
                        error: err
                    });
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
                    const profile = await YumeEngine.inspectExecutable(candidate.exePath, adaptFileSystem(fs));
                    engine = YumeEngine.formatEngineName(profile) ?? null;
                } catch (err) {
                    console.warn('[LOADER][ENGINE_INSPECT] Failed to inspect executable for engine profile:', {
                        exePath: candidate.exePath,
                        error: err
                    });
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
                    const sizeResult = await YumeEngine.calculateDirectorySize(candidate.folderPath, adaptFileSystem(fs));
                    sizeBytes = sizeResult.sizeBytes;
                    sizeMtime = currentMtimeMs || sizeResult.mtimeMs;
                } catch (err) {
                    console.warn('[LOADER][DIR_SIZE] Failed to calculate directory size:', {
                        folderPath: candidate.folderPath,
                        error: err
                    });
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
                name: existingRecord?.customName && existingRecord.name ? existingRecord.name : resolvedTitle,
                customName: Boolean(existingRecord?.customName),
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
        const latestDb = await loadDB();
        const latestStoredGames = latestDb.games && typeof latestDb.games === 'object' && !Array.isArray(latestDb.games)
            ? latestDb.games
            : {};
        const nextGames: Record<string, any> = {};

        const authoritativeRoots = (latestDb.config?.libraryPaths && latestDb.config.libraryPaths.length > 0)
            ? latestDb.config.libraryPaths
            : normalizedConfig.libraryPaths;

        if (!latestDb.config) {
            latestDb.config = { ...normalizedConfig };
        }
        if (!latestDb.config.libraryPaths || latestDb.config.libraryPaths.length === 0) {
            latestDb.config.libraryPaths = authoritativeRoots;
            latestDb.config.libraryPath = authoritativeRoots[0] || '';
        }

        const authoritativeCanonicalRoots = subsumeLibraryPaths(authoritativeRoots, resolvedPlatform);

        // Stage 1: Scanned Games Overlay
        for (const scannedRecord of Object.values(scannedGames)) {
            const authoritativeOwningLibPath = authoritativeCanonicalRoots.find((root: string) =>
                isSubsumedBy(scannedRecord.folderPath, root, resolvedPlatform)
            );
            if (!authoritativeOwningLibPath) {
                continue;
            }

            const gameKey = buildGameKey(authoritativeOwningLibPath, scannedRecord.folderPath, resolvedPlatform);
            if (!gameKey || gameKey === '__proto__' || gameKey === 'constructor' || gameKey === 'prototype') {
                console.warn('[LOADER][UNSAFE_SCANNED_KEY] Skipping scanned candidate with unsafe canonical game key:', {
                    gameKey,
                    folderPath: scannedRecord.folderPath
                });
                continue;
            }

            scannedRecord.gameKey = gameKey;
            scannedRecord.relativePath = gameKey;

            const latest = latestStoredGames[gameKey];
            if (latest?.manual === true) {
                const isValidExeString = typeof latest.exePath === 'string' && latest.exePath.trim().length > 0;
                const normExe = isValidExeString ? normalizePathForPlatform(latest.exePath, resolvedPlatform) : '';
                const normFolder = normalizePathForPlatform(scannedRecord.folderPath, resolvedPlatform);
                const isNotFolder = isValidExeString && normExe !== normFolder;
                const isContained = isValidExeString && isSubsumedBy(latest.exePath, scannedRecord.folderPath, resolvedPlatform);
                const isFile = isValidExeString && isRegularFileSafe(context.fsSync, latest.exePath);

                if (isValidExeString && isNotFolder && isContained && isFile) {
                    scannedRecord.manual = true;
                    scannedRecord.exePath = latest.exePath;
                    scannedRecord.engine = latest.engine;
                    scannedRecord.platform = latest.platform;
                } else {
                    scannedRecord.manual = false;
                    console.warn('[LOADER][MANUAL_EXE_FALLBACK] Stored manual executable invalid, escaping, directory, or missing from disk, falling back to scanned candidate:', {
                        gameKey,
                        missingExe: latest?.exePath,
                        fallbackExe: scannedRecord.exePath,
                        folderPath: scannedRecord.folderPath
                    });
                }
            }

            if (latest) {
                if (latest.customName && latest.name) {
                    scannedRecord.name = latest.name;
                    scannedRecord.customName = true;
                }
                if (typeof latest.favorite === 'boolean') scannedRecord.favorite = latest.favorite;
                if (typeof latest.playtime === 'number') scannedRecord.playtime = latest.playtime;
                if (typeof latest.lastPlayed === 'number') scannedRecord.lastPlayed = latest.lastPlayed;
                if (typeof latest.runInBackground === 'boolean') scannedRecord.runInBackground = latest.runInBackground;
                if (typeof latest.autoTranslate === 'boolean') scannedRecord.autoTranslate = latest.autoTranslate;
                if (latest.dateAdded !== undefined) scannedRecord.dateAdded = latest.dateAdded;
                if (latest.saveFolderOverride !== undefined) scannedRecord.saveFolderOverride = latest.saveFolderOverride;
            }

            nextGames[gameKey] = scannedRecord;
        }

        // Stage 2: Inactive Library Paths Sweep
        const inactivePaths = authoritativeRoots.filter((p: string) =>
            !activePaths.some((ap: string) => normalizePathForPlatform(ap, resolvedPlatform) === normalizePathForPlatform(p, resolvedPlatform))
        );

        if (inactivePaths.length > 0) {
            for (const [storedGameKey, record] of Object.entries(latestStoredGames)) {
                if (
                    typeof storedGameKey !== 'string' ||
                    !storedGameKey.trim() ||
                    storedGameKey === '__proto__' ||
                    storedGameKey === 'constructor' ||
                    storedGameKey === 'prototype' ||
                    typeof (record as any)?.folderPath !== 'string' ||
                    !(record as any).folderPath.trim()
                ) {
                    console.warn('[LOADER][UNSAFE_INACTIVE_KEY] Skipping stored record with unsafe key or malformed folderPath under inactive path:', {
                        storedGameKey,
                        folderPath: (record as any)?.folderPath
                    });
                    continue;
                }

                const matchesInactive = inactivePaths.some((ip: string) =>
                    isSubsumedBy((record as any).folderPath, ip, resolvedPlatform)
                );
                if (matchesInactive && !Object.prototype.hasOwnProperty.call(nextGames, storedGameKey)) {
                    nextGames[storedGameKey] = record;
                }
            }
        }

        // Stage 3: Folder Pre-Indexing for Deduplication
        const existingFolderPaths = new Set(
            Object.values(nextGames).map((g: any) => normalizePathForPlatform(g.folderPath, resolvedPlatform))
        );

        // Stage 4: Active Paths Manual Game Retention Sweep
        const canonicalConfigRoots = authoritativeCanonicalRoots;
        for (const [storedKey, record] of Object.entries(latestStoredGames)) {
            if ((record as any)?.manual !== true) continue;

            // 1. Coordinate validation (FIRST)
            const isExeStr = typeof (record as any)?.exePath === 'string' && (record as any).exePath.trim().length > 0;
            const isFolderStr = typeof (record as any)?.folderPath === 'string' && (record as any).folderPath.trim().length > 0;
            const normRecordFolder = isFolderStr ? normalizePathForPlatform((record as any).folderPath, resolvedPlatform) : '';
            const normRecordExe = isExeStr ? normalizePathForPlatform((record as any).exePath, resolvedPlatform) : '';

            if (!isExeStr || !isFolderStr || !normRecordFolder || !normRecordExe) {
                console.warn('[LOADER][MANUAL_CORRUPT] Skipping corrupt stored manual game record with invalid filesystem coordinates:', {
                    gameKey: storedKey,
                    exePath: (record as any)?.exePath,
                    folderPath: (record as any)?.folderPath
                });
                continue;
            }

            // 2. Deduplication check (SECOND)
            if (existingFolderPaths.has(normRecordFolder)) {
                continue;
            }

            // 3. Root containment check against canonicalConfigRoots (THIRD)
            const canonicalOwningLibPath = canonicalConfigRoots.find(root =>
                isSubsumedBy((record as any).folderPath, root, resolvedPlatform)
            );
            if (!canonicalOwningLibPath || normRecordFolder === normalizePathForPlatform(canonicalOwningLibPath, resolvedPlatform)) {
                console.info('[LOADER][MANUAL_PURGE] Purged stored manual game record failing library root containment:', {
                    gameKey: (record as any).gameKey || storedKey,
                    folderPath: (record as any).folderPath,
                    reason: !canonicalOwningLibPath ? 'outside-library-roots' : 'root-level-executable'
                });
                continue;
            }

            // 4. Folder boundary containment check (FOURTH)
            if (!isSubsumedBy(normRecordExe, normRecordFolder, resolvedPlatform) || normRecordExe === normRecordFolder) {
                console.info('[LOADER][MANUAL_PURGE] Purged stored manual game record failing folder containment:', {
                    gameKey: (record as any).gameKey || storedKey,
                    exePath: (record as any).exePath,
                    folderPath: (record as any).folderPath,
                    reason: normRecordExe === normRecordFolder ? 'executable-is-directory' : 'executable-escapes-folder'
                });
                continue;
            }

            // 5. Physical disk existence and regular file check (FIFTH)
            const folderExists = Boolean(context.fsSync?.existsSync?.((record as any).folderPath));
            const isExeFile = isRegularFileSafe(context.fsSync, (record as any).exePath);
            if (!folderExists || !isExeFile) {
                console.info('[LOADER][MANUAL_PURGE] Purged stored manual game record missing from physical disk or executable is not a regular file:', {
                    gameKey: (record as any).gameKey || storedKey,
                    exePath: (record as any).exePath,
                    folderPath: (record as any).folderPath,
                    folderExists,
                    isExeFile,
                    reason: !folderExists || !Boolean(context.fsSync?.existsSync?.((record as any).exePath)) ? 'missing-from-disk' : 'executable-is-directory'
                });
                continue;
            }

            // 6. Canonical key derivation and prototype guard (SIXTH)
            const canonicalGameKey = buildGameKey(canonicalOwningLibPath, (record as any).folderPath, resolvedPlatform);
            if (
                !canonicalGameKey ||
                !canonicalGameKey.trim() ||
                canonicalGameKey === '__proto__' ||
                canonicalGameKey === 'constructor' ||
                canonicalGameKey === 'prototype'
            ) {
                console.warn('[LOADER][UNSAFE_MANUAL_KEY] Skipping stored manual game with unsafe canonical game key:', {
                    gameKey: storedKey,
                    canonicalGameKey,
                    folderPath: (record as any).folderPath
                });
                continue;
            }

            const manualRecord = { ...(record as any) };
            manualRecord.gameKey = canonicalGameKey;
            manualRecord.relativePath = canonicalGameKey;
            nextGames[canonicalGameKey] = manualRecord;
            existingFolderPaths.add(normRecordFolder);
        }

        // Degraded check strictly prior to persistence:
        if (context.isDegraded?.() === true) {
            console.warn('[LOADER] Persistence aborted: database is in DEGRADED state.', { isDegraded: true });
            return nextGames;
        }

        const gamesSnapshot = latestDb.games;
        const configSnapshot = latestDb.config;

        const mergedConfig = normalizeLibraryConfigShape(latestDb.config || normalizedConfig, resolvedPlatform);
        mergedConfig.libraryPaths = authoritativeRoots;
        mergedConfig.libraryPath = authoritativeRoots[0] || '';

        latestDb.config = mergedConfig;
        latestDb.titleResolutionConfig = {
            titleDisplayMode: normalizedConfig.titleDisplayMode,
            displayProductCodes: normalizedConfig.displayProductCodes,
            preferredLocale: normalizedConfig.preferredLocale
        };
        latestDb.games = nextGames;

        try {
            await (context.persistDbDirectly || saveDB)(latestDb);
        } catch (err) {
            latestDb.games = gamesSnapshot;
            latestDb.config = configSnapshot;
            console.error('[LOADER][PERSIST_FAIL] Failed to persist database in loader persistPhase:', {
                dbFilePath: context.dbFilePath,
                error: err
            });
            throw err;
        }

        return nextGames;
    };

    const finalGames = context.queue ? await context.queue(persistPhase) : await persistPhase();
    const normalizedGames = Object.entries(finalGames).map(([storedGameKey, record]) =>
        normalizeGameRecord(storedGameKey, record)
    );

    let categorySnapshot = { assignments: {} };
    if (categoryState?.isDegraded?.() === true) {
        console.warn('[LOADER][CATEGORY_DEGRADED] Category state is in degraded mode, skipping category metadata overlay in loader:', { isDegraded: true });
    } else if (categoryState && typeof categoryState.loadCategoryState === 'function') {
        try {
            categorySnapshot = (await categoryState.loadCategoryState()) || { assignments: {} };
        } catch (err) {
            console.warn('[LOADER][CATEGORY_LOAD_FAIL] Failed to load category state during library scan:', { error: err });
        }
    }
    return buildLogicalGames(normalizedGames, categorySnapshot.assignments || {});
}

import * as path from 'node:path';
import {
    isPlainObject,
    normalizeLibraryConfigShape,
    WRAPPER_DIRECTORY_NAMES,
    adaptFileSystem,
    type LibraryConfig
} from './scanner';
import {
    AppBundleInspector,
    YumeEngine,
    resolveBundleRoot
} from '@yumeshelf/engine';
import {
    normalizePathForPlatform,
    isSubsumedBy,
    subsumeLibraryPaths,
    buildGameKey,
    getFolderBaseName,
    normalizePlatformInput,
    type PlatformInput
} from '../../shared/path-subsumption';
import {
    normalizeGameRecord,
    buildLogicalGames,
    buildLogicalGameId,
    type LogicalGame
} from './continuity';
import { resolveLibraryFolderToOpen } from './config';

function readStoredGames(db: any): Record<string, any> {
    return isPlainObject(db.games) ? db.games : {};
}

export async function renameGame(context: any, gameKey: string, newName: string): Promise<boolean> {
    const { loadDB, saveDB } = context;
    const db = await loadDB();
    const games = readStoredGames(db);
    if (games[gameKey]) {
        games[gameKey].name = newName;
        games[gameKey].customName = true;
        db.games = games;
        await saveDB(db);
        return true;
    }

    const normalizedGames = Object.entries(games).map(([storedGameKey, record]) => normalizeGameRecord(storedGameKey, record));
    const targetGroup = buildLogicalGames(normalizedGames).find((record) => record.gameId === gameKey);
    if (!targetGroup) return false;
    targetGroup.instances.forEach((instance: any) => {
        if (games[instance.gameKey]) {
            games[instance.gameKey].name = newName;
            games[instance.gameKey].customName = true;
        }
    });
    db.games = games;
    await saveDB(db);
    return true;
}

export async function toggleFavorite(
    context: any,
    gameKey: string,
    targetFavorite?: boolean
): Promise<boolean> {
    if (
        typeof gameKey !== 'string' ||
        !gameKey.trim() ||
        gameKey === '__proto__' ||
        gameKey === 'constructor' ||
        gameKey === 'prototype'
    ) {
        throw new Error(`Game not found: ${gameKey}`);
    }

    if (context.isDegraded?.() === true) {
        console.warn('[LIBRARY_STATE][TOGGLE_FAVORITE] Operation aborted: database is in DEGRADED state', { gameKey });
        throw new Error('Database is in degraded state');
    }

    const { loadDB, saveDB, persistDbDirectly } = context;
    const db = await loadDB();

    if (context.isDegraded?.() === true) {
        console.warn('[LIBRARY_STATE][TOGGLE_FAVORITE] Operation aborted: database is in DEGRADED state', { gameKey });
        throw new Error('Database is in degraded state');
    }

    const games = readStoredGames(db);

    const targetRecord = Object.prototype.hasOwnProperty.call(games, gameKey) ? games[gameKey] : undefined;
    const targetGameId = targetRecord
        ? buildLogicalGameId({ ...targetRecord, gameKey })
        : ((gameKey.startsWith('game:') || gameKey.startsWith('path:')) ? gameKey : undefined);

    if (!targetGameId) {
        throw new Error(`Game not found: ${gameKey}`);
    }

    const matchedKeys = Object.entries(games)
        .filter(([k, record]) => buildLogicalGameId({ ...(record as any), gameKey: k }) === targetGameId)
        .map(([k]) => k);

    if (matchedKeys.length === 0) {
        throw new Error(`Game not found: ${gameKey}`);
    }

    const currentFavorite = matchedKeys.some((k) => Boolean(games[k]?.favorite));
    const nextFavorite = typeof targetFavorite === 'boolean' ? targetFavorite : !currentFavorite;

    const previousFavorites = matchedKeys.map((k: string) => ({
        key: k,
        favorite: games[k]?.favorite
    }));

    matchedKeys.forEach((k: string) => {
        const isUnsafe = typeof k !== 'string' ||
            k === '__proto__' ||
            k === 'constructor' ||
            k === 'prototype';
        if (!isUnsafe && Object.prototype.hasOwnProperty.call(games, k) && games[k]) {
            games[k].favorite = nextFavorite;
        }
    });

    db.games = games;

    try {
        const persistFn = persistDbDirectly || saveDB;
        await persistFn(db);
        return nextFavorite;
    } catch (err) {
        previousFavorites.forEach(({ key, favorite }) => {
            if (
                typeof key === 'string' &&
                !['__proto__', 'constructor', 'prototype'].includes(key) &&
                Object.prototype.hasOwnProperty.call(games, key) &&
                games[key]
            ) {
                games[key].favorite = favorite;
            }
        });
        console.error('[LIBRARY_STATE][TOGGLE_FAVORITE] Failed to persist favorite toggle:', {
            gameKey,
            targetFavorite,
            error: err
        });
        throw err;
    }
}

export async function toggleRunInBackground(context: any, gameKey: string): Promise<boolean> {
    const { loadDB, saveDB } = context;
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
    targetGroup.instances.forEach((instance: any) => {
        if (games[instance.gameKey]) {
            games[instance.gameKey].runInBackground = nextRunInBackground;
        }
    });
    db.games = games;
    await saveDB(db);
    return nextRunInBackground;
}

export async function toggleAutoTranslate(context: any, gameKey: string): Promise<boolean> {
    const { loadDB, saveDB } = context;
    const db = await loadDB();
    const games = readStoredGames(db);
    if (games[gameKey]) {
        games[gameKey].autoTranslate = !games[gameKey].autoTranslate;
        db.games = games;
        await saveDB(db);
        return games[gameKey].autoTranslate;
    }

    const normalizedGames = Object.entries(games).map(([storedGameKey, record]) => normalizeGameRecord(storedGameKey, record));
    const targetGroup = buildLogicalGames(normalizedGames).find((record) => record.gameId === gameKey);
    if (!targetGroup) return false;
    const nextAutoTranslate = !targetGroup.autoTranslate;
    targetGroup.instances.forEach((instance: any) => {
        if (games[instance.gameKey]) {
            games[instance.gameKey].autoTranslate = nextAutoTranslate;
        }
    });
    db.games = games;
    await saveDB(db);
    return nextAutoTranslate;
}

function resolveTargetGameKey(games: Record<string, any>, gameKey: string): { targetKey: string | null; targetGroup?: any } {
    if (games[gameKey]) {
        return { targetKey: gameKey };
    }
    const normalizedGames = Object.entries(games).map(([storedGameKey, record]) => normalizeGameRecord(storedGameKey, record));
    const targetGroup = buildLogicalGames(normalizedGames).find((record) => record.gameId === gameKey);
    return { targetKey: targetGroup?.gameKey || null, targetGroup };
}

export async function addPlaytime(context: any, gameKey: string, durationMs: number): Promise<void> {
    const { loadDB, saveDB } = context;
    const db = await loadDB();
    const games = readStoredGames(db);
    
    const { targetKey } = resolveTargetGameKey(games, gameKey);
    
    if (!targetKey || !games[targetKey]) return;
    games[targetKey].playtime = (games[targetKey].playtime || 0) + Math.max(0, durationMs || 0);
    db.games = games;
    await saveDB(db);
}

export async function finalizeTrackedSession(
    context: any,
    gameKey: string,
    durationMs: number,
    endedAt: number,
    exePath?: string
): Promise<void> {
    const { loadDB, saveDB } = context;
    const db = await loadDB();
    const games = readStoredGames(db);
    
    let { targetKey, targetGroup } = resolveTargetGameKey(games, gameKey);
    if (!games[gameKey] && targetGroup) {
        if (exePath) {
            const matchedInstance = targetGroup.instances.find(
                (inst: any) => inst.exePath && path.resolve(inst.exePath) === path.resolve(exePath)
            );
            if (matchedInstance) {
                targetKey = matchedInstance.gameKey;
            }
        }
        if (!targetKey) {
            targetKey = targetGroup.gameKey;
        }
    }
    
    if (!targetKey || !games[targetKey]) return;
    games[targetKey].playtime = (games[targetKey].playtime || 0) + Math.max(0, durationMs || 0);
    games[targetKey].lastPlayed = endedAt || Date.now();
    db.games = games;
    await saveDB(db);
}

export async function getGameRecord(context: any, gameKey: string): Promise<Record<string, any> | null> {
    const { loadDB } = context;
    const db = await loadDB();
    const games = readStoredGames(db);
    
    if (Object.prototype.hasOwnProperty.call(games, gameKey)) return games[gameKey];

    for (const [internalKey, record] of Object.entries(games)) {
        const logicalId = buildLogicalGameId({ ...record, gameKey: internalKey });
        if (logicalId === gameKey) {
            return record;
        }
    }

    return null;
}

export async function setSaveFolderOverride(context: any, gameKey: string, folderPath: string): Promise<any> {
    const { loadDB, saveDB } = context;
    const db = await loadDB();
    const games = readStoredGames(db);
    
    let targetKey = gameKey;
    if (!Object.prototype.hasOwnProperty.call(games, gameKey)) {
        for (const [internalKey, record] of Object.entries(games)) {
            const logicalId = buildLogicalGameId({ ...record, gameKey: internalKey });
            if (logicalId === gameKey) {
                targetKey = internalKey;
                break;
            }
        }
    }

    if (!Object.prototype.hasOwnProperty.call(games, targetKey)) return null;
    games[targetKey].saveFolderOverride = folderPath || undefined;
    db.games = games;
    await saveDB(db);
    return { ok: true, saveFolderOverride: games[targetKey].saveFolderOverride || null };
}

export async function setFolderAlias(
    context: any,
    folderPath: string,
    alias: string,
    targetPlatform?: PlatformInput
): Promise<{ ok: boolean; config?: LibraryConfig; error?: string }> {
    const canonicalFolderPath = typeof folderPath === 'string'
        ? normalizePathForPlatform(folderPath, targetPlatform)
        : '';

    const isUnsafeKey = (k: string) => {
        const trimmed = k.trim().toLowerCase();
        return trimmed === '__proto__' || trimmed === 'constructor' || trimmed === 'prototype';
    };

    if (
        typeof folderPath !== 'string' ||
        !folderPath.trim() ||
        /\0|\r|\n/.test(folderPath) ||
        isUnsafeKey(folderPath) ||
        !canonicalFolderPath ||
        isUnsafeKey(canonicalFolderPath)
    ) {
        console.warn('[SECURITY][SET_FOLDER_ALIAS] Blocked invalid folder path containing illegal characters or unsafe key:', { folderPath });
        return { ok: false, error: 'invalid-folder-path' };
    }

    if (context.isDegraded?.() === true) {
        console.warn('[LIBRARY_STATE][SET_FOLDER_ALIAS] Operation aborted: database is in DEGRADED state', { folderPath, alias });
        return { ok: false, error: 'degraded-database' };
    }

    const { loadDB, saveDB, persistDbDirectly } = context;
    const db = await loadDB();

    if (context.isDegraded?.() === true) {
        console.warn('[LIBRARY_STATE][SET_FOLDER_ALIAS] Operation aborted: database is in DEGRADED state', { folderPath, alias });
        return { ok: false, error: 'degraded-database' };
    }

    const config = normalizeLibraryConfigShape(db.config, targetPlatform);
    config.folderAliases = config.folderAliases || {};

    const preExistingCanonicalKeys = new Set(
        Object.keys(config.folderAliases).map((k) => normalizePathForPlatform(k, targetPlatform))
    );
    const isPreExisting = preExistingCanonicalKeys.has(canonicalFolderPath);

    if (!isPreExisting) {
        const isContained = (config.libraryPaths || []).some((root: string) =>
            isSubsumedBy(canonicalFolderPath, root, targetPlatform)
        );
        if (!isContained) {
            console.warn('[SECURITY][SET_FOLDER_ALIAS] Blocked unauthorized folder path outside library roots:', { folderPath });
            return { ok: false, error: 'outside-library' };
        }
    }

    const rawAlias = typeof alias === 'string' ? alias : '';
    const cleanAlias = rawAlias
        .replace(/[\r\n\t\x00-\x1f]/g, '')
        .trim()
        .slice(0, 255)
        .trim();

    const previousAliases = { ...(config.folderAliases || {}) };

    if (!cleanAlias) {
        if (Object.prototype.hasOwnProperty.call(config.folderAliases, canonicalFolderPath)) {
            delete config.folderAliases[canonicalFolderPath];
        }
        for (const k of Object.keys(config.folderAliases)) {
            if (normalizePathForPlatform(k, targetPlatform) === canonicalFolderPath) {
                delete config.folderAliases[k];
            }
        }
    } else {
        for (const k of Object.keys(config.folderAliases)) {
            if (k !== canonicalFolderPath && normalizePathForPlatform(k, targetPlatform) === canonicalFolderPath) {
                delete config.folderAliases[k];
            }
        }
        config.folderAliases[canonicalFolderPath] = cleanAlias;
    }

    db.config = config;

    try {
        const persistFn = persistDbDirectly || saveDB;
        await persistFn(db);
        return { ok: true, config };
    } catch (err: any) {
        config.folderAliases = previousAliases;
        db.config = config;
        console.error('[LIBRARY_STATE][SET_FOLDER_ALIAS] Failed to persist folder alias:', {
            folderPath,
            alias,
            error: err
        });
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
}

export interface AddManualGameOptions {
    enclosingFolderPath?: string;
    targetPlatform?: PlatformInput;
}

export async function addManualGameCore(
    context: any,
    targetPath: string,
    options?: AddManualGameOptions
): Promise<{ ok: boolean; game?: LogicalGame; error?: string }> {
    if (typeof targetPath !== 'string' || !targetPath.trim() || /\0|\r|\n/.test(targetPath)) {
        console.warn('[SECURITY][MANUAL_ADD] Invalid target path: expected non-empty string without illegal characters', { targetPath });
        return { ok: false, error: 'target-not-found' };
    }

    if (context.isDegraded?.() === true) {
        console.warn('[LIBRARY_STATE][MANUAL_ADD] Operation aborted: database is in DEGRADED state', { targetPath });
        return { ok: false, error: 'degraded-database' };
    }

    const opts: AddManualGameOptions = options ?? {};
    const platform = normalizePlatformInput(opts.targetPlatform ?? (context.targetPlatform || process.platform));

    const db = await context.loadDB();
    if (context.isDegraded?.() === true) {
        console.warn('[LIBRARY_STATE][MANUAL_ADD] Operation aborted: database is in DEGRADED state', { targetPath });
        return { ok: false, error: 'degraded-database' };
    }

    const config = normalizeLibraryConfigShape(db.config, platform);
    const candidateRoots = subsumeLibraryPaths(config.libraryPaths, platform);

    const cleanTarget = targetPath.trim().replace(/[\\/]+$/, '');
    const casedTarget = cleanTarget.replace(/\\/g, '/');
    const normalizedTarget = normalizePathForPlatform(cleanTarget, platform);

    const isContainedInRoots = candidateRoots.length > 0 && candidateRoots.some((rootPath: string) => isSubsumedBy(cleanTarget, rootPath, platform));
    if (!isContainedInRoots) {
        console.warn('[SECURITY][MANUAL_ADD] Blocked executable path outside library roots:', { targetPath });
        return { ok: false, error: 'outside-library' };
    }

    if (opts.enclosingFolderPath !== undefined) {
        const enc = opts.enclosingFolderPath;
        const isEnclosingSafe = typeof enc === 'string' &&
            enc.trim().length > 0 &&
            !/\0|\r|\n/.test(enc) &&
            !['__proto__', 'constructor', 'prototype'].includes(enc.trim());

        if (!isEnclosingSafe || !isSubsumedBy(normalizedTarget, normalizePathForPlatform(enc, platform), platform)) {
            console.warn('[SECURITY][MANUAL_ADD] Blocked invalid enclosing folder path containing illegal characters, unsafe key, or outside enclosing folder:', {
                targetPath,
                enclosingFolderPath: opts.enclosingFolderPath
            });
            return { ok: false, error: 'outside-enclosing-folder' };
        }
    }

    const isOuterAppBundle = cleanTarget.toLowerCase().endsWith('.app');
    const bundleRoot = resolveBundleRoot(cleanTarget);
    const isMacBundle = isOuterAppBundle || Boolean(bundleRoot);

    let stats: any = null;
    try {
        stats = await (context.fs?.stat
            ? context.fs.stat(targetPath).catch(() => (targetPath !== cleanTarget && context.fs?.stat ? context.fs.stat(cleanTarget) : null))
            : Promise.resolve(context.fsSync?.statSync ? (context.fsSync.statSync(targetPath, { throwIfNoEntry: false }) ?? context.fsSync.statSync(cleanTarget, { throwIfNoEntry: false })) : null));
    } catch {
        try {
            if (context.fsSync?.statSync && targetPath !== cleanTarget) {
                stats = context.fsSync.statSync(cleanTarget);
            }
        } catch {}
    }

    if (!stats || (isOuterAppBundle ? stats.isDirectory?.() !== true : stats.isFile?.() !== true)) {
        console.warn('[SECURITY][MANUAL_ADD] Target path not found on disk:', { targetPath });
        return { ok: false, error: 'target-not-found' };
    }

    const adaptedFs = adaptFileSystem(context.fs);
    let folderPath: string;
    if (isMacBundle) {
        const resolvedBundleRoot = resolveBundleRoot(cleanTarget) || (isOuterAppBundle ? cleanTarget : undefined);
        folderPath = (resolvedBundleRoot || cleanTarget).replace(/\\/g, '/').replace(/\/+$/, '');
    } else {
        let currentDir = casedTarget.includes('/') ? casedTarget.slice(0, casedTarget.lastIndexOf('/')) || '/' : casedTarget;
        while (currentDir && currentDir !== '/' && !/^[A-Za-z]:\/?$/.test(currentDir)) {
            const leafDir = currentDir.includes('/') ? currentDir.slice(currentDir.lastIndexOf('/') + 1) : currentDir;
            if (WRAPPER_DIRECTORY_NAMES.has(leafDir.toLowerCase())) {
                let parentDir = currentDir.includes('/') ? currentDir.slice(0, currentDir.lastIndexOf('/')) || '/' : '/';
                if (/^[A-Za-z]:$/.test(parentDir)) {
                    parentDir = `${parentDir}/`;
                }
                // Unwrapping MUST NOT ascend into parentDir if parentDir is already a candidate library root
                if (candidateRoots.some((root: string) => normalizePathForPlatform(parentDir, platform) === normalizePathForPlatform(root, platform))) {
                    break;
                }
                if (!candidateRoots.some((root: string) => isSubsumedBy(parentDir, root, platform))) {
                    break;
                }
                currentDir = parentDir;
            } else {
                break;
            }
        }
        folderPath = currentDir;
    }

    let exePath = '';
    if (isOuterAppBundle) {
        let bundleExecutable: string | null | undefined;
        try {
            bundleExecutable = (await AppBundleInspector.fromPath(folderPath, adaptedFs))?.executablePath;
        } catch (err) {
            console.warn('[SECURITY][MANUAL_ADD] AppBundleInspector failed for macOS app bundle, falling back to Contents/MacOS resolution:', { folderPath, error: err });
        }
        let validBundleExe = false;
        if (bundleExecutable) {
            const casedBundleExe = bundleExecutable.replace(/\\/g, '/');
            const normalizedBundleExe = normalizePathForPlatform(bundleExecutable, platform);
            if (isSubsumedBy(normalizedBundleExe, folderPath, platform)) {
                let statErr: any = null;
                const isRegularFile = await (context.fs?.stat
                    ? context.fs.stat(casedBundleExe).then((stat: any) => Boolean(stat?.isFile?.()), (err: any) => { statErr = err; return false; })
                    : Promise.resolve((() => {
                        try {
                            return Boolean(context.fsSync?.statSync?.(casedBundleExe)?.isFile?.());
                        } catch (err) {
                            statErr = err;
                            return false;
                        }
                    })()));
                if (isRegularFile) {
                    exePath = casedBundleExe;
                    validBundleExe = true;
                } else {
                    console.warn('[SECURITY][MANUAL_ADD] Resolved macOS app bundle executable is missing or not a regular file:', { folderPath, bundleExecutable: casedBundleExe, error: statErr });
                }
            } else {
                console.warn('[SECURITY][MANUAL_ADD] Blocked invalid or escaping macOS app bundle executable:', { folderPath, bundleExecutable: casedBundleExe });
            }
        }
        if (!validBundleExe) {
            const bundleName = (folderPath.replace(/\/+$/, '').split('/').pop()?.replace(/\.app$/i, '') || '').trim();
            if (!bundleName) {
                console.warn('[SECURITY][MANUAL_ADD] Empty bundle name in macOS app bundle fallback executable resolution:', { folderPath });
                return { ok: false, error: 'unresolvable-executable' };
            }
            const casedFallbackExe = `${folderPath}/Contents/MacOS/${bundleName}`;
            const fallbackExe = normalizePathForPlatform(casedFallbackExe, platform);
            if (!isSubsumedBy(fallbackExe, normalizePathForPlatform(`${folderPath}/Contents/MacOS`, platform), platform)) {
                console.warn('[SECURITY][MANUAL_ADD] Blocked traversal in macOS app bundle fallback executable:', { folderPath, fallbackExe: casedFallbackExe });
                return { ok: false, error: 'unresolvable-executable' };
            }
            let fallbackErr: any = null;
            const isRegularFile = await (context.fs?.stat
                ? context.fs.stat(casedFallbackExe).then((stat: any) => Boolean(stat?.isFile?.()), (err: any) => { fallbackErr = err; return false; })
                : Promise.resolve((() => {
                    try {
                        return Boolean(context.fsSync?.statSync?.(casedFallbackExe)?.isFile?.());
                    } catch (err) {
                        fallbackErr = err;
                        return false;
                    }
                })()));
            if (!isRegularFile) {
                console.warn('[SECURITY][MANUAL_ADD] Failed to resolve regular executable binary for macOS app bundle on disk:', { folderPath, fallbackExe: casedFallbackExe, error: fallbackErr });
                return { ok: false, error: 'unresolvable-executable' };
            }
            exePath = casedFallbackExe;
        }
    } else {
        exePath = casedTarget;
        if (isMacBundle) {
            if (!isSubsumedBy(normalizePathForPlatform(exePath, platform), normalizePathForPlatform(folderPath, platform), platform)) {
                console.warn('[SECURITY][MANUAL_ADD] Blocked inner macOS executable escaping resolved bundle root:', { folderPath, exePath });
                return { ok: false, error: 'outside-library' };
            }
        }
    }

    const owningLibPath = candidateRoots.find((root: string) => isSubsumedBy(folderPath, root, platform));
    if (!owningLibPath) {
        console.warn('[SECURITY][MANUAL_ADD] Folder path falls outside candidate library roots:', { folderPath, candidateRoots });
        return { ok: false, error: 'outside-library' };
    }
    if (normalizePathForPlatform(folderPath, platform) === normalizePathForPlatform(owningLibPath, platform)) {
        console.warn('[SECURITY][MANUAL_ADD] Blocked root-level executable without dedicated game folder:', { targetPath, folderPath, owningLibPath });
        return { ok: false, error: 'root-level-executable' };
    }

    const folderName = getFolderBaseName(folderPath);
    const gameKey = buildGameKey(owningLibPath, folderPath, platform);
    const isUnsafeGameKey = typeof gameKey !== 'string' ||
        !gameKey.trim() ||
        gameKey === '__proto__' ||
        gameKey === 'constructor' ||
        gameKey === 'prototype';

    if (isUnsafeGameKey) {
        console.warn('[SECURITY][MANUAL_ADD] Blocked unsafe game key:', { gameKey, folderPath });
        return { ok: false, error: 'invalid-game-key' };
    }

    let inspectedProfile: any = null;
    try {
        inspectedProfile = await YumeEngine.inspectExecutable(exePath, adaptedFs);
    } catch (err) {
        console.warn('[ADD_MANUAL_GAME] Executable inspection failed, falling back to default profile:', { targetPath, error: err });
        inspectedProfile = null;
    }

    const persistTask = async (): Promise<{ ok: boolean; game?: LogicalGame; error?: string }> => {
        if (context.isDegraded?.() === true) {
            console.warn('[LIBRARY_STATE][MANUAL_ADD] Operation aborted: database is in DEGRADED state', { targetPath });
            return { ok: false, error: 'degraded-database' };
        }

        const latestDb = await context.loadDB();
        if (context.isDegraded?.() === true) {
            console.warn('[LIBRARY_STATE][MANUAL_ADD] Operation aborted: database is in DEGRADED state', { targetPath });
            return { ok: false, error: 'degraded-database' };
        }

        const latestRoots = subsumeLibraryPaths(latestDb.config?.libraryPaths || [], platform);
        const latestOwningLibPath = latestRoots.find((root: string) => isSubsumedBy(folderPath, root, platform));
        if (!latestOwningLibPath) {
            console.warn('[SECURITY][MANUAL_ADD] Owning library path removed during binary inspection, aborting persistence:', { folderPath, latestRoots });
            return { ok: false, error: 'outside-library' };
        }
        if (normalizePathForPlatform(folderPath, platform) === normalizePathForPlatform(latestOwningLibPath, platform)) {
            console.warn('[SECURITY][MANUAL_ADD] Blocked root-level executable without dedicated game folder:', { targetPath, folderPath, latestOwningLibPath });
            return { ok: false, error: 'root-level-executable' };
        }

        const canonicalGameKey = buildGameKey(latestOwningLibPath, folderPath, platform);
        const isUnsafeCanonicalKey = typeof canonicalGameKey !== 'string' ||
            !canonicalGameKey.trim() ||
            canonicalGameKey === '__proto__' ||
            canonicalGameKey === 'constructor' ||
            canonicalGameKey === 'prototype';

        if (isUnsafeCanonicalKey) {
            console.warn('[SECURITY][MANUAL_ADD] Blocked unsafe game key:', { canonicalGameKey, folderPath });
            return { ok: false, error: 'invalid-game-key' };
        }

        const games = readStoredGames(latestDb);
        const existing = Object.prototype.hasOwnProperty.call(games, canonicalGameKey) ? games[canonicalGameKey] : undefined;
        const existingRecordSnapshot = existing ? { ...existing } : undefined;

        const targetPlatformCategory = isMacBundle
            ? 'macos'
            : (cleanTarget.toLowerCase().endsWith('.exe')
                ? 'windows'
                : (platform === 'darwin' ? 'macos' : (platform === 'win32' ? 'windows' : 'linux')));

        const updatedRecord = {
            ...(existing || {}),
            folderPath,
            folderName: getFolderBaseName(folderPath),
            exePath,
            gameKey: canonicalGameKey,
            relativePath: canonicalGameKey,
            favorite: existing ? existing.favorite ?? false : false,
            playtime: existing ? existing.playtime ?? 0 : 0,
            lastPlayed: existing ? existing.lastPlayed ?? 0 : 0,
            runInBackground: existing ? existing.runInBackground ?? false : false,
            autoTranslate: existing ? existing.autoTranslate ?? false : false,
            dateAdded: existing ? existing.dateAdded || Date.now() : Date.now(),
            engine: inspectedProfile ? (YumeEngine.formatEngineName(inspectedProfile) ?? null) : (existing?.engine ?? null),
            saveFolderOverride: existing ? existing.saveFolderOverride : undefined,
            sizeBytes: typeof existing?.sizeBytes === 'number' ? existing.sizeBytes : undefined,
            sizeMtime: typeof existing?.sizeMtime === 'number' ? existing.sizeMtime : undefined,
            name: existing?.customName ? existing.name : (inspectedProfile?.title || getFolderBaseName(folderPath)),
            customName: existing ? !!existing.customName : false,
            manual: true,
            platform: targetPlatformCategory
        };

        games[canonicalGameKey] = updatedRecord;
        latestDb.games = games;

        try {
            const persistFn = context.persistDbDirectly || context.saveDB;
            await persistFn(latestDb);
        } catch (err: any) {
            if (existingRecordSnapshot) {
                games[canonicalGameKey] = existingRecordSnapshot;
            } else {
                delete games[canonicalGameKey];
            }
            latestDb.games = games;
            console.error('[LIBRARY_STATE][MANUAL_ADD] Failed to persist manual game:', { targetPath, error: err });
            return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }

        const recordCopy = { ...updatedRecord };
        const targetGameId = buildLogicalGameId(recordCopy);

        let catState: any = { assignments: {} };
        if (context.categoryState?.isDegraded?.() === true) {
            console.warn('[LIBRARY_STATE][MANUAL_ADD] Category state is in DEGRADED state, defaulting to empty categories:', { gameKey: canonicalGameKey });
            catState = { assignments: {} };
        } else if (typeof context.categoryState?.loadCategoryState === 'function') {
            try {
                const loadedCat = await context.categoryState.loadCategoryState();
                if (loadedCat && typeof loadedCat === 'object' && !Array.isArray(loadedCat)) {
                    catState = loadedCat;
                }
            } catch (err) {
                console.warn('[LIBRARY_STATE][MANUAL_ADD] Failed to load category state, defaulting to empty categories:', { gameKey: canonicalGameKey, error: err });
                catState = { assignments: {} };
            }
        }

        const matchingRecords: any[] = [];
        for (const [storedGameKey, record] of Object.entries(latestDb.games || {})) {
            if (record && typeof record === 'object') {
                const normalized = normalizeGameRecord(storedGameKey, record);
                if (buildLogicalGameId(normalized) === targetGameId) {
                    matchingRecords.push(normalized);
                }
            }
        }

        if (!matchingRecords.some((r) => r.gameKey === canonicalGameKey)) {
            matchingRecords.push(normalizeGameRecord(canonicalGameKey, recordCopy));
        }

        const logicalGames = buildLogicalGames(matchingRecords, catState?.assignments || {});
        const matchingLogicalGame = logicalGames.find((g) => g.gameId === targetGameId) || logicalGames[0];

        return { ok: true, game: matchingLogicalGame };
    };

    if (typeof context.queue === 'function') {
        return await context.queue(persistTask);
    }
    return await persistTask();
}

export async function addManualGame(
    context: any,
    options?: { folderPath?: string; targetPlatform?: PlatformInput } | string
): Promise<{ ok: boolean; game?: LogicalGame; canceled?: boolean; error?: string }> {
    const normalizedOpts = typeof options === 'string' ? { folderPath: options.trim() } : (options ?? {});

    if (context.isDegraded?.() === true) {
        console.warn('[LIBRARY_STATE][ADD_MANUAL_GAME] Operation aborted: database is in DEGRADED state');
        return { ok: false, error: 'degraded-database' };
    }

    const db = await context.loadDB();

    if (context.isDegraded?.() === true) {
        console.warn('[LIBRARY_STATE][ADD_MANUAL_GAME] Operation aborted: database is in DEGRADED state');
        return { ok: false, error: 'degraded-database' };
    }

    const targetPlatform = normalizedOpts.targetPlatform || context.targetPlatform;
    const config = normalizeLibraryConfigShape(db?.config, targetPlatform);

    if (!config.libraryPaths || config.libraryPaths.length === 0) {
        console.warn('[LIBRARY_STATE][ADD_MANUAL_GAME] Aborted: no library paths configured in library.', { configuredRoots: config.libraryPaths });
        return { ok: false, error: 'outside-library' };
    }

    const { dialog } = context;
    if (!dialog?.showOpenDialog) {
        console.warn('[LIBRARY_STATE][ADD_MANUAL_GAME] Native directory open dialog is unavailable in current runtime context.', { targetPlatform });
        return { ok: false, error: 'dialog-unavailable' };
    }

    const rawFolderPath = normalizedOpts.folderPath;
    const explicitFolderPath = typeof rawFolderPath === 'string' &&
        rawFolderPath.trim().length > 0 &&
        !/\0|\r|\n/.test(rawFolderPath) &&
        !['__proto__', 'constructor', 'prototype'].includes(rawFolderPath.trim())
            ? rawFolderPath.trim()
            : undefined;

    const validatedEnclosing = (explicitFolderPath && config.libraryPaths.some((r: string) => isSubsumedBy(explicitFolderPath, r, targetPlatform)))
        ? explicitFolderPath
        : undefined;

    const fallbackDefault = (await resolveLibraryFolderToOpen(context)) || config.libraryPaths[0];
    const defaultPath = validatedEnclosing || fallbackDefault;

    const normPlatform = normalizePlatformInput(targetPlatform);
    let filters: { name: string; extensions: string[] }[];
    if (normPlatform === 'win32') {
        filters = [
            { name: 'Executables', extensions: ['exe'] },
            { name: 'All Files', extensions: ['*'] }
        ];
    } else if (normPlatform === 'darwin') {
        filters = [
            { name: 'Applications', extensions: ['app'] },
            { name: 'All Files', extensions: ['*'] }
        ];
    } else {
        filters = [
            { name: 'All Files', extensions: ['*'] }
        ];
    }

    let result: any;
    try {
        result = await dialog.showOpenDialog({ defaultPath, filters, properties: ['openFile'] });
    } catch (err) {
        console.error('[ADD_MANUAL_GAME] Open dialog failed:', { error: err, defaultPath });
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }

    if (result.canceled === true || !result.filePaths || result.filePaths.length === 0 || !result.filePaths[0]) {
        return { ok: false, canceled: true };
    }

    const selectedPath = result.filePaths[0];
    return await addManualGameCore(context, selectedPath, { enclosingFolderPath: validatedEnclosing, targetPlatform });
}


import * as path from 'node:path';
import { isPlainObject } from './scanner';
import {
    normalizeGameRecord,
    buildLogicalGames,
    buildLogicalGameId
} from './continuity';

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

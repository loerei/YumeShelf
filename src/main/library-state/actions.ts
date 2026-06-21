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
        }
    });
    db.games = games;
    await saveDB(db);
    return true;
}

export async function toggleFavorite(context: any, gameKey: string): Promise<boolean> {
    const { loadDB, saveDB } = context;
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
    targetGroup.instances.forEach((instance: any) => {
        if (games[instance.gameKey]) {
            games[instance.gameKey].favorite = nextFavorite;
        }
    });
    db.games = games;
    await saveDB(db);
    return nextFavorite;
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

export async function addPlaytime(context: any, gameKey: string, durationMs: number): Promise<void> {
    const { loadDB, saveDB } = context;
    const db = await loadDB();
    const games = readStoredGames(db);
    
    let targetKey: string | null = null;
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
    
    let targetKey: string | null = null;
    if (games[gameKey]) {
        targetKey = gameKey;
    } else {
        const normalizedGames = Object.entries(games).map(([storedGameKey, record]) => normalizeGameRecord(storedGameKey, record));
        const targetGroup = buildLogicalGames(normalizedGames).find((record) => record.gameId === gameKey);
        if (targetGroup) {
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
    }
    
    if (!targetKey || !games[targetKey]) return;
    games[targetKey].playtime = (games[targetKey].playtime || 0) + Math.max(0, durationMs || 0);
    games[targetKey].lastPlayed = endedAt || Date.now();
    db.games = games;
    await saveDB(db);
}

export async function getGameRecord(context: any, gameKey: string): Promise<any | null> {
    const { loadDB } = context;
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

export async function setSaveFolderOverride(context: any, gameKey: string, folderPath: string): Promise<any> {
    const { loadDB, saveDB } = context;
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

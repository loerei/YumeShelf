// @ts-nocheck
const path = require('path');
const scanner = require('./scanner');
const continuity = require('./continuity');

const { isPlainObject } = scanner;
const {
    normalizeGameRecord,
    buildLogicalGames,
    buildLogicalGameId
} = continuity;

function readStoredGames(db) {
    return isPlainObject(db.games) ? db.games : {};
}

async function renameGame(context, gameKey, newName) {
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
    targetGroup.instances.forEach((instance) => {
        if (games[instance.gameKey]) {
            games[instance.gameKey].name = newName;
        }
    });
    db.games = games;
    await saveDB(db);
    return true;
}

async function toggleFavorite(context, gameKey) {
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
    targetGroup.instances.forEach((instance) => {
        if (games[instance.gameKey]) {
            games[instance.gameKey].favorite = nextFavorite;
        }
    });
    db.games = games;
    await saveDB(db);
    return nextFavorite;
}

async function toggleRunInBackground(context, gameKey) {
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
    targetGroup.instances.forEach((instance) => {
        if (games[instance.gameKey]) {
            games[instance.gameKey].runInBackground = nextRunInBackground;
        }
    });
    db.games = games;
    await saveDB(db);
    return nextRunInBackground;
}

async function toggleAutoTranslate(context, gameKey) {
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
    targetGroup.instances.forEach((instance) => {
        if (games[instance.gameKey]) {
            games[instance.gameKey].autoTranslate = nextAutoTranslate;
        }
    });
    db.games = games;
    await saveDB(db);
    return nextAutoTranslate;
}

async function addPlaytime(context, gameKey, durationMs) {
    const { loadDB, saveDB } = context;
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

async function finalizeTrackedSession(context, gameKey, durationMs, endedAt, exePath) {
    const { loadDB, saveDB } = context;
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

async function getGameRecord(context, gameKey) {
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

async function setSaveFolderOverride(context, gameKey, folderPath) {
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

module.exports = {
    renameGame,
    toggleFavorite,
    toggleRunInBackground,
    toggleAutoTranslate,
    addPlaytime,
    finalizeTrackedSession,
    getGameRecord,
    setSaveFolderOverride
};

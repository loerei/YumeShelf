const path = require('path');

const DEFAULT_LIBRARY_MAX_DEPTH = 5;
const MIN_LIBRARY_MAX_DEPTH = 0;
const MAX_LIBRARY_MAX_DEPTH = 12;
const EXECUTABLE_BLACKLIST = ['crashhandler', 'notification', 'unins', 'updater', 'ffmpeg', 'dnspy', 'gifski', 'nircmd', 'unitycrash'];
const WRAPPER_DIRECTORY_NAMES = new Set(['app', 'bin', 'binaries', 'data', 'game', 'release', 'runtime', 'win64', 'windows', 'x64', 'x86']);

function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function clampLibraryMaxDepth(value) {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    if (!Number.isFinite(parsed)) return DEFAULT_LIBRARY_MAX_DEPTH;
    return Math.min(MAX_LIBRARY_MAX_DEPTH, Math.max(MIN_LIBRARY_MAX_DEPTH, parsed));
}

function normalizeLibraryConfigShape(config) {
    const base = isPlainObject(config) ? config : {};
    return {
        libraryPath: typeof base.libraryPath === 'string' ? base.libraryPath : '',
        maxDepth: clampLibraryMaxDepth(base.maxDepth)
    };
}

function normalizePathForComparison(targetPath) {
    return path.resolve(String(targetPath || '')).replace(/[\\/]+/g, '\\').toLowerCase();
}

function normalizeRelativeGameKey(relativePath) {
    return String(relativePath || '')
        .replace(/[\\/]+/g, '/')
        .replace(/^\.\/+/, '')
        .replace(/^\/+/, '')
        .replace(/\/+$/, '');
}

function buildGameKey(libraryPath, folderPath) {
    const relativePath = normalizeRelativeGameKey(path.relative(libraryPath, folderPath));
    return relativePath || path.basename(folderPath);
}

function getLeafFolderName(folderPath) {
    const normalized = String(folderPath || '').replace(/[\\/]+$/, '');
    return path.basename(normalized);
}

function normalizeComparableText(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/\[[^\]]*]/g, ' ')
        .replace(/\b(rj\d{6,8}|\d{6,8})\b/gi, ' ')
        .replace(/\bv?\d+(?:\.\d+)+(?:\s*[a-z]+)?\b/gi, ' ')
        .replace(/[_-]+/g, ' ')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
        .replace(/\s+/g, ' ');
}

function getExecutableStem(exePath) {
    const normalized = String(exePath || '').replace(/[\\/]+/g, '/');
    const baseName = normalized.split('/').pop() || '';
    return baseName.replace(/\.exe$/i, '');
}

function buildContinuitySignature(record) {
    if (!record) return null;
    const signatureSource = `${record.folderName || getLeafFolderName(record.folderPath)} ${record.exePath || ''}`;
    const idMatch = signatureSource.match(/(RJ\d{6,8}|\b\d{6,8}\b)/i);
    if (idMatch) {
        return `id:${idMatch[0].toUpperCase()}`;
    }

    const normalizedFolderName = normalizeComparableText(record.folderName || getLeafFolderName(record.folderPath));
    const normalizedExeStem = normalizeComparableText(getExecutableStem(record.exePath));
    if (!normalizedFolderName || normalizedFolderName.length < 4 || !normalizedExeStem || normalizedExeStem.length < 3) {
        return null;
    }

    return `folder:${normalizedFolderName}|exe:${normalizedExeStem}`;
}

function pickPreferredExecutable(currentPath, executableEntries) {
    const folderName = path.basename(currentPath).toLowerCase();
    const preferred = executableEntries.find((entry) => entry.name.toLowerCase().includes(folderName))
        || executableEntries.find((entry) => entry.name.toLowerCase() === 'game.exe')
        || executableEntries[0];
    return preferred ? path.join(currentPath, preferred.name) : null;
}

function getSmartName(exePath, topName) {
    const id = exePath.match(/(RJ\d{6,8}|\b\d{6,8}\b)/i);
    const clean = (value) => value
        .replace(/\[.*?\]|RY-|(RJ\d+|\b\d{6,8}\b)|(_pc|_win|_dlsite|_eng|subscriber|v\d+\.\d+.*)|[_-]/gi, ' ')
        .trim()
        .replace(/\s+/g, ' ');
    return (id ? `[${id[0].toUpperCase()}] ` : '') + (clean(path.basename(path.dirname(exePath))) || clean(topName));
}

function isStoredGameRecord(value) {
    return isPlainObject(value) && typeof value.folderPath === 'string' && typeof value.exePath === 'string';
}

function readStoredGames(db) {
    return isPlainObject(db.games) ? db.games : {};
}

function readLegacyGames(db) {
    return Object.entries(db)
        .filter(([key, value]) => key !== 'config' && key !== 'games' && isStoredGameRecord(value))
        .map(([legacyKey, value]) => ({ legacyKey, ...value }));
}

function removeLegacyGames(db) {
    for (const { legacyKey } of readLegacyGames(db)) {
        delete db[legacyKey];
    }
}

function isDescendantPath(parentPath, childPath) {
    const relative = path.relative(parentPath, childPath);
    return !!relative && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function shouldPromoteWrapperDirectory(currentPath, childFolderPath, libraryPath) {
    if (normalizePathForComparison(currentPath) === normalizePathForComparison(libraryPath)) return false;
    return WRAPPER_DIRECTORY_NAMES.has(getLeafFolderName(childFolderPath).toLowerCase());
}

async function collectGameCandidates(fs, libraryPath, currentPath, depth, maxDepth) {
    let entries;
    try {
        entries = await fs.readdir(currentPath, { withFileTypes: true });
    } catch {
        return [];
    }

    const executableEntries = entries
        .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.exe'))
        .filter((entry) => !EXECUTABLE_BLACKLIST.some((token) => entry.name.toLowerCase().includes(token)));

    if (executableEntries.length > 0) {
        const exePath = pickPreferredExecutable(currentPath, executableEntries);
        return exePath ? [{ folderPath: currentPath, exePath }] : [];
    }

    if (depth >= maxDepth) {
        return [];
    }

    const childDirectories = entries.filter((entry) => entry.isDirectory());
    const nestedGroups = await Promise.all(
        childDirectories.map((entry) => collectGameCandidates(fs, libraryPath, path.join(currentPath, entry.name), depth + 1, maxDepth))
    );
    const nestedCandidates = nestedGroups.flat();

    if (nestedCandidates.length === 1 && shouldPromoteWrapperDirectory(currentPath, nestedCandidates[0].folderPath, libraryPath)) {
        return [{
            folderPath: currentPath,
            exePath: nestedCandidates[0].exePath
        }];
    }

    return nestedCandidates;
}

function buildLegacyMigrationMap(candidates, legacyGames) {
    const migrationMap = new Map();
    for (const legacyGame of legacyGames) {
        const exactMatches = candidates.filter((candidate) => normalizePathForComparison(candidate.folderPath) === normalizePathForComparison(legacyGame.folderPath));
        if (exactMatches.length === 1) {
            migrationMap.set(normalizePathForComparison(exactMatches[0].folderPath), legacyGame);
            continue;
        }

        const descendantMatches = candidates.filter((candidate) => isDescendantPath(legacyGame.folderPath, candidate.folderPath));
        if (descendantMatches.length === 1) {
            migrationMap.set(normalizePathForComparison(descendantMatches[0].folderPath), legacyGame);
        }
    }
    return migrationMap;
}

function mapStoredGamesByFolderPath(storedGames) {
    const result = new Map();
    for (const [gameKey, record] of Object.entries(storedGames)) {
        if (!isStoredGameRecord(record)) continue;
        result.set(normalizePathForComparison(record.folderPath), { gameKey, ...record });
    }
    return result;
}

function dedupeCandidates(candidates) {
    const unique = new Map();
    for (const candidate of candidates) {
        unique.set(normalizePathForComparison(candidate.folderPath), candidate);
    }
    return [...unique.values()];
}

function buildMoveMigrationMap({ candidates, libraryPath, storedGames }) {
    const candidateGameKeys = new Set(candidates.map((candidate) => buildGameKey(libraryPath, candidate.folderPath)));
    const candidateFolderPaths = new Set(candidates.map((candidate) => normalizePathForComparison(candidate.folderPath)));
    const orphanedRecordsBySignature = new Map();
    const unmatchedCandidatesBySignature = new Map();

    for (const [gameKey, record] of Object.entries(storedGames)) {
        if (!isStoredGameRecord(record)) continue;
        if (candidateGameKeys.has(gameKey)) continue;
        if (candidateFolderPaths.has(normalizePathForComparison(record.folderPath))) continue;

        const signature = buildContinuitySignature({ gameKey, ...record });
        if (!signature) continue;
        const nextGroup = orphanedRecordsBySignature.get(signature) || [];
        nextGroup.push({ gameKey, ...record });
        orphanedRecordsBySignature.set(signature, nextGroup);
    }

    for (const candidate of candidates) {
        const candidateRecord = {
            exePath: candidate.exePath,
            folderName: getLeafFolderName(candidate.folderPath),
            folderPath: candidate.folderPath
        };
        const signature = buildContinuitySignature(candidateRecord);
        if (!signature) continue;
        const nextGroup = unmatchedCandidatesBySignature.get(signature) || [];
        nextGroup.push(candidate);
        unmatchedCandidatesBySignature.set(signature, nextGroup);
    }

    const migrationMap = new Map();
    for (const [signature, records] of orphanedRecordsBySignature.entries()) {
        const candidatesForSignature = unmatchedCandidatesBySignature.get(signature) || [];
        if (records.length !== 1 || candidatesForSignature.length !== 1) continue;
        migrationMap.set(normalizePathForComparison(candidatesForSignature[0].folderPath), records[0]);
    }

    return migrationMap;
}

function normalizeGameRecord(gameKey, record) {
    return {
        ...record,
        folderName: record.folderName || getLeafFolderName(record.folderPath),
        gameKey,
        relativePath: record.relativePath || gameKey
    };
}

function createLibraryState({
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
                playtime: existingRecord?.playtime || 0
            };
        }

        db.config = normalizedConfig;
        db.games = nextGames;
        removeLegacyGames(db);
        await saveDB(db);

        return Object.entries(nextGames).map(([gameKey, record]) => normalizeGameRecord(gameKey, record));
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

        const nextConfig = {
            libraryPath: nextLibraryPath,
            maxDepth: currentConfig.maxDepth
        };
        db.config = nextConfig;
        await saveDB(db);
        return nextConfig;
    }

    async function updateLibraryConfig(updates = {}) {
        const db = await loadDB();
        const currentConfig = normalizeLibraryConfigShape(db.config);
        const nextConfig = {
            libraryPath: typeof updates.libraryPath === 'string' ? updates.libraryPath : currentConfig.libraryPath,
            maxDepth: Object.prototype.hasOwnProperty.call(updates, 'maxDepth')
                ? clampLibraryMaxDepth(updates.maxDepth)
                : currentConfig.maxDepth
        };
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
        if (!games[gameKey]) return false;
        games[gameKey].name = newName;
        db.games = games;
        await saveDB(db);
        return true;
    }

    async function toggleFavorite(gameKey) {
        const db = await loadDB();
        const games = readStoredGames(db);
        if (!games[gameKey]) return false;
        games[gameKey].favorite = !games[gameKey].favorite;
        db.games = games;
        await saveDB(db);
        return games[gameKey].favorite;
    }

    async function markGameLaunched(gameKey) {
        const db = await loadDB();
        const games = readStoredGames(db);
        if (!games[gameKey]) return;
        games[gameKey].lastPlayed = Date.now();
        db.games = games;
        await saveDB(db);
    }

    async function addPlaytime(gameKey, durationMs) {
        const db = await loadDB();
        const games = readStoredGames(db);
        if (!games[gameKey]) return;
        games[gameKey].playtime = (games[gameKey].playtime || 0) + durationMs;
        db.games = games;
        await saveDB(db);
    }

    async function markGameStopped(gameKey) {
        const db = await loadDB();
        const games = readStoredGames(db);
        if (!games[gameKey]) return;
        games[gameKey].lastPlayed = Date.now();
        db.games = games;
        await saveDB(db);
    }

    return {
        addPlaytime,
        loadGamesForConfig,
        markGameLaunched,
        markGameStopped,
        renameGame,
        resolveLibraryConfig,
        resolveLibraryFolderToOpen,
        setupLibrary,
        toggleFavorite,
        updateLibraryConfig
    };
}

module.exports = {
    MAX_LIBRARY_MAX_DEPTH,
    MIN_LIBRARY_MAX_DEPTH,
    DEFAULT_LIBRARY_MAX_DEPTH,
    clampLibraryMaxDepth,
    createLibraryState
};

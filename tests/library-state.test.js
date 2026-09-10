const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const fsSync = require('fs');
const os = require('os');
const path = require('path');

const { buildLogicalGameId, createLibraryState } = require('../dist/main/library-state');

async function makeTempDir() {
    return fs.mkdtemp(path.join(os.tmpdir(), 'yumeshelf-library-state-'));
}

async function writeExe(filePath) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, 'stub');
}

function createDbHarness(initialDb = {}) {
    let db = JSON.parse(JSON.stringify(initialDb));
    return {
        async loadDB() {
            return JSON.parse(JSON.stringify(db));
        },
        async saveDB(nextDb) {
            db = JSON.parse(JSON.stringify(nextDb));
        },
        read() {
            return JSON.parse(JSON.stringify(db));
        }
    };
}

function createLibraryHarness(rootPath, initialDb = {}, categorySnapshot = { tree: [], assignments: {} }) {
    const db = createDbHarness(initialDb);
    let currentCategorySnapshot = JSON.parse(JSON.stringify(categorySnapshot));
    const state = createLibraryState({
        categoryState: {
            async loadCategoryState() {
                return JSON.parse(JSON.stringify(currentCategorySnapshot));
            }
        },
        defaultGamesDir: path.join(rootPath, 'DefaultLibrary'),
        dialog: {
            async showOpenDialog() {
                throw new Error('showOpenDialog should not be called in this test');
            }
        },
        fs,
        fsSync,
        loadDB: () => db.loadDB(),
        saveDB: (nextDb) => db.saveDB(nextDb)
    });
    return {
        db,
        state,
        setCategorySnapshot(nextSnapshot) {
            currentCategorySnapshot = JSON.parse(JSON.stringify(nextSnapshot));
        }
    };
}

test('scan exposes nested games and promotes known wrapper folders', async () => {
    const rootPath = await makeTempDir();
    const exePath = path.join(rootPath, 'VN', 'Circle A', 'Game One', 'bin', 'Game One.exe');
    await writeExe(exePath);

    const { state } = createLibraryHarness(rootPath, {
        config: {
            libraryPath: rootPath,
            maxDepth: 5
        }
    });

    const games = await state.loadGamesForConfig({ libraryPath: rootPath, maxDepth: 5 });

    assert.equal(games.length, 1);
    assert.equal(games[0].gameKey, 'VN/Circle A/Game One');
    assert.equal(games[0].relativePath, 'VN/Circle A/Game One');
    assert.equal(games[0].folderPath, path.join(rootPath, 'VN', 'Circle A', 'Game One'));
    assert.equal(games[0].folderName, 'Game One');
});

test('scan exposes multiple nested version folders as separate games', async () => {
    const rootPath = await makeTempDir();
    await writeExe(path.join(rootPath, 'RPG', 'Studio B', 'Game Two', 'v1.0', 'Game.exe'));
    await writeExe(path.join(rootPath, 'RPG', 'Studio B', 'Game Two', 'v1.1', 'Game.exe'));

    const { state } = createLibraryHarness(rootPath, {
        config: {
            libraryPath: rootPath,
            maxDepth: 5
        }
    });

    const games = await state.loadGamesForConfig({ libraryPath: rootPath, maxDepth: 5 });
    const keys = games.map((game) => game.gameKey).sort();

    assert.deepEqual(keys, [
        'RPG/Studio B/Game Two/v1.0',
        'RPG/Studio B/Game Two/v1.1'
    ]);
});

test('legacy top-level records migrate best-effort to a unique nested descendant', async () => {
    const rootPath = await makeTempDir();
    const legacyRoot = path.join(rootPath, 'Game Three');
    const exePath = path.join(legacyRoot, 'Version 1', 'Game.exe');
    await writeExe(exePath);

    const { db, state } = createLibraryHarness(rootPath, {
        config: {
            libraryPath: rootPath,
            maxDepth: 5
        },
        'Game Three': {
            name: 'My Custom Name',
            customName: true,
            folderPath: legacyRoot,
            exePath,
            dateAdded: 123,
            lastPlayed: 456,
            favorite: true
        }
    });

    const games = await state.loadGamesForConfig({ libraryPath: rootPath, maxDepth: 5 });

    assert.equal(games.length, 1);
    assert.equal(games[0].gameKey, 'Game Three/Version 1');
    assert.equal(games[0].name, 'My Custom Name');
    assert.equal(games[0].favorite, true);
    assert.equal(games[0].lastPlayed, 456);
    assert.equal(games[0].dateAdded, 123);

    const savedDb = db.read();
    assert.ok(savedDb.games['Game Three/Version 1']);
    assert.equal(savedDb['Game Three'], undefined);
});

test('manually moved games keep metadata when a unique moved target is found', async () => {
    const rootPath = await makeTempDir();
    const originalFolderPath = path.join(rootPath, '[kimochi]LivingTogether_alpha_060_subscriber-0.60-pc');
    const movedFolderPath = path.join(rootPath, 'VN', '[kimochi]LivingTogether_alpha_060_subscriber-0.60-pc');
    const exePath = path.join(movedFolderPath, 'LivingTogether_alpha_060_subscriber-0.60-pc.exe');
    await writeExe(exePath);

    const { db, state } = createLibraryHarness(rootPath, {
        config: {
            libraryPath: rootPath,
            maxDepth: 5
        },
        games: {
            '[kimochi]LivingTogether_alpha_060_subscriber-0.60-pc': {
                name: 'LivingTogether alpha 060 0.60 pc',
                folderName: '[kimochi]LivingTogether_alpha_060_subscriber-0.60-pc',
                folderPath: originalFolderPath,
                exePath,
                dateAdded: 111,
                lastPlayed: 222,
                favorite: true,
                relativePath: '[kimochi]LivingTogether_alpha_060_subscriber-0.60-pc'
            }
        }
    });

    const games = await state.loadGamesForConfig({ libraryPath: rootPath, maxDepth: 5 });

    assert.equal(games.length, 1);
    assert.equal(games[0].gameKey, 'VN/[kimochi]LivingTogether_alpha_060_subscriber-0.60-pc');
    assert.equal(games[0].name, 'LivingTogether alpha 060 0.60 pc');
    assert.equal(games[0].favorite, true);
    assert.equal(games[0].lastPlayed, 222);
    assert.equal(games[0].dateAdded, 111);
    assert.equal(games[0].migratedFromGameKey, '[kimochi]LivingTogether_alpha_060_subscriber-0.60-pc');

    const savedDb = db.read();
    assert.ok(savedDb.games['VN/[kimochi]LivingTogether_alpha_060_subscriber-0.60-pc']);
    assert.equal(savedDb.games['VN/[kimochi]LivingTogether_alpha_060_subscriber-0.60-pc'].favorite, true);
    assert.equal(savedDb.games['VN/[kimochi]LivingTogether_alpha_060_subscriber-0.60-pc'].lastPlayed, 222);
    assert.equal(savedDb.games['[kimochi]LivingTogether_alpha_060_subscriber-0.60-pc'], undefined);
});

test('duplicate stacks share one durable gameId and keep category assignment after moves', async () => {
    const rootPath = await makeTempDir();
    const originalFolderPathA = path.join(rootPath, 'RJ123456 Release A');
    const originalFolderPathB = path.join(rootPath, 'RJ123456 Release B');
    const movedFolderPathA = path.join(rootPath, 'VN', 'RJ123456 Release A');
    const movedFolderPathB = path.join(rootPath, 'VN', 'RJ123456 Release B');
    const exePathA = path.join(movedFolderPathA, 'Game.exe');
    const exePathB = path.join(movedFolderPathB, 'Game.exe');
    await writeExe(exePathA);
    await writeExe(exePathB);

    const gameId = buildLogicalGameId({
        folderName: 'RJ123456 Release A',
        folderPath: movedFolderPathA,
        exePath: exePathA,
        relativePath: 'VN/RJ123456 Release A'
    });

    const { state } = createLibraryHarness(rootPath, {
        config: {
            libraryPath: rootPath,
            maxDepth: 5
        },
        games: {
            'RJ123456 Release A': {
                name: '[RJ123456] Release A',
                folderName: 'RJ123456 Release A',
                folderPath: originalFolderPathA,
                exePath: exePathA,
                dateAdded: 111,
                lastPlayed: 222,
                favorite: true,
                relativePath: 'RJ123456 Release A'
            },
            'RJ123456 Release B': {
                name: '[RJ123456] Release B',
                folderName: 'RJ123456 Release B',
                folderPath: originalFolderPathB,
                exePath: exePathB,
                dateAdded: 333,
                lastPlayed: 0,
                favorite: false,
                relativePath: 'RJ123456 Release B'
            }
        }
    }, {
        tree: [
            {
                id: 'cat_vn',
                name: 'VN',
                children: []
            }
        ],
        assignments: {
            [gameId]: ['cat_vn']
        }
    });

    const games = await state.loadGamesForConfig({ libraryPath: rootPath, maxDepth: 5 });

    assert.equal(games.length, 1);
    assert.equal(games[0].gameId, gameId);
    assert.equal(games[0].duplicateCount, 2);
    assert.equal(games[0].instances.length, 2);
    assert.deepEqual(games[0].categoryIds, ['cat_vn']);
});

test('scan ignores Config.exe if there is another executable', async () => {
    const rootPath = await makeTempDir();
    const gameFolderPath = path.join(rootPath, 'MyGame');
    await writeExe(path.join(gameFolderPath, 'Config.exe'));
    await writeExe(path.join(gameFolderPath, 'MyGameExecutable.exe'));

    const { state } = createLibraryHarness(rootPath, {
        config: {
            libraryPath: rootPath,
            maxDepth: 5
        }
    });

    const games = await state.loadGamesForConfig({ libraryPath: rootPath, maxDepth: 5 });

    assert.equal(games.length, 1);
    assert.equal(games[0].exePath, path.join(gameFolderPath, 'MyGameExecutable.exe'));
});

test('Smart Cache: warm scan preserves cached titles without re-resolving when config is unchanged', async () => {
    const rootPath = await makeTempDir();
    const gameFolderPath = path.join(rootPath, 'RJ01234567_Game');
    await writeExe(path.join(gameFolderPath, 'Game.exe'));

    const { db, state } = createLibraryHarness(rootPath, {
        config: {
            libraryPath: rootPath,
            maxDepth: 5,
            titleDisplayMode: 'metadata',
            displayProductCodes: false
        },
        titleResolutionConfig: {
            titleDisplayMode: 'metadata',
            displayProductCodes: false,
            preferredLocale: undefined
        },
        games: {
            RJ01234567_Game: {
                name: 'Cached Title From Prior Scan',
                customName: false,
                exePath: path.join(gameFolderPath, 'Game.exe'),
                folderPath: gameFolderPath,
                dateAdded: 1000
            }
        }
    });

    const games = await state.loadGamesForConfig({
        libraryPath: rootPath,
        maxDepth: 5,
        titleDisplayMode: 'metadata',
        displayProductCodes: false
    });

    assert.equal(games.length, 1);
    assert.equal(games[0].name, 'Cached Title From Prior Scan');
    assert.equal(db.read().titleResolutionConfig.titleDisplayMode, 'metadata');
});

test('Smart Cache: invalidation triggers re-resolution when title config changes while preserving customName', async () => {
    const rootPath = await makeTempDir();
    const autoGameFolder = path.join(rootPath, 'RJ01234567_AutoGame');
    const customGameFolder = path.join(rootPath, 'RJ01999999_CustomGame');
    await writeExe(path.join(autoGameFolder, 'Game.exe'));
    await writeExe(path.join(customGameFolder, 'Game.exe'));

    const { state } = createLibraryHarness(rootPath, {
        config: {
            libraryPath: rootPath,
            maxDepth: 5,
            titleDisplayMode: 'metadata',
            displayProductCodes: false
        },
        titleResolutionConfig: {
            titleDisplayMode: 'metadata',
            displayProductCodes: false,
            preferredLocale: undefined
        },
        games: {
            RJ01234567_AutoGame: {
                name: 'Auto Game Old Title',
                customName: false,
                exePath: path.join(autoGameFolder, 'Game.exe'),
                folderPath: autoGameFolder,
                dateAdded: 1000
            },
            RJ01999999_CustomGame: {
                name: 'My Special User Renamed Game',
                customName: true,
                exePath: path.join(customGameFolder, 'Game.exe'),
                folderPath: customGameFolder,
                dateAdded: 2000
            }
        }
    });

    // Load with displayProductCodes: true (changed setting)
    const games = await state.loadGamesForConfig({
        libraryPath: rootPath,
        maxDepth: 5,
        titleDisplayMode: 'metadata',
        displayProductCodes: true
    });

    assert.equal(games.length, 2);
    const autoGame = games.find(g => g.folderName === 'RJ01234567_AutoGame');
    const customGame = games.find(g => g.folderName === 'RJ01999999_CustomGame');

    // Auto game should be re-resolved with product code prefix
    assert.ok(autoGame.name.includes('RJ01234567'));
    // Custom renamed game must NEVER be overwritten
    assert.equal(customGame.name, 'My Special User Renamed Game');
    assert.equal(customGame.customName, true);
});

test('library-state: calculates engine and sizeBytes, utilizing mtime cache for warm scans', async () => {
    const rootPath = await makeTempDir();
    const gameFolder = path.join(rootPath, 'MyTestGame');
    await fs.mkdir(gameFolder, { recursive: true });
    await fs.writeFile(path.join(gameFolder, 'Game.exe'), 'stub-exe');
    await fs.writeFile(path.join(gameFolder, 'data.bin'), Buffer.alloc(1000, 0x41));

    const stats = await fs.stat(gameFolder);
    const { db, state } = createLibraryHarness(rootPath);

    // First cold scan
    const coldGames = await state.loadGamesForConfig({
        libraryPath: rootPath,
        maxDepth: 5
    });

    assert.equal(coldGames.length, 1);
    const coldGame = coldGames[0];
    assert.equal(coldGame.folderName, 'MyTestGame');
    assert.ok(coldGame.sizeBytes > 1000);
    assert.equal(coldGame.sizeMtime, stats.mtimeMs);
    assert.equal(typeof coldGame.engine, 'object'); // null for stub executable

    const savedDb = db.read();
    const storedKey = Object.keys(savedDb.games)[0];
    assert.equal(savedDb.games[storedKey].sizeBytes, coldGame.sizeBytes);
    assert.equal(savedDb.games[storedKey].sizeMtime, stats.mtimeMs);
    assert.equal(savedDb.games[storedKey].engine, null);

    // Warm scan: mutate stored sizeBytes to verify cache hit
    savedDb.games[storedKey].sizeBytes = 999999;
    savedDb.games[storedKey].engine = 'RPG Maker MZ';
    await db.saveDB(savedDb);

    const warmGames = await state.loadGamesForConfig({
        libraryPath: rootPath,
        maxDepth: 5
    });

    assert.equal(warmGames.length, 1);
    assert.equal(warmGames[0].sizeBytes, 999999, 'Expected warm scan to reuse cached sizeBytes without recalculation');
    assert.equal(warmGames[0].engine, 'RPG Maker MZ', 'Expected warm scan to reuse cached engine label');
});

test('library-state: continuity preserves engine and size metadata during warm scans', async () => {
    const rootPath = await makeTempDir();
    const gameFolder = path.join(rootPath, 'RJ01111111_Game');
    await writeExe(path.join(gameFolder, 'Game.exe'));

    const { state } = createLibraryHarness(rootPath, {
        games: {
            RJ01111111_Game: {
                name: 'Cached Game Title',
                folderPath: gameFolder,
                customName: true,
                exePath: path.join(gameFolder, 'Game.exe'),
                engine: 'Unity',
                sizeBytes: 543210,
                sizeMtime: 12345
            }
        }
    });

    const games = await state.loadGamesForConfig({ libraryPath: rootPath, maxDepth: 5 });
    assert.equal(games.length, 1);
    assert.equal(games[0].name, 'Cached Game Title');
    assert.equal(games[0].engine, 'Unity');
});

test('setSaveFolderOverride persists and clears override in DB', async () => {
    const rootPath = await makeTempDir();
    const gameFolder = path.join(rootPath, 'MyGame');
    const exePath = path.join(gameFolder, 'Game.exe');
    await writeExe(exePath);

    const { db, state } = createLibraryHarness(rootPath, {
        games: {
            'MyGame': {
                name: 'My Game',
                folderPath: gameFolder,
                exePath
            }
        }
    });

    // Test prototype pollution rejection
    const protoRes = await state.setSaveFolderOverride('__proto__', 'C:/Hacked');
    assert.equal(protoRes, null);
    const constrRes = await state.setSaveFolderOverride('constructor', 'C:/Hacked');
    assert.equal(constrRes, null);

    // Test direct internalKey lookup
    const setRes = await state.setSaveFolderOverride('MyGame', 'C:/CustomSaves/MyGame');
    assert.deepEqual(setRes, { ok: true, saveFolderOverride: 'C:/CustomSaves/MyGame' });
    let savedDb = db.read();
    assert.equal(savedDb.games['MyGame'].saveFolderOverride, 'C:/CustomSaves/MyGame');

    // Test logicalId lookup
    const logicalId = buildLogicalGameId({
        folderName: 'MyGame',
        folderPath: gameFolder,
        exePath,
        gameKey: 'MyGame'
    });
    const setByLogicalRes = await state.setSaveFolderOverride(logicalId, 'C:/CustomSaves/ByLogicalId');
    assert.deepEqual(setByLogicalRes, { ok: true, saveFolderOverride: 'C:/CustomSaves/ByLogicalId' });
    savedDb = db.read();
    assert.equal(savedDb.games['MyGame'].saveFolderOverride, 'C:/CustomSaves/ByLogicalId');

    // Test clearing
    const clearRes = await state.setSaveFolderOverride('MyGame', '');
    assert.deepEqual(clearRes, { ok: true, saveFolderOverride: null });
    savedDb = db.read();
    assert.equal(savedDb.games['MyGame'].saveFolderOverride, undefined);
});

test('library-state: degraded state protects 0-byte or corrupted files from destructive overwrites and recovers', async () => {
    const rootPath = await makeTempDir();
    const dbFilePath = path.join(rootPath, 'library_db.json');

    const state = createLibraryState({
        categoryState: null,
        defaultGamesDir: path.join(rootPath, 'DefaultLibrary'),
        dialog: null,
        fs,
        fsSync,
        dbFilePath
    });

    // Cold start (missing file) is NOT degraded
    assert.equal(state.isDegraded(), false);
    const initial = await state.loadDB();
    assert.deepEqual(initial, {});
    assert.equal(state.isDegraded(), false);

    // Simulate 0-byte truncated file
    await fs.writeFile(dbFilePath, '');
    assert.equal((await fs.stat(dbFilePath)).size, 0);

    const loadedWhenTruncated = await state.loadDB();
    assert.deepEqual(loadedWhenTruncated, {});
    assert.equal(state.isDegraded(), true);

    // Compound mutator and saveDB should abort write while degraded
    await state.saveDB({ corruptedOverwrite: true });
    // Verify file on disk is still 0 bytes and was NOT overwritten
    assert.equal((await fs.stat(dbFilePath)).size, 0);

    // Simulate restoring valid database
    const validDb = { config: { libraryPaths: [] }, games: { myGame: { name: 'Valid' } } };
    await fs.writeFile(dbFilePath, JSON.stringify(validDb));

    const recovered = await state.loadDB();
    assert.deepEqual(recovered, validDb);
    assert.equal(state.isDegraded(), false);

    // Now saveDB should persist cleanly
    await state.saveDB({ ...validDb, saved: true });
    const finalContent = JSON.parse(await fs.readFile(dbFilePath, 'utf8'));
    assert.equal(finalContent.saved, true);
});

test('library-state: inactive library path games are retained with directory boundary prefix matching', async () => {
    const rootPath = await makeTempDir();
    const activeLib = path.join(rootPath, 'ActiveLibrary');
    const inactiveLib = path.join(rootPath, 'ExternalDrive', 'Games');
    const siblingLib = path.join(rootPath, 'ExternalDrive', 'GamesExtra');

    await fs.mkdir(activeLib, { recursive: true });
    const activeGameFolder = path.join(activeLib, 'ActiveGame');
    await writeExe(path.join(activeGameFolder, 'Game.exe'));

    // Note: inactiveLib and siblingLib do NOT exist on disk (simulating disconnected drive)
    const initialDb = {
        config: {
            libraryPaths: [activeLib, inactiveLib]
        },
        games: {
            'inactive:game1': {
                name: 'Inactive Game 1',
                folderPath: path.join(inactiveLib, 'Game1'),
                exePath: path.join(inactiveLib, 'Game1', 'Game.exe'),
                favorite: true
            },
            'sibling:game2': {
                name: 'Sibling Game 2',
                folderPath: path.join(siblingLib, 'Game2'),
                exePath: path.join(siblingLib, 'Game2', 'Game.exe')
            },
            'malformed:game3': {
                name: 'Malformed No FolderPath'
                // folderPath omitted or undefined
            }
        }
    };

    const harness = createLibraryHarness(rootPath, initialDb);
    const result = await harness.state.loadGamesForConfig({
        libraryPaths: [activeLib, inactiveLib],
        maxDepth: 2
    });

    const savedDb = harness.db.read();

    // Inactive game must be preserved in savedDb.games
    assert.ok(savedDb.games['inactive:game1'], 'inactive:game1 should be retained');
    assert.equal(savedDb.games['inactive:game1'].favorite, true);

    // Sibling directory game sharing prefix must NOT match inactiveLib and should be pruned
    assert.equal(savedDb.games['sibling:game2'], undefined, 'sibling:game2 should not match inactiveLib');

    // Malformed record without valid folderPath must be safely bypassed
    assert.equal(savedDb.games['malformed:game3'], undefined);

    // Active game must be scanned and present
    const activeGameFound = Object.values(savedDb.games).find((g) => g.folderName === 'ActiveGame');
    assert.ok(activeGameFound, 'Active game should be scanned and present');
});


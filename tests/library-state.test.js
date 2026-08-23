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

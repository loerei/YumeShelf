const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const fsSync = require('fs');
const os = require('os');
const path = require('path');

const { buildLogicalGameId, createLibraryState } = require('../src/main/library-state');

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

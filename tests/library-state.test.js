const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const fsSync = require('fs');
const os = require('os');
const path = require('path');

const { createLibraryState } = require('../src/main/library-state');

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

function createLibraryHarness(rootPath, initialDb = {}) {
    const db = createDbHarness(initialDb);
    const state = createLibraryState({
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
    return { db, state };
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

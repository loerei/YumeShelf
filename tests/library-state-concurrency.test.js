const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const fsSync = require('fs');
const os = require('os');
const path = require('path');

const { createLibraryState } = require('../dist/main/library-state');

async function makeTempDir() {
    return fs.mkdtemp(path.join(os.tmpdir(), 'yumeshelf-lib-concurrency-test-'));
}

async function writeExe(filePath) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, 'stub');
}

test('concurrent mutations and scans do not corrupt library_db.json or lose state', async () => {
    const rootPath = await makeTempDir();
    const libDir = path.join(rootPath, 'Library');
    const dbFilePath = path.join(rootPath, 'library_db.json');

    // Create 3 games on disk
    for (let i = 1; i <= 3; i++) {
        await writeExe(path.join(libDir, `Game_${i}`, 'Game.exe'));
    }

    const state = createLibraryState({
        categoryState: null,
        defaultGamesDir: libDir,
        dialog: null,
        fs,
        fsSync,
        dbFilePath
    });

    // Initial scan to populate DB
    await state.loadGamesForConfig({
        libraryPaths: [libDir],
        maxDepth: 2
    });

    const initialDb = await state.loadDB();
    const gameKeys = Object.keys(initialDb.games);
    assert.equal(gameKeys.length, 3);

    // Fire 20 concurrent operations mixing mutations, scans, and config updates
    const tasks = [];
    for (let i = 0; i < 20; i++) {
        const opType = i % 4;
        const targetKey = gameKeys[i % gameKeys.length];

        if (opType === 0) {
            tasks.push(state.toggleFavorite(targetKey));
        } else if (opType === 1) {
            tasks.push(state.renameGame(targetKey, `Renamed_${i}`));
        } else if (opType === 2) {
            tasks.push(state.loadGamesForConfig({ libraryPaths: [libDir], maxDepth: 2 }));
        } else {
            tasks.push(state.resolveLibraryConfig());
        }
    }

    const results = await Promise.all(tasks);
    assert.equal(results.length, 20);

    // Verify DB integrity on disk
    const finalContent = await fs.readFile(dbFilePath, 'utf8');
    assert.doesNotThrow(() => JSON.parse(finalContent));

    const finalDb = JSON.parse(finalContent);
    assert.ok(finalDb.games, 'finalDb.games must not be wiped');
    assert.equal(Object.keys(finalDb.games).length, 3, 'all 3 games must be retained');
    assert.ok(Array.isArray(finalDb.config.libraryPaths));
    assert.ok(finalDb.config.libraryPaths.includes(libDir));
});

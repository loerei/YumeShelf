const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

const { createCategoryState } = require('../dist/main/category-state');

async function makeTempDir() {
    return fs.mkdtemp(path.join(os.tmpdir(), 'yumeshelf-cat-concurrency-test-'));
}

test('concurrent mutations on category state are serialized without data loss or queue deadlocks', async () => {
    const rootPath = await makeTempDir();
    const stateFile = path.join(rootPath, 'category_state.json');

    const categoryState = createCategoryState({ fs, stateFile });

    // Fire 20 concurrent operations creating categories and assigning games
    const tasks = [];
    for (let i = 0; i < 20; i++) {
        const opType = i % 2;
        if (opType === 0) {
            tasks.push(categoryState.createCategory({ name: `Category_${i}` }));
        } else {
            tasks.push(categoryState.assignGameCategories(`game_${i}`, []));
        }
    }

    const results = await Promise.all(tasks);
    assert.equal(results.length, 20);

    const finalState = await categoryState.loadCategoryState();
    assert.equal(finalState.tree.length, 10, 'All 10 created categories should exist in the tree');

    // Verify on-disk file is valid JSON
    const content = await fs.readFile(stateFile, 'utf8');
    assert.doesNotThrow(() => JSON.parse(content));
    const parsed = JSON.parse(content);
    assert.equal(parsed.tree.length, 10);
});

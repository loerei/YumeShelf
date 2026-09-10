const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

const { createCategoryState } = require('../dist/main/category-state');

async function makeTempDir() {
    return fs.mkdtemp(path.join(os.tmpdir(), 'yumeshelf-category-state-'));
}

test('category state loads empty when file is missing and round-trips safely', async () => {
    const rootPath = await makeTempDir();
    const stateFile = path.join(rootPath, 'category_state.json');
    const categoryState = createCategoryState({ fs, stateFile });

    const initial = await categoryState.loadCategoryState();
    assert.deepEqual(initial, {
        version: 1,
        tree: [],
        assignments: {}
    });

    await categoryState.saveCategoryState({
        version: 99,
        tree: [{ id: 'cat_root', name: 'Root', children: [] }],
        assignments: { 'game:abc': ['cat_root'] }
    });

    const reloaded = await categoryState.loadCategoryState();
    assert.deepEqual(reloaded, {
        version: 1,
        tree: [{ id: 'cat_root', name: 'Root', children: [] }],
        assignments: { 'game:abc': ['cat_root'] }
    });
});

test('malformed category file normalizes without crashing startup', async () => {
    const rootPath = await makeTempDir();
    const stateFile = path.join(rootPath, 'category_state.json');
    await fs.writeFile(stateFile, '{"tree":[{"id":"cat_root","name":"Root","children":[{"id":"cat_root","name":"Dup"}]}],"assignments":{"game:abc":["cat_root","missing"]}}');
    const categoryState = createCategoryState({ fs, stateFile });

    const loaded = await categoryState.loadCategoryState();
    assert.deepEqual(loaded.tree, [{ id: 'cat_root', name: 'Root', children: [] }]);
    assert.deepEqual(loaded.assignments, { 'game:abc': ['cat_root'] });
});

test('deleting a category subtree removes subtree assignments', async () => {
    const rootPath = await makeTempDir();
    const stateFile = path.join(rootPath, 'category_state.json');
    const categoryState = createCategoryState({ fs, stateFile });

    await categoryState.saveCategoryState({
        version: 1,
        tree: [
            {
                id: 'cat_root',
                name: 'Root',
                children: [
                    {
                        id: 'cat_child',
                        name: 'Child',
                        children: []
                    }
                ]
            }
        ],
        assignments: {
            'game:abc': ['cat_root', 'cat_child'],
            'game:def': ['cat_child']
        }
    });

    const result = await categoryState.deleteCategory('cat_root');
    assert.equal(result.ok, true);

    const reloaded = await categoryState.loadCategoryState();
    assert.deepEqual(reloaded.tree, []);
    assert.deepEqual(reloaded.assignments, {});
});

test('loadCategoryState is a pure read and never writes to disk', async () => {
    const rootPath = await makeTempDir();
    const stateFile = path.join(rootPath, 'category_state.json');
    let writeCalls = 0;

    const wrappedFs = {
        ...fs,
        async writeFile(p, d, opts) {
            writeCalls++;
            return fs.writeFile(p, d, opts);
        }
    };

    const categoryState = createCategoryState({ fs: wrappedFs, stateFile });

    // 1. Missing file: loadCategoryState should NOT write anything
    const initial = await categoryState.loadCategoryState();
    assert.deepEqual(initial, { version: 1, tree: [], assignments: {} });
    assert.equal(writeCalls, 0, 'loadCategoryState on missing file must not write');

    // 2. Populated file: loadCategoryState should NOT write anything
    await categoryState.saveCategoryState({
        version: 1,
        tree: [{ id: 'cat1', name: 'Cat1', children: [] }],
        assignments: {}
    });
    const writesAfterSave = writeCalls;
    assert.ok(writesAfterSave > 0);

    const loaded = await categoryState.loadCategoryState();
    assert.equal(loaded.tree.length, 1);
    assert.equal(writeCalls, writesAfterSave, 'loadCategoryState on populated file must not write');
});

test('category-state: degraded state protects 0-byte or corrupted files and recovers', async () => {
    const rootPath = await makeTempDir();
    const stateFile = path.join(rootPath, 'category_state.json');

    const categoryState = createCategoryState({ fs, stateFile });

    // Cold start (missing file) is NOT degraded
    assert.equal(categoryState.isDegraded(), false);

    // Write a valid category state first to populate cache
    await categoryState.saveCategoryState({
        version: 1,
        tree: [{ id: 'cat1', name: 'Cat 1', children: [] }],
        assignments: { 'game1': ['cat1'] }
    });
    assert.equal(categoryState.isDegraded(), false);

    // Simulate 0-byte truncated file
    await fs.writeFile(stateFile, '');
    assert.equal((await fs.stat(stateFile)).size, 0);

    // loadCategoryState detects 0-byte truncated file, transitions to degraded
    const degradedResult = await categoryState.loadCategoryState();
    assert.equal(categoryState.isDegraded(), true);
    // Returns cached valid state
    assert.equal(degradedResult.tree.length, 1);

    // Mutator must reject and persistCategoryStateDirectly must abort
    const createRes = await categoryState.createCategory({ name: 'Should Fail' });
    assert.equal(createRes.ok, false);
    assert.equal(createRes.reason, 'degraded-state');

    await categoryState.saveCategoryState({ version: 1, tree: [], assignments: {} });
    // On-disk file must still be 0 bytes and untouched
    assert.equal((await fs.stat(stateFile)).size, 0);

    // Simulate restoring valid JSON file
    const validData = {
        version: 1,
        tree: [{ id: 'recovered', name: 'Recovered', children: [] }],
        assignments: {}
    };
    await fs.writeFile(stateFile, JSON.stringify(validData));

    const recovered = await categoryState.loadCategoryState();
    assert.deepEqual(recovered.tree, validData.tree);
    assert.equal(categoryState.isDegraded(), false);

    // Mutator now succeeds
    const addRes = await categoryState.createCategory({ name: 'New Cat' });
    assert.equal(addRes.ok, true);
});

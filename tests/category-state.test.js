const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

const { createCategoryState } = require('../src/main/category-state');

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

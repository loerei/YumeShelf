const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

const { findLocalGameImage } = require('../dist/main/icon-pipeline/service');

async function createTempGameTree(structure) {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'yumeshelf-icon-test-'));
    for (const [relPath, content] of Object.entries(structure)) {
        const full = path.join(tmpDir, relPath);
        await fs.mkdir(path.dirname(full), { recursive: true });
        await fs.writeFile(full, content || 'stub');
    }
    return {
        tmpDir,
        exePath: path.join(tmpDir, 'Game.exe'),
        async cleanup() {
            await fs.rm(tmpDir, { recursive: true, force: true });
        }
    };
}

test('findLocalGameImage: finds icon.png at root level', async () => {
    const tree = await createTempGameTree({
        'Game.exe': 'binary',
        'icon.png': 'image-data'
    });
    try {
        const result = findLocalGameImage(tree.exePath);
        assert.ok(result, 'should find image');
        assert.equal(result.ext, 'png');
        assert.equal(path.normalize(result.imgPath), path.normalize(path.join(tree.tmpDir, 'icon.png')));
    } finally {
        await tree.cleanup();
    }
});

test('findLocalGameImage: finds cover.jpg at root level', async () => {
    const tree = await createTempGameTree({
        'Game.exe': 'binary',
        'cover.jpg': 'image-data'
    });
    try {
        const result = findLocalGameImage(tree.exePath);
        assert.ok(result, 'should find image');
        assert.equal(result.ext, 'jpg');
        assert.equal(path.normalize(result.imgPath), path.normalize(path.join(tree.tmpDir, 'cover.jpg')));
    } finally {
        await tree.cleanup();
    }
});

test('findLocalGameImage: finds icon/icon.png in nested subfolder', async () => {
    const tree = await createTempGameTree({
        'Game.exe': 'binary',
        'icon/icon.png': 'nested-image-data'
    });
    try {
        const result = findLocalGameImage(tree.exePath);
        assert.ok(result, 'should find nested icon');
        assert.equal(result.ext, 'png');
        assert.equal(path.normalize(result.imgPath), path.normalize(path.join(tree.tmpDir, 'icon', 'icon.png')));
    } finally {
        await tree.cleanup();
    }
});

test('findLocalGameImage: finds www/icon/icon.png in RPG Maker MV web structure', async () => {
    const tree = await createTempGameTree({
        'Game.exe': 'binary',
        'www/icon/icon.png': 'www-nested-image-data'
    });
    try {
        const result = findLocalGameImage(tree.exePath);
        assert.ok(result, 'should find www/icon image');
        assert.equal(result.ext, 'png');
        assert.equal(path.normalize(result.imgPath), path.normalize(path.join(tree.tmpDir, 'www', 'icon', 'icon.png')));
    } finally {
        await tree.cleanup();
    }
});

test('findLocalGameImage: respects precedence (root icon > subfolder icon)', async () => {
    const tree = await createTempGameTree({
        'Game.exe': 'binary',
        'icon.png': 'root-icon-data',
        'icon/icon.png': 'nested-icon-data'
    });
    try {
        const result = findLocalGameImage(tree.exePath);
        assert.ok(result, 'should find root image first');
        assert.equal(path.normalize(result.imgPath), path.normalize(path.join(tree.tmpDir, 'icon.png')));
    } finally {
        await tree.cleanup();
    }
});

test('findLocalGameImage: returns null when no matching image exists', async () => {
    const tree = await createTempGameTree({
        'Game.exe': 'binary',
        'readme.txt': 'notes',
        'data/some.dat': 'data'
    });
    try {
        const result = findLocalGameImage(tree.exePath);
        assert.equal(result, null);
    } finally {
        await tree.cleanup();
    }
});

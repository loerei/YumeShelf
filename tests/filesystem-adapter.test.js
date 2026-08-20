const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
    createDirectorySymlink,
    isExecutable,
    normalizeCrossPlatformPath
} = require('../dist/main/core/filesystem-adapter');

async function makeTempDir() {
    return fs.mkdtemp(path.join(os.tmpdir(), 'yumeshelf-fs-test-'));
}

test('createDirectorySymlink creates a functional link to an existing directory', async () => {
    const tempDir = await makeTempDir();
    const sourceDir = path.join(tempDir, 'source_folder');
    const linkDir = path.join(tempDir, 'link_folder');

    await fs.mkdir(sourceDir, { recursive: true });
    await fs.writeFile(path.join(sourceDir, 'file.txt'), 'hello from source');

    await createDirectorySymlink(sourceDir, linkDir);

    assert.ok(fsSync.existsSync(linkDir), 'Link folder should exist');
    const content = await fs.readFile(path.join(linkDir, 'file.txt'), 'utf8');
    assert.equal(content, 'hello from source');
});

test('createDirectorySymlink is idempotent and replaces existing broken links or files', async () => {
    const tempDir = await makeTempDir();
    const sourceDir = path.join(tempDir, 'source_v1');
    const newSourceDir = path.join(tempDir, 'source_v2');
    const linkDir = path.join(tempDir, 'active_link');

    await fs.mkdir(sourceDir, { recursive: true });
    await fs.mkdir(newSourceDir, { recursive: true });
    await fs.writeFile(path.join(sourceDir, 'data.txt'), 'v1');
    await fs.writeFile(path.join(newSourceDir, 'data.txt'), 'v2');

    // First symlink
    await createDirectorySymlink(sourceDir, linkDir);
    assert.equal(await fs.readFile(path.join(linkDir, 'data.txt'), 'utf8'), 'v1');

    // Replace symlink with new target
    await createDirectorySymlink(newSourceDir, linkDir);
    assert.equal(await fs.readFile(path.join(linkDir, 'data.txt'), 'utf8'), 'v2');

    // Verify original source directory was not destroyed
    assert.equal(await fs.readFile(path.join(sourceDir, 'data.txt'), 'utf8'), 'v1');
});

test('isExecutable correctly identifies executable files', async () => {
    const tempDir = await makeTempDir();
    const exeFile = path.join(tempDir, 'game.exe');
    const textFile = path.join(tempDir, 'notes.txt');

    await fs.writeFile(exeFile, 'mock binary');
    await fs.writeFile(textFile, 'plain text');

    if (process.platform === 'win32') {
        assert.equal(await isExecutable(exeFile), true);
        assert.equal(await isExecutable(textFile), false);
    } else {
        await fs.chmod(exeFile, 0o755);
        await fs.chmod(textFile, 0o644);
        assert.equal(await isExecutable(exeFile), true);
        assert.equal(await isExecutable(textFile), false);
    }

    assert.equal(await isExecutable(path.join(tempDir, 'nonexistent.file')), false);
});

test('normalizeCrossPlatformPath normalizes separators', () => {
    const raw = path.join('foo', 'bar', '..', 'baz');
    const normalized = normalizeCrossPlatformPath(raw);
    assert.equal(normalized, path.join('foo', 'baz'));
});

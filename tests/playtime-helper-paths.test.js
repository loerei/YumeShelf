const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');

const {
    getHelperExeName,
    getNativeHelperProjectDir,
    getNativeHelperReleasePath,
    getPackagedHelperRelativePath,
    resolvePackagedHelperPath,
    resolvePlaytimeHelperPath,
    assertPlaytimeHelperExists
} = require('../dist/main/playtime-helper-paths');

test('getHelperExeName returns platform-specific binary name', () => {
    assert.equal(getHelperExeName('win32'), 'playtime-helper.exe');
    assert.equal(getHelperExeName('linux'), 'playtime-helper');
    assert.equal(getHelperExeName('darwin'), 'playtime-helper');
});

test('getNativeHelperReleasePath returns release binary path matching platform', () => {
    const winPath = getNativeHelperReleasePath('win32');
    assert.match(winPath, /[\\/]target[\\/]release[\\/]playtime-helper\.exe$/);

    const linuxPath = getNativeHelperReleasePath('linux');
    assert.match(linuxPath, /[\\/]target[\\/]release[\\/]playtime-helper$/);
});

test('getPackagedHelperRelativePath returns relative path matching platform', () => {
    assert.equal(getPackagedHelperRelativePath('win32'), path.join('native', 'playtime-helper', 'playtime-helper.exe'));
    assert.equal(getPackagedHelperRelativePath('linux'), path.join('native', 'playtime-helper', 'playtime-helper'));
});

test('resolvePackagedHelperPath resolves binary under resourcesPath', () => {
    const mockResources = path.join('/app', 'resources');
    const winPath = resolvePackagedHelperPath(mockResources, 'win32');
    assert.equal(winPath, path.join(mockResources, 'native', 'playtime-helper', 'playtime-helper.exe'));

    const linuxPath = resolvePackagedHelperPath(mockResources, 'linux');
    assert.equal(linuxPath, path.join(mockResources, 'native', 'playtime-helper', 'playtime-helper'));
});

test('resolvePlaytimeHelperPath handles packaged vs development mode across platforms', () => {
    const mockResources = path.join('/opt', 'YumeShelf', 'resources');

    // Packaged mode
    const packagedWin = resolvePlaytimeHelperPath({
        app: { isPackaged: true },
        resourcesPath: mockResources,
        platform: 'win32'
    });
    assert.equal(packagedWin, path.join(mockResources, 'native', 'playtime-helper', 'playtime-helper.exe'));

    const packagedLinux = resolvePlaytimeHelperPath({
        app: { isPackaged: true },
        resourcesPath: mockResources,
        platform: 'linux'
    });
    assert.equal(packagedLinux, path.join(mockResources, 'native', 'playtime-helper', 'playtime-helper'));

    // Dev mode
    const devLinux = resolvePlaytimeHelperPath({
        app: { isPackaged: false },
        platform: 'linux'
    });
    assert.match(devLinux, /[\\/]target[\\/]release[\\/]playtime-helper$/);
});

test('assertPlaytimeHelperExists validates helper binary existence', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'yumeshelf-helper-assert-'));
    const existingFile = path.join(tempDir, 'playtime-helper.exe');
    await fs.writeFile(existingFile, 'stub');

    assert.equal(assertPlaytimeHelperExists(existingFile), existingFile);

    const nonExistentFile = path.join(tempDir, 'does-not-exist.exe');
    assert.throws(() => {
        assertPlaytimeHelperExists(nonExistentFile);
    }, /Playtime helper was not found/);
});

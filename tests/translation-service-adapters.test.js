const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const zlib = require('node:zlib');

const { TranslationService } = require('../dist/main/translation/translation-service');

async function makeTempDir() {
    return fs.mkdtemp(path.join(os.tmpdir(), 'yumeshelf-trans-test-'));
}

function createSimpleZipBuffer(files) {
    const localHeaders = [];
    const centralHeaders = [];
    let offset = 0;

    for (const file of files) {
        const rawData = Buffer.from(file.content || '');
        const method = 0; // STORE
        const nameBuf = Buffer.from(file.name, 'utf8');

        // Local Header
        const localHeader = Buffer.alloc(30 + nameBuf.length);
        localHeader.writeUInt32LE(0x04034b50, 0);
        localHeader.writeUInt16LE(20, 4);
        localHeader.writeUInt16LE(0, 6);
        localHeader.writeUInt16LE(method, 8);
        localHeader.writeUInt16LE(0, 10);
        localHeader.writeUInt16LE(0, 12);
        localHeader.writeUInt32LE(0, 14);
        localHeader.writeUInt32LE(rawData.length, 18);
        localHeader.writeUInt32LE(rawData.length, 22);
        localHeader.writeUInt16LE(nameBuf.length, 26);
        localHeader.writeUInt16LE(0, 28);
        nameBuf.copy(localHeader, 30);
        localHeaders.push(localHeader, rawData);

        // Central Directory Header
        const centralHeader = Buffer.alloc(46 + nameBuf.length);
        centralHeader.writeUInt32LE(0x02014b50, 0);
        centralHeader.writeUInt16LE(0x0314, 4);
        centralHeader.writeUInt16LE(20, 6);
        centralHeader.writeUInt16LE(0, 8);
        centralHeader.writeUInt16LE(method, 10);
        centralHeader.writeUInt16LE(0, 12);
        centralHeader.writeUInt16LE(0, 14);
        centralHeader.writeUInt32LE(0, 16);
        centralHeader.writeUInt32LE(rawData.length, 20);
        centralHeader.writeUInt32LE(rawData.length, 24);
        centralHeader.writeUInt16LE(nameBuf.length, 28);
        centralHeader.writeUInt16LE(0, 30);
        centralHeader.writeUInt16LE(0, 32);
        centralHeader.writeUInt16LE(0, 34);
        centralHeader.writeUInt16LE(0, 36);
        const externalAttr = (0o100644 * 0x10000) >>> 0;
        centralHeader.writeUInt32LE(externalAttr, 38);
        centralHeader.writeUInt32LE(offset, 42);
        nameBuf.copy(centralHeader, 46);
        centralHeaders.push(centralHeader);

        offset += localHeader.length + rawData.length;
    }

    const centralDirBuffer = Buffer.concat(centralHeaders);
    const centralDirOffset = offset;
    const centralDirSize = centralDirBuffer.length;

    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(0, 4);
    eocd.writeUInt16LE(0, 6);
    eocd.writeUInt16LE(files.length, 8);
    eocd.writeUInt16LE(files.length, 10);
    eocd.writeUInt32LE(centralDirSize, 12);
    eocd.writeUInt32LE(centralDirOffset, 16);
    eocd.writeUInt16LE(0, 20);

    return Buffer.concat([...localHeaders, centralDirBuffer, eocd]);
}

test('TranslationService.extractZip uses cross-platform zip extractor without powershell', async () => {
    const tempDir = await makeTempDir();
    const zipPath = path.join(tempDir, 'sample.zip');
    const outDir = path.join(tempDir, 'extracted');

    const zipBuffer = createSimpleZipBuffer([
        { name: 'BepInEx/core/BepInEx.Preloader.dll', content: 'mock dll' },
        { name: 'winhttp.dll', content: 'mock shim' }
    ]);
    await fs.writeFile(zipPath, zipBuffer);

    const service = new TranslationService({
        translatorsDir: tempDir,
        appVersion: '1.0.0',
        broadcastStatus: () => {}
    });

    await service.extractZip(zipPath, outDir);

    assert.ok(fsSync.existsSync(path.join(outDir, 'BepInEx', 'core', 'BepInEx.Preloader.dll')));
    assert.ok(fsSync.existsSync(path.join(outDir, 'winhttp.dll')));
    assert.equal(await fs.readFile(path.join(outDir, 'winhttp.dll'), 'utf8'), 'mock shim');
});

test('TranslationService.deployShims links directories and generates configs', async () => {
    const tempDir = await makeTempDir();
    const corePath = path.join(tempDir, 'translators', 'xunity-mono-x64');
    const gameExeDir = path.join(tempDir, 'MyGame');

    await fs.mkdir(path.join(corePath, 'BepInEx', 'core'), { recursive: true });
    await fs.mkdir(gameExeDir, { recursive: true });
    await fs.writeFile(path.join(corePath, 'winhttp.dll'), 'shim data');
    await fs.writeFile(path.join(corePath, 'BepInEx', 'core', 'BepInEx.Preloader.dll'), 'preloader data');

    const service = new TranslationService({
        translatorsDir: path.join(tempDir, 'translators'),
        appVersion: '1.0.0',
        broadcastStatus: () => {}
    });

    await service.deployShims(gameExeDir, corePath, 'mono', 9876);

    // Verify doorstop_config.ini
    const doorstopConfig = await fs.readFile(path.join(gameExeDir, 'doorstop_config.ini'), 'utf8');
    assert.ok(doorstopConfig.includes('enabled=true'));
    assert.ok(doorstopConfig.includes('BepInEx.Preloader.dll'));

    // Verify AutoTranslatorConfig.ini
    const atConfig = await fs.readFile(path.join(corePath, 'BepInEx', 'config', 'AutoTranslatorConfig.ini'), 'utf8');
    assert.ok(atConfig.includes('127.0.0.1:9876/translate'));

    // Verify symlinks
    assert.ok(fsSync.existsSync(path.join(gameExeDir, 'BepInEx')));
    assert.ok(fsSync.existsSync(path.join(gameExeDir, 'AutoTranslator')));
    assert.ok(fsSync.existsSync(path.join(gameExeDir, 'Translation')));
});

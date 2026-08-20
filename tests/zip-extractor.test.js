const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const zlib = require('node:zlib');

const {
    extractZip,
    extractZipBuffer,
    sanitizeZipEntryPath,
    parseZipCentralDirectory
} = require('../dist/main/core/zip-extractor');

async function makeTempDir() {
    return fs.mkdtemp(path.join(os.tmpdir(), 'yumeshelf-zip-test-'));
}

/**
 * Helper to construct a standard valid ZIP buffer in memory.
 * @param {Array<{ name: string, content: Buffer | string, method?: number }>} files
 */
function createMockZipBuffer(files) {
    const localHeaders = [];
    const centralHeaders = [];
    let offset = 0;

    for (const file of files) {
        const isDir = file.name.endsWith('/') || file.name.endsWith('\\');
        const rawData = Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content || '');
        const method = isDir ? 0 : (file.method !== undefined ? file.method : 8); // 8 = DEFLATE, 0 = STORE

        let compressedData = rawData;
        if (method === 8 && !isDir) {
            compressedData = zlib.deflateRawSync(rawData);
        }

        const nameBuf = Buffer.from(file.name, 'utf8');

        // Local Header
        const localHeader = Buffer.alloc(30 + nameBuf.length);
        localHeader.writeUInt32LE(0x04034b50, 0); // signature
        localHeader.writeUInt16LE(20, 4); // version needed
        localHeader.writeUInt16LE(0, 6); // general flags
        localHeader.writeUInt16LE(method, 8); // compression method
        localHeader.writeUInt16LE(0, 10); // time
        localHeader.writeUInt16LE(0, 12); // date
        localHeader.writeUInt32LE(0, 14); // crc-32 (mock 0)
        localHeader.writeUInt32LE(compressedData.length, 18); // compressed size
        localHeader.writeUInt32LE(rawData.length, 22); // uncompressed size
        localHeader.writeUInt16LE(nameBuf.length, 26); // file name length
        localHeader.writeUInt16LE(0, 28); // extra field length
        nameBuf.copy(localHeader, 30);

        localHeaders.push(localHeader, compressedData);

        // Central Directory Header
        const centralHeader = Buffer.alloc(46 + nameBuf.length);
        centralHeader.writeUInt32LE(0x02014b50, 0); // signature
        centralHeader.writeUInt16LE(0x0314, 4); // version made by (UNIX 0x03, v2.0)
        centralHeader.writeUInt16LE(20, 6); // version needed
        centralHeader.writeUInt16LE(0, 8); // general flags
        centralHeader.writeUInt16LE(method, 10); // compression method
        centralHeader.writeUInt16LE(0, 12); // time
        centralHeader.writeUInt16LE(0, 14); // date
        centralHeader.writeUInt32LE(0, 16); // crc-32
        centralHeader.writeUInt32LE(compressedData.length, 20); // compressed size
        centralHeader.writeUInt32LE(rawData.length, 24); // uncompressed size
        centralHeader.writeUInt16LE(nameBuf.length, 28); // file name length
        centralHeader.writeUInt16LE(0, 30); // extra length
        centralHeader.writeUInt16LE(0, 32); // comment length
        centralHeader.writeUInt16LE(0, 34); // disk start
        centralHeader.writeUInt16LE(0, 36); // internal attr
        const unixAttr = isDir ? 0o040755 : 0o100644;
        const externalAttr = (unixAttr * 0x10000) >>> 0;
        centralHeader.writeUInt32LE(externalAttr, 38); // external attr (UNIX mode)
        centralHeader.writeUInt32LE(offset, 42); // local header offset
        nameBuf.copy(centralHeader, 46);

        centralHeaders.push(centralHeader);

        offset += localHeader.length + compressedData.length;
    }

    const centralDirBuffer = Buffer.concat(centralHeaders);
    const centralDirOffset = offset;
    const centralDirSize = centralDirBuffer.length;

    // End of Central Directory (EOCD)
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0); // signature
    eocd.writeUInt16LE(0, 4); // disk num
    eocd.writeUInt16LE(0, 6); // start disk
    eocd.writeUInt16LE(files.length, 8); // entries on disk
    eocd.writeUInt16LE(files.length, 10); // total entries
    eocd.writeUInt32LE(centralDirSize, 12); // central dir size
    eocd.writeUInt32LE(centralDirOffset, 16); // central dir offset
    eocd.writeUInt16LE(0, 20); // comment len

    return Buffer.concat([...localHeaders, centralDirBuffer, eocd]);
}

test('zip-extractor extracts DEFLATE and STORE files into nested directories', async () => {
    const tempDir = await makeTempDir();
    const zipBuffer = createMockZipBuffer([
        { name: 'BepInEx/', content: '' },
        { name: 'BepInEx/core/', content: '' },
        { name: 'BepInEx/core/BepInEx.Preloader.dll', content: 'Preloader binary content' },
        { name: 'doorstop_config.ini', content: 'enabled=true\n', method: 0 }
    ]);

    await extractZipBuffer(zipBuffer, tempDir);

    const preloaderContent = await fs.readFile(path.join(tempDir, 'BepInEx', 'core', 'BepInEx.Preloader.dll'), 'utf8');
    const doorstopContent = await fs.readFile(path.join(tempDir, 'doorstop_config.ini'), 'utf8');

    assert.equal(preloaderContent, 'Preloader binary content');
    assert.equal(doorstopContent, 'enabled=true\n');
});

test('zip-extractor normalizes Windows backslash paths into proper nested directories', async () => {
    const tempDir = await makeTempDir();
    const zipBuffer = createMockZipBuffer([
        { name: 'BepInEx\\plugins\\test_plugin.dll', content: 'Plugin code' }
    ]);

    await extractZipBuffer(zipBuffer, tempDir);

    const pluginPath = path.join(tempDir, 'BepInEx', 'plugins', 'test_plugin.dll');
    assert.ok(fsSync.existsSync(pluginPath), 'Nested file with backslash paths should be extracted into subfolders');
    assert.equal(await fs.readFile(pluginPath, 'utf8'), 'Plugin code');
});

test('zip-extractor prevents Zip Slip path traversal attacks', async () => {
    const tempDir = await makeTempDir();
    const maliciousZip = createMockZipBuffer([
        { name: '../../evil.txt', content: 'compromised' }
    ]);

    await assert.rejects(
        async () => {
            await extractZipBuffer(maliciousZip, tempDir);
        },
        /Zip Slip path traversal attempt detected/
    );
});

test('zip-extractor handles extractZip from disk file', async () => {
    const tempDir = await makeTempDir();
    const zipFilePath = path.join(tempDir, 'test.zip');
    const extractDest = path.join(tempDir, 'output');

    const zipBuffer = createMockZipBuffer([
        { name: 'readme.txt', content: 'YumeShelf Linux Support' }
    ]);
    await fs.writeFile(zipFilePath, zipBuffer);

    await extractZip(zipFilePath, extractDest);

    const extractedContent = await fs.readFile(path.join(extractDest, 'readme.txt'), 'utf8');
    assert.equal(extractedContent, 'YumeShelf Linux Support');
});

test('zip-extractor rejects corrupted or invalid ZIP buffers', async () => {
    const tempDir = await makeTempDir();
    const garbageBuffer = Buffer.from('This is not a zip file');

    await assert.rejects(
        async () => {
            await extractZipBuffer(garbageBuffer, tempDir);
        },
        /End of Central Directory \(EOCD\) signature not found/
    );
});

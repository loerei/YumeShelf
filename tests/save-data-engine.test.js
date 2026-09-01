const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

const distEngine = path.resolve(__dirname, '../dist/main/save-editor/engine');
const { SaveDataEngine } = require(distEngine);

test('SaveDataEngine - Deep Seam Contract & Format Routing', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'yumeshelf_engine_test_'));
    const saveDir = path.join(tmpDir, 'save');
    const dataDir = path.join(tmpDir, 'data');
    await fs.mkdir(saveDir, { recursive: true });
    await fs.mkdir(dataDir, { recursive: true });

    const mockConfig = {
        async getGamePaths(gameKey) {
            return {
                exeDir: tmpDir,
                saveDir: saveDir,
                dataDir: dataDir,
                langDataDir: null
            };
        },
        async loadMetadata() {
            return { variables: ['Var0', 'Gold'], switches: [] };
        }
    };

    const engine = new SaveDataEngine(mockConfig);

    // 1. Create a sample pure JSON save file
    const sampleSaveName = 'test_save.json';
    const sampleData = { gold: 500, _userMappings: { 1: 'Gold' }, $type: 'PureJsonSave' };
    await fs.writeFile(path.join(saveDir, sampleSaveName), JSON.stringify(sampleData), 'utf8');

    // 2. Test listSaveFiles
    const files = await engine.listSaveFiles('game:test');
    assert.deepEqual(files, [sampleSaveName], 'listSaveFiles must detect pure JSON save file');

    // 3. Test loadSave
    const loaded = await engine.loadSave('game:test', sampleSaveName);
    assert.equal(loaded.data.gold, 500, 'loadSave must deserialize save data correctly');
    assert.ok(loaded.metadata, 'loadSave must attach metadata');

    // 4. Test writeSave & sanitization
    loaded.data.gold = 9999;
    await engine.writeSave('game:test', sampleSaveName, loaded.data);

    // Verify written file on disk does NOT contain _userMappings or $type
    const rawWritten = await fs.readFile(path.join(saveDir, sampleSaveName), 'utf8');
    const parsedWritten = JSON.parse(rawWritten);
    assert.equal(parsedWritten.gold, 9999, 'writeSave must update data on disk');
    assert.equal(parsedWritten._userMappings, undefined, 'writeSave must sanitize _userMappings from disk');
    assert.equal(parsedWritten.$type, undefined, 'writeSave must sanitize $type from disk');

    // Cleanup
    await fs.rm(tmpDir, { recursive: true, force: true });
});

test('SaveDataEngine - customFormats routing uses injected strategy', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'yumeshelf_engine_custom_formats_'));
    const saveDir = path.join(tmpDir, 'save');
    const dataDir = path.join(tmpDir, 'data');
    await fs.mkdir(saveDir, { recursive: true });
    await fs.mkdir(dataDir, { recursive: true });

    const mockConfig = {
        async getGamePaths(gameKey) {
            return {
                exeDir: tmpDir,
                saveDir,
                dataDir,
                langDataDir: null
            };
        },
        async loadMetadata() {
            return { variables: [], switches: [] };
        }
    };

    let decodeCalled = 0;
    let encodeCalled = 0;

    const customFormat = {
        id: 'custom-bin',
        label: 'Custom Binary',
        match(filename) {
            return filename === 'test_custom.bin';
        },
        async decode(...args) {
            decodeCalled += 1;
            return {
                $type: 'CustomSave',
                _userMappings: {},
                value: 123
            };
        },
        async encode(saveObject, ...args) {
            encodeCalled += 1;
            return Buffer.from(JSON.stringify(saveObject), 'utf8');
        }
    };

    const engine = new SaveDataEngine(mockConfig, [customFormat]);

    const customSaveName = 'test_custom.bin';
    await fs.writeFile(path.join(saveDir, customSaveName), 'dummy-binary-data', 'utf8');

    const files = await engine.listSaveFiles('game:test');
    assert.ok(files.includes(customSaveName), 'listSaveFiles must detect custom format save file');

    const loaded = await engine.loadSave('game:test', customSaveName);
    assert.equal(decodeCalled, 1, 'custom format decode must be called once on loadSave');
    assert.equal(loaded.data.value, 123, 'loaded data should come from custom format decode');

    await engine.writeSave('game:test', customSaveName, loaded.data);
    assert.equal(encodeCalled, 1, 'custom format encode must be called once on writeSave');

    await fs.rm(tmpDir, { recursive: true, force: true });
});

test('SaveDataEngine - Negative tests for unsupported save formats', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'yumeshelf_engine_unsupported_'));
    const saveDir = path.join(tmpDir, 'save');
    const dataDir = path.join(tmpDir, 'data');
    await fs.mkdir(saveDir, { recursive: true });
    await fs.mkdir(dataDir, { recursive: true });

    const mockConfig = {
        async getGamePaths(gameKey) {
            return { exeDir: tmpDir, saveDir, dataDir, langDataDir: null };
        },
        async loadMetadata() { return { variables: [], switches: [] }; }
    };

    const engine = new SaveDataEngine(mockConfig);

    const unknownSaveName = 'unknown.unsupported_ext';
    await fs.writeFile(path.join(saveDir, unknownSaveName), 'some random data', 'utf8');

    const files = await engine.listSaveFiles('game:test');
    assert.ok(!files.includes(unknownSaveName), 'listSaveFiles must ignore unsupported file extensions');

    await assert.rejects(
        async () => { await engine.loadSave('game:test', unknownSaveName); },
        /Unsupported save file format/,
        'loadSave must throw Unsupported save file format error'
    );

    await assert.rejects(
        async () => { await engine.writeSave('game:test', unknownSaveName, { foo: 'bar' }); },
        /Unsupported save file format/,
        'writeSave must throw Unsupported save file format error'
    );

    await fs.rm(tmpDir, { recursive: true, force: true });
});

test('SaveDataEngine - Handles null paths and non-existent saveDir gracefully', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'yumeshelf_engine_missing_dir_'));
    const saveDir = path.join(tmpDir, 'nonexistent_save_dir');

    const nullPathsEngine = new SaveDataEngine({
        async getGamePaths() { return null; },
        async loadMetadata() { return { variables: [], switches: [] }; }
    });
    const nullPathFiles = await nullPathsEngine.listSaveFiles('game:test');
    assert.deepEqual(nullPathFiles, [], 'listSaveFiles must return empty array when getGamePaths returns null');

    const missingDirEngine = new SaveDataEngine({
        async getGamePaths() {
            return { exeDir: tmpDir, saveDir, dataDir: tmpDir, langDataDir: null };
        },
        async loadMetadata() { return { variables: [], switches: [] }; }
    });
    const missingDirFiles = await missingDirEngine.listSaveFiles('game:test');
    assert.deepEqual(missingDirFiles, [], 'listSaveFiles must return empty array when saveDir does not exist');

    await fs.rm(tmpDir, { recursive: true, force: true });
});

test('SaveDataEngine - renameSave handles success, collision, overwrite, format validation, and path traversal', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'yumeshelf_engine_rename_'));
    const saveDir = path.join(tmpDir, 'save');
    const dataDir = path.join(tmpDir, 'data');
    await fs.mkdir(saveDir, { recursive: true });
    await fs.mkdir(dataDir, { recursive: true });

    const mockConfig = {
        async getGamePaths(gameKey) {
            return { exeDir: tmpDir, saveDir, dataDir, langDataDir: null };
        },
        async loadMetadata() { return { variables: [], switches: [] }; }
    };

    const engine = new SaveDataEngine(mockConfig);

    const originalFile = 'save01.json';
    const originalBak = 'save01.json.bak';
    await fs.writeFile(path.join(saveDir, originalFile), JSON.stringify({ gold: 100 }), 'utf8');
    await fs.writeFile(path.join(saveDir, originalBak), JSON.stringify({ gold: 90 }), 'utf8');

    // 1. Success rename
    const renameRes = await engine.renameSave('game:test', originalFile, 'save02.json');
    assert.equal(renameRes.ok, true, 'renameSave must succeed on valid name');
    assert.equal(renameRes.renamed, true);
    assert.equal(renameRes.fileName, 'save02.json');

    const filesAfterRename = await engine.listSaveFiles('game:test');
    assert.deepEqual(filesAfterRename, ['save02.json']);
    assert.ok(await fs.stat(path.join(saveDir, 'save02.json.bak')).catch(() => false), 'Backup file must also be renamed');

    // 2. Same name returns renamed: false
    const sameNameRes = await engine.renameSave('game:test', 'save02.json', 'save02.json');
    assert.equal(sameNameRes.ok, true);
    assert.equal(sameNameRes.renamed, false);

    // 3. Collision without overwrite
    await fs.writeFile(path.join(saveDir, 'save03.json'), JSON.stringify({ gold: 300 }), 'utf8');
    const collisionRes = await engine.renameSave('game:test', 'save02.json', 'save03.json', false);
    assert.equal(collisionRes.ok, false);
    assert.equal(collisionRes.error, 'FILE_EXISTS');

    // 4. Collision with overwrite
    const overwriteRes = await engine.renameSave('game:test', 'save02.json', 'save03.json', true);
    assert.equal(overwriteRes.ok, true);
    assert.equal(overwriteRes.renamed, true);
    const contentAfterOverwrite = JSON.parse(await fs.readFile(path.join(saveDir, 'save03.json'), 'utf8'));
    assert.equal(contentAfterOverwrite.gold, 100, 'Overwritten file must contain source data');

    // 5. Unsupported format rejection
    await assert.rejects(
        async () => { await engine.renameSave('game:test', 'save03.json', 'invalid.exe'); },
        /Unsupported save file format/
    );

    // 6. Path traversal rejection
    await assert.rejects(
        async () => { await engine.renameSave('game:test', 'save03.json', '../../outside.json'); },
        /Path traversal detected/
    );

    // 7. Empty name rejection
    await assert.rejects(
        async () => { await engine.renameSave('game:test', 'save03.json', '   '); },
        /cannot be empty/
    );

    await fs.rm(tmpDir, { recursive: true, force: true });
});

test('SaveDataEngine - deleteSave deletes save and backup files safely', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'yumeshelf_engine_delete_'));
    const saveDir = path.join(tmpDir, 'save');
    const dataDir = path.join(tmpDir, 'data');
    await fs.mkdir(saveDir, { recursive: true });
    await fs.mkdir(dataDir, { recursive: true });

    const mockConfig = {
        async getGamePaths(gameKey) {
            return { exeDir: tmpDir, saveDir, dataDir, langDataDir: null };
        },
        async loadMetadata() { return { variables: [], switches: [] }; }
    };

    const engine = new SaveDataEngine(mockConfig);

    const targetFile = 'to_delete.json';
    const targetBak = 'to_delete.json.bak';
    await fs.writeFile(path.join(saveDir, targetFile), JSON.stringify({ gold: 50 }), 'utf8');
    await fs.writeFile(path.join(saveDir, targetBak), JSON.stringify({ gold: 40 }), 'utf8');

    const delRes = await engine.deleteSave('game:test', targetFile);
    assert.equal(delRes.ok, true);

    const filesAfterDelete = await engine.listSaveFiles('game:test');
    assert.deepEqual(filesAfterDelete, []);
    assert.ok(!(await fs.stat(path.join(saveDir, targetFile)).catch(() => false)), 'Save file must be removed');
    assert.ok(!(await fs.stat(path.join(saveDir, targetBak)).catch(() => false)), 'Backup file must also be removed');

    // Deleting non-existent file is safe
    const nonExistentRes = await engine.deleteSave('game:test', 'nonexistent.json');
    assert.equal(nonExistentRes.ok, true);

    // Path traversal rejection
    await assert.rejects(
        async () => { await engine.deleteSave('game:test', '../secret.json'); },
        /Path traversal detected/
    );

    await fs.rm(tmpDir, { recursive: true, force: true });
});

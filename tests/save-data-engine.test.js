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

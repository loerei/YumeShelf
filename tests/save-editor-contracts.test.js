const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// 1. Core Format Strategies to load and test
const formatsDir = path.resolve(__dirname, '../dist/main/save-editor/formats');
const getFormat = (name) => {
    const mod = require(path.join(formatsDir, name));
    return mod.default || mod;
};
const formats = {
    'rpg-maker-mv': getFormat('rpg-maker-mv'),
    'rpg-maker-mz': getFormat('rpg-maker-mz'),
    'rpg-wolf-sav': getFormat('rpg-wolf-sav'),
    'renpy': getFormat('renpy'),
    'unity-mono-bin': getFormat('unity-mono-bin'),
    'pure-json': getFormat('pure-json')
};

test('Strict Strategy Interface Contracts - All formats must implement standard API', () => {
    for (const [name, strategy] of Object.entries(formats)) {
        assert.ok(strategy, `Strategy ${name} must export a valid object`);
        assert.equal(typeof strategy.match, 'function', `Strategy ${name} must implement match(fileName)`);
        assert.equal(typeof strategy.decode, 'function', `Strategy ${name} must implement decode(...)`);
        assert.equal(typeof strategy.encode, 'function', `Strategy ${name} must implement encode(...)`);
    }
});

test('RPG Maker MV Format Contract - High-fidelity Base64 LZ-String compression round-trip', async () => {
    const strategy = formats['rpg-maker-mv'];
    assert.equal(strategy.match('save.rpgsave'), true);
    assert.equal(strategy.match('save.rpgsave2'), false);

    const testPayload = {
        gold: 9999,
        party: ['Actor1', 'Actor2'],
        variables: { _data: [0, 42, 99] }
    };

    // Encode
    const encodedBuffer = await strategy.encode(testPayload);
    assert.ok(Buffer.isBuffer(encodedBuffer), 'MV encode must return a Buffer');

    // Decode
    const decodedJson = await strategy.decode(encodedBuffer);
    assert.deepEqual(decodedJson, testPayload, 'MV round-trip must preserve exact JSON structure');
});

test('RPG Maker MZ Format Contract - Standard zlib-deflate compression round-trip', async () => {
    const strategy = formats['rpg-maker-mz'];
    assert.equal(strategy.match('file1.rmmzsave'), true);
    assert.equal(strategy.match('file1.rmmzsave_backup'), false);

    const testPayload = {
        system: { windowColor: [0, 0, 0, 0] },
        actors: { _data: ['MZ1', 'MZ2'] }
    };

    // Encode
    const encodedBuffer = await strategy.encode(testPayload);
    assert.ok(Buffer.isBuffer(encodedBuffer), 'MZ encode must return a Buffer');

    // Decode
    const decodedJson = await strategy.decode(encodedBuffer);
    assert.deepEqual(decodedJson, testPayload, 'MZ round-trip must preserve exact JSON structure');
});

function testCrypt(data, seeds) {
    const intervals = [1, 2, 5];
    const out = Buffer.from(data);
    for (let s = 0; s < seeds.length; s++) {
        const interval = intervals[s];
        let currentSeed = seeds[s];
        for (let i = 0; i < out.length; i += interval) {
            currentSeed = Math.imul(currentSeed, 0x343FD) + 0x269EC3;
            currentSeed >>>= 0;
            const keystream = (currentSeed >>> 28) & 7;
            out[i] ^= keystream;
        }
    }
    return out;
}

test('RPG Wolf SAV Format Contract - LCG XOR Cipher Involution & Sum-Checksum integrity', async () => {
    const strategy = formats['rpg-wolf-sav'];
    assert.equal(strategy.match('Save01.sav'), true);
    assert.equal(strategy.match('Save01.rpgsave'), false, 'Wolf strategy must exclude .rpgsave files');

    // 1. Verify Cipher Involution (Decryption followed by encryption with the same seeds is a perfect identity function)
    const originalPayload = crypto.randomBytes(256);
    const seeds = [0x5A, 0xBC, 0x12];

    const encrypted = testCrypt(originalPayload, seeds);
    const decrypted = testCrypt(encrypted, seeds);

    assert.ok(originalPayload.equals(decrypted), 'Wolf LCG-XOR cipher must be a perfect involution (reversible transformation)');

    // 2. Verify that encoding and checksum computation match the expected sum LSB rules
    const mockDecryptedBase64 = Buffer.alloc(200); // 200 bytes of zeros
    mockDecryptedBase64.writeInt32LE(800, 16); // Write array length marker
    mockDecryptedBase64.writeInt32LE(12345, 16 + 4 + 7 * 4); // Set Gold variable at index 7 to 12345

    const mockRawBase64 = Buffer.alloc(220); // 20 bytes header + 200 bytes payload
    mockRawBase64[0] = seeds[0];
    mockRawBase64[3] = seeds[1];
    mockRawBase64[9] = seeds[2];

    const inputPayload = {
        $type: 'RpgWolfSavBinaryInspection',
        fileName: 'Save01.sav',
        variables: { 7: 99999 }, // Update gold to 99999
        rawBase64: mockRawBase64.toString('base64'),
        _decryptedBase64: mockDecryptedBase64.toString('base64'),
        _varArrayOffset: 16 + 4
    };

    const finalBuffer = await strategy.encode(inputPayload);
    assert.ok(Buffer.isBuffer(finalBuffer), 'Wolf encode must output a valid Buffer');
    assert.equal(finalBuffer.length, 220, 'Wolf encode must preserve correct total file length');

    // Check seed retention
    assert.equal(finalBuffer[0], seeds[0]);
    assert.equal(finalBuffer[3], seeds[1]);
    assert.equal(finalBuffer[9], seeds[2]);

    // Check checksum recalculation: header[2] should be the byte sum LSB of the mutated payload
    const finalPayload = testCrypt(finalBuffer.subarray(20), seeds);
    let expectedSum = 0;
    for (let i = 0; i < finalPayload.length; i++) {
        expectedSum = (expectedSum + finalPayload[i]) & 0xFF;
    }
    assert.equal(finalBuffer[2], expectedSum, 'Wolf header checksum byte must reflect the exact lower 8 bits of the mutated decrypted payload sum');
});

test('RenPy and Unity Format Contracts - File Matching Rules', () => {
    assert.equal(formats['renpy'].match('1-LT1.save'), true);
    assert.equal(formats['renpy'].match('1-LT1.sav'), false);
    
    assert.equal(formats['unity-mono-bin'].match('global_save.bin'), true);
    assert.equal(formats['unity-mono-bin'].match('global_save.sav'), false);
});

test('Pure JSON Save Format Contract - Plain JSON parsing and round-trip', async () => {
    const strategy = formats['pure-json'];
    assert.equal(strategy.match('savedata0.json'), true);
    assert.equal(strategy.match('savedata0.sav'), false);

    const testPayload = {
        day: 1,
        trust: 100,
        prologueDone: false,
        osouziObjectsNum: [0, 0, 0]
    };

    const encodedBuffer = await strategy.encode(testPayload);
    assert.ok(Buffer.isBuffer(encodedBuffer), 'JSON encode must return a Buffer');

    const decodedJson = await strategy.decode(encodedBuffer);
    assert.equal(decodedJson.$type, 'PureJsonSave');
    
    const secondEncoded = await strategy.encode(decodedJson);
    const parsedSecond = JSON.parse(secondEncoded.toString('utf8'));
    assert.deepEqual(parsedSecond, testPayload, 'JSON round-trip must preserve exact payload');
});

test('SaveDataEngine - End-to-end writeSave with sanitizeSaveData preserves format inspection tokens', async () => {
    const { SaveDataEngine } = require('../dist/main/save-editor/engine');
    const strategy = formats['rpg-wolf-sav'];

    // Mock save binary in a temp folder
    const seeds = [0x12, 0x56, 0x78];
    const header = Buffer.alloc(20);
    header[0] = seeds[0];
    header[3] = seeds[1];
    header[9] = seeds[2];

    const decryptedPayload = Buffer.alloc(4 + 800 * 4);
    decryptedPayload.writeInt32LE(800, 0);
    decryptedPayload.writeInt32LE(777, 4 + 7 * 4); // Gold = 777

    let sum1 = 0;
    for (const b of decryptedPayload) sum1 = (sum1 + b) & 0xFF;
    header[2] = sum1;

    const encrypted = testCrypt(decryptedPayload, seeds);
    const mockSaveBuffer = Buffer.concat([header, encrypted]);

    const os = require('node:os');
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yumeshelf_wolf_contract_'));
    const saveFilePath = path.join(tempDir, 'SaveData01.sav');
    fs.writeFileSync(saveFilePath, mockSaveBuffer);

    const mockConfig = {
        async getGamePaths() {
            return { exeDir: tempDir, saveDir: tempDir, dataDir: tempDir, langDataDir: null };
        },
        async loadMetadata() { return {}; }
    };

    const engine = new SaveDataEngine(mockConfig, [strategy]);

    // 1. Load save via engine
    const { data: loadedData } = await engine.loadSave('mockGame', 'SaveData01.sav');
    assert.equal(loadedData.variables[7], 777);

    // 2. Modify gold & save via engine.writeSave (exercising sanitizeSaveData)
    loadedData.variables[7] = 888888;
    const writeResult = await engine.writeSave('mockGame', 'SaveData01.sav', loadedData);
    assert.equal(writeResult.ok, true);

    // 3. Reload and verify mutated value
    const { data: reloadedData } = await engine.loadSave('mockGame', 'SaveData01.sav');
    assert.equal(reloadedData.variables[7], 888888);

    // Clean up
    fs.rmSync(tempDir, { recursive: true, force: true });
});

test('SaveDataEngine - End-to-end writeSave with Wolf RPG segmented table matrix and system variables', async () => {
    const { SaveDataEngine } = require('../dist/main/save-editor/engine');
    const strategy = formats['rpg-wolf-sav'];

    // Construct synthetic segmented save payload: Tag 10 (502 system vars) + "save/system.sav\0" + 20 tables of 100 vars
    const seeds = [0xAA, 0xBB, 0xCC];
    const header = Buffer.alloc(20);
    header[0] = seeds[0];
    header[3] = seeds[1];
    header[9] = seeds[2];

    const sysVarCount = 502;
    const numTables = 20;
    const sysTagBuffer = Buffer.alloc(8 + sysVarCount * 4);
    sysTagBuffer.writeInt32LE(10, 0); // Tag 10
    sysTagBuffer.writeInt32LE(sysVarCount, 4);
    sysTagBuffer.writeInt32LE(202, 8 + 24 * 4); // sys_24 = 202

    const delimiter = Buffer.from('save/system.sav\0', 'utf8');
    const matrixHeader = Buffer.alloc(5);
    matrixHeader.writeInt32LE(numTables, 0);
    matrixHeader.writeUInt8(100, 4); // First table marker

    const matrixBody = Buffer.alloc(numTables * 401);
    for (let t = 0; t < numTables; t++) {
        // In table 15, variable 2 = 999999
        if (t === 15) {
            matrixBody.writeInt32LE(999999, t * 401 + 2 * 4);
        }
        if (t < numTables - 1) {
            matrixBody.writeUInt8(100, t * 401 + 400); // Next table marker
        }
    }

    const unencrypted = Buffer.concat([sysTagBuffer, delimiter, matrixHeader, matrixBody]);
    let sum2 = 0;
    for (const b of unencrypted) sum2 = (sum2 + b) & 0xFF;
    header[2] = sum2;

    const encrypted = testCrypt(unencrypted, seeds);
    const mockSaveBuffer = Buffer.concat([header, encrypted]);

    const os = require('node:os');
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yumeshelf_wolf_segmented_'));
    const saveFilePath = path.join(tempDir, 'SaveData04.sav');
    fs.writeFileSync(saveFilePath, mockSaveBuffer);

    const mockConfig = {
        async getGamePaths() {
            return { exeDir: tempDir, saveDir: tempDir, dataDir: tempDir, langDataDir: null };
        },
        async loadMetadata() { return {}; }
    };

    const engine = new SaveDataEngine(mockConfig, [strategy]);

    // 1. Load save
    const { data: loadedData } = await engine.loadSave('mockGame', 'SaveData04.sav');
    assert.equal(loadedData.variables['sys_24'], 202);
    assert.equal(loadedData.variables['1502'], 999999);

    // 2. Modify both system and table variables
    loadedData.variables['sys_24'] = 777;
    loadedData.variables['1502'] = 123456;
    const writeResult = await engine.writeSave('mockGame', 'SaveData04.sav', loadedData);
    assert.equal(writeResult.ok, true);

    // 3. Reload and verify
    const { data: reloadedData } = await engine.loadSave('mockGame', 'SaveData04.sav');
    assert.equal(reloadedData.variables['sys_24'], 777);
    assert.equal(reloadedData.variables['1502'], 123456);

    // Clean up
    fs.rmSync(tempDir, { recursive: true, force: true });
});

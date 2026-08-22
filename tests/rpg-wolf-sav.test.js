const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const wolfMod = require('../dist/main/save-editor/formats/rpg-wolf-sav.js');
const strategy = wolfMod.default || wolfMod;

test('Wolf RPG Save Format - 3-Seed LCG Stream Cipher roundtrip & checksum byte calculation', async () => {
    assert.ok(strategy, 'rpg-wolf-sav format strategy must be registered');

    const seeds = [0x42, 0x99, 0x1F];
    const rawPayload = Buffer.from('Testing Wolf RPG Stream Cipher with arbitrary binary data payload 1234567890', 'utf8');

    // 1. Encrypt payload
    const encrypted = strategy._crypt(rawPayload, seeds);
    assert.notDeepEqual(encrypted, rawPayload, 'Encrypted payload must differ from raw payload');

    // 2. Decrypt payload
    const decrypted = strategy._crypt(encrypted, seeds);
    assert.deepEqual(decrypted, rawPayload, 'Decrypted payload must match original raw payload 100%');
});

test('Wolf RPG Save Format - Decode & mutate flat variable array (Tag 10 standard)', async () => {
    const seeds = [0x11, 0x22, 0x33];
    const header = Buffer.alloc(20);
    header[0] = seeds[0];
    header[3] = seeds[1];
    header[9] = seeds[2];

    const varCount = 800;
    const tagBuffer = Buffer.alloc(8 + varCount * 4);
    tagBuffer.writeInt32LE(10, 0); // Tag 10
    tagBuffer.writeInt32LE(varCount, 4);
    tagBuffer.writeInt32LE(99900, 8 + 7 * 4); // Var 7 (Gold) = 99900
    tagBuffer.writeInt32LE(19, 8 + 4 * 4);    // Var 4 (Time Hour) = 19
    tagBuffer.writeInt32LE(10, 8 + 5 * 4);    // Var 5 (Time Min) = 10

    const encrypted = strategy._crypt(tagBuffer, seeds);
    const mockSaveBuffer = Buffer.concat([header, encrypted]);

    // 1. Decode save
    const decoded = await strategy.decode(mockSaveBuffer, null, 'SaveData02.sav');
    assert.equal(decoded.format, 'rpg-wolf-sav');
    assert.equal(decoded.variables['7'], 99900);
    assert.equal(decoded.variables['4'], 19);
    assert.equal(decoded.variables['5'], 10);

    // 2. Mutate values
    decoded.variables['7'] = 500000;
    decoded.variables['4'] = 22;

    // 3. Encode modified save
    const reEncoded = await strategy.encode(decoded);

    // 4. Verify checksum byte in header[2]
    const decryptedPayload = strategy._crypt(reEncoded.subarray(20), seeds);
    let expectedSum = 0;
    for (const b of decryptedPayload) expectedSum = (expectedSum + b) & 0xFF;
    assert.equal(reEncoded[2], expectedSum, 'Header checksum byte at header[2] must match decrypted payload sum LSB');

    // 5. Re-decode and verify mutated values
    const reDecoded = await strategy.decode(reEncoded, null, 'SaveData02.sav');
    assert.equal(reDecoded.variables['7'], 500000);
    assert.equal(reDecoded.variables['4'], 22);
});

test('Wolf RPG Save Format - Decode & mutate segmented table matrix (500-table layout)', async () => {
    const seeds = [0x55, 0x66, 0x77];
    const header = Buffer.alloc(20);
    header[0] = seeds[0];
    header[3] = seeds[1];
    header[9] = seeds[2];

    const numTables = 50;
    const delimiter = Buffer.from('save/system.sav\0', 'utf8');
    const matrixHeader = Buffer.alloc(5);
    matrixHeader.writeInt32LE(numTables, 0);
    matrixHeader.writeUInt8(100, 4); // First table marker

    const matrixBody = Buffer.alloc(numTables * 401);
    for (let t = 0; t < numTables; t++) {
        if (t === 30) {
            matrixBody.writeInt32LE(999999, t * 401 + 2 * 4); // Table 30 Var 2 = 999999
        }
        if (t < numTables - 1) {
            matrixBody.writeUInt8(100, t * 401 + 400); // Table delimiter marker
        }
    }

    const unencrypted = Buffer.concat([delimiter, matrixHeader, matrixBody]);
    const encrypted = strategy._crypt(unencrypted, seeds);
    const mockSaveBuffer = Buffer.concat([header, encrypted]);

    // 1. Decode save
    const decoded = await strategy.decode(mockSaveBuffer, null, 'SaveData04.sav');
    assert.equal(decoded.variables['3002'], 999999);
    assert.ok(decoded.tables['30'], 'Active table 30 must be populated in tables record');
    assert.equal(decoded.tables['30']['2'], 999999);

    // 2. Mutate value
    decoded.variables['3002'] = 111222;

    // 3. Encode & verify
    const reEncoded = await strategy.encode(decoded);
    const reDecoded = await strategy.decode(reEncoded, null, 'SaveData04.sav');
    assert.equal(reDecoded.variables['3002'], 111222);
});

test('Wolf RPG Save Format - Unified coexistence of System Variables (sys_X) and Database Matrix', async () => {
    const seeds = [0xDE, 0xAD, 0xBE];
    const header = Buffer.alloc(20);
    header[0] = seeds[0];
    header[3] = seeds[1];
    header[9] = seeds[2];

    const sysVarCount = 502;
    const sysTagBuffer = Buffer.alloc(8 + sysVarCount * 4);
    sysTagBuffer.writeInt32LE(10, 0); // Tag 10
    sysTagBuffer.writeInt32LE(sysVarCount, 4);
    sysTagBuffer.writeInt32LE(202, 8 + 24 * 4); // sys_24 = 202
    sysTagBuffer.writeInt32LE(1454, 8 + 7 * 4); // sys_7 (Playtime) = 1454

    const numTables = 10;
    const delimiter = Buffer.from('save/system.sav\0', 'utf8');
    const matrixHeader = Buffer.alloc(5);
    matrixHeader.writeInt32LE(numTables, 0);
    matrixHeader.writeUInt8(100, 4);

    const matrixBody = Buffer.alloc(numTables * 401);
    for (let t = 0; t < numTables; t++) {
        if (t === 5) {
            matrixBody.writeInt32LE(777, t * 401 + 10 * 4); // Table 5 Var 10 = 777
        }
        if (t < numTables - 1) matrixBody.writeUInt8(100, t * 401 + 400);
    }

    const unencrypted = Buffer.concat([sysTagBuffer, delimiter, matrixHeader, matrixBody]);
    const encrypted = strategy._crypt(unencrypted, seeds);
    const mockSaveBuffer = Buffer.concat([header, encrypted]);

    // 1. Decode save
    const decoded = await strategy.decode(mockSaveBuffer, null, 'SaveData_Unified.sav');
    assert.equal(decoded.variables['sys_24'], 202, 'System variable 24 must match 202');
    assert.equal(decoded.variables['sys_7'], 1454, 'System variable 7 must match 1454');
    assert.equal(decoded.variables['510'], 777, 'Matrix table 5 var 10 must match 777');
    assert.ok(decoded.aux_n14['0'], 'aux_n14 table 0 must be present');
    assert.equal(decoded.aux_n14['0']['24'], 202);

    // 2. Modify both namespaces
    decoded.variables['sys_24'] = 303;
    decoded.variables['510'] = 888;

    // 3. Re-encode & Re-decode
    const reEncoded = await strategy.encode(decoded);
    const reDecoded = await strategy.decode(reEncoded, null, 'SaveData_Unified.sav');
    assert.equal(reDecoded.variables['sys_24'], 303, 'Mutated system variable must persist across encode');
    assert.equal(reDecoded.variables['510'], 888, 'Mutated matrix variable must persist across encode');
});

test('Wolf RPG Save Format - Metadata cache extracts custom names and invalidates on mtime drift', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yumeshelf_wolf_meta_'));
    const basicDataDir = path.join(tempDir, 'Data', 'BasicData');
    fs.mkdirSync(basicDataDir, { recursive: true });

    const dbFile = path.join(basicDataDir, 'SysDatabase.project');
    
    // Construct synthetic database buffer with marker '通常変数名'
    const marker = Buffer.from('通常変数名\0所持金\0スキルPT\0HP\0', 'utf8');
    fs.writeFileSync(dbFile, marker);

    // 1. Cold extraction
    const metaCold = await strategy.metadata({}, { exeDir: tempDir }, 'SaveData01.sav');
    assert.equal(metaCold.variables[0], '所持金');
    assert.equal(metaCold.variables[1], 'スキルPT');
    assert.equal(metaCold.variables[2], 'HP');

    // 2. Warm cache extraction (no disk read)
    const metaWarm = await strategy.metadata({}, { exeDir: tempDir }, 'SaveData02.sav');
    assert.equal(metaWarm.variables[0], '所持金');

    // 3. Update database file and verify mtime invalidation
    await new Promise(r => setTimeout(r, 10)); // Ensure mtime advances
    const updatedMarker = Buffer.from('通常変数名\0Gold_Modded\0Mana\0', 'utf8');
    fs.writeFileSync(dbFile, updatedMarker);

    const metaRefreshed = await strategy.metadata({}, { exeDir: tempDir }, 'SaveData03.sav');
    assert.equal(metaRefreshed.variables[0], 'Gold_Modded');
    assert.equal(metaRefreshed.variables[1], 'Mana');

    // Clean up
    fs.rmSync(tempDir, { recursive: true, force: true });
});
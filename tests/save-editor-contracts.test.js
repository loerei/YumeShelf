const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// 1. Core Format Strategies to load and test
const formatsDir = path.resolve(__dirname, '../src/main/save-editor/formats');
const formats = {
    'rpg-maker-mv': require(path.join(formatsDir, 'rpg-maker-mv')),
    'rpg-maker-mz': require(path.join(formatsDir, 'rpg-maker-mz')),
    'rpg-wolf-sav': require(path.join(formatsDir, 'rpg-wolf-sav')),
    'renpy': require(path.join(formatsDir, 'renpy')),
    'unity-mono-bin': require(path.join(formatsDir, 'unity-mono-bin')),
    'pure-json': require(path.join(formatsDir, 'pure-json'))
};

test('Strict Strategy Interface Contracts - All formats must implement standard API', () => {
    for (const [name, strategy] of Object.entries(formats)) {
        assert.ok(strategy, `Strategy ${name} must export a valid object`);
        assert.equal(typeof strategy.match, 'function', `Strategy ${name} must implement match(fileName)`);
        assert.equal(typeof strategy.decode, 'function', `Strategy ${name} must implement decode(...)`);
        assert.equal(typeof strategy.encode, 'function', `Strategy ${name} must implement encode(...)`);
    }
});

test('RPG Maker MV Format Contract - High-fidelity Base64 LZ-String compression round-trip', () => {
    const strategy = formats['rpg-maker-mv'];
    assert.equal(strategy.match('save.rpgsave'), true);
    assert.equal(strategy.match('save.rpgsave2'), false);

    const testPayload = {
        gold: 9999,
        party: ['Actor1', 'Actor2'],
        variables: { _data: [0, 42, 99] }
    };

    // Encode
    const encodedBuffer = strategy.encode(testPayload);
    assert.ok(Buffer.isBuffer(encodedBuffer), 'MV encode must return a Buffer');

    // Decode
    const decodedJson = strategy.decode(encodedBuffer);
    assert.deepEqual(decodedJson, testPayload, 'MV round-trip must preserve exact JSON structure');
});

test('RPG Maker MZ Format Contract - Standard zlib-deflate compression round-trip', () => {
    const strategy = formats['rpg-maker-mz'];
    assert.equal(strategy.match('file1.rmmzsave'), true);
    assert.equal(strategy.match('file1.rmmzsave_backup'), false);

    const testPayload = {
        system: { windowColor: [0, 0, 0, 0] },
        actors: { _data: ['MZ1', 'MZ2'] }
    };

    // Encode
    const encodedBuffer = strategy.encode(testPayload);
    assert.ok(Buffer.isBuffer(encodedBuffer), 'MZ encode must return a Buffer');

    // Decode
    const decodedJson = strategy.decode(encodedBuffer);
    assert.deepEqual(decodedJson, testPayload, 'MZ round-trip must preserve exact JSON structure');
});

test('RPG Wolf SAV Format Contract - LCG XOR Cipher Involution & Sum-Checksum integrity', () => {
    const strategy = formats['rpg-wolf-sav'];
    assert.equal(strategy.match('Save01.sav'), true);
    assert.equal(strategy.match('Save01.rpgsave'), false, 'Wolf strategy must exclude .rpgsave files');

    // 1. Verify Cipher Involution (Decryption followed by encryption with the same seeds is a perfect identity function)
    const originalPayload = crypto.randomBytes(256);
    const seeds = [0x5A, 0xBC, 0x12];

    const encrypted = strategy._crypt(originalPayload, seeds);
    const decrypted = strategy._crypt(encrypted, seeds);

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

    const finalBuffer = strategy.encode(inputPayload);
    assert.ok(Buffer.isBuffer(finalBuffer), 'Wolf encode must output a valid Buffer');
    assert.equal(finalBuffer.length, 220, 'Wolf encode must preserve correct total file length');

    // Check seed retention
    assert.equal(finalBuffer[0], seeds[0]);
    assert.equal(finalBuffer[3], seeds[1]);
    assert.equal(finalBuffer[9], seeds[2]);

    // Check checksum recalculation: header[2] should be the byte sum LSB of the mutated payload
    const finalPayload = strategy._crypt(finalBuffer.subarray(20), seeds);
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

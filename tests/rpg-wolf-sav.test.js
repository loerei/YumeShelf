const fs = require('fs/promises');
const path = require('path');
const rpgWolfSav = require('../src/main/save-editor/formats/rpg-wolf-sav.js');

const SAVE_DIR = path.join(__dirname, '..', 'YumeShelf', '[Kimochi] Imouto -Fantasy- DLC V0.1 Translation', '[Kimochi] Imouto -Fantasy- DLC V0.1 Translation', 'Save');

async function testWolfSavRoundtrip() {
    console.log('=== RPG Wolf Save Format Unit Test ===');
    
    const saveFile = path.join(SAVE_DIR, 'SaveData03.sav.temp_bak');
    try {
        await fs.access(saveFile);
    } catch {
        console.log(`[TEST] Skip: Save file not found at ${saveFile}`);
        return;
    }
    
    console.log(`Reading save file from: ${saveFile}`);
    const rawData = await fs.readFile(saveFile);
    
    // 1. Decode original
    console.log('1. Decoding original save file...');
    const decoded = rpgWolfSav.decode(rawData, null, 'SaveData03.sav.temp_bak');
    const originalGold = decoded.variables[7];
    console.log(`   Original Gold (Var #7): ${originalGold}`);
    
    // 2. Modify value
    console.log('2. Modifying Gold to 123456...');
    decoded.variables[7] = 123456;
    
    // 3. Encode modified
    console.log('3. Encoding modified save file...');
    const encodedData = rpgWolfSav.encode(decoded);
    
    // 4. Decode modified to verify
    console.log('4. Decoding encoded save file to verify changes and checksum...');
    const reDecoded = rpgWolfSav.decode(encodedData, null, 'SaveData03.sav');
    const newGold = reDecoded.variables[7];
    console.log(`   Encoded Gold (Var #7): ${newGold}`);
    
    if (newGold !== 123456) {
        throw new Error(`Expected Gold to be 123456, but got ${newGold}`);
    }
    
    // 5. Verify checksum byte in the encoded header
    const expectedChecksum = Buffer.from(reDecoded._decryptedBase64, 'base64')
        .reduce((sum, byte) => (sum + byte) & 0xFF, 0);
    const actualChecksum = encodedData[2];
    
    console.log(`   Expected Header Checksum Byte: 0x${expectedChecksum.toString(16).toUpperCase()}`);
    console.log(`   Actual Header Checksum Byte:   0x${actualChecksum.toString(16).toUpperCase()}`);
    
    if (actualChecksum !== expectedChecksum) {
        throw new Error(`Checksum mismatch! Expected 0x${expectedChecksum.toString(16)}, got 0x${actualChecksum.toString(16)}`);
    }
    
    console.log('=== TEST PASSED SUCCESSFULLY ===\n');
}

testWolfSavRoundtrip().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});

const fs = require('node:fs');
const path = require('node:path');
const LZString = require('../dist/main/core/lz-string');
const format = require('../dist/main/save-editor/formats/rpg-maker-mv');

async function run() {
    const saveFilePath = path.join(
        __dirname,
        '../YumeShelf/A_Simple_Life_with_My_Unobtrusive_Sister_v1.00_rev1-win/A Simple Life with My Unobtrusive Sister v1.00 rev1-win/www/save/file1.rpgsave'
    );

    console.log('Reading:', saveFilePath);
    const rawBuffer = fs.readFileSync(saveFilePath);
    const originalBase64 = rawBuffer.toString('utf8');

    console.log('Original Base64 Length:', originalBase64.length);
    console.log('Original Base64 first 100 chars:', originalBase64.slice(0, 100));

    // Decode
    console.log('Decoding...');
    let decodedJson;
    try {
        decodedJson = format.decode(rawBuffer);
        console.log('Successfully decoded!');
        console.log('Type of decoded:', typeof decodedJson);
        console.log('Keys in decoded object:', Object.keys(decodedJson));
        if (decodedJson.party) {
            console.log('Party Gold:', decodedJson.party._gold);
        }
    } catch (err) {
        console.error('Failed to decode original:', err);
        return;
    }

    // Encode
    console.log('Encoding back...');
    const encodedBuffer = format.encode(decodedJson);
    const recompressedBase64 = encodedBuffer.toString('utf8');
    console.log('Recompressed Base64 Length:', recompressedBase64.length);
    console.log('Recompressed Base64 first 100 chars:', recompressedBase64.slice(0, 100));

    // Decode the recompressed
    console.log('Decoding recompressed...');
    try {
        const decodedRecompressed = format.decode(encodedBuffer);
        console.log('Successfully decoded recompressed!');
        if (decodedRecompressed.party) {
            console.log('Party Gold in recompressed:', decodedRecompressed.party._gold);
        }
        
        const originalString = JSON.stringify(decodedJson);
        const roundtripString = JSON.stringify(decodedRecompressed);
        console.log('Are decoded structures string-identical?', originalString === roundtripString);
    } catch (err) {
        console.error('Failed to decode recompressed:', err);
    }

    console.log('Are base64 strings identical?', originalBase64 === recompressedBase64);
    if (originalBase64 !== recompressedBase64) {
        console.log('Difference in length:', originalBase64.length - recompressedBase64.length);
        // Compare character by character
        let diffCount = 0;
        for (let i = 0; i < Math.max(originalBase64.length, recompressedBase64.length); i++) {
            if (originalBase64[i] !== recompressedBase64[i]) {
                if (diffCount < 5) {
                    console.log(`Mismatch at index ${i}: Original='${originalBase64[i] || ""}', Recompressed='${recompressedBase64[i] || ""}'`);
                }
                diffCount++;
            }
        }
        console.log('Total character differences:', diffCount);
    }
}

run().catch(console.error);

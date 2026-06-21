const fs = require('node:fs');
const path = require('node:path');
const format = require('../dist/main/save-editor/formats/rpg-maker-mv');

function testMutation() {
    const saveFilePath = path.join(
        __dirname,
        '../YumeShelf/A_Simple_Life_with_My_Unobtrusive_Sister_v1.00_rev1-win/A Simple Life with My Unobtrusive Sister v1.00 rev1-win/www/save/file1.rpgsave'
    );

    console.log('Reading for mutation test:', saveFilePath);
    const rawBuffer = fs.readFileSync(saveFilePath);
    const originalJson = format.decode(rawBuffer);

    // Let's copy it
    const clonedJson = JSON.parse(JSON.stringify(originalJson));

    const variablesObj = clonedJson.variables || clonedJson._variables;
    let rawVars = variablesObj;
    if (variablesObj && variablesObj._data !== undefined) {
        rawVars = variablesObj._data;
    }
    if (rawVars && rawVars['@a'] !== undefined) {
        rawVars = rawVars['@a'];
    } else if (rawVars && rawVars._data !== undefined) {
        rawVars = rawVars._data;
    }
    if (!Array.isArray(rawVars)) {
        console.error('Raw variables array not found!', rawVars);
        return;
    }

    console.log('Original variable 15 value:', rawVars[15]);

    // Apply mutation using direct array assignment (which is what grid-renderer now does!)
    const targetValue = 999;
    rawVars[15] = targetValue;
    console.log('Mutated variable 15 value in memory:', rawVars[15]);

    // Encode
    console.log('Encoding mutated save...');
    const encodedBuffer = format.encode(clonedJson);

    // Decode again to verify persistence
    console.log('Decoding mutated save to verify...');
    const decodedMutated = format.decode(encodedBuffer);
    const decodedVarsObj = decodedMutated.variables || decodedMutated._variables;
    let decodedRawVars = decodedVarsObj;
    if (decodedVarsObj && decodedVarsObj._data !== undefined) {
        decodedRawVars = decodedVarsObj._data;
    }
    if (decodedRawVars && decodedRawVars['@a'] !== undefined) {
        decodedRawVars = decodedRawVars['@a'];
    } else if (decodedRawVars && decodedRawVars._data !== undefined) {
        decodedRawVars = decodedRawVars._data;
    }
    console.log('Decoded variable 15 value:', decodedRawVars[15]);

    if (decodedRawVars[15] === targetValue) {
        console.log('SUCCESS: Mutation verified and successfully round-tripped!');
    } else {
        console.error('FAILURE: Mutation lost or reverted during serialization!');
    }
}

testMutation();

const fs = require('fs');
const path = require('path');
const format = require('../dist/main/save-editor/formats/rpg-maker-mv');
const { RpgMakerEngine } = require('../dist/renderer/save-editor/engines/rpg-maker');

function testExtractMutation() {
    const saveFilePath = path.join(
        __dirname,
        '../YumeShelf/A_Simple_Life_with_My_Unobtrusive_Sister_v1.00_rev1-win/A Simple Life with My Unobtrusive Sister v1.00 rev1-win/www/save/file1.rpgsave'
    );

    console.log('Reading for extraction mutation test:', saveFilePath);
    const rawBuffer = fs.readFileSync(saveFilePath);
    const originalJson = format.decode(rawBuffer);

    // Let's copy it
    const clonedJson = JSON.parse(JSON.stringify(originalJson));

    const engine = new RpgMakerEngine();
    const root = engine.extractRoot(clonedJson);
    const variables = root.variables || root._variables;

    console.log('Variables object structure before extraction:', JSON.stringify(variables).slice(0, 150));

    // Extract the raw container
    const raw = engine.extractData(variables);
    console.log('Extracted raw array type:', Array.isArray(raw) ? 'Array' : typeof raw);
    console.log('Original variable 15 value:', raw[15]);

    // Mutate the raw array directly!
    const targetVal = 1337;
    raw[15] = targetVal;

    // Verify if it modified the nested property in clonedJson
    console.log('Variables object structure after extraction & mutation:', JSON.stringify(variables).slice(0, 150));

    // Encode
    console.log('Encoding mutated save...');
    const encodedBuffer = format.encode(clonedJson);

    // Decode again to verify persistence
    console.log('Decoding mutated save to verify...');
    const decodedMutated = format.decode(encodedBuffer);
    const decodedRoot = engine.extractRoot(decodedMutated);
    const decodedVariables = decodedRoot.variables || decodedRoot._variables;
    const decodedRaw = engine.extractData(decodedVariables);

    console.log('Decoded variable 15 value:', decodedRaw[15]);

    if (decodedRaw[15] === targetVal) {
        console.log('SUCCESS: Mutation using extractData successfully round-tripped!');
    } else {
        console.error('FAILURE: Mutation using extractData did not persist!');
    }
}

testExtractMutation();

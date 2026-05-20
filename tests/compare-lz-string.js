const fs = require('fs');
const path = require('path');

const localLZString = require('../dist/main/core/lz-string');

// Load game's lz-string.js and expose it
const gameLZStringPath = path.join(
    __dirname,
    '../YumeShelf/A_Simple_Life_with_My_Unobtrusive_Sister_v1.00_rev1-win/A Simple Life with My Unobtrusive Sister v1.00 rev1-win/www/js/libs/lz-string.js'
);
const gameLZStringCode = fs.readFileSync(gameLZStringPath, 'utf8');

// The game's lz-string.js typically defines a global variable LZString or exports it
const gameModule = {};
const context = { module: gameModule, exports: {} };
// Standard RPG Maker MV lz-string is usually defined as global LZString.
// Let's execute it in a simple VM or function context.
const runCode = new Function('exports', 'module', gameLZStringCode + '\nreturn LZString;');
const gameLZString = runCode(context.exports, gameModule);

console.log('Local LZString keys:', Object.keys(localLZString));
console.log('Game LZString keys:', Object.keys(gameLZString));

// Test round-trips
const testJson = JSON.stringify({
    system: { gameTitle: "Test Game" },
    party: { _gold: 12345 },
    switches: [null, true, false, true],
    variables: [null, 100, "hello", 200]
});

console.log('\n--- Comparing Compression Results ---');
const localComp = localLZString.compressToBase64(testJson);
const gameComp = gameLZString.compressToBase64(testJson);

console.log('Local compressed length:', localComp.length);
console.log('Game compressed length:', gameComp.length);
console.log('Are compressed strings identical?', localComp === gameComp);
if (localComp !== gameComp) {
    console.log('Local:', localComp);
    console.log('Game: ', gameComp);
}

console.log('\n--- Comparing Decompression Cross-compatibility ---');
try {
    const localDecompOfLocal = localLZString.decompressFromBase64(localComp);
    const gameDecompOfLocal = gameLZString.decompressFromBase64(localComp);
    console.log('Game can decompress Local output:', gameDecompOfLocal === testJson);
    if (gameDecompOfLocal !== testJson) {
        console.log('Decompressed by game:', gameDecompOfLocal);
    }
} catch (e) {
    console.error('Error during game decompress of local:', e);
}

try {
    const localDecompOfGame = localLZString.decompressFromBase64(gameComp);
    const gameDecompOfGame = gameLZString.decompressFromBase64(gameComp);
    console.log('Local can decompress Game output:', localDecompOfGame === testJson);
} catch (e) {
    console.error('Error during local decompress of game:', e);
}

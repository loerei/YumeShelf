const path = require('path');
const { exists, globMatch } = require('./utils');

async function detectEngine(exeDir) {
    // RPG Maker MV/MZ — www/ folder with js/
    if (await exists(path.join(exeDir, 'www', 'js'))) return 'rpg-mv-mz';

    // RPG Maker VX Ace — Data/ folder with .rvdata2 files
    const dataDir = path.join(exeDir, 'Data');
    if (await exists(dataDir) && await globMatch(dataDir, /\.rvdata2$/i)) return 'rpg-vxace';

    // Ren'Py — game/ folder or lib/windows-* folder
    if (await exists(path.join(exeDir, 'game')) && await globMatch(path.join(exeDir, 'game'), /\.rpy$/i)) return 'renpy';
    if (await globMatch(path.join(exeDir, 'lib'), /^windows-/i)) return 'renpy';

    // Unity — UnityPlayer.dll
    if (await exists(path.join(exeDir, 'UnityPlayer.dll'))) return 'unity';

    // Unreal Engine — Engine/Binaries structure
    if (await exists(path.join(exeDir, 'Engine', 'Binaries'))) return 'unreal';

    // Wolf RPG — .wolf files or binary game.ini alongside exe
    if (await globMatch(exeDir, /\.wolf$/i)) return 'wolf-rpg';

    // Flash/AIR — .swf files
    if (await globMatch(exeDir, /\.swf$/i)) return 'flash';

    return null;
}

module.exports = { detectEngine };

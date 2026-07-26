import { FileSystemProvider, GameEngineType } from './types';
import { DefaultFileSystemProvider } from './fs-provider';

export type { GameEngineType };

const defaultFs = new DefaultFileSystemProvider();

export async function detectEngine(
    exeDir: string,
    fs: FileSystemProvider = defaultFs
): Promise<GameEngineType | null> {
    // RPG Maker MV/MZ — www/ folder with js/
    if (await fs.exists(fs.join(exeDir, 'www', 'js'))) return 'rpg-mv-mz';

    // RPG Maker VX Ace — Data/ folder with .rvdata2 files
    const dataDir = fs.join(exeDir, 'Data');
    if ((await fs.exists(dataDir)) && (await fs.globMatch(dataDir, /\.rvdata2$/i))) return 'rpg-vxace';

    // Ren'Py — game/ folder with .rpy or lib/windows-* folder
    if ((await fs.exists(fs.join(exeDir, 'game'))) && (await fs.globMatch(fs.join(exeDir, 'game'), /\.rpy$/i))) return 'renpy';
    if (await fs.globMatch(fs.join(exeDir, 'lib'), /^windows-/i)) return 'renpy';

    // Unity — UnityPlayer.dll
    if (await fs.exists(fs.join(exeDir, 'UnityPlayer.dll'))) return 'unity';

    // Unreal Engine — Engine/Binaries structure
    if (await fs.exists(fs.join(exeDir, 'Engine', 'Binaries'))) return 'unreal';

    // Wolf RPG — .wolf files or binary game.ini alongside exe
    if (await fs.globMatch(exeDir, /\.wolf$/i)) return 'wolf-rpg';

    // Flash/AIR — .swf files
    if (await fs.globMatch(exeDir, /\.swf$/i)) return 'flash';

    // RPG Developer Bakin — bakinplayer.exe or bakinengine.dll or data.rbpack
    if (await fs.exists(fs.join(exeDir, 'data', 'bakinengine.dll'))) return 'bakin';
    if (await fs.exists(fs.join(exeDir, 'data', 'data.rbpack'))) return 'bakin';

    // Godot Engine — .pck files or project.godot
    if (await fs.globMatch(exeDir, /\.pck$/i)) return 'godot';
    if (await fs.exists(fs.join(exeDir, 'project.godot'))) return 'godot';

    // TyranoBuilder — tyrano/ folder or data/system/
    if (await fs.exists(fs.join(exeDir, 'tyrano'))) return 'tyranobuilder';
    if (await fs.exists(fs.join(exeDir, 'data', 'system'))) return 'tyranobuilder';

    return null;
}

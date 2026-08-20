import { FileSystemProvider, GameEngineType } from './types';
import { DefaultFileSystemProvider } from './fs-provider';

export type { GameEngineType };

const defaultFs = new DefaultFileSystemProvider();

interface EngineRule {
    engine: GameEngineType;
    check: (exeDir: string, fs: FileSystemProvider) => Promise<boolean>;
}

const ENGINE_RULES: EngineRule[] = [
    { engine: 'rpg-mv-mz', check: async (dir, fs) => fs.exists(fs.join(dir, 'www', 'js')) },
    {
        engine: 'rpg-vxace',
        check: async (dir, fs) => (await fs.exists(fs.join(dir, 'Data'))) && fs.globMatch(fs.join(dir, 'Data'), /\.rvdata2$/i)
    },
    {
        engine: 'renpy',
        check: async (dir, fs) =>
            ((await fs.exists(fs.join(dir, 'game'))) && (await fs.globMatch(fs.join(dir, 'game'), /\.(rpy|rpyc|rpa)$/i))) ||
            (await fs.exists(fs.join(dir, 'game', 'script.rpy'))) ||
            fs.globMatch(fs.join(dir, 'lib'), /^(windows|linux|py[23])/i)
    },
    {
        engine: 'unity',
        check: async (dir, fs) =>
            (await fs.exists(fs.join(dir, 'UnityPlayer.dll'))) ||
            (await fs.exists(fs.join(dir, 'UnityPlayer.so'))) ||
            fs.globMatch(dir, /_Data$/i)
    },
    {
        engine: 'unreal',
        check: async (dir, fs) =>
            (await fs.exists(fs.join(dir, 'Engine', 'Binaries'))) ||
            (await fs.exists(fs.join(dir, '..', 'Engine', 'Binaries'))) ||
            (await fs.exists(fs.join(dir, '..', '..', 'Engine', 'Binaries'))) ||
            (await fs.exists(fs.join(dir, '..', '..', '..', 'Engine', 'Binaries'))) ||
            /binaries[/\\](win64|win32|linux)/i.test(dir) ||
            (await fs.globMatch(dir, /\.uproject$/i))
    },
    { engine: 'wolf-rpg', check: async (dir, fs) => fs.globMatch(dir, /\.wolf$/i) },
    { engine: 'flash', check: async (dir, fs) => fs.globMatch(dir, /\.swf$/i) },
    {
        engine: 'bakin',
        check: async (dir, fs) => (await fs.exists(fs.join(dir, 'data', 'bakinengine.dll'))) || fs.exists(fs.join(dir, 'data', 'data.rbpack'))
    },
    {
        engine: 'godot',
        check: async (dir, fs) => (await fs.globMatch(dir, /\.pck$/i)) || fs.exists(fs.join(dir, 'project.godot'))
    },
    {
        engine: 'tyranobuilder',
        check: async (dir, fs) => (await fs.exists(fs.join(dir, 'tyrano'))) || fs.exists(fs.join(dir, 'data', 'system'))
    }
];

export async function detectEngine(
    exeDir: string,
    fs: FileSystemProvider = defaultFs
): Promise<GameEngineType | null> {
    for (const rule of ENGINE_RULES) {
        if (await rule.check(exeDir, fs)) return rule.engine;
    }
    return null;
}

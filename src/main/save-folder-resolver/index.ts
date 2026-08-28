import { detectEngine } from './engine-detectors';
import { FileSystemProvider, GameEngineType, ResolvedSaveDirectory } from './types';
import { DefaultFileSystemProvider } from './fs-provider';
import { YumeEngine, type ResolvedSaveLocation } from '@yumeshelf/engine';

export type { GameEngineType, ResolvedSaveDirectory, FileSystemProvider };
export { DefaultFileSystemProvider, MockFileSystemProvider } from './fs-provider';
export { detectEngine, profileToEngineType } from './engine-detectors';

function mapEngineType(matchedStrategy?: string, engineProfileType?: GameEngineType | null): GameEngineType | 'unknown' {
    if (engineProfileType) return engineProfileType;
    if (!matchedStrategy) return 'unknown';
    switch (matchedStrategy) {
        case 'rpg-maker-mv-mz':
            return 'rpg-mv-mz';
        case 'rpg-maker-rgss':
            return 'rpg-vxace';
        case 'renpy-pickle':
            return 'renpy';
        case 'unity':
            return 'unity';
        case 'unreal-sav':
            return 'unreal';
        case 'wolf-sav':
            return 'wolf-rpg';
        case 'flash':
            return 'flash';
        case 'bakin-sgs':
            return 'bakin';
        case 'godot':
            return 'godot';
        case 'gamemaker-appdata':
            return 'gamemaker';
        case 'tyranobuilder':
            return 'tyranobuilder';
        default:
            return 'unknown';
    }
}

export class SaveFolderResolver {
    private readonly fs: FileSystemProvider;

    constructor(fsProvider: FileSystemProvider = new DefaultFileSystemProvider()) {
        this.fs = fsProvider;
    }

    async resolve(
        exePath: string,
        saveFolderOverride?: string | null
    ): Promise<ResolvedSaveDirectory> {
        console.log(`[SAVE-RESOLVER][START] ${exePath}`);

        // 1. Check User Override
        if (saveFolderOverride && (await this.fs.exists(saveFolderOverride))) {
            return {
                path: saveFolderOverride,
                engine: 'user-override',
                confidence: 'high',
                source: 'override'
            };
        }

        const exeDir = this.fs.dirname(exePath);
        const engineType = await detectEngine(exeDir, this.fs);

        // Convert detected engine type to partial profile for YumeEngine
        let profile: any = undefined;
        if (engineType) {
            switch (engineType) {
                case 'rpg-mv-mz':
                    profile = { family: 'rpg-maker', variant: 'mv-mz', saveStrategy: 'rpg-maker-mv-mz' };
                    break;
                case 'rpg-vxace':
                    profile = { family: 'rpg-maker', variant: 'vx-ace', saveStrategy: 'rpg-maker-rgss' };
                    break;
                case 'renpy':
                    profile = { family: 'renpy', saveStrategy: 'renpy-pickle' };
                    break;
                case 'unity':
                    profile = { family: 'unity', saveStrategy: 'unity' };
                    break;
                case 'unreal':
                    profile = { family: 'unreal', saveStrategy: 'unreal-sav' };
                    break;
                case 'wolf-rpg':
                    profile = { family: 'wolf-rpg', saveStrategy: 'wolf-sav' };
                    break;
                case 'flash':
                    profile = { family: 'flash', saveStrategy: 'flash' };
                    break;
                case 'bakin':
                    profile = { family: 'bakin', saveStrategy: 'bakin-sgs' };
                    break;
                case 'godot':
                    profile = { family: 'godot', saveStrategy: 'godot' };
                    break;
                case 'gamemaker':
                    profile = { family: 'gamemaker', saveStrategy: 'gamemaker-appdata' };
                    break;
                case 'tyranobuilder':
                    profile = { family: 'tyranobuilder', saveStrategy: 'tyranobuilder' };
                    break;
            }
        }

        // Bridge FileSystemProvider to YumeEngine FileSystemProvider
        const engineFs: any = {
            exists: async (p: string) => this.fs.exists(p),
            readdir: async (p: string) => this.fs.readdir(p),
            readFile: async (p: string, encoding?: any) => this.fs.readFile(p, encoding || 'utf8'),
            stat: async (p: string) => {
                const isDir = await this.fs.isDirectory(p);
                return {
                    size: 0,
                    isDirectory: () => isDir,
                    isFile: () => !isDir
                };
            },
            open: async (p: string) => {
                const content = await this.fs.readFile(p, 'utf8');
                const buf = Buffer.from(content);
                return {
                    read: async (offset: number, length: number) => buf.subarray(offset, offset + length),
                    close: async () => {}
                };
            },
            getAppDataPath: () => this.fs.getEnv('APPDATA') || (this.fs.getXdgConfigHome?.() || ''),
            getLocalAppDataPath: () => this.fs.getEnv('LOCALAPPDATA') || (this.fs.getXdgDataHome?.() || ''),
            getUserProfilePath: () => this.fs.getEnv('USERPROFILE') || this.fs.getEnv('HOME') || this.fs.getHomeDir?.() || '',
            getDocumentsPath: () => {
                const user = this.fs.getEnv('USERPROFILE') || this.fs.getEnv('HOME') || this.fs.getHomeDir?.() || '';
                return user ? this.fs.join(user, 'Documents') : '';
            },
            getSavedGamesPath: () => {
                const user = this.fs.getEnv('USERPROFILE') || this.fs.getEnv('HOME') || this.fs.getHomeDir?.() || '';
                return user ? this.fs.join(user, 'Saved Games') : '';
            },
            getXdgConfigHome: () => this.fs.getXdgConfigHome?.() || '',
            getXdgDataHome: () => this.fs.getXdgDataHome?.() || '',
            getWinePrefixRoots: async (dir?: string) => {
                const roots = this.fs.getWinePrefixRoots ? await this.fs.getWinePrefixRoots(dir) : [];
                return roots || [];
            },
            getWineAppDataPaths: async (prefix: string, type: any) => {
                const paths = this.fs.getWineAppDataPaths ? await this.fs.getWineAppDataPaths(prefix, type) : [];
                return paths || [];
            },
        };

        const resolved: ResolvedSaveLocation | null = await YumeEngine.resolveSaveDirectory(
            profile,
            exePath,
            engineFs,
            { saveFolderOverride }
        );

        if (resolved?.path) {
            const mappedEngine = resolved.source === 'override'
                ? 'user-override'
                : (engineType || mapEngineType(resolved.matchedStrategy, engineType));

            const mappedSource = (resolved.source === 'wine' ? 'deterministic' : resolved.source) as ResolvedSaveDirectory['source'];

            console.log(`[SAVE-RESOLVER][SUCCESS] ${resolved.source} found: ${resolved.path} (Engine: ${mappedEngine})`);
            return {
                path: resolved.path,
                engine: mappedEngine,
                confidence: resolved.confidence,
                source: mappedSource
            };
        }
        console.log(`[SAVE-RESOLVER][FAILED] No save folder found for ${exePath}`);
        return {
            path: null,
            engine: engineType || null,
            confidence: 'none',
            source: 'none'
        };
    }
}

const defaultResolver = new SaveFolderResolver();

export async function resolveSaveFolder(
    exePath: string,
    saveFolderOverride?: string | null
): Promise<ResolvedSaveDirectory> {
    return defaultResolver.resolve(exePath, saveFolderOverride);
}


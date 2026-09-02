import { FileSystemProvider, GameEngineType, ResolvedSaveDirectory } from './types';
import { DefaultFileSystemProvider } from './fs-provider';
import { YumeEngine, type GameEngineProfile, type ResolvedSaveLocation } from '@yumeshelf/engine';

export type { GameEngineType, ResolvedSaveDirectory, FileSystemProvider };
export { DefaultFileSystemProvider, MockFileSystemProvider } from './fs-provider';

export function profileToEngineType(profile: GameEngineProfile | null | undefined): GameEngineType | null {
    if (!profile) return null;
    switch (profile.family) {
        case 'rpg-maker':
            return profile.variant === 'vx-ace' || profile.variant === 'xp' || profile.variant === '2000-2003' ? 'rpg-vxace' : 'rpg-mv-mz';
        case 'unity':
            return 'unity';
        case 'renpy':
            return 'renpy';
        case 'wolf-rpg':
            return 'wolf-rpg';
        case 'unreal':
            return 'unreal';
        case 'godot':
            return 'godot';
        case 'flash':
            return 'flash';
        case 'gamemaker':
            return 'gamemaker';
        case 'tyranobuilder':
            return 'tyranobuilder';
        default:
            if (profile.variant === 'bakin') return 'bakin';
            return null;
    }
}

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
        if (saveFolderOverride) {
            try {
                if (await this.fs.exists(saveFolderOverride)) {
                    return {
                        path: saveFolderOverride,
                        engine: 'user-override',
                        confidence: 'high',
                        source: 'override'
                    };
                }
            } catch {}
        }

        // 2. Create unified FileSystem bridge
        const unifiedFs: any = {
            exists: (p: string) => this.fs.exists(p),
            readFile: (p: string, enc?: string) => this.fs.readFile(p, enc || 'utf8'),
            stat: async (p: string) => {
                const isDir = await this.fs.isDirectory(p);
                return {
                    size: 0,
                    isDirectory: () => isDir,
                    isFile: () => !isDir
                };
            },
            readdir: async (p: string) => {
                const entries = await this.fs.readdir(p);
                return (entries || []).map((e: any) => (typeof e === 'string' ? e : e?.name || ''));
            },
            open: async (p: string) => {
                try {
                    const content = await this.fs.readFile(p, 'binary');
                    const buf = Buffer.from(content, 'binary');
                    return {
                        read: async (offset: number, length: number) => buf.subarray(offset, offset + length),
                        close: async () => {}
                    };
                } catch {
                    const emptyBuf = Buffer.alloc(0);
                    return {
                        read: async () => emptyBuf,
                        close: async () => {}
                    };
                }
            },
            join: (...args: string[]) => this.fs.join(...args),
            dirname: (p: string) => this.fs.dirname(p),
            basename: (p: string) => this.fs.basename(p),
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
            getMacApplicationSupportHome: () => (this.fs.getMacApplicationSupportHome ? this.fs.getMacApplicationSupportHome() : ''),
            getMacPreferencesHome: () => (this.fs.getMacPreferencesHome ? this.fs.getMacPreferencesHome() : ''),
        };

        let profile: GameEngineProfile | null = null;
        try {
            profile = await YumeEngine.inspectExecutable(exePath, unifiedFs);
        } catch {
            // Unreadable or non-existent binary paths gracefully fall back
        }

        const engineType = profileToEngineType(profile);

        try {
            const resolved: ResolvedSaveLocation | null = await YumeEngine.resolveSaveDirectory(
                profile || undefined,
                exePath,
                unifiedFs,
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
        } catch {
            // Resolution boundary containment
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


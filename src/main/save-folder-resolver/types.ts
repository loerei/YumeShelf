export type GameEngineType =
    | 'rpg-mv-mz'
    | 'rpg-vxace'
    | 'renpy'
    | 'unity'
    | 'unreal'
    | 'wolf-rpg'
    | 'flash'
    | 'bakin'
    | 'godot'
    | 'tyranobuilder';

export interface ResolvedSaveDirectory {
    path: string | null;
    engine: GameEngineType | 'user-override' | 'unknown' | null;
    confidence: 'high' | 'medium' | 'low' | 'none';
    source: 'override' | 'deterministic' | 'heuristic' | 'appdata' | 'none';
}

export type ResolvedSaveInfo = ResolvedSaveDirectory;

export interface FileSystemProvider {
    exists(p: string): Promise<boolean>;
    isDirectory(p: string): Promise<boolean>;
    readdir(p: string): Promise<string[]>;
    readFile(p: string, encoding: string): Promise<string>;
    globMatch(dir: string, pattern: RegExp): Promise<boolean>;
    getEnv(key: string): string | undefined;
    dirname(p: string): string;
    basename(p: string): string;
    join(...paths: string[]): string;
    getHomeDir(): string;
    getXdgConfigHome(): string;
    getXdgDataHome(): string;
    getWinePrefixRoots(exeDir?: string): Promise<string[]>;
    getWineAppDataPaths(prefix: string, type: 'Roaming' | 'Local' | 'LocalLow'): Promise<string[]>;
}

import { getExeStemFromPath } from './utils';
import { detectEngine } from './engine-detectors';
import {
    resolveRpgMakerSave,
    resolveRpgVxAceSave,
    resolveRenPySave,
    resolveUnitySave,
    resolveUnrealSave,
    resolveWolfRpgSave,
    resolveFlashSave,
    resolveBakinSave,
    resolveGodotSave,
    resolveGameMakerSave,
    resolveTyranoBuilderSave
} from './resolvers/engine-resolvers';
import { deepenSaveFolder, heuristicSaveScan, appDataFuzzyMatch } from './heuristics';
import { FileSystemProvider, GameEngineType, ResolvedSaveDirectory } from './types';
import { DefaultFileSystemProvider } from './fs-provider';

export type { GameEngineType, ResolvedSaveDirectory, FileSystemProvider };
export { DefaultFileSystemProvider, MockFileSystemProvider } from './fs-provider';
export { detectEngine };

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
        const exeStem = getExeStemFromPath(exePath);
        let result: ResolvedSaveDirectory | null = null;

        // 2. Engine Detection & Deterministic Resolution
        const engine = await detectEngine(exeDir, this.fs);
        if (engine) {
            result = await this.resolveDeterministicSaveByEngine(engine, exeDir, exeStem);
            if (result) {
                console.log(`[SAVE-RESOLVER][SUCCESS] Deterministic found: ${result.path} (Engine: ${engine})`);
            }
        }

        // 3. Heuristic File System Scan Fallback
        if (!result) {
            const heuristicResult = await heuristicSaveScan(exeDir, 0, this.fs);
            if (heuristicResult) {
                heuristicResult.engine = heuristicResult.engine || engine || 'unknown';
                console.log(`[SAVE-RESOLVER][SUCCESS] Heuristic found: ${heuristicResult.path}`);
                result = heuristicResult;
            }
        }

        // 4. AppData Fuzzy Matching Fallback
        if (!result) {
            const appDataResult = await appDataFuzzyMatch(exeDir, exeStem, this.fs);
            if (appDataResult) {
                console.log(`[SAVE-RESOLVER][SUCCESS] AppData found: ${appDataResult.path}`);
                result = appDataResult;
            }
        }

        // 5. Deepen Folder Path if Found
        if (result?.path) {
            const deeper = await deepenSaveFolder(result.path, this.fs);
            if (deeper && deeper !== result.path) {
                console.log(`[SAVE-RESOLVER][DEEPEN] ${result.path} -> ${deeper}`);
                result.path = deeper;
            }
            return result;
        }

        console.log(`[SAVE-RESOLVER][FAILED] No save folder found for ${exePath}`);
        return { path: null, engine: engine, confidence: 'none', source: 'none' };
    }

    private async resolveDeterministicSaveByEngine(
        engine: GameEngineType,
        exeDir: string,
        exeStem: string
    ): Promise<ResolvedSaveDirectory | null> {
        switch (engine) {
            case 'rpg-mv-mz':
                return await resolveRpgMakerSave(exeDir, this.fs);
            case 'rpg-vxace':
                return await resolveRpgVxAceSave(exeDir, this.fs);
            case 'renpy':
                return await resolveRenPySave(exeDir, exeStem, this.fs);
            case 'unity':
                return await resolveUnitySave(exeDir, this.fs);
            case 'unreal':
                return await resolveUnrealSave(exeDir, exeStem, this.fs);
            case 'wolf-rpg':
                return await resolveWolfRpgSave(exeDir, this.fs);
            case 'flash':
                return await resolveFlashSave(exeDir, exeStem, this.fs);
            case 'bakin':
                return await resolveBakinSave(exeDir, this.fs);
            case 'godot':
                return await resolveGodotSave(exeDir, exeStem, this.fs);
            case 'gamemaker':
                return await resolveGameMakerSave(exeDir, exeStem, this.fs);
            case 'tyranobuilder':
                return await resolveTyranoBuilderSave(exeDir, this.fs);
            default:
                return null;
        }
    }
}

const defaultResolver = new SaveFolderResolver();

export async function resolveSaveFolder(
    exePath: string,
    saveFolderOverride?: string | null
): Promise<ResolvedSaveDirectory> {
    return defaultResolver.resolve(exePath, saveFolderOverride);
}

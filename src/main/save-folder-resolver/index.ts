import * as path from 'path';
import { exists, getExeStemFromPath } from './utils';
import { detectEngine } from './engine-detectors';
import {
    resolveRpgMakerSave,
    resolveRpgVxAceSave,
    resolveRenPySave,
    resolveUnitySave,
    resolveUnrealSave,
    resolveWolfRpgSave,
    resolveBakinSave,
    ResolvedSaveInfo
} from './resolvers/engine-resolvers';
import { deepenSaveFolder, heuristicSaveScan, appDataFuzzyMatch } from './heuristics';

async function resolveDeterministicSaveByEngine(engine: string, exeDir: string, exeStem: string): Promise<ResolvedSaveInfo | null> {
    switch (engine) {
        case 'rpg-mv-mz':
            return await resolveRpgMakerSave(exeDir);
        case 'rpg-vxace':
            return await resolveRpgVxAceSave(exeDir);
        case 'renpy':
            return await resolveRenPySaveWithStem(exeStem);
        case 'unity':
            return await resolveUnitySave(exeDir);
        case 'unreal':
            return await resolveUnrealSave(exeDir);
        case 'wolf-rpg':
            return await resolveWolfRpgSave(exeDir);
        case 'bakin':
            return await resolveBakinSave(exeDir);
        default:
            return null;
    }
}

async function resolveRenPySaveWithStem(exeStem: string): Promise<ResolvedSaveInfo | null> {
    return await resolveRenPySave(process.cwd(), exeStem);
}

export async function resolveSaveFolder(
    exePath: string,
    saveFolderOverride?: string | null
): Promise<ResolvedSaveInfo | { path: null; engine: string | null; confidence: 'none' }> {
    console.log(`[SAVE-RESOLVER][START] ${exePath}`);
    if (saveFolderOverride && await exists(saveFolderOverride)) {
        return { path: saveFolderOverride, engine: 'user-override', confidence: 'high' };
    }

    const exeDir = path.dirname(exePath);
    const exeStem = getExeStemFromPath(exePath);
    let result: ResolvedSaveInfo | null = null;

    const engine = await detectEngine(exeDir);
    if (engine) {
        result = await resolveDeterministicSaveByEngine(engine, exeDir, exeStem);
        if (result) {
            console.log(`[SAVE-RESOLVER][SUCCESS] Deterministic found: ${result.path} (Engine: ${engine})`);
        }
    }

    if (!result) {
        const heuristicResult = await heuristicSaveScan(exeDir);
        if (heuristicResult) {
            heuristicResult.engine = heuristicResult.engine || (engine || 'unknown');
            console.log(`[SAVE-RESOLVER][SUCCESS] Heuristic found: ${heuristicResult.path}`);
            result = heuristicResult;
        }
    }

    if (!result) {
        const appDataResult = await appDataFuzzyMatch(exeDir, exeStem);
        if (appDataResult) {
            console.log(`[SAVE-RESOLVER][SUCCESS] AppData found: ${appDataResult.path}`);
            result = appDataResult;
        }
    }

    if (result && result.path) {
        const deeper = await deepenSaveFolder(result.path);
        if (deeper !== result.path) {
            console.log(`[SAVE-RESOLVER][DEEPEN] ${result.path} -> ${deeper}`);
            result.path = deeper;
        }
        return result;
    }

    console.log(`[SAVE-RESOLVER][FAILED] No save folder found for ${exePath}`);
    return { path: null, engine: engine, confidence: 'none' };
}

export { detectEngine };

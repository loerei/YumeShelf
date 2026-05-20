// @ts-nocheck
const path = require('path');
const { exists } = require('./utils');
const { detectEngine } = require('./engine-detectors');
const {
    resolveRpgMakerSave,
    resolveRpgVxAceSave,
    resolveRenPySave,
    resolveUnitySave,
    resolveUnrealSave,
    resolveWolfRpgSave
} = require('./resolvers/engine-resolvers');
const { deepenSaveFolder, heuristicSaveScan, appDataFuzzyMatch } = require('./heuristics');

async function resolveRenPySaveWithStem(exeStem) {
    return await resolveRenPySave(process.cwd(), exeStem);
}

async function resolveSaveFolder(exePath, saveFolderOverride) {
    console.log(`[SAVE-RESOLVER][START] ${exePath}`);
    if (saveFolderOverride && await exists(saveFolderOverride)) {
        return { path: saveFolderOverride, engine: 'user-override', confidence: 'high' };
    }

    const exeDir = path.dirname(exePath);
    const exeStem = require('./utils').getExeStemFromPath(exePath);
    let result = null;

    const engine = await detectEngine(exeDir);
    if (engine) {
        switch (engine) {
            case 'rpg-mv-mz':
                result = await resolveRpgMakerSave(exeDir);
                break;
            case 'rpg-vxace':
                result = await resolveRpgVxAceSave(exeDir);
                break;
            case 'renpy':
                result = await resolveRenPySaveWithStem(exeStem);
                break;
            case 'unity':
                result = await resolveUnitySave(exeDir);
                break;
            case 'unreal':
                result = await resolveUnrealSave(exeDir);
                break;
            case 'wolf-rpg':
                result = await resolveWolfRpgSave(exeDir);
                break;
        }
        if (result) {
            console.log(`[SAVE-RESOLVER][SUCCESS] Deterministic found: ${result.path} (Engine: ${engine})`);
        }
    }

    if (!result) {
        const heuristicResult = await heuristicSaveScan(exeDir);
        if (heuristicResult) {
            heuristicResult.engine = heuristicResult.engine || engine;
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

module.exports = {
    detectEngine,
    resolveSaveFolder
};

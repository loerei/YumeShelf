const path = require('path');
const fs = require('fs/promises');
const { exists, globMatch, getExeStem, normalizeForSearch } = require('../utils');

async function resolveRpgMakerSave(exeDir) {
    const saveDir = path.join(exeDir, 'www', 'save');
    if (await exists(saveDir)) {
        return { path: saveDir, engine: 'rpg-mv-mz', confidence: 'high' };
    }
    return null;
}

async function resolveRpgVxAceSave(exeDir) {
    const saveDir = path.join(exeDir, 'Save');
    if (await exists(saveDir)) {
        return { path: saveDir, engine: 'rpg-vxace', confidence: 'high' };
    }
    if (await globMatch(exeDir, /^Save\d+\.rvdata2$/i)) {
        return { path: exeDir, engine: 'rpg-vxace', confidence: 'high' };
    }
    return null;
}

async function resolveRenPySave(exeDir, exeStem) {
    const renpySaveRoot = path.join(process.env.APPDATA || '', 'RenPy');
    if (!await exists(renpySaveRoot)) return null;

    try {
        const entries = await fs.readdir(renpySaveRoot);
        const match = entries.find((entry) => {
            const normalized = entry.toLowerCase().split('-')[0];
            return normalized === exeStem.toLowerCase();
        });
        if (match) {
            return { path: path.join(renpySaveRoot, match), engine: 'renpy', confidence: 'high' };
        }

        const fuzzyMatch = entries.find((entry) =>
            entry.toLowerCase().includes(exeStem.toLowerCase()) && exeStem.length >= 4
        );
        if (fuzzyMatch) {
            return { path: path.join(renpySaveRoot, fuzzyMatch), engine: 'renpy', confidence: 'medium' };
        }
    } catch {
        // ignore
    }
    return null;
}

async function resolveUnitySave(exeDir) {
    const localCandidates = ['saves', 'save', 'SaveData', 'save_data'];
    for (const dirName of localCandidates) {
        const candidate = path.join(exeDir, dirName);
        if (await exists(candidate)) {
            return { path: candidate, engine: 'unity', confidence: 'high' };
        }
    }

    const localLow = path.join(process.env.USERPROFILE || '', 'AppData', 'LocalLow');
    try {
        const dirEntries = await fs.readdir(exeDir);
        const dataFolder = dirEntries.find((entry) => entry.endsWith('_Data'));
        if (dataFolder) {
            const appInfoPath = path.join(exeDir, dataFolder, 'app.info');
            if (await exists(appInfoPath)) {
                const content = await fs.readFile(appInfoPath, 'utf-8');
                const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
                if (lines.length >= 2) {
                    const company = lines[0];
                    const product = lines[1];
                    const savePath = path.join(localLow, company, product);
                    if (await exists(savePath)) {
                        return { path: savePath, engine: 'unity', confidence: 'high' };
                    }
                }
            }

            const productName = dataFolder.replace(/_Data$/, '');
            try {
                const lowEntries = await fs.readdir(localLow);
                for (const companyDir of lowEntries) {
                    const productPath = path.join(localLow, companyDir, productName);
                    if (await exists(productPath)) {
                        return { path: productPath, engine: 'unity', confidence: 'medium' };
                    }
                }
            } catch {
                // ignore
            }
        }
    } catch {
        // ignore
    }
    return null;
}

async function resolveUnrealSave(exeDir) {
    const exeStem = getExeStem(exeDir);
    const localAppData = process.env.LOCALAPPDATA || '';

    const savePath = path.join(localAppData, exeStem, 'Saved', 'SaveGames');
    if (await exists(savePath)) {
        return { path: savePath, engine: 'unreal', confidence: 'high' };
    }

    try {
        const binariesIdx = exeDir.toLowerCase().indexOf('binaries');
        if (binariesIdx > 0) {
            const projectRoot = exeDir.substring(0, binariesIdx - 1);
            const projectName = path.basename(projectRoot);
            const altSavePath = path.join(localAppData, projectName, 'Saved', 'SaveGames');
            if (await exists(altSavePath)) {
                return { path: altSavePath, engine: 'unreal', confidence: 'high' };
            }
        }
    } catch {
        // ignore
    }

    try {
        const parent = path.dirname(exeDir);
        const parentName = path.basename(parent);
        const altSavePath = path.join(localAppData, parentName, 'Saved', 'SaveGames');
        if (await exists(altSavePath)) {
            return { path: altSavePath, engine: 'unreal', confidence: 'medium' };
        }
    } catch {
        // ignore
    }

    return null;
}

async function resolveWolfRpgSave(exeDir) {
    if (await globMatch(exeDir, /\.sav$/i)) {
        return { path: exeDir, engine: 'wolf-rpg', confidence: 'medium' };
    }
    return null;
}

module.exports = {
    resolveRpgMakerSave,
    resolveRpgVxAceSave,
    resolveRenPySave,
    resolveUnitySave,
    resolveUnrealSave,
    resolveWolfRpgSave
};

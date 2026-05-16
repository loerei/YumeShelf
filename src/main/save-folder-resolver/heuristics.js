const path = require('path');
const fs = require('fs/promises');
const { exists, normalizeForSearch } = require('./utils');

const SAVE_DIR_NAMES = /^(save|saves|savedata|save_data|savefiles)$/i;
const SAVE_EXTENSIONS = /\.(sav|save|rpgsave|rvdata2|dat|ksd|sol)$/i;
const MAX_HEURISTIC_DEPTH = 3;

async function deepenSaveFolder(foundPath) {
    if (!foundPath) return foundPath;
    try {
        const rootStat = await fs.stat(foundPath);
        if (!rootStat.isDirectory()) return foundPath;

        const naniPath = path.join(foundPath, 'NaninovelData', 'NaniSaves');
        if (await exists(naniPath)) return naniPath;

        const subDirs = ['Save', 'Saves', 'SaveGames', 'SaveData', 'savedata', 'saves', 'game_save'];
        for (const sub of subDirs) {
            const candidate = path.join(foundPath, sub);
            if (await exists(candidate)) {
                const stat = await fs.stat(candidate);
                if (stat.isDirectory()) return candidate;
            }
        }
    } catch {
        // ignore
    }
    return foundPath;
}

async function heuristicSaveScan(exeDir, depth = 0) {
    if (depth > MAX_HEURISTIC_DEPTH) return null;
    if (depth === 0) console.log(`[SAVE-RESOLVER][HEURISTIC] Scanning ${exeDir}...`);

    try {
        const entries = await fs.readdir(exeDir, { withFileTypes: true });
        for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            if (SAVE_DIR_NAMES.test(entry.name)) {
                const candidate = path.join(exeDir, entry.name);
                const files = await fs.readdir(candidate).catch(() => []);
                const hasSaveFiles = files.some((file) => SAVE_EXTENSIONS.test(file));
                if (hasSaveFiles || files.length > 0) {
                    return { path: candidate, engine: null, confidence: 'medium' };
                }
            }
        }

        for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            if (/^(node_modules|lib|www|data|img|audio|fonts|css|js|plugins|effects)$/i.test(entry.name)) continue;
            const result = await heuristicSaveScan(path.join(exeDir, entry.name), depth + 1);
            if (result) return result;
        }
    } catch {
        // ignore
    }
    return null;
}

async function appDataFuzzyMatch(exeDir, exeStem) {
    console.log(`[SAVE-RESOLVER][APPDATA] Fuzzy matching stem: ${exeStem}`);
    if (exeStem.length < 3) return null;

    const localLow = path.join(process.env.USERPROFILE || '', 'AppData', 'LocalLow');
    const normalizedStem = normalizeForSearch(exeStem);
    if (!normalizedStem) return null;

    try {
        const companies = await fs.readdir(localLow);
        for (const company of companies) {
            const companyPath = path.join(localLow, company);
            try {
                const stat = await fs.stat(companyPath);
                if (!stat.isDirectory()) continue;
                const products = await fs.readdir(companyPath);
                const match = products.find((product) => {
                    const normProduct = normalizeForSearch(product);
                    return normProduct.includes(normalizedStem) || normalizedStem.includes(normProduct);
                });
                if (match) {
                    return { path: path.join(companyPath, match), engine: 'unity', confidence: 'low' };
                }
            } catch {
                continue;
            }
        }
    } catch {
        // ignore
    }

    const localAppData = process.env.LOCALAPPDATA || '';
    try {
        const entries = await fs.readdir(localAppData);
        const match = entries.find((entry) =>
            entry.toLowerCase() === exeStem.toLowerCase()
        );
        if (match) {
            const saveGames = path.join(localAppData, match, 'Saved', 'SaveGames');
            if (await exists(saveGames)) {
                return { path: saveGames, engine: 'unreal', confidence: 'low' };
            }
        }
    } catch {
        // ignore
    }

    return null;
}

module.exports = {
    deepenSaveFolder,
    heuristicSaveScan,
    appDataFuzzyMatch
};

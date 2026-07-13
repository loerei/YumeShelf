import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { exists, globMatch, getExeStem } from '../utils';

export interface ResolvedSaveInfo {
    path: string;
    engine: string;
    confidence: 'high' | 'medium' | 'low';
}

export async function resolveRpgMakerSave(exeDir: string): Promise<ResolvedSaveInfo | null> {
    const saveDir = path.join(exeDir, 'www', 'save');
    if (await exists(saveDir)) {
        return { path: saveDir, engine: 'rpg-mv-mz', confidence: 'high' };
    }
    return null;
}

export async function resolveRpgVxAceSave(exeDir: string): Promise<ResolvedSaveInfo | null> {
    const saveDir = path.join(exeDir, 'Save');
    if (await exists(saveDir)) {
        return { path: saveDir, engine: 'rpg-vxace', confidence: 'high' };
    }
    if (await globMatch(exeDir, /^Save\d+\.rvdata2$/i)) {
        return { path: exeDir, engine: 'rpg-vxace', confidence: 'high' };
    }
    return null;
}

export async function resolveRenPySave(exeDir: string, exeStem: string): Promise<ResolvedSaveInfo | null> {
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

async function tryResolveUnitySaveFromAppInfo(localLow: string, appInfoPath: string): Promise<string | null> {
    try {
        const content = await fs.readFile(appInfoPath, 'utf-8');
        const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
        if (lines.length >= 2) {
            const company = lines[0];
            const product = lines[1];
            const savePath = path.join(localLow, company, product);
            if (await exists(savePath)) {
                return savePath;
            }
        }
    } catch {}
    return null;
}

async function tryResolveUnitySaveFuzzy(localLow: string, productName: string): Promise<string | null> {
    try {
        const lowEntries = await fs.readdir(localLow);
        for (const companyDir of lowEntries) {
            const productPath = path.join(localLow, companyDir, productName);
            if (await exists(productPath)) {
                return productPath;
            }
        }
    } catch {}
    return null;
}

export async function resolveUnitySave(exeDir: string): Promise<ResolvedSaveInfo | null> {
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
                const savePath = await tryResolveUnitySaveFromAppInfo(localLow, appInfoPath);
                if (savePath) {
                    return { path: savePath, engine: 'unity', confidence: 'high' };
                }
            }

            const productName = dataFolder.replace(/_Data$/, '');
            const fuzzyPath = await tryResolveUnitySaveFuzzy(localLow, productName);
            if (fuzzyPath) {
                return { path: fuzzyPath, engine: 'unity', confidence: 'medium' };
            }
        }
    } catch {
        // ignore
    }
    return null;
}

export async function resolveUnrealSave(exeDir: string): Promise<ResolvedSaveInfo | null> {
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

export async function resolveWolfRpgSave(exeDir: string): Promise<ResolvedSaveInfo | null> {
    if (await globMatch(exeDir, /\.sav$/i)) {
        return { path: exeDir, engine: 'wolf-rpg', confidence: 'medium' };
    }
    return null;
}

import { FileSystemProvider, ResolvedSaveDirectory } from '../types';
import { DefaultFileSystemProvider } from '../fs-provider';
import { getExeStem } from '../utils';

export type { ResolvedSaveInfo, ResolvedSaveDirectory } from '../types';
const defaultFs = new DefaultFileSystemProvider();

export async function resolveRpgMakerSave(
    exeDir: string,
    fs: FileSystemProvider = defaultFs
): Promise<ResolvedSaveDirectory | null> {
    const saveDir = fs.join(exeDir, 'www', 'save');
    if (await fs.exists(saveDir)) {
        return { path: saveDir, engine: 'rpg-mv-mz', confidence: 'high', source: 'deterministic' };
    }
    return null;
}

export async function resolveRpgVxAceSave(
    exeDir: string,
    fs: FileSystemProvider = defaultFs
): Promise<ResolvedSaveDirectory | null> {
    const saveDir = fs.join(exeDir, 'Save');
    if (await fs.exists(saveDir)) {
        return { path: saveDir, engine: 'rpg-vxace', confidence: 'high', source: 'deterministic' };
    }
    if (await fs.globMatch(exeDir, /^Save\d+\.rvdata2$/i)) {
        return { path: exeDir, engine: 'rpg-vxace', confidence: 'high', source: 'deterministic' };
    }
    return null;
}

export async function resolveRenPySave(
    exeDir: string,
    exeStem: string,
    fs: FileSystemProvider = defaultFs
): Promise<ResolvedSaveDirectory | null> {
    const appData = fs.getEnv('APPDATA') || '';
    const renpySaveRoot = fs.join(appData, 'RenPy');
    if (!(await fs.exists(renpySaveRoot))) return null;

    try {
        const entries = await fs.readdir(renpySaveRoot);
        const match = entries.find((entry) => {
            const normalized = entry.toLowerCase().split('-')[0];
            return normalized === exeStem.toLowerCase();
        });
        if (match) {
            return { path: fs.join(renpySaveRoot, match), engine: 'renpy', confidence: 'high', source: 'deterministic' };
        }

        const fuzzyMatch = entries.find(
            (entry) => entry.toLowerCase().includes(exeStem.toLowerCase()) && exeStem.length >= 4
        );
        if (fuzzyMatch) {
            return { path: fs.join(renpySaveRoot, fuzzyMatch), engine: 'renpy', confidence: 'medium', source: 'deterministic' };
        }
    } catch {
        // ignore
    }
    return null;
}

export async function resolveUnitySave(
    exeDir: string,
    fs: FileSystemProvider = defaultFs
): Promise<ResolvedSaveDirectory | null> {
    const localCandidates = ['saves', 'save', 'SaveData', 'save_data'];
    for (const dirName of localCandidates) {
        const candidate = fs.join(exeDir, dirName);
        if (await fs.exists(candidate)) {
            return { path: candidate, engine: 'unity', confidence: 'high', source: 'deterministic' };
        }
    }

    const userProfile = fs.getEnv('USERPROFILE') || '';
    const localLow = fs.join(userProfile, 'AppData', 'LocalLow');
    try {
        const dirEntries = await fs.readdir(exeDir);
        const dataFolder = dirEntries.find((entry) => entry.endsWith('_Data'));
        if (dataFolder) {
            const appInfoPath = fs.join(exeDir, dataFolder, 'app.info');
            if (await fs.exists(appInfoPath)) {
                const content = await fs.readFile(appInfoPath, 'utf-8');
                const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
                if (lines.length >= 2) {
                    const company = lines[0];
                    const product = lines[1];
                    const savePath = fs.join(localLow, company, product);
                    if (await fs.exists(savePath)) {
                        return { path: savePath, engine: 'unity', confidence: 'high', source: 'deterministic' };
                    }
                }
            }

            const productName = dataFolder.replace(/_Data$/, '');
            try {
                const lowEntries = await fs.readdir(localLow);
                for (const companyDir of lowEntries) {
                    const productPath = fs.join(localLow, companyDir, productName);
                    if (await fs.exists(productPath)) {
                        return { path: productPath, engine: 'unity', confidence: 'medium', source: 'deterministic' };
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

export async function resolveUnrealSave(
    exeDir: string,
    fs: FileSystemProvider = defaultFs
): Promise<ResolvedSaveDirectory | null> {
    const exeStem = getExeStem(exeDir);
    const localAppData = fs.getEnv('LOCALAPPDATA') || '';

    const savePath = fs.join(localAppData, exeStem, 'Saved', 'SaveGames');
    if (await fs.exists(savePath)) {
        return { path: savePath, engine: 'unreal', confidence: 'high', source: 'deterministic' };
    }

    try {
        const binariesIdx = exeDir.toLowerCase().indexOf('binaries');
        if (binariesIdx > 0) {
            const projectRoot = exeDir.substring(0, binariesIdx - 1);
            const projectName = fs.basename(projectRoot);
            const altSavePath = fs.join(localAppData, projectName, 'Saved', 'SaveGames');
            if (await fs.exists(altSavePath)) {
                return { path: altSavePath, engine: 'unreal', confidence: 'high', source: 'deterministic' };
            }
        }
    } catch {
        // ignore
    }

    try {
        const parent = fs.dirname(exeDir);
        const parentName = fs.basename(parent);
        const altSavePath = fs.join(localAppData, parentName, 'Saved', 'SaveGames');
        if (await fs.exists(altSavePath)) {
            return { path: altSavePath, engine: 'unreal', confidence: 'medium', source: 'deterministic' };
        }
    } catch {
        // ignore
    }

    return null;
}

export async function resolveWolfRpgSave(
    exeDir: string,
    fs: FileSystemProvider = defaultFs
): Promise<ResolvedSaveDirectory | null> {
    if (await fs.globMatch(exeDir, /\.sav$/i)) {
        return { path: exeDir, engine: 'wolf-rpg', confidence: 'medium', source: 'deterministic' };
    }
    return null;
}

export async function resolveBakinSave(
    exeDir: string,
    fs: FileSystemProvider = defaultFs
): Promise<ResolvedSaveDirectory | null> {
    const saveDir = fs.join(exeDir, 'data', 'savedata');
    if (await fs.exists(saveDir)) {
        return { path: saveDir, engine: 'bakin', confidence: 'high', source: 'deterministic' };
    }
    const saveDirAlt = fs.join(exeDir, 'savedata');
    if (await fs.exists(saveDirAlt)) {
        return { path: saveDirAlt, engine: 'bakin', confidence: 'high', source: 'deterministic' };
    }
    return null;
}

export async function resolveGodotSave(
    exeDir: string,
    exeStem: string,
    fs: FileSystemProvider = defaultFs
): Promise<ResolvedSaveDirectory | null> {
    const appData = fs.getEnv('APPDATA') || '';
    const godotUserDir = fs.join(appData, 'Godot', 'app_userdata', exeStem);
    if (await fs.exists(godotUserDir)) {
        return { path: godotUserDir, engine: 'godot', confidence: 'high', source: 'deterministic' };
    }
    return null;
}

export async function resolveTyranoBuilderSave(
    exeDir: string,
    fs: FileSystemProvider = defaultFs
): Promise<ResolvedSaveDirectory | null> {
    const saveDir = fs.join(exeDir, 'tyrano', 'savedata');
    if (await fs.exists(saveDir)) {
        return { path: saveDir, engine: 'tyranobuilder', confidence: 'high', source: 'deterministic' };
    }
    return null;
}

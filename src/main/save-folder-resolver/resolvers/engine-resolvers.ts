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
    const candidateRoots = new Set<string>();

    // 1. Windows APPDATA
    const appData = fs.getEnv('APPDATA');
    if (appData) {
        candidateRoots.add(fs.join(appData, 'RenPy'));
    }

    // 2. Linux XDG / Home directories
    const homeDir = fs.getHomeDir();
    if (homeDir) {
        candidateRoots.add(fs.join(homeDir, '.renpy'));
        candidateRoots.add(fs.join(fs.getXdgDataHome(), 'renpy'));
        candidateRoots.add(fs.join(homeDir, '.local', 'share', 'renpy'));
    }

    // 3. Wine / Proton prefixes
    try {
        const winePrefixes = await fs.getWinePrefixRoots(exeDir);
        for (const prefix of winePrefixes) {
            const roamingPaths = await fs.getWineAppDataPaths(prefix, 'Roaming');
            for (const roaming of roamingPaths) {
                candidateRoots.add(fs.join(roaming, 'RenPy'));
            }
        }
    } catch {
        // ignore prefix discovery errors
    }

    for (const renpySaveRoot of candidateRoots) {
        if (!(await fs.exists(renpySaveRoot))) continue;

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
    }

    return null;
}

async function resolveUnityFromAppInfo(
    exeDir: string,
    dataFolder: string,
    candidateRoots: Iterable<string>,
    fs: FileSystemProvider
): Promise<ResolvedSaveDirectory | null> {
    const appInfoPath = fs.join(exeDir, dataFolder, 'app.info');
    if (!(await fs.exists(appInfoPath))) return null;

    try {
        const content = await fs.readFile(appInfoPath, 'utf-8');
        const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
        if (lines.length >= 2) {
            for (const root of candidateRoots) {
                const savePath = fs.join(root, lines[0], lines[1]);
                if (await fs.exists(savePath)) {
                    return { path: savePath, engine: 'unity', confidence: 'high', source: 'deterministic' };
                }
            }
        }
    } catch {
        // ignore
    }
    return null;
}

async function resolveUnityFromDataFolder(
    exeDir: string,
    dataFolder: string,
    candidateRoots: Iterable<string>,
    fs: FileSystemProvider
): Promise<ResolvedSaveDirectory | null> {
    const appInfoResult = await resolveUnityFromAppInfo(exeDir, dataFolder, candidateRoots, fs);
    if (appInfoResult) return appInfoResult;

    const productName = dataFolder.replace(/_Data$/, '');
    for (const root of candidateRoots) {
        try {
            if (!(await fs.exists(root))) continue;
            const companyEntries = await fs.readdir(root);
            for (const companyDir of companyEntries) {
                const productPath = fs.join(root, companyDir, productName);
                if (await fs.exists(productPath)) {
                    return { path: productPath, engine: 'unity', confidence: 'medium', source: 'deterministic' };
                }
            }
        } catch {
            // ignore
        }
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

    const candidateRoots = new Set<string>();

    // 1. Windows LocalLow
    const userProfile = fs.getEnv('USERPROFILE');
    if (userProfile) {
        candidateRoots.add(fs.join(userProfile, 'AppData', 'LocalLow'));
    }

    // 2. Linux XDG / Home unity3d directories
    candidateRoots.add(fs.join(fs.getXdgConfigHome(), 'unity3d'));
    const homeDir = fs.getHomeDir();
    if (homeDir) {
        candidateRoots.add(fs.join(homeDir, '.config', 'unity3d'));
    }

    // 3. Wine / Proton prefixes
    try {
        const winePrefixes = await fs.getWinePrefixRoots(exeDir);
        for (const prefix of winePrefixes) {
            const localLowPaths = await fs.getWineAppDataPaths(prefix, 'LocalLow');
            for (const localLow of localLowPaths) {
                candidateRoots.add(localLow);
            }
        }
    } catch {
        // ignore
    }

    try {
        const dirEntries = await fs.readdir(exeDir);
        const dataFolder = dirEntries.find((entry) => entry.endsWith('_Data'));
        if (dataFolder) {
            return await resolveUnityFromDataFolder(exeDir, dataFolder, candidateRoots, fs);
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
    const candidateRoots = new Set<string>();

    // 1. Windows LOCALAPPDATA
    const localAppData = fs.getEnv('LOCALAPPDATA');
    if (localAppData) {
        candidateRoots.add(localAppData);
    }

    // 2. Linux XDG directories
    candidateRoots.add(fs.join(fs.getXdgConfigHome(), 'Epic'));
    candidateRoots.add(fs.getXdgDataHome());

    // 3. Wine / Proton prefixes
    try {
        const winePrefixes = await fs.getWinePrefixRoots(exeDir);
        for (const prefix of winePrefixes) {
            const localPaths = await fs.getWineAppDataPaths(prefix, 'Local');
            for (const local of localPaths) {
                candidateRoots.add(local);
            }
        }
    } catch {
        // ignore
    }

    for (const root of candidateRoots) {
        const savePath = fs.join(root, exeStem, 'Saved', 'SaveGames');
        if (await fs.exists(savePath)) {
            return { path: savePath, engine: 'unreal', confidence: 'high', source: 'deterministic' };
        }

        try {
            const binariesIdx = exeDir.toLowerCase().indexOf('binaries');
            if (binariesIdx > 0) {
                const projectRoot = exeDir.substring(0, binariesIdx - 1);
                const projectName = fs.basename(projectRoot);
                const altSavePath = fs.join(root, projectName, 'Saved', 'SaveGames');
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
            const altSavePath = fs.join(root, parentName, 'Saved', 'SaveGames');
            if (await fs.exists(altSavePath)) {
                return { path: altSavePath, engine: 'unreal', confidence: 'medium', source: 'deterministic' };
            }
        } catch {
            // ignore
        }
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
    const candidatePaths = new Set<string>();

    // 1. Windows APPDATA
    const appData = fs.getEnv('APPDATA');
    if (appData) {
        candidatePaths.add(fs.join(appData, 'Godot', 'app_userdata', exeStem));
    }

    // 2. Linux XDG / Home directories
    candidatePaths.add(fs.join(fs.getXdgDataHome(), 'godot', 'app_userdata', exeStem));
    const homeDir = fs.getHomeDir();
    if (homeDir) {
        candidatePaths.add(fs.join(homeDir, '.local', 'share', 'godot', 'app_userdata', exeStem));
    }
    candidatePaths.add(fs.join(fs.getXdgConfigHome(), 'godot', 'app_userdata', exeStem));

    // 3. Wine / Proton prefixes
    try {
        const winePrefixes = await fs.getWinePrefixRoots(exeDir);
        for (const prefix of winePrefixes) {
            const roamingPaths = await fs.getWineAppDataPaths(prefix, 'Roaming');
            for (const roaming of roamingPaths) {
                candidatePaths.add(fs.join(roaming, 'Godot', 'app_userdata', exeStem));
            }
        }
    } catch {
        // ignore
    }

    for (const godotUserDir of candidatePaths) {
        if (await fs.exists(godotUserDir)) {
            return { path: godotUserDir, engine: 'godot', confidence: 'high', source: 'deterministic' };
        }
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

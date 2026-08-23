import { FileSystemProvider, ResolvedSaveDirectory } from '../types';
import { DefaultFileSystemProvider } from '../fs-provider';
import { getExeStem } from '../utils';

export type { ResolvedSaveInfo, ResolvedSaveDirectory } from '../types';
const defaultFs = new DefaultFileSystemProvider();

export async function resolveRpgMakerSave(
    exeDir: string,
    fs: FileSystemProvider = defaultFs
): Promise<ResolvedSaveDirectory | null> {
    const candidates = [
        fs.join(exeDir, 'www', 'save'),
        fs.join(exeDir, 'save'),
        fs.join(exeDir, 'Save'),
        fs.join(exeDir, 'bin', 'www', 'save'),
        fs.join(exeDir, 'bin', 'save')
    ];
    for (const c of candidates) {
        if (await fs.exists(c)) {
            return { path: c, engine: 'rpg-mv-mz', confidence: 'high', source: 'deterministic' };
        }
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
    // 0. Check local portable save folders
    const localCandidates = [
        fs.join(exeDir, 'game', 'saves'),
        fs.join(exeDir, 'saves'),
        fs.join(exeDir, 'game', 'save')
    ];
    for (const c of localCandidates) {
        if (await fs.exists(c)) {
            const files = await fs.readdir(c).catch(() => []);
            if (files.some((f) => /\.(save|rpyc)$/i.test(f) || f === 'persistent')) {
                return { path: c, engine: 'renpy', confidence: 'high', source: 'deterministic' };
            }
        }
    }

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
            const company = lines[0];
            const product = lines[1];
            // 1. Check existing save folders across candidate roots
            for (const root of candidateRoots) {
                const savePath = fs.join(root, company, product);
                if (await fs.exists(savePath)) {
                    return { path: savePath, engine: 'unity', confidence: 'high', source: 'deterministic' };
                }
            }
            // 2. If not created yet, return predicted primary path
            const primaryRoot = Array.from(candidateRoots)[0];
            if (primaryRoot) {
                return { path: fs.join(primaryRoot, company, product), engine: 'unity', confidence: 'high', source: 'deterministic' };
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
    const localCandidates = ['Saves', 'saves', 'save', 'SaveData', 'save_data'];
    for (const dirName of localCandidates) {
        const candidate = fs.join(exeDir, dirName);
        if (await fs.exists(candidate)) {
            const files = await fs.readdir(candidate).catch(() => []);
            if (files.some((f) => !f.endsWith('.lnk') && !f.endsWith('.txt'))) {
                return { path: candidate, engine: 'unity', confidence: 'high', source: 'deterministic' };
            }
        }
    }

    // Check Data folders and portable StreamingAssets / Naninovel saves
    try {
        const dirEntries = await fs.readdir(exeDir);
        const dataFolders = dirEntries.filter((entry) => entry.endsWith('_Data'));
        for (const df of dataFolders) {
            const dataPath = fs.join(exeDir, df);
            const streamingCandidates = [
                fs.join(dataPath, 'StreamingAssets', 'SaveData'),
                fs.join(dataPath, 'StreamingAssets', 'NaninovelData'),
                fs.join(dataPath, 'StreamingAssets', 'saves'),
                fs.join(dataPath, 'SaveData'),
                fs.join(dataPath, 'saves')
            ];
            for (const sc of streamingCandidates) {
                if (await fs.exists(sc)) {
                    const files = await fs.readdir(sc).catch(() => []);
                    if (files.some((f) => !f.endsWith('.vdf') && !f.endsWith('.txt'))) {
                        return { path: sc, engine: 'unity', confidence: 'high', source: 'deterministic' };
                    }
                }
            }
        }
    } catch {
        // ignore
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
        const dataFolders = dirEntries.filter((entry) => entry.endsWith('_Data'));
        for (const dataFolder of dataFolders) {
            const res = await resolveUnityFromDataFolder(exeDir, dataFolder, candidateRoots, fs);
            if (res) return res;
        }
    } catch {
        // ignore
    }
    return null;
}

export async function resolveUnrealSave(
    exeDir: string,
    exeStem?: string,
    fs: FileSystemProvider = defaultFs
): Promise<ResolvedSaveDirectory | null> {
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

    const projectNames = new Set<string>();
    if (exeStem && !/^(game|launcher|start|app|shipping)$/i.test(exeStem)) {
        projectNames.add(exeStem);
    }
    try {
        const entries = await fs.readdir(exeDir);
        for (const e of entries) {
            const subContent = fs.join(exeDir, e, 'Content');
            const subBinaries = fs.join(exeDir, e, 'Binaries');
            if ((await fs.exists(subContent)) || (await fs.exists(subBinaries))) {
                projectNames.add(e);
            }
        }
    } catch {}

    const stemDir = getExeStem(exeDir);
    if (stemDir && !/^(game|launcher|start|app|binaries|win64|win32|linux)$/i.test(stemDir)) {
        projectNames.add(stemDir);
    }

    // Check local save paths first
    for (const proj of projectNames) {
        const localSave = fs.join(exeDir, proj, 'Saved', 'SaveGames');
        if (await fs.exists(localSave)) {
            return { path: localSave, engine: 'unreal', confidence: 'high', source: 'deterministic' };
        }
    }
    const directLocalSave = fs.join(exeDir, 'Saved', 'SaveGames');
    if (await fs.exists(directLocalSave)) {
        return { path: directLocalSave, engine: 'unreal', confidence: 'high', source: 'deterministic' };
    }

    // Check AppData paths
    for (const root of candidateRoots) {
        for (const proj of projectNames) {
            const savePath = fs.join(root, proj, 'Saved', 'SaveGames');
            if (await fs.exists(savePath)) {
                return { path: savePath, engine: 'unreal', confidence: 'high', source: 'deterministic' };
            }
        }
    }

    // Predicted path fallback
    const primaryProj = Array.from(projectNames)[0];
    const primaryRoot = Array.from(candidateRoots)[0];
    if (primaryProj && primaryRoot) {
        return { path: fs.join(primaryRoot, primaryProj, 'Saved', 'SaveGames'), engine: 'unreal', confidence: 'high', source: 'deterministic' };
    }

    return null;
}

export async function resolveWolfRpgSave(
    exeDir: string,
    fs: FileSystemProvider = defaultFs
): Promise<ResolvedSaveDirectory | null> {
    const localCandidates = ['Save', 'save', 'SaveData', 'savedata'];
    for (const dirName of localCandidates) {
        const candidate = fs.join(exeDir, dirName);
        if (await fs.exists(candidate)) {
            return { path: candidate, engine: 'wolf-rpg', confidence: 'high', source: 'deterministic' };
        }
    }
    if (await fs.globMatch(exeDir, /\.sav$/i)) {
        return { path: exeDir, engine: 'wolf-rpg', confidence: 'high', source: 'deterministic' };
    }
    return { path: fs.join(exeDir, 'Save'), engine: 'wolf-rpg', confidence: 'high', source: 'deterministic' };
}

export async function resolveFlashSave(
    exeDir: string,
    exeStem: string,
    fs: FileSystemProvider = defaultFs
): Promise<ResolvedSaveDirectory | null> {
    const appData = fs.getEnv('APPDATA');
    if (!appData) return null;

    const flashObjectsRoot = fs.join(appData, 'Macromedia', 'Flash Player', '#SharedObjects');
    if (await fs.exists(flashObjectsRoot)) {
        try {
            // Find all potential game identifiers (exeStem, SWF names)
            const identifiers = new Set<string>();
            if (exeStem) identifiers.add(exeStem.toLowerCase());
            try {
                const dirFiles = await fs.readdir(exeDir);
                for (const df of dirFiles) {
                    if (df.toLowerCase().endsWith('.swf')) {
                        identifiers.add(df.replace(/\.swf$/i, '').toLowerCase());
                    }
                }
            } catch {
                // ignore
            }

            const allSolDirs: string[] = [];
            async function scanDir(dir: string, depth = 0): Promise<void> {
                if (depth > 4) return;
                try {
                    const entries = await fs.readdir(dir);
                    for (const e of entries) {
                        const full = fs.join(dir, e);
                        if (await fs.isDirectory(full)) {
                            const subFiles = await fs.readdir(full).catch(() => []);
                            if (subFiles.some((f) => f.toLowerCase().endsWith('.sol'))) {
                                allSolDirs.push(full);
                            }
                            await scanDir(full, depth + 1);
                        }
                    }
                } catch {
                    // ignore
                }
            }

            await scanDir(flashObjectsRoot);

            // 1. Look for match with game identifiers in folder path or .sol filename
            for (const solDir of allSolDirs) {
                const lower = solDir.toLowerCase();
                for (const id of identifiers) {
                    if (id && id.length > 2 && lower.includes(id)) {
                        return { path: solDir, engine: 'flash', confidence: 'high', source: 'deterministic' };
                    }
                }
                const subFiles = await fs.readdir(solDir).catch(() => []);
                for (const sf of subFiles) {
                    const sfLower = sf.toLowerCase();
                    for (const id of identifiers) {
                        if (id && id.length > 2 && sfLower.includes(id)) {
                            return { path: solDir, engine: 'flash', confidence: 'high', source: 'deterministic' };
                        }
                    }
                }
            }

            // 2. If exactly one Flash save dir exists globally, return it
            if (allSolDirs.length === 1) {
                return { path: allSolDirs[0], engine: 'flash', confidence: 'high', source: 'deterministic' };
            }
        } catch {
            // ignore
        }
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

export async function resolveGameMakerSave(
    exeDir: string,
    exeStem: string,
    fs: FileSystemProvider = defaultFs
): Promise<ResolvedSaveDirectory | null> {
    const localAppData = fs.getEnv('LOCALAPPDATA');
    if (!localAppData) return null;

    const sanitizedStem = exeStem.replace(/[^a-zA-Z0-9_]/g, '_');
    const candidates = [
        fs.join(localAppData, sanitizedStem),
        fs.join(localAppData, exeStem)
    ];

    for (const c of candidates) {
        if (await fs.exists(c)) {
            return { path: c, engine: 'gamemaker', confidence: 'high', source: 'deterministic' };
        }
    }

    return { path: fs.join(localAppData, sanitizedStem), engine: 'gamemaker', confidence: 'high', source: 'deterministic' };
}

export async function resolveGodotSave(
    exeDir: string,
    exeStem: string,
    fs: FileSystemProvider = defaultFs
): Promise<ResolvedSaveDirectory | null> {
    // 0. Check local portable save folders
    const localCandidates = [
        fs.join(exeDir, 'save'),
        fs.join(exeDir, 'saves'),
        fs.join(exeDir, 'savedata')
    ];
    for (const c of localCandidates) {
        if (await fs.exists(c)) {
            const files = await fs.readdir(c).catch(() => []);
            if (files.some((f) => /\.(sav|save|dat|bin|json)$/i.test(f))) {
                return { path: c, engine: 'godot', confidence: 'high', source: 'deterministic' };
            }
        }
    }

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

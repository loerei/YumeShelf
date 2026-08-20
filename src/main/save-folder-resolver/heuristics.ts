import { FileSystemProvider, ResolvedSaveDirectory } from './types';
import { DefaultFileSystemProvider } from './fs-provider';
import { normalizeForSearch } from './utils';

const SAVE_DIR_NAMES = /^(save|saves|savedata|save_data|savefiles)$/i;
const SAVE_EXTENSIONS = /\.(sav|save|rpgsave|rvdata2|dat|ksd|sol)$/i;
const MAX_HEURISTIC_DEPTH = 3;

const defaultFs = new DefaultFileSystemProvider();

export async function deepenSaveFolder(
    foundPath: string | null | undefined,
    fs: FileSystemProvider = defaultFs
): Promise<string | null | undefined> {
    if (!foundPath) return foundPath;
    try {
        if (!(await fs.isDirectory(foundPath))) return foundPath;

        const naniPath = fs.join(foundPath, 'NaninovelData', 'NaniSaves');
        if (await fs.exists(naniPath)) return naniPath;

        const subDirs = ['Save', 'Saves', 'SaveGames', 'SaveData', 'savedata', 'saves', 'game_save'];
        for (const sub of subDirs) {
            const candidate = fs.join(foundPath, sub);
            if (await fs.exists(candidate)) {
                if (await fs.isDirectory(candidate)) return candidate;
            }
        }
    } catch {
        // ignore
    }
    return foundPath;
}

async function checkSaveCandidateDir(
    exeDir: string,
    entryName: string,
    fs: FileSystemProvider
): Promise<ResolvedSaveDirectory | null> {
    const fullPath = fs.join(exeDir, entryName);
    if (!(await fs.isDirectory(fullPath))) return null;

    if (SAVE_DIR_NAMES.test(entryName)) {
        const files = await fs.readdir(fullPath).catch(() => []);
        const hasSaveFiles = files.some((file) => SAVE_EXTENSIONS.test(file));
        if (hasSaveFiles || files.length > 0) {
            return { path: fullPath, engine: 'unknown', confidence: 'medium', source: 'heuristic' };
        }
    }
    return null;
}

export async function heuristicSaveScan(
    exeDir: string,
    depth = 0,
    fs: FileSystemProvider = defaultFs
): Promise<ResolvedSaveDirectory | null> {
    if (depth > MAX_HEURISTIC_DEPTH) return null;
    if (depth === 0) console.log(`[SAVE-RESOLVER][HEURISTIC] Scanning ${exeDir}...`);

    try {
        const entries = await fs.readdir(exeDir);
        for (const entryName of entries) {
            const match = await checkSaveCandidateDir(exeDir, entryName, fs);
            if (match) return match;
        }

        for (const entryName of entries) {
            const fullPath = fs.join(exeDir, entryName);
            if (!(await fs.isDirectory(fullPath))) continue;
            if (/^(node_modules|lib|www|data|img|audio|fonts|css|js|plugins|effects)$/i.test(entryName)) continue;

            const result = await heuristicSaveScan(fullPath, depth + 1, fs);
            if (result) return result;
        }
    } catch {
        // ignore
    }
    return null;
}

export async function appDataFuzzyMatch(
    exeDir: string,
    exeStem: string,
    fs: FileSystemProvider = defaultFs
): Promise<ResolvedSaveDirectory | null> {
    console.log(`[SAVE-RESOLVER][APPDATA] Fuzzy matching stem: ${exeStem}`);
    if (exeStem.length < 3) return null;

    const normalizedStem = normalizeForSearch(exeStem);
    if (!normalizedStem) return null;

    const unityRoots = new Set<string>();
    const unrealRoots = new Set<string>();

    // 1. Windows standard paths
    const userProfile = fs.getEnv('USERPROFILE');
    if (userProfile) {
        unityRoots.add(fs.join(userProfile, 'AppData', 'LocalLow'));
    }
    const localAppData = fs.getEnv('LOCALAPPDATA');
    if (localAppData) {
        unrealRoots.add(localAppData);
    }

    // 2. Linux XDG paths
    unityRoots.add(fs.join(fs.getXdgConfigHome(), 'unity3d'));
    const homeDir = fs.getHomeDir();
    if (homeDir) {
        unityRoots.add(fs.join(homeDir, '.config', 'unity3d'));
    }
    unrealRoots.add(fs.join(fs.getXdgConfigHome(), 'Epic'));
    unrealRoots.add(fs.getXdgDataHome());

    // 3. Wine / Proton prefixes
    try {
        const winePrefixes = await fs.getWinePrefixRoots(exeDir);
        for (const prefix of winePrefixes) {
            const localLowPaths = await fs.getWineAppDataPaths(prefix, 'LocalLow');
            for (const localLow of localLowPaths) {
                unityRoots.add(localLow);
            }
            const localPaths = await fs.getWineAppDataPaths(prefix, 'Local');
            for (const local of localPaths) {
                unrealRoots.add(local);
            }
        }
    } catch {
        // ignore
    }

    // Fuzzy match Unity
    for (const localLow of unityRoots) {
        try {
            if (!(await fs.exists(localLow))) continue;
            const companies = await fs.readdir(localLow);
            for (const company of companies) {
                const companyPath = fs.join(localLow, company);
                try {
                    if (!(await fs.isDirectory(companyPath))) continue;
                    const products = await fs.readdir(companyPath);
                    const match = products.find((product) => {
                        const normProduct = normalizeForSearch(product);
                        return normProduct.includes(normalizedStem) || normalizedStem.includes(normProduct);
                    });
                    if (match) {
                        return { path: fs.join(companyPath, match), engine: 'unity', confidence: 'low', source: 'appdata' };
                    }
                } catch {
                    continue;
                }
            }
        } catch {
            // ignore
        }
    }

    // Fuzzy match Unreal
    for (const localRoot of unrealRoots) {
        try {
            if (!(await fs.exists(localRoot))) continue;
            const entries = await fs.readdir(localRoot);
            const match = entries.find((entry) => entry.toLowerCase() === exeStem.toLowerCase());
            if (match) {
                const saveGames = fs.join(localRoot, match, 'Saved', 'SaveGames');
                if (await fs.exists(saveGames)) {
                    return { path: saveGames, engine: 'unreal', confidence: 'low', source: 'appdata' };
                }
            }
        } catch {
            // ignore
        }
    }

    return null;
}

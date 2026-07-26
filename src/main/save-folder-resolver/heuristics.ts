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
            const fullPath = fs.join(exeDir, entryName);
            if (!(await fs.isDirectory(fullPath))) continue;

            if (SAVE_DIR_NAMES.test(entryName)) {
                const files = await fs.readdir(fullPath).catch(() => []);
                const hasSaveFiles = files.some((file) => SAVE_EXTENSIONS.test(file));
                if (hasSaveFiles || files.length > 0) {
                    return { path: fullPath, engine: 'unknown', confidence: 'medium', source: 'heuristic' };
                }
            }
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

    const userProfile = fs.getEnv('USERPROFILE') || '';
    const localLow = fs.join(userProfile, 'AppData', 'LocalLow');
    const normalizedStem = normalizeForSearch(exeStem);
    if (!normalizedStem) return null;

    try {
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

    const localAppData = fs.getEnv('LOCALAPPDATA') || '';
    try {
        const entries = await fs.readdir(localAppData);
        const match = entries.find((entry) => entry.toLowerCase() === exeStem.toLowerCase());
        if (match) {
            const saveGames = fs.join(localAppData, match, 'Saved', 'SaveGames');
            if (await fs.exists(saveGames)) {
                return { path: saveGames, engine: 'unreal', confidence: 'low', source: 'appdata' };
            }
        }
    } catch {
        // ignore
    }

    return null;
}

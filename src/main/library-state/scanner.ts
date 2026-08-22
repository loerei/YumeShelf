import * as path from 'node:path';
import { TitleCleaningPipeline } from './title-pipeline';

export const DEFAULT_LIBRARY_MAX_DEPTH = 5;
export const MIN_LIBRARY_MAX_DEPTH = 0;
export const MAX_LIBRARY_MAX_DEPTH = 12;

const EXECUTABLE_BLACKLIST = [
    'crashhandler', 'crashpad', 'notification', 'unins', 'updater', 
    'ffmpeg', 'dnspy', 'gifski', 'nircmd', 'unitycrash', 'createdump',
    'gameupdate', 'patch', 'patcher',
    'config.sh', 'setup.sh', 'install.sh', 'uninstall.sh', 'configure.sh'
];
const WRAPPER_DIRECTORY_NAMES = new Set([
    'app', 'bin', 'binaries', 'data', 'game', 'release', 'runtime', 
    'win64', 'windows', 'x64', 'x86', 'linux', 'linux64', 'x86_64'
]);

export interface LibraryConfig {
    libraryPaths: string[];
    libraryPath: string;
    maxDepth: number;
    autoLaunch: boolean | 'minimized';
    minimizeToTray: boolean;
    telemetryEnabled?: boolean;
    exposeBetaOptions?: boolean;
    titleDisplayMode?: 'metadata' | 'legacy_folder';
    displayProductCodes?: boolean;
}

export function isPlainObject(value: any): boolean {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function clampLibraryMaxDepth(value: any): number {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    if (!Number.isFinite(parsed)) return DEFAULT_LIBRARY_MAX_DEPTH;
    return Math.min(MAX_LIBRARY_MAX_DEPTH, Math.max(MIN_LIBRARY_MAX_DEPTH, parsed));
}

export function normalizeLibraryConfigShape(config: any): LibraryConfig {
    const base = isPlainObject(config) ? config : {};
    const rawPaths = base.libraryPaths || (base.libraryPath ? [base.libraryPath] : []);
    const libraryPaths = Array.isArray(rawPaths)
        ? rawPaths.filter((p: any) => typeof p === 'string' && p.trim() !== '')
        : [];
    return {
        libraryPaths,
        libraryPath: libraryPaths[0] || '',
        maxDepth: clampLibraryMaxDepth(base.maxDepth),
        autoLaunch: (base.autoLaunch === 'minimized')
            ? 'minimized'
            : (base.autoLaunch === 'on' || base.autoLaunch === 'true' || base.autoLaunch === true),
        minimizeToTray: typeof base.minimizeToTray === 'boolean' ? base.minimizeToTray : false,
        telemetryEnabled: typeof base.telemetryEnabled === 'boolean' ? base.telemetryEnabled : undefined,
        exposeBetaOptions: typeof base.exposeBetaOptions === 'boolean' ? base.exposeBetaOptions : false,
        titleDisplayMode: (base.titleDisplayMode === 'legacy_folder') ? 'legacy_folder' : 'metadata',
        displayProductCodes: typeof base.displayProductCodes === 'boolean' ? base.displayProductCodes : false
    };
}

export function normalizePathForComparison(targetPath: string, targetPlatform: NodeJS.Platform = process.platform): string {
    const raw = String(targetPath || '').trim();
    if (!raw) return '';
    if (targetPlatform === 'win32') {
        return path.win32.resolve(raw).replace(/[\\/]+/g, '\\').toLowerCase();
    }
    return path.posix.resolve(raw).replace(/[\\/]+/g, '/').toLowerCase();
}

export function normalizeRelativeGameKey(relativePath: string): string {
    let str = String(relativePath || '')
        .replace(/[\\/]+/g, '/')
        .replace(/^\.\/+/, '')
        .replace(/^\/+/, '');
    while (str.endsWith('/')) {
        str = str.slice(0, -1);
    }
    return str;
}

export function buildGameKey(libraryPath: string, folderPath: string): string {
    const relativePath = normalizeRelativeGameKey(path.relative(libraryPath, folderPath));
    return relativePath || path.basename(folderPath);
}

export function getLeafFolderName(folderPath: string): string {
    let normalized = String(folderPath || '');
    while (normalized.endsWith('\\') || normalized.endsWith('/')) {
        normalized = normalized.slice(0, -1);
    }
    return path.basename(normalized);
}

export interface ExecutableCandidate {
    name: string;
    platform: 'windows' | 'linux';
}

export async function isRecognizedExecutable(
    entry: { name: string; isFile: () => boolean },
    folderPath: string,
    fs: any,
    targetPlatform: NodeJS.Platform = process.platform
): Promise<{ isExecutable: boolean; platform: 'windows' | 'linux' }> {
    if (!entry.isFile()) return { isExecutable: false, platform: 'windows' };

    const name = entry.name.toLowerCase();
    if (name.startsWith('.') || EXECUTABLE_BLACKLIST.some(token => name.includes(token))) {
        return { isExecutable: false, platform: 'windows' };
    }

    if (name.endsWith('.exe')) {
        return { isExecutable: true, platform: 'windows' };
    }

    if (name.endsWith('.x86_64') || name.endsWith('.x86') || name.endsWith('.appimage') || name.endsWith('.sh')) {
        return { isExecutable: true, platform: 'linux' };
    }

    const ext = path.extname(name);
    if (!ext && targetPlatform !== 'win32') {
        try {
            const fullPath = path.join(folderPath, entry.name);
            const stats = await fs.stat(fullPath);
            if (stats && typeof stats.mode === 'number' && (stats.mode & 0o111) !== 0) {
                return { isExecutable: true, platform: 'linux' };
            }
        } catch {}
    }

    return { isExecutable: false, platform: 'windows' };
}

export function pickPreferredExecutable(
    currentPath: string,
    executableEntries: ExecutableCandidate[],
    targetPlatform: NodeJS.Platform = process.platform
): { exePath: string; platform: 'windows' | 'linux' } | null {
    if (executableEntries.length === 0) return null;

    const folderName = path.basename(currentPath).toLowerCase();
    const isConfigOrSetup = (name: string) => {
        const lower = name.toLowerCase();
        return (
            lower.startsWith('config.') || lower.startsWith('setup.') ||
            lower.startsWith('setting.') || lower.startsWith('settings.') ||
            lower.startsWith('configure.') || lower.startsWith('install.') ||
            lower.startsWith('uninstall.') || lower.startsWith('patch.') ||
            lower.startsWith('patcher.') || lower.startsWith('update.') ||
            lower.startsWith('updater.') || lower.startsWith('gameupdate')
        );
    };

    const nonConfig = executableEntries.filter(e => !isConfigOrSetup(e.name));
    const pool = nonConfig.length > 0 ? nonConfig : executableEntries;

    const isHostNative = (candidate: ExecutableCandidate) => {
        return targetPlatform === 'win32' ? candidate.platform === 'windows' : candidate.platform === 'linux';
    };

    const isNativeStandard = (name: string) => {
        const lower = name.toLowerCase();
        if (targetPlatform === 'win32') {
            return lower === 'game.exe';
        }
        return (
            lower === 'game.x86_64' || lower === 'start.sh' || 
            lower === 'run.sh' || lower === 'launch.sh' || 
            lower === 'apprun' || lower === 'game.appimage' || lower === 'game.sh'
        );
    };

    // Tier 1: Host-Native matching folder base name
    const tier1 = pool.find(e => isHostNative(e) && e.name.toLowerCase().includes(folderName));
    if (tier1) return { exePath: path.join(currentPath, tier1.name), platform: tier1.platform };

    // Tier 2: Host-Native standard or first native candidate
    const tier2Standard = pool.find(e => isHostNative(e) && isNativeStandard(e.name));
    if (tier2Standard) return { exePath: path.join(currentPath, tier2Standard.name), platform: tier2Standard.platform };
    const tier2First = pool.find(e => isHostNative(e));
    if (tier2First) return { exePath: path.join(currentPath, tier2First.name), platform: tier2First.platform };

    // Tier 3: Cross-platform matching folder base name
    const tier3 = pool.find(e => e.name.toLowerCase().includes(folderName));
    if (tier3) return { exePath: path.join(currentPath, tier3.name), platform: tier3.platform };

    // Tier 4: Cross-platform standard or first candidate
    const tier4Standard = pool.find(e => e.name.toLowerCase() === 'game.exe');
    if (tier4Standard) return { exePath: path.join(currentPath, tier4Standard.name), platform: tier4Standard.platform };

    const first = pool[0];
    return { exePath: path.join(currentPath, first.name), platform: first.platform };
}

export function getSmartName(exePath: string, topName: string): string {
    return TitleCleaningPipeline.buildSmartName(exePath, topName);
}

export function isDescendantPath(parentPath: string, childPath: string): boolean {
    const relative = path.relative(parentPath, childPath);
    return !!relative && !relative.startsWith('..') && !path.isAbsolute(relative);
}

export function shouldPromoteWrapperDirectory(currentPath: string, childFolderPath: string, libraryPath: string, targetPlatform: NodeJS.Platform = process.platform): boolean {
    if (normalizePathForComparison(currentPath, targetPlatform) === normalizePathForComparison(libraryPath, targetPlatform)) return false;
    const childLeaf = getLeafFolderName(childFolderPath).toLowerCase();
    return WRAPPER_DIRECTORY_NAMES.has(childLeaf);
}

export interface CandidateGame {
    folderPath: string;
    exePath: string;
    platform: 'windows' | 'linux';
}

export async function collectGameCandidates(
    fs: any,
    libraryPath: string,
    currentPath: string,
    depth: number,
    maxDepth: number,
    targetPlatform: NodeJS.Platform = process.platform
): Promise<CandidateGame[]> {
    let entries: any[];
    try {
        entries = await fs.readdir(currentPath, { withFileTypes: true });
    } catch {
        return [];
    }

    const isRoot = depth === 0 || normalizePathForComparison(currentPath, targetPlatform) === normalizePathForComparison(libraryPath, targetPlatform);

    // 1. Recurse into child directories first up to maxDepth
    let nestedCandidates: CandidateGame[] = [];
    if (depth < maxDepth) {
        const childDirectories = entries.filter((entry) => entry.isDirectory());
        const nestedGroups = await Promise.all(
            childDirectories.map((entry) => collectGameCandidates(fs, libraryPath, path.join(currentPath, entry.name), depth + 1, maxDepth, targetPlatform))
        );
        nestedCandidates = nestedGroups.flat();
    }

    // 2. If child directories contain game candidates, return all of them (or promote single wrapper directory)
    if (nestedCandidates.length > 0) {
        if (!isRoot && nestedCandidates.length === 1 && shouldPromoteWrapperDirectory(currentPath, nestedCandidates[0].folderPath, libraryPath)) {
            return [{
                folderPath: currentPath,
                exePath: nestedCandidates[0].exePath,
                platform: nestedCandidates[0].platform
            }];
        }
        return nestedCandidates;
    }

    // 3. If NO child games were found, check if this directory is a leaf game folder with an executable
    if (!isRoot) {
        const recognizedList = await Promise.all(
            entries.map(async (entry) => {
                const rec = await isRecognizedExecutable(entry, currentPath, fs, targetPlatform);
                return rec.isExecutable ? { name: entry.name, platform: rec.platform } : null;
            })
        );
        const executableEntries = recognizedList.filter((e): e is ExecutableCandidate => e !== null);
        if (executableEntries.length > 0) {
            const preferred = pickPreferredExecutable(currentPath, executableEntries, targetPlatform);
            return preferred ? [{ folderPath: currentPath, exePath: preferred.exePath, platform: preferred.platform }] : [];
        }
    }

    return [];
}

export function dedupeCandidates(candidates: CandidateGame[], targetPlatform: NodeJS.Platform = process.platform): CandidateGame[] {
    const unique = new Map<string, CandidateGame>();
    for (const candidate of candidates) {
        unique.set(normalizePathForComparison(candidate.folderPath, targetPlatform), candidate);
    }
    return [...unique.values()];
}

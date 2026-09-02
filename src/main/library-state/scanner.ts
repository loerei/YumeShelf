import * as path from 'node:path';
import { TitleCleaningPipeline } from './title-pipeline';
import {
    AppBundleInspector,
    NodeFileSystemProvider,
    YumeEngine,
    type IFileSystem,
    type IFileHandle,
    type PlatformType
} from '@yumeshelf/engine';

export const DEFAULT_LIBRARY_MAX_DEPTH = 5;
export const MIN_LIBRARY_MAX_DEPTH = 0;
export const MAX_LIBRARY_MAX_DEPTH = 12;

const EXECUTABLE_SUBSTRING_BLACKLIST = [
    'crashhandler', 'crashpad', 'notification', 'unins', 'updater', 
    'ffmpeg', 'dnspy', 'gifski', 'nircmd', 'unitycrash', 'createdump',
    'gameupdate'
];

const EXECUTABLE_STEM_BLACKLIST = new Set([
    'patch', 'patcher', 'prereq', 'redist', 'vcredist', 'dxsetup', 'directx', 
    'config', 'setup', 'install', 'uninstall', 'configure', 'dxwebsetup'
]);

export function isBlacklistedExecutableName(name: string): boolean {
    if (name.startsWith('.')) return true;
    if (EXECUTABLE_SUBSTRING_BLACKLIST.some(token => name.includes(token))) {
        return true;
    }
    const ext = path.extname(name);
    const stem = ext ? name.slice(0, -ext.length) : name;
    if (EXECUTABLE_STEM_BLACKLIST.has(stem)) {
        return true;
    }
    return (
        stem.startsWith('patch_') || stem.startsWith('patch-') || stem.startsWith('patch.') ||
        stem.endsWith('_patch') || stem.endsWith('-patch') ||
        stem.startsWith('redist_') || stem.startsWith('redist-') ||
        stem.startsWith('vcredist') || stem.startsWith('prereq')
    );
}
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
    preferredLocale?: string;
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
    const rawLocale = typeof base.preferredLocale === 'string' ? base.preferredLocale.trim() : undefined;
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
        displayProductCodes: typeof base.displayProductCodes === 'boolean' ? base.displayProductCodes : false,
        preferredLocale: rawLocale ? rawLocale : undefined
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

export function adaptFileSystem(fs: any): IFileSystem {
    if (!fs) {
        return new NodeFileSystemProvider();
    }
    return {
        async stat(filePath: string) {
            return fs.stat(filePath);
        },
        async readdir(dirPath: string) {
            return fs.readdir(dirPath);
        },
        async exists(filePath: string): Promise<boolean> {
            if (typeof fs.exists === 'function') {
                return fs.exists(filePath);
            }
            if (typeof fs.access === 'function') {
                try {
                    await fs.access(filePath);
                    return true;
                } catch {
                    return false;
                }
            }
            try {
                await fs.stat(filePath);
                return true;
            } catch {
                return false;
            }
        },
        async readFile(filePath: string, encoding?: BufferEncoding): Promise<string | Buffer> {
            if (typeof fs.readFile === 'function') {
                return fs.readFile(filePath, encoding);
            }
            if (typeof fs.open === 'function') {
                const handle = await fs.open(filePath, 'r');
                try {
                    if (typeof handle.readFile === 'function') {
                        return await handle.readFile({ encoding });
                    }
                    const stat = await fs.stat(filePath);
                    const size = typeof stat.size === 'number' ? stat.size : 0;
                    if (typeof handle.read === 'function') {
                        const readResult = await handle.read(0, size);
                        const buf = Buffer.isBuffer(readResult) ? readResult : Buffer.alloc(0);
                        return encoding ? buf.toString(encoding) : buf;
                    }
                } finally {
                    await handle.close?.();
                }
            }
            throw new Error(`readFile is not supported by provided fs`);
        },
        async open(filePath: string): Promise<IFileHandle> {
            if (typeof fs.open === 'function') {
                const handle = await fs.open(filePath, 'r');
                if (typeof handle.read === 'function') {
                    return {
                        read: async (offset: number, length: number): Promise<Buffer> => {
                            if (handle.read.length === 2) {
                                return handle.read(offset, length);
                            }
                            const buf = Buffer.alloc(length);
                            const { bytesRead } = await handle.read(buf, 0, length, offset);
                            return buf.subarray(0, bytesRead);
                        },
                        close: async (): Promise<void> => {
                            await handle.close?.();
                        }
                    };
                }
            }
            if (typeof fs.readFile === 'function') {
                const content = await fs.readFile(filePath);
                const buf = Buffer.isBuffer(content) ? content : Buffer.from(content);
                return {
                    read: async (offset: number, length: number): Promise<Buffer> => {
                        return buf.subarray(offset, Math.min(offset + length, buf.length));
                    },
                    close: async (): Promise<void> => {}
                };
            }
            throw new Error(`open is not supported by provided fs`);
        }
    };
}

export interface ExecutableCandidate {
    name: string;
    platform: PlatformType;
    resolvedExePath?: string;
}

export async function isRecognizedExecutable(
    entry: { name: string; isFile: () => boolean; isDirectory?: () => boolean },
    folderPath: string,
    fs: any,
    targetPlatform: NodeJS.Platform = process.platform
): Promise<{ isExecutable: boolean; platform: PlatformType; resolvedExePath?: string }> {
    if (targetPlatform === 'darwin' && typeof entry.isDirectory === 'function' && entry.isDirectory() && (entry.name.endsWith('.app') || entry.name.toLowerCase().endsWith('.app'))) {
        const bundlePath = path.join(folderPath, entry.name);
        const adaptedFs = adaptFileSystem(fs);
        let bundleInfo: any = null;
        try {
            bundleInfo = await AppBundleInspector.fromPath(bundlePath, adaptedFs);
        } catch {
            bundleInfo = null;
        }
        let resolvedExePath = bundleInfo?.executablePath || undefined;
        if (!resolvedExePath) {
            const fallbackPath = path.join(bundlePath, 'Contents', 'MacOS', path.basename(entry.name, '.app'));
            try {
                if (await adaptedFs.exists(fallbackPath)) {
                    resolvedExePath = fallbackPath;
                }
            } catch {
                // ignore
            }
        }
        return { isExecutable: true, platform: 'macos', resolvedExePath };
    }

    if (!entry.isFile()) return { isExecutable: false, platform: 'windows' };

    const name = entry.name.toLowerCase();
    if (isBlacklistedExecutableName(name)) {
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
        if (targetPlatform === 'darwin') {
            if (typeof fs?.open !== 'function' && typeof fs?.readFile !== 'function') {
                return { isExecutable: false, platform: 'windows' };
            }
            try {
                const fullPath = path.join(folderPath, entry.name);
                const stats = await fs.stat(fullPath);
                if (stats && typeof stats.mode === 'number' && (stats.mode & 0o111) !== 0) {
                    const adaptedFs = adaptFileSystem(fs);
                    const macho = await YumeEngine.inspectMachOFile(fullPath, adaptedFs);
                    if (macho) {
                        return { isExecutable: true, platform: 'macos' };
                    }
                }
            } catch {}
            return { isExecutable: false, platform: 'windows' };
        }

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
): { exePath: string; platform: PlatformType } | null {
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

    const formatResult = (preferred: ExecutableCandidate) => ({
        exePath: preferred.resolvedExePath || path.join(currentPath, preferred.name),
        platform: preferred.platform
    });

    if (targetPlatform === 'darwin') {
        const isAppBundle = (e: ExecutableCandidate) =>
            e.platform === 'macos' && (e.name.endsWith('.app') || e.name.toLowerCase().endsWith('.app'));

        const isStandaloneMachO = (e: ExecutableCandidate) =>
            e.platform === 'macos' && !(e.name.endsWith('.app') || e.name.toLowerCase().endsWith('.app'));

        const isLauncherScript = (e: ExecutableCandidate) => {
            const lower = e.name.toLowerCase();
            return lower === 'start.sh' || lower === 'launch.sh';
        };

        const matchesFolder = (e: ExecutableCandidate) => {
            if (!folderName) return false;
            const lowerName = e.name.toLowerCase();
            let stem = lowerName;
            if (lowerName.endsWith('.app')) {
                stem = lowerName.slice(0, -4);
            } else {
                const ext = path.extname(lowerName);
                if (ext) {
                    stem = lowerName.slice(0, -ext.length);
                }
            }
            return stem === folderName || lowerName.includes(folderName) || folderName.includes(stem);
        };

        // Tier 1: Host-native .app bundle matching folder base name
        const tier1 = pool.find(e => isAppBundle(e) && matchesFolder(e));
        if (tier1) return formatResult(tier1);

        // Tier 2: Any host-native .app bundle
        const tier2 = pool.find(e => isAppBundle(e));
        if (tier2) return formatResult(tier2);

        // Tier 3: Standalone Mach-O binary matching folder base name
        const tier3 = pool.find(e => isStandaloneMachO(e) && matchesFolder(e));
        if (tier3) return formatResult(tier3);

        // Tier 4: Any standalone Mach-O binary
        const tier4 = pool.find(e => isStandaloneMachO(e));
        if (tier4) return formatResult(tier4);

        // Tier 5: Host-native launcher scripts (start.sh, launch.sh)
        const tier5 = pool.find(e => isLauncherScript(e));
        if (tier5) return formatResult(tier5);

        // Tier 6: Cross-platform fallback (.exe, Linux binaries)
        const tier6Matching = pool.find(e => matchesFolder(e));
        if (tier6Matching) return formatResult(tier6Matching);
        const tier6Standard = pool.find(e => e.name.toLowerCase() === 'game.exe');
        if (tier6Standard) return formatResult(tier6Standard);
        return formatResult(pool[0]);
    }

    const isHostNative = (candidate: ExecutableCandidate) => {
        if (targetPlatform === 'win32') return candidate.platform === 'windows';
        return candidate.platform === 'linux';
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
    if (tier1) return formatResult(tier1);

    // Tier 2: Host-Native standard or first native candidate
    const tier2Standard = pool.find(e => isHostNative(e) && isNativeStandard(e.name));
    if (tier2Standard) return formatResult(tier2Standard);
    const tier2First = pool.find(e => isHostNative(e));
    if (tier2First) return formatResult(tier2First);

    // Tier 3: Cross-platform matching folder base name
    const tier3 = pool.find(e => e.name.toLowerCase().includes(folderName));
    if (tier3) return formatResult(tier3);

    // Tier 4: Cross-platform standard or first candidate
    const tier4Standard = pool.find(e => e.name.toLowerCase() === 'game.exe');
    if (tier4Standard) return formatResult(tier4Standard);

    const first = pool[0];
    return formatResult(first);
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
    platform: PlatformType;
}

export async function collectGameCandidates(
    fs: any,
    libraryPath: string,
    currentPath: string,
    depth: number,
    maxDepth: number,
    targetPlatform: NodeJS.Platform = process.platform
): Promise<CandidateGame[]> {
    if (currentPath.length > 4 && currentPath.toLowerCase().endsWith('.app')) {
        return [];
    }

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
        const childDirectories = entries.filter((entry) => typeof entry.isDirectory === 'function' ? entry.isDirectory() : !!entry.isDirectory);
        const appBundles: any[] = [];
        const normalDirs: any[] = [];

        for (const dir of childDirectories) {
            if (typeof dir.name === 'string' && dir.name.length > 4 && dir.name.toLowerCase().endsWith('.app')) {
                appBundles.push(dir);
            } else {
                normalDirs.push(dir);
            }
        }

        const adaptedFs = adaptFileSystem(fs);
        const bundleCandidates: CandidateGame[] = [];
        for (const bundleEntry of appBundles) {
            const bundlePath = path.join(currentPath, bundleEntry.name);
            let resolvedExePath: string | null = null;
            try {
                const bundleInfo = await AppBundleInspector.fromPath(bundlePath, adaptedFs);
                resolvedExePath = bundleInfo?.executablePath || null;
            } catch {
                resolvedExePath = null;
            }

            if (!resolvedExePath) {
                const fallbackExe = path.join(bundlePath, 'Contents', 'MacOS', path.basename(bundlePath, '.app'));
                try {
                    if (await adaptedFs.exists(fallbackExe)) {
                        resolvedExePath = fallbackExe;
                    }
                } catch {
                    // ignore
                }
            }

            if (resolvedExePath) {
                bundleCandidates.push({
                    folderPath: bundlePath,
                    exePath: resolvedExePath,
                    platform: 'macos'
                });
            } else {
                console.warn(`[SCANNER][WARN] Unresolvable .app bundle at "${bundlePath}": executable missing or unreadable`);
            }
        }

        const nestedGroups = await Promise.all(
            normalDirs.map((entry) => collectGameCandidates(fs, libraryPath, path.join(currentPath, entry.name), depth + 1, maxDepth, targetPlatform))
        );
        nestedCandidates = [...nestedGroups.flat(), ...bundleCandidates];
    }

    // 2. Check direct executables in the current directory (filtering out .app bundles to avoid duplicate I/O)
    let directCandidate: CandidateGame | null = null;
    if (!isRoot) {
        const candidateEntries = entries.filter((entry) => {
            const isDir = typeof entry.isDirectory === 'function' ? entry.isDirectory() : (entry.isDirectory ?? !entry.isFile?.());
            const isBundle = isDir && typeof entry.name === 'string' && entry.name.length > 4 && entry.name.toLowerCase().endsWith('.app');
            return !isBundle;
        });

        const recognizedList = await Promise.all(
            candidateEntries.map(async (entry): Promise<ExecutableCandidate | null> => {
                const rec = await isRecognizedExecutable(entry, currentPath, fs, targetPlatform);
                if (!rec.isExecutable) return null;
                const candidate: ExecutableCandidate = {
                    name: entry.name,
                    platform: rec.platform
                };
                if (rec.resolvedExePath) {
                    candidate.resolvedExePath = rec.resolvedExePath;
                }
                return candidate;
            })
        );
        const executableEntries = recognizedList.filter((e): e is ExecutableCandidate => e !== null);
        if (executableEntries.length > 0) {
            const preferred = pickPreferredExecutable(currentPath, executableEntries, targetPlatform);
            if (preferred) {
                directCandidate = {
                    folderPath: currentPath,
                    exePath: preferred.exePath,
                    platform: preferred.platform
                };
            }
        }
    }

    // 3. Resolution Matrix:
    // Case A: Multiple independent game subtrees (N >= 2)
    // -> Current directory is a Container / Category folder!
    // -> Return all child games (ignoring any loose parent installer/tool).
    if (nestedCandidates.length >= 2) {
        return nestedCandidates;
    }

    // Case B: Exactly 1 child candidate (N = 1)
    if (nestedCandidates.length === 1) {
        // If current directory HAS its own top-level executable (e.g. Acmesia/akumesia.exe),
        // the top-level launcher in the game root ALWAYS takes precedence over sub-engine binaries in data/!
        // Exception: On Darwin, native .app bundles take precedence over non-native executables (e.g. loose .exe)
        if (directCandidate) {
            const isNativeMacPreserved = targetPlatform === 'darwin' && nestedCandidates[0].platform === 'macos' && directCandidate.platform !== 'macos';
            if (!isNativeMacPreserved) {
                return [directCandidate];
            }
            return nestedCandidates;
        }
        // If current directory has NO executable, promote wrapper (e.g. Game/bin -> Game)
        if (!isRoot && shouldPromoteWrapperDirectory(currentPath, nestedCandidates[0].folderPath, libraryPath, targetPlatform)) {
            return [{
                folderPath: currentPath,
                exePath: nestedCandidates[0].exePath,
                platform: nestedCandidates[0].platform
            }];
        }
        return nestedCandidates;
    }

    // Case C: No child games (N = 0)
    // -> If current directory has an executable, it is a leaf game!
    if (directCandidate) {
        return [directCandidate];
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

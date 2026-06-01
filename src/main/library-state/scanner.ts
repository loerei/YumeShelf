import * as path from 'path';

export const DEFAULT_LIBRARY_MAX_DEPTH = 5;
export const MIN_LIBRARY_MAX_DEPTH = 0;
export const MAX_LIBRARY_MAX_DEPTH = 12;

const EXECUTABLE_BLACKLIST = ['crashhandler', 'notification', 'unins', 'updater', 'ffmpeg', 'dnspy', 'gifski', 'nircmd', 'unitycrash'];
const WRAPPER_DIRECTORY_NAMES = new Set(['app', 'bin', 'binaries', 'data', 'game', 'release', 'runtime', 'win64', 'windows', 'x64', 'x86']);

export interface LibraryConfig {
    libraryPaths: string[];
    libraryPath: string;
    maxDepth: number;
    autoLaunch: boolean | 'minimized';
    minimizeToTray: boolean;
    telemetryEnabled?: boolean;
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
        telemetryEnabled: typeof base.telemetryEnabled === 'boolean' ? base.telemetryEnabled : undefined
    };
}

export function normalizePathForComparison(targetPath: string): string {
    return path.resolve(String(targetPath || '')).replace(/[\\/]+/g, '\\').toLowerCase();
}

export function normalizeRelativeGameKey(relativePath: string): string {
    return String(relativePath || '')
        .replace(/[\\/]+/g, '/')
        .replace(/^\.\/+/, '')
        .replace(/^\/+/, '')
        .replace(/\/+$/, '');
}

export function buildGameKey(libraryPath: string, folderPath: string): string {
    const relativePath = normalizeRelativeGameKey(path.relative(libraryPath, folderPath));
    return relativePath || path.basename(folderPath);
}

export function getLeafFolderName(folderPath: string): string {
    const normalized = String(folderPath || '').replace(/[\\/]+$/, '');
    return path.basename(normalized);
}

interface ExecutableEntry {
    name: string;
    isFile: () => boolean;
    isDirectory: () => boolean;
}

function pickPreferredExecutable(currentPath: string, executableEntries: ExecutableEntry[]): string | null {
    const folderName = path.basename(currentPath).toLowerCase();
    const nonConfigEntries = executableEntries.filter(
        (entry) => {
            const name = entry.name.toLowerCase();
            return name !== 'config.exe' && name !== 'setup.exe' && name !== 'setting.exe' && name !== 'settings.exe' && name !== 'configure.exe';
        }
    );
    const candidates = nonConfigEntries.length > 0 ? nonConfigEntries : executableEntries;
    const preferred = candidates.find((entry) => entry.name.toLowerCase().includes(folderName))
        || candidates.find((entry) => entry.name.toLowerCase() === 'game.exe')
        || candidates[0];
    return preferred ? path.join(currentPath, preferred.name) : null;
}

export function getSmartName(exePath: string, topName: string): string {
    const id = exePath.match(/(RJ\d{6,8}|\b\d{6,8}\b)/i);
    const clean = (value: string) => value
        .replace(/\[.*?\]|RY-|(RJ\d+|\b\d{6,8}\b)|(_pc|_win|_dlsite|_eng|subscriber|v\d+\.\d+.*)|[_-]/gi, ' ')
        .trim()
        .replace(/\s+/g, ' ');
    return (id ? `[${id[0].toUpperCase()}] ` : '') + (clean(path.basename(path.dirname(exePath))) || clean(topName));
}

export function isDescendantPath(parentPath: string, childPath: string): boolean {
    const relative = path.relative(parentPath, childPath);
    return !!relative && !relative.startsWith('..') && !path.isAbsolute(relative);
}

export function shouldPromoteWrapperDirectory(currentPath: string, childFolderPath: string, libraryPath: string): boolean {
    if (normalizePathForComparison(currentPath) === normalizePathForComparison(libraryPath)) return false;
    return WRAPPER_DIRECTORY_NAMES.has(getLeafFolderName(childFolderPath).toLowerCase());
}

export interface CandidateGame {
    folderPath: string;
    exePath: string;
}

export async function collectGameCandidates(
    fs: any,
    libraryPath: string,
    currentPath: string,
    depth: number,
    maxDepth: number
): Promise<CandidateGame[]> {
    let entries: any[];
    try {
        entries = await fs.readdir(currentPath, { withFileTypes: true });
    } catch {
        return [];
    }

    const executableEntries = entries
        .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.exe'))
        .filter((entry) => !EXECUTABLE_BLACKLIST.some((token) => entry.name.toLowerCase().includes(token)));

    if (executableEntries.length > 0) {
        const exePath = pickPreferredExecutable(currentPath, executableEntries);
        return exePath ? [{ folderPath: currentPath, exePath }] : [];
    }

    if (depth >= maxDepth) {
        return [];
    }

    const childDirectories = entries.filter((entry) => entry.isDirectory());
    const nestedGroups = await Promise.all(
        childDirectories.map((entry) => collectGameCandidates(fs, libraryPath, path.join(currentPath, entry.name), depth + 1, maxDepth))
    );
    const nestedCandidates = nestedGroups.flat();

    if (nestedCandidates.length === 1 && shouldPromoteWrapperDirectory(currentPath, nestedCandidates[0].folderPath, libraryPath)) {
        return [{
            folderPath: currentPath,
            exePath: nestedCandidates[0].exePath
        }];
    }

    return nestedCandidates;
}

export function dedupeCandidates(candidates: CandidateGame[]): CandidateGame[] {
    const unique = new Map<string, CandidateGame>();
    for (const candidate of candidates) {
        unique.set(normalizePathForComparison(candidate.folderPath), candidate);
    }
    return [...unique.values()];
}

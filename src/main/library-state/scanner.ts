// @ts-nocheck
const path = require('path');

const DEFAULT_LIBRARY_MAX_DEPTH = 5;
const MIN_LIBRARY_MAX_DEPTH = 0;
const MAX_LIBRARY_MAX_DEPTH = 12;
const EXECUTABLE_BLACKLIST = ['crashhandler', 'notification', 'unins', 'updater', 'ffmpeg', 'dnspy', 'gifski', 'nircmd', 'unitycrash'];
const WRAPPER_DIRECTORY_NAMES = new Set(['app', 'bin', 'binaries', 'data', 'game', 'release', 'runtime', 'win64', 'windows', 'x64', 'x86']);

function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function clampLibraryMaxDepth(value) {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    if (!Number.isFinite(parsed)) return DEFAULT_LIBRARY_MAX_DEPTH;
    return Math.min(MAX_LIBRARY_MAX_DEPTH, Math.max(MIN_LIBRARY_MAX_DEPTH, parsed));
}

function normalizeLibraryConfigShape(config) {
    const base = isPlainObject(config) ? config : {};
    return {
        libraryPath: typeof base.libraryPath === 'string' ? base.libraryPath : '',
        maxDepth: clampLibraryMaxDepth(base.maxDepth),
        autoLaunch: (base.autoLaunch === 'minimized') ? 'minimized' : (base.autoLaunch === 'on' || base.autoLaunch === 'true' || base.autoLaunch === true),
        minimizeToTray: typeof base.minimizeToTray === 'boolean' ? base.minimizeToTray : false
    };
}

function normalizePathForComparison(targetPath) {
    return path.resolve(String(targetPath || '')).replace(/[\\/]+/g, '\\').toLowerCase();
}

function normalizeRelativeGameKey(relativePath) {
    return String(relativePath || '')
        .replace(/[\\/]+/g, '/')
        .replace(/^\.\/+/, '')
        .replace(/^\/+/, '')
        .replace(/\/+$/, '');
}

function buildGameKey(libraryPath, folderPath) {
    const relativePath = normalizeRelativeGameKey(path.relative(libraryPath, folderPath));
    return relativePath || path.basename(folderPath);
}

function getLeafFolderName(folderPath) {
    const normalized = String(folderPath || '').replace(/[\\/]+$/, '');
    return path.basename(normalized);
}

function pickPreferredExecutable(currentPath, executableEntries) {
    const folderName = path.basename(currentPath).toLowerCase();
    const preferred = executableEntries.find((entry) => entry.name.toLowerCase().includes(folderName))
        || executableEntries.find((entry) => entry.name.toLowerCase() === 'game.exe')
        || executableEntries[0];
    return preferred ? path.join(currentPath, preferred.name) : null;
}

function getSmartName(exePath, topName) {
    const id = exePath.match(/(RJ\d{6,8}|\b\d{6,8}\b)/i);
    const clean = (value) => value
        .replace(/\[.*?\]|RY-|(RJ\d+|\b\d{6,8}\b)|(_pc|_win|_dlsite|_eng|subscriber|v\d+\.\d+.*)|[_-]/gi, ' ')
        .trim()
        .replace(/\s+/g, ' ');
    return (id ? `[${id[0].toUpperCase()}] ` : '') + (clean(path.basename(path.dirname(exePath))) || clean(topName));
}

function isDescendantPath(parentPath, childPath) {
    const relative = path.relative(parentPath, childPath);
    return !!relative && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function shouldPromoteWrapperDirectory(currentPath, childFolderPath, libraryPath) {
    if (normalizePathForComparison(currentPath) === normalizePathForComparison(libraryPath)) return false;
    return WRAPPER_DIRECTORY_NAMES.has(getLeafFolderName(childFolderPath).toLowerCase());
}

async function collectGameCandidates(fs, libraryPath, currentPath, depth, maxDepth) {
    let entries;
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

function dedupeCandidates(candidates) {
    const unique = new Map();
    for (const candidate of candidates) {
        unique.set(normalizePathForComparison(candidate.folderPath), candidate);
    }
    return [...unique.values()];
}

module.exports = {
    DEFAULT_LIBRARY_MAX_DEPTH,
    MIN_LIBRARY_MAX_DEPTH,
    MAX_LIBRARY_MAX_DEPTH,
    clampLibraryMaxDepth,
    normalizeLibraryConfigShape,
    normalizePathForComparison,
    normalizeRelativeGameKey,
    buildGameKey,
    getLeafFolderName,
    getSmartName,
    isDescendantPath,
    collectGameCandidates,
    dedupeCandidates,
    isPlainObject
};

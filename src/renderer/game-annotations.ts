// @ts-nocheck
export const LOCATION_DISPLAY_MODES = {
    FULL: 'full',
    PARENT: 'parent'
};

function normalizePathSegment(value) {
    let s = String(value || '').replaceAll('\\', '/').replace(/\/+/g, '/');
    if (s.startsWith('/')) s = s.slice(1);
    if (s.endsWith('/')) s = s.slice(0, -1);
    return s;
}

function getLibraryRootName(libraryPath) {
    const normalized = normalizePathSegment(libraryPath);
    const parts = normalized.split('/').filter(Boolean);
    return parts.at(-1) ?? '';
}

function getParentLocationLabel(relativePathDisplay) {
    const normalized = normalizePathSegment(relativePathDisplay);
    const parts = normalized.split('/').filter(Boolean);
    if (parts.length === 0) return '';
    if (parts.length === 1) return parts[0];
    return parts.slice(0, -1).join('/');
}

function normalizeComparableText(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/\[[^\]]*\]/g, ' ')
        .replace(/\b(rj\d{6,8}|\d{6,8})\b/gi, ' ')
        .replace(/\bv?\d+(?:\.\d+)+(?:\s*[a-z]+)?\b/gi, ' ')
        .replace(/[_-]+/g, ' ')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
        .replace(/\s+/g, ' ');
}

function getExecutableStem(exePath) {
    const normalized = String(exePath || '').replace(/[\\/]+/g, '/');
    const baseName = normalized.split('/').pop() || '';
    return baseName.replace(/\.(exe|x86_64|x86|appimage|sh)$/i, '');
}

export function buildDuplicateSignature(game) {
    if (game?.duplicateSignature) {
        return game.duplicateSignature;
    }
    const signatureSource = `${game.name || ''} ${game.folderName || ''} ${game.exePath || ''}`;
    const idMatch = /(RJ\d{6,8}|\b\d{6,8}\b)/i.exec(signatureSource);
    if (idMatch) {
        return `id:${idMatch[0].toUpperCase()}`;
    }

    const normalizedName = normalizeComparableText(game.name || game.folderName);
    const normalizedExeStem = normalizeComparableText(getExecutableStem(game.exePath));
    if (!normalizedName || normalizedName.length < 4 || !normalizedExeStem || normalizedExeStem.length < 3) {
        return null;
    }

    return `name:${normalizedName}|exe:${normalizedExeStem}`;
}

function normalizeForPathMatching(value) {
    return String(value || '')
        .trim()
        .replaceAll('\\', '/')
        .replace(/\/+/g, '/')
        .replace(/\/$/, '')
        .toLowerCase();
}

export function annotateGamesForDisplay(games, libraryPathsInput = '', locationDisplayMode = LOCATION_DISPLAY_MODES.PARENT) {
    if (!Array.isArray(games)) return [];

    const rawPaths = Array.isArray(libraryPathsInput)
        ? libraryPathsInput
        : (typeof libraryPathsInput === 'string'
            ? [libraryPathsInput]
            : (libraryPathsInput?.libraryPaths || [libraryPathsInput?.libraryPath || '']));

    const candidatePaths = rawPaths
        .filter((p) => typeof p === 'string' && p.trim() !== '')
        .sort((a, b) => normalizePathSegment(b).length - normalizePathSegment(a).length);

    function annotateRecord(game) {
        if (game == null) return game;

        const rawGameFolder = game.folderPath || game.relativePath || game.gameKey || game.folderName || '';
        const normGameFolder = normalizeForPathMatching(rawGameFolder);

        const owningLibPath = candidatePaths.find((candidate) => {
            const normCandidate = normalizeForPathMatching(candidate);
            if (!normCandidate) return false;
            return normGameFolder === normCandidate || normGameFolder.startsWith(`${normCandidate}/`);
        }) || candidatePaths[0] || '';

        const rootName = getLibraryRootName(owningLibPath);
        const relativePath = normalizePathSegment(game.relativePath || game.gameKey || game.folderName);

        const normRelative = normalizeForPathMatching(relativePath);
        const normRoot = normalizeForPathMatching(rootName);

        let displayPath = '';
        if (normRoot && (normRelative === normRoot || normRelative.startsWith(`${normRoot}/`))) {
            displayPath = relativePath;
        } else {
            displayPath = normalizePathSegment([rootName, relativePath].filter(Boolean).join('/'));
        }

        const parentLocationLabel = getParentLocationLabel(displayPath);
        const fullLocationLabel = displayPath;
        const useFullLocation = locationDisplayMode === LOCATION_DISPLAY_MODES.FULL;
        const relativePathDisplay = useFullLocation ? fullLocationLabel : parentLocationLabel;
        const locationLabel = useFullLocation ? fullLocationLabel : parentLocationLabel;

        return {
            ...game,
            fullLocationLabel,
            locationLabel,
            parentLocationLabel,
            relativePathDisplay: relativePathDisplay ? `/${relativePathDisplay}` : '/',
            relativePathFullDisplay: fullLocationLabel ? `/${fullLocationLabel}` : '/'
        };
    }

    return games.map((game) => {
        if (game == null) return game;
        return {
            ...annotateRecord(game),
            instances: Array.isArray(game.instances) ? game.instances.map(annotateRecord) : game.instances,
            primaryInstance: game.primaryInstance ? annotateRecord(game.primaryInstance) : game.primaryInstance
        };
    });
}

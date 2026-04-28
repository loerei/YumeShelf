function normalizePathSegment(value) {
    return String(value || '')
        .replace(/[\\/]+/g, '/')
        .replace(/^\/+/, '')
        .replace(/\/+$/, '');
}

function getLibraryRootName(libraryPath) {
    const normalized = normalizePathSegment(libraryPath);
    const parts = normalized.split('/').filter(Boolean);
    return parts.length > 0 ? parts[parts.length - 1] : '';
}

function normalizeComparableText(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/\[[^\]]*]/g, ' ')
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
    return baseName.replace(/\.exe$/i, '');
}

function buildDuplicateSignature(game) {
    const signatureSource = `${game.name || ''} ${game.folderName || ''} ${game.exePath || ''}`;
    const idMatch = signatureSource.match(/(RJ\d{6,8}|\b\d{6,8}\b)/i);
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

export function annotateGamesForDisplay(games, libraryPath = '') {
    const rootName = getLibraryRootName(libraryPath);
    const duplicateGroups = new Map();

    games.forEach((game) => {
        const signature = buildDuplicateSignature(game);
        if (!signature) return;
        const nextGroup = duplicateGroups.get(signature) || [];
        nextGroup.push(game);
        duplicateGroups.set(signature, nextGroup);
    });

    return games.map((game) => {
        const relativePath = normalizePathSegment(game.relativePath || game.gameKey || game.folderName);
        const displayPath = normalizePathSegment([rootName, relativePath].filter(Boolean).join('/'));
        const duplicateSignature = buildDuplicateSignature(game);
        const duplicateCount = duplicateSignature ? (duplicateGroups.get(duplicateSignature) || []).length : 0;

        return {
            ...game,
            duplicateCount: duplicateCount > 1 ? duplicateCount : 0,
            relativePathDisplay: displayPath ? `/${displayPath}` : '/'
        };
    });
}

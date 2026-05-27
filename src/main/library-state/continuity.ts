import { 
    normalizePathForComparison, 
    getLeafFolderName, 
    isDescendantPath, 
    buildGameKey, 
    normalizeRelativeGameKey 
} from './scanner';

export function normalizeComparableText(value: any): string {
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

export function getExecutableStem(exePath: string): string {
    const normalized = String(exePath || '').replace(/[\\/]+/g, '/');
    const baseName = normalized.split('/').pop() || '';
    return baseName.replace(/\.exe$/i, '');
}

export function buildContinuitySignature(record: any): string | null {
    if (!record) return null;
    const signatureSource = `${record.folderName || getLeafFolderName(record.folderPath)} ${record.exePath || ''}`;
    const idMatch = signatureSource.match(/(RJ\d{6,8}|\b\d{6,8}\b)/i);
    if (idMatch) {
        return `id:${idMatch[0].toUpperCase()}`;
    }

    const normalizedFolderName = normalizeComparableText(record.folderName || getLeafFolderName(record.folderPath));
    const normalizedExeStem = normalizeComparableText(getExecutableStem(record.exePath));
    if (!normalizedFolderName || normalizedFolderName.length < 4 || !normalizedExeStem || normalizedExeStem.length < 3) {
        return null;
    }

    return `folder:${normalizedFolderName}|exe:${normalizedExeStem}`;
}

export function buildLegacyMigrationMap(candidates: any[], legacyGames: any[]): Map<string, any> {
    const migrationMap = new Map<string, any>();
    for (const legacyGame of legacyGames) {
        const exactMatches = candidates.filter((candidate) => normalizePathForComparison(candidate.folderPath) === normalizePathForComparison(legacyGame.folderPath));
        if (exactMatches.length === 1) {
            migrationMap.set(normalizePathForComparison(exactMatches[0].folderPath), legacyGame);
            continue;
        }

        const descendantMatches = candidates.filter((candidate) => isDescendantPath(legacyGame.folderPath, candidate.folderPath));
        if (descendantMatches.length === 1) {
            migrationMap.set(normalizePathForComparison(descendantMatches[0].folderPath), legacyGame);
        }
    }
    return migrationMap;
}

export function mapStoredGamesByFolderPath(storedGames: Record<string, any>): Map<string, any> {
    const result = new Map<string, any>();
    for (const [gameKey, record] of Object.entries(storedGames)) {
        if (!record || typeof record.folderPath !== 'string') continue;
        result.set(normalizePathForComparison(record.folderPath), { gameKey, ...record });
    }
    return result;
}

export interface MoveMigrationOptions {
    candidates: any[];
    libraryPath: string;
    storedGames: Record<string, any>;
}

export function buildMoveMigrationMap({ candidates, libraryPath, storedGames }: MoveMigrationOptions): Map<string, any> {
    const candidateGameKeys = new Set(candidates.map((candidate) => buildGameKey(libraryPath, candidate.folderPath)));
    const candidateFolderPaths = new Set(candidates.map((candidate) => normalizePathForComparison(candidate.folderPath)));
    const orphanedRecordsBySignature = new Map<string, any[]>();
    const unmatchedCandidatesBySignature = new Map<string, any[]>();

    for (const [gameKey, record] of Object.entries(storedGames)) {
        if (!record || typeof record.folderPath !== 'string' || typeof record.exePath !== 'string') continue;
        if (candidateGameKeys.has(gameKey)) continue;
        if (candidateFolderPaths.has(normalizePathForComparison(record.folderPath))) continue;

        const signature = buildContinuitySignature({ gameKey, ...record });
        if (!signature) continue;
        const nextGroup = orphanedRecordsBySignature.get(signature) || [];
        nextGroup.push({ gameKey, ...record });
        orphanedRecordsBySignature.set(signature, nextGroup);
    }

    for (const candidate of candidates) {
        const candidateRecord = {
            exePath: candidate.exePath,
            folderName: getLeafFolderName(candidate.folderPath),
            folderPath: candidate.folderPath
        };
        const signature = buildContinuitySignature(candidateRecord);
        if (!signature) continue;
        const nextGroup = unmatchedCandidatesBySignature.get(signature) || [];
        nextGroup.push(candidate);
        unmatchedCandidatesBySignature.set(signature, nextGroup);
    }

    const migrationMap = new Map<string, any>();
    for (const [signature, records] of orphanedRecordsBySignature.entries()) {
        const candidatesForSignature = unmatchedCandidatesBySignature.get(signature) || [];
        if (records.length !== 1 || candidatesForSignature.length !== 1) continue;
        migrationMap.set(normalizePathForComparison(candidatesForSignature[0].folderPath), records[0]);
    }

    return migrationMap;
}

export function normalizeGameRecord(gameKey: string, record: any): any {
    return {
        ...record,
        folderName: record.folderName || getLeafFolderName(record.folderPath),
        gameKey,
        relativePath: record.relativePath || gameKey
    };
}

export function buildLogicalGameId(record: any): string {
    const signature = buildContinuitySignature(record);
    if (signature) {
        return `game:${signature}`;
    }
    const relativePath = normalizeRelativeGameKey(record?.relativePath || record?.gameKey || record?.folderName);
    return `path:${relativePath}`;
}

export function buildInstanceId(record: any): string {
    return `inst:${normalizeRelativeGameKey(record?.gameKey || record?.relativePath || record?.folderName)}`;
}

export function compareLogicalRecordDepth(a: any, b: any): number {
    const depthA = String(a.relativePath || '').split(/[\\/]+/).filter(Boolean).length;
    const depthB = String(b.relativePath || '').split(/[\\/]+/).filter(Boolean).length;
    if (depthA !== depthB) return depthA - depthB;
    return String(a.relativePath || '').localeCompare(String(b.relativePath || ''));
}

export function choosePrimaryRecord(records: any[]): any {
    const recents = records
        .filter((record) => (record.lastPlayed || 0) > 0)
        .sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0));
    if (recents.length > 0) {
        return recents[0];
    }
    return [...records].sort(compareLogicalRecordDepth)[0];
}

export function buildLogicalGames(records: any[], assignments: Record<string, string[]> = {}): any[] {
    const grouped = new Map<string, any[]>();

    for (const record of records) {
        const gameId = buildLogicalGameId(record);
        const nextGroup = grouped.get(gameId) || [];
        nextGroup.push(record);
        grouped.set(gameId, nextGroup);
    }

    return [...grouped.entries()].map(([gameId, groupRecords]) => {
        const orderedRecords = [...groupRecords].sort(compareLogicalRecordDepth);
        const primaryRecord = choosePrimaryRecord(orderedRecords);
        const continuitySignature = buildContinuitySignature(primaryRecord);
        const duplicateSignature = orderedRecords.length > 1 && continuitySignature ? continuitySignature : null;
        const categoryIds = Array.isArray(assignments[gameId]) ? [...assignments[gameId]] : [];
        const instances = orderedRecords.map((record) => ({
            ...record,
            categoryIds,
            gameId,
            instanceId: buildInstanceId(record)
        }));
        const primaryInstance = instances.find((instance) => instance.gameKey === primaryRecord.gameKey) || instances[0];

        return {
            ...primaryRecord,
            categoryIds,
            dateAdded: orderedRecords.reduce((min, record) => Math.min(min, record.dateAdded || min), primaryRecord.dateAdded || Date.now()),
            duplicateCount: orderedRecords.length > 1 ? orderedRecords.length : 0,
            duplicateSignature,
            exePath: primaryRecord.exePath,
            favorite: orderedRecords.some((record) => !!record.favorite),
            runInBackground: primaryRecord.runInBackground || false,
            autoTranslate: primaryRecord.autoTranslate || false,
            folderName: primaryRecord.folderName,
            folderPath: primaryRecord.folderPath,
            gameId,
            gameKey: primaryRecord.gameKey,
            instances,
            lastPlayed: orderedRecords.reduce((max, record) => Math.max(max, record.lastPlayed || 0), 0),
            name: primaryRecord.name,
            playtime: orderedRecords.reduce((sum, record) => sum + (record.playtime || 0), 0),
            primaryInstance,
            relativePath: primaryRecord.relativePath
        };
    });
}

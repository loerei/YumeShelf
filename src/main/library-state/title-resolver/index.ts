import * as path from 'path';
import * as fs from 'fs';
import { TitleCleaningPipeline } from '../title-pipeline';
import { collectCandidateDirectories } from './directory-explorer';
import { resolveRpgMakerTitle } from './rpg-maker-resolver';
import { resolveUnityTitle } from './unity-resolver';
import { isGenericOrEmptyTitle } from './blocklist';

export interface TitleResolutionContext {
    folderPath: string;
    exePath: string;
    preferredLocale?: string;
    titleDisplayMode?: 'metadata' | 'legacy_folder';
    displayProductCodes?: boolean;
    fs?: any;
    fsSync?: any;
}

const WRAPPER_NAMES = new Set([
    'windows', 'win64', 'win32', 'build', 'game', 'games', 'app', 'bin', 
    'release', 'x64', 'x86', 'linux', 'linux64', 'data', 'www'
]);

export function extractExeStem(exePath: string): string | null {
    if (!exePath) return null;
    const base = path.basename(exePath, path.extname(exePath));
    if (isGenericOrEmptyTitle(base) || WRAPPER_NAMES.has(base.toLowerCase())) {
        return null;
    }
    const cleaned = TitleCleaningPipeline.cleanFolderName(base);
    return isGenericOrEmptyTitle(cleaned) ? null : cleaned;
}

export function extractMeaningfulFolderName(folderPath: string, exePath: string): string {
    let current = folderPath;
    while (current && WRAPPER_NAMES.has(path.basename(current).toLowerCase())) {
        const parent = path.dirname(current);
        if (!parent || parent === current) break;
        current = parent;
    }
    const cleaned = TitleCleaningPipeline.cleanFolderName(path.basename(current));
    if (cleaned && !isGenericOrEmptyTitle(cleaned)) return cleaned;

    const exeStem = extractExeStem(exePath);
    if (exeStem) return exeStem;

    const topFolder = path.basename(folderPath);
    const topCleaned = TitleCleaningPipeline.cleanFolderName(topFolder);
    if (topCleaned && !isGenericOrEmptyTitle(topCleaned)) return topCleaned;

    return '';
}

function formatWithProductCode(id: string | null, title: string): string {
    if (id && title) return `[${id}] ${title}`;
    if (id) return `[${id}]`;
    return title;
}

export async function resolveGameTitle(context: TitleResolutionContext): Promise<string> {
    const {
        folderPath,
        exePath,
        preferredLocale,
        titleDisplayMode = 'metadata',
        displayProductCodes = false,
        fs: injectedFs
    } = context;

    const fsImpl = injectedFs || fs.promises;
    const rawId = TitleCleaningPipeline.extractProductCode(exePath)
        || TitleCleaningPipeline.extractProductCode(folderPath);
    const id = displayProductCodes ? rawId : null;

    // 1. If user explicitly requested legacy folder mode, bypass metadata extraction
    if (titleDisplayMode === 'legacy_folder') {
        const folderName = extractMeaningfulFolderName(folderPath, exePath);
        return formatWithProductCode(id, folderName) || (rawId ? `[${rawId}]` : path.basename(folderPath));
    }

    // Collect dynamic candidate directory tree (climbing upwards from exePath to folderPath & exploring children)
    const candidateDirs = await collectCandidateDirectories(folderPath, exePath, fsImpl);

    // 2. Try Engine Manifest Tier: RPG Maker MV/MZ
    try {
        const rpgMakerTitle = await resolveRpgMakerTitle(candidateDirs, preferredLocale, fsImpl);
        if (rpgMakerTitle && !isGenericOrEmptyTitle(rpgMakerTitle)) {
            return formatWithProductCode(id, rpgMakerTitle);
        }
    } catch {}

    // 3. Try Engine Manifest Tier: Unity (app.info)
    try {
        const unityTitle = await resolveUnityTitle(candidateDirs, fsImpl);
        if (unityTitle && !isGenericOrEmptyTitle(unityTitle)) {
            return formatWithProductCode(id, unityTitle);
        }
    } catch {}

    // 4. Try Executable Stem Tier (for custom binaries / Unity compiled)
    const exeStem = extractExeStem(exePath);
    if (exeStem && !isGenericOrEmptyTitle(exeStem)) {
        return formatWithProductCode(id, exeStem);
    }

    // 5. Fallback to Rule-Cleaned Meaningful Folder Name
    const meaningfulFolder = extractMeaningfulFolderName(folderPath, exePath);
    return formatWithProductCode(id, meaningfulFolder) || (rawId ? `[${rawId}]` : path.basename(folderPath));
}

export * from './blocklist';
export * from './directory-explorer';
export * from './rpg-maker-resolver';
export * from './unity-resolver';

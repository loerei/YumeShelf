import * as path from 'path';
import * as fs from 'fs';
import { TitleCleaningPipeline } from '../title-pipeline';
import { resolveRpgMakerTitle } from './rpg-maker-resolver';
import { isGenericOrEmptyTitle } from './blocklist';

export interface TitleResolutionContext {
    folderPath: string;
    exePath: string;
    preferredLocale?: string;
    titleDisplayMode?: 'metadata' | 'legacy_folder';
    fs?: any;
    fsSync?: any;
}

export async function resolveGameTitle(context: TitleResolutionContext): Promise<string> {
    const {
        folderPath,
        exePath,
        preferredLocale,
        titleDisplayMode = 'metadata',
        fs: injectedFs
    } = context;

    const fsImpl = injectedFs || fs.promises;

    // 1. If user explicitly requested legacy folder mode, bypass metadata extraction
    if (titleDisplayMode === 'legacy_folder') {
        return TitleCleaningPipeline.buildSmartName(exePath, path.basename(folderPath));
    }

    // 2. Try Engine Manifest Tier (RPG Maker MV/MZ, etc.)
    try {
        const engineTitle = await resolveRpgMakerTitle(folderPath, preferredLocale, fsImpl);
        if (engineTitle && !isGenericOrEmptyTitle(engineTitle)) {
            const id = TitleCleaningPipeline.extractProductCode(exePath)
                || TitleCleaningPipeline.extractProductCode(folderPath);
            return (id ? `[${id}] ` : '') + engineTitle;
        }
    } catch {
        // Continue to fallback
    }

    // 3. Fallback to Rule-Cleaned Folder Name
    return TitleCleaningPipeline.buildSmartName(exePath, path.basename(folderPath));
}

export * from './blocklist';
export * from './rpg-maker-resolver';

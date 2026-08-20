import * as path from 'node:path';

export interface TitleCleaningRule {
    name: string;
    apply: (text: string) => string;
}

export const ProductCodeRule: TitleCleaningRule = {
    name: 'ProductCodeRule',
    apply: (text: string) => text
        .replace(/RY-/gi, ' ')
        .replace(/(RJ|VJ|BJ|RE)\d{6,8}/gi, ' ')
        .replace(/\b\d{6,8}\b/gi, ' ')
};

export const DistributionSourceRule: TitleCleaningRule = {
    name: 'DistributionSourceRule',
    apply: (text: string) => text
        .replace(/\[[^[\]\r\n]*\]/g, ' ')
};

export const LanguageTagRule: TitleCleaningRule = {
    name: 'LanguageTagRule',
    apply: (text: string) => text
        .replace(/_pc|_win|_dlsite|_eng|subscriber/gi, ' ')
        .replace(/\b(eng|english|jap|japanese|viet|vietnamese|chs|cht|kr)\b/gi, ' ')
};

export const VersionTagRule: TitleCleaningRule = {
    name: 'VersionTagRule',
    apply: (text: string) => text
        .replace(/v\d+\.\d+[^\r\n]*$/i, ' ')
        .replace(/ver\s*\d+\.\d+[^\r\n]*$/i, ' ')
};

export const WhitespaceNormalizationRule: TitleCleaningRule = {
    name: 'WhitespaceNormalizationRule',
    apply: (text: string) => text
        .replace(/[_-]/g, ' ')
        .trim()
        .replace(/\s+/g, ' ')
};

export class TitleCleaningPipeline {
    private readonly rules: TitleCleaningRule[];

    constructor(customRules?: TitleCleaningRule[]) {
        this.rules = customRules || [
            DistributionSourceRule,
            ProductCodeRule,
            LanguageTagRule,
            VersionTagRule,
            WhitespaceNormalizationRule
        ];
    }

    public clean(rawName: string): string {
        if (!rawName || typeof rawName !== 'string') return '';
        let result = rawName;
        for (const rule of this.rules) {
            result = rule.apply(result);
        }
        return result;
    }

    public static extractProductCode(targetPath: string): string | null {
        const match = /(RJ\d{6,8}|VJ\d{6,8}|BJ\d{6,8}|RE\d{6,8}|\b\d{6,8}\b)/i.exec(targetPath || '');
        return match ? match[0].toUpperCase() : null;
    }

    public static cleanFolderName(rawName: string): string {
        const pipeline = new TitleCleaningPipeline();
        return pipeline.clean(rawName);
    }

    public static buildSmartName(exePath: string, topName: string): string {
        const id = TitleCleaningPipeline.extractProductCode(exePath) || TitleCleaningPipeline.extractProductCode(topName);
        let folderName = path.basename(path.dirname(exePath));
        const WRAPPER_NAMES = new Set(['windows', 'win64', 'win32', 'build', 'game', 'games', 'app', 'bin', 'release', 'x64', 'x86', 'linux', 'linux64', 'data', 'www']);
        if (WRAPPER_NAMES.has(folderName.toLowerCase())) {
            const parent = path.dirname(path.dirname(exePath));
            if (parent && parent !== path.dirname(exePath)) {
                folderName = path.basename(parent);
            }
        }
        let cleaned = TitleCleaningPipeline.cleanFolderName(folderName) || TitleCleaningPipeline.cleanFolderName(topName);
        if (!cleaned || cleaned.trim() === '') {
            const exeStem = path.basename(exePath, path.extname(exePath));
            if (exeStem && !WRAPPER_NAMES.has(exeStem.toLowerCase()) && exeStem.toLowerCase() !== 'game') {
                cleaned = TitleCleaningPipeline.cleanFolderName(exeStem);
            }
        }
        return (id ? `[${id}] ` : '') + (cleaned || folderName || topName);
    }
}

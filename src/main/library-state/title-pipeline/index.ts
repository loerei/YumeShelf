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
        .replace(/\[[^\]]*\]/g, ' ')
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
        .replace(/v\d+\.\d+.*$/i, ' ')
        .replace(/ver\s*\d+\.\d+.*$/i, ' ')
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
        const id = TitleCleaningPipeline.extractProductCode(exePath);
        const folderName = path.basename(path.dirname(exePath));
        const cleaned = TitleCleaningPipeline.cleanFolderName(folderName) || TitleCleaningPipeline.cleanFolderName(topName);
        return (id ? `[${id}] ` : '') + cleaned;
    }
}

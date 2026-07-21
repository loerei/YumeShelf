// @ts-nocheck
export { compareNumericVersions as compareVersions } from '../../shared/version-utils';

export function formatTemplate(template, replacements = {}) {
    return Object.entries(replacements).reduce((result, [key, value]) => {
        return result.replaceAll(`{${key}}`, value);
    }, template);
}


export function buildLanguagePackSearchHaystack(pack) {
    return [
        pack.code,
        pack.englishName,
        pack.nativeName,
        ...(pack.aliases || []),
        ...(pack.keywords || [])
    ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
}

export function formatDataSize(bytes) {
    if (!bytes || Number.isNaN(bytes) || bytes < 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex += 1;
    }
    return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

export function isFinalInstallPhase(appUpdate) {
    if (!appUpdate) return false;
    return appUpdate.actionState === 'installing'
        || appUpdate.installPhase === 'install-preparing'
        || appUpdate.installPhase === 'install-handoff';
}

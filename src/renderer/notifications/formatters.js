export function formatTemplate(template, replacements = {}) {
    return Object.entries(replacements).reduce((result, [key, value]) => {
        return result.replaceAll(`{${key}}`, value);
    }, template);
}

export function formatCount(count) {
    return String(Math.max(0, Number(count) || 0));
}

export function formatVersion(version) {
    return String(version || '').trim();
}

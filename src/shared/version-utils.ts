export type VersionValue = string | number | null | undefined;

export function compareNumericVersions(left: VersionValue, right: VersionValue): number {
    const toParts = (value: VersionValue): number[] => String(value || '0')
        .split('.')
        .map(part => Number.parseInt(part, 10))
        .map(part => Number.isFinite(part) ? part : 0);

    const a = toParts(left);
    const b = toParts(right);
    const len = Math.max(a.length, b.length);
    for (let i = 0; i < len; i += 1) {
        const delta = (a[i] || 0) - (b[i] || 0);
        if (delta !== 0) return delta;
    }
    return 0;
}

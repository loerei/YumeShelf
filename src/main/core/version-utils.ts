export function compareNumericVersions(left: string | number | null | undefined, right: string | number | null | undefined): number {
    const toParts = (value: string | number | null | undefined): number[] => String(value || '0')
        .split('.')
        .map(part => parseInt(part, 10))
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

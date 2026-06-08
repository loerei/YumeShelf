import * as path from 'node:path';

export function extractVersion(tagName: string | null | undefined): string {
    const value = String(tagName || '').trim();
    return value.replace(/^v/i, '');
}

export function isNumericVersionIdentifier(value: string | null | undefined): boolean {
    return /^\d+$/.test(String(value || '').trim());
}

export function parseAppReleaseVersion(value: string | null | undefined): { core: number[]; prerelease: (string | number)[] } {
    const normalized = extractVersion(value);
    const [corePart, ...prereleaseParts] = String(normalized || '0').split('-');
    const core = corePart
        .split('.')
        .map(part => Number.parseInt(part, 10))
        .map(part => Number.isFinite(part) ? part : 0);
    const prerelease = prereleaseParts
        .join('-')
        .split('.')
        .map(part => part.trim())
        .filter(Boolean)
        .map(part => isNumericVersionIdentifier(part) ? Number(part) : part.toLowerCase());
    return {
        core,
        prerelease
    };
}

function comparePrereleaseParts(aPrerelease: (string | number)[], bPrerelease: (string | number)[]): number {
    const aHasPrerelease = aPrerelease.length > 0;
    const bHasPrerelease = bPrerelease.length > 0;
    if (!aHasPrerelease && !bHasPrerelease) return 0;
    if (!aHasPrerelease) return 1;
    if (!bHasPrerelease) return -1;

    const prereleaseLength = Math.max(aPrerelease.length, bPrerelease.length);
    for (let index = 0; index < prereleaseLength; index += 1) {
        const leftPart = aPrerelease[index];
        const rightPart = bPrerelease[index];
        if (leftPart === undefined) return -1;
        if (rightPart === undefined) return 1;
        if (leftPart === rightPart) continue;

        const leftIsNumber = typeof leftPart === 'number';
        const rightIsNumber = typeof rightPart === 'number';
        if (leftIsNumber && rightIsNumber) return leftPart - rightPart;
        if (leftIsNumber) return -1;
        if (rightIsNumber) return 1;

        const delta = String(leftPart).localeCompare(String(rightPart));
        if (delta !== 0) return delta;
    }

    return 0;
}

export function compareAppReleaseVersions(left: string, right: string): number {
    const a = parseAppReleaseVersion(left);
    const b = parseAppReleaseVersion(right);
    const coreLength = Math.max(a.core.length, b.core.length);
    for (let index = 0; index < coreLength; index += 1) {
        const delta = (a.core[index] || 0) - (b.core[index] || 0);
        if (delta !== 0) return delta;
    }

    return comparePrereleaseParts(a.prerelease, b.prerelease);
}

export function isPrereleaseVersion(value: string | null | undefined): boolean {
    return String(extractVersion(value || '')).includes('-');
}

export function shouldIncludePrereleaseReleases(...versions: string[]): boolean {
    return versions.some(version => isPrereleaseVersion(version));
}

export function firstHexDigest(text: string | null | undefined): string | null {
    const match = (/\b[a-f0-9]{64}\b/i).exec(String(text || ''));
    return match ? match[0].toLowerCase() : null;
}

export function readAssetLabel(asset: any): string {
    return String(asset?.label || asset?.name || '').trim();
}

export function readAssetName(asset: any): string {
    return String(asset?.name || asset?.label || '').trim();
}

export function decodeHtmlEntities(value: string | null | undefined): string {
    return String(value || '')
        .replaceAll('&nbsp;', ' ')
        .replaceAll('&amp;', '&')
        .replaceAll('&lt;', '<')
        .replaceAll('&gt;', '>')
        .replaceAll('&quot;', '"')
        .replaceAll('&#39;', "'");
}

export function normalizeInlineHtmlToMarkdown(value: string | null | undefined): string {
    return String(value || '')
        .replace(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_match, href, text) => `[${normalizeInlineHtmlToMarkdown(text).trim()}](${href.trim()})`)
        .replace(/<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi, (_match, _tag, text) => `**${normalizeInlineHtmlToMarkdown(text).trim()}**`)
        .replace(/<(em|i)[^>]*>([\s\S]*?)<\/\1>/gi, (_match, _tag, text) => `*${normalizeInlineHtmlToMarkdown(text).trim()}*`)
        .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, (_match, text) => `\`${decodeHtmlEntities(text).trim()}\``)
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/?[^>]+>/g, '')
        .replace(/\n{3,}/g, '\n\n');
}

export function normalizeReleaseNotesForReview(value: string | null | undefined): string {
    const raw = String(value || '').replace(/\r\n?/g, '\n').trim();
    if (!raw) return '';
    if (!/<[a-z][\s\S]*>/i.test(raw)) {
        return decodeHtmlEntities(raw);
    }

    let normalized = raw;
    normalized = normalized.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_match, level, text) => {
        const headingLevel = Math.min(3, Math.max(1, Number(level) || 1));
        return `\n\n${'#'.repeat(headingLevel)} ${normalizeInlineHtmlToMarkdown(text).trim()}\n\n`;
    });
    normalized = normalized.replace(/<(ul|ol)[^>]*>([\s\S]*?)<\/\1>/gi, (_match, _tag, inner) => {
        const items = Array.from(inner.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi))
            .map((entry: any) => `- ${normalizeInlineHtmlToMarkdown(entry[1]).trim()}`)
            .filter(Boolean);
        return items.length > 0 ? `\n${items.join('\n')}\n` : '\n';
    });
    normalized = normalized.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (_match, text) => `\n\n${normalizeInlineHtmlToMarkdown(text).trim()}\n\n`);
    normalized = normalized.replace(/<hr\s*\/?>/gi, '\n\n---\n\n');
    normalized = normalized.replace(/<br\s*\/?>/gi, '\n');
    normalized = normalizeInlineHtmlToMarkdown(normalized);
    normalized = decodeHtmlEntities(normalized)
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    return normalized;
}

export function normalizeRelease(raw: any, fallbackReleasePageUrl: string): any {
    const tagName = String(raw?.tag_name || raw?.tagName || '').trim();
    const version = extractVersion(tagName);
    const assets = Array.isArray(raw?.assets) ? raw.assets.map((asset: any) => ({
        name: readAssetName(asset),
        label: readAssetLabel(asset),
        browserDownloadUrl: String(asset?.browser_download_url || asset?.url || '').trim()
    })) : [];

    return {
        assets,
        body: normalizeReleaseNotesForReview(raw?.body || raw?.releaseNotes || ''),
        htmlUrl: String(raw?.html_url || raw?.url || fallbackReleasePageUrl).trim(),
        name: String(raw?.name || '').trim(),
        publishedAt: raw?.published_at ? String(raw.published_at) : null,
        tagName,
        version
    };
}

export function getReleaseDisplayName(release: any): string {
    return String(release?.name || '').trim() || `YumeShelf v${String(release?.version || '').trim()}`;
}

export function formatStackedReleaseNotes(releases: any[]): string {
    return releases
        .filter(release => release?.version)
        .map((release) => {
            const body = String(release.body || '').trim() || '_No release notes were published for this version._';
            return `## ${getReleaseDisplayName(release)}\n\n${body}`;
        })
        .join('\n\n---\n\n');
}

export function isPortableExeAsset(asset: any, version: string): boolean {
    const candidates = [readAssetName(asset), readAssetLabel(asset)].map(value => value.toLowerCase());
    return candidates.some((value) => value.includes('yumeshelf')
        && value.includes(version.toLowerCase())
        && value.endsWith('.exe')
        && !value.endsWith('.exe.sha256'));
}

export function isNsisInstallerAsset(asset: any, version: string): boolean {
    const candidates = [readAssetName(asset), readAssetLabel(asset)].map(value => value.toLowerCase());
    return candidates.some((value) => value.includes('yumeshelf')
        && value.includes('setup')
        && value.includes(version.toLowerCase())
        && value.endsWith('.exe')
        && !value.endsWith('.exe.sha256'));
}

export function isChecksumAsset(asset: any, version: string, artifactKind: string): boolean {
    const candidates = [readAssetName(asset), readAssetLabel(asset)].map(value => value.toLowerCase());
    return candidates.some((value) => value.includes('yumeshelf')
        && (artifactKind !== 'nsis-installer' || value.includes('setup'))
        && value.includes(version.toLowerCase())
        && value.endsWith('.exe.sha256'));
}

export function inferExecutableArtifactKind(filePath: string): string {
    const fileName = path.basename(String(filePath || '')).toLowerCase();
    if (!fileName.endsWith('.exe')) return 'unknown';
    return fileName.includes('setup') ? 'nsis-installer' : 'portable-exe';
}

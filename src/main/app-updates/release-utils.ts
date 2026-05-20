// @ts-nocheck
function extractVersion(tagName) {
    const value = String(tagName || '').trim();
    return value.replace(/^v/i, '');
}

function isNumericVersionIdentifier(value) {
    return /^\d+$/.test(String(value || '').trim());
}

function parseAppReleaseVersion(value) {
    const normalized = extractVersion(value);
    const [corePart, ...prereleaseParts] = String(normalized || '0').split('-');
    const core = corePart
        .split('.')
        .map(part => parseInt(part, 10))
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

function compareAppReleaseVersions(left, right) {
    const a = parseAppReleaseVersion(left);
    const b = parseAppReleaseVersion(right);
    const coreLength = Math.max(a.core.length, b.core.length);
    for (let index = 0; index < coreLength; index += 1) {
        const delta = (a.core[index] || 0) - (b.core[index] || 0);
        if (delta !== 0) return delta;
    }

    const aHasPrerelease = a.prerelease.length > 0;
    const bHasPrerelease = b.prerelease.length > 0;
    if (!aHasPrerelease && !bHasPrerelease) return 0;
    if (!aHasPrerelease) return 1;
    if (!bHasPrerelease) return -1;

    const prereleaseLength = Math.max(a.prerelease.length, b.prerelease.length);
    for (let index = 0; index < prereleaseLength; index += 1) {
        const leftPart = a.prerelease[index];
        const rightPart = b.prerelease[index];
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

function isPrereleaseVersion(value) {
    return String(extractVersion(value || '')).includes('-');
}

function shouldIncludePrereleaseReleases(...versions) {
    return versions.some(version => isPrereleaseVersion(version));
}

function firstHexDigest(text) {
    const match = String(text || '').match(/\b[a-f0-9]{64}\b/i);
    return match ? match[0].toLowerCase() : null;
}

function readAssetLabel(asset) {
    return String(asset?.label || asset?.name || '').trim();
}

function readAssetName(asset) {
    return String(asset?.name || asset?.label || '').trim();
}

function decodeHtmlEntities(value) {
    return String(value || '')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'");
}

function normalizeInlineHtmlToMarkdown(value) {
    return String(value || '')
        .replace(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_match, href, text) => `[${normalizeInlineHtmlToMarkdown(text).trim()}](${href.trim()})`)
        .replace(/<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi, (_match, _tag, text) => `**${normalizeInlineHtmlToMarkdown(text).trim()}**`)
        .replace(/<(em|i)[^>]*>([\s\S]*?)<\/\1>/gi, (_match, _tag, text) => `*${normalizeInlineHtmlToMarkdown(text).trim()}*`)
        .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, (_match, text) => `\`${decodeHtmlEntities(text).trim()}\``)
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/?[^>]+>/g, '')
        .replace(/\n{3,}/g, '\n\n');
}

function normalizeReleaseNotesForReview(value) {
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
            .map((entry) => `- ${normalizeInlineHtmlToMarkdown(entry[1]).trim()}`)
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

function normalizeRelease(raw, fallbackReleasePageUrl) {
    const tagName = String(raw?.tag_name || raw?.tagName || '').trim();
    const version = extractVersion(tagName);
    const assets = Array.isArray(raw?.assets) ? raw.assets.map((asset) => ({
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

function getReleaseDisplayName(release) {
    return String(release?.name || '').trim() || `YumeShelf v${String(release?.version || '').trim()}`;
}

function formatStackedReleaseNotes(releases) {
    return releases
        .filter(release => release?.version)
        .map((release) => {
            const body = String(release.body || '').trim() || '_No release notes were published for this version._';
            return `## ${getReleaseDisplayName(release)}\n\n${body}`;
        })
        .join('\n\n---\n\n');
}

function isPortableExeAsset(asset, version) {
    const candidates = [readAssetName(asset), readAssetLabel(asset)].map(value => value.toLowerCase());
    return candidates.some((value) => value.includes('yumeshelf')
        && value.includes(version.toLowerCase())
        && value.endsWith('.exe')
        && !value.endsWith('.exe.sha256'));
}

function isNsisInstallerAsset(asset, version) {
    const candidates = [readAssetName(asset), readAssetLabel(asset)].map(value => value.toLowerCase());
    return candidates.some((value) => value.includes('yumeshelf')
        && value.includes('setup')
        && value.includes(version.toLowerCase())
        && value.endsWith('.exe')
        && !value.endsWith('.exe.sha256'));
}

function isChecksumAsset(asset, version, artifactKind) {
    const candidates = [readAssetName(asset), readAssetLabel(asset)].map(value => value.toLowerCase());
    return candidates.some((value) => value.includes('yumeshelf')
        && (artifactKind !== 'nsis-installer' || value.includes('setup'))
        && value.includes(version.toLowerCase())
        && value.endsWith('.exe.sha256'));
}

function inferExecutableArtifactKind(filePath) {
    const fileName = require('path').basename(String(filePath || '')).toLowerCase();
    if (!fileName.endsWith('.exe')) return 'unknown';
    return fileName.includes('setup') ? 'nsis-installer' : 'portable-exe';
}

module.exports = {
    compareAppReleaseVersions,
    extractVersion,
    firstHexDigest,
    formatStackedReleaseNotes,
    getReleaseDisplayName,
    inferExecutableArtifactKind,
    isChecksumAsset,
    isNsisInstallerAsset,
    isPortableExeAsset,
    isPrereleaseVersion,
    normalizeRelease,
    normalizeReleaseNotesForReview,
    readAssetLabel,
    readAssetName,
    shouldIncludePrereleaseReleases
};

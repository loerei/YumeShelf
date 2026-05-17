const { downloadBuffer } = require('../core/shared-io');
const {
    compareAppReleaseVersions,
    normalizeRelease,
    readAssetName,
    isPrereleaseVersion
} = require('./release-utils');

const APP_UPDATE_RELEASES_API_URL = 'https://api.github.com/repos/loerei/YumeShelf/releases?per_page=25';
const APP_UPDATE_RELEASE_PAGE_URL = 'https://github.com/loerei/YumeShelf/releases/latest';

function setupFeedResolver({
    startupNetworkTimeoutMs,
    appendVerboseUpdateLog
}) {
    async function resolveReleaseFeed(options = {}) {
        const includePrerelease = options.includePrerelease === true;
        const buffer = await downloadBuffer(APP_UPDATE_RELEASES_API_URL, 0, startupNetworkTimeoutMs);
        const raw = JSON.parse(buffer.toString('utf8'));
        const releases = Array.isArray(raw)
            ? raw
                .filter(release => !release?.draft && (includePrerelease || !release?.prerelease))
                .map(release => normalizeRelease(release, APP_UPDATE_RELEASE_PAGE_URL))
                .filter(release => !!release.version)
                .sort((left, right) => {
                    const versionDelta = compareAppReleaseVersions(right.version, left.version);
                    if (versionDelta !== 0) return versionDelta;
                    const publishedDelta = new Date(right.publishedAt || 0).getTime() - new Date(left.publishedAt || 0).getTime();
                    if (publishedDelta !== 0) return publishedDelta;
                    return String(right.tagName || '').localeCompare(String(left.tagName || ''));
                })
            : [];

        await appendVerboseUpdateLog(`resolveReleaseFeed includePrerelease=${includePrerelease} count=${releases.length} tags=${JSON.stringify(releases.slice(0, 5).map(release => ({ tag: release.tagName, version: release.version })))}`);
        return releases;
    }

    async function resolveLatestRelease(options = {}) {
        const releases = await resolveReleaseFeed(options);
        return releases[0] || null;
    }

    async function resolveNewerReleases(fromVersion, toVersion = null, options = {}) {
        const releases = await resolveReleaseFeed(options);
        return releases.filter((release) => {
            if (compareAppReleaseVersions(release.version, fromVersion) <= 0) {
                return false;
            }
            if (toVersion && compareAppReleaseVersions(release.version, toVersion) > 0) {
                return false;
            }
            return true;
        });
    }

    async function resolvePackagedFeedOverride({ currentVersion, runtime }) {
        if (runtime?.channel !== 'nsis') {
            await appendVerboseUpdateLog(`resolvePackagedFeedOverride skip-non-nsis current=${currentVersion} runtime=${JSON.stringify(runtime || null)}`);
            return null;
        }
        if (!isPrereleaseVersion(currentVersion)) {
            await appendVerboseUpdateLog(`resolvePackagedFeedOverride skip-non-prerelease current=${currentVersion}`);
            return null;
        }

        const releases = await resolveReleaseFeed({ includePrerelease: true });
        await appendVerboseUpdateLog(`resolvePackagedFeedOverride candidates current=${currentVersion} releases=${JSON.stringify(releases.slice(0, 5).map(release => ({ tag: release.tagName, version: release.version })))}`);
        const targetRelease = releases.find(release => compareAppReleaseVersions(release.version, currentVersion) > 0);
        if (!targetRelease) {
            await appendVerboseUpdateLog(`resolvePackagedFeedOverride none current=${currentVersion}`);
            return null;
        }

        const hasLatestManifest = targetRelease.assets.some(asset => readAssetName(asset).toLowerCase() === 'latest.yml');
        if (!hasLatestManifest) {
            await appendVerboseUpdateLog(`resolvePackagedFeedOverride skip-missing-latest current=${currentVersion} target=${targetRelease.version} tag=${targetRelease.tagName}`);
            return null;
        }

        const override = {
            channel: 'prerelease-github-generic',
            provider: 'generic',
            release: targetRelease,
            url: `https://github.com/loerei/YumeShelf/releases/download/${targetRelease.tagName}`
        };
        await appendVerboseUpdateLog(`resolvePackagedFeedOverride selected current=${currentVersion} target=${targetRelease.version} tag=${targetRelease.tagName} url=${override.url}`);
        return override;
    }

    return {
        resolveReleaseFeed,
        resolveLatestRelease,
        resolveNewerReleases,
        resolvePackagedFeedOverride
    };
}

module.exports = {
    setupFeedResolver,
    APP_UPDATE_RELEASE_PAGE_URL
};

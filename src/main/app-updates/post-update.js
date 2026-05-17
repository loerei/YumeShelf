const fs = require('fs/promises');
const {
    shouldIncludePrereleaseReleases,
    getReleaseDisplayName,
    formatStackedReleaseNotes,
    normalizeReleaseNotesForReview
} = require('./release-utils');
const { APP_UPDATE_RELEASE_PAGE_URL } = require('./feed-resolver');

function setupPostUpdateMarker({
    app,
    postUpdateMarkerFile,
    compareVersions,
    resolver,
    appendUpdateLog,
    appendVerboseUpdateLog
}) {
    async function consumePostUpdateMarker() {
        const markerExists = await fs.access(postUpdateMarkerFile).then(() => true).catch(() => false);
        await appendVerboseUpdateLog(`consumePostUpdateMarker begin exists=${markerExists}`);
        if (!markerExists) {
            return null;
        }

        let marker = null;
        try {
            const rawText = await fs.readFile(postUpdateMarkerFile, 'utf8');
            const sanitizedText = rawText.replace(/^\uFEFF/, '');
            const hasBom = rawText.charCodeAt(0) === 0xFEFF;
            await appendVerboseUpdateLog(`consumePostUpdateMarker raw length=${rawText.length} hasBom=${hasBom}`);
            marker = JSON.parse(sanitizedText);
        } catch (error) {
            await appendUpdateLog(`consumePostUpdateMarker parse-failed error=${String((error && error.stack) || error || '')}`);
        }

        try {
            await fs.unlink(postUpdateMarkerFile);
            await appendVerboseUpdateLog('consumePostUpdateMarker deleted-marker-file');
        } catch (error) {
            await appendUpdateLog(`consumePostUpdateMarker delete-failed error=${String((error && error.message) || error || '')}`);
        }

        if (!marker || typeof marker !== 'object') {
            await appendUpdateLog('consumePostUpdateMarker invalid-marker');
            return null;
        }

        const notice = {
            actionState: 'installed',
            available: false,
            deferredUntilNextLaunch: false,
            fromVersion: marker.fromVersion ? String(marker.fromVersion) : '',
            installed: true,
            installedAt: marker.installedAt ? String(marker.installedAt) : null,
            releaseName: marker.releaseName ? String(marker.releaseName) : '',
            releaseNotes: normalizeReleaseNotesForReview(marker.releaseNotes || ''),
            releaseUrl: marker.releaseUrl ? String(marker.releaseUrl) : APP_UPDATE_RELEASE_PAGE_URL,
            selfApplicable: true,
            version: marker.toVersion ? String(marker.toVersion) : (marker.version ? String(marker.version) : '')
        };

        if (!notice.version) {
            await appendUpdateLog('consumePostUpdateMarker missing-version');
            return null;
        }

        const currentVersion = app.getVersion();
        if (compareVersions(currentVersion, notice.version) !== 0) {
            await appendUpdateLog(`consumePostUpdateMarker version-mismatch current=${currentVersion} marker=${notice.version}`);
            return null;
        }

        try {
            const includePrerelease = shouldIncludePrereleaseReleases(notice.fromVersion, notice.version);
            const newerReleases = notice.fromVersion
                ? await resolver.resolveNewerReleases(notice.fromVersion, notice.version, { includePrerelease })
                : [];
            if (newerReleases.length > 0) {
                notice.releaseName = getReleaseDisplayName(newerReleases[0]);
                notice.releaseNotes = formatStackedReleaseNotes(newerReleases);
                notice.releaseUrl = newerReleases[0].htmlUrl || notice.releaseUrl;
            } else {
                const latestRelease = await resolver.resolveLatestRelease({ includePrerelease });
                if (latestRelease?.version === notice.version) {
                    notice.releaseName = getReleaseDisplayName(latestRelease);
                    notice.releaseNotes = formatStackedReleaseNotes([latestRelease]);
                    notice.releaseUrl = latestRelease.htmlUrl || notice.releaseUrl;
                }
            }
        } catch (error) {
            await appendUpdateLog(`consumePostUpdateMarker refresh-failed error=${String((error && error.stack) || error || '')}`);
        }

        await appendVerboseUpdateLog(`consumePostUpdateMarker notice=${JSON.stringify({
            fromVersion: notice.fromVersion,
            installedAt: notice.installedAt,
            releaseUrl: notice.releaseUrl,
            version: notice.version
        })}`);

        return notice;
    }

    return {
        consumePostUpdateMarker
    };
}

module.exports = {
    setupPostUpdateMarker
};

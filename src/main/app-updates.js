const fs = require('fs/promises');
const path = require('path');
const { downloadBuffer, ensureDir, isNetworkLikeError } = require('./core/shared-io');
const {
    compareAppReleaseVersions,
    formatStackedReleaseNotes,
    getReleaseDisplayName,
    normalizeRelease,
    normalizeReleaseNotesForReview,
    readAssetName,
    shouldIncludePrereleaseReleases,
    isPrereleaseVersion
} = require('./app-updates/release-utils');
const { resolveRuntimeUpdateStrategy } = require('./app-updates/runtime-strategy');
const { createNsisUpdaterService, isFakeVersionRun } = require('./nsis-updater');

const APP_UPDATE_RELEASES_API_URL = 'https://api.github.com/repos/loerei/YumeShelf/releases?per_page=25';
const APP_UPDATE_RELEASE_PAGE_URL = 'https://github.com/loerei/YumeShelf/releases/latest';
const VERBOSE_UPDATE_LOG = process.env.YUMESHELF_UPDATE_DEBUG === '1';
function createAppUpdateServices({
    app,
    broadcastStatus,
    compareVersions,
    openExternalUrl,
    startupNetworkTimeoutMs
}) {
    const updateCacheDir = path.join(app.getPath('userData'), 'app-update-cache');
    const postUpdateMarkerFile = path.join(updateCacheDir, 'post-update.json');
    const updateLogFile = path.join(updateCacheDir, 'portable-update.log');
    let latestKnownUpdate = null;

    async function appendUpdateLog(message) {
        await ensureDir(updateCacheDir);
        const line = `[${new Date().toISOString()}] ${message}\n`;
        await fs.appendFile(updateLogFile, line, 'utf8');
    }

    async function appendVerboseUpdateLog(message) {
        if (!VERBOSE_UPDATE_LOG) return;
        await appendUpdateLog(message);
    }

    async function logDebug(message) {
        await appendVerboseUpdateLog(`debug ${message}`);
    }

    const nsisUpdaterService = createNsisUpdaterService({
        app,
        appendUpdateLog,
        broadcastStatus,
        compareVersions: compareAppReleaseVersions,
        ensureDir,
        releasePageUrl: APP_UPDATE_RELEASE_PAGE_URL,
        resolveFeedOverride: resolvePackagedFeedOverride,
        updateCacheDir,
        postUpdateMarkerFile
    });

    function summarizeAppUpdate(update) {
        return nsisUpdaterService.summarizeUpdateState({
            available: !!update?.available,
            canSelfUpdate: !!update?.canSelfUpdate,
            deferredUntilNextLaunch: !!update?.deferredUntilNextLaunch,
            downloadable: !!update?.downloadable,
            downloadReady: !!update?.downloadReady,
            releaseName: update?.releaseName ? String(update.releaseName) : '',
            releaseNotes: normalizeReleaseNotesForReview(update?.releaseNotes || ''),
            releaseUrl: update?.releaseUrl ? String(update.releaseUrl) : APP_UPDATE_RELEASE_PAGE_URL,
            selfApplicable: !!update?.selfApplicable,
            version: update?.version ? String(update.version) : ''
        });
    }

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
                ? await resolveNewerReleases(notice.fromVersion, notice.version, { includePrerelease })
                : [];
            if (newerReleases.length > 0) {
                notice.releaseName = getReleaseDisplayName(newerReleases[0]);
                notice.releaseNotes = formatStackedReleaseNotes(newerReleases);
                notice.releaseUrl = newerReleases[0].htmlUrl || notice.releaseUrl;
            } else {
                const latestRelease = await resolveLatestRelease({ includePrerelease });
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

    async function enrichUpdateInfo(update, runtimeStrategy) {
        const enriched = {
            ...update,
            available: !!update?.available,
            canSelfUpdate: !!update?.canSelfUpdate,
            deferredUntilNextLaunch: !!update?.deferredUntilNextLaunch,
            downloadable: !!update?.downloadable,
            downloadReady: !!update?.downloadReady,
            fallbackReason: update?.fallbackReason ? String(update.fallbackReason) : null,
            releaseName: update?.releaseName ? String(update.releaseName) : '',
            releaseNotes: normalizeReleaseNotesForReview(update?.releaseNotes || ''),
            releaseUrl: update?.releaseUrl ? String(update.releaseUrl) : APP_UPDATE_RELEASE_PAGE_URL,
            selfApplicable: !!update?.selfApplicable,
            source: update?.source ? String(update.source) : runtimeStrategy.channel,
            version: update?.version ? String(update.version) : null
        };

        if (!enriched.available || !enriched.version) {
            return enriched;
        }

        if (runtimeStrategy.channel === 'nsis') {
            try {
                const newerReleases = await resolveNewerReleases(
                    app.getVersion(),
                    enriched.version,
                    { includePrerelease: shouldIncludePrereleaseReleases(app.getVersion(), enriched.version) }
                );
                if (newerReleases.length > 0) {
                    enriched.releaseName = getReleaseDisplayName(newerReleases[0]);
                    enriched.releaseNotes = formatStackedReleaseNotes(newerReleases);
                    enriched.releaseUrl = newerReleases[0].htmlUrl || enriched.releaseUrl;
                }
            } catch (error) {
                await appendUpdateLog(`enrichUpdateInfo release-refresh-failed error=${String((error && error.stack) || error || '')}`);
            }
        }

        return enriched;
    }

    async function checkForAppUpdate() {
        const initial = {
            attempted: true,
            available: false,
            canSelfUpdate: false,
            checksumSha256: null,
            deferredUntilNextLaunch: false,
            downloadable: false,
            downloadReady: false,
            error: null,
            fallbackReason: null,
            offline: false,
            releaseName: '',
            releaseNotes: '',
            releaseUrl: APP_UPDATE_RELEASE_PAGE_URL,
            selfApplicable: false,
            source: 'unsupported',
            timedOut: false,
            version: null
        };

        try {
            const runtimeStrategy = resolveRuntimeUpdateStrategy(app, isFakeVersionRun);
            if (!runtimeStrategy.supportsUpdater) {
                latestKnownUpdate = {
                    ...initial,
                    fallbackReason: runtimeStrategy.manualFallbackReason,
                    source: runtimeStrategy.channel
                };
                await appendUpdateLog(`checkForAppUpdate unsupported strategy=${JSON.stringify(runtimeStrategy)}`);
                return latestKnownUpdate;
            }

            const update = await nsisUpdaterService.checkForUpdates();
            if (!update.available) {
                latestKnownUpdate = {
                    ...initial,
                    canSelfUpdate: !!update.canSelfUpdate,
                    deferredUntilNextLaunch: !!update.deferredUntilNextLaunch,
                    downloadable: !!update.downloadable,
                    downloadReady: !!update.downloadReady,
                    releaseName: update.releaseName || '',
                    releaseNotes: update.releaseNotes || '',
                    releaseUrl: update.releaseUrl || APP_UPDATE_RELEASE_PAGE_URL,
                    selfApplicable: !!update.selfApplicable,
                    source: update.provider === 'github' ? 'github' : runtimeStrategy.channel,
                    version: update.version || null
                };
                await appendUpdateLog(`checkForAppUpdate no-update strategy=${JSON.stringify(runtimeStrategy)} result=${JSON.stringify(summarizeAppUpdate(latestKnownUpdate))}`);
                return latestKnownUpdate;
            }

            latestKnownUpdate = await enrichUpdateInfo({
                ...initial,
                ...update,
                source: update.provider === 'github' ? 'github' : runtimeStrategy.channel
            }, runtimeStrategy);
            await appendUpdateLog(`checkForAppUpdate available strategy=${JSON.stringify(runtimeStrategy)} result=${JSON.stringify(summarizeAppUpdate(latestKnownUpdate))}`);
            return latestKnownUpdate;
        } catch (error) {
            const offline = isNetworkLikeError(error);
            latestKnownUpdate = {
                ...initial,
                error: String((error && error.message) || error || ''),
                fallbackReason: offline ? 'offline' : 'error',
                offline,
                source: offline ? 'offline' : 'error'
            };
            await appendUpdateLog(`checkForAppUpdate error=${String((error && error.stack) || error || '')}`);
            return latestKnownUpdate;
        }
    }

    async function openAppUpdateDownloadPage() {
        const releaseUrl = latestKnownUpdate?.releaseUrl || APP_UPDATE_RELEASE_PAGE_URL;
        await openExternalUrl(releaseUrl);
        return { ok: true, releaseUrl };
    }

    async function startBackgroundDownload() {
        const update = latestKnownUpdate || await checkForAppUpdate();
        await appendUpdateLog(`startBackgroundDownload update=${JSON.stringify(summarizeAppUpdate(update))}`);
        if (!update?.available) {
            return { ok: false, reason: 'no-update' };
        }
        if (!update.downloadable) {
            return {
                ok: false,
                reason: update.fallbackReason || 'not-downloadable',
                update: summarizeAppUpdate(update)
            };
        }

        const result = await nsisUpdaterService.downloadUpdate({
            releaseName: update.releaseName,
            releaseNotes: update.releaseNotes,
            releaseUrl: update.releaseUrl,
            version: update.version
        });

        if (result?.ok) {
            latestKnownUpdate = {
                ...update,
                actionState: update.deferredUntilNextLaunch ? 'scheduled' : 'ready',
                deferredUntilNextLaunch: false,
                downloadReady: true
            };
            return {
                ...result,
                update: summarizeAppUpdate(latestKnownUpdate)
            };
        }

        latestKnownUpdate = {
            ...update,
            actionState: 'failed'
        };
        return {
            ...result,
            update: summarizeAppUpdate(latestKnownUpdate)
        };
    }

    async function restartAndInstallDownloadedUpdate() {
        const update = latestKnownUpdate || await checkForAppUpdate();
        await appendUpdateLog(`restartAndInstallDownloadedUpdate update=${JSON.stringify(summarizeAppUpdate(update))}`);
        if (!update?.available) {
            return { ok: false, reason: 'no-update' };
        }
        const result = await nsisUpdaterService.installDownloadedUpdateNow({
            fromVersion: app.getVersion(),
            releaseName: update.releaseName,
            releaseNotes: update.releaseNotes,
            releaseUrl: update.releaseUrl,
            version: update.version
        });
        if (!result?.ok) {
            return result || { ok: false, reason: 'install' };
        }
        return result;
    }

    async function scheduleInstallOnNextLaunch() {
        const update = latestKnownUpdate || await checkForAppUpdate();
        await appendUpdateLog(`scheduleInstallOnNextLaunch update=${JSON.stringify(summarizeAppUpdate(update))}`);
        if (!update?.available) {
            return { ok: false, reason: 'no-update' };
        }

        const result = await nsisUpdaterService.scheduleInstallOnNextLaunch({
            fromVersion: app.getVersion(),
            releaseName: update.releaseName,
            releaseNotes: update.releaseNotes,
            releaseUrl: update.releaseUrl,
            version: update.version
        });
        if (!result?.ok) {
            return result || { ok: false, reason: 'schedule' };
        }

        latestKnownUpdate = {
            ...update,
            actionState: 'scheduled',
            deferredUntilNextLaunch: true,
            downloadReady: true
        };
        return {
            ...result,
            update: summarizeAppUpdate(latestKnownUpdate)
        };
    }

    async function runDeferredInstallOnLaunch() {
        return nsisUpdaterService.runDeferredInstallOnLaunch();
    }

    async function prepareDeferredInstallOnLaunch() {
        return nsisUpdaterService.prepareDeferredInstallOnLaunch();
    }

    async function beginDeferredInstallOnLaunch() {
        return nsisUpdaterService.beginDeferredInstallOnLaunch();
    }

    return {
        beginDeferredInstallOnLaunch,
        checkForAppUpdate,
        consumePostUpdateMarker,
        logDebug,
        openAppUpdateDownloadPage,
        prepareDeferredInstallOnLaunch,
        restartAndInstallDownloadedUpdate,
        runDeferredInstallOnLaunch,
        scheduleInstallOnNextLaunch,
        startBackgroundDownload
    };
}

module.exports = {
    createAppUpdateServices
};

const fs = require('fs/promises');
const path = require('path');
const { ensureDir, isNetworkLikeError } = require('./core/shared-io');
const {
    compareAppReleaseVersions,
    formatStackedReleaseNotes,
    getReleaseDisplayName,
    normalizeReleaseNotesForReview,
    shouldIncludePrereleaseReleases
} = require('./app-updates/release-utils');
const { resolveRuntimeUpdateStrategy } = require('./app-updates/runtime-strategy');
const { createNsisUpdaterService, isFakeVersionRun } = require('./nsis-updater');

// Import modular submodules
const { setupFeedResolver, APP_UPDATE_RELEASE_PAGE_URL } = require('./app-updates/feed-resolver');
const { setupPostUpdateMarker } = require('./app-updates/post-update');

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

    // Initialize Resolver Module
    const resolver = setupFeedResolver({
        startupNetworkTimeoutMs,
        appendVerboseUpdateLog
    });

    // Initialize Post-Update Module
    const { consumePostUpdateMarker } = setupPostUpdateMarker({
        app,
        postUpdateMarkerFile,
        compareVersions,
        resolver,
        appendUpdateLog,
        appendVerboseUpdateLog
    });

    const nsisUpdaterService = createNsisUpdaterService({
        app,
        appendUpdateLog,
        broadcastStatus,
        compareVersions: compareAppReleaseVersions,
        ensureDir,
        releasePageUrl: APP_UPDATE_RELEASE_PAGE_URL,
        resolveFeedOverride: resolver.resolvePackagedFeedOverride,
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
                const newerReleases = await resolver.resolveNewerReleases(
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

// @ts-nocheck
const path = require('path');
const { ensureDir } = require('./core/shared-io');
const { compareAppReleaseVersions } = require('./app-updates/release-utils');
const { createNsisUpdaterService } = require('./nsis-updater');

// Import modular submodules
const { setupFeedResolver, APP_UPDATE_RELEASE_PAGE_URL } = require('./app-updates/feed-resolver');
const { setupPostUpdateMarker } = require('./app-updates/post-update');

const {
    appendUpdateLog,
    appendVerboseUpdateLog,
    logDebug,
    summarizeAppUpdate,
    enrichUpdateInfo
} = require('./app-updates/helpers');

const { checkForAppUpdate } = require('./app-updates/check-service');

const {
    startBackgroundDownload,
    restartAndInstallDownloadedUpdate,
    scheduleInstallOnNextLaunch
} = require('./app-updates/download-install');

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

    const context = {
        app,
        broadcastStatus,
        compareVersions,
        openExternalUrl,
        startupNetworkTimeoutMs,
        updateCacheDir,
        postUpdateMarkerFile,
        updateLogFile,
        latestKnownUpdate: null,
        resolver: null,
        nsisUpdaterService: null,
        consumePostUpdateMarker: null,

        // Loggers
        appendUpdateLog: (message) => appendUpdateLog(context, message),
        appendVerboseUpdateLog: (message) => appendVerboseUpdateLog(context, message),
        logDebug: (message) => logDebug(context, message),

        // Helpers
        summarizeAppUpdate: (update) => summarizeAppUpdate(context, update),
        enrichUpdateInfo: (update, runtimeStrategy) => enrichUpdateInfo(context, update, runtimeStrategy),

        // Services
        checkForAppUpdate: () => checkForAppUpdate(context)
    };

    // Initialize Resolver Module
    context.resolver = setupFeedResolver({
        startupNetworkTimeoutMs,
        appendVerboseUpdateLog: context.appendVerboseUpdateLog
    });

    // Initialize Post-Update Module
    const { consumePostUpdateMarker } = setupPostUpdateMarker({
        app,
        postUpdateMarkerFile,
        compareVersions,
        resolver: context.resolver,
        appendUpdateLog: context.appendUpdateLog,
        appendVerboseUpdateLog: context.appendVerboseUpdateLog
    });
    context.consumePostUpdateMarker = consumePostUpdateMarker;

    context.nsisUpdaterService = createNsisUpdaterService({
        app,
        appendUpdateLog: context.appendUpdateLog,
        broadcastStatus,
        compareVersions: compareAppReleaseVersions,
        ensureDir,
        releasePageUrl: APP_UPDATE_RELEASE_PAGE_URL,
        resolveFeedOverride: context.resolver.resolvePackagedFeedOverride,
        updateCacheDir,
        postUpdateMarkerFile
    });

    async function openAppUpdateDownloadPage() {
        const releaseUrl = context.latestKnownUpdate?.releaseUrl || APP_UPDATE_RELEASE_PAGE_URL;
        await openExternalUrl(releaseUrl);
        return { ok: true, releaseUrl };
    }

    return {
        beginDeferredInstallOnLaunch: () => context.nsisUpdaterService.beginDeferredInstallOnLaunch(),
        checkForAppUpdate: () => context.checkForAppUpdate(),
        consumePostUpdateMarker: context.consumePostUpdateMarker,
        logDebug: context.logDebug,
        openAppUpdateDownloadPage,
        prepareDeferredInstallOnLaunch: () => context.nsisUpdaterService.prepareDeferredInstallOnLaunch(),
        restartAndInstallDownloadedUpdate: () => restartAndInstallDownloadedUpdate(context),
        runDeferredInstallOnLaunch: () => context.nsisUpdaterService.runDeferredInstallOnLaunch(),
        scheduleInstallOnNextLaunch: () => scheduleInstallOnNextLaunch(context),
        startBackgroundDownload: () => startBackgroundDownload(context)
    };
}

module.exports = {
    createAppUpdateServices
};

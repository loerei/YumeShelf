// @ts-nocheck
const { resolveRuntimeUpdateStrategy } = require('./runtime-strategy');
const { isFakeVersionRun } = require('../nsis-updater');
const { APP_UPDATE_RELEASE_PAGE_URL } = require('./feed-resolver');
const { isNetworkLikeError } = require('../core/shared-io');

async function checkForAppUpdate(context) {
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
        const runtimeStrategy = resolveRuntimeUpdateStrategy(context.app, isFakeVersionRun);
        if (!runtimeStrategy.supportsUpdater) {
            context.latestKnownUpdate = {
                ...initial,
                fallbackReason: runtimeStrategy.manualFallbackReason,
                source: runtimeStrategy.channel
            };
            await context.appendUpdateLog(`checkForAppUpdate unsupported strategy=${JSON.stringify(runtimeStrategy)}`);
            return context.latestKnownUpdate;
        }

        const update = await context.nsisUpdaterService.checkForUpdates();
        if (!update.available) {
            context.latestKnownUpdate = {
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
            await context.appendUpdateLog(`checkForAppUpdate no-update strategy=${JSON.stringify(runtimeStrategy)} result=${JSON.stringify(context.summarizeAppUpdate(context.latestKnownUpdate))}`);
            return context.latestKnownUpdate;
        }

        context.latestKnownUpdate = await context.enrichUpdateInfo({
            ...initial,
            ...update,
            source: update.provider === 'github' ? 'github' : runtimeStrategy.channel
        }, runtimeStrategy);
        await context.appendUpdateLog(`checkForAppUpdate available strategy=${JSON.stringify(runtimeStrategy)} result=${JSON.stringify(context.summarizeAppUpdate(context.latestKnownUpdate))}`);
        return context.latestKnownUpdate;
    } catch (error) {
        const offline = isNetworkLikeError(error);
        context.latestKnownUpdate = {
            ...initial,
            error: String((error && error.message) || error || ''),
            fallbackReason: offline ? 'offline' : 'error',
            offline,
            source: offline ? 'offline' : 'error'
        };
        await context.appendUpdateLog(`checkForAppUpdate error=${String((error && error.stack) || error || '')}`);
        return context.latestKnownUpdate;
    }
}

module.exports = {
    checkForAppUpdate
};

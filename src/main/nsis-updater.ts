// @ts-nocheck
const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');
const { NsisUpdater } = require('electron-updater');
const { createInstallerHandoff } = require('./nsis-updater/installer-handoff');
const { resolveUpdaterRuntime, classifyErrorReason, delay, isFakeVersionRun, normalizeText, toBoolean } = require('./nsis-updater/runtime');
const { createStateFiles } = require('./nsis-updater/state-files');
const { buildDownloadedState, normalizeDownloadedState, pickReleaseName, pickReleaseNotes, sha512FileBase64 } = require('./nsis-updater/update-info');
const { attachUpdaterEventLogging } = require('./nsis-updater/updater-events');
const { downloadBuffer } = require('./core/shared-io');

const {
    configureDifferentialDownload
} = require('./nsis-updater/cache-inputs');

const { setupUpdateFlow } = require('./nsis-updater/update-flow');

const VERBOSE_UPDATE_LOG = process.env.YUMESHELF_UPDATE_DEBUG === '1';

function createNsisUpdaterService({
    app,
    appendUpdateLog,
    broadcastStatus,
    compareVersions,
    ensureDir,
    releasePageUrl,
    resolveFeedOverride,
    updateCacheDir,
    postUpdateMarkerFile
}) {
    // Shared State Contract
    const state = {
        updater: null,
        latestUpdateInfo: null,
        latestDownloadedEvent: null,
        activeDownloadPromise: null,
        updaterFeedKey: null
    };

    function resolveRuntime() {
        return resolveUpdaterRuntime(app, isFakeVersionRun);
    }

    function createUpdaterLogger() {
        function forward(level, message) {
            if (level === 'debug' && !VERBOSE_UPDATE_LOG) return;
            const text = normalizeText(message, '');
            if (!text) return;
            void appendUpdateLog(`nsis-updater:${level} ${text}`);
        }

        return {
            debug(message) {
                forward('debug', message);
            },
            error(message) {
                forward('error', message);
            },
            info(message) {
                forward('info', message);
            },
            warn(message) {
                forward('warn', message);
            }
        };
    }

    function summarizeUpdateState(updateState = {}) {
        return {
            available: toBoolean(updateState.available),
            canSelfUpdate: toBoolean(updateState.canSelfUpdate),
            deferredUntilNextLaunch: toBoolean(updateState.deferredUntilNextLaunch),
            downloadable: toBoolean(updateState.downloadable),
            downloadReady: toBoolean(updateState.downloadReady),
            releaseName: normalizeText(updateState.releaseName, ''),
            releaseNotes: normalizeText(updateState.releaseNotes, ''),
            releaseUrl: normalizeText(updateState.releaseUrl, releasePageUrl),
            selfApplicable: toBoolean(updateState.selfApplicable),
            version: normalizeText(updateState.version, '')
        };
    }

    function emitStatus(payload) {
        if (typeof broadcastStatus === 'function') {
            broadcastStatus({
                scope: 'app-update',
                timestamp: Date.now(),
                ...payload
            });
        }
    }

    const stateFiles = createStateFiles({
        appendUpdateLog,
        ensureDir,
        normalizeDownloadedState,
        updateCacheDir,
        verifyInstallerHash: sha512FileBase64
    });

    const {
        clearDeferredInstallState,
        clearDownloadedState,
        getValidatedDeferredInstallState,
        getValidatedDownloadedStateForVersion,
        readDeferredInstallState,
        writeDeferredInstallState,
        writeDownloadedState
    } = stateFiles;

    function summarizeReadyUpdateFromState(stateObj, patch = {}) {
        return summarizeUpdateState({
            available: true,
            canSelfUpdate: true,
            deferredUntilNextLaunch: !!patch.deferredUntilNextLaunch,
            downloadable: true,
            downloadReady: true,
            releaseName: stateObj.releaseName,
            releaseNotes: stateObj.releaseNotes,
            releaseUrl: stateObj.releaseUrl || releasePageUrl,
            selfApplicable: true,
            version: stateObj.version,
            ...patch
        });
    }

    const installerHandoff = createInstallerHandoff({
        app,
        appendUpdateLog,
        delay,
        emitStatus,
        ensureDir,
        postUpdateMarkerFile,
        releasePageUrl
    });

    function createUpdater() {
        if (state.updater) return state.updater;

        state.updater = new NsisUpdater();
        state.updater.logger = createUpdaterLogger();
        state.updater.autoDownload = false;
        state.updater.autoInstallOnAppQuit = false;
        state.updater.autoRunAppAfterInstall = true;
        state.updater.allowPrerelease = String(app.getVersion() || '').includes('-');
        state.updater.disableWebInstaller = true;

        const runtime = resolveUpdaterRuntime(app, isFakeVersionRun);
        if (runtime.usesDevConfig) {
            state.updater.forceDevUpdateConfig = true;
        }
        state.updater.__yumeshelfRuntime = runtime;

        if (VERBOSE_UPDATE_LOG) {
            void appendUpdateLog(`nsis-updater created current=${app.getVersion()} allowPrerelease=${state.updater.allowPrerelease}`);
        }
        attachUpdaterEventLogging({
            appendUpdateLog,
            emitStatus,
            latestDownloadedEventRef: {
                get: () => state.latestDownloadedEvent,
                set: (value) => {
                    state.latestDownloadedEvent = value;
                }
            },
            latestUpdateInfoRef: {
                get: () => state.latestUpdateInfo,
                set: (value) => {
                    state.latestUpdateInfo = value;
                }
            },
            releasePageUrl,
            summarizeUpdateState,
            updater: state.updater
        });

        return state.updater;
    }

    async function configureUpdaterFeed(runtime) {
        const nsisUpdater = createUpdater();
        let feedOverride = null;

        if (typeof resolveFeedOverride === 'function') {
            try {
                feedOverride = await resolveFeedOverride({
                    currentVersion: app.getVersion(),
                    runtime
                });
            } catch (error) {
                await appendUpdateLog(`nsis-updater feed-override-error error=${String((error && error.stack) || error || '')}`);
            }
        }

        if (feedOverride?.provider === 'generic' && feedOverride?.url) {
            const desiredFeedKey = `generic:${feedOverride.url}`;
            if (state.updaterFeedKey !== desiredFeedKey) {
                nsisUpdater.setFeedURL({
                    provider: 'generic',
                    url: feedOverride.url,
                    useMultipleRangeRequest: false
                });
                state.updaterFeedKey = desiredFeedKey;
            }

            await configureDifferentialDownload(nsisUpdater, {
                currentVersion: app.getVersion(),
                feedOverride,
                runtime,
                appendUpdateLog,
                VERBOSE_UPDATE_LOG
            });
            if (VERBOSE_UPDATE_LOG) {
                await appendUpdateLog(`nsis-updater feed-config current=${app.getVersion()} runtime=${runtime.channel} provider=generic url=${feedOverride.url} target=${normalizeText(feedOverride.release?.version, '')} tag=${normalizeText(feedOverride.release?.tagName, '')}`);
            }
            return {
                feedOverride,
                updater: nsisUpdater
            };
        }

        if (state.updaterFeedKey == null) {
            state.updaterFeedKey = runtime.usesDevConfig ? 'dev-config' : `publish:${runtime.provider}`;
        }
        await configureDifferentialDownload(nsisUpdater, {
            currentVersion: app.getVersion(),
            feedOverride: null,
            runtime,
            appendUpdateLog,
            VERBOSE_UPDATE_LOG
        });
        if (VERBOSE_UPDATE_LOG) {
            await appendUpdateLog(`nsis-updater feed-config current=${app.getVersion()} runtime=${runtime.channel} provider=${runtime.provider} mode=${runtime.usesDevConfig ? 'dev-config' : 'publish-config'}`);
        }
        return {
            feedOverride: null,
            updater: nsisUpdater
        };
    }

    // Initialize Flow Submodule
    const flow = setupUpdateFlow({
        app,
        compareVersions,
        ensureDir,
        releasePageUrl,
        postUpdateMarkerFile,
        updateCacheDir,
        state,
        stateFiles,
        installerHandoff,
        emitStatus,
        summarizeUpdateState,
        summarizeReadyUpdateFromState,
        createUpdater,
        configureUpdaterFeed,
        resolveRuntime,
        appendUpdateLog,
        VERBOSE_UPDATE_LOG
    });

    async function checkForUpdates() {
        return flow.checkForUpdates();
    }

    async function downloadUpdate(releaseMetadata = {}) {
        return flow.downloadUpdate(releaseMetadata);
    }

    async function installDownloadedUpdateNow(releaseMetadata = {}) {
        return flow.installDownloadedUpdateNow(releaseMetadata);
    }

    async function scheduleInstallOnNextLaunch(releaseMetadata = {}) {
        return flow.scheduleInstallOnNextLaunch(releaseMetadata);
    }

    async function prepareDeferredInstallOnLaunch() {
        return flow.prepareDeferredInstallOnLaunch();
    }

    async function beginDeferredInstallOnLaunch() {
        return flow.beginDeferredInstallOnLaunch();
    }

    async function runDeferredInstallOnLaunch() {
        return flow.beginDeferredInstallOnLaunch();
    }

    return {
        beginDeferredInstallOnLaunch,
        checkForUpdates,
        clearDeferredInstallState,
        createUpdater,
        downloadUpdate,
        installDownloadedUpdateNow,
        prepareDeferredInstallOnLaunch,
        readDeferredInstallState,
        resolveRuntime,
        runDeferredInstallOnLaunch,
        scheduleInstallOnNextLaunch,
        summarizeUpdateState
    };
}

module.exports = {
    createNsisUpdaterService,
    isFakeVersionRun
};

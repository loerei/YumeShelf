import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { NsisUpdater } from 'electron-updater';
import { createInstallerHandoff } from './nsis-updater/installer-handoff';
import { resolveUpdaterRuntime, classifyErrorReason, delay, isFakeVersionRun, normalizeText, toBoolean } from './nsis-updater/runtime';
import { createStateFiles } from './nsis-updater/state-files';
import { buildDownloadedState, normalizeDownloadedState, pickReleaseName, pickReleaseNotes, sha512FileBase64 } from './nsis-updater/update-info';
import { attachUpdaterEventLogging } from './nsis-updater/updater-events';
import { downloadBuffer } from './core/shared-io';
import { configureDifferentialDownload } from './nsis-updater/cache-inputs';
import { setupUpdateFlow } from './nsis-updater/update-flow';

export { isFakeVersionRun };

const VERBOSE_UPDATE_LOG = process.env.YUMESHELF_UPDATE_DEBUG === '1';

export interface NsisUpdaterServiceConfig {
    app: any;
    appendUpdateLog: (message: string) => Promise<any> | any;
    broadcastStatus: (payload: any) => void;
    compareVersions: (a: string, b: string) => number;
    ensureDir: (dirPath: string) => Promise<void>;
    releasePageUrl: string;
    resolveFeedOverride?: (options: any) => Promise<any>;
    updateCacheDir: string;
    postUpdateMarkerFile: string;
}

export function createNsisUpdaterService({
    app,
    appendUpdateLog,
    broadcastStatus,
    compareVersions,
    ensureDir,
    releasePageUrl,
    resolveFeedOverride,
    updateCacheDir,
    postUpdateMarkerFile
}: NsisUpdaterServiceConfig) {
    // Shared State Contract
    const state: any = {
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
        function forward(level: string, message: any) {
            if (level === 'debug' && !VERBOSE_UPDATE_LOG) return;
            const text = normalizeText(message, '');
            if (!text) return;
            void appendUpdateLog(`nsis-updater:${level} ${text}`);
        }

        return {
            debug(message: any) {
                forward('debug', message);
            },
            error(message: any) {
                forward('error', message);
            },
            info(message: any) {
                forward('info', message);
            },
            warn(message: any) {
                forward('warn', message);
            }
        };
    }

    function summarizeUpdateState(updateState: any = {}) {
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

    function emitStatus(payload: any) {
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

    function summarizeReadyUpdateFromState(stateObj: any, patch: any = {}) {
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
                set: (value: any) => {
                    state.latestDownloadedEvent = value;
                }
            },
            latestUpdateInfoRef: {
                get: () => state.latestUpdateInfo,
                set: (value: any) => {
                    state.latestUpdateInfo = value;
                }
            },
            releasePageUrl,
            summarizeUpdateState,
            updater: state.updater
        });

        return state.updater;
    }

    async function configureUpdaterFeed(runtime: any) {
        const nsisUpdater = createUpdater();
        let feedOverride: any = null;

        if (typeof resolveFeedOverride === 'function') {
            try {
                feedOverride = await resolveFeedOverride({
                    currentVersion: app.getVersion(),
                    runtime
                });
            } catch (error) {
                await appendUpdateLog(`nsis-updater feed-override-error error=${String((error as any)?.stack || error || '')}`);
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

    async function downloadUpdate(releaseMetadata: any = {}) {
        return flow.downloadUpdate(releaseMetadata);
    }

    async function installDownloadedUpdateNow(releaseMetadata: any = {}) {
        return flow.installDownloadedUpdateNow(releaseMetadata);
    }

    async function scheduleInstallOnNextLaunch(releaseMetadata: any = {}) {
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

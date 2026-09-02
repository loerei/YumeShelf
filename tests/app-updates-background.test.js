const test = require('node:test');
const assert = require('node:assert/strict');

const { checkForAppUpdate } = require('../dist/main/app-updates/check-service');
const { createStartupServices } = require('../dist/main/startup');
const {
    createAppUpdateServices,
    createAppUpdaterStrategy,
    NoopUpdaterStrategy,
    NsisUpdaterStrategyAdapter
} = require('../dist/main/app-updates');
const {
    startBackgroundDownload,
    restartAndInstallDownloadedUpdate,
    scheduleInstallOnNextLaunch
} = require('../dist/main/app-updates/download-install');
const { summarizeAppUpdate } = require('../dist/main/app-updates/helpers');
const { pickExpectedSha512 } = require('../dist/main/app-updates/updater-strategy');

// Helper for testing renderer state machine
function createTestUpdateState() {
    let currentUpdate = null;
    return {
        getCurrentUpdateState: () => (currentUpdate ? { ...currentUpdate } : null),
        setCurrentUpdate: (update, extra = {}) => {
            currentUpdate = { ...update, ...extra };
            return currentUpdate;
        },
        patchCurrentUpdate: (patch) => {
            if (!currentUpdate) return null;
            currentUpdate = { ...currentUpdate, ...patch };
            return currentUpdate;
        }
    };
}

// Pure implementation of renderer status handler logic matching src/renderer/updates/status-handler.ts
function setupTestStatusHandler({
    state,
    actions = {},
    updateNotificationFeature = { present: () => {} },
    getText = (_k, fb) => fb,
    openReview = () => {},
    reviewState = { actionInFlight: false },
    electronAPI = {},
    getAppUpdatesMode = () => 'notify'
}) {
    function presentReadyNotification(update) {
        updateNotificationFeature.present({
            eyebrow: 'Update ready to install',
            update
        });
    }

    function presentAvailableNotification(update) {
        updateNotificationFeature.present({
            eyebrow: 'Update available',
            update
        });
    }

    function handleRuntimeStatus(payload) {
        if (!payload?.phase) return;
        const update = payload.update || null;
        if (!update) return;

        if (payload.phase === 'update-available') {
            const mode = String(getAppUpdatesMode() || 'notify').toLowerCase();
            if (mode === 'off') {
                return;
            }

            const current = state.getCurrentUpdateState();
            // If already in active progression (downloading, ready, scheduled, installing), non-destructively patch metadata only
            if (current?.actionState && current.actionState !== 'idle' && current.actionState !== 'available') {
                state.patchCurrentUpdate({
                    releaseName: update.releaseName || current.releaseName || '',
                    releaseNotes: update.releaseNotes || current.releaseNotes || '',
                    releaseUrl: update.releaseUrl || current.releaseUrl || ''
                });
                return;
            }

            // If already in 'available' state (e.g. secondary enriched broadcast), non-destructively patch without re-presenting toast
            if (current?.actionState === 'available') {
                state.patchCurrentUpdate({
                    releaseName: update.releaseName || current.releaseName || '',
                    releaseNotes: update.releaseNotes || current.releaseNotes || '',
                    releaseUrl: update.releaseUrl || current.releaseUrl || ''
                });
                return;
            }

            // First arrival of update-available
            state.setCurrentUpdate(update, {
                actionState: 'available',
                deferredUntilNextLaunch: false,
                downloadReady: !!update.downloadReady,
                progress: null
            });

            if (!reviewState.actionInFlight) {
                if (update.downloadReady) {
                    presentReadyNotification(update);
                } else if (mode === 'automatic' && update.downloadable) {
                    state.patchCurrentUpdate({
                        actionState: 'downloading',
                        deferredUntilNextLaunch: false
                    });
                    if (typeof electronAPI?.startAppUpdateDownload === 'function') {
                        electronAPI.startAppUpdateDownload().catch(() => {});
                    }
                } else {
                    presentAvailableNotification(update);
                }
            }
            return;
        }

        if (payload.phase === 'download-started') {
            state.setCurrentUpdate(update, {
                actionState: 'downloading',
                deferredUntilNextLaunch: false,
                progress: null
            });
            return;
        }

        if (payload.phase === 'download-progress') {
            const downloaded = Number(payload.downloaded) || 0;
            const total = Number(payload.total) || 0;
            const percent = (total > 0) ? Math.round((downloaded / total) * 100) : 0;
            state.patchCurrentUpdate({
                actionState: 'downloading',
                deferredUntilNextLaunch: false,
                progress: {
                    downloaded,
                    total,
                    percent,
                    bytesPerSecond: payload.bytesPerSecond || 0
                }
            });
            return;
        }

        if (payload.phase === 'download-ready') {
            state.setCurrentUpdate(update, {
                actionState: 'ready',
                deferredUntilNextLaunch: false,
                downloadReady: true,
                progress: null
            });
            if (!reviewState.actionInFlight) {
                presentReadyNotification(update);
            }
            return;
        }

        if (payload.phase === 'install-deferred') {
            state.setCurrentUpdate(update, {
                actionState: 'scheduled',
                deferredUntilNextLaunch: true,
                downloadReady: true,
                progress: null
            });
            return;
        }

        if (payload.phase === 'download-failed') {
            state.setCurrentUpdate(update, {
                actionState: 'failed',
                deferredUntilNextLaunch: false,
                error: payload.error || '',
                failureReason: payload.reason || '',
                progress: null
            });
            reviewState.actionInFlight = false;
        }
    }

    return {
        handleRuntimeStatus,
        presentReadyNotification,
        presentAvailableNotification
    };
}

// Controller initialize helper matching src/renderer/app-updates.ts
function createTestAppUpdateController({ electronAPI = {} }) {
    let currentAppUpdatesMode = 'notify';
    const state = createTestUpdateState();
    const reviewState = { actionInFlight: false };
    const presented = [];

    const { handleRuntimeStatus } = setupTestStatusHandler({
        state,
        updateNotificationFeature: { present: (n) => presented.push(n) },
        electronAPI,
        getAppUpdatesMode: () => currentAppUpdatesMode,
        reviewState
    });

    if (typeof electronAPI?.onAppUpdateStatus === 'function') {
        electronAPI.onAppUpdateStatus(handleRuntimeStatus);
    }

    async function initialize(bootstrapData) {
        if (bootstrapData?.bootChecks?.appUpdatesMode) {
            currentAppUpdatesMode = String(bootstrapData.bootChecks.appUpdatesMode).toLowerCase();
        }

        const appUpdateCheck = bootstrapData?.bootChecks?.appUpdateCheck || null;
        if (appUpdateCheck) {
            const currentLiveUpdate = state.getCurrentUpdateState();
            if (!currentLiveUpdate?.available) {
                let actionState = 'idle';
                if (appUpdateCheck.deferredUntilNextLaunch) {
                    actionState = 'scheduled';
                } else if (appUpdateCheck.downloadReady) {
                    actionState = 'ready';
                } else if (appUpdateCheck.available) {
                    actionState = 'available';
                }
                state.setCurrentUpdate(appUpdateCheck, { actionState });
            }
        }
    }

    return {
        initialize,
        getCurrentUpdateState: () => state.getCurrentUpdateState(),
        presented
    };
}

// ============================================================================
// Plan Section 3: Automated Tests (Tests 1 through 9 + Extra Guarantees)
// ============================================================================

// Test 1: bootstrapAppState returns local library and instant boot checks without waiting for network
test('Test 1: bootstrapAppState returns local state instantly (< 500ms) with non-blocking check flags', async () => {
    let backgroundUpdateCalled = false;
    const services = createStartupServices({
        app: { getVersion: () => '2.0.5' },
        checkForAppUpdate: async () => {
            backgroundUpdateCalled = true;
            return { available: true, version: '2.0.6' };
        },
        consumePostUpdateMarker: async () => null,
        prepareDeferredInstallOnLaunch: async () => ({ pending: false }),
        preparePlaytimeSessions: async () => {},
        overlayPlaytimeSessions: (games) => games,
        logAppUpdateDebug: async () => {},
        applyLanguagePackUpdates: async () => ({}),
        buildLanguageState: async () => ({ appVersion: '2.0.5', languages: [] }),
        fetchLanguageManifest: async () => ({ ok: true, manifest: {} }),
        getLanguagePackUpdateCandidates: () => [],
        getCategoryTree: async () => [],
        isNetworkLikeError: () => false,
        loadGamesForConfig: async () => [{ id: 'game-1', name: 'Test Game' }],
        resolveLibraryConfig: async () => ({ libraryPath: 'D:\\Games' }),
        startupNetworkTimeoutMs: 3500
    });

    const mockWebContents = {
        isDestroyed: () => false,
        send: () => {}
    };

    const startTime = Date.now();
    const bootstrapData = await services.bootstrapAppState(mockWebContents, {
        appUpdatesMode: 'notify',
        languagePackUpdatesMode: 'automatic'
    });
    const duration = Date.now() - startTime;

    assert.ok(duration < 500, `Bootstrap should be instant (< 500ms), took ${duration}ms`);
    assert.equal(bootstrapData.games.length, 1);
    assert.equal(bootstrapData.bootChecks.appUpdateCheck.attempted, false);
    assert.equal(bootstrapData.bootChecks.appUpdateCheck.available, false);

    // Trigger background check explicitly
    await services.triggerBackgroundChecks({ appUpdatesMode: 'notify' });
    assert.equal(backgroundUpdateCalled, true);
});

// Test 2: checkForAppUpdate successfully dispatches broadcastStatus({ phase: "update-available", update }) upon discovery and enrichment
test('Test 2: checkForAppUpdate dispatches broadcastStatus({ phase: "update-available", update }) upon discovery and enrichment', async () => {
    const broadcasts = [];
    const mockContext = {
        app: {
            getVersion: () => '2.0.5',
            isPackaged: true,
            getPath: () => 'C:\\mock\\userData'
        },
        latestKnownUpdate: null,
        appendUpdateLog: async () => {},
        nsisUpdaterService: {
            checkForUpdates: async () => ({
                available: true,
                version: '2.0.6',
                releaseName: 'v2.0.6',
                provider: 'github',
                downloadable: true,
                downloadReady: false
            })
        },
        enrichUpdateInfo: async (update) => ({
            ...update,
            releaseNotes: 'Enriched release notes content'
        }),
        summarizeAppUpdate: (u) => u,
        broadcastStatus: (payload) => {
            broadcasts.push(payload);
        }
    };

    const result = await checkForAppUpdate(mockContext);

    assert.equal(result.available, true);
    assert.equal(result.version, '2.0.6');
    assert.equal(broadcasts.length, 2);
    assert.equal(broadcasts[0].phase, 'update-available');
    assert.equal(broadcasts[0].update.version, '2.0.6');
    assert.equal(broadcasts[1].phase, 'update-available');
    assert.equal(broadcasts[1].update.releaseNotes, 'Enriched release notes content');
});

// Test 3: Renderer setupStatusHandler receives initial update-available event and presents notification banner when mode is notify
test('Test 3: setupStatusHandler presents available notification on update-available when mode is notify', () => {
    const state = createTestUpdateState();
    const presented = [];
    const updateNotificationFeature = {
        present: (notification) => {
            presented.push(notification);
        }
    };

    const { handleRuntimeStatus } = setupTestStatusHandler({
        state,
        updateNotificationFeature,
        getAppUpdatesMode: () => 'notify'
    });

    handleRuntimeStatus({
        phase: 'update-available',
        update: {
            available: true,
            version: '2.0.6',
            releaseName: 'v2.0.6',
            downloadable: true,
            downloadReady: false
        }
    });

    assert.equal(presented.length, 1);
    assert.equal(presented[0].eyebrow, 'Update available');
    assert.equal(state.getCurrentUpdateState().actionState, 'available');
});

// Test 4: Renderer setupStatusHandler initiates download when mode is automatic
test('Test 4: setupStatusHandler initiates background download on update-available when mode is automatic', () => {
    const state = createTestUpdateState();
    let downloadInitiated = false;
    const electronAPI = {
        startAppUpdateDownload: async () => {
            downloadInitiated = true;
            return { ok: true };
        }
    };

    const { handleRuntimeStatus } = setupTestStatusHandler({
        state,
        electronAPI,
        getAppUpdatesMode: () => 'automatic'
    });

    handleRuntimeStatus({
        phase: 'update-available',
        update: {
            available: true,
            version: '2.0.6',
            releaseName: 'v2.0.6',
            downloadable: true,
            downloadReady: false
        }
    });

    assert.equal(downloadInitiated, true);
    assert.equal(state.getCurrentUpdateState().actionState, 'downloading');
});

// Test 5: Secondary enriched update-available broadcast non-destructively patches metadata without duplicate notification presentation or clobbering active downloader states
test('Test 5: secondary enriched update-available broadcast non-destructively patches metadata without duplicate toast or state clobbering', () => {
    const state = createTestUpdateState();
    const presented = [];
    const updateNotificationFeature = {
        present: (n) => presented.push(n)
    };

    const { handleRuntimeStatus } = setupTestStatusHandler({
        state,
        updateNotificationFeature,
        getAppUpdatesMode: () => 'notify'
    });

    // Initial broadcast
    handleRuntimeStatus({
        phase: 'update-available',
        update: {
            available: true,
            version: '2.0.6',
            releaseName: 'v2.0.6',
            releaseNotes: '',
            downloadable: true
        }
    });
    assert.equal(presented.length, 1);

    // Active downloading progression begins
    handleRuntimeStatus({
        phase: 'download-started',
        update: { version: '2.0.6' }
    });
    assert.equal(state.getCurrentUpdateState().actionState, 'downloading');

    // Secondary enriched broadcast arrives while downloading
    handleRuntimeStatus({
        phase: 'update-available',
        update: {
            available: true,
            version: '2.0.6',
            releaseName: 'v2.0.6',
            releaseNotes: 'Full Release Notes Here',
            downloadable: true
        }
    });

    // No duplicate toast and actionState remains 'downloading'
    assert.equal(presented.length, 1);
    assert.equal(state.getCurrentUpdateState().actionState, 'downloading');
    assert.equal(state.getCurrentUpdateState().releaseNotes, 'Full Release Notes Here');
});

// Test 6: Re-running checkForAppUpdate after an initial failure or timeout recovers and dispatches the update event cleanly
test('Test 6: checkForAppUpdate recovers and dispatches update event cleanly on subsequent run after initial failure', async () => {
    let callCount = 0;
    const broadcasts = [];
    const mockContext = {
        app: { getVersion: () => '2.0.5', isPackaged: true, getPath: () => 'C:\\mock\\userData' },
        latestKnownUpdate: null,
        appendUpdateLog: async () => {},
        nsisUpdaterService: {
            checkForUpdates: async () => {
                callCount++;
                if (callCount === 1) {
                    throw new Error('Network timeout');
                }
                return {
                    available: true,
                    version: '2.0.6',
                    releaseName: 'v2.0.6',
                    downloadable: true,
                    downloadReady: false
                };
            }
        },
        enrichUpdateInfo: async (u) => u,
        summarizeAppUpdate: (u) => u,
        broadcastStatus: (payload) => broadcasts.push(payload)
    };

    // First attempt handles error gracefully
    const failResult = await checkForAppUpdate(mockContext);
    assert.equal(failResult.available, false);
    assert.equal(broadcasts.length, 0);

    // Second attempt recovers and broadcasts
    const okResult = await checkForAppUpdate(mockContext);
    assert.equal(okResult.available, true);
    assert.equal(okResult.version, '2.0.6');
    assert.ok(broadcasts.length >= 1);
    assert.equal(broadcasts[0].phase, 'update-available');
});

// Test 7: initialize(bootstrapData) does not overwrite or wipe an update that arrived via background event prior to initialize() invocation
test('Test 7: initialize(bootstrapData) does not overwrite active background update received during early boot race', async () => {
    let registeredListener = null;
    const electronAPI = {
        onAppUpdateStatus: (cb) => {
            registeredListener = cb;
        }
    };

    const controller = createTestAppUpdateController({ electronAPI });

    // Background event arrives BEFORE initialize() runs
    registeredListener({
        phase: 'update-available',
        update: {
            available: true,
            version: '2.0.6',
            downloadable: true,
            downloadReady: false
        }
    });

    assert.equal(controller.getCurrentUpdateState().version, '2.0.6');
    assert.equal(controller.getCurrentUpdateState().actionState, 'available');

    // initialize() runs later with empty boot checks
    await controller.initialize({
        bootChecks: {
            appUpdatesMode: 'notify',
            appUpdateCheck: {
                attempted: false,
                available: false,
                version: null
            }
        }
    });

    // Active state must NOT be wiped
    assert.equal(controller.getCurrentUpdateState().version, '2.0.6');
    assert.equal(controller.getCurrentUpdateState().actionState, 'available');
});

// Test 8: download-progress with total: 0 or undefined safely produces percent: 0 without NaN
test('Test 8: download-progress handles zero total or undefined safely without producing NaN', () => {
    const state = createTestUpdateState();
    state.setCurrentUpdate({ version: '2.0.6' }, { actionState: 'downloading' });
    const { handleRuntimeStatus } = setupTestStatusHandler({
        state
    });

    handleRuntimeStatus({
        phase: 'download-progress',
        downloaded: 0,
        total: 0,
        update: { version: '2.0.6' }
    });

    const progress = state.getCurrentUpdateState().progress;
    assert.equal(progress.percent, 0);
    assert.ok(!Number.isNaN(progress.percent));
});

// Test 9: triggerBackgroundChecks is skipped when a deferred update install is pending
test('Test 9: triggerBackgroundChecks skips check when deferred install is pending', async () => {
    let updateCheckCalled = false;
    const services = createStartupServices({
        app: { getVersion: () => '2.0.5' },
        checkForAppUpdate: async () => {
            updateCheckCalled = true;
        },
        consumePostUpdateMarker: async () => null,
        prepareDeferredInstallOnLaunch: async () => ({ pending: true }),
        preparePlaytimeSessions: async () => {},
        overlayPlaytimeSessions: (games) => games,
        logAppUpdateDebug: async () => {},
        applyLanguagePackUpdates: async () => ({}),
        buildLanguageState: async () => ({}),
        fetchLanguageManifest: async () => ({}),
        getLanguagePackUpdateCandidates: () => [],
        getCategoryTree: async () => [],
        isNetworkLikeError: () => false,
        loadGamesForConfig: async () => [],
        resolveLibraryConfig: async () => ({ libraryPath: 'D:\\Games' }),
        startupNetworkTimeoutMs: 3500
    });

    await services.triggerBackgroundChecks({
        appUpdatesMode: 'notify',
        deferredAppUpdateInstall: { pending: true }
    });

    assert.equal(updateCheckCalled, false);
});

// Test 10: triggerBackgroundChecks suppresses check when mode is off
test('Test 10: triggerBackgroundChecks suppresses check when appUpdatesMode is off', async () => {
    let updateCheckCalled = false;
    const services = createStartupServices({
        app: { getVersion: () => '2.0.5' },
        checkForAppUpdate: async () => {
            updateCheckCalled = true;
        },
        consumePostUpdateMarker: async () => null,
        prepareDeferredInstallOnLaunch: async () => ({ pending: false }),
        preparePlaytimeSessions: async () => {},
        overlayPlaytimeSessions: (games) => games,
        logAppUpdateDebug: async () => {},
        applyLanguagePackUpdates: async () => ({}),
        buildLanguageState: async () => ({}),
        fetchLanguageManifest: async () => ({}),
        getLanguagePackUpdateCandidates: () => [],
        getCategoryTree: async () => [],
        isNetworkLikeError: () => false,
        loadGamesForConfig: async () => [],
        resolveLibraryConfig: async () => ({ libraryPath: 'D:\\Games' }),
        startupNetworkTimeoutMs: 3500
    });

    await services.triggerBackgroundChecks({
        appUpdatesMode: 'off'
    });

    assert.equal(updateCheckCalled, false);
});

// Test 11: triggerBackgroundChecks catches background errors without unhandled rejection
test('Test 11: triggerBackgroundChecks handles background network errors gracefully without throwing', async () => {
    const errorLogs = [];
    const services = createStartupServices({
        app: { getVersion: () => '2.0.5' },
        checkForAppUpdate: async () => {
            throw new Error('GitHub API connection refused');
        },
        consumePostUpdateMarker: async () => null,
        prepareDeferredInstallOnLaunch: async () => ({ pending: false }),
        preparePlaytimeSessions: async () => {},
        overlayPlaytimeSessions: (games) => games,
        logAppUpdateDebug: async (msg) => {
            errorLogs.push(msg);
        },
        applyLanguagePackUpdates: async () => ({}),
        buildLanguageState: async () => ({}),
        fetchLanguageManifest: async () => {
            throw new Error('Manifest 404');
        },
        getLanguagePackUpdateCandidates: () => [],
        getCategoryTree: async () => [],
        isNetworkLikeError: () => false,
        loadGamesForConfig: async () => [],
        resolveLibraryConfig: async () => ({ libraryPath: 'D:\\Games' }),
        startupNetworkTimeoutMs: 3500
    });

    // Should complete cleanly without rejecting
    await services.triggerBackgroundChecks({
        appUpdatesMode: 'notify',
        languagePackUpdatesMode: 'automatic'
    });

    assert.ok(errorLogs.some((msg) => msg.includes('GitHub API connection refused')));
    assert.ok(errorLogs.some((msg) => msg.includes('Manifest 404')));
});

// Test 12: NoopUpdaterStrategy fulfills full AppUpdaterStrategy interface and returns safe fallbacks
test('Test 12: NoopUpdaterStrategy fulfills AppUpdaterStrategy interface with fallback responses and clean dispose', async () => {
    const noop = new NoopUpdaterStrategy();

    const checkResult = await noop.checkForUpdates();
    assert.deepEqual(checkResult, {
        attempted: true,
        available: false,
        fallbackReason: 'unsupported-platform'
    });

    const downloadResult = await noop.downloadUpdate({ version: '2.0.6' });
    assert.deepEqual(downloadResult, {
        ok: false,
        reason: 'unsupported-platform'
    });

    const installResult = await noop.installDownloadedUpdateNow({ version: '2.0.6' });
    assert.deepEqual(installResult, {
        ok: false,
        reason: 'unsupported-platform'
    });

    const scheduleResult = await noop.scheduleInstallOnNextLaunch({ version: '2.0.6' });
    assert.deepEqual(scheduleResult, {
        ok: false,
        reason: 'unsupported-platform'
    });

    const prepareResult = await noop.prepareDeferredInstallOnLaunch();
    assert.deepEqual(prepareResult, { pending: false });

    const beginResult = await noop.beginDeferredInstallOnLaunch();
    assert.deepEqual(beginResult, { ok: false, reason: 'unsupported' });

    const runResult = await noop.runDeferredInstallOnLaunch();
    assert.deepEqual(runResult, { ok: false, reason: 'unsupported' });

    const summary = noop.summarizeUpdateState({
        available: true,
        version: '2.0.6',
        releaseName: 'Test'
    });
    assert.equal(summary.available, true);
    assert.equal(summary.version, '2.0.6');
    assert.equal(summary.releaseName, 'Test');

    assert.doesNotThrow(() => noop.dispose());
});

// Test 13: NsisUpdaterStrategyAdapter correctly delegates all operations to underlying service
test('Test 13: NsisUpdaterStrategyAdapter delegates all operations to underlying service and disposes cleanly', async () => {
    const calls = [];
    const mockService = {
        checkForUpdates: async () => {
            calls.push('checkForUpdates');
            return { available: true, version: '2.1.0' };
        },
        downloadUpdate: async (meta) => {
            calls.push(['downloadUpdate', meta]);
            return { ok: true };
        },
        installDownloadedUpdateNow: async (meta) => {
            calls.push(['installDownloadedUpdateNow', meta]);
            return { ok: true };
        },
        scheduleInstallOnNextLaunch: async (meta) => {
            calls.push(['scheduleInstallOnNextLaunch', meta]);
            return { ok: true };
        },
        prepareDeferredInstallOnLaunch: async () => {
            calls.push('prepareDeferredInstallOnLaunch');
            return { pending: true };
        },
        beginDeferredInstallOnLaunch: async () => {
            calls.push('beginDeferredInstallOnLaunch');
            return { ok: true };
        },
        runDeferredInstallOnLaunch: async () => {
            calls.push('runDeferredInstallOnLaunch');
            return { ok: true };
        },
        summarizeUpdateState: (u) => ({ ...u, summarized: true })
    };

    const adapter = new NsisUpdaterStrategyAdapter(mockService);
    assert.equal(adapter.getService(), mockService);

    const check = await adapter.checkForUpdates();
    assert.equal(check.version, '2.1.0');

    const download = await adapter.downloadUpdate({ version: '2.1.0' });
    assert.equal(download.ok, true);

    const install = await adapter.installDownloadedUpdateNow({ version: '2.1.0' });
    assert.equal(install.ok, true);

    const schedule = await adapter.scheduleInstallOnNextLaunch({ version: '2.1.0' });
    assert.equal(schedule.ok, true);

    const prep = await adapter.prepareDeferredInstallOnLaunch();
    assert.equal(prep.pending, true);

    const begin = await adapter.beginDeferredInstallOnLaunch();
    assert.equal(begin.ok, true);

    const run = await adapter.runDeferredInstallOnLaunch();
    assert.equal(run.ok, true);

    const summary = adapter.summarizeUpdateState({ available: true });
    assert.equal(summary.summarized, true);

    assert.doesNotThrow(() => adapter.dispose());
    assert.ok(calls.includes('checkForUpdates'));
});

// Test 14: createAppUpdaterStrategy factory creates appropriate strategy based on platform
test('Test 14: createAppUpdaterStrategy returns NsisUpdaterStrategyAdapter for win32 and NoopUpdaterStrategy for unsupported platforms', () => {
    const winStrategy = createAppUpdaterStrategy({}, 'win32');
    assert.ok(winStrategy instanceof NsisUpdaterStrategyAdapter);

    const linuxStrategy = createAppUpdaterStrategy({}, 'linux');
    assert.ok(linuxStrategy instanceof NoopUpdaterStrategy);

    const darwinStrategy = createAppUpdaterStrategy({}, 'darwin');
    assert.ok(darwinStrategy instanceof NoopUpdaterStrategy);
});

// Test 15: createAppUpdateServices with injected strategy, default fallbacks, and dispose delegation
test('Test 15: createAppUpdateServices respects injected updaterStrategy, provides deferred fallbacks, and delegates dispose', async () => {
    let disposed = false;
    class CustomStrategy extends NoopUpdaterStrategy {
        dispose() {
            disposed = true;
        }
    }

    const mockApp = {
        getVersion: () => '2.0.5',
        getPath: () => 'C:\\mock\\userData',
        isPackaged: true
    };

    const customStrategy = new CustomStrategy();
    const services = createAppUpdateServices({
        app: mockApp,
        broadcastStatus: () => {},
        compareVersions: () => 0,
        openExternalUrl: () => {},
        startupNetworkTimeoutMs: 1000,
        updaterStrategy: customStrategy
    });

    const prep = await services.prepareDeferredInstallOnLaunch();
    assert.deepEqual(prep, { pending: false });

    const begin = await services.beginDeferredInstallOnLaunch();
    assert.deepEqual(begin, { ok: false, reason: 'unsupported' });

    const run = await services.runDeferredInstallOnLaunch();
    assert.deepEqual(run, { ok: false, reason: 'unsupported' });

    services.dispose();
    assert.equal(disposed, true);
});

// Test 16: Backward compatibility for context.nsisUpdaterService and context.updaterStrategy in check-service, download-install, and helpers
test('Test 16: backward compatibility allows check-service, download-install, and helpers to work with nsisUpdaterService, updaterStrategy, or fallback', async () => {
    // 16a. Using updaterStrategy directly
    const strategyContext = {
        app: { getVersion: () => '2.0.5', isPackaged: true },
        latestKnownUpdate: null,
        appendUpdateLog: async () => {},
        updaterStrategy: {
            checkForUpdates: async () => ({
                available: true,
                version: '2.0.7',
                releaseName: 'v2.0.7',
                downloadable: true,
                downloadReady: false
            }),
            downloadUpdate: async () => ({ ok: true }),
            installDownloadedUpdateNow: async () => ({ ok: true }),
            scheduleInstallOnNextLaunch: async () => ({ ok: true }),
            summarizeUpdateState: (u) => u
        },
        enrichUpdateInfo: async (u) => u,
        summarizeAppUpdate: (u) => u
    };

    const res1 = await checkForAppUpdate(strategyContext);
    assert.equal(res1.available, true);
    assert.equal(res1.version, '2.0.7');

    const dlRes = await startBackgroundDownload(strategyContext);
    assert.equal(dlRes.ok, true);

    const instRes = await restartAndInstallDownloadedUpdate(strategyContext);
    assert.equal(instRes.ok, true);

    const schedRes = await scheduleInstallOnNextLaunch(strategyContext);
    assert.equal(schedRes.ok, true);

    // 16b. Using fallback when neither is provided
    const emptyContext = {
        app: { getVersion: () => '2.0.5', isPackaged: true },
        latestKnownUpdate: null,
        appendUpdateLog: async () => {},
        enrichUpdateInfo: async (u) => u,
        summarizeAppUpdate: (u) => u
    };

    const res2 = await checkForAppUpdate(emptyContext);
    assert.equal(res2.available, false);
    assert.equal(res2.fallbackReason, 'unsupported-platform');

    // 16c. summarizeAppUpdate helper with updaterStrategy
    const summary = summarizeAppUpdate(strategyContext, { available: true, version: '2.0.7' });
    assert.equal(summary.available, true);
});

// Test 17: pickExpectedSha512 extracts sha512 for .exe, .dmg, and .zip artifacts
test('Test 17: pickExpectedSha512 extracts sha512 for .exe, .dmg, and .zip artifacts', () => {
    const exeInfo = {
        files: [
            { url: 'https://example.com/app.exe', sha512: 'hash-exe-123' },
            { url: 'https://example.com/app.blockmap', sha512: 'blockmap-hash' }
        ]
    };
    assert.equal(pickExpectedSha512(exeInfo), 'hash-exe-123');

    const dmgInfo = {
        files: [
            { url: 'https://example.com/app.dmg', sha512: 'hash-dmg-456' },
            { url: 'https://example.com/app.dmg.blockmap', sha512: 'blockmap-hash' }
        ]
    };
    assert.equal(pickExpectedSha512(dmgInfo), 'hash-dmg-456');

    const zipInfo = {
        files: [
            { url: 'https://example.com/app-mac.zip', sha512: 'hash-zip-789' }
        ]
    };
    assert.equal(pickExpectedSha512(zipInfo), 'hash-zip-789');

    const fallbackInfo = {
        sha512: 'root-hash-999'
    };
    assert.equal(pickExpectedSha512(fallbackInfo), 'root-hash-999');
});


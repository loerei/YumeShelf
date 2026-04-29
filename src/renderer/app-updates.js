import {
    createAppUpdateDownloadFailedNotification,
    createAppUpdateReadyNotification,
    createAppUpdateScheduledNotification,
    createPostUpdateInstalledNotification
} from './update-notification-presets.js';
import {
    isPostUpdateNoticeSuppressed,
    setPostUpdateNoticeSuppressed
} from './post-update-preferences.js';

function normalizeUpdate(update, patch = {}) {
    if (!update || (!update.available && !update.installed)) return null;
    return {
        ...update,
        ...patch
    };
}

export function createAppUpdateController({
    electronAPI,
    getText,
    openUpdatesReviewModal,
    updateNotificationFeature
}) {
    let currentUpdate = null;
    let recentInstalledUpdate = null;
    let reviewActionInFlight = false;
    const listeners = new Set();

    function logDebug(message) {
        if (typeof electronAPI.logAppUpdateDebug === 'function') {
            void electronAPI.logAppUpdateDebug(message);
        }
    }

    function notifyStateChanged() {
        listeners.forEach((listener) => {
            listener({
                currentUpdate,
                recentInstalledUpdate
            });
        });
    }

    function setCurrentUpdate(update, patch = {}) {
        currentUpdate = normalizeUpdate(update, patch);
        notifyStateChanged();
        return currentUpdate;
    }

    function patchCurrentUpdate(patch = {}) {
        if (!currentUpdate) return null;
        currentUpdate = {
            ...currentUpdate,
            ...patch
        };
        notifyStateChanged();
        return currentUpdate;
    }

    function getCurrentUpdateState() {
        return currentUpdate || recentInstalledUpdate;
    }

    function getAppUpdateState(mode = 'auto') {
        if (mode === 'available') return currentUpdate;
        if (mode === 'installed') return recentInstalledUpdate;
        return currentUpdate || recentInstalledUpdate;
    }

    function setRecentInstalledUpdate(update, patch = {}) {
        recentInstalledUpdate = normalizeUpdate(update, patch);
        notifyStateChanged();
        return recentInstalledUpdate;
    }

    function suppressPostUpdateNotice() {
        setPostUpdateNoticeSuppressed(true);
        recentInstalledUpdate = null;
        notifyStateChanged();
    }

    function subscribe(listener) {
        listeners.add(listener);
        return () => {
            listeners.delete(listener);
        };
    }

    async function runRestartAndInstall() {
        if (!currentUpdate?.available) {
            return { ok: false, reason: 'no-update' };
        }

        patchCurrentUpdate({
            actionState: 'installing'
        });
        const installResult = await electronAPI.restartAndInstallAppUpdate();
        if (!installResult || !installResult.ok) {
            patchCurrentUpdate({
                actionState: currentUpdate.deferredUntilNextLaunch ? 'scheduled' : (currentUpdate.downloadReady ? 'ready' : 'idle')
            });
            return installResult || { ok: false, reason: 'install' };
        }
        return installResult;
    }

    async function scheduleInstallOnNextLaunch() {
        if (!currentUpdate?.available || !currentUpdate.downloadReady) {
            return { ok: false, reason: 'no-downloaded-update' };
        }

        const scheduleResult = await electronAPI.scheduleAppUpdateNextLaunch();
        if (!scheduleResult || !scheduleResult.ok) {
            patchCurrentUpdate({
                actionState: currentUpdate.downloadReady ? 'ready' : 'idle'
            });
            return scheduleResult || { ok: false, reason: 'schedule' };
        }

        setCurrentUpdate(scheduleResult.update || currentUpdate, {
            actionState: 'scheduled',
            deferredUntilNextLaunch: true,
            downloadReady: true
        });
        return scheduleResult;
    }

    function presentReadyNotification(update) {
        updateNotificationFeature.present(createAppUpdateReadyNotification({
            getText,
            openUpdatesReviewModal: () => openReview(),
            restartAndInstallAppUpdate: () => runRestartAndInstall(),
            scheduleAppUpdateNextLaunch: () => scheduleInstallOnNextLaunch(),
            update
        }));
    }

    async function performReviewUpdate() {
        if (!currentUpdate?.available) {
            return { ok: false, reason: 'no-update' };
        }

        reviewActionInFlight = true;

        if (!currentUpdate.downloadable) {
            patchCurrentUpdate({
                actionState: 'manual'
            });
            try {
                return await electronAPI.openAppUpdateDownloadPage();
            } finally {
                reviewActionInFlight = false;
            }
        }

        if (!currentUpdate.downloadReady) {
            patchCurrentUpdate({
                actionState: 'downloading',
                deferredUntilNextLaunch: false
            });
            const downloadResult = await electronAPI.startAppUpdateDownload();
            if (!downloadResult || !downloadResult.ok) {
                patchCurrentUpdate({
                    actionState: 'failed'
                });
                reviewActionInFlight = false;
                return downloadResult || { ok: false, reason: 'download' };
            }
            patchCurrentUpdate({
                actionState: 'ready',
                deferredUntilNextLaunch: false,
                downloadReady: true
            });
        }

        const installResult = await runRestartAndInstall();
        if (!installResult || !installResult.ok) {
            reviewActionInFlight = false;
            return installResult || { ok: false, reason: 'install' };
        }

        return installResult;
    }

    async function openReview() {
        await openUpdatesReviewModal();
    }

    function handleRuntimeStatus(payload) {
        if (!payload || !payload.phase) return;
        const update = payload.update || null;
        if (!update) return;

        if (payload.phase === 'download-started') {
            setCurrentUpdate(update, {
                actionState: 'downloading',
                deferredUntilNextLaunch: false,
                progress: null
            });
            return;
        }

        if (payload.phase === 'download-progress') {
            patchCurrentUpdate({
                actionState: 'downloading',
                deferredUntilNextLaunch: false,
                progress: {
                    downloaded: payload.downloaded,
                    total: payload.total,
                    percent: Math.round((payload.downloaded / payload.total) * 100),
                    bytesPerSecond: payload.bytesPerSecond || 0
                }
            });
            return;
        }

        if (payload.phase === 'download-ready') {
            setCurrentUpdate(update, {
                actionState: 'ready',
                deferredUntilNextLaunch: false,
                downloadReady: true,
                progress: null
            });
            if (!reviewActionInFlight) {
                presentReadyNotification(update);
            }
            return;
        }

        if (payload.phase === 'install-deferred') {
            setCurrentUpdate(update, {
                actionState: 'scheduled',
                deferredUntilNextLaunch: true,
                downloadReady: true,
                progress: null
            });
            if (!reviewActionInFlight) {
                updateNotificationFeature.present(createAppUpdateScheduledNotification({
                    getText,
                    openUpdatesReviewModal: () => openReview(),
                    update
                }));
            }
            return;
        }

        if (payload.phase === 'download-failed') {
            setCurrentUpdate(update, {
                actionState: 'failed',
                deferredUntilNextLaunch: false,
                error: payload.error || '',
                failureReason: payload.reason || '',
                progress: null
            });
            if (!reviewActionInFlight) {
                updateNotificationFeature.present(createAppUpdateDownloadFailedNotification({
                    getText,
                    openUpdatesReviewModal: () => openReview(),
                    update
                }));
            }
            reviewActionInFlight = false;
            return;
        }
    }

    function initialize(bootstrapData) {
        electronAPI.onAppUpdateStatus(handleRuntimeStatus);
        let presentedPostUpdate = false;

        const postUpdateNotice = bootstrapData?.postUpdateNotice || null;
        const postUpdateSuppressed = isPostUpdateNoticeSuppressed();
        logDebug(`initialize postUpdateNotice=${JSON.stringify(postUpdateNotice ? {
            fromVersion: postUpdateNotice.fromVersion || '',
            installed: !!postUpdateNotice.installed,
            version: postUpdateNotice.version || ''
        } : null)} suppressed=${postUpdateSuppressed}`);
        if (postUpdateNotice?.version && !postUpdateSuppressed) {
            const installedState = setRecentInstalledUpdate(postUpdateNotice, {
                actionState: 'installed',
                installed: true
            });
            presentedPostUpdate = updateNotificationFeature.present(createPostUpdateInstalledNotification({
                getText,
                openUpdatesReviewModal: (options = {}) => openUpdatesReviewModal(options),
                suppressPostUpdateNotice: () => suppressPostUpdateNotice(),
                update: installedState
            })) || presentedPostUpdate;
            logDebug(`initialize presentedPostUpdate=${presentedPostUpdate} installedVersion=${installedState?.version || ''}`);
        } else {
            setRecentInstalledUpdate(null);
        }

        const bootChecks = bootstrapData?.bootChecks || null;
        const appUpdateCheck = bootChecks?.appUpdateCheck || null;
        if (!appUpdateCheck?.available) {
            setCurrentUpdate(null);
            logDebug(`initialize appUpdateCheck=none presentedPostUpdate=${presentedPostUpdate}`);
            return {
                presentedPostUpdate
            };
        }

        setCurrentUpdate(appUpdateCheck, {
            actionState: appUpdateCheck.deferredUntilNextLaunch
                ? 'scheduled'
                : (appUpdateCheck.downloadReady ? 'ready' : 'idle'),
            deferredUntilNextLaunch: !!appUpdateCheck.deferredUntilNextLaunch,
            progress: null
        });

        if (
            bootChecks?.appUpdatesMode === 'automatic'
            && appUpdateCheck.downloadable
            && !appUpdateCheck.downloadReady
        ) {
            void electronAPI.startAppUpdateDownload();
        }

        logDebug(`initialize appUpdateCheck=${JSON.stringify({
            available: !!appUpdateCheck.available,
            deferredUntilNextLaunch: !!appUpdateCheck.deferredUntilNextLaunch,
            downloadReady: !!appUpdateCheck.downloadReady,
            downloadable: !!appUpdateCheck.downloadable,
            version: appUpdateCheck.version || ''
        })} presentedPostUpdate=${presentedPostUpdate}`);

        return {
            presentedPostUpdate
        };
    }

    return {
        getAppUpdateState,
        getCurrentUpdateState,
        initialize,
        openReview,
        performReviewUpdate,
        scheduleInstallOnNextLaunch,
        suppressPostUpdateNotice,
        subscribe
    };
}

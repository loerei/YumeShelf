import {
    createAppUpdateDownloadFailedNotification,
    createAppUpdateReadyNotification,
    createAppUpdateScheduledNotification,
    createPostUpdateInstalledNotification
} from './update-notification-presets.js';
import { isPostUpdateNoticeSuppressed } from './post-update-preferences.js';
import { createUpdateState } from './updates/update-state.js';
import { createUpdateInstallFlow } from './updates/update-install-flow.js';

export function createAppUpdateController({
    bootController,
    electronAPI,
    getText,
    openUpdatesReviewModal,
    reloadWindow = () => window.location.reload(),
    updateNotificationFeature
}) {
    let reviewActionInFlight = false;
    const state = createUpdateState();
    const installFlow = createUpdateInstallFlow({ bootController });

    function logDebug(message) {
        void message;
    }

    async function runRestartAndInstall() {
        const currentUpdate = state.getCurrentUpdateState();
        if (!currentUpdate?.available) {
            return { ok: false, reason: 'no-update' };
        }

        const fallbackActionState = currentUpdate.deferredUntilNextLaunch ? 'scheduled' : (currentUpdate.downloadReady ? 'ready' : 'idle');
        state.patchCurrentUpdate({
            actionState: 'installing',
            installPhase: 'install-preparing'
        });
        installFlow.beginInstallShellSequence('install-preparing');
        await installFlow.waitForNextPaint();
        const installResult = await electronAPI.restartAndInstallAppUpdate();
        if (!installResult || !installResult.ok) {
            installFlow.clearInstallShellTimers();
            bootController.hide();
            state.patchCurrentUpdate({
                actionState: fallbackActionState,
                installPhase: null
            });
            return installResult || { ok: false, reason: 'install' };
        }
        state.patchCurrentUpdate({
            actionState: 'installing',
            installPhase: 'install-handoff'
        });
        return installResult;
    }

    async function scheduleInstallOnNextLaunch() {
        const currentUpdate = state.getCurrentUpdateState();
        if (!currentUpdate?.available || !currentUpdate.downloadReady) {
            return { ok: false, reason: 'no-downloaded-update' };
        }

        const scheduleResult = await electronAPI.scheduleAppUpdateNextLaunch();
        if (!scheduleResult || !scheduleResult.ok) {
            state.patchCurrentUpdate({
                actionState: currentUpdate.downloadReady ? 'ready' : 'idle'
            });
            return scheduleResult || { ok: false, reason: 'schedule' };
        }

        state.setCurrentUpdate(scheduleResult.update || currentUpdate, {
            actionState: 'scheduled',
            deferredUntilNextLaunch: true,
            downloadReady: true
        });
        return scheduleResult;
    }

    async function beginDeferredInstallFlow(update) {
        state.setCurrentUpdate(update, {
            actionState: 'installing',
            deferredUntilNextLaunch: true,
            downloadReady: true,
            installPhase: 'install-preparing'
        });
        installFlow.beginInstallShellSequence('install-preparing');
        await installFlow.waitForNextPaint();
        const result = await electronAPI.beginDeferredAppUpdateInstall();
        if (result && result.launched) {
            state.patchCurrentUpdate({
                actionState: 'installing',
                installPhase: 'install-handoff'
            });
            return {
                deferredInstallPending: true,
                presentedPostUpdate: false
            };
        }

        installFlow.clearInstallShellTimers();
        bootController.hide();
        state.patchCurrentUpdate({
            actionState: 'failed',
            deferredUntilNextLaunch: false,
            installPhase: null
        });
        setTimeout(() => {
            reloadWindow();
        }, 0);
        return {
            deferredInstallFailed: true,
            presentedPostUpdate: false
        };
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
        const currentUpdate = state.getCurrentUpdateState();
        if (!currentUpdate?.available) {
            return { ok: false, reason: 'no-update' };
        }

        reviewActionInFlight = true;

        if (!currentUpdate.downloadable) {
            state.patchCurrentUpdate({
                actionState: 'manual'
            });
            try {
                return await electronAPI.openAppUpdateDownloadPage();
            } finally {
                reviewActionInFlight = false;
            }
        }

        if (!currentUpdate.downloadReady) {
            state.patchCurrentUpdate({
                actionState: 'downloading',
                deferredUntilNextLaunch: false
            });
            const downloadResult = await electronAPI.startAppUpdateDownload();
            if (!downloadResult || !downloadResult.ok) {
                state.patchCurrentUpdate({
                    actionState: 'failed'
                });
                reviewActionInFlight = false;
                return downloadResult || { ok: false, reason: 'download' };
            }
            state.patchCurrentUpdate({
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
            state.setCurrentUpdate(update, {
                actionState: 'downloading',
                deferredUntilNextLaunch: false,
                progress: null
            });
            return;
        }

        if (payload.phase === 'download-progress') {
            state.patchCurrentUpdate({
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
            state.setCurrentUpdate(update, {
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

        if (payload.phase === 'install-preparing') {
            state.setCurrentUpdate(update, {
                actionState: 'installing',
                installPhase: 'install-preparing',
                progress: null
            });
            installFlow.showInstallShellPhase('install-preparing');
            return;
        }

        if (payload.phase === 'install-handoff') {
            state.patchCurrentUpdate({
                actionState: 'installing',
                installPhase: 'install-handoff',
                progress: null
            });
            installFlow.showInstallShellPhase('install-handoff');
            return;
        }

        if (payload.phase === 'install-deferred') {
            state.setCurrentUpdate(update, {
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
            state.setCurrentUpdate(update, {
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

    async function initialize(bootstrapData) {
        electronAPI.onAppUpdateStatus(handleRuntimeStatus);
        let presentedPostUpdate = false;

        const deferredAppUpdateInstall = bootstrapData?.deferredAppUpdateInstall || null;
        if (deferredAppUpdateInstall?.pending && deferredAppUpdateInstall.update) {
            return await beginDeferredInstallFlow(deferredAppUpdateInstall.update);
        }

        const postUpdateNotice = bootstrapData?.postUpdateNotice || null;
        const postUpdateSuppressed = isPostUpdateNoticeSuppressed();
        logDebug(`initialize postUpdateNotice=${JSON.stringify(postUpdateNotice ? {
            fromVersion: postUpdateNotice.fromVersion || '',
            installed: !!postUpdateNotice.installed,
            version: postUpdateNotice.version || ''
        } : null)} suppressed=${postUpdateSuppressed}`);
        if (postUpdateNotice?.version && !postUpdateSuppressed) {
            const installedState = state.setRecentInstalledUpdate(postUpdateNotice, {
                actionState: 'installed',
                installed: true
            });
            updateNotificationFeature.present(createPostUpdateInstalledNotification({
                getText,
                openUpdatesReviewModal: () => openReview(),
                suppressPostUpdateNotice: state.suppressPostUpdateNotice,
                update: installedState
            }));
            presentedPostUpdate = true;
        }

        const appUpdateCheck = bootstrapData?.bootChecks?.appUpdateCheck || null;
        if (appUpdateCheck) {
            state.setCurrentUpdate(appUpdateCheck, {
                actionState: appUpdateCheck.deferredUntilNextLaunch ? 'scheduled' : (appUpdateCheck.downloadReady ? 'ready' : (appUpdateCheck.available ? 'available' : 'idle'))
            });
        }

        logDebug(`initialize appUpdateCheck=${JSON.stringify({
            available: !!appUpdateCheck?.available,
            deferredUntilNextLaunch: !!appUpdateCheck?.deferredUntilNextLaunch,
            downloadReady: !!appUpdateCheck?.downloadReady,
            downloadable: !!appUpdateCheck?.downloadable,
            version: appUpdateCheck?.version || ''
        })} presentedPostUpdate=${presentedPostUpdate}`);

        return {
            presentedPostUpdate
        };
    }

    return {
        getAppUpdateState: state.getAppUpdateState,
        getCurrentUpdateState: state.getCurrentUpdateState,
        initialize,
        openReview,
        performReviewUpdate,
        scheduleInstallOnNextLaunch,
        suppressPostUpdateNotice: state.suppressPostUpdateNotice,
        subscribe: state.subscribe
    };
}

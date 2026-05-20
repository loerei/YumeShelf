// @ts-nocheck
import {
    createAppUpdateDownloadFailedNotification,
    createAppUpdateReadyNotification,
    createAppUpdateScheduledNotification
} from '../update-notification-presets.js';

export function setupStatusHandler({
    state,
    installFlow,
    actions,
    updateNotificationFeature,
    getText,
    openReview,
    reviewState
}) {
    function presentReadyNotification(update) {
        updateNotificationFeature.present(createAppUpdateReadyNotification({
            getText,
            openUpdatesReviewModal: () => openReview(),
            restartAndInstallAppUpdate: () => actions.runRestartAndInstall(),
            scheduleAppUpdateNextLaunch: () => actions.scheduleInstallOnNextLaunch(),
            update
        }));
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
            if (!reviewState.actionInFlight) {
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
            if (!reviewState.actionInFlight) {
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
            if (!reviewState.actionInFlight) {
                updateNotificationFeature.present(createAppUpdateDownloadFailedNotification({
                    getText,
                    openUpdatesReviewModal: () => openReview(),
                    update
                }));
            }
            reviewState.actionInFlight = false;
            return;
        }
    }

    return {
        handleRuntimeStatus,
        presentReadyNotification
    };
}

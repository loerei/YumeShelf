// @ts-nocheck
import {
    createAppUpdateDownloadFailedNotification,
    createAppUpdateReadyNotification,
    createAppUpdateScheduledNotification,
    createAggregatedUpdateNotification,
    buildAppAvailableGroup
} from '../update-notification-presets';

export function setupStatusHandler({
    state,
    installFlow,
    actions,
    updateNotificationFeature,
    getText,
    openReview,
    reviewState,
    electronAPI,
    getAppUpdatesMode = () => 'notify'
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

    function presentAvailableNotification(update) {
        const group = buildAppAvailableGroup(update, getText);
        if (!group) return;
        updateNotificationFeature.present(createAggregatedUpdateNotification({
            getText,
            groups: [group],
            mode: 'notify',
            openUpdatesReviewModal: () => openReview()
        }));
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
        }
    }

    return {
        handleRuntimeStatus,
        presentReadyNotification,
        presentAvailableNotification
    };
}

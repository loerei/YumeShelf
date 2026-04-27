import {
    createAppUpdateDownloadFailedNotification,
    createAppUpdateReadyNotification
} from './update-notification-presets.js';

function normalizeUpdate(update, patch = {}) {
    if (!update || !update.available) return null;
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
    let reviewActionInFlight = false;
    const listeners = new Set();

    function notifyStateChanged() {
        listeners.forEach((listener) => {
            listener(currentUpdate);
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
        return currentUpdate;
    }

    function subscribe(listener) {
        listeners.add(listener);
        return () => {
            listeners.delete(listener);
        };
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
                actionState: 'downloading'
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
                downloadReady: true
            });
        }

        patchCurrentUpdate({
            actionState: 'installing'
        });
        const installResult = await electronAPI.restartAndInstallAppUpdate();
        if (!installResult || !installResult.ok) {
            patchCurrentUpdate({
                actionState: currentUpdate.downloadReady ? 'ready' : 'idle'
            });
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
                actionState: 'downloading'
            });
            return;
        }

        if (payload.phase === 'download-progress') {
            patchCurrentUpdate({
                actionState: 'downloading',
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
                downloadReady: true
            });
            if (!reviewActionInFlight) {
                updateNotificationFeature.present(createAppUpdateReadyNotification({
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
                error: payload.error || '',
                failureReason: payload.reason || ''
            });
            if (!reviewActionInFlight) {
                updateNotificationFeature.present(createAppUpdateDownloadFailedNotification({
                    getText,
                    openUpdatesReviewModal: () => openReview(),
                    update
                }));
            }
            reviewActionInFlight = false;
        }
    }

    function initialize(bootstrapData) {
        electronAPI.onAppUpdateStatus(handleRuntimeStatus);

        const bootChecks = bootstrapData?.bootChecks || null;
        const appUpdateCheck = bootChecks?.appUpdateCheck || null;
        if (!appUpdateCheck?.available) {
            setCurrentUpdate(null);
            return;
        }

        setCurrentUpdate(appUpdateCheck, {
            actionState: appUpdateCheck.downloadReady ? 'ready' : 'idle'
        });

        if (
            bootChecks?.appUpdatesMode === 'automatic'
            && appUpdateCheck.downloadable
            && !appUpdateCheck.downloadReady
        ) {
            void electronAPI.startAppUpdateDownload();
        }
    }

    return {
        getCurrentUpdateState,
        initialize,
        openReview,
        performReviewUpdate,
        subscribe
    };
}

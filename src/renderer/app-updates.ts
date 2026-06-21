// @ts-nocheck
import { createPostUpdateInstalledNotification } from './update-notification-presets';
import { isPostUpdateNoticeSuppressed } from './post-update-preferences';
import { createUpdateState } from './updates/update-state';
import { createUpdateInstallFlow } from './updates/update-install-flow';
import { setupInstallActions } from './updates/install-actions';
import { setupStatusHandler } from './updates/status-handler';

export function createAppUpdateController({
    bootController,
    electronAPI,
    getText,
    openUpdatesReviewModal,
    reloadWindow = () => globalThis.location.reload(),
    updateNotificationFeature
}) {
    const reviewState = { actionInFlight: false };
    const state = createUpdateState();
    const installFlow = createUpdateInstallFlow({ bootController });

    function logDebug(message) {
        void message;
    }

    // Initialize execution actions
    const actions = setupInstallActions({
        state,
        installFlow,
        electronAPI,
        bootController,
        reloadWindow
    });

    // Initialize status handler helper
    const { handleRuntimeStatus } = setupStatusHandler({
        state,
        installFlow,
        actions,
        updateNotificationFeature,
        getText,
        openReview,
        reviewState
    });

    async function openReview() {
        await openUpdatesReviewModal();
    }

    async function performReviewUpdate() {
        const currentUpdate = state.getCurrentUpdateState();
        if (!currentUpdate?.available) {
            return { ok: false, reason: 'no-update' };
        }

        reviewState.actionInFlight = true;

        if (!currentUpdate.downloadable) {
            state.patchCurrentUpdate({
                actionState: 'manual'
            });
            try {
                return await electronAPI.invoke('open-app-update-download-page');
            } finally {
                reviewState.actionInFlight = false;
            }
        }

        if (!currentUpdate.downloadReady) {
            state.patchCurrentUpdate({
                actionState: 'downloading',
                deferredUntilNextLaunch: false
            });
            const downloadResult = await electronAPI.invoke('start-app-update-download');
            if (!downloadResult?.ok) {
                state.patchCurrentUpdate({
                    actionState: 'failed'
                });
                reviewState.actionInFlight = false;
                return downloadResult || { ok: false, reason: 'download' };
            }
            state.patchCurrentUpdate({
                actionState: 'ready',
                deferredUntilNextLaunch: false,
                downloadReady: true
            });
        }

        const installResult = await actions.runRestartAndInstall();
        if (!installResult?.ok) {
            reviewState.actionInFlight = false;
            return installResult || { ok: false, reason: 'install' };
        }

        return installResult;
    }

    async function initialize(bootstrapData) {
        electronAPI.on('app-update-status', handleRuntimeStatus);
        let presentedPostUpdate = false;

        const deferredAppUpdateInstall = bootstrapData?.deferredAppUpdateInstall || null;
        if (deferredAppUpdateInstall?.pending && deferredAppUpdateInstall.update) {
            return await actions.beginDeferredInstallFlow(deferredAppUpdateInstall.update);
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
        scheduleInstallOnNextLaunch: actions.scheduleInstallOnNextLaunch,
        suppressPostUpdateNotice: state.suppressPostUpdateNotice,
        subscribe: state.subscribe
    };
}

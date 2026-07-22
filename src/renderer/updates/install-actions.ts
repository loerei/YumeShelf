// @ts-nocheck
export function setupInstallActions({
    state,
    installFlow,
    electronAPI,
    bootController,
    reloadWindow
}) {
    async function runRestartAndInstall() {
        const currentUpdate = state.getCurrentUpdateState();
        if (!currentUpdate?.available) {
            return { ok: false, reason: 'no-update' };
        }

        let fallbackActionState = 'idle';
        if (currentUpdate.deferredUntilNextLaunch) {
            fallbackActionState = 'scheduled';
        } else if (currentUpdate.downloadReady) {
            fallbackActionState = 'ready';
        }
        state.patchCurrentUpdate({
            actionState: 'installing',
            installPhase: 'install-preparing'
        });
        installFlow.beginInstallShellSequence('install-preparing');
        await installFlow.waitForNextPaint();
        const installResult = await electronAPI.restartAndInstallAppUpdate();
        if (!installResult?.ok) {
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
        if (!scheduleResult?.ok) {
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
        if (result?.launched) {
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

    return {
        runRestartAndInstall,
        scheduleInstallOnNextLaunch,
        beginDeferredInstallFlow
    };
}

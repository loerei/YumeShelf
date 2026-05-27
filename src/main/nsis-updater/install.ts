// @ts-nocheck
const fs = require('fs/promises');

export async function installDownloadedUpdateNow(context, releaseMetadata = {}) {
    const {
        postUpdateMarkerFile,
        stateFiles,
        installerHandoff,
        summarizeReadyUpdateFromState
    } = context;

    const {
        getValidatedDownloadedStateForVersion,
        clearDeferredInstallState,
        clearDownloadedState
    } = stateFiles;

    const {
        buildReleaseMetadata,
        launchInstallerAndQuit,
        prepareInstallPhase,
        writePostUpdateMarker
    } = installerHandoff;

    const updateState = await context.checkForUpdates();
    if (!updateState.available || !updateState.updateInfo) {
        return { ok: false, reason: 'no-update' };
    }

    const downloadedState = await getValidatedDownloadedStateForVersion(updateState.updateInfo.version);
    if (!downloadedState) {
        return { ok: false, reason: 'no-downloaded-update' };
    }

    const readyUpdate = summarizeReadyUpdateFromState(downloadedState);
    await clearDeferredInstallState();
    await writePostUpdateMarker(buildReleaseMetadata(updateState.updateInfo, {
        ...releaseMetadata,
        releaseName: releaseMetadata.releaseName || downloadedState.releaseName,
        releaseNotes: releaseMetadata.releaseNotes || downloadedState.releaseNotes,
        releaseUrl: releaseMetadata.releaseUrl || downloadedState.releaseUrl
    }));
    await prepareInstallPhase({
        logMessage: `nsis-updater preparing installer-launch version=${downloadedState.version} installer=${downloadedState.installerPath}`,
        phase: 'install-preparing',
        update: readyUpdate
    });

    try {
        await launchInstallerAndQuit({
            installerPath: downloadedState.installerPath,
            logPrefix: 'nsis-updater immediate-install',
            onAfterLaunch: () => clearDownloadedState(),
            readyUpdate
        });
        return { ok: true };
    } catch (error) {
        try {
            await fs.unlink(postUpdateMarkerFile);
        } catch {}
        return {
            error: String((error && error.message) || error || ''),
            ok: false,
            reason: 'launch-failed'
        };
    }
}

export async function scheduleInstallOnNextLaunch(context, releaseMetadata = {}) {
    const {
        releasePageUrl,
        stateFiles,
        emitStatus,
        summarizeUpdateState,
        VERBOSE_UPDATE_LOG,
        appendUpdateLog
    } = context;

    const {
        getValidatedDownloadedStateForVersion,
        writeDeferredInstallState
    } = stateFiles;

    const updateState = await context.checkForUpdates();
    if (!updateState.available || !updateState.updateInfo) {
        return { ok: false, reason: 'no-update' };
    }

    const downloadedState = await getValidatedDownloadedStateForVersion(updateState.updateInfo.version);
    if (!downloadedState) {
        return { ok: false, reason: 'no-downloaded-update' };
    }

    const deferredState = {
        ...downloadedState,
        releaseName: releaseMetadata.releaseName || downloadedState.releaseName,
        releaseNotes: releaseMetadata.releaseNotes || downloadedState.releaseNotes,
        releaseUrl: releaseMetadata.releaseUrl || downloadedState.releaseUrl
    };
    await writeDeferredInstallState(deferredState);
    if (VERBOSE_UPDATE_LOG) {
        await appendUpdateLog(`nsis-updater deferred-install version=${deferredState.version} installer=${deferredState.installerPath}`);
    }

    const scheduledUpdate = summarizeUpdateState({
        available: true,
        canSelfUpdate: true,
        deferredUntilNextLaunch: true,
        downloadable: true,
        downloadReady: true,
        releaseName: deferredState.releaseName,
        releaseNotes: deferredState.releaseNotes,
        releaseUrl: deferredState.releaseUrl || releasePageUrl,
        selfApplicable: true,
        version: deferredState.version
    });
    emitStatus({
        phase: 'install-deferred',
        update: scheduledUpdate
    });

    return {
        ok: true,
        update: scheduledUpdate
    };
}

export async function prepareDeferredInstallOnLaunch(context) {
    const {
        app,
        compareVersions,
        stateFiles,
        resolveRuntime,
        appendUpdateLog,
        summarizeReadyUpdateFromState
    } = context;

    const {
        getValidatedDeferredInstallState,
        clearDeferredInstallState
    } = stateFiles;

    const runtime = resolveRuntime();
    if (!runtime.supported) {
        return { pending: false, reason: 'unsupported-runtime' };
    }

    const deferredState = await getValidatedDeferredInstallState();
    if (!deferredState) {
        return { pending: false, reason: 'no-deferred-update' };
    }

    if (compareVersions(app.getVersion(), deferredState.version) >= 0) {
        await clearDeferredInstallState();
        await appendUpdateLog(`deferred-install already-satisfied current=${app.getVersion()} target=${deferredState.version}`);
        return { pending: false, reason: 'already-installed' };
    }

    return {
        pending: true,
        update: summarizeReadyUpdateFromState(deferredState, {
            deferredUntilNextLaunch: true
        })
    };
}

export async function beginDeferredInstallOnLaunch(context) {
    const {
        app,
        releasePageUrl,
        postUpdateMarkerFile,
        stateFiles,
        installerHandoff,
        summarizeReadyUpdateFromState,
        appendUpdateLog
    } = context;

    const {
        getValidatedDeferredInstallState,
        clearDeferredInstallState
    } = stateFiles;

    const {
        writePostUpdateMarker,
        prepareInstallPhase,
        launchInstallerAndQuit
    } = installerHandoff;

    const prepared = await context.prepareDeferredInstallOnLaunch();
    if (!prepared.pending || !prepared.update) {
        return {
            launched: false,
            pending: false,
            reason: prepared.reason || 'no-deferred-update'
        };
    }

    const deferredState = await getValidatedDeferredInstallState();
    if (!deferredState) {
        return {
            launched: false,
            pending: false,
            reason: 'no-deferred-update'
        };
    }

    await writePostUpdateMarker({
        fromVersion: app.getVersion(),
        installedAt: new Date().toISOString(),
        releaseName: deferredState.releaseName,
        releaseNotes: deferredState.releaseNotes,
        releaseUrl: deferredState.releaseUrl || releasePageUrl,
        toVersion: deferredState.version
    });
    await prepareInstallPhase({
        logMessage: `deferred-install preparing version=${deferredState.version} installer=${deferredState.installerPath}`,
        phase: 'install-preparing',
        update: summarizeReadyUpdateFromState(deferredState, {
            deferredUntilNextLaunch: true
        })
    });

    try {
        await clearDeferredInstallState();
        const launchResult = await launchInstallerAndQuit({
            installerPath: deferredState.installerPath,
            logPrefix: 'deferred-install',
            readyUpdate: summarizeReadyUpdateFromState(deferredState, {
                deferredUntilNextLaunch: true
            }),
            statusPatch: {
                deferredUntilNextLaunch: true
            }
        });
        return {
            launched: launchResult.launched,
            pending: false,
            pid: launchResult.pid || null
        };
    } catch (error) {
        try {
            await fs.unlink(postUpdateMarkerFile);
        } catch {}
        await clearDeferredInstallState();
        await appendUpdateLog(`deferred-install launch-failed error=${String((error && error.stack) || error || '')}`);
        return {
            error: String((error && error.message) || error || ''),
            launched: false,
            pending: false,
            reason: 'launch-failed'
        };
    }
}

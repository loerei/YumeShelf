const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');
const { downloadBuffer } = require('../core/shared-io');
const { ensureCurrentInstallerCacheState } = require('./cache-inputs');
const { buildDownloadedState, pickReleaseName, pickReleaseNotes, sha512FileBase64 } = require('./update-info');
const { classifyErrorReason } = require('./runtime');

function setupUpdateFlow({
    app,
    compareVersions,
    ensureDir,
    releasePageUrl,
    postUpdateMarkerFile,
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
}) {
    const {
        clearDeferredInstallState,
        clearDownloadedState,
        getDeferredInstallState, // Wait, in nsis-updater it was getValidatedDeferredInstallState
        getValidatedDeferredInstallState,
        getValidatedDownloadedStateForVersion,
        readDeferredInstallState,
        writeDeferredInstallState,
        writeDownloadedState
    } = stateFiles;

    const {
        buildReleaseMetadata,
        launchInstallerAndQuit,
        prepareInstallPhase,
        writePostUpdateMarker
    } = installerHandoff;

    async function checkForUpdates() {
        const runtime = resolveRuntime();
        if (!runtime.supported) {
            return {
                available: false,
                canSelfUpdate: false,
                channel: runtime.channel,
                deferredUntilNextLaunch: false,
                downloadable: false,
                downloadReady: false,
                provider: runtime.provider,
                releaseName: '',
                releaseNotes: '',
                releaseUrl: releasePageUrl,
                selfApplicable: false,
                version: null
            };
        }

        const { updater: nsisUpdater, feedOverride } = await configureUpdaterFeed(runtime);
        const result = await nsisUpdater.checkForUpdates();
        const updateInfo = result?.updateInfo || null;
        if (VERBOSE_UPDATE_LOG) {
            await appendUpdateLog(`nsis-updater check-result current=${app.getVersion()} candidate=${updateInfo?.version || ''} releaseName=${updateInfo?.releaseName || ''} releaseDate=${updateInfo?.releaseDate || ''} feed=${feedOverride?.url || runtime.provider}`);
        }
        if (!updateInfo?.version || compareVersions(updateInfo.version, app.getVersion()) <= 0) {
            state.latestUpdateInfo = null;
            state.latestDownloadedEvent = null;
            await clearDeferredInstallState();
            if (VERBOSE_UPDATE_LOG) {
                await appendUpdateLog(`nsis-updater no-newer-update current=${app.getVersion()} candidate=${updateInfo?.version || ''}`);
            }
            return {
                available: false,
                canSelfUpdate: true,
                channel: runtime.channel,
                deferredUntilNextLaunch: false,
                downloadable: true,
                downloadReady: false,
                provider: runtime.provider,
                releaseName: '',
                releaseNotes: '',
                releaseUrl: releasePageUrl,
                selfApplicable: true,
                version: null
            };
        }

        state.latestUpdateInfo = updateInfo;
        const downloadedState = await getValidatedDownloadedStateForVersion(updateInfo.version);
        const deferredState = await readDeferredInstallState();
        if (deferredState && deferredState.version !== updateInfo.version) {
            await clearDeferredInstallState();
        }

        return {
            available: true,
            canSelfUpdate: true,
            channel: runtime.channel,
            deferredUntilNextLaunch: !!deferredState && deferredState.version === updateInfo.version,
            downloadable: true,
            downloadReady: !!downloadedState,
            downloadedState,
            provider: runtime.provider,
            releaseName: pickReleaseName(updateInfo),
            releaseNotes: pickReleaseNotes(updateInfo),
            releaseUrl: releasePageUrl,
            selfApplicable: true,
            updateInfo,
            version: updateInfo.version
        };
    }

    async function downloadUpdate(releaseMetadata = {}) {
        if (state.activeDownloadPromise) return state.activeDownloadPromise;

        const updateState = await checkForUpdates();
        if (!updateState.available || !updateState.updateInfo) {
            return { ok: false, reason: 'no-update' };
        }

        if (updateState.downloadReady && updateState.downloadedState) {
            const readyUpdate = summarizeUpdateState({
                ...updateState,
                releaseName: releaseMetadata.releaseName || updateState.releaseName,
                releaseNotes: releaseMetadata.releaseNotes || updateState.releaseNotes,
                releaseUrl: releaseMetadata.releaseUrl || updateState.releaseUrl
            });
            emitStatus({
                phase: 'download-ready',
                update: readyUpdate
            });
            return {
                ok: true,
                alreadyReady: true,
                installerPath: updateState.downloadedState.installerPath,
                update: readyUpdate
            };
        }

        emitStatus({
            phase: 'download-started',
            update: summarizeUpdateState({
                ...updateState,
                releaseName: releaseMetadata.releaseName || updateState.releaseName,
                releaseNotes: releaseMetadata.releaseNotes || updateState.releaseNotes,
                releaseUrl: releaseMetadata.releaseUrl || updateState.releaseUrl
            })
        });

        state.activeDownloadPromise = (async () => {
            try {
                const activeUpdater = createUpdater();
                let cachedInstallerPath = '';
                let hasCachedInstaller = false;
                try {
                    const currentCacheState = await ensureCurrentInstallerCacheState(activeUpdater, app.getVersion(), {
                        fs,
                        fsSync,
                        path,
                        ensureDir,
                        sha512FileBase64,
                        downloadBuffer,
                        appVersion: app.getVersion(),
                        VERBOSE_UPDATE_LOG,
                        appendUpdateLog
                    });
                    cachedInstallerPath = currentCacheState?.cachedInstallerPath || '';
                    hasCachedInstaller = cachedInstallerPath ? fsSync.existsSync(cachedInstallerPath) : false;
                } catch (error) {
                    await appendUpdateLog(`nsis-updater cache-state-error error=${String((error && error.stack) || error || '')}`);
                }
                if (VERBOSE_UPDATE_LOG) {
                    await appendUpdateLog(
                        `nsis-updater download-begin current=${app.getVersion()}`
                        + ` target=${updateState.updateInfo?.version || ''}`
                        + ` previousBlockmapBaseUrlOverride=${activeUpdater.previousBlockmapBaseUrlOverride || 'default'}`
                        + ` cachedInstaller=${cachedInstallerPath || 'unknown'}`
                        + ` cachedInstallerExists=${hasCachedInstaller}`
                    );
                }
                const paths = await activeUpdater.downloadUpdate();
                if (VERBOSE_UPDATE_LOG) {
                    await appendUpdateLog(`nsis-updater download-paths paths=${JSON.stringify(Array.isArray(paths) ? paths : [])}`);
                }
                const installerPath = state.latestDownloadedEvent?.downloadedFile
                    || (Array.isArray(paths) ? paths.find(candidate => String(candidate || '').toLowerCase().endsWith('.exe')) : '')
                    || (Array.isArray(paths) ? paths[0] : '')
                    || '';
                if (!installerPath) {
                    throw new Error('No downloaded NSIS installer path was returned by electron-updater.');
                }

                const downloadedState = buildDownloadedState(
                    updateState.updateInfo,
                    installerPath,
                    releaseMetadata.releaseUrl || updateState.releaseUrl
                );
                if (releaseMetadata.releaseName) {
                    downloadedState.releaseName = releaseMetadata.releaseName;
                }
                if (releaseMetadata.releaseNotes) {
                    downloadedState.releaseNotes = releaseMetadata.releaseNotes;
                }

                await writeDownloadedState(downloadedState);

                const readyUpdate = summarizeUpdateState({
                    available: true,
                    canSelfUpdate: true,
                    deferredUntilNextLaunch: false,
                    downloadable: true,
                    downloadReady: true,
                    releaseName: downloadedState.releaseName,
                    releaseNotes: downloadedState.releaseNotes,
                    releaseUrl: downloadedState.releaseUrl || releasePageUrl,
                    selfApplicable: true,
                    version: downloadedState.version
                });
                emitStatus({
                    phase: 'download-ready',
                    update: readyUpdate
                });
                if (VERBOSE_UPDATE_LOG) {
                    await appendUpdateLog(`nsis-updater ready version=${downloadedState.version} installer=${downloadedState.installerPath}`);
                }
                return {
                    ok: true,
                    installerPath: downloadedState.installerPath,
                    update: readyUpdate
                };
            } catch (error) {
                const reason = classifyErrorReason(error);
                await appendUpdateLog(`nsis-updater download-failed reason=${reason} error=${String((error && error.stack) || error || '')}`);
                emitStatus({
                    error: String((error && error.message) || error || ''),
                    phase: 'download-failed',
                    reason,
                    update: summarizeUpdateState({
                        available: true,
                        canSelfUpdate: true,
                        deferredUntilNextLaunch: false,
                        downloadable: true,
                        downloadReady: false,
                        releaseName: releaseMetadata.releaseName || pickReleaseName(updateState.updateInfo),
                        releaseNotes: releaseMetadata.releaseNotes || pickReleaseNotes(updateState.updateInfo),
                        releaseUrl: releaseMetadata.releaseUrl || updateState.releaseUrl,
                        selfApplicable: true,
                        version: updateState.updateInfo?.version || ''
                    })
                });
                return {
                    ok: false,
                    error: String((error && error.message) || error || ''),
                    reason
                };
            } finally {
                state.activeDownloadPromise = null;
            }
        })();

        return state.activeDownloadPromise;
    }

    async function installDownloadedUpdateNow(releaseMetadata = {}) {
        const updateState = await checkForUpdates();
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

    async function scheduleInstallOnNextLaunch(releaseMetadata = {}) {
        const updateState = await checkForUpdates();
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

    async function prepareDeferredInstallOnLaunch() {
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

    async function beginDeferredInstallOnLaunch() {
        const prepared = await prepareDeferredInstallOnLaunch();
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

    return {
        checkForUpdates,
        downloadUpdate,
        installDownloadedUpdateNow,
        scheduleInstallOnNextLaunch,
        prepareDeferredInstallOnLaunch,
        beginDeferredInstallOnLaunch
    };
}

module.exports = {
    setupUpdateFlow
};

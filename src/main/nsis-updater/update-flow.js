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
    updateCacheDir,
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

        const readyCandidate = summarizeUpdateState({
            ...updateState,
            releaseName: releaseMetadata.releaseName || updateState.releaseName,
            releaseNotes: releaseMetadata.releaseNotes || updateState.releaseNotes,
            releaseUrl: releaseMetadata.releaseUrl || updateState.releaseUrl
        });

        emitStatus({
            phase: 'download-started',
            update: readyCandidate
        });

        state.activeDownloadPromise = (async () => {
            try {
                const version = updateState.updateInfo.version;
                const files = Array.isArray(updateState.updateInfo.files) ? updateState.updateInfo.files : [];
                const fileEntry = files.find((entry) => {
                    const candidate = String(entry?.url || entry?.name || entry?.path || '').toLowerCase();
                    return candidate.endsWith('.exe');
                }) || files[0];

                const fileName = fileEntry?.url || fileEntry?.name || fileEntry?.path || `YumeShelf-Setup-${version}.exe`;
                const expectedSha512 = fileEntry?.sha512 || updateState.updateInfo.sha512 || null;

                const runtime = resolveRuntime();
                const { feedOverride } = await configureUpdaterFeed(runtime);

                let downloadUrl = fileName;
                if (!/^https?:\/\//i.test(downloadUrl)) {
                    const base = feedOverride?.url || `https://github.com/loerei/YumeShelf/releases/download/v${version}`;
                    const encodedFileName = encodeURIComponent(fileName).replace(/%2B/g, '+');
                    downloadUrl = `${base.replace(/\/$/, '')}/${encodedFileName}`;
                }

                const installerPath = path.join(updateCacheDir, fileName);
                await ensureDir(path.dirname(installerPath));

                if (VERBOSE_UPDATE_LOG) {
                    await appendUpdateLog(`nsis-updater parallel-download started url=${downloadUrl} target=${installerPath} sha512=${expectedSha512 || 'none'}`);
                }

                // 1. Fetch download size and check range support
                const headRes = await fetch(downloadUrl, { method: 'HEAD', redirect: 'follow' });
                if (!headRes.ok) {
                    throw new Error(`Failed to query download headers: ${headRes.status} ${headRes.statusText}`);
                }

                const acceptRanges = headRes.headers.get('accept-ranges');
                const contentLength = parseInt(headRes.headers.get('content-length'), 10);

                if (VERBOSE_UPDATE_LOG) {
                    await appendUpdateLog(`nsis-updater parallel-download info accept-ranges=${acceptRanges} content-length=${contentLength}`);
                }

                let downloadedTotal = 0;
                let lastBytes = 0;
                let lastTime = Date.now();

                // Helper to emit progress securely and throttle IPC messages
                function reportProgress(bytesRead) {
                    downloadedTotal += bytesRead;
                    const now = Date.now();
                    const elapsed = now - lastTime;
                    if (elapsed >= 300) {
                        const speed = Math.round(((downloadedTotal - lastBytes) / elapsed) * 1000);
                        emitStatus({
                            phase: 'download-progress',
                            downloaded: downloadedTotal,
                            total: contentLength || downloadedTotal,
                            bytesPerSecond: speed,
                            update: readyCandidate
                        });
                        lastBytes = downloadedTotal;
                        lastTime = now;
                    }
                }

                // Fallback to single-stream sequential if accepts-ranges is not supported or content length is missing
                if (acceptRanges !== 'bytes' || isNaN(contentLength) || contentLength <= 0) {
                    if (VERBOSE_UPDATE_LOG) {
                        await appendUpdateLog(`nsis-updater parallel-download range-requests unsupported, falling back to single stream`);
                    }
                    const res = await fetch(downloadUrl, { redirect: 'follow' });
                    if (!res.ok) {
                        throw new Error(`Failed to download installer stream: ${res.status} ${res.statusText}`);
                    }
                    if (!res.body) {
                        throw new Error('Response returned empty body');
                    }

                    const fileStream = fsSync.createWriteStream(installerPath);
                    try {
                        for await (const chunk of res.body) {
                            const chunkBuf = Buffer.from(chunk);
                            fileStream.write(chunkBuf);
                            reportProgress(chunkBuf.length);
                        }
                    } finally {
                        fileStream.end();
                    }
                } else {
                    // Pre-allocate the target installer file
                    const fileHandle = await fs.open(installerPath, 'w');
                    try {
                        await fileHandle.truncate(contentLength);

                        const connections = 8;
                        const chunkSize = Math.ceil(contentLength / connections);
                        const chunkPromises = [];

                        if (VERBOSE_UPDATE_LOG) {
                            await appendUpdateLog(`nsis-updater parallel-download downloading via ${connections} parallel connections...`);
                        }

                        for (let i = 0; i < connections; i++) {
                            const start = i * chunkSize;
                            const end = Math.min(start + chunkSize - 1, contentLength - 1);

                            chunkPromises.push((async () => {
                                const res = await fetch(downloadUrl, {
                                    headers: {
                                        'Range': `bytes=${start}-${end}`
                                    },
                                    redirect: 'follow'
                                });
                                if (!res.ok) {
                                    throw new Error(`Connection ${i} failed with status ${res.status}`);
                                }
                                if (!res.body) {
                                    throw new Error(`Connection ${i} returned empty body`);
                                }

                                let offset = start;
                                for await (const chunk of res.body) {
                                    const chunkBuf = Buffer.from(chunk);
                                    await fileHandle.write(chunkBuf, 0, chunkBuf.length, offset);
                                    offset += chunkBuf.length;
                                    reportProgress(chunkBuf.length);
                                }
                            })());
                        }

                        await Promise.all(chunkPromises);
                    } finally {
                        await fileHandle.close();
                    }
                }

                // Final integrity verification check
                if (expectedSha512) {
                    if (VERBOSE_UPDATE_LOG) {
                        await appendUpdateLog(`nsis-updater parallel-download verifying SHA-512...`);
                    }
                    const actualSha = await sha512FileBase64(installerPath);
                    if (actualSha !== expectedSha512) {
                        try {
                            await fs.unlink(installerPath);
                        } catch {}
                        throw new Error(`Integrity mismatch. Expected SHA-512 ${expectedSha512}, but calculated ${actualSha}`);
                    }
                    if (VERBOSE_UPDATE_LOG) {
                        await appendUpdateLog(`nsis-updater parallel-download SHA-512 validation passed!`);
                    }
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
                
                // Cleanup partial file on failure to avoid corruption in next check
                try {
                    const fileName = `YumeShelf-Setup-${updateState.updateInfo?.version}.exe`;
                    await fs.unlink(path.join(updateCacheDir, fileName));
                } catch {}

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

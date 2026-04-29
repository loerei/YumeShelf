const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { NsisUpdater } = require('electron-updater');

function toBoolean(value) {
    return value === true;
}

function isFakeVersionRun() {
    return process.argv.some(arg => /^-\d+\.\d+\.\d+$/.test(String(arg || '').trim()));
}

function normalizeText(value, fallback = '') {
    const text = String(value || '').trim();
    return text || fallback;
}

function pickReleaseName(updateInfo) {
    return normalizeText(updateInfo?.releaseName || updateInfo?.version || '', '');
}

function pickReleaseNotes(updateInfo) {
    const raw = updateInfo?.releaseNotes;
    if (Array.isArray(raw)) {
        return raw
            .map((entry) => normalizeText(entry?.note || entry))
            .filter(Boolean)
            .join('\n\n---\n\n');
    }
    return normalizeText(raw, '');
}

function pickReleaseDate(updateInfo) {
    return normalizeText(updateInfo?.releaseDate, null);
}

function pickExpectedSha512(updateInfo) {
    const files = Array.isArray(updateInfo?.files) ? updateInfo.files : [];
    const fileEntry = files.find((entry) => {
        const candidate = String(entry?.url || entry?.name || entry?.path || '').toLowerCase();
        return candidate.endsWith('.exe');
    }) || files[0];
    return normalizeText(fileEntry?.sha512 || updateInfo?.sha512, null);
}

async function sha512FileBase64(filePath) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha512');
        const stream = fsSync.createReadStream(filePath);
        stream.on('data', chunk => hash.update(chunk));
        stream.on('error', reject);
        stream.on('end', () => resolve(hash.digest('base64')));
    });
}

function buildDownloadedState(updateInfo, installerPath, releaseUrl) {
    return {
        downloadedAt: new Date().toISOString(),
        expectedSha512: pickExpectedSha512(updateInfo),
        installerPath: String(installerPath),
        releaseName: pickReleaseName(updateInfo),
        releaseNotes: pickReleaseNotes(updateInfo),
        releaseUrl: normalizeText(releaseUrl, ''),
        version: normalizeText(updateInfo?.version, '')
    };
}

function normalizeDownloadedState(raw) {
    if (!raw || typeof raw !== 'object') return null;
    if (!raw.version || !raw.installerPath) return null;
    return {
        downloadedAt: normalizeText(raw.downloadedAt, null),
        expectedSha512: normalizeText(raw.expectedSha512, null),
        installerPath: String(raw.installerPath),
        releaseName: normalizeText(raw.releaseName, ''),
        releaseNotes: normalizeText(raw.releaseNotes, ''),
        releaseUrl: normalizeText(raw.releaseUrl, ''),
        version: String(raw.version)
    };
}

function classifyErrorReason(error) {
    const code = String((error && error.code) || '').toLowerCase();
    const message = String((error && error.message) || error || '').toLowerCase();
    if (message.includes('checksum') || message.includes('sha512')) return 'checksum';
    if (message.includes('signature')) return 'signature';
    if (code === 'enoent' || message.includes('no such file')) return 'missing-installer';
    if (code === 'econnreset' || code === 'econnrefused' || code === 'enetunreach' || code === 'ehostunreach' || code === 'eai_again' || message.includes('network') || message.includes('offline') || message.includes('timed out')) {
        return 'offline';
    }
    return code || 'download';
}

function createNsisUpdaterService({
    app,
    appendUpdateLog,
    broadcastStatus,
    compareVersions,
    ensureDir,
    releasePageUrl,
    updateCacheDir,
    postUpdateMarkerFile
}) {
    const downloadedStateFile = path.join(updateCacheDir, 'nsis-downloaded-state.json');
    const deferredInstallStateFile = path.join(updateCacheDir, 'nsis-deferred-install.json');

    let updater = null;
    let latestUpdateInfo = null;
    let latestDownloadedEvent = null;
    let activeDownloadPromise = null;

    function resolveRuntime() {
        if (app.isPackaged) {
            return {
                channel: 'nsis',
                provider: 'github',
                supported: true,
                usesDevConfig: false
            };
        }

        if (isFakeVersionRun()) {
            return {
                channel: 'development',
                provider: 'generic',
                supported: true,
                usesDevConfig: true
            };
        }

        return {
            channel: 'development',
            provider: 'none',
            supported: false,
            usesDevConfig: false
        };
    }

    function summarizeUpdateState(state = {}) {
        return {
            available: toBoolean(state.available),
            canSelfUpdate: toBoolean(state.canSelfUpdate),
            deferredUntilNextLaunch: toBoolean(state.deferredUntilNextLaunch),
            downloadable: toBoolean(state.downloadable),
            downloadReady: toBoolean(state.downloadReady),
            releaseName: normalizeText(state.releaseName, ''),
            releaseNotes: normalizeText(state.releaseNotes, ''),
            releaseUrl: normalizeText(state.releaseUrl, releasePageUrl),
            selfApplicable: toBoolean(state.selfApplicable),
            version: normalizeText(state.version, '')
        };
    }

    function emitStatus(payload) {
        if (typeof broadcastStatus === 'function') {
            broadcastStatus({
                scope: 'app-update',
                timestamp: Date.now(),
                ...payload
            });
        }
    }

    async function writeJson(filePath, value) {
        await ensureDir(path.dirname(filePath));
        await fs.writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
    }

    async function readJson(filePath) {
        try {
            return JSON.parse(await fs.readFile(filePath, 'utf8'));
        } catch {
            return null;
        }
    }

    async function readDownloadedState() {
        return normalizeDownloadedState(await readJson(downloadedStateFile));
    }

    async function writeDownloadedState(state) {
        await writeJson(downloadedStateFile, state);
    }

    async function clearDownloadedState() {
        try {
            await fs.unlink(downloadedStateFile);
        } catch {}
    }

    async function readDeferredInstallState() {
        return normalizeDownloadedState(await readJson(deferredInstallStateFile));
    }

    async function writeDeferredInstallState(state) {
        await writeJson(deferredInstallStateFile, state);
    }

    async function clearDeferredInstallState() {
        try {
            await fs.unlink(deferredInstallStateFile);
        } catch {}
    }

    async function getValidatedDownloadedStateForVersion(version) {
        const state = await readDownloadedState();
        if (!state) return null;
        if (state.version !== version) {
            await clearDownloadedState();
            return null;
        }
        if (!fsSync.existsSync(state.installerPath)) {
            await clearDownloadedState();
            return null;
        }
        return state;
    }

    async function getValidatedDeferredInstallState() {
        const state = await readDeferredInstallState();
        if (!state) return null;
        if (!fsSync.existsSync(state.installerPath)) {
            await appendUpdateLog(`deferred-install stale-missing-installer path=${state.installerPath}`);
            await clearDeferredInstallState();
            return null;
        }
        if (state.expectedSha512) {
            const digest = await sha512FileBase64(state.installerPath);
            if (digest !== state.expectedSha512) {
                await appendUpdateLog(`deferred-install stale-signature-mismatch path=${state.installerPath}`);
                await clearDeferredInstallState();
                return null;
            }
        }
        return state;
    }

    function buildReleaseMetadata(updateInfo, override = {}) {
        return {
            installedAt: new Date().toISOString(),
            releaseName: normalizeText(override.releaseName || pickReleaseName(updateInfo), ''),
            releaseNotes: normalizeText(override.releaseNotes || pickReleaseNotes(updateInfo), ''),
            releaseUrl: normalizeText(override.releaseUrl, releasePageUrl),
            toVersion: normalizeText(override.version || updateInfo?.version, ''),
            fromVersion: normalizeText(override.fromVersion || app.getVersion(), '')
        };
    }

    async function writePostUpdateMarker(metadata) {
        await ensureDir(path.dirname(postUpdateMarkerFile));
        await fs.writeFile(postUpdateMarkerFile, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
    }

    function createUpdater() {
        if (updater) return updater;

        updater = new NsisUpdater();
        updater.autoDownload = false;
        updater.autoInstallOnAppQuit = false;
        updater.autoRunAppAfterInstall = true;

        const runtime = resolveRuntime();
        if (runtime.usesDevConfig) {
            updater.forceDevUpdateConfig = true;
        }

        updater.on('checking-for-update', () => {
            void appendUpdateLog(`nsis-updater checking-for-update runtime=${JSON.stringify(runtime)}`);
        });

        updater.on('update-available', (updateInfo) => {
            latestUpdateInfo = updateInfo;
            void appendUpdateLog(`nsis-updater update-available version=${normalizeText(updateInfo?.version, '')}`);
        });

        updater.on('update-not-available', () => {
            latestUpdateInfo = null;
            latestDownloadedEvent = null;
            void appendUpdateLog('nsis-updater update-not-available');
        });

        updater.on('download-progress', (progress) => {
            const readyCandidate = summarizeUpdateState({
                available: true,
                canSelfUpdate: true,
                downloadable: true,
                downloadReady: false,
                releaseName: pickReleaseName(latestUpdateInfo),
                releaseNotes: pickReleaseNotes(latestUpdateInfo),
                releaseUrl: releasePageUrl,
                selfApplicable: true,
                version: normalizeText(latestUpdateInfo?.version, '')
            });
            emitStatus({
                phase: 'download-progress',
                downloaded: progress.transferred,
                total: progress.total,
                bytesPerSecond: progress.bytesPerSecond,
                update: readyCandidate
            });
        });

        updater.on('update-downloaded', (event) => {
            latestDownloadedEvent = event;
            void appendUpdateLog(`nsis-updater update-downloaded version=${normalizeText(event?.version, '')} file=${normalizeText(event?.downloadedFile, '')}`);
        });

        updater.on('error', (error) => {
            void appendUpdateLog(`nsis-updater error=${String((error && error.stack) || error || '')}`);
        });

        return updater;
    }

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

        const nsisUpdater = createUpdater();
        const result = await nsisUpdater.checkForUpdates();
        const updateInfo = result?.updateInfo || null;
        if (!updateInfo?.version || compareVersions(updateInfo.version, app.getVersion()) <= 0) {
            latestUpdateInfo = null;
            latestDownloadedEvent = null;
            await clearDeferredInstallState();
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

        latestUpdateInfo = updateInfo;
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
        if (activeDownloadPromise) return activeDownloadPromise;

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

        activeDownloadPromise = (async () => {
            try {
                const paths = await createUpdater().downloadUpdate();
                const installerPath = normalizeText(
                    latestDownloadedEvent?.downloadedFile
                    || (Array.isArray(paths) ? paths.find(candidate => String(candidate || '').toLowerCase().endsWith('.exe')) : '')
                    || (Array.isArray(paths) ? paths[0] : ''),
                    ''
                );
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
                await appendUpdateLog(`nsis-updater ready version=${downloadedState.version} installer=${downloadedState.installerPath}`);
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
                        version: normalizeText(updateState.updateInfo?.version, '')
                    })
                });
                return {
                    ok: false,
                    error: String((error && error.message) || error || ''),
                    reason
                };
            } finally {
                activeDownloadPromise = null;
            }
        })();

        return activeDownloadPromise;
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

        await clearDeferredInstallState();
        await writePostUpdateMarker(buildReleaseMetadata(updateState.updateInfo, {
            ...releaseMetadata,
            releaseName: releaseMetadata.releaseName || downloadedState.releaseName,
            releaseNotes: releaseMetadata.releaseNotes || downloadedState.releaseNotes,
            releaseUrl: releaseMetadata.releaseUrl || downloadedState.releaseUrl
        }));
        await appendUpdateLog(`nsis-updater quit-and-install version=${downloadedState.version}`);
        createUpdater().quitAndInstall(true, true);
        return { ok: true };
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
        await appendUpdateLog(`nsis-updater deferred-install version=${deferredState.version} installer=${deferredState.installerPath}`);

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

    async function runDeferredInstallOnLaunch() {
        const runtime = resolveRuntime();
        if (!runtime.supported) {
            return { launched: false, reason: 'unsupported-runtime' };
        }

        const deferredState = await getValidatedDeferredInstallState();
        if (!deferredState) {
            return { launched: false, reason: 'no-deferred-update' };
        }

        if (compareVersions(app.getVersion(), deferredState.version) >= 0) {
            await clearDeferredInstallState();
            await appendUpdateLog(`deferred-install already-satisfied current=${app.getVersion()} target=${deferredState.version}`);
            return { launched: false, reason: 'already-installed' };
        }

        await writePostUpdateMarker({
            fromVersion: app.getVersion(),
            installedAt: new Date().toISOString(),
            releaseName: deferredState.releaseName,
            releaseNotes: deferredState.releaseNotes,
            releaseUrl: deferredState.releaseUrl || releasePageUrl,
            toVersion: deferredState.version
        });

        try {
            const child = spawn(deferredState.installerPath, ['--updated', '/S', '--force-run'], {
                detached: true,
                stdio: 'ignore',
                windowsHide: true
            });
            child.unref();
            await clearDeferredInstallState();
            await appendUpdateLog(`deferred-install launched pid=${child.pid || 'unknown'} installer=${deferredState.installerPath}`);
            return {
                launched: true,
                pid: child.pid || null
            };
        } catch (error) {
            try {
                await fs.unlink(postUpdateMarkerFile);
            } catch {}
            await appendUpdateLog(`deferred-install launch-failed error=${String((error && error.stack) || error || '')}`);
            return {
                error: String((error && error.message) || error || ''),
                launched: false,
                reason: 'launch-failed'
            };
        }
    }

    return {
        checkForUpdates,
        clearDeferredInstallState,
        createUpdater,
        downloadUpdate,
        installDownloadedUpdateNow,
        readDeferredInstallState,
        resolveRuntime,
        runDeferredInstallOnLaunch,
        scheduleInstallOnNextLaunch,
        summarizeUpdateState
    };
}

module.exports = {
    createNsisUpdaterService,
    isFakeVersionRun
};

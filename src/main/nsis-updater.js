const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');
const { CancellationToken } = require('builder-util-runtime');
const { load } = require('js-yaml');
const { NsisUpdater } = require('electron-updater');
const { createInstallerHandoff } = require('./nsis-updater/installer-handoff');
const { resolveUpdaterRuntime, classifyErrorReason, delay, isFakeVersionRun, normalizeText, toBoolean } = require('./nsis-updater/runtime');
const { createStateFiles } = require('./nsis-updater/state-files');
const { buildDownloadedState, normalizeDownloadedState, pickReleaseName, pickReleaseNotes, sha512FileBase64 } = require('./nsis-updater/update-info');
const { attachUpdaterEventLogging } = require('./nsis-updater/updater-events');
const { downloadBuffer } = require('./core/shared-io');

const GITHUB_RELEASE_DOWNLOAD_BASE_URL = 'https://github.com/loerei/YumeShelf/releases/download';
const VERBOSE_UPDATE_LOG = process.env.YUMESHELF_UPDATE_DEBUG === '1';

function createNsisUpdaterService({
    app,
    appendUpdateLog,
    broadcastStatus,
    compareVersions,
    ensureDir,
    releasePageUrl,
    resolveFeedOverride,
    updateCacheDir,
    postUpdateMarkerFile
}) {
    let updater = null;
    let latestUpdateInfo = null;
    let latestDownloadedEvent = null;
    let activeDownloadPromise = null;
    let updaterFeedKey = null;

    function resolveRuntime() {
        return resolveUpdaterRuntime(app, isFakeVersionRun);
    }

    function createUpdaterLogger() {
        function forward(level, message) {
            if (level === 'debug' && !VERBOSE_UPDATE_LOG) return;
            const text = normalizeText(message, '');
            if (!text) return;
            void appendUpdateLog(`nsis-updater:${level} ${text}`);
        }

        return {
            debug(message) {
                forward('debug', message);
            },
            error(message) {
                forward('error', message);
            },
            info(message) {
                forward('info', message);
            },
            warn(message) {
                forward('warn', message);
            }
        };
    }

    function normalizeReleaseTagName(version) {
        const normalizedVersion = normalizeText(version, '').replace(/^v/i, '');
        return normalizedVersion ? `v${normalizedVersion}` : '';
    }

    function buildGitHubReleaseDownloadBaseUrl(version) {
        const tagName = normalizeReleaseTagName(version);
        return tagName ? `${GITHUB_RELEASE_DOWNLOAD_BASE_URL}/${tagName}` : '';
    }

    function buildGitHubReleaseManifestUrl(version) {
        const baseUrl = buildGitHubReleaseDownloadBaseUrl(version);
        return baseUrl ? `${baseUrl}/latest.yml` : '';
    }

    async function resolveCurrentReleaseCacheInputs(version) {
        const manifestUrl = buildGitHubReleaseManifestUrl(version);
        if (!manifestUrl) {
            return null;
        }

        const manifestBuffer = await downloadBuffer(manifestUrl, 0, 15000, null, app.getVersion());
        const manifest = load(manifestBuffer.toString('utf8'));
        const installerName = normalizeText(manifest?.path, '');
        const installerSha512 = normalizeText(manifest?.sha512, '');
        if (!installerName || !installerSha512) {
            throw new Error(`latest.yml for ${version} did not contain both path and sha512.`);
        }

        const releaseBaseUrl = buildGitHubReleaseDownloadBaseUrl(version);
        return {
            blockmapUrl: `${releaseBaseUrl}/${installerName}.blockmap`,
            installerName,
            installerSha512,
            installerUrl: `${releaseBaseUrl}/${installerName}`,
            manifestUrl
        };
    }

    async function ensureCurrentInstallerCacheState(activeUpdater, currentVersion) {
        const downloadHelper = typeof activeUpdater.getOrCreateDownloadHelper === 'function'
            ? await activeUpdater.getOrCreateDownloadHelper()
            : null;
        const cacheDir = normalizeText(downloadHelper?.cacheDir, '');
        if (!cacheDir) {
            if (VERBOSE_UPDATE_LOG) {
                await appendUpdateLog(`nsis-updater current-cache skip current=${currentVersion} reason=no-cache-dir`);
            }
            return null;
        }

        const cachedInstallerPath = path.join(cacheDir, 'installer.exe');
        const cachedBlockmapPath = path.join(cacheDir, 'current.blockmap');
        const releaseInputs = await resolveCurrentReleaseCacheInputs(currentVersion);
        if (!releaseInputs) {
            if (VERBOSE_UPDATE_LOG) {
                await appendUpdateLog(`nsis-updater current-cache skip current=${currentVersion} reason=no-release-inputs`);
            }
            return {
                cacheDir,
                cachedBlockmapPath,
                cachedInstallerPath
            };
        }

        let cachedInstallerSha512 = '';
        if (fsSync.existsSync(cachedInstallerPath)) {
            try {
                cachedInstallerSha512 = await sha512FileBase64(cachedInstallerPath);
            } catch (error) {
                await appendUpdateLog(`nsis-updater current-cache hash-error current=${currentVersion} installer=${cachedInstallerPath} error=${String((error && error.stack) || error || '')}`);
            }
        }

        const installerMatches = cachedInstallerSha512 === releaseInputs.installerSha512;
        if (VERBOSE_UPDATE_LOG) {
            await appendUpdateLog(
                `nsis-updater current-cache probe current=${currentVersion}`
                + ` manifest=${releaseInputs.manifestUrl}`
                + ` installer=${cachedInstallerPath}`
                + ` installerExists=${fsSync.existsSync(cachedInstallerPath)}`
                + ` installerMatches=${installerMatches}`
                + ` cachedInstallerSha512=${cachedInstallerSha512 || 'missing'}`
                + ` expectedInstallerSha512=${releaseInputs.installerSha512}`
                + ` blockmapExists=${fsSync.existsSync(cachedBlockmapPath)}`
            );
        }

        if (!installerMatches) {
            const tempInstallerPath = `${cachedInstallerPath}.download`;
            await ensureDir(path.dirname(cachedInstallerPath));
            try {
                await fs.unlink(tempInstallerPath);
            } catch {}
            await activeUpdater.httpExecutor.download(new URL(releaseInputs.installerUrl), tempInstallerPath, {
                cancellationToken: new CancellationToken(),
                headers: activeUpdater.requestHeaders || undefined,
                sha512: releaseInputs.installerSha512
            });
            await fs.rm(cachedInstallerPath, { force: true });
            await fs.rename(tempInstallerPath, cachedInstallerPath);
            cachedInstallerSha512 = await sha512FileBase64(cachedInstallerPath);
            if (VERBOSE_UPDATE_LOG) {
                await appendUpdateLog(`nsis-updater current-cache refreshed-installer current=${currentVersion} installer=${cachedInstallerPath} sha512=${cachedInstallerSha512}`);
            }
        }

        const blockmapBuffer = await downloadBuffer(releaseInputs.blockmapUrl, 0, 15000, null, app.getVersion());
        await ensureDir(path.dirname(cachedBlockmapPath));
        await fs.writeFile(cachedBlockmapPath, blockmapBuffer);
        if (VERBOSE_UPDATE_LOG) {
            await appendUpdateLog(`nsis-updater current-cache refreshed-blockmap current=${currentVersion} blockmap=${cachedBlockmapPath} bytes=${blockmapBuffer.length}`);
        }

        return {
            cacheDir,
            cachedBlockmapPath,
            cachedInstallerPath,
            cachedInstallerSha512
        };
    }

    function resolvePreviousBlockmapBaseUrl({ currentVersion, feedOverride, runtime }) {
        const overrideBaseUrl = buildGitHubReleaseDownloadBaseUrl(currentVersion);
        if (!overrideBaseUrl) {
            return null;
        }

        const isGitHubGenericOverride = feedOverride?.provider === 'generic'
            && /^https:\/\/github\.com\/loerei\/YumeShelf\/releases\/download\/[^/]+$/i.test(normalizeText(feedOverride.url, ''));
        if (isGitHubGenericOverride || runtime?.provider === 'github') {
            return overrideBaseUrl;
        }

        return null;
    }

    async function configureDifferentialDownload(nsisUpdater, { currentVersion, feedOverride, runtime }) {
        const previousBlockmapBaseUrlOverride = resolvePreviousBlockmapBaseUrl({
            currentVersion,
            feedOverride,
            runtime
        });
        nsisUpdater.previousBlockmapBaseUrlOverride = previousBlockmapBaseUrlOverride;

        if (VERBOSE_UPDATE_LOG) {
            await appendUpdateLog(
                `nsis-updater differential-config current=${currentVersion}`
                + ` runtime=${normalizeText(runtime?.channel, '')}`
                + ` provider=${normalizeText(feedOverride?.provider || runtime?.provider, '')}`
                + ` previousBlockmapBaseUrlOverride=${previousBlockmapBaseUrlOverride || 'default'}`
                + ` disableDifferentialDownload=${nsisUpdater.disableDifferentialDownload}`
            );
        }
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

    const stateFiles = createStateFiles({
        appendUpdateLog,
        ensureDir,
        normalizeDownloadedState,
        updateCacheDir,
        verifyInstallerHash: sha512FileBase64
    });
    const {
        clearDeferredInstallState,
        clearDownloadedState,
        getValidatedDeferredInstallState,
        getValidatedDownloadedStateForVersion,
        readDeferredInstallState,
        writeDeferredInstallState,
        writeDownloadedState
    } = stateFiles;

    function summarizeReadyUpdateFromState(state, patch = {}) {
        return summarizeUpdateState({
            available: true,
            canSelfUpdate: true,
            deferredUntilNextLaunch: !!patch.deferredUntilNextLaunch,
            downloadable: true,
            downloadReady: true,
            releaseName: state.releaseName,
            releaseNotes: state.releaseNotes,
            releaseUrl: state.releaseUrl || releasePageUrl,
            selfApplicable: true,
            version: state.version,
            ...patch
        });
    }

    const installerHandoff = createInstallerHandoff({
        app,
        appendUpdateLog,
        delay,
        emitStatus,
        ensureDir,
        postUpdateMarkerFile,
        releasePageUrl
    });
    const {
        buildReleaseMetadata,
        launchInstallerAndQuit,
        prepareInstallPhase,
        writePostUpdateMarker
    } = installerHandoff;

    function createUpdater() {
        if (updater) return updater;

        updater = new NsisUpdater();
        updater.logger = createUpdaterLogger();
        updater.autoDownload = false;
        updater.autoInstallOnAppQuit = false;
        updater.autoRunAppAfterInstall = true;
        updater.allowPrerelease = String(app.getVersion() || '').includes('-');
        updater.disableWebInstaller = true;

        const runtime = resolveUpdaterRuntime(app, isFakeVersionRun);
        if (runtime.usesDevConfig) {
            updater.forceDevUpdateConfig = true;
        }
        updater.__yumeshelfRuntime = runtime;

        if (VERBOSE_UPDATE_LOG) {
            void appendUpdateLog(`nsis-updater created current=${app.getVersion()} allowPrerelease=${updater.allowPrerelease}`);
        }
        attachUpdaterEventLogging({
            appendUpdateLog,
            emitStatus,
            latestDownloadedEventRef: {
                get: () => latestDownloadedEvent,
                set: (value) => {
                    latestDownloadedEvent = value;
                }
            },
            latestUpdateInfoRef: {
                get: () => latestUpdateInfo,
                set: (value) => {
                    latestUpdateInfo = value;
                }
            },
            releasePageUrl,
            summarizeUpdateState,
            updater
        });

        return updater;
    }

    async function configureUpdaterFeed(runtime) {
        const nsisUpdater = createUpdater();
        let feedOverride = null;

        if (typeof resolveFeedOverride === 'function') {
            try {
                feedOverride = await resolveFeedOverride({
                    currentVersion: app.getVersion(),
                    runtime
                });
            } catch (error) {
                await appendUpdateLog(`nsis-updater feed-override-error error=${String((error && error.stack) || error || '')}`);
            }
        }

        if (feedOverride?.provider === 'generic' && feedOverride?.url) {
            const desiredFeedKey = `generic:${feedOverride.url}`;
            if (updaterFeedKey !== desiredFeedKey) {
                nsisUpdater.setFeedURL({
                    provider: 'generic',
                    url: feedOverride.url,
                    useMultipleRangeRequest: false
                });
                updaterFeedKey = desiredFeedKey;
            }

            await configureDifferentialDownload(nsisUpdater, {
                currentVersion: app.getVersion(),
                feedOverride,
                runtime
            });
            if (VERBOSE_UPDATE_LOG) {
                await appendUpdateLog(`nsis-updater feed-config current=${app.getVersion()} runtime=${runtime.channel} provider=generic url=${feedOverride.url} target=${normalizeText(feedOverride.release?.version, '')} tag=${normalizeText(feedOverride.release?.tagName, '')}`);
            }
            return {
                feedOverride,
                updater: nsisUpdater
            };
        }

        if (updaterFeedKey == null) {
            updaterFeedKey = runtime.usesDevConfig ? 'dev-config' : `publish:${runtime.provider}`;
        }
        await configureDifferentialDownload(nsisUpdater, {
            currentVersion: app.getVersion(),
            feedOverride: null,
            runtime
        });
        if (VERBOSE_UPDATE_LOG) {
            await appendUpdateLog(`nsis-updater feed-config current=${app.getVersion()} runtime=${runtime.channel} provider=${runtime.provider} mode=${runtime.usesDevConfig ? 'dev-config' : 'publish-config'}`);
        }
        return {
            feedOverride: null,
            updater: nsisUpdater
        };
    }

    async function checkForUpdates() {
        const runtime = resolveUpdaterRuntime(app, isFakeVersionRun);
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
            await appendUpdateLog(`nsis-updater check-result current=${app.getVersion()} candidate=${normalizeText(updateInfo?.version, '')} releaseName=${normalizeText(updateInfo?.releaseName, '')} releaseDate=${normalizeText(updateInfo?.releaseDate, '')} feed=${feedOverride?.url || runtime.provider}`);
        }
        if (!updateInfo?.version || compareVersions(updateInfo.version, app.getVersion()) <= 0) {
            latestUpdateInfo = null;
            latestDownloadedEvent = null;
            await clearDeferredInstallState();
            if (VERBOSE_UPDATE_LOG) {
                await appendUpdateLog(`nsis-updater no-newer-update current=${app.getVersion()} candidate=${normalizeText(updateInfo?.version, '')}`);
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
                const activeUpdater = createUpdater();
                let cachedInstallerPath = '';
                let hasCachedInstaller = false;
                try {
                    const currentCacheState = await ensureCurrentInstallerCacheState(activeUpdater, app.getVersion());
                    cachedInstallerPath = normalizeText(currentCacheState?.cachedInstallerPath, '');
                    hasCachedInstaller = cachedInstallerPath ? fsSync.existsSync(cachedInstallerPath) : false;
                } catch (error) {
                    await appendUpdateLog(`nsis-updater cache-state-error error=${String((error && error.stack) || error || '')}`);
                }
                if (VERBOSE_UPDATE_LOG) {
                    await appendUpdateLog(
                        `nsis-updater download-begin current=${app.getVersion()}`
                        + ` target=${normalizeText(updateState.updateInfo?.version, '')}`
                        + ` previousBlockmapBaseUrlOverride=${normalizeText(activeUpdater.previousBlockmapBaseUrlOverride, '') || 'default'}`
                        + ` cachedInstaller=${cachedInstallerPath || 'unknown'}`
                        + ` cachedInstallerExists=${hasCachedInstaller}`
                    );
                }
                const paths = await activeUpdater.downloadUpdate();
                if (VERBOSE_UPDATE_LOG) {
                    await appendUpdateLog(`nsis-updater download-paths paths=${JSON.stringify(Array.isArray(paths) ? paths : [])}`);
                }
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
        const runtime = resolveUpdaterRuntime(app, isFakeVersionRun);
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

    async function runDeferredInstallOnLaunch() {
        return beginDeferredInstallOnLaunch();
    }

    return {
        beginDeferredInstallOnLaunch,
        checkForUpdates,
        clearDeferredInstallState,
        createUpdater,
        downloadUpdate,
        installDownloadedUpdateNow,
        prepareDeferredInstallOnLaunch,
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

interface TimedTaskResult<T> {
    ok: boolean;
    timedOut: boolean;
    value: T | null;
    error: any;
}

function createTimedTask<T>(taskFactory: () => Promise<T>, timeoutMs: number): Promise<TimedTaskResult<T>> {
    return new Promise((resolve) => {
        let settled = false;
        const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            resolve({ ok: false, timedOut: true, value: null, error: null });
        }, timeoutMs);

        Promise.resolve()
            .then(taskFactory)
            .then((value) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                resolve({ ok: true, timedOut: false, value, error: null });
            })
            .catch((error) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                resolve({ ok: false, timedOut: false, value: null, error });
            });
    });
}

export interface StartupServicesOptions {
    app: any;
    checkForAppUpdate: () => Promise<any>;
    consumePostUpdateMarker: () => Promise<any>;
    prepareDeferredInstallOnLaunch: () => Promise<any>;
    preparePlaytimeSessions: () => Promise<any>;
    overlayPlaytimeSessions: (games: any[]) => any[];
    logAppUpdateDebug: (message: string) => Promise<void> | void;
    applyLanguagePackUpdates: (candidates: any[], options: any) => Promise<any>;
    buildLanguageState: () => Promise<any>;
    fetchLanguageManifest: () => Promise<any>;
    getLanguagePackUpdateCandidates: (state: any, manifest: any) => any[];
    getCategoryTree: () => Promise<any[]>;
    isNetworkLikeError: (error: any) => boolean;
    loadGamesForConfig: (config: any) => Promise<any[]>;
    resolveLibraryConfig: () => Promise<any>;
    startupNetworkTimeoutMs: number;
}

export function createStartupServices({
    app,
    checkForAppUpdate,
    consumePostUpdateMarker,
    prepareDeferredInstallOnLaunch,
    preparePlaytimeSessions,
    overlayPlaytimeSessions,
    logAppUpdateDebug,
    applyLanguagePackUpdates,
    buildLanguageState,
    fetchLanguageManifest,
    getLanguagePackUpdateCandidates,
    getCategoryTree,
    isNetworkLikeError,
    loadGamesForConfig,
    resolveLibraryConfig,
    startupNetworkTimeoutMs
}: StartupServicesOptions) {
    function emitBootStatus(webContents: any, payload: any) {
        if (!webContents || webContents.isDestroyed()) return;
        webContents.send('boot-status', {
            scope: 'startup',
            timestamp: Date.now(),
            ...payload
        });
    }

    async function bootstrapAppState(webContents: any, options: any = {}) {
        const appUpdatesMode = String(options.appUpdatesMode || 'notify').toLowerCase();
        const languagePackUpdatesMode = String(options.languagePackUpdatesMode || 'automatic').toLowerCase();
        const postUpdateNotice = typeof consumePostUpdateMarker === 'function'
            ? await consumePostUpdateMarker()
            : null;
        if (typeof logAppUpdateDebug === 'function') {
            await logAppUpdateDebug(`bootstrapAppState postUpdateNotice=${JSON.stringify(postUpdateNotice ? {
                fromVersion: postUpdateNotice.fromVersion || '',
                installed: !!postUpdateNotice.installed,
                version: postUpdateNotice.version || ''
            } : null)} appUpdatesMode=${appUpdatesMode} languagePackUpdatesMode=${languagePackUpdatesMode}`);
        }
        const appUpdateCheck: any = {
            attempted: false,
            source: 'skipped',
            offline: false,
            timedOut: false,
            error: null,
            available: false,
            version: null,
            releaseName: '',
            releaseNotes: '',
            releaseUrl: null,
            downloadable: false,
            canSelfUpdate: false,
            selfApplicable: false,
            downloadReady: false,
            deferredUntilNextLaunch: false,
            checksumSha256: null,
            fallbackReason: null
        };
        const languagePackCheck: any = {
            attempted: false,
            source: 'skipped',
            offline: false,
            timedOut: false,
            error: null,
            updatesChecked: false,
            availableUpdates: [],
            installedUpdates: [],
            failedUpdates: []
        };

        emitBootStatus(webContents, {
            key: 'boot_loading_language_state',
            fallbackText: 'Loading language settings'
        });
        let languageState = await buildLanguageState();
        console.log(`[MAIN][BOOT] buildLanguageState finished. app.getVersion() = ${app.getVersion()}, languageState.appVersion = ${languageState ? languageState.appVersion : 'null'}`);
        if (typeof preparePlaytimeSessions === 'function') {
            emitBootStatus(webContents, {
                key: 'boot_recovering_playtime_sessions',
                fallbackText: 'Recovering running game sessions'
            });
            await preparePlaytimeSessions();
        }
        const deferredAppUpdateInstall = typeof prepareDeferredInstallOnLaunch === 'function'
            ? await prepareDeferredInstallOnLaunch()
            : { pending: false, reason: 'not-supported' };

        if (deferredAppUpdateInstall?.pending) {
            emitBootStatus(webContents, {
                key: 'boot_update_preparing_install',
                fallbackText: 'Preparing installation',
                mode: 'update',
                showProgress: true,
                titleKey: 'boot_update_title',
                titleText: 'Installing YumeShelf update'
            });
            return {
                appVersion: app.getVersion(),
                languageState,
                config: null,
                games: [],
                categoryTree: [],
                bootChecks: {
                    appUpdatesMode,
                    appUpdateCheck,
                    languagePackUpdatesMode,
                    languagePackCheck
                },
                deferredAppUpdateInstall,
                postUpdateNotice
            };
        }

        if (appUpdatesMode !== 'off') {
            emitBootStatus(webContents, {
                key: 'boot_checking_app_update',
                fallbackText: 'Checking for a newer version'
            });

            const appUpdateProbe = await createTimedTask(() => checkForAppUpdate(), startupNetworkTimeoutMs);
            appUpdateCheck.attempted = true;

            if (appUpdateProbe.timedOut) {
                appUpdateCheck.source = 'timeout';
                appUpdateCheck.timedOut = true;
                emitBootStatus(webContents, {
                    key: 'boot_app_update_timeout',
                    fallbackText: 'App update check timed out, continuing startup'
                });
            } else if (!appUpdateProbe.ok) {
                const offline = isNetworkLikeError(appUpdateProbe.error);
                appUpdateCheck.source = offline ? 'offline' : 'error';
                appUpdateCheck.offline = offline;
                appUpdateCheck.error = String((appUpdateProbe.error && appUpdateProbe.error.message) || appUpdateProbe.error || '');
                emitBootStatus(webContents, {
                    key: offline ? 'boot_app_update_offline' : 'boot_app_update_failed',
                    fallbackText: offline ? 'No internet, skipping app update check' : 'App update check failed, continuing startup'
                });
            } else {
                Object.assign(appUpdateCheck, appUpdateProbe.value || {});
                emitBootStatus(webContents, {
                    key: appUpdateCheck.available ? 'boot_app_update_available' : 'boot_app_update_latest',
                    fallbackText: appUpdateCheck.available ? 'New app update available' : 'App update check finished'
                });
            }
        }

        emitBootStatus(webContents, {
            key: 'boot_checking_library_config',
            fallbackText: 'Checking library configuration'
        });
        const config = await resolveLibraryConfig();
        if (!config || !config.libraryPath) {
            emitBootStatus(webContents, {
                key: 'boot_waiting_for_library_setup',
                fallbackText: 'Library not configured yet'
            });
            return {
                appVersion: app.getVersion(),
                languageState,
                config: config || null,
                games: [],
                categoryTree: [],
                bootChecks: {
                    appUpdatesMode,
                    appUpdateCheck,
                    languagePackUpdatesMode,
                    languagePackCheck
                },
                postUpdateNotice
            };
        }

        if (languagePackUpdatesMode !== 'off') {
            emitBootStatus(webContents, {
                key: 'boot_checking_language_pack_source',
                fallbackText: 'Checking language pack source'
            });

            const manifestProbe = await createTimedTask(() => fetchLanguageManifest(), startupNetworkTimeoutMs);
            languagePackCheck.attempted = true;

            if (manifestProbe.timedOut) {
                languagePackCheck.source = 'timeout';
                languagePackCheck.timedOut = true;
                emitBootStatus(webContents, {
                    key: 'boot_language_pack_source_timeout',
                    fallbackText: 'Language pack check timed out, continuing startup'
                });
            } else if (!manifestProbe.ok) {
                const offline = isNetworkLikeError(manifestProbe.error);
                languagePackCheck.source = offline ? 'offline' : 'error';
                languagePackCheck.offline = offline;
                languagePackCheck.error = String((manifestProbe.error && manifestProbe.error.message) || manifestProbe.error || '');
                emitBootStatus(webContents, {
                    key: offline ? 'boot_language_pack_source_offline' : 'boot_language_pack_source_failed',
                    fallbackText: offline ? 'No internet, skipping language pack check' : 'Language pack check failed, continuing startup'
                });
            } else {
                const manifestResult = manifestProbe.value as any;
                languagePackCheck.source = manifestResult.source || 'none';
                languagePackCheck.offline = !!manifestResult.offline;
                languagePackCheck.error = manifestResult.error || null;

                let key = 'boot_language_pack_source_ready';
                let fallbackText = 'Language pack source ready';
                if (manifestResult.source === 'cache') {
                    key = 'boot_language_pack_source_cached';
                    fallbackText = 'Using cached language pack source';
                } else if (manifestResult.offline) {
                    key = 'boot_language_pack_source_offline';
                    fallbackText = 'No internet, skipping language pack check';
                } else if (!manifestResult.ok) {
                    key = 'boot_language_pack_source_failed';
                    fallbackText = 'Language pack check failed, continuing startup';
                }

                emitBootStatus(webContents, { key, fallbackText });

                if (manifestResult.ok && manifestResult.manifest) {
                    emitBootStatus(webContents, {
                        key: 'boot_checking_language_pack_updates',
                        fallbackText: 'Checking installed language pack updates'
                    });

                    const candidates = getLanguagePackUpdateCandidates(languageState, manifestResult.manifest);
                    languagePackCheck.updatesChecked = true;
                    languagePackCheck.availableUpdates = candidates.map(candidate => candidate.summary);

                    if (languagePackUpdatesMode === 'automatic' && candidates.length > 0 && !manifestResult.offline) {
                        emitBootStatus(webContents, {
                            key: 'boot_installing_language_pack_updates',
                            fallbackText: 'Installing language pack updates'
                        });

                        const updateResult = await applyLanguagePackUpdates(candidates, {
                            downloadTimeoutMs: startupNetworkTimeoutMs
                        });
                        languagePackCheck.installedUpdates = updateResult.installed || [];
                        languagePackCheck.failedUpdates = updateResult.failed || [];
                        if (updateResult.state) {
                            languageState = updateResult.state;
                        }
                    }
                }
            }
        }

        emitBootStatus(webContents, {
            key: 'boot_loading_library',
            fallbackText: 'Loading library'
        });
        const loadedGames = await loadGamesForConfig(config);
        const games = typeof overlayPlaytimeSessions === 'function'
            ? overlayPlaytimeSessions(loadedGames)
            : loadedGames;
        const categoryTree = typeof getCategoryTree === 'function'
            ? await getCategoryTree()
            : [];

        emitBootStatus(webContents, {
            key: 'boot_preparing_interface',
            fallbackText: 'Preparing interface'
        });

        console.log(`[MAIN][BOOT] bootstrapAppState complete. returning appVersion=${app.getVersion()} and languageState.appVersion=${languageState ? languageState.appVersion : 'null'}`);
        return {
            appVersion: app.getVersion(),
            languageState,
            config,
            games,
            categoryTree,
            bootChecks: {
                appUpdatesMode,
                appUpdateCheck,
                languagePackUpdatesMode,
                languagePackCheck
            },
            postUpdateNotice
        };
    }

    return {
        bootstrapAppState,
        loadGamesForConfig,
        resolveLibraryConfig
    };
}

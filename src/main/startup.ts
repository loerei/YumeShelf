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

function emitBootStatus(webContents: any, payload: any) {
    if (!webContents || webContents.isDestroyed()) return;
    webContents.send('boot-status', {
        scope: 'startup',
        timestamp: Date.now(),
        ...payload
    });
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

        emitBootStatus(webContents, {
            key: 'boot_checking_library_config',
            fallbackText: 'Checking library configuration'
        });
        const config = await resolveLibraryConfig();
        if (!config?.libraryPath) {
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

    async function triggerBackgroundChecks(options: any = {}) {
        const appUpdatesMode = String(options.appUpdatesMode || 'notify').toLowerCase();
        const languagePackUpdatesMode = String(options.languagePackUpdatesMode || 'automatic').toLowerCase();
        const isDeferredPending = !!options.deferredAppUpdateInstall?.pending;

        // 1. App Update Background Check
        if (!isDeferredPending && appUpdatesMode !== 'off' && typeof checkForAppUpdate === 'function') {
            try {
                if (typeof logAppUpdateDebug === 'function') {
                    await logAppUpdateDebug(`triggerBackgroundChecks starting app-update check mode=${appUpdatesMode}`);
                }
                await checkForAppUpdate();
            } catch (error) {
                if (typeof logAppUpdateDebug === 'function') {
                    await logAppUpdateDebug(`triggerBackgroundChecks app-update error=${String((error as any)?.stack || error || '')}`);
                }
            }
        }

        // 2. Language Pack Background Check
        if (languagePackUpdatesMode !== 'off' && typeof fetchLanguageManifest === 'function') {
            try {
                const manifestResult: any = await fetchLanguageManifest();
                if (manifestResult?.ok && manifestResult.manifest && typeof getLanguagePackUpdateCandidates === 'function') {
                    const currentLangState = typeof buildLanguageState === 'function' ? await buildLanguageState() : null;
                    if (currentLangState) {
                        const candidates = getLanguagePackUpdateCandidates(currentLangState, manifestResult.manifest);
                        if (languagePackUpdatesMode === 'automatic' && candidates.length > 0 && !manifestResult.offline && typeof applyLanguagePackUpdates === 'function') {
                            await applyLanguagePackUpdates(candidates, { downloadTimeoutMs: startupNetworkTimeoutMs });
                        }
                    }
                }
            } catch (error) {
                if (typeof logAppUpdateDebug === 'function') {
                    await logAppUpdateDebug(`triggerBackgroundChecks language-pack error=${String((error as any)?.stack || error || '')}`);
                }
            }
        }
    }

    return {
        bootstrapAppState,
        loadGamesForConfig,
        resolveLibraryConfig,
        triggerBackgroundChecks
    };
}

function createTimedTask(taskFactory, timeoutMs) {
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

function createStartupServices({
    app,
    buildLanguageState,
    defaultGamesDir,
    fetchLanguageManifest,
    fsSync,
    isNetworkLikeError,
    loadDB,
    saveDB,
    scan,
    startupNetworkTimeoutMs
}) {
    function emitBootStatus(webContents, payload) {
        if (!webContents || webContents.isDestroyed()) return;
        webContents.send('boot-status', {
            scope: 'startup',
            timestamp: Date.now(),
            ...payload
        });
    }

    async function resolveLibraryConfig() {
        if (process.argv.some(arg => arg.toLowerCase() === '--welcome' || arg.toLowerCase() === '-w')) return null;
        const db = await loadDB();

        if (!db.config && fsSync.existsSync(defaultGamesDir)) {
            db.config = { libraryPath: defaultGamesDir };
            await saveDB(db);
        }

        if (db.config && !fsSync.existsSync(db.config.libraryPath) && fsSync.existsSync(defaultGamesDir)) {
            db.config.libraryPath = defaultGamesDir;
            await saveDB(db);
        }

        return db.config || null;
    }

    async function loadGamesForConfig(config) {
        if (!config || !config.libraryPath) return [];
        return scan(config.libraryPath);
    }

    async function bootstrapAppState(webContents, options = {}) {
        const appUpdatesMode = String(options.appUpdatesMode || 'notify').toLowerCase();
        const languagePackUpdatesMode = String(options.languagePackUpdatesMode || 'automatic').toLowerCase();
        const languagePackCheck = {
            attempted: false,
            source: 'skipped',
            offline: false,
            timedOut: false,
            error: null
        };

        emitBootStatus(webContents, {
            key: 'boot_loading_language_state',
            fallbackText: 'Loading language settings'
        });
        const languageState = await buildLanguageState();

        emitBootStatus(webContents, {
            key: 'boot_checking_library_config',
            fallbackText: 'Checking library configuration'
        });
        const config = await resolveLibraryConfig();
        if (!config) {
            emitBootStatus(webContents, {
                key: 'boot_waiting_for_library_setup',
                fallbackText: 'Library not configured yet'
            });
            return {
                appVersion: app.getVersion(),
                languageState,
                config: null,
                games: [],
                bootChecks: {
                    appUpdatesMode,
                    languagePackUpdatesMode,
                    languagePackCheck
                }
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
                const manifestResult = manifestProbe.value;
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
            }
        }

        emitBootStatus(webContents, {
            key: 'boot_loading_library',
            fallbackText: 'Loading library'
        });
        const games = await loadGamesForConfig(config);

        emitBootStatus(webContents, {
            key: 'boot_preparing_interface',
            fallbackText: 'Preparing interface'
        });

        return {
            appVersion: app.getVersion(),
            languageState,
            config,
            games,
            bootChecks: {
                appUpdatesMode,
                languagePackUpdatesMode,
                languagePackCheck
            }
        };
    }

    return {
        bootstrapAppState,
        loadGamesForConfig,
        resolveLibraryConfig
    };
}

module.exports = {
    createStartupServices
};

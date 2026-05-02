function registerMainIpc({
    app,
    ipcMain,
    shell,
    appUpdateServices,
    languagePackServices,
    libraryState,
    playtimeSessionManager,
    startupServices,
    defaultGamesDir
}) {
    ipcMain.handle('get-app-version', async () => app.getVersion());
    ipcMain.handle('get-language-state', async () => languagePackServices.buildLanguageState());
    ipcMain.handle('bootstrap-app', async (event, options = {}) => startupServices.bootstrapAppState(event.sender, options));

    ipcMain.handle('start-app-update-download', async () => appUpdateServices.startBackgroundDownload());
    ipcMain.handle('restart-and-install-app-update', async () => appUpdateServices.restartAndInstallDownloadedUpdate());
    ipcMain.handle('schedule-app-update-next-launch', async () => appUpdateServices.scheduleInstallOnNextLaunch());
    ipcMain.handle('begin-deferred-app-update-install', async () => appUpdateServices.beginDeferredInstallOnLaunch());
    ipcMain.handle('open-app-update-download-page', async () => appUpdateServices.openAppUpdateDownloadPage());
    ipcMain.handle('open-external-url', async (_event, url) => {
        const normalizedUrl = String(url || '').trim();
        if (!/^https?:\/\//i.test(normalizedUrl)) {
            return { ok: false, reason: 'invalid-url' };
        }
        await shell.openExternal(normalizedUrl);
        return { ok: true };
    });
    ipcMain.handle('get-language-pack-manifest', async () => {
        const result = await languagePackServices.fetchLanguageManifest();
        return {
            ok: result.ok,
            offline: result.offline,
            source: result.source,
            error: result.error,
            repoUrl: languagePackServices.repoUrl,
            packs: result.manifest ? result.manifest.packs : []
        };
    });
    ipcMain.handle('install-language-pack', async (_event, code) => languagePackServices.installLanguagePack(code));

    ipcMain.handle('check-config', async () => startupServices.resolveLibraryConfig());
    ipcMain.handle('get-default-path', () => defaultGamesDir);
    ipcMain.handle('setup-library', async (_event, type) => libraryState.setupLibrary(type));
    ipcMain.handle('update-library-config', async (_event, updates = {}) => libraryState.updateLibraryConfig(updates));
    ipcMain.handle('get-games', async () => {
        await playtimeSessionManager.refreshSessions({ recover: true, emit: false });
        const games = await startupServices.loadGamesForConfig(await startupServices.resolveLibraryConfig());
        return playtimeSessionManager.overlayGames(games).map(game => {
            const { iconData, ...rest } = game;
            return rest;
        });
    });
    ipcMain.on('launch-yume', async (_event, { gameKey, exePath }) => {
        try {
            await playtimeSessionManager.launchTrackedGame(gameKey, exePath);
        } catch (error) {
            console.error(`[PLAYTIME][SESSIONS] failed to launch tracked game ${gameKey}:`, error);
        }
    });

    ipcMain.on('open-folder', async () => {
        const libraryPath = await libraryState.resolveLibraryFolderToOpen();
        if (libraryPath) {
            shell.openPath(libraryPath);
        }
    });
    ipcMain.handle('rename-game', async (_event, { gameKey, newName }) => libraryState.renameGame(gameKey, newName));
    ipcMain.handle('toggle-favorite', async (_event, gameKey) => libraryState.toggleFavorite(gameKey));
    ipcMain.on('reveal-game', (_event, targetPath) => shell.showItemInFolder(targetPath));
    ipcMain.handle('delete-game', async (_event, targetPath) => shell.trashItem(targetPath));
}

module.exports = {
    registerMainIpc
};

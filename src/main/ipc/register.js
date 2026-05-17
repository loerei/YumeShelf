function registerMainIpc({
    app,
    ipcMain,
    shell,
    appUpdateServices,
    categoryState,
    languagePackServices,
    libraryState,
    playtimeSessionManager,
    saveFolderResolver,
    saveEditorService,
    startupServices,
    defaultGamesDir
}) {
    ipcMain.handle('get-app-version', async () => app.getVersion());
    ipcMain.handle('get-language-state', async () => languagePackServices.buildLanguageState());
    ipcMain.handle('bootstrap-app', async (event, options = {}) => startupServices.bootstrapAppState(event.sender, options));
    ipcMain.handle('log-app-update-debug', async (_event, message) => {
        if (typeof appUpdateServices.logDebug === 'function') {
            await appUpdateServices.logDebug(String(message || ''));
        }
        return { ok: true };
    });

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
    ipcMain.handle('get-category-tree', async () => categoryState.getCategoryTree());
    ipcMain.handle('create-category', async (_event, payload = {}) => categoryState.createCategory(payload));
    ipcMain.handle('rename-category', async (_event, { categoryId, name }) => categoryState.renameCategory(categoryId, name));
    ipcMain.handle('delete-category', async (_event, categoryId) => categoryState.deleteCategory(categoryId));
    ipcMain.handle('assign-game-categories', async (_event, { gameId, categoryIds }) => categoryState.assignGameCategories(gameId, categoryIds));
    ipcMain.handle('remove-game-category', async (_event, { gameId, categoryId }) => categoryState.removeGameFromCategory(gameId, categoryId));
    ipcMain.on('launch-yume', async (_event, { gameKey, exePath, runInBackground }) => {
        try {
            await playtimeSessionManager.launchTrackedGame(gameKey, exePath, runInBackground);
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
    ipcMain.handle('toggle-run-in-background', async (_event, gameKey) => libraryState.toggleRunInBackground(gameKey));
    ipcMain.on('reveal-game', (_event, targetPath) => shell.showItemInFolder(targetPath));
    ipcMain.on('open-path', (_event, targetPath) => shell.openPath(targetPath));
    ipcMain.handle('delete-game', async (_event, targetPath) => shell.trashItem(targetPath));

    ipcMain.handle('get-save-folder', async (_event, gameKey) => {
        console.log(`[IPC][get-save-folder] Received request for: ${gameKey}`);
        const record = await libraryState.getGameRecord(gameKey);
        if (!record) {
            console.warn(`[IPC][get-save-folder] Could not resolve record for key: ${gameKey}`);
            return { path: null, engine: null, confidence: 'none' };
        }
        if (!record.exePath) {
            console.warn(`[IPC][get-save-folder] Record found but has no exePath: ${record.name}`);
            return { path: null, engine: null, confidence: 'none' };
        }
        console.log(`[IPC][get-save-folder] Resolved to record: ${record.name} (${record.exePath})`);
        return saveFolderResolver.resolveSaveFolder(record.exePath, record.saveFolderOverride);
    });
    ipcMain.handle('set-save-folder-override', async (_event, { gameKey, folderPath }) => {
        return libraryState.setSaveFolderOverride(gameKey, folderPath);
    });

    // Save Editor
    ipcMain.handle('save-editor:list-files', async (_event, gameKey) => {
        console.log(`[IPC] save-editor:list-files gameKey: ${gameKey}`);
        return saveEditorService.listSaveFiles(gameKey);
    });
    ipcMain.handle('save-editor:load-data', async (_event, { gameKey, fileName }) => {
        console.log(`[IPC] save-editor:load-data gameKey: ${gameKey}, fileName: ${fileName}`);
        return saveEditorService.loadSaveData(gameKey, fileName);
    });
    ipcMain.handle('save-editor:write-data', async (_event, { gameKey, fileName, data }) => {
        console.log(`[IPC] save-editor:write-data gameKey: ${gameKey}, fileName: ${fileName}`);
        return saveEditorService.writeSaveData(gameKey, fileName, data);
    });
    ipcMain.handle('save-editor:update-mapping', async (_event, { gameKey, name, offset, dataType }) => {
        console.log(`[IPC] save-editor:update-mapping gameKey: ${gameKey}`);
        return saveEditorService.updateMapping(gameKey, name, offset, dataType);
    });
}

module.exports = {
    registerMainIpc
};

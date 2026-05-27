import { App, IpcMain, Shell, BrowserWindow } from 'electron';
import * as fsSync from 'fs';
import { TelemetryShipper } from '../telemetry/shipper';
import { isPathWithinLibrary } from './path-validator';

export interface RegisterIpcOptions {
    app: App;
    ipcMain: IpcMain;
    shell: Shell;
    appUpdateServices: any;
    categoryState: any;
    languagePackServices: any;
    libraryState: any;
    playtimeSessionManager: any;
    saveFolderResolver: any;
    saveEditorService: any;
    translationService: any;
    startupServices: any;
    defaultGamesDir: string;
    paths: any;
}

export function registerMainIpc({
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
    translationService,
    startupServices,
    defaultGamesDir,
    paths
}: RegisterIpcOptions): void {
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
    ipcMain.handle('update-library-config', async (_event, updates = {}) => {
        const result = await libraryState.updateLibraryConfig(updates);
        if (updates && 'telemetryEnabled' in updates) {
            await TelemetryShipper.getInstance().setTelemetryEnabled(updates.telemetryEnabled);
        }
        return result;
    });
    ipcMain.handle('get-games', async () => {
        await playtimeSessionManager.refreshSessions({ recover: true, emit: false });
        const games = await startupServices.loadGamesForConfig(await startupServices.resolveLibraryConfig());
        return playtimeSessionManager.overlayGames(games).map((game: any) => {
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
            const record = await libraryState.getGameRecord(gameKey);
            if (record && record.autoTranslate) {
                await translationService.prepareTranslator(gameKey, exePath);
            } else {
                await translationService.removeTranslator(exePath);
            }
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
    ipcMain.handle('toggle-auto-translate', async (_event, gameKey) => libraryState.toggleAutoTranslate(gameKey));
    ipcMain.handle('translation:check-support', async (_event, gameKey) => {
        const record = await libraryState.getGameRecord(gameKey);
        if (!record || !record.exePath) return { supported: false, engine: null };
        const engine = await translationService.detectEngineSupport(record.exePath);
        return { supported: !!engine, engine };
    });
    ipcMain.handle('translation:start-sync', async (_event, { gameKey, targetLang }) => {
        const record = await libraryState.getGameRecord(gameKey);
        if (!record || !record.exePath) return { success: false, error: 'game-not-found' };
        translationService.queueDeepSync(gameKey, record.exePath, targetLang, record.name);
        return { success: true };
    });
    ipcMain.handle('translation:cancel-sync', async (_event, gameKey) => {
        translationService.cancelDeepSync(gameKey);
        return { success: true };
    });
    ipcMain.handle('translation:move-queue', async (_event, { gameKey, direction }) => {
        translationService.moveQueue(gameKey, direction);
        return { success: true };
    });
    ipcMain.on('reveal-game', async (_event, targetPath) => {
        const libraryPath = await libraryState.resolveLibraryFolderToOpen();
        if (libraryPath && isPathWithinLibrary(targetPath, libraryPath)) {
            shell.showItemInFolder(targetPath);
        } else {
            console.warn(`[SECURITY] Blocked unauthorized reveal-game path: ${targetPath}`);
        }
    });
    ipcMain.on('open-path', async (_event, targetPath) => {
        const libraryPath = await libraryState.resolveLibraryFolderToOpen();
        if (libraryPath && isPathWithinLibrary(targetPath, libraryPath)) {
            shell.openPath(targetPath);
        } else {
            console.warn(`[SECURITY] Blocked unauthorized open-path: ${targetPath}`);
        }
    });
    ipcMain.handle('delete-game', async (_event, targetPath) => {
        const libraryPath = await libraryState.resolveLibraryFolderToOpen();
        if (libraryPath && isPathWithinLibrary(targetPath, libraryPath)) {
            return shell.trashItem(targetPath);
        }
        return { ok: false, error: 'unauthorized-path' };
    });

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

    ipcMain.handle('save-editor:load-translations', async (_event, lang) => {
        console.log(`[IPC] save-editor:load-translations for lang: ${lang}`);
        return saveEditorService.loadTranslations(lang);
    });

    ipcMain.handle('save-editor:save-translations', async (_event, { lang, translations }) => {
        console.log(`[IPC] save-editor:save-translations for lang: ${lang} (${Object.keys(translations || {}).length} keys)`);
        return saveEditorService.saveTranslations(lang, translations);
    });

    ipcMain.on('open-save-editor-window', (_event, gameKey) => {
        const saveEditorWin = new BrowserWindow({
            width: 1000,
            height: 700,
            backgroundColor: '#121212',
            autoHideMenuBar: true,
            icon: paths ? paths.mainWindowIconPath : undefined,
            webPreferences: {
                preload: paths ? paths.preloadPath : undefined,
                contextIsolation: true,
                nodeIntegration: false
            }
        });
        saveEditorWin.removeMenu();
        saveEditorWin.setMenuBarVisibility(false);
        
        saveEditorWin.webContents.on('console-message', (_event, _level, message) => {
            console.log(`[STANDALONE-EDITOR-LOG] ${message}`);
        });

        if (paths) {
            if (process.env.VITE_DEV_SERVER_URL) {
                saveEditorWin.loadURL(`${process.env.VITE_DEV_SERVER_URL}?mode=save-editor&gameKey=${encodeURIComponent(gameKey)}`);
            } else {
                saveEditorWin.loadFile(paths.indexHtmlPath, {
                    search: `mode=save-editor&gameKey=${encodeURIComponent(gameKey)}`
                });
            }
        }
    });

    ipcMain.handle('is-dev', () => !app.isPackaged);

    let devAutoLaunchState = 'off';

    try {
        if (paths && paths.dbFile && fsSync.existsSync(paths.dbFile)) {
            const db = JSON.parse(fsSync.readFileSync(paths.dbFile, 'utf8'));
            if (db && db.config) {
                const configVal = db.config.autoLaunch;
                const value = (configVal === 'minimized') ? 'minimized' : (configVal === 'on' || configVal === 'true' || configVal === true ? 'on' : 'off');
                
                const openAtLogin = (value === 'on' || value === 'minimized');
                const args = (value === 'minimized') ? ['--minimized'] : [];
                
                if (app.isPackaged) {
                    app.setLoginItemSettings({
                        openAtLogin: openAtLogin,
                        path: app.getPath('exe'),
                        args: args
                    });
                    console.log(`[AUTO-LAUNCH][STARTUP] Synced OS startup settings: openAtLogin=${openAtLogin}, args=${JSON.stringify(args)}`);
                } else {
                    devAutoLaunchState = value;
                    console.log(`[AUTO-LAUNCH][DEV][STARTUP] Synced devAutoLaunchState: ${devAutoLaunchState}`);
                }
            }
        }
    } catch (e) {
        console.error('[AUTO-LAUNCH][STARTUP] Failed to sync autoLaunch on startup:', e);
    }

    ipcMain.handle('set-auto-launch', async (_event, value) => {
        try {
            const openAtLogin = (value === 'on' || value === 'minimized' || value === true);
            const args = (value === 'minimized') ? ['--minimized'] : [];
            if (app.isPackaged) {
                app.setLoginItemSettings({
                    openAtLogin: openAtLogin,
                    path: app.getPath('exe'),
                    args: args
                });
            } else {
                devAutoLaunchState = (value === 'minimized') ? 'minimized' : (openAtLogin ? 'on' : 'off');
                console.log(`[AUTO-LAUNCH][DEV] Skipped OS startup registration (openAtLogin: ${openAtLogin}, args: ${JSON.stringify(args)})`);
            }
            return { success: true };
        } catch (error: any) {
            console.error('[AUTO-LAUNCH] Failed to set startup settings:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('get-auto-launch', async () => {
        try {
            if (!app.isPackaged) {
                return devAutoLaunchState;
            }
            const settings = app.getLoginItemSettings() as any;
            if (!settings.openAtLogin) return 'off';
            if (settings.args && settings.args.includes('--minimized')) {
                return 'minimized';
            }
            return 'on';
        } catch {
            return 'off';
        }
    });
}

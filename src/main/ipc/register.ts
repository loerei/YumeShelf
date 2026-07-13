import { App, IpcMain, Shell, BrowserWindow } from 'electron';
import * as fsSync from 'node:fs';
import * as path from 'node:path';
import { TelemetryShipper } from '../telemetry/shipper';
import { IpcInvokes, IpcSends } from '../../shared/types/ipc';

async function getSafePathWithinLibrary(targetPath: string, libraryState: any): Promise<string | null> {
    const resolvedPath = path.resolve(targetPath);
    if (resolvedPath.includes('..') || !path.isAbsolute(resolvedPath)) return null;
    const config = await libraryState.resolveLibraryConfig();
    if (config?.libraryPaths) {
        const libraryPaths = Array.isArray(config.libraryPaths) ? config.libraryPaths : [config.libraryPaths];
        for (const libPath of libraryPaths) {
            const resolvedLib = path.resolve(libPath);
            const relative = path.relative(resolvedLib, resolvedPath);
            if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
                return path.join(resolvedLib, relative);
            }
        }
    }
    return null;
}

export class TypedIpcRouter {
    constructor(private readonly ipcMain: IpcMain) {}

    handle<K extends keyof IpcInvokes>(
        channel: K,
        handler: (event: any, ...args: IpcInvokes[K]['args']) => Promise<IpcInvokes[K]['return']> | IpcInvokes[K]['return']
    ): void {
        this.ipcMain.handle(channel, handler as any);
    }

    on<K extends keyof IpcSends>(
        channel: K,
        handler: (event: any, ...args: IpcSends[K]) => void
    ): void {
        this.ipcMain.on(channel, handler as any);
    }
}

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
    const router = new TypedIpcRouter(ipcMain);

    router.handle('get-app-version', async () => app.getVersion());
    router.handle('get-language-state', async () => languagePackServices.buildLanguageState());
    router.handle('bootstrap-app', async (event, options = {}) => startupServices.bootstrapAppState(event.sender, options));
    router.handle('log-app-update-debug', async (_event, message) => {
        if (typeof appUpdateServices.logDebug === 'function') {
            await appUpdateServices.logDebug(String(message || ''));
        }
        return { ok: true };
    });

    router.handle('start-app-update-download', async () => appUpdateServices.startBackgroundDownload());
    router.handle('restart-and-install-app-update', async () => appUpdateServices.restartAndInstallDownloadedUpdate());
    router.handle('schedule-app-update-next-launch', async () => appUpdateServices.scheduleInstallOnNextLaunch());
    router.handle('begin-deferred-app-update-install', async () => appUpdateServices.beginDeferredInstallOnLaunch());
    router.handle('open-app-update-download-page', async () => appUpdateServices.openAppUpdateDownloadPage());
    router.handle('open-external-url', async (_event, url) => {
        const normalizedUrl = String(url || '').trim();
        if (!/^https?:\/\//i.test(normalizedUrl)) {
            return { ok: false, reason: 'invalid-url' };
        }
        await shell.openExternal(normalizedUrl);
        return { ok: true };
    });
    router.handle('get-language-pack-manifest', async () => {
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
    router.handle('install-language-pack', async (_event, code) => languagePackServices.installLanguagePack(code));

    router.handle('check-config', async () => startupServices.resolveLibraryConfig());
    router.handle('get-default-path', () => defaultGamesDir);
    router.handle('setup-library', async (_event, type) => libraryState.setupLibrary(type));
    router.handle('update-library-config', async (_event, updates = {}) => {
        const result = await libraryState.updateLibraryConfig(updates);
        if (updates && 'telemetryEnabled' in updates) {
            await TelemetryShipper.getInstance().setTelemetryEnabled(updates.telemetryEnabled);
        }
        return result;
    });
    router.handle('get-games', async () => {
        await playtimeSessionManager.refreshSessions({ recover: true, emit: false });
        const games = await startupServices.loadGamesForConfig(await startupServices.resolveLibraryConfig());
        return playtimeSessionManager.overlayGames(games).map((game: any) => {
            const { iconData, ...rest } = game;
            return rest;
        });
    });
    router.handle('get-category-tree', async () => categoryState.getCategoryTree());
    router.handle('create-category', async (_event, payload = {}) => categoryState.createCategory(payload));
    router.handle('rename-category', async (_event, { categoryId, name }) => categoryState.renameCategory(categoryId, name));
    router.handle('delete-category', async (_event, categoryId) => categoryState.deleteCategory(categoryId));
    router.handle('assign-game-categories', async (_event, { gameId, categoryIds }) => categoryState.assignGameCategories(gameId, categoryIds));
    router.handle('remove-game-category', async (_event, { gameId, categoryId }) => categoryState.removeGameFromCategory(gameId, categoryId));
    router.on('launch-yume', async (_event, { gameKey, exePath, runInBackground }) => {
        try {
            const record = await libraryState.getGameRecord(gameKey);
            if (record?.autoTranslate) {
                await translationService.prepareTranslator(gameKey, exePath);
            } else {
                await translationService.removeTranslator(exePath);
            }
            await playtimeSessionManager.launchTrackedGame(gameKey, exePath, runInBackground);
        } catch (error) {
            console.error(`[PLAYTIME][SESSIONS] failed to launch tracked game ${gameKey}:`, error);
        }
    });

    router.on('open-folder', async () => {
        const libraryPath = await libraryState.resolveLibraryFolderToOpen();
        if (libraryPath) {
            shell.openPath(libraryPath);
        }
    });
    router.handle('rename-game', async (_event, { gameKey, newName }) => libraryState.renameGame(gameKey, newName));
    router.handle('toggle-favorite', async (_event, gameKey, favorite) => libraryState.toggleFavorite(gameKey, favorite));
    router.handle('toggle-run-in-background', async (_event, gameKey) => libraryState.toggleRunInBackground(gameKey));
    router.handle('toggle-auto-translate', async (_event, gameKey) => libraryState.toggleAutoTranslate(gameKey));
    router.handle('translation:check-support', async (_event, gameKey) => {
        const record = await libraryState.getGameRecord(gameKey);
        if (!record?.exePath) return { supported: false, engine: null };
        const engine = await translationService.detectEngineSupport(record.exePath);
        return { supported: !!engine, engine };
    });
    router.handle('translation:start-sync', async (_event, { gameKey, targetLang }) => {
        const record = await libraryState.getGameRecord(gameKey);
        if (!record?.exePath) return { success: false, error: 'game-not-found' };
        translationService.queueDeepSync(gameKey, record.exePath, targetLang, record.name);
        return { success: true };
    });
    router.handle('translation:cancel-sync', async (_event, gameKey) => {
        translationService.cancelDeepSync(gameKey);
        return { success: true };
    });
    router.handle('translation:move-queue', async (_event, { gameKey, direction }) => {
        translationService.moveQueue(gameKey, direction);
        return { success: true };
    });
    router.on('reveal-game', async (_event, targetPath) => {
        const safePath = await getSafePathWithinLibrary(targetPath, libraryState);
        if (safePath) {
            shell.showItemInFolder(safePath);
        } else {
            console.warn(`[SECURITY] Blocked unauthorized reveal-game path: ${targetPath}`);
        }
    });
    router.on('open-path', async (_event, targetPath) => {
        const safePath = await getSafePathWithinLibrary(targetPath, libraryState);
        if (safePath) {
            shell.openPath(safePath);
        } else {
            console.warn(`[SECURITY] Blocked unauthorized open-path: ${targetPath}`);
        }
    });
    router.handle('delete-game', async (_event, targetPath) => {
        console.log('[MAIN][DELETE-GAME] targetPath received:', targetPath);
        const safePath = await getSafePathWithinLibrary(targetPath, libraryState);
        console.log('[MAIN][DELETE-GAME] resolved safePath:', safePath);
        if (safePath) {
            try {
                await shell.trashItem(safePath);
                return { ok: true };
            } catch (err) {
                console.error('[MAIN][DELETE-GAME] shell.trashItem error:', err);
                throw err;
            }
        }
        console.log('[MAIN][DELETE-GAME] safePath check failed');
        return { ok: false, error: 'unauthorized-path' };
    });
    router.handle('library:add-path', async () => libraryState.addLibraryPath());
    router.handle('library:remove-path', async (_event, targetPath) => libraryState.removeLibraryPath(targetPath));
    router.handle('library:change-path', async (_event, oldPath) => libraryState.changeLibraryPath(oldPath));

    router.handle('get-save-folder', async (_event, gameKey) => {
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
    router.handle('set-save-folder-override', async (_event, { gameKey, folderPath }) => {
        return libraryState.setSaveFolderOverride(gameKey, folderPath);
    });

    // Save Editor
    router.handle('save-editor:list-files', async (_event, gameKey) => {
        console.log(`[IPC] save-editor:list-files gameKey: ${gameKey}`);
        return saveEditorService.listSaveFiles(gameKey);
    });
    router.handle('save-editor:load-data', async (_event, { gameKey, fileName }) => {
        console.log(`[IPC] save-editor:load-data gameKey: ${gameKey}, fileName: ${fileName}`);
        return saveEditorService.loadSaveData(gameKey, fileName);
    });
    router.handle('save-editor:write-data', async (_event, { gameKey, fileName, data }) => {
        console.log(`[IPC] save-editor:write-data gameKey: ${gameKey}, fileName: ${fileName}`);
        return saveEditorService.writeSaveData(gameKey, fileName, data);
    });
    router.handle('save-editor:update-mapping', async (_event, { gameKey, name, offset, dataType }) => {
        console.log(`[IPC] save-editor:update-mapping gameKey: ${gameKey}`);
        return saveEditorService.updateMapping(gameKey, name, offset, dataType);
    });

    router.handle('save-editor:load-translations', async (_event, lang) => {
        console.log(`[IPC] save-editor:load-translations for lang: ${lang}`);
        return saveEditorService.loadTranslations(lang);
    });

    router.handle('save-editor:save-translations', async (_event, { lang, translations }) => {
        console.log(`[IPC] save-editor:save-translations for lang: ${lang} (${Object.keys(translations || {}).length} keys)`);
        return saveEditorService.saveTranslations(lang, translations);
    });

    router.on('open-save-editor-window', (_event, gameKey) => {
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

    router.handle('is-dev', () => !app.isPackaged);

    registerAutoLaunchHandlers(router, app, paths);
}

function getAutoLaunchConfigValue(paths: any): any {
    try {
        if (paths?.dbFile && fsSync.existsSync(paths.dbFile)) {
            const db = JSON.parse(fsSync.readFileSync(paths.dbFile, 'utf8'));
            return db?.config?.autoLaunch;
        }
    } catch (e) {
        console.error('[AUTO-LAUNCH][STARTUP] Failed to read db config:', e);
    }
    return undefined;
}

function syncAutoLaunchOnStartup(app: App, paths: any): string {
    let devAutoLaunchState = 'off';
    const configVal = getAutoLaunchConfigValue(paths);
    if (configVal === undefined) return devAutoLaunchState;

    let value = 'off';
    if (configVal === 'minimized') {
        value = 'minimized';
    } else if (configVal === 'on' || configVal === 'true' || configVal === true) {
        value = 'on';
    }

    const openAtLogin = (value === 'on' || value === 'minimized');
    const args = (value === 'minimized') ? ['--minimized'] : [];

    if (app.isPackaged) {
        try {
            app.setLoginItemSettings({ openAtLogin, path: app.getPath('exe'), args });
            console.log(`[AUTO-LAUNCH][STARTUP] Synced OS startup settings: openAtLogin=${openAtLogin}, args=${JSON.stringify(args)}`);
        } catch (e) {
            console.error('[AUTO-LAUNCH][STARTUP] Failed to sync OS settings:', e);
        }
    } else {
        devAutoLaunchState = value;
        console.log(`[AUTO-LAUNCH][DEV][STARTUP] Synced devAutoLaunchState: ${devAutoLaunchState}`);
    }
    return devAutoLaunchState;
}

function registerAutoLaunchHandlers(
    router: TypedIpcRouter,
    app: App,
    paths: any
): void {
    let devAutoLaunchState = syncAutoLaunchOnStartup(app, paths);

    router.handle('set-auto-launch', async (_event, value) => {
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
                if (value === 'minimized') {
                    devAutoLaunchState = 'minimized';
                } else if (openAtLogin) {
                    devAutoLaunchState = 'on';
                } else {
                    devAutoLaunchState = 'off';
                }
                console.log(`[AUTO-LAUNCH][DEV] Skipped OS startup registration (openAtLogin: ${openAtLogin}, args: ${JSON.stringify(args)})`);
            }
            return { success: true };
        } catch (error: any) {
            console.error('[AUTO-LAUNCH] Failed to set startup settings:', error);
            return { success: false, error: error.message };
        }
    });

    router.handle('get-auto-launch', async () => {
        try {
            if (!app.isPackaged) {
                return devAutoLaunchState;
            }
            const settings = app.getLoginItemSettings() as any;
            if (!settings.openAtLogin) return 'off';
            if (settings.args?.includes('--minimized')) {
                return 'minimized';
            }
            return 'on';
        } catch {
            return 'off';
        }
    });
}

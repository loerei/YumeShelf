import path from 'path';
import { BrowserWindow as electronBrowserWindow, dialog as electronDialog, shell as electronShell } from 'electron';
import { RegisterIpcOptions } from '../types';

export class SaveEditorIpcController {
    constructor(private readonly options: RegisterIpcOptions) {}

    public registerHandlers(): void {
        const { ipcMain, libraryState, saveFolderResolver, saveEditorService, paths } = this.options;
        if (!ipcMain) return;

        ipcMain.handle('get-save-folder', async (_event, gameKey) => {
            console.log(`[IPC][get-save-folder] Received request for: ${gameKey}`);
            const record = await libraryState?.getGameRecord(gameKey);
            if (!record) {
                console.warn(`[IPC][get-save-folder] Could not resolve record for key: ${gameKey}`);
                return { path: null, engine: null, confidence: 'none' };
            }
            if (!record.exePath) {
                console.warn(`[IPC][get-save-folder] Record found but has no exePath: ${record.name}`);
                return { path: null, engine: null, confidence: 'none' };
            }
            console.log(`[IPC][get-save-folder] Resolved to record: ${record.name} (${record.exePath})`);
            return saveFolderResolver?.resolveSaveFolder(record.exePath, record.saveFolderOverride);
        });

        ipcMain.handle('save-editor:select-directory', async (_event) => {
            const dialog = this.options.dialog || electronDialog;
            if (!dialog?.showOpenDialog) {
                return { canceled: true, folderPath: null };
            }
            try {
                const BrowserWindowConstructor = this.options.browserWindow || electronBrowserWindow;
                const win = typeof BrowserWindowConstructor?.fromWebContents === 'function'
                    ? (BrowserWindowConstructor.fromWebContents(_event?.sender) || BrowserWindowConstructor.getFocusedWindow?.() || null)
                    : null;
                const result = win
                    ? await dialog.showOpenDialog(win, {
                        properties: ['openDirectory'],
                        title: 'Select Save Folder',
                    })
                    : await dialog.showOpenDialog({
                        properties: ['openDirectory'],
                        title: 'Select Save Folder',
                    });
                return {
                    canceled: Boolean(result?.canceled || !result?.filePaths?.length),
                    folderPath: result?.filePaths?.[0] || null,
                };
            } catch (err) {
                console.warn('[IPC][save-editor:select-directory] Dialog open failed:', err);
                return { canceled: true, folderPath: null };
            }
        });

        ipcMain.handle('save-folder:open', async (_event, gameKey) => {
            try {
                const validGameKey = typeof gameKey === 'string' ? gameKey.trim() : null;
                if (!validGameKey || ['__proto__', 'constructor', 'prototype'].includes(validGameKey)) {
                    return { ok: false, error: 'invalid-payload' };
                }
                const shell = this.options.shell || electronShell;
                if (!shell?.openPath) return { ok: false, error: 'no-shell' };
                const record = await libraryState?.getGameRecord(validGameKey);
                if (!record?.exePath) return { ok: false, error: 'no-record' };
                const resolved = await saveFolderResolver?.resolveSaveFolder(record.exePath, record.saveFolderOverride);
                if (resolved?.path && !resolved.overrideMissing) {
                    const normalizedPath = path.normalize(resolved.path);
                    const openError = await shell.openPath(normalizedPath);
                    if (openError) {
                        return { ok: false, error: openError };
                    }
                    return { ok: true, path: normalizedPath };
                }
                return { ok: false, error: resolved?.overrideMissing ? 'override-missing' : 'not-found' };
            } catch (err: any) {
                console.warn('[IPC][save-folder:open] Error opening save folder:', err);
                return { ok: false, error: err?.message || 'failed' };
            }
        });

        const handleSetSaveFolderOverride = async (_event: any, payload: any) => {
            try {
                const gameKey = typeof payload?.gameKey === 'string' ? payload.gameKey.trim() : null;
                if (!gameKey || ['__proto__', 'constructor', 'prototype'].includes(gameKey)) {
                    return { ok: false, error: 'invalid-payload' };
                }
                if (typeof payload?.folderPath !== 'string') {
                    return { ok: false, error: 'invalid-payload' };
                }
                let folderPath = payload.folderPath.trim().replace(/\0|%00/g, '');
                if (folderPath) {
                    const isUnc = /^(\\\\|\/\/|\\\/|\/\\)/.test(folderPath) || (path.win32.isAbsolute(folderPath) && folderPath.startsWith('\\\\'));
                    const isAbsolute = path.isAbsolute(folderPath) || path.win32.isAbsolute(folderPath) || path.posix.isAbsolute(folderPath) || /^[a-zA-Z]:[\\/]/.test(folderPath);
                    if (isUnc || !isAbsolute) {
                        return { ok: false, error: 'invalid-payload' };
                    }
                    if (/^[a-zA-Z]:[\\/]/.test(folderPath)) {
                        folderPath = path.win32.normalize(folderPath);
                    } else {
                        folderPath = path.resolve(folderPath);
                    }
                }
                const result = await libraryState?.setSaveFolderOverride(gameKey, folderPath);
                if (!result || !result.ok) {
                    return { ok: false, error: 'game-not-found' };
                }
                return { ok: true, saveFolderOverride: folderPath || null };
            } catch (err: any) {
                console.warn('[IPC][set-save-folder-override] Error setting override:', err);
                return { ok: false, error: err?.message || 'failed' };
            }
        };

        ipcMain.handle('set-save-folder-override', handleSetSaveFolderOverride);
        ipcMain.handle('save-editor:set-save-folder-override', handleSetSaveFolderOverride);

        ipcMain.handle('save-editor:list-files', async (_event, gameKey) => {
            console.log(`[IPC] save-editor:list-files gameKey: ${gameKey}`);
            return saveEditorService?.listSaveFiles(gameKey);
        });

        const activeLoads = new Map<string, Set<() => void>>();

        ipcMain.handle('save-editor:load-data', async (event, { gameKey, fileName, earlyExit, stalenessTimeoutMs }) => {
            console.log(`[IPC] save-editor:load-data gameKey: ${gameKey}, fileName: ${fileName}`);
            const key = `${gameKey}:${fileName}`;
            let cancelled = false;
            const cancelFn = () => {
                cancelled = true;
            };
            let loadSet = activeLoads.get(key);
            if (!loadSet) {
                loadSet = new Set();
                activeLoads.set(key, loadSet);
            }
            loadSet.add(cancelFn);

            try {
                return await saveEditorService?.loadSaveData(gameKey, fileName, {
                    earlyExit: earlyExit !== undefined ? Boolean(earlyExit) : true,
                    stalenessTimeoutMs: stalenessTimeoutMs !== undefined ? Number(stalenessTimeoutMs) : 10000,
                    onProgress: (prog: { current?: number; total?: number; percent?: number; unit?: string; pos?: number; totalBytes?: number; iterations?: number }) => {
                        if (!event.sender.isDestroyed()) {
                            const current = prog.current ?? prog.pos ?? 0;
                            const total = prog.total ?? prog.totalBytes ?? 0;
                            const percent = prog.percent ?? (total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0);
                            const unit = prog.unit ?? 'bytes';
                            event.sender.send('save-editor:load-progress', {
                                gameKey,
                                fileName,
                                current,
                                total,
                                percent,
                                unit,
                                pos: current,
                                totalBytes: total,
                            });
                        }
                    },
                    shouldCancel: () => cancelled,
                });
            } finally {
                const currentSet = activeLoads.get(key);
                if (currentSet) {
                    currentSet.delete(cancelFn);
                    if (currentSet.size === 0) {
                        activeLoads.delete(key);
                    }
                }
            }
        });

        ipcMain.handle('save-editor:cancel-load', async (_event, { gameKey, fileName }) => {
            console.log(`[IPC] save-editor:cancel-load gameKey: ${gameKey}, fileName: ${fileName}`);
            const key = `${gameKey}:${fileName}`;
            const cancelFns = activeLoads.get(key);
            if (cancelFns && cancelFns.size > 0) {
                for (const fn of cancelFns) {
                    fn();
                }
                activeLoads.delete(key);
                return { cancelled: true };
            }
            return { cancelled: false };
        });

        ipcMain.handle('save-editor:write-data', async (_event, { gameKey, fileName, data }) => {
            console.log(`[IPC] save-editor:write-data gameKey: ${gameKey}, fileName: ${fileName}`);
            return saveEditorService?.writeSaveData(gameKey, fileName, data);
        });

        ipcMain.handle('save-editor:rename-file', async (_event, { gameKey, oldFileName, newFileName, overwrite }) => {
            console.log(`[IPC] save-editor:rename-file gameKey: ${gameKey}, oldFileName: ${oldFileName}, newFileName: ${newFileName}, overwrite: ${overwrite}`);
            return saveEditorService?.renameSaveFile(gameKey, oldFileName, newFileName, overwrite);
        });

        ipcMain.handle('save-editor:delete-file', async (_event, { gameKey, fileName }) => {
            console.log(`[IPC] save-editor:delete-file gameKey: ${gameKey}, fileName: ${fileName}`);
            return saveEditorService?.deleteSaveFile(gameKey, fileName);
        });

        ipcMain.handle('save-editor:update-mapping', async (_event, { gameKey, name, offset, dataType }) => {
            console.log(`[IPC] save-editor:update-mapping gameKey: ${gameKey}`);
            return saveEditorService?.updateMapping(gameKey, name, offset, dataType);
        });

        ipcMain.handle('save-editor:load-translations', async (_event, lang) => {
            console.log(`[IPC] save-editor:load-translations for lang: ${lang}`);
            return saveEditorService?.loadTranslations(lang);
        });

        ipcMain.handle('save-editor:save-translations', async (_event, { lang, translations }) => {
            console.log(`[IPC] save-editor:save-translations for lang: ${lang} (${Object.keys(translations || {}).length} keys)`);
            return saveEditorService?.saveTranslations(lang, translations);
        });

        ipcMain.on('open-save-editor-window', (_event, gameKey) => {
            const BrowserWindowConstructor = this.options.browserWindow || electronBrowserWindow;
            if (typeof BrowserWindowConstructor !== 'function') {
                console.warn('[IPC][open-save-editor-window] BrowserWindowConstructor is not available in headless runtime');
                return;
            }
            const saveEditorWin = new BrowserWindowConstructor({
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
            saveEditorWin.removeMenu?.();
            saveEditorWin.setMenuBarVisibility?.(false);

            saveEditorWin.webContents?.on('console-message', (_event, _level, message) => {
                console.log(`[STANDALONE-EDITOR-LOG] ${message}`);
            });

            if (paths) {
                if (process.env.VITE_DEV_SERVER_URL) {
                    saveEditorWin.loadURL?.(`${process.env.VITE_DEV_SERVER_URL}?mode=save-editor&gameKey=${encodeURIComponent(gameKey)}`);
                } else {
                    saveEditorWin.loadFile?.(paths.indexHtmlPath, {
                        search: `mode=save-editor&gameKey=${encodeURIComponent(gameKey)}`
                    });
                }
            }
        });
    }
}

import { BrowserWindow } from 'electron';
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

        ipcMain.handle('set-save-folder-override', async (_event, { gameKey, folderPath }) => {
            return libraryState?.setSaveFolderOverride(gameKey, folderPath);
        });

        ipcMain.handle('save-editor:list-files', async (_event, gameKey) => {
            console.log(`[IPC] save-editor:list-files gameKey: ${gameKey}`);
            return saveEditorService?.listSaveFiles(gameKey);
        });

        const activeLoads = new Map<string, () => void>();

        ipcMain.handle('save-editor:load-data', async (event, { gameKey, fileName, earlyExit, stalenessTimeoutMs }) => {
            console.log(`[IPC] save-editor:load-data gameKey: ${gameKey}, fileName: ${fileName}`);
            const key = `${gameKey}:${fileName}`;
            let cancelled = false;
            activeLoads.set(key, () => {
                cancelled = true;
            });

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
                activeLoads.delete(key);
            }
        });

        ipcMain.handle('save-editor:cancel-load', async (_event, { gameKey, fileName }) => {
            console.log(`[IPC] save-editor:cancel-load gameKey: ${gameKey}, fileName: ${fileName}`);
            const key = `${gameKey}:${fileName}`;
            const cancelFn = activeLoads.get(key);
            if (cancelFn) {
                cancelFn();
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
    }
}

import path from 'path';
import { fileURLToPath } from 'node:url';
import { BrowserWindow, BrowserWindow as electronBrowserWindow, dialog as electronDialog, shell as electronShell } from 'electron';
import { RegisterIpcOptions } from '../types';
import { CircularRingBuffer } from '../../../shared/ring-buffer';
import { sanitizeUserPaths } from '../../../shared/path-sanitizer';

export class SaveEditorIpcController {
    private readonly openWindows = new Map<string, BrowserWindow>();
    private readonly logBuffer: CircularRingBuffer<string>;
    private isQuitting = false;
    private beforeQuitBound = false;

    constructor(private readonly options: RegisterIpcOptions) {
        const rawCapacity = this.options.diagnosticBufferCapacity;
        const capacity =
            typeof rawCapacity === 'number' && Number.isInteger(rawCapacity) && rawCapacity > 0
                ? rawCapacity
                : 500;
        this.logBuffer = new CircularRingBuffer<string>(capacity);
    }

    public getLogBuffer(_gameKey?: string): CircularRingBuffer<string> {
        return this.logBuffer;
    }

    public getLogEntries(gameKey?: string): string[] {
        const entries = this.logBuffer.toArray();
        const targetKey = gameKey ? sanitizeUserPaths(gameKey) : undefined;
        return targetKey ? entries.filter((e) => e.includes(`[${targetKey}]`)) : entries;
    }

    public registerHandlers(): void {
        const { ipcMain, libraryState, saveFolderResolver, saveEditorService } = this.options;
        if (!ipcMain) return;

        this.isQuitting = false;
        if (!this.beforeQuitBound && typeof this.options.app?.on === 'function') {
            this.options.app.on('before-quit', () => {
                this.isQuitting = true;
            });
            this.beforeQuitBound = true;
        }

        ipcMain.handle('get-save-folder', async (_event, gameKey) => {
            console.log(`[IPC][get-save-folder] Received request for: ${sanitizeUserPaths(gameKey)}`);
            const record = await libraryState?.getGameRecord(gameKey);
            if (!record) {
                console.warn(`[IPC][get-save-folder] Could not resolve record for key: ${sanitizeUserPaths(gameKey)}`);
                return { path: null, engine: null, confidence: 'none' };
            }
            if (!record.exePath) {
                console.warn(`[IPC][get-save-folder] Record found but has no exePath: ${sanitizeUserPaths(record.name)}`);
                return { path: null, engine: null, confidence: 'none' };
            }
            console.log(`[IPC][get-save-folder] Resolved to record: ${sanitizeUserPaths(record.name)} (${sanitizeUserPaths(record.exePath)})`);
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

const ALLOWED_SAVE_OPTIONS = new Set([
    'outerKey',
    'outerIv',
    'innerKey',
    'innerIv',
    'rawPlaintextFields',
    'earlyExit',
    'stalenessTimeoutMs'
]);

function sanitizeSaveOptions(rawOptions: any): Record<string, any> {
    const safeOptions = rawOptions && typeof rawOptions === 'object' && !Array.isArray(rawOptions) ? rawOptions : {};
    const sanitized: Record<string, any> = {};
    for (const key of Object.keys(safeOptions)) {
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
            continue;
        }
        if (ALLOWED_SAVE_OPTIONS.has(key)) {
            sanitized[key] = safeOptions[key];
        }
    }
    return sanitized;
}

        ipcMain.handle('save-editor:load-data', async (event, payload: any) => {
            const { gameKey, fileName, earlyExit, stalenessTimeoutMs, options } = payload || {};
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

            const sanitizedOptions = sanitizeSaveOptions(options);
            let resolvedEarlyExit = true;
            if (earlyExit !== undefined) {
                resolvedEarlyExit = Boolean(earlyExit);
            } else if (sanitizedOptions.earlyExit !== undefined) {
                resolvedEarlyExit = Boolean(sanitizedOptions.earlyExit);
            }

            let resolvedStalenessTimeoutMs = 10000;
            if (stalenessTimeoutMs !== undefined) {
                resolvedStalenessTimeoutMs = Number(stalenessTimeoutMs);
            } else if (sanitizedOptions.stalenessTimeoutMs !== undefined) {
                resolvedStalenessTimeoutMs = Number(sanitizedOptions.stalenessTimeoutMs);
            }

            const mergedOptions = {
                ...sanitizedOptions,
                earlyExit: resolvedEarlyExit,
                stalenessTimeoutMs: resolvedStalenessTimeoutMs,
                onProgress: (prog: { current?: number; total?: number; percent?: number; unit?: string; pos?: number; totalBytes?: number; iterations?: number }) => {
                    if (!event?.sender?.isDestroyed?.()) {
                        const current = prog.current ?? prog.pos ?? 0;
                        const total = prog.total ?? prog.totalBytes ?? 0;
                        const percent = prog.percent ?? (total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0);
                        const unit = prog.unit ?? 'bytes';
                        event?.sender?.send?.('save-editor:load-progress', {
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
            };

            try {
                return await saveEditorService?.loadSaveData(gameKey, fileName, mergedOptions);
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

        ipcMain.handle('save-editor:write-data', async (_event, payload: any) => {
            const { gameKey, fileName, data, options } = payload || {};
            console.log(`[IPC] save-editor:write-data gameKey: ${gameKey}, fileName: ${fileName}`);
            const sanitizedOptions = sanitizeSaveOptions(options);
            return saveEditorService?.writeSaveData(gameKey, fileName, data, sanitizedOptions);
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

        ipcMain.on('save-editor:open-window', (_event, gameKey) => {
            this.openSaveEditorWindow(gameKey);
        });
    }

    private openSaveEditorWindow(gameKey: unknown): void {
        if (typeof gameKey !== 'string' || !gameKey.trim()) {
            console.warn(
                '[IPC][save-editor:open-window] Invalid gameKey received:',
                typeof gameKey === 'string' ? sanitizeUserPaths(gameKey) : typeof gameKey
            );
            return;
        }
        const normalizedGameKey = gameKey.trim();

        const existingWin = this.openWindows.get(normalizedGameKey);
        if (existingWin && !existingWin.isDestroyed()) {
            if (existingWin.isMinimized?.()) {
                existingWin.restore?.();
            }
            existingWin.focus?.();
            return;
        }

        const BrowserWindowConstructor = this.options.browserWindow || electronBrowserWindow;
        if (typeof BrowserWindowConstructor !== 'function') {
            console.warn('[IPC][save-editor:open-window] BrowserWindowConstructor is not available in headless runtime');
            return;
        }

        const { paths } = this.options;
        const shell = this.options.shell || electronShell;

        const saveEditorWin = new BrowserWindowConstructor({
            width: 1000,
            height: 700,
            backgroundColor: '#121212',
            autoHideMenuBar: true,
            icon: paths ? paths.mainWindowIconPath : undefined,
            webPreferences: {
                preload: paths ? paths.preloadPath : undefined,
                contextIsolation: true,
                nodeIntegration: false,
                sandbox: true
            }
        });

        this.openWindows.set(normalizedGameKey, saveEditorWin);

        saveEditorWin.on?.('closed', () => {
            if (this.openWindows.get(normalizedGameKey) === saveEditorWin) {
                this.openWindows.delete(normalizedGameKey);
            }
        });

        saveEditorWin.webContents?.on?.('render-process-gone', async (_event: any, details: any) => {
            const reason = details?.reason ?? 'unknown';
            const exitCode = details?.exitCode ?? -1;
            const sanitizedKey = sanitizeUserPaths(normalizedGameKey);
            const message = `Render process gone for gameKey "${sanitizedKey}": reason=${reason}, exitCode=${exitCode}`;
            console.error(`[save-editor] ${message}`);
            this.logBuffer.push(`[${new Date().toISOString()}][ERROR][${sanitizedKey}] ${message}`);
            if (this.openWindows.get(normalizedGameKey) === saveEditorWin) {
                this.openWindows.delete(normalizedGameKey);
            }
            try {
                if (!saveEditorWin.isDestroyed()) {
                    saveEditorWin.destroy();
                }
            } catch (destroyErr) {
                console.warn('[save-editor] Non-fatal error destroying window after render-process-gone:', {
                    gameKey: sanitizedKey,
                    error: sanitizeUserPaths(destroyErr instanceof Error ? destroyErr.message : destroyErr),
                    stack: destroyErr instanceof Error && destroyErr.stack ? sanitizeUserPaths(destroyErr.stack) : undefined,
                });
            }

            if (reason === 'clean-exit' || this.isQuitting) {
                return;
            }

            const dialog = this.options.dialog || electronDialog;
            if (typeof dialog?.showMessageBox === 'function') {
                try {
                    const res = await dialog.showMessageBox({
                        type: 'error',
                        title: 'Save Editor Crashed',
                        message: 'The Save Editor window terminated unexpectedly.',
                        detail: `Reason: ${reason} (Exit Code: ${exitCode})\n\nAny unsaved edits in that window could not be preserved.`,
                        buttons: ['Reopen Save Editor', 'Close'],
                        defaultId: 0,
                        cancelId: 1,
                        noLink: true,
                    });
                    if (this.isQuitting) {
                        return;
                    }
                    if (res?.response === 0) {
                        this.openSaveEditorWindow(normalizedGameKey);
                    }
                } catch (dialogErr) {
                    console.warn('[save-editor] Failed to display crash recovery dialog:', {
                        gameKey: sanitizedKey,
                        error: sanitizeUserPaths(dialogErr instanceof Error ? dialogErr.message : dialogErr),
                        stack: dialogErr instanceof Error && dialogErr.stack ? sanitizeUserPaths(dialogErr.stack) : undefined,
                    });
                }
            }
        });

        const devServerUrl = process.env.VITE_DEV_SERVER_URL;
        let appOrigin: string | null = null;
        if (devServerUrl) {
            try {
                appOrigin = new URL(devServerUrl).origin;
            } catch {
                appOrigin = null;
            }
        }

        saveEditorWin.webContents?.setWindowOpenHandler?.(({ url: targetUrl }) => {
            try {
                const parsed = new URL(targetUrl);
                if (['https:', 'http:'].includes(parsed.protocol)) {
                    void shell?.openExternal(parsed.href);
                }
            } catch (err) {
                const sanitizedError = sanitizeUserPaths(err instanceof Error ? (err.stack || err.message) : String(err));
                console.warn('[save-editor] Blocked malformed navigation URL:', sanitizeUserPaths(targetUrl), sanitizedError);
            }
            return { action: 'deny' };
        });

        saveEditorWin.webContents?.on?.('will-navigate', (event, navigationUrl) => {
            try {
                const parsed = new URL(navigationUrl);
                if (appOrigin && parsed.origin === appOrigin) {
                    return;
                }
                if (parsed.protocol === 'file:' && paths?.saveEditorHtmlPath) {
                    const rawTarget = path.normalize(fileURLToPath(parsed.href));
                    const rawAllowed = path.normalize(paths.saveEditorHtmlPath);
                    const rawAllowedDir = path.dirname(rawAllowed);

                    const targetPlatform = this.options?.platform ?? process.platform;
                    const isCaseInsensitive = targetPlatform === 'win32' || targetPlatform === 'darwin';
                    const targetPath = isCaseInsensitive ? rawTarget.toLowerCase() : rawTarget;
                    const allowedPath = isCaseInsensitive ? rawAllowed.toLowerCase() : rawAllowed;
                    const allowedDir = isCaseInsensitive ? rawAllowedDir.toLowerCase() : rawAllowedDir;

                    const boundary = allowedDir.endsWith(path.sep) ? allowedDir : `${allowedDir}${path.sep}`;
                    if (targetPath === allowedPath || targetPath.startsWith(boundary)) {
                        return;
                    }
                }
                event.preventDefault();
                if (['https:', 'http:'].includes(parsed.protocol)) {
                    void shell?.openExternal(parsed.href);
                } else {
                    console.warn('[save-editor] Blocked unauthorized navigation:', sanitizeUserPaths(navigationUrl));
                }
            } catch (err) {
                event.preventDefault();
                const sanitizedError = sanitizeUserPaths(err instanceof Error ? (err.stack || err.message) : String(err));
                console.warn('[save-editor] Blocked malformed navigation URL:', sanitizeUserPaths(navigationUrl), sanitizedError);
            }
        });

        saveEditorWin.removeMenu?.();
        saveEditorWin.setMenuBarVisibility?.(false);

        saveEditorWin.webContents?.on?.('console-message', (event, level, message) => {
            if (saveEditorWin.isDestroyed() || (event as any)?.sender?.isDestroyed?.()) return;
            const sanitized = sanitizeUserPaths(message);
            const sanitizedKey = sanitizeUserPaths(normalizedGameKey);
            const entry = `[${new Date().toISOString()}][level:${level}][${sanitizedKey}] ${sanitized}`;
            this.logBuffer.push(entry);
        });

        if (paths) {
            if (process.env.VITE_DEV_SERVER_URL) {
                saveEditorWin.loadURL?.(`${process.env.VITE_DEV_SERVER_URL}/save-editor.html?gameKey=${encodeURIComponent(normalizedGameKey)}`);
            } else {
                saveEditorWin.loadFile?.(paths.saveEditorHtmlPath, {
                    search: `gameKey=${encodeURIComponent(normalizedGameKey)}`
                });
            }
        }
    }
}

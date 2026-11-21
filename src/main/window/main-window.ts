import * as path from 'node:path';
import * as fsSync from 'node:fs';
import { fileURLToPath } from 'node:url';
import { BrowserWindow, Tray, Menu, ipcMain, session, shell, dialog } from 'electron';
import { sanitizeUserPaths } from '../../shared/path-sanitizer';

let tray: Tray | null = null;
let minimizeToTray = false;
let isQuitting = false;
let mainWindow: BrowserWindow | null = null;
let pathsConfig: any = null;
let electronApp: any = null;

export function _resetMainWindowStateForTesting(): void {
    isQuitting = false;
    minimizeToTray = false;
    tray = null;
    mainWindow = null;
    pathsConfig = null;
    electronApp = null;
}

function createTrayIcon(): void {
    if (tray) return;
    if (!pathsConfig?.mainWindowIconPath) return;

    try {
        tray = new Tray(pathsConfig.mainWindowIconPath);
        const contextMenu = Menu.buildFromTemplate([
            {
                label: 'Show YumeShelf',
                click: () => {
                    if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.show();
                        mainWindow.focus();
                    }
                }
            },
            { type: 'separator' },
            {
                label: 'Quit',
                click: () => {
                    isQuitting = true;
                    destroyTrayIcon();
                    if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.close();
                    } else if (electronApp) {
                        electronApp.quit();
                    }
                }
            }
        ]);
        tray.setToolTip('YumeShelf');
        tray.setContextMenu(contextMenu);

        tray.on('double-click', () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.show();
                mainWindow.focus();
            }
        });
    } catch (e) {
        console.error('[TRAY] Failed to initialize tray:', sanitizeUserPaths(e instanceof Error ? (e.stack || e.message) : e));
    }
}

function destroyTrayIcon(): void {
    if (tray) {
        try {
            tray.destroy();
        } catch (e) {
            console.error('[TRAY] Failed to destroy tray:', sanitizeUserPaths(e instanceof Error ? (e.stack || e.message) : e));
        }
        tray = null;
    }
}

function updateTrayState(): void {
    if (minimizeToTray) {
        if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
            createTrayIcon();
        } else {
            destroyTrayIcon();
        }
    } else {
        destroyTrayIcon();
    }
}

ipcMain.on('set-minimize-to-tray', (_event, enabled) => {
    minimizeToTray = !!enabled;
    updateTrayState();
});

export function startupPathSummary(app: any) {
    return {
        pid: process.pid,
        cwd: process.cwd(),
        isPackaged: app.isPackaged,
        appPath: app.getAppPath(),
        exe: app.getPath('exe'),
        userData: app.getPath('userData'),
        sessionData: app.getPath('sessionData'),
        cache: app.getPath('cache'),
        temp: app.getPath('temp'),
        appData: app.getPath('appData')
    };
}

export function probeWritableDir(dirPath: string) {
    const stamp = `${process.pid}-${Date.now()}`;
    const src = path.join(dirPath, `codex-probe-${stamp}.tmp`);
    const dst = path.join(dirPath, `codex-probe-${stamp}.moved.tmp`);
    try {
        fsSync.mkdirSync(dirPath, { recursive: true });
        fsSync.writeFileSync(src, 'ok');
        fsSync.renameSync(src, dst);
        fsSync.unlinkSync(dst);
        return { ok: true };
    } catch (err) {
        return { ok: false, error: String((err as any)?.stack || err) };
    }
}

export function logStartupDiagnostics(app: any): void {
    const summary = startupPathSummary(app);
    const sanitizedSummary = Object.fromEntries(
        Object.entries(summary).map(([key, val]) => [key, sanitizeUserPaths(val)])
    );
    console.log(`[MAIN][STARTUP] path summary=${JSON.stringify(sanitizedSummary)}`);

    const dirsToProbe: [string, string][] = [
        ['userData', summary.userData],
        ['sessionData', summary.sessionData],
        ['cache', summary.cache]
    ];

    for (const [label, dirPath] of dirsToProbe) {
        const exists = fsSync.existsSync(dirPath);
        const probe = probeWritableDir(dirPath);
        const sanitizedProbe = probe.ok
            ? probe
            : { ok: false, error: sanitizeUserPaths(probe.error) };
        console.log(`[MAIN][STARTUP] dir probe ${label} exists=${exists} result=${JSON.stringify(sanitizedProbe)} path=${sanitizeUserPaths(dirPath)}`);
    }
}

export interface CreateMainWindowOptions {
    app: any;
    paths: any;
    launchedAfterUpdate: boolean;
    platform?: NodeJS.Platform;
}

export function createMainWindow({
    app,
    paths,
    launchedAfterUpdate,
    platform
}: CreateMainWindowOptions): BrowserWindow {
    isQuitting = false;
    minimizeToTray = false;
    tray = null;

    // Read initial DB config for minimizeToTray
    try {
        if (paths?.dbFile && fsSync.existsSync(paths.dbFile)) {
            const db = JSON.parse(fsSync.readFileSync(paths.dbFile, 'utf8'));
            if (typeof db?.config?.minimizeToTray === 'boolean') {
                minimizeToTray = db.config.minimizeToTray;
            }
        }
    } catch (e) {
        console.error('[TRAY] Failed to read initial minimizeToTray config:', sanitizeUserPaths(e instanceof Error ? (e.stack || e.message) : e));
    }

    const startMinimized = process.argv.includes('--minimized');
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        backgroundColor: '#121212',
        autoHideMenuBar: true,
        icon: paths.mainWindowIconPath,
        show: !startMinimized,
        webPreferences: {
            preload: paths.preloadPath,
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true
        }
    });

    win.removeMenu();
    win.setMenuBarVisibility(false);

    // Dynamic Content Security Policy (SEC-06)
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        callback({
            responseHeaders: {
                ...details.responseHeaders,
                'Content-Security-Policy': [
                    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'"
                ]
            }
        });
    });
    win.on('page-title-updated', (event) => {
        if (!app.isPackaged) {
            event.preventDefault();
            win.setTitle('YumeShelf (Develop)');
        }
    });
    win.webContents.on('console-message', (event, _level, message) => {
        if (win.isDestroyed() || (event as any)?.sender?.isDestroyed?.()) return;
        console.log(`[RENDERER-LOG] ${sanitizeUserPaths(message)}`);
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

    win.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
        try {
            const parsed = new URL(targetUrl);
            if (['https:', 'http:'].includes(parsed.protocol)) {
                void shell?.openExternal(parsed.href);
            }
        } catch (err) {
            const sanitizedError = sanitizeUserPaths(err instanceof Error ? (err.stack || err.message) : String(err));
            console.warn('[MainWindow] Blocked malformed window open URL:', sanitizeUserPaths(targetUrl), sanitizedError);
        }
        return { action: 'deny' };
    });

    win.webContents.on('will-navigate', (event, navigationUrl) => {
        try {
            const parsed = new URL(navigationUrl);
            if (appOrigin && parsed.origin === appOrigin) {
                return;
            }
            if (parsed.protocol === 'file:' && pathsConfig?.indexHtmlPath) {
                const rawTarget = path.normalize(fileURLToPath(parsed.href));
                const rawAllowed = path.normalize(pathsConfig.indexHtmlPath);
                const rawAllowedDir = path.dirname(rawAllowed);

                const targetPlatform = platform ?? process.platform;
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
                console.warn('[MainWindow] Blocked unauthorized navigation:', sanitizeUserPaths(navigationUrl));
            }
        } catch (err) {
            event.preventDefault();
            const sanitizedError = sanitizeUserPaths(err instanceof Error ? (err.stack || err.message) : String(err));
            console.warn('[MainWindow] Blocked malformed navigation URL:', sanitizeUserPaths(navigationUrl), sanitizedError);
        }
    });

    win.webContents.on('render-process-gone', (_event, details) => {
        const reason = details?.reason ?? 'unknown';
        const exitCode = details?.exitCode ?? -1;
        console.error('[MainWindow] Render process gone:', { reason, exitCode });

        // 1. Normal shutdown suppression
        if (isQuitting) {
            return;
        }

        // 2. Clean exit handling
        if (reason === 'clean-exit') {
            app.quit();
            return;
        }

        // 3. Unexpected crash handling
        destroyTrayIcon();
        mainWindow = null;
        try {
            if (!win.isDestroyed()) {
                win.destroy();
            }
        } catch (destroyErr) {
            console.error('[MainWindow] Error destroying crashed window:', {
                error: sanitizeUserPaths(destroyErr instanceof Error ? destroyErr.message : destroyErr),
                stack: destroyErr instanceof Error && destroyErr.stack ? sanitizeUserPaths(destroyErr.stack) : undefined,
            });
        }

        try {
            const choice = dialog.showMessageBoxSync({
                type: 'error',
                title: 'YumeShelf Renderer Crash',
                message: 'The YumeShelf display process terminated unexpectedly.',
                detail: `Reason: ${reason} (Exit Code: ${exitCode})\n\nWould you like to relaunch the application or exit?`,
                buttons: ['Relaunch', 'Exit'],
                defaultId: 0,
                cancelId: 1,
                noLink: true
            });

            if (choice === 0) {
                app.relaunch();
                app.exit(0);
            } else {
                app.quit();
            }
        } catch (dialogErr) {
            console.error('[MainWindow] Failed to display crash recovery dialog:', {
                error: sanitizeUserPaths(dialogErr instanceof Error ? dialogErr.message : dialogErr),
                stack: dialogErr instanceof Error && dialogErr.stack ? sanitizeUserPaths(dialogErr.stack) : undefined,
            });
            app.quit();
        }
    });

    mainWindow = win;
    pathsConfig = paths;
    electronApp = app;

    // Listen to visibility and close events to update tray
    win.on('show', () => {
        updateTrayState();
    });

    win.on('hide', () => {
        updateTrayState();
    });

    // Override close event to minimize to tray
    win.on('close', (event) => {
        if (!isQuitting && minimizeToTray) {
            event.preventDefault();
            win.hide();
        }
    });

    app.on('before-quit', () => {
        isQuitting = true;
        destroyTrayIcon();
    });

    // Initialize/Update tray state at startup
    updateTrayState();

    if (startMinimized) {
        if (!minimizeToTray) {
            win.minimize();
        }
    }

    if (process.env.VITE_DEV_SERVER_URL) {
        win.loadURL(process.env.VITE_DEV_SERVER_URL);
    } else {
        win.loadFile(paths.indexHtmlPath);
    }
    if (launchedAfterUpdate) {
        const restoreUpdatedWindow = () => {
            if (win.isDestroyed()) return;
            if (win.isMinimized()) {
                win.restore();
            }
            win.show();
            win.focus();
        };

        win.once('ready-to-show', restoreUpdatedWindow);
        setTimeout(restoreUpdatedWindow, 1200);
    }

    return win;
}

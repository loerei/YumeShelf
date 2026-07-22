import * as path from 'node:path';
import * as fsSync from 'node:fs';
import { BrowserWindow, Tray, Menu, ipcMain, session } from 'electron';

let tray: Tray | null = null;
let minimizeToTray = false;
let isQuitting = false;
let mainWindow: BrowserWindow | null = null;
let pathsConfig: any = null;
let electronApp: any = null;

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
        console.error('[TRAY] Failed to initialize tray:', e);
    }
}

function destroyTrayIcon(): void {
    if (tray) {
        try {
            tray.destroy();
        } catch (e) {
            console.error('[TRAY] Failed to destroy tray:', e);
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
    console.log(`[MAIN][STARTUP] path summary=${JSON.stringify(summary)}`);

    const dirsToProbe: [string, string][] = [
        ['userData', summary.userData],
        ['sessionData', summary.sessionData],
        ['cache', summary.cache]
    ];

    for (const [label, dirPath] of dirsToProbe) {
        const exists = fsSync.existsSync(dirPath);
        const probe = probeWritableDir(dirPath);
        console.log(`[MAIN][STARTUP] dir probe ${label} exists=${exists} result=${JSON.stringify(probe)} path=${dirPath}`);
    }
}

export interface CreateMainWindowOptions {
    app: any;
    paths: any;
    launchedAfterUpdate: boolean;
}

export function createMainWindow({
    app,
    paths,
    launchedAfterUpdate
}: CreateMainWindowOptions): BrowserWindow {
    // Read initial DB config for minimizeToTray
    try {
        if (paths?.dbFile && fsSync.existsSync(paths.dbFile)) {
            const db = JSON.parse(fsSync.readFileSync(paths.dbFile, 'utf8'));
            if (typeof db?.config?.minimizeToTray === 'boolean') {
                minimizeToTray = db.config.minimizeToTray;
            }
        }
    } catch (e) {
        console.error('[TRAY] Failed to read initial minimizeToTray config:', e);
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
            nodeIntegration: false
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
                    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://yumeshelf-telemetry.sayusumat.workers.dev"
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
    win.webContents.on('console-message', (_event, _level, message) => {
        console.log(`[RENDERER-LOG] ${message}`);
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

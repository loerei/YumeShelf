const path = require('path');
const fsSync = require('fs');
const { BrowserWindow, Tray, Menu, ipcMain } = require('electron');

let tray = null;
let minimizeToTray = false;
let isQuitting = false;

ipcMain.on('set-minimize-to-tray', (_event, enabled) => {
    minimizeToTray = !!enabled;
});

function startupPathSummary(app) {
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

function probeWritableDir(dirPath) {
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
        return { ok: false, error: String((err && err.stack) || err) };
    }
}

function logStartupDiagnostics(app) {
    const summary = startupPathSummary(app);
    console.log(`[MAIN][STARTUP] path summary=${JSON.stringify(summary)}`);

        const dirsToProbe = [
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

function createMainWindow({
    app,
    paths,
    launchedAfterUpdate
}) {
    // Read initial DB config for minimizeToTray
    try {
        if (paths && paths.dbFile && fsSync.existsSync(paths.dbFile)) {
            const db = JSON.parse(fsSync.readFileSync(paths.dbFile, 'utf8'));
            if (db && db.config && typeof db.config.minimizeToTray === 'boolean') {
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
    win.on('page-title-updated', (event) => {
        if (!app.isPackaged) {
            event.preventDefault();
            win.setTitle('YumeShelf (Develop)');
        }
    });
    win.webContents.on('console-message', (_event, _level, message) => {
        console.log(`[RENDERER-LOG] ${message}`);
    });

    // Initialize System Tray
    if (!tray && paths && paths.mainWindowIconPath) {
        try {
            tray = new Tray(paths.mainWindowIconPath);
            const contextMenu = Menu.buildFromTemplate([
                {
                    label: 'Show YumeShelf',
                    click: () => {
                        win.show();
                        win.focus();
                    }
                },
                { type: 'separator' },
                {
                    label: 'Quit',
                    click: () => {
                        isQuitting = true;
                        app.quit();
                    }
                }
            ]);
            tray.setToolTip('YumeShelf');
            tray.setContextMenu(contextMenu);

            tray.on('double-click', () => {
                win.show();
                win.focus();
            });
        } catch (e) {
            console.error('[TRAY] Failed to initialize tray:', e);
        }
    }

    // Override close event to minimize to tray
    win.on('close', (event) => {
        if (!isQuitting && minimizeToTray) {
            event.preventDefault();
            win.hide();
        }
    });

    app.on('before-quit', () => {
        isQuitting = true;
    });

    if (startMinimized) {
        if (!minimizeToTray) {
            win.minimize();
        }
    }

    win.loadFile(paths.indexHtmlPath);
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

module.exports = {
    createMainWindow,
    logStartupDiagnostics
};

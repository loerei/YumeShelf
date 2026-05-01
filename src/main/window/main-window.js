const path = require('path');
const fsSync = require('fs');
const { BrowserWindow } = require('electron');

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
        ['cache', summary.cache],
        ['gpuCache', path.join(summary.userData, 'GPUCache')],
        ['codeCache', path.join(summary.userData, 'Code Cache')]
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
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        backgroundColor: '#121212',
        autoHideMenuBar: true,
        icon: paths.mainWindowIconPath,
        webPreferences: {
            preload: paths.preloadPath,
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    win.removeMenu();
    win.setMenuBarVisibility(false);
    win.webContents.on('console-message', (_event, _level, message) => {
        console.log(`[RENDERER-LOG] ${message}`);
    });

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

const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const { execFile } = require('child_process');

const isDev = !app.isPackaged;
const DEFAULT_GAMES_DIR = isDev ? path.join(__dirname, '..', 'YumeShelf') : path.join(path.dirname(app.getPath('exe')), 'YumeShelf');
const DB_FILE = path.join(app.getPath('userData'), 'library_db.json');

async function loadDB() { try { return JSON.parse(await fs.readFile(DB_FILE, 'utf8')); } catch { return {}; } }
async function saveDB(db) { await fs.writeFile(DB_FILE, JSON.stringify(db, null, 2)); }

async function findExeRecursive(currentPath, depth = 0) {
    if (depth > 5) return null;
    try {
        const items = await fs.readdir(currentPath, { withFileTypes: true });
        let exes = items.filter(i => i.isFile() && i.name.toLowerCase().endsWith('.exe'));
        const blacklist = ['crashhandler', 'notification', 'unins', 'updater', 'ffmpeg', 'dnspy', 'gifski', 'nircmd', 'unitycrash'];
        exes = exes.filter(exe => !blacklist.some(b => exe.name.toLowerCase().includes(b)));
        if (exes.length > 0) {
            const folderName = path.basename(currentPath).toLowerCase();
            return path.join(currentPath, exes.find(e => e.name.toLowerCase().includes(folderName))?.name || exes.find(e => e.name.toLowerCase() === 'game.exe')?.name || exes[0].name);
        }
        for (const item of items) { if (item.isDirectory()) { const found = await findExeRecursive(path.join(currentPath, item.name), depth + 1); if (found) return found; } }
    } catch {}
    return null;
}

function getSmartName(exePath, topName) {
    const id = exePath.match(/(RJ\d{6,8}|\b\d{6,8}\b)/i);
    const clean = (s) => s.replace(/\[.*?\]|RY-|(RJ\d+|\b\d{6,8}\b)|(_pc|_win|_dlsite|_eng|subscriber|v\d+\.\d+.*)|[_-]/gi, ' ').trim().replace(/\s+/g, ' ');
    return (id ? `[${id[0].toUpperCase()}] ` : '') + (clean(path.basename(path.dirname(exePath))) || clean(topName));
}

async function scan(targetDir) {
    let db = await loadDB();
    if (!require('fs').existsSync(targetDir)) return [];
    try {
        const folders = await fs.readdir(targetDir, { withFileTypes: true });
        const results = await Promise.all(folders.map(async (f) => {
            if (!f.isDirectory()) return null;
            const folderPath = path.join(targetDir, f.name);
            if (db[f.name] && db[f.name].folderPath === folderPath) {
                try { await fs.access(db[f.name].exePath); return { folderName: f.name, ...db[f.name] }; } catch { delete db[f.name]; }
            }
            const exePath = await findExeRecursive(folderPath, 0);
            if (exePath) {
                const stats = await fs.stat(folderPath);
                db[f.name] = { name: getSmartName(exePath, f.name), exePath, folderPath, dateAdded: stats.birthtimeMs, lastPlayed: db[f.name]?.lastPlayed || 0, favorite: db[f.name]?.favorite || false };
                return { folderName: f.name, ...db[f.name] };
            }
            return null;
        }));
        await saveDB(db);
        return results.filter(r => r !== null);
    } catch { return []; }
}

app.whenReady().then(() => {
    const win = new BrowserWindow({
        width: 1200, height: 800, backgroundColor: '#121212', autoHideMenuBar: true,
        webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
    });
    win.loadFile(path.join(__dirname, 'index.html'));

    ipcMain.handle('check-config', async () => {
        if (process.argv.some(arg => arg.toLowerCase() === '--welcome' || arg.toLowerCase() === '-w')) return null;
        let db = await loadDB();
        
        // Auto-detect YumeShelf folder if it exists next to the app
        if (!db.config && require('fs').existsSync(DEFAULT_GAMES_DIR)) {
            db.config = { libraryPath: DEFAULT_GAMES_DIR };
            await saveDB(db);
        }

        if (db.config && !require('fs').existsSync(db.config.libraryPath)) {
            if (require('fs').existsSync(DEFAULT_GAMES_DIR)) {
                db.config.libraryPath = DEFAULT_GAMES_DIR;
                await saveDB(db);
            }
        }
        return db.config || null;
    });

    ipcMain.handle('get-default-path', () => DEFAULT_GAMES_DIR);

    ipcMain.handle('setup-library', async (e, type) => {
        try {
            let db = await loadDB();
            let finalPath = '';
            if (type === 'default') {
                finalPath = DEFAULT_GAMES_DIR;
                if (!require('fs').existsSync(finalPath)) {
                    require('fs').mkdirSync(finalPath, { recursive: true });
                }
            } else {
                const res = await dialog.showOpenDialog({ properties: ['openDirectory'] });
                if (res.canceled) return null;
                finalPath = res.filePaths[0];
            }
            db.config = { libraryPath: finalPath };
            await saveDB(db);
            return finalPath;
        } catch (err) {
            console.error('Setup library failed:', err);
            return null;
        }
    });

    ipcMain.handle('get-games', async () => {
        let db = await loadDB();
        if (db.config && !require('fs').existsSync(db.config.libraryPath)) {
            if (require('fs').existsSync(DEFAULT_GAMES_DIR)) {
                db.config.libraryPath = DEFAULT_GAMES_DIR;
                await saveDB(db);
            }
        }
        return db.config ? await scan(db.config.libraryPath) : [];
    });

    ipcMain.on('launch-yume', async (e, {folderName, exePath}) => {
        let db = await loadDB();
        if(db[folderName]) { db[folderName].lastPlayed = Date.now(); await saveDB(db); }
        execFile(exePath, { cwd: path.dirname(exePath) });
    });

    ipcMain.on('open-folder', async () => {
        let db = await loadDB();
        if (db.config) {
            let p = db.config.libraryPath;
            if (!require('fs').existsSync(p) && require('fs').existsSync(DEFAULT_GAMES_DIR)) {
                p = DEFAULT_GAMES_DIR;
                db.config.libraryPath = p;
                await saveDB(db);
            }
            shell.openPath(p);
        }
    });

    ipcMain.handle('rename-game', async (e, { folderName, newName }) => {
        let db = await loadDB();
        if(db[folderName]) { db[folderName].name = newName; await saveDB(db); return true; }
        return false;
    });
    ipcMain.handle('toggle-favorite', async (e, folderName) => {
        let db = await loadDB();
        if(db[folderName]) { db[folderName].favorite = !db[folderName].favorite; await saveDB(db); return db[folderName].favorite; }
        return false;
    });
    ipcMain.on('reveal-game', (e, p) => shell.showItemInFolder(p));
    ipcMain.handle('delete-game', async (e, p) => await shell.trashItem(p));
    let activeIconRequests = 0;
    const iconQueue = [];

    async function processIconQueue() {
        if (activeIconRequests >= 3 || iconQueue.length === 0) return;
        activeIconRequests++;
        const { task, resolve } = iconQueue.shift();
        try {
            resolve(await task());
        } finally {
            activeIconRequests--;
            processIconQueue();
        }
    }

    function queueIconTask(task) {
        return new Promise(resolve => {
            iconQueue.push({ task, resolve });
            processIconQueue();
        });
    }

    ipcMain.handle('get-icon', async (e, p) => {
        try {
            const dir = path.dirname(p);
            const exts = ['png', 'jpg', 'jpeg', 'webp'];
            const names = ['icon', 'cover', 'folder'];
            for (const name of names) {
                for (const ext of exts) {
                    const imgPath = path.join(dir, `${name}.${ext}`);
                    if (require('fs').existsSync(imgPath)) {
                        return `file:///${imgPath.replace(/\\/g, '/')}`;
                    }
                }
            }

            // Native High-Res Extract (Bypass Electron restriction via child process with concurrency limit)
            try {
                const b64 = await queueIconTask(() => new Promise((resolve) => {
                    const appPath = app.getAppPath();
                    const extPath = require('path').join(appPath, 'node_modules', 'extract-file-icon')
                                      .replace('app.asar', 'app.asar.unpacked')
                                      .replace(/\\/g, '\\\\');
                    const script = `try { const b = require('${extPath}')('${p.replace(/\\/g, '\\\\')}', 256); console.log(b.toString('base64')); } catch(e) { console.log(''); }`;
                    const cp = require('child_process').spawn(process.execPath, ['-e', script], {
                        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
                    });
                    let out = '';
                    cp.stdout.on('data', d => out += d.toString());
                    cp.on('close', () => resolve(out.trim()));
                }));
                
                if (b64 && b64.length > 0) {
                    return `data:image/png;base64,${b64}`;
                }
            } catch (e) { console.error('extract-file-icon child_process error:', e); }

            const icon = await app.getFileIcon(p, { size: 'large' });
            return icon.toDataURL();
        } catch { return null; }
    });
});

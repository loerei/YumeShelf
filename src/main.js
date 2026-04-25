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
        if (process.argv.includes('--welcome')) return null;
        const db = await loadDB();
        return db.config || null;
    });

    ipcMain.handle('get-default-path', () => DEFAULT_GAMES_DIR);

    ipcMain.handle('setup-library', async (e, type) => {
        let db = await loadDB();
        let finalPath = '';
        if (type === 'default') {
            finalPath = DEFAULT_GAMES_DIR;
            if (!require('fs').existsSync(finalPath)) require('fs').mkdirSync(finalPath, { recursive: true });
        } else {
            const res = await dialog.showOpenDialog({ properties: ['openDirectory'] });
            if (res.canceled) return null;
            finalPath = res.filePaths[0];
        }
        db.config = { libraryPath: finalPath };
        await saveDB(db);
        return finalPath;
    });

    ipcMain.handle('get-games', async () => {
        const db = await loadDB();
        return db.config ? await scan(db.config.libraryPath) : [];
    });

    ipcMain.on('launch-game', async (e, {folderName, exePath}) => {
        let db = await loadDB();
        if(db[folderName]) { db[folderName].lastPlayed = Date.now(); await saveDB(db); }
        execFile(exePath, { cwd: path.dirname(exePath) });
    });

    ipcMain.on('open-folder', async () => {
        const db = await loadDB();
        if (db.config) shell.openPath(db.config.libraryPath);
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
});

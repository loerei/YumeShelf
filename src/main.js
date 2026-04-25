const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const fsSync = require('fs');
const crypto = require('crypto');
const { execFile } = require('child_process');

const isDev = !app.isPackaged;
const DEFAULT_GAMES_DIR = isDev ? path.join(__dirname, '..', 'YumeShelf') : path.join(path.dirname(app.getPath('exe')), 'YumeShelf');
const DB_FILE = path.join(app.getPath('userData'), 'library_db.json');

function safeGetPath(name) {
    try {
        return app.getPath(name);
    } catch (err) {
        return `ERROR:${String((err && err.message) || err)}`;
    }
}

function logBootDiagnostics() {
    console.log(`[MAIN][BOOT] summary=${JSON.stringify({
        pid: process.pid,
        argv: process.argv,
        defaultApp: !!process.defaultApp,
        isPackaged: app.isPackaged,
        appName: app.name,
        appGetName: typeof app.getName === 'function' ? app.getName() : null,
        appData: safeGetPath('appData'),
        userData: safeGetPath('userData'),
        sessionData: safeGetPath('sessionData'),
        cache: safeGetPath('cache'),
        localAppDataEnv: process.env.LOCALAPPDATA || null,
        appDataEnv: process.env.APPDATA || null
    })}`);
}

async function loadDB() { try { return JSON.parse(await fs.readFile(DB_FILE, 'utf8')); } catch { return {}; } }
async function saveDB(db) { await fs.writeFile(DB_FILE, JSON.stringify(db, null, 2)); }

function startupPathSummary() {
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

function createSha1(input) {
    return crypto.createHash('sha1').update(input).digest('hex');
}

function probeWritableDir(dirPath, label) {
    const stamp = `${process.pid}-${Date.now()}`;
    const src = path.join(dirPath, `codex-probe-${label}-${stamp}.tmp`);
    const dst = path.join(dirPath, `codex-probe-${label}-${stamp}.moved.tmp`);
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

function logStartupDiagnostics() {
    const summary = startupPathSummary();
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
        const probe = probeWritableDir(dirPath, label);
        console.log(`[MAIN][STARTUP] dir probe ${label} exists=${exists} result=${JSON.stringify(probe)} path=${dirPath}`);
    }
}

logBootDiagnostics();

app.on('ready', () => {
    console.log(`[MAIN][LIFECYCLE] ready fired pid=${process.pid}`);
});

app.on('child-process-gone', (event, details) => {
    console.error(`[MAIN][PROCESS] child-process-gone ${JSON.stringify(details)}`);
});

app.on('render-process-gone', (event, webContents, details) => {
    console.error(`[MAIN][PROCESS] render-process-gone ${JSON.stringify(details)}`);
});

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
    logStartupDiagnostics();

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
    // --- ICON EXTRACTION NODE WORKER QUEUE ---
    const iconWorkers = [];
    const pendingIconRequests = new Map();
    let iconReqIdCounter = 0;
    let activeExtractionReq = null;
    const extractionQueue = [];
    let isExtracting = false;
    let resolvedNodeExecPath = null;
    let workerBootstrapPromise = null;
    let iconCacheState = null;
    let iconCacheStatePromise = null;
    const ICON_WORKER_BOOT_MAX_ATTEMPTS = 5;
    const ICON_WORKER_PROBE_PATH = path.join(process.env.WINDIR || 'C:\\Windows', 'System32', 'notepad.exe');
    const ICON_CACHE_DIR = path.join(app.getPath('userData'), 'high-res-icon-cache');
    const ICON_CACHE_INDEX_FILE = path.join(ICON_CACHE_DIR, 'index.json');
    const ICON_CACHE_VERSION = 1;

    function summarizeWindowsPath(targetPath) {
        const normalizedPath = path.win32.normalize(targetPath);
        return {
            rawPath: targetPath,
            normalizedPath,
            rawExists: fsSync.existsSync(targetPath),
            normalizedExists: fsSync.existsSync(normalizedPath),
            hasForwardSlash: targetPath.includes('/'),
            hasBackslash: targetPath.includes('\\'),
            changedByNormalize: normalizedPath !== targetPath
        };
    }

    async function saveIconCacheState(state) {
        await fs.mkdir(ICON_CACHE_DIR, { recursive: true });
        await fs.writeFile(ICON_CACHE_INDEX_FILE, JSON.stringify(state, null, 2));
    }

    async function loadIconCacheState() {
        if (iconCacheState) return iconCacheState;
        if (iconCacheStatePromise) return iconCacheStatePromise;

        iconCacheStatePromise = (async () => {
            await fs.mkdir(ICON_CACHE_DIR, { recursive: true });
            try {
                const raw = await fs.readFile(ICON_CACHE_INDEX_FILE, 'utf8');
                const parsed = JSON.parse(raw);
                iconCacheState = {
                    version: parsed.version || ICON_CACHE_VERSION,
                    entriesByPath: parsed.entriesByPath || {}
                };
                console.log(`[MAIN][ICON-CACHE] Loaded state version=${iconCacheState.version} entries=${Object.keys(iconCacheState.entriesByPath).length} dir=${ICON_CACHE_DIR}`);
            } catch (err) {
                iconCacheState = { version: ICON_CACHE_VERSION, entriesByPath: {} };
                console.log(`[MAIN][ICON-CACHE] Initialized empty state dir=${ICON_CACHE_DIR} reason=${String((err && err.code) || (err && err.message) || err)}`);
            }
            return iconCacheState;
        })();

        try {
            return await iconCacheStatePromise;
        } finally {
            iconCacheStatePromise = null;
        }
    }

    function buildIconCacheFingerprint(normalizedPath, stats) {
        return createSha1(`${normalizedPath}|${stats.size}|${stats.mtimeMs}`);
    }

    async function deleteIconCacheFileIfUnused(state, fileName, exceptPath) {
        if (!fileName) return;
        const stillUsed = Object.entries(state.entriesByPath).some(([entryPath, entry]) => {
            if (exceptPath && entryPath === exceptPath) return false;
            return entry && entry.fileName === fileName;
        });
        if (stillUsed) return;
        try {
            await fs.unlink(path.join(ICON_CACHE_DIR, fileName));
            console.log(`[MAIN][ICON-CACHE] Deleted unused file fileName=${fileName}`);
        } catch (err) {
            if (err && err.code !== 'ENOENT') {
                console.warn(`[MAIN][ICON-CACHE] Failed to delete unused file fileName=${fileName}: ${String((err && err.message) || err)}`);
            }
        }
    }

    async function tryGetCachedIconDataUrl(targetPath) {
        const normalizedPath = path.win32.normalize(targetPath);
        let stats;
        try {
            stats = await fs.stat(normalizedPath);
        } catch (err) {
            console.warn(`[MAIN][ICON-CACHE] MISS reason=stat_failed path=${normalizedPath} error=${String((err && err.code) || (err && err.message) || err)}`);
            return null;
        }

        const state = await loadIconCacheState();
        const fingerprint = buildIconCacheFingerprint(normalizedPath, stats);
        const entry = state.entriesByPath[normalizedPath];

        if (!entry) {
            console.log(`[MAIN][ICON-CACHE] MISS reason=no_entry path=${normalizedPath} fingerprint=${fingerprint}`);
            return null;
        }

        if (entry.fingerprint !== fingerprint) {
            console.log(`[MAIN][ICON-CACHE] MISS reason=fingerprint_changed path=${normalizedPath} old=${entry.fingerprint} new=${fingerprint}`);
            return null;
        }

        const cacheFilePath = path.join(ICON_CACHE_DIR, entry.fileName);
        try {
            const buffer = await fs.readFile(cacheFilePath);
            console.log(`[MAIN][ICON-CACHE] HIT path=${normalizedPath} fingerprint=${fingerprint} bytes=${buffer.length} fileName=${entry.fileName}`);
            return `data:image/png;base64,${buffer.toString('base64')}`;
        } catch (err) {
            console.warn(`[MAIN][ICON-CACHE] MISS reason=file_missing path=${normalizedPath} fingerprint=${fingerprint} fileName=${entry.fileName} error=${String((err && err.code) || (err && err.message) || err)}`);
            return null;
        }
    }

    async function storeHighResIconInCache(targetPath, base64, meta) {
        const normalizedPath = path.win32.normalize(targetPath);
        let stats;
        try {
            stats = await fs.stat(normalizedPath);
        } catch (err) {
            console.warn(`[MAIN][ICON-CACHE] STORE-SKIP reason=stat_failed path=${normalizedPath} error=${String((err && err.code) || (err && err.message) || err)}`);
            return;
        }

        const state = await loadIconCacheState();
        const fingerprint = buildIconCacheFingerprint(normalizedPath, stats);
        const fileName = `${fingerprint}.png`;
        const cacheFilePath = path.join(ICON_CACHE_DIR, fileName);
        const previousEntry = state.entriesByPath[normalizedPath] || null;
        const buffer = Buffer.from(base64, 'base64');

        await fs.mkdir(ICON_CACHE_DIR, { recursive: true });
        await fs.writeFile(cacheFilePath, buffer);
        state.entriesByPath[normalizedPath] = {
            fingerprint,
            fileName,
            size: stats.size,
            mtimeMs: stats.mtimeMs,
            cachedAtMs: Date.now()
        };
        await saveIconCacheState(state);
        if (previousEntry && previousEntry.fileName !== fileName) {
            await deleteIconCacheFileIfUnused(state, previousEntry.fileName, normalizedPath);
        }
        console.log(`[MAIN][ICON-CACHE] STORE path=${normalizedPath} fingerprint=${fingerprint} bytes=${buffer.length} rawLength=${meta && meta.rawLength !== undefined ? meta.rawLength : 'unknown'} fileName=${fileName}`);
    }

    function resolveNodeExecPath() {
        if (resolvedNodeExecPath) return resolvedNodeExecPath;

        const candidates = [
            process.env.npm_node_execpath,
            process.env.NODE,
            process.execPath.toLowerCase().endsWith('\\node.exe') ? process.execPath : null,
            process.env.ProgramFiles ? path.join(process.env.ProgramFiles, 'nodejs', 'node.exe') : null,
            process.env['ProgramFiles(x86)'] ? path.join(process.env['ProgramFiles(x86)'], 'nodejs', 'node.exe') : null
        ].filter(Boolean);

        for (const candidate of candidates) {
            if (fsSync.existsSync(candidate) && candidate.toLowerCase().endsWith('\\node.exe')) {
                resolvedNodeExecPath = candidate;
                console.log(`[MAIN][NODE-WORKER] Resolved node.exe from candidate: ${candidate}`);
                return resolvedNodeExecPath;
            }
        }

        const whereResult = require('child_process').spawnSync('where.exe', ['node'], {
            encoding: 'utf8',
            windowsHide: true
        });
        if (whereResult.status === 0) {
            const matches = String(whereResult.stdout || '')
                .split(/\r?\n/)
                .map(line => line.trim())
                .filter(line => line && fsSync.existsSync(line) && line.toLowerCase().endsWith('\\node.exe'));
            if (matches.length > 0) {
                resolvedNodeExecPath = matches[0];
                console.log(`[MAIN][NODE-WORKER] Resolved node.exe via where.exe: ${resolvedNodeExecPath}`);
                return resolvedNodeExecPath;
            }
        }

        throw new Error(`Could not resolve node.exe; process.execPath=${process.execPath}`);
    }

    function buildExtractFileIconPath() {
        return path.join(app.getAppPath(), 'node_modules', 'extract-file-icon')
            .replace('app.asar', 'app.asar.unpacked');
    }

    function recycleWorker(worker, reason) {
        if (!worker) return;
        console.warn(`[MAIN][NODE-WORKER] Recycling worker #${worker.__workerId || 'unknown'} pid=${worker.pid} reason=${reason}`);
        const idx = iconWorkers.indexOf(worker);
        if (idx > -1) iconWorkers.splice(idx, 1);
        try {
            worker.kill();
        } catch {}
    }

    function createIconWorker() {
        const workerId = iconWorkers.length + 1;
        const nodeExecPath = resolveNodeExecPath();
        console.log(`[MAIN][NODE-WORKER] Forking node worker #${workerId} via ${nodeExecPath}`);
        const workerPath = path.join(__dirname, 'icon-extractor.js');
        const worker = require('child_process').fork(workerPath, [], {
            execPath: nodeExecPath,
            stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
            windowsHide: true
        });

        worker.__workerId = workerId;
        worker.__healthy = false;

        worker.stdout.on('data', (d) => process.stdout.write(`[NW${workerId} STDOUT] ${d}`));
        worker.stderr.on('data', (d) => process.stderr.write(`[NW${workerId} STDERR] ${d}`));

        worker.on('message', (msg) => {
            if (!msg || msg.id === undefined) return;
            const pending = pendingIconRequests.get(msg.id);
            const durationMs = activeExtractionReq && activeExtractionReq.id === msg.id && activeExtractionReq.sentAt
                ? Date.now() - activeExtractionReq.sentAt
                : null;
            console.log(`[MAIN][NODE-WORKER] Received response for #${msg.id}, base64 length=${msg.base64 ? msg.base64.length : 0}, workerRoundTripMs=${durationMs}`);
            if (msg.meta) {
                console.log(`[MAIN][NODE-WORKER] Response meta for #${msg.id}: ${JSON.stringify(msg.meta)}`);
            }
            if (pending) {
                clearTimeout(pending.timeout);
                pendingIconRequests.delete(msg.id);
                pending.resolve({ base64: msg.base64 || '', meta: msg.meta || null });
            }
            if (activeExtractionReq && activeExtractionReq.id === msg.id) {
                activeExtractionReq = null;
                isExtracting = false;
                processExtractionQueue();
            }
        });

        worker.on('exit', (code, signal) => {
            console.error(`[MAIN][NODE-WORKER] Worker #${workerId} exited with code ${code} signal ${signal}`);
            const idx = iconWorkers.indexOf(worker);
            if (idx > -1) iconWorkers.splice(idx, 1);

            for (const [pendingId, pending] of pendingIconRequests.entries()) {
                if (pending.worker !== worker) continue;
                clearTimeout(pending.timeout);
                pendingIconRequests.delete(pendingId);
                pending.resolve({
                    base64: '',
                    meta: {
                        cause: 'worker_exit',
                        requestId: pendingId,
                        mode: 'node-worker',
                        workerPid: worker.pid,
                        code,
                        signal
                    }
                });
            }

            if (activeExtractionReq && activeExtractionReq.worker === worker) {
                console.error(`[MAIN][NODE-WORKER] Active request #${activeExtractionReq.id} lost because worker pid=${worker.pid} exited`);
                activeExtractionReq = null;
                isExtracting = false;
                processExtractionQueue();
            }
        });

        iconWorkers.push(worker);
        return worker;
    }

    function probeIconWorker(worker, attempt) {
        return new Promise((resolve) => {
            const probeId = `probe-${worker.pid}-${attempt}-${Date.now()}`;
            console.log(`[MAIN][NODE-WORKER] Probing worker #${worker.__workerId} pid=${worker.pid} attempt=${attempt} probePath=${ICON_WORKER_PROBE_PATH}`);
            console.log(`[MAIN][NODE-WORKER] Probe path summary=${JSON.stringify(summarizeWindowsPath(ICON_WORKER_PROBE_PATH))}`);

            const timeout = setTimeout(() => {
                pendingIconRequests.delete(probeId);
                console.error(`[MAIN][NODE-WORKER] Probe timed out for worker #${worker.__workerId} pid=${worker.pid}`);
                resolve(false);
            }, 3000);

            pendingIconRequests.set(probeId, {
                worker,
                timeout,
                resolve: ({ meta }) => {
                    const rawLength = meta && typeof meta.rawLength === 'number' ? meta.rawLength : 0;
                    const ok = rawLength > 0;
                    console.log(`[MAIN][NODE-WORKER] Probe result for worker #${worker.__workerId} pid=${worker.pid}: rawLength=${rawLength} ok=${ok}`);
                    resolve(ok);
                }
            });

            worker.send({
                type: 'extract',
                id: probeId,
                path: ICON_WORKER_PROBE_PATH,
                extPath: buildExtractFileIconPath()
            });
        });
    }

    async function ensureHealthyIconWorker() {
        const existing = iconWorkers.find(worker => worker.__healthy);
        if (existing) return existing;
        if (workerBootstrapPromise) return workerBootstrapPromise;

        workerBootstrapPromise = (async () => {
            for (let attempt = 1; attempt <= ICON_WORKER_BOOT_MAX_ATTEMPTS; attempt++) {
                const worker = createIconWorker();
                const ok = await probeIconWorker(worker, attempt);
                if (ok) {
                    worker.__healthy = true;
                    console.log(`[MAIN][NODE-WORKER] Worker #${worker.__workerId} pid=${worker.pid} passed probe on attempt ${attempt}`);
                    return worker;
                }
                recycleWorker(worker, `probe_failed_attempt_${attempt}`);
            }
            throw new Error(`No healthy icon worker after ${ICON_WORKER_BOOT_MAX_ATTEMPTS} attempts`);
        })();

        try {
            return await workerBootstrapPromise;
        } finally {
            workerBootstrapPromise = null;
        }
    }

    async function processExtractionQueue() {
        if (isExtracting || extractionQueue.length === 0) return;
        isExtracting = true;

        const req = extractionQueue.shift();
        req.sentAt = Date.now();
        console.log(`[MAIN][QUEUE] Preparing req #${req.id}; queuedForMs=${req.sentAt - req.enqueuedAt}; queueRemaining=${extractionQueue.length}`);
        console.log(`[MAIN][QUEUE] req #${req.id} path summary=${JSON.stringify(summarizeWindowsPath(req.path))}`);

        try {
            const worker = await ensureHealthyIconWorker();
            req.worker = worker;
            activeExtractionReq = req;
            console.log(`[MAIN][QUEUE] Sending req #${req.id} to healthy node worker pid=${worker.pid}`);

            req.timeout = setTimeout(() => {
                console.error(`[MAIN][QUEUE] Request #${req.id} TIMED OUT after 10s`);
                if (pendingIconRequests.has(req.id)) {
                    pendingIconRequests.delete(req.id);
                    req.resolve({ base64: '', meta: { cause: 'timeout', requestId: req.id, mode: 'node-worker' } });
                }
                activeExtractionReq = null;
                isExtracting = false;
                processExtractionQueue();
            }, 10000);

            pendingIconRequests.set(req.id, {
                ...req,
                worker
            });
            worker.send({ type: 'extract', id: req.id, path: req.path, extPath: req.extPath });
        } catch (err) {
            console.error(`[MAIN][QUEUE] Failed to obtain healthy node worker for req #${req.id}:`, err);
            req.resolve({
                base64: '',
                meta: {
                    cause: 'worker_healthcheck_failed',
                    requestId: req.id,
                    mode: 'node-worker',
                    error: String((err && err.stack) || err)
                }
            });
            activeExtractionReq = null;
            isExtracting = false;
            processExtractionQueue();
        }
    }

    ipcMain.handle('get-icon', async (e, p) => {
        try {
            console.log(`[MAIN][IPC] get-icon requested for: ${p}`);
            console.log(`[MAIN][IPC] get-icon path summary=${JSON.stringify(summarizeWindowsPath(p))}`);
            const dir = path.dirname(p);
            const exts = ['png', 'jpg', 'jpeg', 'webp'];
            const names = ['icon', 'cover', 'folder'];
            for (const name of names) {
                for (const ext of exts) {
                    const imgPath = path.join(dir, `${name}.${ext}`);
                    if (require('fs').existsSync(imgPath)) {
                        console.log(`[MAIN][IPC] Found local image: ${imgPath}`);
                        return `file:///${imgPath.replace(/\\/g, '/')}`;
                    }
                }
            }

            const cachedIconDataUrl = await tryGetCachedIconDataUrl(p);
            if (cachedIconDataUrl) {
                console.log(`[MAIN][IPC] Returning cached high-res icon for: ${p}`);
                return cachedIconDataUrl;
            }

            try {
                const result = await new Promise((resolve) => {
                    const id = ++iconReqIdCounter;
                    const extPath = buildExtractFileIconPath();

                    extractionQueue.push({ id, path: p, extPath, resolve, enqueuedAt: Date.now() });
                    console.log(`[MAIN][IPC] Queued node-worker req #${id} (queueLengthNow=${extractionQueue.length}) extPath=${extPath}`);
                    processExtractionQueue();
                });
                if (result && result.base64) {
                    try {
                        await storeHighResIconInCache(p, result.base64, result.meta || null);
                    } catch (cacheErr) {
                        console.warn(`[MAIN][ICON-CACHE] STORE-FAIL path=${path.win32.normalize(p)} error=${String((cacheErr && cacheErr.stack) || cacheErr)}`);
                    }
                    console.log(`[MAIN][IPC] Successfully resolved high-res icon for: ${p}`);
                    return `data:image/png;base64,${result.base64}`;
                }
                console.warn(`[MAIN][IPC] High-res extraction did not yield usable data for: ${p}`);
                if (result && result.meta) {
                    console.warn(`[MAIN][IPC] Failure meta for ${p}: ${JSON.stringify(result.meta)}`);
                }
            } catch (e) { console.error('[MAIN][IPC] extract-file-icon node-worker error:', e); }

            console.warn(`[MAIN][IPC] Falling back to app.getFileIcon for: ${p}`);
            const icon = await app.getFileIcon(p, { size: 'large' });
            return icon.toDataURL();
        } catch (e) { console.error(`[MAIN][IPC] get-icon top-level error for ${p}:`, e); return null; }
    });
});

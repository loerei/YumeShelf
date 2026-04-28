const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const fsSync = require('fs');
const crypto = require('crypto');
const http = require('http');
const https = require('https');
const { execFile } = require('child_process');
const { createAppUpdateServices } = require('./main/app-updates');
const { createLibraryState } = require('./main/library-state');
const { createStartupServices } = require('./main/startup');
const { createPlaytimeTracker } = require('./main/playtime-tracker');

const isDev = !app.isPackaged;
const DEFAULT_GAMES_DIR = isDev ? path.join(__dirname, '..', 'YumeShelf') : path.join(path.dirname(app.getPath('exe')), 'YumeShelf');
const DB_FILE = path.join(app.getPath('userData'), 'library_db.json');
const USER_LOCALES_DIR = path.join(app.getPath('userData'), 'locales');
const LANGUAGE_PACK_CACHE_DIR = path.join(app.getPath('userData'), 'language-pack-cache');
const LANGUAGE_PACK_MANIFEST_CACHE_FILE = path.join(LANGUAGE_PACK_CACHE_DIR, 'manifest.json');
const BUILTIN_LOCALES_DIR = path.join(__dirname, 'locales', 'builtins');
const LOCAL_LANGUAGE_PACK_ROOT = path.join(__dirname, '..', 'language-packs');
const LOCAL_LANGUAGE_PACK_MANIFEST_FILE = path.join(LOCAL_LANGUAGE_PACK_ROOT, 'manifest.json');
const LOCAL_LANGUAGE_PACKS_DIR = path.join(LOCAL_LANGUAGE_PACK_ROOT, 'packs');
const LANGUAGE_PACK_REPO_URL = 'https://github.com/loerei/YumeShelf/blob/main/TRANSLATION.md';
const LANGUAGE_PACK_MANIFEST_URL = 'https://raw.githubusercontent.com/loerei/YumeShelf/main/language-packs/manifest.json';
const LANGUAGE_PACK_TIMEOUT_MS = 8000;
const STARTUP_NETWORK_TIMEOUT_MS = 3500;
const LOCALE_REQUIRED_STRING_KEYS = ['title', 'settings', 'lang', 'welcome', 'welcome_desc', 'placeholders'];

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

function normalizeLanguageCode(code) {
    return String(code || '').trim().toLowerCase();
}

function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

async function ensureDir(dirPath) {
    await fs.mkdir(dirPath, { recursive: true });
}

async function readJsonFile(filePath) {
    try {
        return JSON.parse(await fs.readFile(filePath, 'utf8'));
    } catch {
        return null;
    }
}

async function writeJsonFile(filePath, data) {
    await ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function sha256Hex(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex');
}

function compareVersions(left, right) {
    const toParts = (value) => String(value || '0')
        .split('.')
        .map(part => parseInt(part, 10))
        .map(part => Number.isFinite(part) ? part : 0);

    const a = toParts(left);
    const b = toParts(right);
    const len = Math.max(a.length, b.length);
    for (let i = 0; i < len; i += 1) {
        const delta = (a[i] || 0) - (b[i] || 0);
        if (delta !== 0) return delta;
    }
    return 0;
}

function isNetworkLikeError(err) {
    const msg = String((err && err.message) || err || '').toLowerCase();
    const code = String((err && err.code) || '').toLowerCase();
    return [
        'econnreset',
        'econnrefused',
        'enetunreach',
        'ehostunreach',
        'eai_again',
        'timed out',
        'enotfound',
        'socket hang up',
        'offline',
        'network'
    ].some(token => msg.includes(token) || code.includes(token));
}

function downloadBuffer(urlString, redirectCount = 0, timeoutMs = LANGUAGE_PACK_TIMEOUT_MS, onProgress = null) {
    return new Promise((resolve, reject) => {
        if (redirectCount > 5) {
            reject(new Error('Too many redirects while downloading language pack data.'));
            return;
        }

        let requestUrl;
        try {
            requestUrl = new URL(urlString);
        } catch {
            reject(new Error(`Invalid download URL: ${urlString}`));
            return;
        }

        const client = requestUrl.protocol === 'http:' ? http : https;
        const req = client.get(requestUrl, {
            headers: {
                'User-Agent': `YumeShelf/${app.getVersion()}`
            }
        }, (res) => {
            const status = res.statusCode || 0;
            if ([301, 302, 303, 307, 308].includes(status) && res.headers.location) {
                const redirected = new URL(res.headers.location, requestUrl).toString();
                res.resume();
                resolve(downloadBuffer(redirected, redirectCount + 1, timeoutMs, onProgress));
                return;
            }

            if (status !== 200) {
                res.resume();
                reject(new Error(`HTTP ${status} while downloading ${requestUrl.toString()}`));
                return;
            }

            const total = parseInt(res.headers['content-length'], 10);
            let downloaded = 0;
            const chunks = [];
            res.on('data', chunk => {
                chunks.push(Buffer.from(chunk));
                downloaded += chunk.length;
                if (typeof onProgress === 'function' && total) {
                    onProgress(downloaded, total);
                }
            });
            res.on('end', () => resolve(Buffer.concat(chunks)));
        });

        req.setTimeout(timeoutMs, () => {
            req.destroy(new Error('Request timed out.'));
        });
        req.on('error', reject);
    });
}

function normalizeLocalePack(raw, options = {}) {
    const { installed = false, builtIn = false, sourceLabel = 'locale pack' } = options;
    if (!isPlainObject(raw)) throw new Error(`${sourceLabel} is not a JSON object.`);

    const code = normalizeLanguageCode(raw.code);
    if (!code) throw new Error(`${sourceLabel} is missing a language code.`);
    if (!raw.englishName || !raw.nativeName) throw new Error(`${sourceLabel} is missing language names.`);
    if (!isPlainObject(raw.strings)) throw new Error(`${sourceLabel} is missing the strings object.`);

    const missingKeys = LOCALE_REQUIRED_STRING_KEYS.filter((key) => {
        if (key === 'placeholders') return !Array.isArray(raw.strings.placeholders) || raw.strings.placeholders.length === 0;
        return typeof raw.strings[key] !== 'string' || raw.strings[key].trim().length === 0;
    });
    if (missingKeys.length > 0) {
        throw new Error(`${sourceLabel} is missing required keys: ${missingKeys.join(', ')}`);
    }

    return {
        code,
        englishName: String(raw.englishName),
        nativeName: String(raw.nativeName),
        packVersion: String(raw.packVersion || raw.version || '1.0.0'),
        minAppVersion: raw.minAppVersion ? String(raw.minAppVersion) : null,
        reviewedForAppVersion: raw.reviewedForAppVersion ? String(raw.reviewedForAppVersion) : null,
        aliases: Array.isArray(raw.aliases) ? raw.aliases.map(value => String(value)).filter(Boolean) : [],
        keywords: Array.isArray(raw.keywords) ? raw.keywords.map(value => String(value)).filter(Boolean) : [],
        source: builtIn ? 'built-in' : (installed ? 'downloaded' : 'remote'),
        strings: raw.strings
    };
}

function normalizeManifest(raw) {
    if (!isPlainObject(raw)) throw new Error('Manifest payload is not a JSON object.');
    if (!Array.isArray(raw.packs)) throw new Error('Manifest is missing the packs array.');

    const packs = raw.packs.map((entry, index) => {
        if (!isPlainObject(entry)) throw new Error(`Manifest pack #${index + 1} is invalid.`);
        const code = normalizeLanguageCode(entry.code);
        if (!code) throw new Error(`Manifest pack #${index + 1} is missing a code.`);
        if (!entry.englishName || !entry.nativeName) throw new Error(`Manifest pack '${code}' is missing names.`);
        if (!entry.downloadUrl || !entry.sha256) throw new Error(`Manifest pack '${code}' is missing download metadata.`);

        return {
            code,
            englishName: String(entry.englishName),
            nativeName: String(entry.nativeName),
            packVersion: String(entry.packVersion || entry.version || '1.0.0'),
            minAppVersion: entry.minAppVersion ? String(entry.minAppVersion) : null,
            reviewedForAppVersion: entry.reviewedForAppVersion ? String(entry.reviewedForAppVersion) : null,
            aliases: Array.isArray(entry.aliases) ? entry.aliases.map(value => String(value)).filter(Boolean) : [],
            keywords: Array.isArray(entry.keywords) ? entry.keywords.map(value => String(value)).filter(Boolean) : [],
            downloadUrl: String(entry.downloadUrl),
            sha256: String(entry.sha256).toLowerCase()
        };
    });

    return {
        schemaVersion: Number(raw.schemaVersion || 1),
        generatedAt: raw.generatedAt ? String(raw.generatedAt) : null,
        packs
    };
}

function summarizeLanguagePackUpdate(installedPack, manifestEntry) {
    return {
        code: installedPack.code,
        englishName: manifestEntry.englishName,
        nativeName: manifestEntry.nativeName,
        currentPackVersion: installedPack.packVersion,
        nextPackVersion: manifestEntry.packVersion,
        minAppVersion: manifestEntry.minAppVersion,
        reviewedForAppVersion: manifestEntry.reviewedForAppVersion
    };
}

function getLanguagePackUpdateCandidates(languageState, manifest) {
    if (!languageState || !Array.isArray(languageState.installed) || !manifest || !Array.isArray(manifest.packs)) {
        return [];
    }

    const manifestByCode = new Map(manifest.packs.map(pack => [pack.code, pack]));
    return languageState.installed
        .map((installedPack) => {
            const manifestEntry = manifestByCode.get(installedPack.code);
            if (!manifestEntry) return null;
            if (manifestEntry.minAppVersion && compareVersions(app.getVersion(), manifestEntry.minAppVersion) < 0) return null;
            if (compareVersions(manifestEntry.packVersion, installedPack.packVersion) <= 0) return null;
            return {
                manifestEntry,
                summary: summarizeLanguagePackUpdate(installedPack, manifestEntry)
            };
        })
        .filter(Boolean);
}

async function loadLocaleDirectory(dirPath, options = {}) {
    const results = [];
    try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        for (const entry of entries) {
            if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== '.json') continue;
            const filePath = path.join(dirPath, entry.name);
            const raw = await readJsonFile(filePath);
            if (!raw) continue;
            try {
                results.push(normalizeLocalePack(raw, {
                    ...options,
                    sourceLabel: filePath
                }));
            } catch (err) {
                console.warn(`[MAIN][I18N] Skipping locale file ${filePath}: ${String((err && err.message) || err)}`);
            }
        }
    } catch {
        return [];
    }
    return results;
}

async function buildLanguageState() {
    const builtInPacks = await loadLocaleDirectory(BUILTIN_LOCALES_DIR, { builtIn: true });
    const installedPacks = await loadLocaleDirectory(USER_LOCALES_DIR, { installed: true });
    const locales = {};
    const seenCodes = new Set();

    for (const pack of builtInPacks) {
        locales[pack.code] = pack.strings;
        seenCodes.add(pack.code);
    }

    const installed = [];
    for (const pack of installedPacks) {
        if (seenCodes.has(pack.code)) continue;
        installed.push(pack);
        locales[pack.code] = pack.strings;
        seenCodes.add(pack.code);
    }

    return {
        repoUrl: LANGUAGE_PACK_REPO_URL,
        manifestUrl: LANGUAGE_PACK_MANIFEST_URL,
        appVersion: app.getVersion(),
        builtIn: builtInPacks.map(({ strings, ...meta }) => meta),
        installed: installed.map(({ strings, ...meta }) => meta),
        locales
    };
}

async function readCachedLanguageManifest() {
    const raw = await readJsonFile(LANGUAGE_PACK_MANIFEST_CACHE_FILE);
    if (!raw) return null;
    try {
        return normalizeManifest(raw);
    } catch (err) {
        console.warn(`[MAIN][I18N] Ignoring invalid cached manifest: ${String((err && err.message) || err)}`);
        return null;
    }
}

async function fetchLanguageManifest() {
    if (isDev) {
        const localManifest = await readJsonFile(LOCAL_LANGUAGE_PACK_MANIFEST_FILE);
        if (localManifest) {
            try {
                const manifest = normalizeManifest(localManifest);
                return { ok: true, offline: false, source: 'local', manifest, error: null };
            } catch (err) {
                console.warn(`[MAIN][I18N] Invalid local dev manifest: ${String((err && err.message) || err)}`);
            }
        }
    }

    try {
        const buffer = await downloadBuffer(LANGUAGE_PACK_MANIFEST_URL);
        const raw = JSON.parse(buffer.toString('utf8'));
        const manifest = normalizeManifest(raw);
        await writeJsonFile(LANGUAGE_PACK_MANIFEST_CACHE_FILE, raw);
        return { ok: true, offline: false, source: 'remote', manifest, error: null };
    } catch (err) {
        const cached = await readCachedLanguageManifest();
        if (cached) {
            return {
                ok: true,
                offline: true,
                source: 'cache',
                manifest: cached,
                error: String((err && err.message) || err)
            };
        }

        return {
            ok: false,
            offline: isNetworkLikeError(err),
            source: 'none',
            manifest: null,
            error: String((err && err.message) || err)
        };
    }
}

async function installLanguagePackFromManifestEntry(entry, options = {}) {
    const normalizedCode = normalizeLanguageCode(entry && entry.code);
    const downloadTimeoutMs = Number(options.downloadTimeoutMs) > 0 ? Number(options.downloadTimeoutMs) : LANGUAGE_PACK_TIMEOUT_MS;
    if (!normalizedCode) {
        return { ok: false, error: 'Missing language pack code.', reason: 'invalid-code' };
    }

    const minVersion = entry.minAppVersion || null;
    if (minVersion && compareVersions(app.getVersion(), minVersion) < 0) {
        return {
            ok: false,
            error: `Language pack '${normalizedCode}' requires YumeShelf ${minVersion} or newer.`,
            reason: 'not-compatible'
        };
    }

    try {
        let buffer;
        if (isDev) {
            const localPackPath = path.join(LOCAL_LANGUAGE_PACKS_DIR, `${normalizedCode}.json`);
            if (fsSync.existsSync(localPackPath)) {
                buffer = await fs.readFile(localPackPath);
            }
        }
        if (!buffer) {
            buffer = await downloadBuffer(entry.downloadUrl, 0, downloadTimeoutMs);
        }

        const digest = sha256Hex(buffer);
        if (digest !== entry.sha256) {
            return {
                ok: false,
                error: `Checksum verification failed for '${normalizedCode}'.`,
                reason: 'checksum'
            };
        }

        const raw = JSON.parse(buffer.toString('utf8'));
        const pack = normalizeLocalePack(raw, { installed: true, sourceLabel: `downloaded pack '${normalizedCode}'` });
        if (pack.code !== normalizedCode) {
            return {
                ok: false,
                error: `Downloaded pack code '${pack.code}' does not match '${normalizedCode}'.`,
                reason: 'schema'
            };
        }
        if (pack.minAppVersion && compareVersions(app.getVersion(), pack.minAppVersion) < 0) {
            return {
                ok: false,
                error: `Language pack '${normalizedCode}' requires YumeShelf ${pack.minAppVersion} or newer.`,
                reason: 'not-compatible'
            };
        }

        await ensureDir(USER_LOCALES_DIR);
        await fs.writeFile(path.join(USER_LOCALES_DIR, `${normalizedCode}.json`), JSON.stringify(raw, null, 2), 'utf8');

        return {
            ok: true,
            installedCode: normalizedCode
        };
    } catch (err) {
        return {
            ok: false,
            offline: isNetworkLikeError(err),
            error: String((err && err.message) || err),
            reason: isNetworkLikeError(err) ? 'offline' : 'download'
        };
    }
}

async function applyLanguagePackUpdates(candidates, options = {}) {
    const installed = [];
    const failed = [];

    for (const candidate of candidates) {
        const result = await installLanguagePackFromManifestEntry(candidate.manifestEntry, options);
        if (result.ok) {
            installed.push(candidate.summary);
            continue;
        }

        failed.push({
            ...candidate.summary,
            offline: !!result.offline,
            error: result.error || null,
            reason: result.reason || 'download'
        });
    }

    return {
        installed,
        failed,
        state: installed.length > 0 ? await buildLanguageState() : null
    };
}

async function installLanguagePack(code) {
    const normalizedCode = normalizeLanguageCode(code);
    if (!normalizedCode) {
        return { ok: false, error: 'Missing language pack code.', reason: 'invalid-code' };
    }

    const manifestResult = await fetchLanguageManifest();
    if (!manifestResult.ok || !manifestResult.manifest) {
        return {
            ok: false,
            offline: manifestResult.offline,
            error: manifestResult.offline ? 'You are offline.' : (manifestResult.error || 'Unable to load language packs.'),
            reason: manifestResult.offline ? 'offline' : 'manifest'
        };
    }

    const entry = manifestResult.manifest.packs.find(pack => pack.code === normalizedCode);
    if (!entry) {
        return { ok: false, error: `Language pack '${normalizedCode}' was not found.`, reason: 'not-found' };
    }

    const installResult = await installLanguagePackFromManifestEntry(entry);
    if (!installResult.ok) {
        return installResult;
    }

    return {
        ...installResult,
        state: await buildLanguageState()
    };
}

const appUpdateServices = createAppUpdateServices({
    app,
    broadcastStatus: (payload) => {
        BrowserWindow.getAllWindows().forEach((windowRef) => {
            if (!windowRef || windowRef.isDestroyed()) return;
            windowRef.webContents.send('app-update-status', payload);
        });
    },
    compareVersions,
    downloadBuffer,
    ensureDir,
    isNetworkLikeError,
    openExternalUrl: (url) => shell.openExternal(url),
    readJsonFile,
    sha256Hex,
    startupNetworkTimeoutMs: STARTUP_NETWORK_TIMEOUT_MS
});

const libraryState = createLibraryState({
    defaultGamesDir: DEFAULT_GAMES_DIR,
    dialog,
    fs,
    fsSync,
    loadDB,
    saveDB
});

const playtimeTracker = createPlaytimeTracker({ libraryState });

const { bootstrapAppState, loadGamesForConfig, resolveLibraryConfig } = createStartupServices({
    app,
    checkForAppUpdate: () => appUpdateServices.checkForAppUpdate(),
    consumePostUpdateMarker: () => appUpdateServices.consumePostUpdateMarker(),
    logAppUpdateDebug: (message) => appUpdateServices.logDebug(message),
    applyLanguagePackUpdates,
    buildLanguageState,
    fetchLanguageManifest,
    getLanguagePackUpdateCandidates,
    isNetworkLikeError,
    loadGamesForConfig: (config) => libraryState.loadGamesForConfig(config),
    resolveLibraryConfig: () => libraryState.resolveLibraryConfig(),
    startupNetworkTimeoutMs: STARTUP_NETWORK_TIMEOUT_MS
});

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

app.whenReady().then(() => {
    logStartupDiagnostics();
    const launchedAfterUpdate = process.argv.includes('--after-update');

    const win = new BrowserWindow({
        width: 1200, height: 800, backgroundColor: '#121212', autoHideMenuBar: true,
        icon: path.join(__dirname, '..', 'assets', 'yumeshelf_icon_highres_4096.png'),
        webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
    });
    win.removeMenu();
    win.setMenuBarVisibility(false);
    win.webContents.on('console-message', (event, level, message, line, sourceId) => {
        console.log(`[RENDERER-LOG] ${message}`);
    });

    win.loadFile(path.join(__dirname, 'index.html'));
    if (launchedAfterUpdate) {
        const restoreUpdatedWindow = () => {
            if (win.isDestroyed()) {
                return;
            }

            if (win.isMinimized()) {
                win.restore();
            }
            win.show();
            win.focus();
        };

        win.once('ready-to-show', restoreUpdatedWindow);
        setTimeout(restoreUpdatedWindow, 1200);
    }

    ipcMain.handle('get-app-version', async () => app.getVersion());
    ipcMain.handle('get-language-state', async () => buildLanguageState());
    ipcMain.handle('bootstrap-app', async (event, options = {}) => bootstrapAppState(event.sender, options));
    ipcMain.handle('start-app-update-download', async () => appUpdateServices.startBackgroundDownload());
    ipcMain.handle('restart-and-install-app-update', async () => appUpdateServices.restartAndInstallDownloadedUpdate());
    ipcMain.handle('open-app-update-download-page', async () => appUpdateServices.openAppUpdateDownloadPage());
    ipcMain.handle('open-external-url', async (_event, url) => {
        const normalizedUrl = String(url || '').trim();
        if (!/^https?:\/\//i.test(normalizedUrl)) {
            return { ok: false, reason: 'invalid-url' };
        }
        await shell.openExternal(normalizedUrl);
        return { ok: true };
    });
    ipcMain.handle('log-app-update-debug', async (_event, message) => {
        await appUpdateServices.logDebug(`renderer ${String(message || '')}`);
        return { ok: true };
    });
    ipcMain.handle('get-language-pack-manifest', async () => {
        const result = await fetchLanguageManifest();
        return {
            ok: result.ok,
            offline: result.offline,
            source: result.source,
            error: result.error,
            repoUrl: LANGUAGE_PACK_REPO_URL,
            packs: result.manifest ? result.manifest.packs : []
        };
    });
    ipcMain.handle('install-language-pack', async (e, code) => installLanguagePack(code));

    ipcMain.handle('check-config', async () => resolveLibraryConfig());

    ipcMain.handle('get-default-path', () => DEFAULT_GAMES_DIR);

    ipcMain.handle('setup-library', async (_event, type) => libraryState.setupLibrary(type));
    ipcMain.handle('update-library-config', async (_event, updates = {}) => libraryState.updateLibraryConfig(updates));

    ipcMain.handle('get-games', async () => {
        const games = await loadGamesForConfig(await resolveLibraryConfig());
        return games.map(game => ({
            ...game,
            isRunning: playtimeTracker.isGameRunning(game.gameKey)
        }));
    });

    ipcMain.on('launch-yume', async (_event, { gameKey, exePath }) => {
        playtimeTracker.trackGameLaunch(gameKey, exePath);
    });

    ipcMain.on('open-folder', async () => {
        const libraryPath = await libraryState.resolveLibraryFolderToOpen();
        if (libraryPath) {
            shell.openPath(libraryPath);
        }
    });

    ipcMain.handle('rename-game', async (_event, { gameKey, newName }) => libraryState.renameGame(gameKey, newName));
    ipcMain.handle('toggle-favorite', async (_event, gameKey) => libraryState.toggleFavorite(gameKey));
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

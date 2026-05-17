const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');
const crypto = require('crypto');
const { cropTransparentPaddingFromDataUrl } = require('./cropper');

const ICON_CACHE_VERSION = 1;

function createSha1(input) {
    return crypto.createHash('sha1').update(input).digest('hex');
}

function resolveCachePaths(app) {
    const cacheDir = path.join(app.getPath('userData'), 'high-res-icon-cache');
    const indexFile = path.join(cacheDir, 'index.json');
    return { cacheDir, indexFile };
}

let iconCacheState = null;
let iconCacheStatePromise = null;

async function loadIconCacheState(app) {
    if (iconCacheState) return iconCacheState;
    if (iconCacheStatePromise) return iconCacheStatePromise;

    const { cacheDir, indexFile } = resolveCachePaths(app);

    iconCacheStatePromise = (async () => {
        await fs.mkdir(cacheDir, { recursive: true });
        try {
            const raw = await fs.readFile(indexFile, 'utf8');
            const parsed = JSON.parse(raw);
            iconCacheState = {
                version: parsed.version || ICON_CACHE_VERSION,
                entriesByPath: parsed.entriesByPath || {}
            };
        } catch (err) {
            iconCacheState = { version: ICON_CACHE_VERSION, entriesByPath: {} };
        }
        return iconCacheState;
    })();

    try {
        return await iconCacheStatePromise;
    } finally {
        iconCacheStatePromise = null;
    }
}

async function saveIconCacheState(app, state) {
    const { cacheDir, indexFile } = resolveCachePaths(app);
    await fs.mkdir(cacheDir, { recursive: true });
    await fs.writeFile(indexFile, JSON.stringify(state, null, 2));
}

function buildIconCacheFingerprint(normalizedPath, stats) {
    return createSha1(`${normalizedPath}|${stats.size}|${stats.mtimeMs}`);
}

async function deleteIconCacheFileIfUnused(app, state, fileName, exceptPath) {
    if (!fileName) return;
    const { cacheDir } = resolveCachePaths(app);
    const stillUsed = Object.entries(state.entriesByPath).some(([entryPath, entry]) => {
        if (exceptPath && entryPath === exceptPath) return false;
        return entry && entry.fileName === fileName;
    });
    if (stillUsed) return;
    try {
        await fs.unlink(path.join(cacheDir, fileName));
    } catch (err) {
        void err;
    }
}

async function tryGetCachedIconDataUrl(app, targetPath) {
    const { cacheDir } = resolveCachePaths(app);
    const normalizedPath = path.win32.normalize(targetPath);
    let stats;
    try {
        stats = await fs.stat(normalizedPath);
    } catch (err) {
        return null;
    }

    const state = await loadIconCacheState(app);
    const fingerprint = buildIconCacheFingerprint(normalizedPath, stats);
    const entry = state.entriesByPath[normalizedPath];

    if (!entry) {
        return null;
    }

    if (entry.fingerprint !== fingerprint) {
        return null;
    }

    const cacheFilePath = path.join(cacheDir, entry.fileName);
    try {
        const buffer = await fs.readFile(cacheFilePath);
        const cachedDataUrl = `data:image/png;base64,${buffer.toString('base64')}`;
        const normalizedIcon = cropTransparentPaddingFromDataUrl(cachedDataUrl, { source: 'cache' });
        return normalizedIcon.dataUrl;
    } catch (err) {
        return null;
    }
}

async function storeHighResIconInCache(app, targetPath, base64, meta) {
    const { cacheDir } = resolveCachePaths(app);
    const normalizedPath = path.win32.normalize(targetPath);
    let stats;
    try {
        stats = await fs.stat(normalizedPath);
    } catch (err) {
        return;
    }

    const state = await loadIconCacheState(app);
    const fingerprint = buildIconCacheFingerprint(normalizedPath, stats);
    const fileName = `${fingerprint}.png`;
    const cacheFilePath = path.join(cacheDir, fileName);
    const previousEntry = state.entriesByPath[normalizedPath] || null;
    const buffer = Buffer.from(base64, 'base64');

    await fs.mkdir(cacheDir, { recursive: true });
    await fs.writeFile(cacheFilePath, buffer);
    state.entriesByPath[normalizedPath] = {
        fingerprint,
        fileName,
        size: stats.size,
        mtimeMs: stats.mtimeMs,
        cachedAtMs: Date.now()
    };
    await saveIconCacheState(app, state);
    if (previousEntry && previousEntry.fileName !== fileName) {
        await deleteIconCacheFileIfUnused(app, state, previousEntry.fileName, normalizedPath);
    }
}

module.exports = {
    ICON_CACHE_VERSION,
    resolveCachePaths,
    loadIconCacheState,
    saveIconCacheState,
    buildIconCacheFingerprint,
    deleteIconCacheFileIfUnused,
    tryGetCachedIconDataUrl,
    storeHighResIconInCache
};

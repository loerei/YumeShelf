import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { cropTransparentPaddingFromDataUrl } from './cropper';

export const ICON_CACHE_VERSION = 1;

export interface IconCacheEntry {
    fingerprint: string;
    fileName: string;
    size: number;
    mtimeMs: number;
    cachedAtMs: number;
}

export interface IconCacheState {
    version: number;
    entriesByPath: Record<string, IconCacheEntry>;
}

export interface CacheAppInterface {
    getPath(name: string): string;
}

function createSha1(input: string): string {
    return crypto.createHash('sha1').update(input).digest('hex');
}

export function resolveCachePaths(app: CacheAppInterface) {
    const cacheDir = path.join(app.getPath('userData'), 'high-res-icon-cache');
    const indexFile = path.join(cacheDir, 'index.json');
    return { cacheDir, indexFile };
}

let iconCacheState: IconCacheState | null = null;
let iconCacheStatePromise: Promise<IconCacheState> | null = null;

export async function loadIconCacheState(app: CacheAppInterface): Promise<IconCacheState> {
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

export async function saveIconCacheState(app: CacheAppInterface, state: IconCacheState): Promise<void> {
    const { cacheDir, indexFile } = resolveCachePaths(app);
    await fs.mkdir(cacheDir, { recursive: true });
    await fs.writeFile(indexFile, JSON.stringify(state, null, 2));
}

export function buildIconCacheFingerprint(normalizedPath: string, stats: { size: number; mtimeMs: number }): string {
    return createSha1(`${normalizedPath}|${stats.size}|${stats.mtimeMs}`);
}

export async function deleteIconCacheFileIfUnused(app: CacheAppInterface, state: IconCacheState, fileName: string | null | undefined, exceptPath: string): Promise<void> {
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

export async function tryGetCachedIconDataUrl(app: CacheAppInterface, targetPath: string): Promise<string | null> {
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

export async function storeHighResIconInCache(app: CacheAppInterface, targetPath: string, base64: string, meta: any): Promise<void> {
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

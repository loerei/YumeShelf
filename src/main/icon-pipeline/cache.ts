import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { cropTransparentPaddingFromBuffer } from './cropper';

export const ICON_CACHE_VERSION = 2;

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

let saveTimer: NodeJS.Timeout | null = null;
let pendingSaveApp: CacheAppInterface | null = null;
let isWritingState = false;
let needsAnotherWrite = false;

export function _resetIconCacheStateForTesting(): void {
    if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
    }
    iconCacheState = null;
    iconCacheStatePromise = null;
    pendingSaveApp = null;
    isWritingState = false;
    needsAnotherWrite = false;
}

export async function loadIconCacheState(app: CacheAppInterface): Promise<IconCacheState> {
    if (iconCacheState) return iconCacheState;
    if (iconCacheStatePromise) return iconCacheStatePromise;

    const { cacheDir, indexFile } = resolveCachePaths(app);

    iconCacheStatePromise = (async () => {
        await fs.mkdir(cacheDir, { recursive: true });
        try {
            const raw = await fs.readFile(indexFile, 'utf8');
            const parsed = JSON.parse(raw);
            if (!parsed || parsed.version !== ICON_CACHE_VERSION) {
                iconCacheState = { version: ICON_CACHE_VERSION, entriesByPath: {} };
                try {
                    const files = await fs.readdir(cacheDir);
                    for (const file of files) {
                        if (file !== 'index.json') {
                            await fs.unlink(path.join(cacheDir, file)).catch(() => {});
                        }
                    }
                } catch {}
                scheduleSaveIconCacheState(app, iconCacheState);
            } else {
                iconCacheState = {
                    version: ICON_CACHE_VERSION,
                    entriesByPath: parsed.entriesByPath || {}
                };
            }
        } catch {
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

async function executeAtomicSave(app: CacheAppInterface, state: IconCacheState): Promise<void> {
    if (isWritingState) {
        needsAnotherWrite = true;
        return;
    }
    isWritingState = true;
    try {
        const { cacheDir, indexFile } = resolveCachePaths(app);
        await fs.mkdir(cacheDir, { recursive: true });
        const tempFile = `${indexFile}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
        await fs.writeFile(tempFile, JSON.stringify(state, null, 2));
        await fs.rename(tempFile, indexFile);
    } catch (error) {
        console.error('[MAIN][CACHE] Failed to save icon cache index:', error);
    } finally {
        isWritingState = false;
        if (needsAnotherWrite) {
            needsAnotherWrite = false;
            await executeAtomicSave(app, iconCacheState || state);
        }
    }
}

export function scheduleSaveIconCacheState(app: CacheAppInterface, state: IconCacheState, delayMs = 300): void {
    pendingSaveApp = app;
    if (saveTimer) {
        clearTimeout(saveTimer);
    }
    saveTimer = setTimeout(() => {
        saveTimer = null;
        executeAtomicSave(app, state).catch(() => {});
    }, delayMs);
}

export async function flushPendingIconCacheState(app?: CacheAppInterface): Promise<void> {
    if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
    }
    const targetApp = app || pendingSaveApp;
    if (targetApp && iconCacheState) {
        await executeAtomicSave(targetApp, iconCacheState);
    }
}

export async function saveIconCacheState(app: CacheAppInterface, state: IconCacheState): Promise<void> {
    if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
    }
    await executeAtomicSave(app, state);
}

export function buildIconCacheFingerprint(normalizedPath: string, stats: { size: number; mtimeMs: number }): string {
    return createSha1(`${normalizedPath}|${stats.size}|${stats.mtimeMs}`);
}

export async function deleteIconCacheFileIfUnused(app: CacheAppInterface, state: IconCacheState, fileName: string | null | undefined, exceptPath: string): Promise<void> {
    if (!fileName) return;
    const { cacheDir } = resolveCachePaths(app);
    const stillUsed = Object.entries(state.entriesByPath).some(([entryPath, entry]) => {
        if (exceptPath && entryPath === exceptPath) return false;
        return entry?.fileName === fileName;
    });
    if (stillUsed) return;
    try {
        await fs.unlink(path.join(cacheDir, fileName));
    } catch {
    }
}

export async function tryGetCachedIconBuffer(app: CacheAppInterface, targetPath: string): Promise<Buffer | null> {
    const { cacheDir } = resolveCachePaths(app);
    const normalizedPath = path.win32.normalize(targetPath);
    let stats;
    try {
        stats = await fs.stat(normalizedPath);
    } catch {
        return null;
    }

    const state = await loadIconCacheState(app);
    const fingerprint = buildIconCacheFingerprint(normalizedPath, stats);
    const entry = state.entriesByPath[normalizedPath];

    if (!entry || entry.fingerprint !== fingerprint) {
        return null;
    }

    const cacheFilePath = path.join(cacheDir, entry.fileName);
    try {
        return await fs.readFile(cacheFilePath);
    } catch {
        return null;
    }
}

export async function tryGetCachedIconDataUrl(app: CacheAppInterface, targetPath: string): Promise<string | null> {
    const buffer = await tryGetCachedIconBuffer(app, targetPath);
    if (!buffer) return null;
    return `data:image/png;base64,${buffer.toString('base64')}`;
}

export async function storeHighResIconInCache(
    app: CacheAppInterface,
    targetPath: string,
    bufferOrBase64: Buffer | string,
    meta: any
): Promise<Buffer | null> {
    const { cacheDir } = resolveCachePaths(app);
    const normalizedPath = path.win32.normalize(targetPath);
    let stats;
    try {
        stats = await fs.stat(normalizedPath);
    } catch {
        return null;
    }

    const state = await loadIconCacheState(app);
    const fingerprint = buildIconCacheFingerprint(normalizedPath, stats);
    const fileName = `${fingerprint}.png`;
    const cacheFilePath = path.join(cacheDir, fileName);
    const previousEntry = state.entriesByPath[normalizedPath] || null;
    const rawBuffer = Buffer.isBuffer(bufferOrBase64) ? bufferOrBase64 : Buffer.from(bufferOrBase64, 'base64');
    const { buffer } = cropTransparentPaddingFromBuffer(rawBuffer);

    await fs.mkdir(cacheDir, { recursive: true });
    await fs.writeFile(cacheFilePath, buffer);
    state.entriesByPath[normalizedPath] = {
        fingerprint,
        fileName,
        size: stats.size,
        mtimeMs: stats.mtimeMs,
        cachedAtMs: Date.now()
    };
    scheduleSaveIconCacheState(app, state);
    if (previousEntry && previousEntry.fileName !== fileName) {
        deleteIconCacheFileIfUnused(app, state, previousEntry.fileName, normalizedPath).catch(() => {});
    }
    return buffer;
}


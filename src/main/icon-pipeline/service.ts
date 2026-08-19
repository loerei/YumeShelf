import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import { cropTransparentPaddingFromDataUrl, summarizeNativeImageForDebug } from './cropper';
import {
    tryGetCachedIconDataUrl,
    storeHighResIconInCache,
    loadIconCacheState,
    resolveCachePaths,
    buildIconCacheFingerprint
} from './cache';
import { createWorkerPool } from './worker-pool';

export interface IconPipelineAppInterface {
    getPath(name: string): string;
    getAppPath(): string;
    getFileIcon(path: string, options?: { size: 'small' | 'normal' | 'large' }): Promise<any>;
}

export interface IconPipelineProtocolInterface {
    handle(scheme: string, handler: (request: Request) => Promise<Response> | Response): void;
}

export interface IconPipelineIpcMainInterface {
    handle(channel: string, listener: (event: any, ...args: any[]) => any): void;
}

export interface IconPipelineOptions {
    app: IconPipelineAppInterface;
    protocol: IconPipelineProtocolInterface;
    ipcMain: IconPipelineIpcMainInterface;
    sourceRootDir: string;
}

export interface IconPayload {
    dataUrl: string;
    fit: 'cover' | 'contain';
    source: string;
    debug: any;
}

export interface LocalGameImageResult {
    imgPath: string;
    ext: string;
}

const LOCAL_IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp'];
const LOCAL_IMAGE_CANDIDATE_PATTERNS = [
    (dir: string, ext: string) => path.join(dir, `icon.${ext}`),
    (dir: string, ext: string) => path.join(dir, `cover.${ext}`),
    (dir: string, ext: string) => path.join(dir, `folder.${ext}`),
    (dir: string, ext: string) => path.join(dir, 'icon', `icon.${ext}`),
    (dir: string, ext: string) => path.join(dir, 'icon', `cover.${ext}`),
    (dir: string, ext: string) => path.join(dir, 'www', 'icon', `icon.${ext}`)
];

export function findLocalGameImage(targetPath: string): LocalGameImageResult | null {
    const dir = path.dirname(targetPath);
    for (const pattern of LOCAL_IMAGE_CANDIDATE_PATTERNS) {
        for (const ext of LOCAL_IMAGE_EXTENSIONS) {
            const imgPath = pattern(dir, ext);
            if (fsSync.existsSync(imgPath)) {
                return { imgPath, ext };
            }
        }
    }
    return null;
}

export interface IconPipeline {
    registerIpcHandler(): void;
    registerProtocolHandler(): void;
}

function createIconPayload(dataUrl: string, fit = 'contain', source = 'unknown', debug: any = null): IconPayload {
    return {
        dataUrl,
        fit: fit === 'cover' ? 'cover' : 'contain',
        source,
        debug
    };
}

export function createIconPipeline({
    app,
    protocol,
    ipcMain,
    sourceRootDir
}: IconPipelineOptions): IconPipeline {
    const pool = createWorkerPool({ app, sourceRootDir });

    async function resolveIconDataUrl(targetPath: string): Promise<IconPayload> {
        const localImg = findLocalGameImage(targetPath);
        if (localImg) {
            try {
                const buffer = await fs.readFile(localImg.imgPath);
                const mimeType = localImg.ext === 'jpg' ? 'image/jpeg' : `image/${localImg.ext}`;
                return createIconPayload(
                    `data:${mimeType};base64,${buffer.toString('base64')}`,
                    'contain',
                    'local-image',
                    { imagePath: localImg.imgPath }
                );
            } catch (error) {
                console.error(`[MAIN][ICON] Failed to read local image ${localImg.imgPath}:`, error);
            }
        }

        const cachedIconDataUrl = await tryGetCachedIconDataUrl(app, targetPath);
        if (cachedIconDataUrl) {
            return createIconPayload(cachedIconDataUrl, 'contain', 'cached-high-res');
        }

        try {
            const result = await pool.enqueueExtraction(targetPath);
            if (result?.base64) {
                try {
                    await storeHighResIconInCache(app, targetPath, result.base64, result.meta || null);
                } catch (cacheErr) {
                }
                const highResDataUrl = `data:image/png;base64,${result.base64}`;
                const normalizedHighRes = cropTransparentPaddingFromDataUrl(highResDataUrl, { source: 'extracted-high-res' });
                return createIconPayload(
                    normalizedHighRes.dataUrl,
                    'contain',
                    'extracted-high-res',
                    {
                        extractor: result.meta || null,
                        crop: normalizedHighRes.summary || null
                    }
                );
            }
        } catch (error) {
            console.error('[MAIN][IPC] extract-file-icon node-worker error:', error);
        }

        const icon = await app.getFileIcon(targetPath, { size: 'large' });
        const fallbackDebug = summarizeNativeImageForDebug(icon);
        return createIconPayload(icon.toDataURL(), 'cover', 'app-file-icon-fallback', fallbackDebug);
    }

    async function handleProtocolRequest(request: Request): Promise<Response> {
        try {
            const urlObj = new URL(request.url);
            const targetPath = urlObj.searchParams.get('path');
            if (!targetPath) return new Response('Missing path', { status: 400 });

            const localImg = findLocalGameImage(targetPath);
            if (localImg) {
                const buffer = await fs.readFile(localImg.imgPath);
                const contentType = localImg.ext === 'jpg' ? 'image/jpeg' : `image/${localImg.ext}`;
                return new Response(buffer, { headers: { 'Content-Type': contentType } });
            }

            const { cacheDir } = resolveCachePaths(app);
            const normalizedPath = path.win32.normalize(targetPath);
            let stats: fsSync.Stats | null = null;
            try { stats = await fs.stat(normalizedPath); } catch (_error) {}
            if (stats) {
                const state = await loadIconCacheState(app);
                const fingerprint = buildIconCacheFingerprint(normalizedPath, stats);
                const entry = state.entriesByPath[normalizedPath];
                if (entry?.fingerprint === fingerprint) {
                    const cacheFilePath = path.join(cacheDir, entry.fileName);
                    try {
                        const buffer = await fs.readFile(cacheFilePath);
                        return new Response(buffer, { headers: { 'Content-Type': 'image/png' } });
                    } catch {}
                }
            }

            try {
                const result = await pool.enqueueExtraction(targetPath);
                if (result?.base64) {
                    const buffer = Buffer.from(result.base64, 'base64');
                    storeHighResIconInCache(app, targetPath, result.base64, result.meta || null).catch(() => {});
                    return new Response(buffer, { headers: { 'Content-Type': 'image/png' } });
                }
            } catch (error) {
                console.error('[MAIN][PROTOCOL] extract-file-icon node-worker error:', error);
            }

            const icon = await app.getFileIcon(targetPath, { size: 'large' });
            return new Response(icon.toPNG(), { headers: { 'Content-Type': 'image/png' } });
        } catch (error) {
            console.error('[MAIN][PROTOCOL] game-icon error:', error);
            return new Response('Internal error', { status: 500 });
        }
    }

    function registerProtocolHandler(): void {
        protocol.handle('game-icon', handleProtocolRequest);
    }

    function registerIpcHandler(): void {
        ipcMain.handle('get-icon', async (_event, targetPath) => {
            try {
                return await resolveIconDataUrl(targetPath);
            } catch (error) {
                console.error(`[MAIN][IPC] get-icon top-level error for ${targetPath}:`, error);
                return null;
            }
        });
    }

    return {
        registerIpcHandler,
        registerProtocolHandler
    };
}

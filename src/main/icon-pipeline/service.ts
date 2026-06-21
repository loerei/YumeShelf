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

export interface IconPipeline {
    registerIpcHandler(): void;
    registerProtocolHandler(): void;
}

export function createIconPipeline({
    app,
    protocol,
    ipcMain,
    sourceRootDir
}: IconPipelineOptions): IconPipeline {
    const pool = createWorkerPool({ app, sourceRootDir });

    function createIconPayload(dataUrl: string, fit = 'contain', source = 'unknown', debug: any = null): IconPayload {
        return {
            dataUrl,
            fit: fit === 'cover' ? 'cover' : 'contain',
            source,
            debug
        };
    }

    async function resolveIconDataUrl(targetPath: string): Promise<IconPayload> {
        const dir = path.dirname(targetPath);
        const exts = ['png', 'jpg', 'jpeg', 'webp'];
        const names = ['icon', 'cover', 'folder'];
        for (const name of names) {
            for (const ext of exts) {
                const imgPath = path.join(dir, `${name}.${ext}`);
                if (fsSync.existsSync(imgPath)) {
                    return createIconPayload(
                        `file:///${imgPath.replace(/\\/g, '/')}`,
                        'contain',
                        'local-image',
                        { imagePath: imgPath }
                    );
                }
            }
        }

        const cachedIconDataUrl = await tryGetCachedIconDataUrl(app, targetPath);
        if (cachedIconDataUrl) {
            return createIconPayload(cachedIconDataUrl, 'contain', 'cached-high-res');
        }

        try {
            const result = await pool.enqueueExtraction(targetPath);
            if (result && result.base64) {
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

            const dir = path.dirname(targetPath);
            const exts = ['png', 'jpg', 'jpeg', 'webp'];
            const names = ['icon', 'cover', 'folder'];
            for (const name of names) {
                for (const ext of exts) {
                    const imgPath = path.join(dir, `${name}.${ext}`);
                    if (fsSync.existsSync(imgPath)) {
                        const buffer = await fs.readFile(imgPath);
                        const contentType = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
                        return new Response(buffer, { headers: { 'Content-Type': contentType } });
                    }
                }
            }

            const { cacheDir } = resolveCachePaths(app);
            const normalizedPath = path.win32.normalize(targetPath);
            let stats: fsSync.Stats | null = null;
            try { stats = await fs.stat(normalizedPath); } catch (_error) {}
            if (stats) {
                const state = await loadIconCacheState(app);
                const fingerprint = buildIconCacheFingerprint(normalizedPath, stats);
                const entry = state.entriesByPath[normalizedPath];
                if (entry && entry.fingerprint === fingerprint) {
                    const cacheFilePath = path.join(cacheDir, entry.fileName);
                    try {
                        const buffer = await fs.readFile(cacheFilePath);
                        return new Response(buffer, { headers: { 'Content-Type': 'image/png' } });
                    } catch (_error) {}
                }
            }

            try {
                const result = await pool.enqueueExtraction(targetPath);
                if (result && result.base64) {
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

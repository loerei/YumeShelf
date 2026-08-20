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
import { extractPeIcon } from './pe-resource-decoder';
import { findDesktopEntryIcon } from './desktop-entry';

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

const LOCAL_IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'svg', 'ico'];
const LOCAL_IMAGE_CANDIDATE_PATTERNS = [
    (dir: string, ext: string) => path.join(dir, `icon.${ext}`),
    (dir: string, ext: string) => path.join(dir, `cover.${ext}`),
    (dir: string, ext: string) => path.join(dir, `folder.${ext}`),
    (dir: string, ext: string) => path.join(dir, 'icon', `icon.${ext}`),
    (dir: string, ext: string) => path.join(dir, 'icon', `cover.${ext}`),
    (dir: string, ext: string) => path.join(dir, 'www', 'icon', `icon.${ext}`)
];

export function getImageMimeType(ext: string): string {
    const cleanExt = ext.replace(/^\./, '').toLowerCase();
    switch (cleanExt) {
        case 'jpg':
        case 'jpeg':
            return 'image/jpeg';
        case 'svg':
            return 'image/svg+xml';
        case 'ico':
            return 'image/x-icon';
        case 'webp':
            return 'image/webp';
        case 'png':
        default:
            return 'image/png';
    }
}

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

    // Check for Linux desktop entry icon
    const desktopIcon = findDesktopEntryIcon(targetPath);
    if (desktopIcon) {
        const ext = path.extname(desktopIcon).replace(/^\./, '').toLowerCase() || 'png';
        return { imgPath: desktopIcon, ext };
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
        // Stage 1: Local Game Assets
        const localImg = findLocalGameImage(targetPath);
        if (localImg) {
            try {
                const buffer = await fs.readFile(localImg.imgPath);
                const mimeType = getImageMimeType(localImg.ext);
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

        // Stage 2: Cache Hit
        const cachedIconDataUrl = await tryGetCachedIconDataUrl(app, targetPath);
        if (cachedIconDataUrl) {
            return createIconPayload(cachedIconDataUrl, 'contain', 'cached-high-res');
        }

        // Stage 3: Pure TypeScript PE Resource Decoder (.exe)
        if (targetPath.toLowerCase().endsWith('.exe')) {
            try {
                const peIcon = extractPeIcon(targetPath);
                if (peIcon) {
                    const base64 = peIcon.buffer.toString('base64');
                    if (peIcon.isPng) {
                        try {
                            await storeHighResIconInCache(app, targetPath, base64, {
                                source: 'pe-rsrc',
                                width: peIcon.width,
                                height: peIcon.height
                            });
                        } catch {}
                        const highResDataUrl = `data:image/png;base64,${base64}`;
                        const normalizedHighRes = cropTransparentPaddingFromDataUrl(highResDataUrl, {
                            source: 'pe-rsrc-extracted'
                        });
                        return createIconPayload(
                            normalizedHighRes.dataUrl,
                            'contain',
                            'pe-rsrc-extracted',
                            {
                                width: peIcon.width,
                                height: peIcon.height,
                                crop: normalizedHighRes.summary || null
                            }
                        );
                    } else {
                        // Synthesized ICO
                        return createIconPayload(
                            `data:image/x-icon;base64,${base64}`,
                            'contain',
                            'pe-rsrc-ico',
                            { width: peIcon.width, height: peIcon.height }
                        );
                    }
                }
            } catch (peErr) {
                console.warn(`[MAIN][ICON] PE resource extraction error for ${targetPath}:`, peErr);
            }
        }

        // Stage 4: Worker Pool (Windows native addon fallback)
        if (process.platform === 'win32') {
            try {
                const result = await pool.enqueueExtraction(targetPath);
                if (result?.base64) {
                    try {
                        await storeHighResIconInCache(app, targetPath, result.base64, result.meta || null);
                    } catch {}
                    const highResDataUrl = `data:image/png;base64,${result.base64}`;
                    const normalizedHighRes = cropTransparentPaddingFromDataUrl(highResDataUrl, {
                        source: 'extracted-high-res'
                    });
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
        }

        // Stage 5: App Native File Icon Fallback
        const icon = await app.getFileIcon(targetPath, { size: 'large' });
        const fallbackDebug = summarizeNativeImageForDebug(icon);
        return createIconPayload(icon.toDataURL(), 'cover', 'app-file-icon-fallback', fallbackDebug);
    }

    async function handleProtocolRequest(request: Request): Promise<Response> {
        try {
            const urlObj = new URL(request.url);
            const targetPath = urlObj.searchParams.get('path');
            if (!targetPath) return new Response('Missing path', { status: 400 });

            // Stage 1: Local Game Assets
            const localImg = findLocalGameImage(targetPath);
            if (localImg) {
                const buffer = await fs.readFile(localImg.imgPath);
                const contentType = getImageMimeType(localImg.ext);
                return new Response(buffer, { headers: { 'Content-Type': contentType } });
            }

            // Stage 2: Cache Hit
            const { cacheDir } = resolveCachePaths(app);
            const normalizedPath = path.win32.normalize(targetPath);
            let stats: fsSync.Stats | null = null;
            try { stats = await fs.stat(normalizedPath); } catch {}
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

            // Stage 3: Pure TypeScript PE Resource Decoder (.exe)
            if (targetPath.toLowerCase().endsWith('.exe')) {
                try {
                    const peIcon = extractPeIcon(targetPath);
                    if (peIcon) {
                        if (peIcon.isPng) {
                            storeHighResIconInCache(app, targetPath, peIcon.buffer.toString('base64'), {
                                source: 'pe-rsrc',
                                width: peIcon.width,
                                height: peIcon.height
                            }).catch(() => {});
                        }
                        return new Response(peIcon.buffer as any, {
                            headers: { 'Content-Type': peIcon.mimeType }
                        });
                    }
                } catch (peErr) {
                    console.warn(`[MAIN][PROTOCOL] PE resource decode error for ${targetPath}:`, peErr);
                }
            }

            // Stage 4: Worker Pool (Windows native addon fallback)
            if (process.platform === 'win32') {
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
            }

            // Stage 5: App Native File Icon Fallback
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

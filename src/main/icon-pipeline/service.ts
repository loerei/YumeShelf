import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as os from 'node:os';
import { nativeImage } from 'electron';
import { cropTransparentPaddingFromBuffer, cropTransparentPaddingFromDataUrl, summarizeNativeImageForDebug } from './cropper';
import {
    tryGetCachedIconDataUrl,
    tryGetCachedIconBuffer,
    storeHighResIconInCache,
    flushPendingIconCacheState
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
    nativeImage?: any;
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
    flushCache(): Promise<void>;
}

function createIconPayload(dataUrl: string, fit = 'contain', source = 'unknown', debug: any = null): IconPayload {
    return {
        dataUrl,
        fit: fit === 'cover' ? 'cover' : 'contain',
        source,
        debug
    };
}

export function convertIcoBufferToPng(icoBuffer: Buffer, customNativeImage?: any): Buffer | null {
    try {
        const factory = customNativeImage || (typeof nativeImage !== 'undefined' ? nativeImage : null);
        if (factory) {
            if (typeof factory.createFromBuffer === 'function') {
                const img = factory.createFromBuffer(icoBuffer);
                if (img && typeof img.isEmpty === 'function' && !img.isEmpty() && typeof img.toPNG === 'function') {
                    return img.toPNG();
                }
            }
            if (typeof factory.createFromPath === 'function') {
                const tempIcoPath = path.join(
                    os.tmpdir(),
                    `yume-icon-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.ico`
                );
                try {
                    fsSync.writeFileSync(tempIcoPath, icoBuffer);
                    const img = factory.createFromPath(tempIcoPath);
                    if (img && typeof img.isEmpty === 'function' && !img.isEmpty() && typeof img.toPNG === 'function') {
                        return img.toPNG();
                    }
                } finally {
                    try { fsSync.unlinkSync(tempIcoPath); } catch {}
                }
            }
        }
    } catch (err) {
        console.warn('[MAIN][ICON] Failed to convert ICO buffer to PNG:', err);
    }
    return null;
}

export function createIconPipeline({
    app,
    protocol,
    ipcMain,
    sourceRootDir,
    nativeImage: customNativeImage
}: IconPipelineOptions): IconPipeline {
    const pool = createWorkerPool({ app, sourceRootDir });
    const nativeImageFactory = customNativeImage || (typeof nativeImage !== 'undefined' ? nativeImage : null);

    async function resolveIconDataUrl(targetPath: string): Promise<IconPayload> {
        // Stage 1: Cache Hit (checked first to avoid redundant sync file scans on warm cache)
        const cachedIconDataUrl = await tryGetCachedIconDataUrl(app, targetPath);
        if (cachedIconDataUrl) {
            return createIconPayload(cachedIconDataUrl, 'contain', 'cached-high-res');
        }

        // Stage 2: Local Game Assets
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

        // Stage 3: Pure TypeScript PE Resource Decoder (.exe)
        if (targetPath.toLowerCase().endsWith('.exe')) {
            try {
                const peIcon = extractPeIcon(targetPath);
                if (peIcon) {
                    if (peIcon.isPng) {
                        const { buffer: croppedBuffer, summary: cropSummary } = cropTransparentPaddingFromBuffer(peIcon.buffer);
                        try {
                            await storeHighResIconInCache(app, targetPath, croppedBuffer, {
                                source: 'pe-rsrc',
                                width: peIcon.width,
                                height: peIcon.height
                            });
                        } catch {}
                        const highResDataUrl = `data:image/png;base64,${croppedBuffer.toString('base64')}`;
                        return createIconPayload(
                            highResDataUrl,
                            'contain',
                            'pe-rsrc-extracted',
                            {
                                width: peIcon.width,
                                height: peIcon.height,
                                crop: cropSummary || null
                            }
                        );
                    } else {
                        // Standard ICO: convert to PNG via nativeImage before caching
                        const pngBuf = convertIcoBufferToPng(peIcon.buffer, nativeImageFactory);
                        if (pngBuf) {
                            const { buffer: croppedBuffer, summary: cropSummary } = cropTransparentPaddingFromBuffer(pngBuf);
                            try {
                                await storeHighResIconInCache(app, targetPath, croppedBuffer, {
                                    source: 'pe-rsrc-ico-converted',
                                    width: peIcon.width,
                                    height: peIcon.height
                                });
                            } catch {}
                            const highResDataUrl = `data:image/png;base64,${croppedBuffer.toString('base64')}`;
                            return createIconPayload(
                                highResDataUrl,
                                'contain',
                                'pe-rsrc-ico-converted',
                                {
                                    width: peIcon.width,
                                    height: peIcon.height,
                                    crop: cropSummary || null
                                }
                            );
                        } else {
                            // Fallback: If transcoding fails, return synthesized ICO dataUrl directly (identical to main)
                            const base64 = peIcon.buffer.toString('base64');
                            return createIconPayload(
                                `data:image/x-icon;base64,${base64}`,
                                'contain',
                                'pe-rsrc-ico',
                                { width: peIcon.width, height: peIcon.height }
                            );
                        }
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
                    const rawBuffer = Buffer.from(result.base64, 'base64');
                    const { buffer: croppedBuffer, summary: cropSummary } = cropTransparentPaddingFromBuffer(rawBuffer);
                    try {
                        await storeHighResIconInCache(app, targetPath, croppedBuffer, result.meta || null);
                    } catch {}
                    const highResDataUrl = `data:image/png;base64,${croppedBuffer.toString('base64')}`;
                    return createIconPayload(
                        highResDataUrl,
                        'contain',
                        'extracted-high-res',
                        {
                            extractor: result.meta || null,
                            crop: cropSummary || null
                        }
                    );
                }
            } catch (error) {
                console.error('[MAIN][IPC] extract-file-icon node-worker error:', error);
            }
        }

        // Stage 5: App Native File Icon Fallback
        const icon = await app.getFileIcon(targetPath, { size: 'large' });
        const fallbackPng = icon.toPNG();
        const { buffer: croppedFallback, summary: cropSummary } = cropTransparentPaddingFromBuffer(fallbackPng);
        try {
            await storeHighResIconInCache(app, targetPath, croppedFallback, {
                source: 'app-file-icon-fallback'
            });
        } catch {}
        return createIconPayload(
            `data:image/png;base64,${croppedFallback.toString('base64')}`,
            'contain',
            'app-file-icon-fallback',
            cropSummary || null
        );
    }

    async function handleProtocolRequest(request: Request): Promise<Response> {
        try {
            const urlObj = new URL(request.url);
            const targetPath = urlObj.searchParams.get('path');
            if (!targetPath) return new Response('Missing path', { status: 400 });

            // Stage 1: Cache Hit (checked first to avoid redundant sync file scans on warm cache)
            const cachedBuffer = await tryGetCachedIconBuffer(app, targetPath);
            if (cachedBuffer) {
                return new Response(cachedBuffer as any, { headers: { 'Content-Type': 'image/png' } });
            }

            // Stage 2: Local Game Assets
            const localImg = findLocalGameImage(targetPath);
            if (localImg) {
                const buffer = await fs.readFile(localImg.imgPath);
                const contentType = getImageMimeType(localImg.ext);
                return new Response(buffer, { headers: { 'Content-Type': contentType } });
            }

            // Stage 3: Pure TypeScript PE Resource Decoder (.exe)
            if (targetPath.toLowerCase().endsWith('.exe')) {
                try {
                    const peIcon = extractPeIcon(targetPath);
                    if (peIcon) {
                        if (peIcon.isPng) {
                            const { buffer: croppedBuffer } = cropTransparentPaddingFromBuffer(peIcon.buffer);
                            storeHighResIconInCache(app, targetPath, croppedBuffer, {
                                source: 'pe-rsrc',
                                width: peIcon.width,
                                height: peIcon.height
                            }).catch(() => {});
                            return new Response(croppedBuffer as any, {
                                headers: { 'Content-Type': 'image/png' }
                            });
                        } else {
                            // Standard ICO: convert to PNG via nativeImage before caching
                            const pngBuf = convertIcoBufferToPng(peIcon.buffer, nativeImageFactory);
                            if (pngBuf) {
                                const { buffer: croppedBuffer } = cropTransparentPaddingFromBuffer(pngBuf);
                                storeHighResIconInCache(app, targetPath, croppedBuffer, {
                                    source: 'pe-rsrc-ico-converted',
                                    width: peIcon.width,
                                    height: peIcon.height
                                }).catch(() => {});
                                return new Response(croppedBuffer as any, {
                                    headers: { 'Content-Type': 'image/png' }
                                });
                            } else {
                                // Fallback: If transcoding fails, return raw ICO buffer with image/x-icon (identical to main)
                                return new Response(peIcon.buffer as any, {
                                    headers: { 'Content-Type': peIcon.mimeType || 'image/x-icon' }
                                });
                            }
                        }
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
                        const rawBuffer = Buffer.from(result.base64, 'base64');
                        const { buffer: croppedBuffer } = cropTransparentPaddingFromBuffer(rawBuffer);
                        storeHighResIconInCache(app, targetPath, croppedBuffer, result.meta || null).catch(() => {});
                        return new Response(croppedBuffer as any, { headers: { 'Content-Type': 'image/png' } });
                    }
                } catch (error) {
                    console.error('[MAIN][PROTOCOL] extract-file-icon node-worker error:', error);
                }
            }

            // Stage 5: App Native File Icon Fallback
            const icon = await app.getFileIcon(targetPath, { size: 'large' });
            const fallbackPng = icon.toPNG();
            const { buffer: croppedFallback } = cropTransparentPaddingFromBuffer(fallbackPng);
            storeHighResIconInCache(app, targetPath, croppedFallback, {
                source: 'app-file-icon-fallback'
            }).catch(() => {});
            return new Response(croppedFallback as any, { headers: { 'Content-Type': 'image/png' } });
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
        registerProtocolHandler,
        flushCache: () => flushPendingIconCacheState(app)
    };
}

import * as path from 'node:path';
import * as fsSync from 'node:fs';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import { nativeImage } from 'electron';
import { cropTransparentPaddingFromBuffer } from './cropper';
import {
    tryGetCachedIconBuffer,
    storeHighResIconInCache,
    flushPendingIconCacheState
} from './cache';
import { createWorkerPool } from './worker-pool';
import {
    YumeEngine,
    type ExtractIconOptions,
    type ExtractedGameIcon,
    resolveBundleRoot,
    findLocalGameImageSync,
    getImageMimeType,
    LOCAL_IMAGE_CANDIDATE_PATTERNS,
    LOCAL_IMAGE_EXTENSIONS,
    type LocalGameImageResult
} from '@yumeshelf/engine';

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
    extractIconOptions?: Partial<ExtractIconOptions>;
}

export interface IconPayload {
    dataUrl: string;
    fit: 'cover' | 'contain';
    source: string;
    debug: any;
}

export interface ProcessedIconResult {
    buffer: Buffer;
    mimeType: string;
    source:
        | 'cached-high-res'
        | 'local-image'
        | 'desktop-entry'
        | 'pe-rsrc-extracted'
        | 'pe-rsrc-ico-converted'
        | 'pe-rsrc-ico'
        | 'app-bundle-extracted'
        | 'extracted-high-res'
        | 'app-file-icon-fallback';
    width?: number;
    height?: number;
    crop?: any;
    debug?: any;
}

export function findLocalGameImage(targetPath: string): LocalGameImageResult | null {
    const result = findLocalGameImageSync(targetPath);
    if (!result) return null;
    return {
        ...result,
        imgPath: path.normalize(result.imgPath)
    };
}
export { getImageMimeType, LOCAL_IMAGE_CANDIDATE_PATTERNS, LOCAL_IMAGE_EXTENSIONS } from '@yumeshelf/engine';
export type { LocalGameImageResult } from '@yumeshelf/engine';

export const defensiveHeaders = {
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'"
};

export function isValidIconTargetPath(targetPath: string): boolean {
    if (!targetPath || typeof targetPath !== 'string') return false;
    // Reject null bytes and URL-encoded null bytes
    if (targetPath.includes('\0') || targetPath.includes('%00')) return false;
    // Reject remote UNC paths (\\server\share or //server/share or multiple slashes)
    if (/^[\\\/]{2}/.test(targetPath)) return false;
    // Reject Windows NT device namespace prefixes (\??\UNC\... or /?/UNC/...) and question mark characters
    if (targetPath.includes('?') || /^[\\\/]\?/.test(targetPath)) return false;
    // Disallow colons beyond drive letter designation at index 1 (blocks NTFS ADS and DOS device suffixes)
    if (targetPath.slice(2).includes(':')) return false;
    // Cross-platform absolute path verification
    const isAbsolute = path.isAbsolute(targetPath) || path.posix.isAbsolute(targetPath) || path.win32.isAbsolute(targetPath);
    if (!isAbsolute) return false;

    // Reject Windows DOS device names (CON, PRN, AUX, NUL, COM1-9, LPT1-9, CONIN$, CONOUT$) across all path segments
    const normalized = targetPath.replace(/\\/g, '/');
    const segments = normalized.split('/').filter(Boolean);
    const dosDeviceRegex = /^(con|prn|aux|nul|com[1-9]|lpt[1-9]|conin\$|conout\$)([.:\s].*)?$/i;
    if (segments.some(seg => dosDeviceRegex.test(seg))) return false;

    return true;
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
        const factory = customNativeImage ?? nativeImage ?? null;
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
                    `yume-icon-${process.pid}-${Date.now()}-${crypto.randomUUID()}.ico`
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

export function createIconPipeline(pipelineOptions: IconPipelineOptions): IconPipeline {
    const {
        app,
        protocol,
        ipcMain,
        sourceRootDir,
        nativeImage: customNativeImage,
        extractIconOptions
    } = pipelineOptions;
    const pool = createWorkerPool({ app, sourceRootDir });
    const nativeImageFactory = customNativeImage ?? nativeImage ?? null;

    async function processIconExtraction(
        targetPath: string,
        signal?: AbortSignal,
        options?: Partial<ExtractIconOptions>
    ): Promise<ProcessedIconResult | null> {
        if (!targetPath || typeof targetPath !== 'string') {
            return null;
        }
        if (signal?.aborted) {
            return null;
        }

        // Stage 1: Disk Cache Lookup
        const cachedBuffer = await tryGetCachedIconBuffer(app, targetPath);
        if (cachedBuffer) {
            return {
                buffer: cachedBuffer,
                mimeType: 'image/png',
                source: 'cached-high-res'
            };
        }

        // Stage 2 & 3: Headless Engine Delegation
        let extracted: ExtractedGameIcon | null = null;
        try {
            const extractOptions: ExtractIconOptions = {
                ...extractIconOptions,
                ...options,
                signal: signal ?? options?.signal ?? extractIconOptions?.signal
            };
            extracted = await YumeEngine.extractIcon(targetPath, extractOptions);
        } catch (err) {
            console.warn(`[MAIN][ICON] Engine extraction error for ${targetPath}:`, err);
            extracted = null;
        }

        if (signal?.aborted) {
            return null;
        }

        if (extracted !== null) {
            if (extracted.source === 'local-image' || extracted.source === 'desktop-entry') {
                return {
                    buffer: extracted.buffer,
                    mimeType: extracted.mimeType,
                    source: extracted.source,
                    debug: extracted.filePath ? { imagePath: extracted.filePath } : null
                };
            }

            if (extracted.source === 'pe-rsrc' || extracted.source === 'pe-resource') {
                if (extracted.isPng) {
                    const { buffer: croppedBuffer, summary: cropSummary } = cropTransparentPaddingFromBuffer(
                        extracted.buffer,
                        { nativeImage: nativeImageFactory }
                    );
                    storeHighResIconInCache(app, targetPath, croppedBuffer, {
                        source: 'pe-rsrc',
                        width: extracted.width,
                        height: extracted.height
                    }).catch(() => {});
                    return {
                        buffer: croppedBuffer,
                        mimeType: 'image/png',
                        source: 'pe-rsrc-extracted',
                        width: extracted.width,
                        height: extracted.height,
                        crop: cropSummary
                    };
                } else {
                    const pngBuf = convertIcoBufferToPng(extracted.buffer, nativeImageFactory);
                    if (pngBuf) {
                        const { buffer: croppedBuffer, summary: cropSummary } = cropTransparentPaddingFromBuffer(
                            pngBuf,
                            { nativeImage: nativeImageFactory }
                        );
                        storeHighResIconInCache(app, targetPath, croppedBuffer, {
                            source: 'pe-rsrc-ico-converted',
                            width: extracted.width,
                            height: extracted.height
                        }).catch(() => {});
                        return {
                            buffer: croppedBuffer,
                            mimeType: 'image/png',
                            source: 'pe-rsrc-ico-converted',
                            width: extracted.width,
                            height: extracted.height,
                            crop: cropSummary
                        };
                    } else {
                        return {
                            buffer: extracted.buffer,
                            mimeType: 'image/x-icon',
                            source: 'pe-rsrc-ico',
                            width: extracted.width,
                            height: extracted.height
                        };
                    }
                }
            }

            if (extracted.source === 'app-bundle') {
                if (extracted.isPng) {
                    const { buffer: croppedBuffer, summary: cropSummary } = cropTransparentPaddingFromBuffer(
                        extracted.buffer,
                        { nativeImage: nativeImageFactory }
                    );
                    storeHighResIconInCache(app, targetPath, croppedBuffer, { source: 'app-bundle' }).catch(() => {});
                    return {
                        buffer: croppedBuffer,
                        mimeType: 'image/png',
                        source: 'app-bundle-extracted',
                        crop: cropSummary
                    };
                } else {
                    if (nativeImageFactory && typeof nativeImageFactory.createFromBuffer === 'function') {
                        try {
                            const img = nativeImageFactory.createFromBuffer(extracted.buffer);
                            if (img && typeof img.isEmpty === 'function' && !img.isEmpty() && typeof img.toPNG === 'function') {
                                const pngBuffer = img.toPNG();
                                const { buffer: croppedBuffer, summary: cropSummary } = cropTransparentPaddingFromBuffer(
                                    pngBuffer,
                                    { nativeImage: nativeImageFactory }
                                );
                                storeHighResIconInCache(app, targetPath, croppedBuffer, { source: 'app-bundle' }).catch(() => {});
                                return {
                                    buffer: croppedBuffer,
                                    mimeType: 'image/png',
                                    source: 'app-bundle-extracted',
                                    crop: cropSummary
                                };
                            }
                        } catch {
                            // Ignore error and fall through to Stage 5
                        }
                    }
                    // Strict PNG egress: if nativeImageFactory is omitted, throws, or produces an empty/invalid image,
                    // DO NOT return raw .icns bytes; fall through to Stage 5 (app.getFileIcon).
                }
            }
        }

        // Stage 4: Windows Native Worker Pool Fallback (PE binaries only)
        const isMacBundle = targetPath.toLowerCase().endsWith('.app') || Boolean(resolveBundleRoot(targetPath));
        const currentPlatform = options?.targetPlatform ?? extractIconOptions?.targetPlatform ?? process.platform;

        if (currentPlatform === 'win32' && !isMacBundle && !signal?.aborted) {
            try {
                const result = await pool.enqueueExtraction(targetPath);
                if (result?.base64) {
                    const rawBuffer = Buffer.from(result.base64, 'base64');
                    const { buffer: croppedBuffer, summary: cropSummary } = cropTransparentPaddingFromBuffer(
                        rawBuffer,
                        { nativeImage: nativeImageFactory }
                    );
                    storeHighResIconInCache(app, targetPath, croppedBuffer, result.meta || null).catch(() => {});
                    return {
                        buffer: croppedBuffer,
                        mimeType: 'image/png',
                        source: 'extracted-high-res',
                        crop: cropSummary,
                        debug: { extractor: result.meta || null }
                    };
                }
            } catch (error) {
                console.error('[MAIN][IPC] extract-file-icon node-worker error:', error);
            }
        }

        // Stage 5: App Native File Icon Fallback
        if (signal?.aborted) {
            return null;
        }

        try {
            const icon = await app.getFileIcon(targetPath, { size: 'large' });
            if (!icon || (typeof icon.isEmpty === 'function' && icon.isEmpty())) return null;
            const fallbackBuffer = icon.toPNG();
            const { buffer: croppedFallback, summary: cropSummary } = cropTransparentPaddingFromBuffer(
                fallbackBuffer,
                { nativeImage: nativeImageFactory }
            );
            storeHighResIconInCache(app, targetPath, croppedFallback, {
                source: 'app-file-icon-fallback'
            }).catch(() => {});
            return {
                buffer: croppedFallback,
                mimeType: 'image/png',
                source: 'app-file-icon-fallback',
                crop: cropSummary
            };
        } catch {
            return null;
        }
    }

    async function resolveIconDataUrl(targetPath: string): Promise<IconPayload | null> {
        if (!isValidIconTargetPath(targetPath)) {
            return null;
        }

        const result = await processIconExtraction(
            targetPath,
            undefined,
            extractIconOptions
        );
        if (!result) {
            return createIconPayload('', 'contain', 'unknown', null);
        }

        const dataUrl = `data:${result.mimeType};base64,${result.buffer.toString('base64')}`;
        let debug: any = result.debug ?? null;
        if (!debug) {
            if (result.source === 'app-file-icon-fallback') {
                debug = result.crop || null;
            } else if (result.source === 'pe-rsrc-ico') {
                debug = {
                    ...(result.width !== undefined ? { width: result.width } : {}),
                    ...(result.height !== undefined ? { height: result.height } : {})
                };
            } else if (result.width !== undefined || result.height !== undefined || result.crop) {
                debug = {
                    ...(result.width !== undefined ? { width: result.width } : {}),
                    ...(result.height !== undefined ? { height: result.height } : {}),
                    crop: result.crop || null
                };
            }
        } else if (result.source === 'extracted-high-res' && result.crop && !debug.crop) {
            debug = { ...debug, crop: result.crop || null };
        }

        return createIconPayload(dataUrl, 'contain', result.source, debug);
    }

    async function handleProtocolRequest(request: Request): Promise<Response> {
        try {
            if (request.signal?.aborted) {
                return new Response(null, { status: 499, headers: defensiveHeaders });
            }

            const urlObj = new URL(request.url);
            const targetPath = urlObj.searchParams.get('path');
            if (!targetPath || !isValidIconTargetPath(targetPath)) {
                return new Response('Invalid or forbidden path', {
                    status: 400,
                    headers: defensiveHeaders
                });
            }

            const result = await processIconExtraction(
                targetPath,
                request.signal,
                extractIconOptions
            );

            if (result === null) {
                if (request.signal?.aborted) {
                    return new Response(null, { status: 499, headers: defensiveHeaders });
                }
                return new Response('Not found', {
                    status: 404,
                    headers: defensiveHeaders
                });
            }

            return new Response(result.buffer as any, {
                status: 200,
                headers: {
                    'Content-Type': result.mimeType || 'image/png',
                    ...defensiveHeaders
                }
            });
        } catch (error) {
            if (request.signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
                return new Response(null, { status: 499, headers: defensiveHeaders });
            }
            console.error('[MAIN][PROTOCOL] game-icon error:', error);
            return new Response('Internal error', {
                status: 500,
                headers: defensiveHeaders
            });
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

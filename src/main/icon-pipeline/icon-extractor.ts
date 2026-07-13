import * as fs from 'node:fs';
import * as path from 'node:path';

// Define contracts
export interface IconWorkerMessageRequest {
    type: 'extract';
    id: string | number;
    path: string;
    extPath: string;
}

export interface IconWorkerMessageResponse {
    id: string | number;
    base64: string;
    meta: {
        pid: number;
        rawExists: boolean;
        normalizedExists: boolean;
        rawLength?: number;
        normalizedLength?: number | null;
        rawPath: string;
        normalizedPath: string;
        rawFlavor: any;
        normalizedFlavor: any;
        durationMs: number;
        error?: string;
    };
}

if (process.send) {
    process.send({ type: 'ready' });
}

function summarizePathFlavor(targetPath: string) {
    return {
        hasForwardSlash: targetPath.includes('/'),
        hasBackslash: targetPath.includes('\\'),
        forwardSlashCount: (targetPath.match(/\//g) || []).length,
        backslashCount: (targetPath.match(/\\/g) || []).length
    };
}

function extractNormalizedLength(ext: any, id: string | number, rawPath: string, normalizedPath: string): number | null {
    if (normalizedPath === rawPath) return null;
    try {
        console.log(`[ICON-WORKER][pid=${process.pid}] Diagnostic ext(normalizedPath, 256) for #${id}`);
        const normalizedBuffer = ext(normalizedPath, 256);
        return normalizedBuffer ? normalizedBuffer.length : 0;
    } catch (normalizedErr) {
        console.error(`[ICON-WORKER][pid=${process.pid}] Diagnostic normalized-path extraction failed for #${id}:`, normalizedErr);
        return -1;
    }
}

function sendExtractionResult(id: string | number, rawBuffer: any, rawLength: number, normalizedLength: number | null, meta: any): void {
    if (rawBuffer && rawBuffer.length > 0) {
        const suspicion = rawLength <= 4096 ? 'possible-generic-or-low-res' : 'likely-real-icon';
        console.log(`[ICON-WORKER][pid=${process.pid}] Extraction success for #${id}, raw length=${rawLength}, normalized length=${normalizedLength}, suspicion=${suspicion}, durationMs=${meta.durationMs}`);
        if (process.send) {
            process.send({ id, base64: rawBuffer.toString('base64'), meta });
        }
    } else {
        console.warn(`[ICON-WORKER][pid=${process.pid}] Extraction yielded empty buffer for #${id}, normalized length=${normalizedLength}, durationMs=${meta.durationMs}`);
        if (process.send) {
            process.send({ id, base64: '', meta });
        }
    }
}

interface ExtractionErrorContext {
    rawPath: string;
    normalizedPath: string;
    rawExists: boolean;
    normalizedExists: boolean;
    rawFlavor: any;
    normalizedFlavor: any;
    startedAt: number;
}

function sendExtractionError(
    id: string | number,
    ctx: ExtractionErrorContext,
    err: any
): void {
    if (process.send) {
        process.send({
            id,
            base64: '',
            meta: {
                pid: process.pid,
                rawExists: ctx.rawExists,
                normalizedExists: ctx.normalizedExists,
                rawPath: ctx.rawPath,
                normalizedPath: ctx.normalizedPath,
                rawFlavor: ctx.rawFlavor,
                normalizedFlavor: ctx.normalizedFlavor,
                durationMs: Date.now() - ctx.startedAt,
                error: String((err as any && (err as any).stack) || err)
            }
        });
    }
}

function handleExtractionMessage(msg: IconWorkerMessageRequest): void {
    if (msg?.type === 'extract' && msg.id && msg.path && msg.extPath) {
        const startedAt = Date.now();
        const normalizedPath = path.win32.normalize(msg.path);
        const rawExists = fs.existsSync(msg.path);
        const normalizedExists = fs.existsSync(normalizedPath);
        const rawFlavor = summarizePathFlavor(msg.path);
        const normalizedFlavor = summarizePathFlavor(normalizedPath);

        console.log(`[ICON-WORKER][pid=${process.pid}] Received request #${msg.id}`);
        console.log(`[ICON-WORKER][pid=${process.pid}] raw path json=${JSON.stringify(msg.path)}`);
        console.log(`[ICON-WORKER][pid=${process.pid}] raw exists=${rawExists} normalized exists=${normalizedExists} raw flavor=${JSON.stringify(rawFlavor)}`);
        if (normalizedPath !== msg.path) {
            console.log(`[ICON-WORKER][pid=${process.pid}] normalized path json=${JSON.stringify(normalizedPath)}`);
            console.log(`[ICON-WORKER][pid=${process.pid}] normalized flavor=${JSON.stringify(normalizedFlavor)}`);
        }

        try {
            console.log(`[ICON-WORKER][pid=${process.pid}] Requiring extract-file-icon from: ${msg.extPath}`);
            const ext = require(msg.extPath);

            console.log(`[ICON-WORKER][pid=${process.pid}] Calling ext(rawPath, 256) for #${msg.id}`);
            const rawBuffer = ext(msg.path, 256);
            const rawLength = rawBuffer ? rawBuffer.length : 0;
            const normalizedLength = extractNormalizedLength(ext, msg.id, msg.path, normalizedPath);

            const meta = {
                pid: process.pid,
                rawExists,
                normalizedExists,
                rawLength,
                normalizedLength,
                rawPath: msg.path,
                normalizedPath,
                rawFlavor,
                normalizedFlavor,
                durationMs: Date.now() - startedAt
            };

            sendExtractionResult(msg.id, rawBuffer, rawLength, normalizedLength, meta);
        } catch (err) {
            console.error(`[ICON-WORKER][pid=${process.pid}] ERROR during extraction for #${msg.id}:`, err);
            sendExtractionError(msg.id, { rawPath: msg.path, normalizedPath, rawExists, normalizedExists, rawFlavor, normalizedFlavor, startedAt }, err);
        }
    } else {
        console.warn(`[ICON-WORKER] Received invalid message format:`, msg);
    }
}

process.on('message', handleExtractionMessage);

process.on('uncaughtException', (err) => {
    console.error(`[ICON-WORKER] UNCAUGHT EXCEPTION:`, err);
});

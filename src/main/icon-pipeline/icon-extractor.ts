import * as fs from 'fs';
import * as path from 'path';

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

process.on('message', (msg: IconWorkerMessageRequest) => {
    if (msg && msg.type === 'extract' && msg.id && msg.path && msg.extPath) {
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
            let normalizedLength: number | null = null;

            if (normalizedPath !== msg.path) {
                try {
                    console.log(`[ICON-WORKER][pid=${process.pid}] Diagnostic ext(normalizedPath, 256) for #${msg.id}`);
                    const normalizedBuffer = ext(normalizedPath, 256);
                    normalizedLength = normalizedBuffer ? normalizedBuffer.length : 0;
                } catch (normalizedErr) {
                    normalizedLength = -1;
                    console.error(`[ICON-WORKER][pid=${process.pid}] Diagnostic normalized-path extraction failed for #${msg.id}:`, normalizedErr);
                }
            }

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

            if (rawBuffer && rawBuffer.length > 0) {
                const suspicion = rawLength <= 4096 ? 'possible-generic-or-low-res' : 'likely-real-icon';
                console.log(`[ICON-WORKER][pid=${process.pid}] Extraction success for #${msg.id}, raw length=${rawLength}, normalized length=${normalizedLength}, suspicion=${suspicion}, durationMs=${meta.durationMs}`);
                if (process.send) {
                    process.send({ id: msg.id, base64: rawBuffer.toString('base64'), meta });
                }
            } else {
                console.warn(`[ICON-WORKER][pid=${process.pid}] Extraction yielded empty buffer for #${msg.id}, normalized length=${normalizedLength}, durationMs=${meta.durationMs}`);
                if (process.send) {
                    process.send({ id: msg.id, base64: '', meta });
                }
            }
        } catch (err) {
            console.error(`[ICON-WORKER][pid=${process.pid}] ERROR during extraction for #${msg.id}:`, err);
            if (process.send) {
                process.send({
                    id: msg.id,
                    base64: '',
                    meta: {
                        pid: process.pid,
                        rawExists,
                        normalizedExists,
                        rawPath: msg.path,
                        normalizedPath,
                        rawFlavor,
                        normalizedFlavor,
                        durationMs: Date.now() - startedAt,
                        error: String((err as any && (err as any).stack) || err)
                    }
                });
            }
        }
    } else {
        console.warn(`[ICON-WORKER] Received invalid message format:`, msg);
    }
});

process.on('uncaughtException', (err) => {
    console.error(`[ICON-WORKER] UNCAUGHT EXCEPTION:`, err);
});

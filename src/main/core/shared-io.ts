import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import * as http from 'node:http';
import * as https from 'node:https';

export interface AtomicFsAdapter {
    writeFile(path: string, data: string): Promise<void>;
    readFile?(path: string, options?: any): Promise<string>;
    stat?(path: string): Promise<{ size: number } | any>;
    rename?(oldPath: string, newPath: string): Promise<void>;
    unlink?(path: string): Promise<void>;
    mkdir?(path: string, options?: any): Promise<void>;
}

export async function writeAtomicJson(
    filePath: string,
    data: unknown,
    options?: {
        fs?: AtomicFsAdapter;
        tmpSuffix?: string;
        retryCount?: number;
        retryDelayMs?: number;
    }
): Promise<void> {
    const json = JSON.stringify(data, null, 2);
    const parentDir = path.dirname(filePath);

    if (options?.fs) {
        await options.fs.mkdir?.(parentDir, { recursive: true });
    } else {
        await fs.mkdir(parentDir, { recursive: true });
    }

    if (options?.fs && typeof options.fs.rename !== 'function') {
        await options.fs.writeFile(filePath, json);
        return;
    }

    const highEntropy = Math.random().toString(36).slice(2);
    const tmpSuffix = options?.tmpSuffix || `tmp.${process.pid}.${Date.now()}.${highEntropy}`;
    const tmpPath = `${filePath}.${tmpSuffix}`;

    const writeFileFn = options?.fs
        ? (p: string, d: string) => options.fs!.writeFile(p, d)
        : (p: string, d: string) => fs.writeFile(p, d, 'utf8');

    const renameFn = options?.fs?.rename
        ? (oldP: string, newP: string) => options.fs!.rename!(oldP, newP)
        : (oldP: string, newP: string) => fs.rename(oldP, newP);

    const unlinkFn = options?.fs
        ? async (p: string) => { await options.fs!.unlink?.(p); }
        : async (p: string) => { await fs.unlink(p); };

    try {
        await writeFileFn(tmpPath, json);

        const retryCount = options?.retryCount ?? 3;
        const retryDelayMs = options?.retryDelayMs ?? 40;

        let attempt = 0;
        while (true) {
            try {
                await renameFn(tmpPath, filePath);
                break;
            } catch (err: any) {
                attempt++;
                const isRetryable = ['EBUSY', 'EPERM', 'EACCES'].includes(err?.code);
                if (isRetryable && attempt <= retryCount) {
                    await new Promise(resolve => setTimeout(resolve, retryDelayMs));
                    continue;
                }
                throw err;
            }
        }
    } catch (error) {
        try {
            await unlinkFn(tmpPath);
        } catch {
            // Safely suppress secondary unlink errors while rethrowing primary error
        }
        throw error;
    }
}

export async function readJsonWithRetry<T = any>(
    filePath: string,
    options?: {
        fs?: AtomicFsAdapter;
        retryCount?: number;
        retryDelayMs?: number;
    }
): Promise<T> {
    const retryCount = options?.retryCount ?? 3;
    const retryDelayMs = options?.retryDelayMs ?? 40;

    const readFileFn = options?.fs?.readFile
        ? (p: string) => options.fs!.readFile!(p, 'utf8')
        : (p: string) => fs.readFile(p, 'utf8');

    let attempt = 0;
    while (true) {
        try {
            const content = await readFileFn(filePath);
            if (!content || !content.trim()) {
                throw new Error(`Unexpected empty JSON file: ${filePath}`);
            }
            return JSON.parse(content) as T;
        } catch (err: any) {
            if (err?.code === 'ENOENT') {
                throw err;
            }
            attempt++;
            if (attempt <= retryCount) {
                await new Promise(resolve => setTimeout(resolve, retryDelayMs));
                continue;
            }
            throw err;
        }
    }
}

export function createSerializedQueue(): <T>(task: () => Promise<T>) => Promise<T> {
    let pending = Promise.resolve();

    return function enqueue<T>(task: () => Promise<T>): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            pending = pending.then(async () => {
                try {
                    const result = await task();
                    resolve(result);
                } catch (err) {
                    reject(err);
                }
            }).catch(() => {
                // Guaranteed error isolation for subsequent tasks
            });
        });
    };
}

export async function ensureDir(dirPath: string): Promise<void> {
    await fs.mkdir(dirPath, { recursive: true });
}

export async function readJsonFile(filePath: string): Promise<any> {
    try {
        return JSON.parse(await fs.readFile(filePath, 'utf8'));
    } catch {
        return null;
    }
}

export function sha256Hex(buffer: Buffer | string): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
}

export function isNetworkLikeError(error: any): boolean {
    const msg = String(error?.message || error || '').toLowerCase();
    const code = String(error?.code || '').toLowerCase();
    return [
        'econnreset',
        'econnrefused',
        'enetunreach',
        'ehostunreach',
        'eai_again',
        'timed out',
        'enotfound',
        'socket hang up',
        'offline',
        'network'
    ].some(token => msg.includes(token) || code.includes(token));
}

function executeDownloadStream<T>(
    urlString: string,
    redirectCount: number,
    timeoutMs: number,
    userAgentVersion: string,
    onRedirect: (redirectedUrl: string) => Promise<T>,
    onResponse: (res: http.IncomingMessage, resolve: (value: T | PromiseLike<T>) => void, reject: (reason?: any) => void) => void
): Promise<T> {
    return new Promise((resolve, reject) => {
        if (redirectCount > 5) {
            reject(new Error('Too many redirects while downloading data.'));
            return;
        }

        let requestUrl: URL;
        try {
            requestUrl = new URL(urlString);
        } catch {
            reject(new Error(`Invalid download URL: ${urlString}`));
            return;
        }

        const client = requestUrl.protocol === 'http:' ? http : https;
        const req = client.get(requestUrl, {
            headers: {
                'User-Agent': `YumeShelf/${userAgentVersion}`
            }
        }, (res) => {
            const status = res.statusCode || 0;
            if ([301, 302, 303, 307, 308].includes(status) && res.headers.location) {
                const redirected = new URL(res.headers.location, requestUrl).toString();
                res.resume();
                resolve(onRedirect(redirected));
                return;
            }

            if (status !== 200) {
                res.resume();
                reject(new Error(`HTTP ${status} while downloading ${requestUrl.toString()}`));
                return;
            }

            onResponse(res, resolve, reject);
        });

        req.setTimeout(timeoutMs, () => {
            req.destroy(new Error('Request timed out.'));
        });
        req.on('error', reject);
    });
}

export function downloadBuffer(
    urlString: string,
    redirectCount = 0,
    timeoutMs = 8000,
    onProgress: ((downloaded: number, total: number) => void) | null = null,
    userAgentVersion = '0.0.0'
): Promise<Buffer> {
    return executeDownloadStream(
        urlString, redirectCount, timeoutMs, userAgentVersion,
        redirected => downloadBuffer(redirected, redirectCount + 1, timeoutMs, onProgress, userAgentVersion),
        (res, resolve) => {
            const total = Number.parseInt(res.headers['content-length'] || '0', 10);
            let downloaded = 0;
            const chunks: Buffer[] = [];
            res.on('data', chunk => {
                chunks.push(Buffer.from(chunk));
                downloaded += chunk.length;
                if (typeof onProgress === 'function' && total) {
                    onProgress(downloaded, total);
                }
            });
            res.on('end', () => resolve(Buffer.concat(chunks)));
        }
    );
}

export function downloadFile(
    urlString: string,
    targetPath: string,
    redirectCount = 0,
    timeoutMs = 8000,
    onProgress: ((downloaded: number, total: number) => void) | null = null,
    userAgentVersion = '0.0.0'
): Promise<void> {
    return executeDownloadStream(
        urlString, redirectCount, timeoutMs, userAgentVersion,
        redirected => downloadFile(redirected, targetPath, redirectCount + 1, timeoutMs, onProgress, userAgentVersion),
        (res, resolve, reject) => {
            const total = Number.parseInt(res.headers['content-length'] || '0', 10);
            let downloaded = 0;
            const fileStream = fsSync.createWriteStream(targetPath);
            res.pipe(fileStream);

            res.on('data', chunk => {
                downloaded += chunk.length;
                if (typeof onProgress === 'function' && total) {
                    onProgress(downloaded, total);
                }
            });

            fileStream.on('finish', () => {
                fileStream.close();
                resolve();
            });

            fileStream.on('error', (err) => {
                fileStream.close();
                reject(err);
            });
        }
    );
}

import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as crypto from 'node:crypto';
import * as http from 'node:http';
import * as https from 'node:https';

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
    const msg = String((error?.message) || error || '').toLowerCase();
    const code = String((error?.code) || '').toLowerCase();
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

export function downloadBuffer(
    urlString: string,
    redirectCount = 0,
    timeoutMs = 8000,
    onProgress: ((downloaded: number, total: number) => void) | null = null,
    userAgentVersion = '0.0.0'
): Promise<Buffer> {
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
                resolve(downloadBuffer(redirected, redirectCount + 1, timeoutMs, onProgress, userAgentVersion));
                return;
            }

            if (status !== 200) {
                res.resume();
                reject(new Error(`HTTP ${status} while downloading ${requestUrl.toString()}`));
                return;
            }

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
        });

        req.setTimeout(timeoutMs, () => {
            req.destroy(new Error('Request timed out.'));
        });
        req.on('error', reject);
    });
}

export function downloadFile(
    urlString: string,
    targetPath: string,
    redirectCount = 0,
    timeoutMs = 8000,
    onProgress: ((downloaded: number, total: number) => void) | null = null,
    userAgentVersion = '0.0.0'
): Promise<void> {
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
                resolve(downloadFile(redirected, targetPath, redirectCount + 1, timeoutMs, onProgress, userAgentVersion));
                return;
            }

            if (status !== 200) {
                res.resume();
                reject(new Error(`HTTP ${status} while downloading ${requestUrl.toString()}`));
                return;
            }

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
        });

        req.setTimeout(timeoutMs, () => {
            req.destroy(new Error('Request timed out.'));
        });
        req.on('error', reject);
    });
}

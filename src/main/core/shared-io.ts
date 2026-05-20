// @ts-nocheck
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const http = require('http');
const https = require('https');

async function ensureDir(dirPath) {
    await fs.mkdir(dirPath, { recursive: true });
}

async function readJsonFile(filePath) {
    try {
        return JSON.parse(await fs.readFile(filePath, 'utf8'));
    } catch {
        return null;
    }
}

function sha256Hex(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex');
}

function isNetworkLikeError(error) {
    const msg = String((error && error.message) || error || '').toLowerCase();
    const code = String((error && error.code) || '').toLowerCase();
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

function downloadBuffer(urlString, redirectCount = 0, timeoutMs = 8000, onProgress = null, userAgentVersion = '0.0.0') {
    return new Promise((resolve, reject) => {
        if (redirectCount > 5) {
            reject(new Error('Too many redirects while downloading data.'));
            return;
        }

        let requestUrl;
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

            const total = parseInt(res.headers['content-length'], 10);
            let downloaded = 0;
            const chunks = [];
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

module.exports = {
    downloadBuffer,
    ensureDir,
    isNetworkLikeError,
    readJsonFile,
    sha256Hex
};

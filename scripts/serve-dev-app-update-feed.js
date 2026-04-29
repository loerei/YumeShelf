const http = require('http');
const fs = require('fs');
const path = require('path');

const DEFAULT_PORT = Number(process.env.YUMESHELF_DEV_FEED_PORT || 5505);

function resolveFeedDir() {
    const appData = process.env.APPDATA;
    if (!appData) {
        throw new Error('APPDATA is not available in the current environment.');
    }
    return path.join(appData, 'yumeshelf', 'app-update', 'dev-feed');
}

function resolveContentType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.yml' || ext === '.yaml') return 'text/yaml; charset=utf-8';
    if (ext === '.json') return 'application/json; charset=utf-8';
    if (ext === '.blockmap') return 'application/octet-stream';
    if (ext === '.exe') return 'application/vnd.microsoft.portable-executable';
    return 'application/octet-stream';
}

function main() {
    const feedDir = resolveFeedDir();
    if (!fs.existsSync(feedDir)) {
        throw new Error(`Feed directory does not exist: ${feedDir}`);
    }

    const server = http.createServer((request, response) => {
        const parsedUrl = new URL(request.url || '/', `http://127.0.0.1:${DEFAULT_PORT}`);
        const requestedPath = parsedUrl.pathname === '/' ? '/latest.yml' : parsedUrl.pathname;
        const safeRelativePath = path.normalize(requestedPath).replace(/^([\\/])+/, '');
        const filePath = path.join(feedDir, safeRelativePath);

        if (!filePath.startsWith(feedDir) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
            response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            response.end('Not found');
            return;
        }

        response.writeHead(200, { 'Content-Type': resolveContentType(filePath) });
        fs.createReadStream(filePath).pipe(response);
    });

    server.listen(DEFAULT_PORT, '127.0.0.1', () => {
        console.log(`Serving dev app update feed from ${feedDir}`);
        console.log(`Feed URL: http://127.0.0.1:${DEFAULT_PORT}`);
    });
}

main();

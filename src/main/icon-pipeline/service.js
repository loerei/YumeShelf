const path = require('path');
const fs = require('fs/promises');
const fsSync = require('fs');
const crypto = require('crypto');
const { fork, spawnSync } = require('child_process');
const { nativeImage } = require('electron');

function createSha1(input) {
    return crypto.createHash('sha1').update(input).digest('hex');
}

function createIconPipeline({
    app,
    protocol,
    ipcMain,
    sourceRootDir
}) {
    function createIconPayload(dataUrl, fit = 'contain', source = 'unknown', debug = null) {
        return {
            dataUrl,
            fit: fit === 'cover' ? 'cover' : 'contain',
            source,
            debug
        };
    }

    function summarizeNativeImageForDebug(image) {
        if (!image || image.isEmpty()) {
            return {
                empty: true
            };
        }

        const size = image.getSize();
        const summary = {
            empty: false,
            width: size.width,
            height: size.height
        };

        try {
            const bitmap = image.toBitmap();
            if (!bitmap || !size.width || !size.height) {
                return summary;
            }

            let minX = size.width;
            let minY = size.height;
            let maxX = -1;
            let maxY = -1;
            let opaquePixels = 0;

            for (let y = 0; y < size.height; y += 1) {
                for (let x = 0; x < size.width; x += 1) {
                    const alpha = bitmap[(y * size.width + x) * 4 + 3];
                    if (alpha > 0) {
                        opaquePixels += 1;
                        if (x < minX) minX = x;
                        if (y < minY) minY = y;
                        if (x > maxX) maxX = x;
                        if (y > maxY) maxY = y;
                    }
                }
            }

            summary.opaquePixels = opaquePixels;
            if (opaquePixels > 0) {
                summary.opaqueBounds = {
                    left: minX,
                    top: minY,
                    right: maxX,
                    bottom: maxY,
                    width: maxX - minX + 1,
                    height: maxY - minY + 1
                };
            } else {
                summary.opaqueBounds = null;
            }
        } catch (error) {
            summary.bitmapError = String((error && error.message) || error);
        }

        return summary;
    }

    function cropTransparentPaddingFromDataUrl(dataUrl, options = {}) {
        if (!dataUrl || typeof dataUrl !== 'string') {
            return { dataUrl, cropped: false, summary: null };
        }

        let image;
        try {
            image = nativeImage.createFromDataURL(dataUrl);
        } catch (error) {
            return {
                dataUrl,
                cropped: false,
                summary: {
                    error: String((error && error.message) || error)
                }
            };
        }

        const summary = summarizeNativeImageForDebug(image);
        const bounds = summary && summary.opaqueBounds;
        if (!bounds || !summary || summary.empty) {
            return { dataUrl, cropped: false, summary };
        }

        const fullWidth = summary.width || 0;
        const fullHeight = summary.height || 0;
        const contentWidth = bounds.width || 0;
        const contentHeight = bounds.height || 0;
        if (!fullWidth || !fullHeight || !contentWidth || !contentHeight) {
            return { dataUrl, cropped: false, summary };
        }

        const widthRatio = contentWidth / fullWidth;
        const heightRatio = contentHeight / fullHeight;
        const shouldCrop = widthRatio < 0.82 || heightRatio < 0.82;
        if (!shouldCrop) {
            return { dataUrl, cropped: false, summary };
        }

        const padding = Math.max(2, Math.round(Math.min(fullWidth, fullHeight) * 0.02));
        const cropLeft = Math.max(0, bounds.left - padding);
        const cropTop = Math.max(0, bounds.top - padding);
        const cropRight = Math.min(fullWidth, bounds.right + padding + 1);
        const cropBottom = Math.min(fullHeight, bounds.bottom + padding + 1);
        const cropWidth = Math.max(1, cropRight - cropLeft);
        const cropHeight = Math.max(1, cropBottom - cropTop);

        try {
            const croppedImage = image.crop({
                x: cropLeft,
                y: cropTop,
                width: cropWidth,
                height: cropHeight
            });
            const croppedDataUrl = croppedImage.toDataURL();
            return {
                dataUrl: croppedDataUrl,
                cropped: true,
                summary: {
                    ...summary,
                    cropRect: {
                        left: cropLeft,
                        top: cropTop,
                        width: cropWidth,
                        height: cropHeight
                    }
                }
            };
        } catch (error) {
            return {
                dataUrl,
                cropped: false,
                summary: {
                    ...summary,
                    cropError: String((error && error.message) || error)
                }
            };
        }
    }

    const iconWorkers = [];
    const pendingIconRequests = new Map();
    const extractionQueue = [];
    const ICON_WORKER_BOOT_MAX_ATTEMPTS = 5;
    const ICON_WORKER_PROBE_PATH = path.join(process.env.WINDIR || 'C:\\Windows', 'System32', 'notepad.exe');
    const ICON_CACHE_DIR = path.join(app.getPath('userData'), 'high-res-icon-cache');
    const ICON_CACHE_INDEX_FILE = path.join(ICON_CACHE_DIR, 'index.json');
    const ICON_CACHE_VERSION = 1;

    let iconReqIdCounter = 0;
    let activeExtractionReq = null;
    let isExtracting = false;
    let resolvedNodeExecPath = null;
    let workerBootstrapPromise = null;
    let iconCacheState = null;
    let iconCacheStatePromise = null;

    function summarizeWindowsPath(targetPath) {
        const normalizedPath = path.win32.normalize(targetPath);
        return {
            rawPath: targetPath,
            normalizedPath,
            rawExists: fsSync.existsSync(targetPath),
            normalizedExists: fsSync.existsSync(normalizedPath),
            hasForwardSlash: targetPath.includes('/'),
            hasBackslash: targetPath.includes('\\'),
            changedByNormalize: normalizedPath !== targetPath
        };
    }

    async function saveIconCacheState(state) {
        await fs.mkdir(ICON_CACHE_DIR, { recursive: true });
        await fs.writeFile(ICON_CACHE_INDEX_FILE, JSON.stringify(state, null, 2));
    }

    async function loadIconCacheState() {
        if (iconCacheState) return iconCacheState;
        if (iconCacheStatePromise) return iconCacheStatePromise;

        iconCacheStatePromise = (async () => {
            await fs.mkdir(ICON_CACHE_DIR, { recursive: true });
            try {
                const raw = await fs.readFile(ICON_CACHE_INDEX_FILE, 'utf8');
                const parsed = JSON.parse(raw);
                iconCacheState = {
                    version: parsed.version || ICON_CACHE_VERSION,
                    entriesByPath: parsed.entriesByPath || {}
                };
                console.log(`[MAIN][ICON-CACHE] Loaded state version=${iconCacheState.version} entries=${Object.keys(iconCacheState.entriesByPath).length} dir=${ICON_CACHE_DIR}`);
            } catch (err) {
                iconCacheState = { version: ICON_CACHE_VERSION, entriesByPath: {} };
                console.log(`[MAIN][ICON-CACHE] Initialized empty state dir=${ICON_CACHE_DIR} reason=${String((err && err.code) || (err && err.message) || err)}`);
            }
            return iconCacheState;
        })();

        try {
            return await iconCacheStatePromise;
        } finally {
            iconCacheStatePromise = null;
        }
    }

    function buildIconCacheFingerprint(normalizedPath, stats) {
        return createSha1(`${normalizedPath}|${stats.size}|${stats.mtimeMs}`);
    }

    async function deleteIconCacheFileIfUnused(state, fileName, exceptPath) {
        if (!fileName) return;
        const stillUsed = Object.entries(state.entriesByPath).some(([entryPath, entry]) => {
            if (exceptPath && entryPath === exceptPath) return false;
            return entry && entry.fileName === fileName;
        });
        if (stillUsed) return;
        try {
            await fs.unlink(path.join(ICON_CACHE_DIR, fileName));
            console.log(`[MAIN][ICON-CACHE] Deleted unused file fileName=${fileName}`);
        } catch (err) {
            if (err && err.code !== 'ENOENT') {
                console.warn(`[MAIN][ICON-CACHE] Failed to delete unused file fileName=${fileName}: ${String((err && err.message) || err)}`);
            }
        }
    }

    async function tryGetCachedIconDataUrl(targetPath) {
        const normalizedPath = path.win32.normalize(targetPath);
        let stats;
        try {
            stats = await fs.stat(normalizedPath);
        } catch (err) {
            console.warn(`[MAIN][ICON-CACHE] MISS reason=stat_failed path=${normalizedPath} error=${String((err && err.code) || (err && err.message) || err)}`);
            return null;
        }

        const state = await loadIconCacheState();
        const fingerprint = buildIconCacheFingerprint(normalizedPath, stats);
        const entry = state.entriesByPath[normalizedPath];

        if (!entry) {
            console.log(`[MAIN][ICON-CACHE] MISS reason=no_entry path=${normalizedPath} fingerprint=${fingerprint}`);
            return null;
        }

        if (entry.fingerprint !== fingerprint) {
            console.log(`[MAIN][ICON-CACHE] MISS reason=fingerprint_changed path=${normalizedPath} old=${entry.fingerprint} new=${fingerprint}`);
            return null;
        }

        const cacheFilePath = path.join(ICON_CACHE_DIR, entry.fileName);
        try {
            const buffer = await fs.readFile(cacheFilePath);
            console.log(`[MAIN][ICON-CACHE] HIT path=${normalizedPath} fingerprint=${fingerprint} bytes=${buffer.length} fileName=${entry.fileName}`);
            const cachedDataUrl = `data:image/png;base64,${buffer.toString('base64')}`;
            const normalizedIcon = cropTransparentPaddingFromDataUrl(cachedDataUrl, { source: 'cache' });
            if (normalizedIcon.cropped) {
                console.log(`[MAIN][ICON-CACHE] CROPPED-HIT path=${normalizedPath} summary=${JSON.stringify(normalizedIcon.summary)}`);
            }
            return normalizedIcon.dataUrl;
        } catch (err) {
            console.warn(`[MAIN][ICON-CACHE] MISS reason=file_missing path=${normalizedPath} fingerprint=${fingerprint} fileName=${entry.fileName} error=${String((err && err.code) || (err && err.message) || err)}`);
            return null;
        }
    }

    async function storeHighResIconInCache(targetPath, base64, meta) {
        const normalizedPath = path.win32.normalize(targetPath);
        let stats;
        try {
            stats = await fs.stat(normalizedPath);
        } catch (err) {
            console.warn(`[MAIN][ICON-CACHE] STORE-SKIP reason=stat_failed path=${normalizedPath} error=${String((err && err.code) || (err && err.message) || err)}`);
            return;
        }

        const state = await loadIconCacheState();
        const fingerprint = buildIconCacheFingerprint(normalizedPath, stats);
        const fileName = `${fingerprint}.png`;
        const cacheFilePath = path.join(ICON_CACHE_DIR, fileName);
        const previousEntry = state.entriesByPath[normalizedPath] || null;
        const buffer = Buffer.from(base64, 'base64');

        await fs.mkdir(ICON_CACHE_DIR, { recursive: true });
        await fs.writeFile(cacheFilePath, buffer);
        state.entriesByPath[normalizedPath] = {
            fingerprint,
            fileName,
            size: stats.size,
            mtimeMs: stats.mtimeMs,
            cachedAtMs: Date.now()
        };
        await saveIconCacheState(state);
        if (previousEntry && previousEntry.fileName !== fileName) {
            await deleteIconCacheFileIfUnused(state, previousEntry.fileName, normalizedPath);
        }
        console.log(`[MAIN][ICON-CACHE] STORE path=${normalizedPath} fingerprint=${fingerprint} bytes=${buffer.length} rawLength=${meta && meta.rawLength !== undefined ? meta.rawLength : 'unknown'} fileName=${fileName}`);
    }

    function resolveNodeExecPath() {
        if (resolvedNodeExecPath) return resolvedNodeExecPath;

        const candidates = [
            process.env.npm_node_execpath,
            process.env.NODE,
            process.execPath.toLowerCase().endsWith('\\node.exe') ? process.execPath : null,
            process.env.ProgramFiles ? path.join(process.env.ProgramFiles, 'nodejs', 'node.exe') : null,
            process.env['ProgramFiles(x86)'] ? path.join(process.env['ProgramFiles(x86)'], 'nodejs', 'node.exe') : null
        ].filter(Boolean);

        for (const candidate of candidates) {
            if (fsSync.existsSync(candidate) && candidate.toLowerCase().endsWith('\\node.exe')) {
                resolvedNodeExecPath = candidate;
                console.log(`[MAIN][NODE-WORKER] Resolved node.exe from candidate: ${candidate}`);
                return resolvedNodeExecPath;
            }
        }

        const whereResult = spawnSync('where.exe', ['node'], {
            encoding: 'utf8',
            windowsHide: true
        });
        if (whereResult.status === 0) {
            const matches = String(whereResult.stdout || '')
                .split(/\r?\n/)
                .map(line => line.trim())
                .filter(line => line && fsSync.existsSync(line) && line.toLowerCase().endsWith('\\node.exe'));
            if (matches.length > 0) {
                resolvedNodeExecPath = matches[0];
                console.log(`[MAIN][NODE-WORKER] Resolved node.exe via where.exe: ${resolvedNodeExecPath}`);
                return resolvedNodeExecPath;
            }
        }

        throw new Error(`Could not resolve node.exe; process.execPath=${process.execPath}`);
    }

    function buildExtractFileIconPath() {
        return path.join(app.getAppPath(), 'node_modules', 'extract-file-icon')
            .replace('app.asar', 'app.asar.unpacked');
    }

    function recycleWorker(worker, reason) {
        if (!worker) return;
        console.warn(`[MAIN][NODE-WORKER] Recycling worker #${worker.__workerId || 'unknown'} pid=${worker.pid} reason=${reason}`);
        const idx = iconWorkers.indexOf(worker);
        if (idx > -1) iconWorkers.splice(idx, 1);
        try {
            worker.kill();
        } catch {}
    }

    function createIconWorker() {
        const workerId = iconWorkers.length + 1;
        const nodeExecPath = resolveNodeExecPath();
        console.log(`[MAIN][NODE-WORKER] Forking node worker #${workerId} via ${nodeExecPath}`);
        const workerPath = path.join(sourceRootDir, 'icon-extractor.js');
        const worker = fork(workerPath, [], {
            execPath: nodeExecPath,
            stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
            windowsHide: true
        });

        worker.__workerId = workerId;
        worker.__healthy = false;

        worker.stdout.on('data', (data) => process.stdout.write(`[NW${workerId} STDOUT] ${data}`));
        worker.stderr.on('data', (data) => process.stderr.write(`[NW${workerId} STDERR] ${data}`));

        worker.on('message', (msg) => {
            if (!msg || msg.id === undefined) return;
            const pending = pendingIconRequests.get(msg.id);
            const durationMs = activeExtractionReq && activeExtractionReq.id === msg.id && activeExtractionReq.sentAt
                ? Date.now() - activeExtractionReq.sentAt
                : null;
            console.log(`[MAIN][NODE-WORKER] Received response for #${msg.id}, base64 length=${msg.base64 ? msg.base64.length : 0}, workerRoundTripMs=${durationMs}`);
            if (msg.meta) {
                console.log(`[MAIN][NODE-WORKER] Response meta for #${msg.id}: ${JSON.stringify(msg.meta)}`);
            }
            if (pending) {
                clearTimeout(pending.timeout);
                pendingIconRequests.delete(msg.id);
                pending.resolve({ base64: msg.base64 || '', meta: msg.meta || null });
            }
            if (activeExtractionReq && activeExtractionReq.id === msg.id) {
                activeExtractionReq = null;
                isExtracting = false;
                processExtractionQueue();
            }
        });

        worker.on('exit', (code, signal) => {
            console.error(`[MAIN][NODE-WORKER] Worker #${workerId} exited with code ${code} signal ${signal}`);
            const idx = iconWorkers.indexOf(worker);
            if (idx > -1) iconWorkers.splice(idx, 1);

            for (const [pendingId, pending] of pendingIconRequests.entries()) {
                if (pending.worker !== worker) continue;
                clearTimeout(pending.timeout);
                pendingIconRequests.delete(pendingId);
                pending.resolve({
                    base64: '',
                    meta: {
                        cause: 'worker_exit',
                        requestId: pendingId,
                        mode: 'node-worker',
                        workerPid: worker.pid,
                        code,
                        signal
                    }
                });
            }

            if (activeExtractionReq && activeExtractionReq.worker === worker) {
                console.error(`[MAIN][NODE-WORKER] Active request #${activeExtractionReq.id} lost because worker pid=${worker.pid} exited`);
                activeExtractionReq = null;
                isExtracting = false;
                processExtractionQueue();
            }
        });

        iconWorkers.push(worker);
        return worker;
    }

    function probeIconWorker(worker, attempt) {
        return new Promise((resolve) => {
            const probeId = `probe-${worker.pid}-${attempt}-${Date.now()}`;
            console.log(`[MAIN][NODE-WORKER] Probing worker #${worker.__workerId} pid=${worker.pid} attempt=${attempt} probePath=${ICON_WORKER_PROBE_PATH}`);
            console.log(`[MAIN][NODE-WORKER] Probe path summary=${JSON.stringify(summarizeWindowsPath(ICON_WORKER_PROBE_PATH))}`);

            const timeout = setTimeout(() => {
                pendingIconRequests.delete(probeId);
                console.error(`[MAIN][NODE-WORKER] Probe timed out for worker #${worker.__workerId} pid=${worker.pid}`);
                resolve(false);
            }, 3000);

            pendingIconRequests.set(probeId, {
                worker,
                timeout,
                resolve: ({ meta }) => {
                    const rawLength = meta && typeof meta.rawLength === 'number' ? meta.rawLength : 0;
                    const ok = rawLength > 0;
                    console.log(`[MAIN][NODE-WORKER] Probe result for worker #${worker.__workerId} pid=${worker.pid}: rawLength=${rawLength} ok=${ok}`);
                    resolve(ok);
                }
            });

            worker.send({
                type: 'extract',
                id: probeId,
                path: ICON_WORKER_PROBE_PATH,
                extPath: buildExtractFileIconPath()
            });
        });
    }

    async function ensureHealthyIconWorker() {
        const existing = iconWorkers.find(worker => worker.__healthy);
        if (existing) return existing;
        if (workerBootstrapPromise) return workerBootstrapPromise;

        workerBootstrapPromise = (async () => {
            for (let attempt = 1; attempt <= ICON_WORKER_BOOT_MAX_ATTEMPTS; attempt += 1) {
                const worker = createIconWorker();
                const ok = await probeIconWorker(worker, attempt);
                if (ok) {
                    worker.__healthy = true;
                    console.log(`[MAIN][NODE-WORKER] Worker #${worker.__workerId} pid=${worker.pid} passed probe on attempt ${attempt}`);
                    return worker;
                }
                recycleWorker(worker, `probe_failed_attempt_${attempt}`);
            }
            throw new Error(`No healthy icon worker after ${ICON_WORKER_BOOT_MAX_ATTEMPTS} attempts`);
        })();

        try {
            return await workerBootstrapPromise;
        } finally {
            workerBootstrapPromise = null;
        }
    }

    async function processExtractionQueue() {
        if (isExtracting || extractionQueue.length === 0) return;
        isExtracting = true;

        const req = extractionQueue.shift();
        req.sentAt = Date.now();
        console.log(`[MAIN][QUEUE] Preparing req #${req.id}; queuedForMs=${req.sentAt - req.enqueuedAt}; queueRemaining=${extractionQueue.length}`);
        console.log(`[MAIN][QUEUE] req #${req.id} path summary=${JSON.stringify(summarizeWindowsPath(req.path))}`);

        try {
            const worker = await ensureHealthyIconWorker();
            req.worker = worker;
            activeExtractionReq = req;
            console.log(`[MAIN][QUEUE] Sending req #${req.id} to healthy node worker pid=${worker.pid}`);

            req.timeout = setTimeout(() => {
                console.error(`[MAIN][QUEUE] Request #${req.id} TIMED OUT after 10s`);
                if (pendingIconRequests.has(req.id)) {
                    pendingIconRequests.delete(req.id);
                    req.resolve({ base64: '', meta: { cause: 'timeout', requestId: req.id, mode: 'node-worker' } });
                }
                activeExtractionReq = null;
                isExtracting = false;
                processExtractionQueue();
            }, 10000);

            pendingIconRequests.set(req.id, { ...req, worker });
            worker.send({ type: 'extract', id: req.id, path: req.path, extPath: req.extPath });
        } catch (error) {
            console.error(`[MAIN][QUEUE] Failed to obtain healthy node worker for req #${req.id}:`, error);
            req.resolve({
                base64: '',
                meta: {
                    cause: 'worker_healthcheck_failed',
                    requestId: req.id,
                    mode: 'node-worker',
                    error: String((error && error.stack) || error)
                }
            });
            activeExtractionReq = null;
            isExtracting = false;
            processExtractionQueue();
        }
    }

    async function resolveIconDataUrl(targetPath) {
        console.log(`[MAIN][IPC] get-icon requested for: ${targetPath}`);
        console.log(`[MAIN][IPC] get-icon path summary=${JSON.stringify(summarizeWindowsPath(targetPath))}`);
        const dir = path.dirname(targetPath);
        const exts = ['png', 'jpg', 'jpeg', 'webp'];
        const names = ['icon', 'cover', 'folder'];
        for (const name of names) {
            for (const ext of exts) {
                const imgPath = path.join(dir, `${name}.${ext}`);
                if (fsSync.existsSync(imgPath)) {
                    console.log(`[MAIN][IPC] Found local image: ${imgPath}`);
                    return createIconPayload(
                        `file:///${imgPath.replace(/\\/g, '/')}`,
                        'contain',
                        'local-image',
                        { imagePath: imgPath }
                    );
                }
            }
        }

        const cachedIconDataUrl = await tryGetCachedIconDataUrl(targetPath);
        if (cachedIconDataUrl) {
            console.log(`[MAIN][IPC] Returning cached high-res icon for: ${targetPath}`);
            return createIconPayload(cachedIconDataUrl, 'contain', 'cached-high-res');
        }

        try {
            const result = await new Promise((resolve) => {
                const id = ++iconReqIdCounter;
                const extPath = buildExtractFileIconPath();

                extractionQueue.push({ id, path: targetPath, extPath, resolve, enqueuedAt: Date.now() });
                console.log(`[MAIN][IPC] Queued node-worker req #${id} (queueLengthNow=${extractionQueue.length}) extPath=${extPath}`);
                processExtractionQueue();
            });
            if (result && result.base64) {
                try {
                    await storeHighResIconInCache(targetPath, result.base64, result.meta || null);
                } catch (cacheErr) {
                    console.warn(`[MAIN][ICON-CACHE] STORE-FAIL path=${path.win32.normalize(targetPath)} error=${String((cacheErr && cacheErr.stack) || cacheErr)}`);
                }
                console.log(`[MAIN][IPC] Successfully resolved high-res icon for: ${targetPath}`);
                const highResDataUrl = `data:image/png;base64,${result.base64}`;
                const normalizedHighRes = cropTransparentPaddingFromDataUrl(highResDataUrl, { source: 'extracted-high-res' });
                if (normalizedHighRes.cropped) {
                    console.log(`[MAIN][IPC] Cropped transparent padding for high-res icon ${targetPath}: ${JSON.stringify(normalizedHighRes.summary)}`);
                }
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
            console.warn(`[MAIN][IPC] High-res extraction did not yield usable data for: ${targetPath}`);
            if (result && result.meta) {
                console.warn(`[MAIN][IPC] Failure meta for ${targetPath}: ${JSON.stringify(result.meta)}`);
            }
        } catch (error) {
            console.error('[MAIN][IPC] extract-file-icon node-worker error:', error);
        }

        console.warn(`[MAIN][IPC] Falling back to app.getFileIcon for: ${targetPath}`);
        const icon = await app.getFileIcon(targetPath, { size: 'large' });
        const fallbackDebug = summarizeNativeImageForDebug(icon);
        console.warn(`[MAIN][IPC] app.getFileIcon fallback summary for ${targetPath}: ${JSON.stringify(fallbackDebug)}`);
        return createIconPayload(icon.toDataURL(), 'cover', 'app-file-icon-fallback', fallbackDebug);
    }

    async function handleProtocolRequest(request) {
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

            const normalizedPath = path.win32.normalize(targetPath);
            let stats = null;
            try { stats = await fs.stat(normalizedPath); } catch (_error) {}
            if (stats) {
                const state = await loadIconCacheState();
                const fingerprint = buildIconCacheFingerprint(normalizedPath, stats);
                const entry = state.entriesByPath[normalizedPath];
                if (entry && entry.fingerprint === fingerprint) {
                    const cacheFilePath = path.join(ICON_CACHE_DIR, entry.fileName);
                    try {
                        const buffer = await fs.readFile(cacheFilePath);
                        return new Response(buffer, { headers: { 'Content-Type': 'image/png' } });
                    } catch (_error) {}
                }
            }

            try {
                const result = await new Promise((resolve) => {
                    const id = ++iconReqIdCounter;
                    const extPath = buildExtractFileIconPath();
                    extractionQueue.push({ id, path: targetPath, extPath, resolve, enqueuedAt: Date.now() });
                    processExtractionQueue();
                });
                if (result && result.base64) {
                    const buffer = Buffer.from(result.base64, 'base64');
                    storeHighResIconInCache(targetPath, result.base64, result.meta || null).catch(() => {});
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

    function registerProtocolHandler() {
        protocol.handle('game-icon', handleProtocolRequest);
    }

    function registerIpcHandler() {
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

module.exports = {
    createIconPipeline
};

// @ts-nocheck
const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');
const { fork, spawnSync } = require('child_process');

const ICON_WORKER_BOOT_MAX_ATTEMPTS = 5;
const ICON_WORKER_PROBE_PATH = path.join(process.env.WINDIR || 'C:\\Windows', 'System32', 'notepad.exe');

function createWorkerPool({ app, sourceRootDir }) {
    const iconWorkers = [];
    const pendingIconRequests = new Map();
    const extractionQueue = [];

    let iconReqIdCounter = 0;
    let activeExtractionReq = null;
    let isExtracting = false;
    let resolvedNodeExecPath = null;
    let workerBootstrapPromise = null;

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
        const idx = iconWorkers.indexOf(worker);
        if (idx > -1) iconWorkers.splice(idx, 1);
        try {
            worker.kill();
        } catch {}
    }

    function createIconWorker() {
        const workerId = iconWorkers.length + 1;
        const nodeExecPath = resolveNodeExecPath();
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

            const timeout = setTimeout(() => {
                pendingIconRequests.delete(probeId);
                resolve(false);
            }, 3000);

            pendingIconRequests.set(probeId, {
                worker,
                timeout,
                resolve: ({ meta }) => {
                    const rawLength = meta && typeof meta.rawLength === 'number' ? meta.rawLength : 0;
                    const ok = rawLength > 0;
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

        try {
            const worker = await ensureHealthyIconWorker();
            req.worker = worker;
            activeExtractionReq = req;

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

    function enqueueExtraction(targetPath) {
        return new Promise((resolve) => {
            const id = ++iconReqIdCounter;
            const extPath = buildExtractFileIconPath();

            extractionQueue.push({ id, path: targetPath, extPath, resolve, enqueuedAt: Date.now() });
            processExtractionQueue();
        });
    }

    return {
        enqueueExtraction,
        buildExtractFileIconPath,
        processExtractionQueue
    };
}

module.exports = {
    createWorkerPool
};

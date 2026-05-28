import * as fsSync from 'fs';
import * as path from 'path';
import { fork, spawnSync, ChildProcess } from 'child_process';

const ICON_WORKER_BOOT_MAX_ATTEMPTS = 5;
const ICON_WORKER_PROBE_PATH = path.join(process.env.WINDIR || 'C:\\Windows', 'System32', 'notepad.exe');

export interface WorkerPoolAppInterface {
    getAppPath(): string;
}

export interface WorkerPoolOptions {
    app: WorkerPoolAppInterface;
    sourceRootDir: string;
}

interface IconWorker extends ChildProcess {
    __workerId?: number;
    __healthy?: boolean;
    __ready?: boolean;
    __onReady?: (() => void) | null;
}

interface PendingRequest {
    worker: IconWorker;
    timeout: NodeJS.Timeout;
    resolve: (value: { base64: string; meta: any }) => void;
}

interface QueueItem {
    id: number;
    path: string;
    extPath: string;
    resolve: (value: { base64: string; meta: any }) => void;
    enqueuedAt: number;
    sentAt?: number;
    worker?: IconWorker;
    timeout?: NodeJS.Timeout;
}

export interface WorkerPool {
    enqueueExtraction(targetPath: string): Promise<{ base64: string; meta: any }>;
    buildExtractFileIconPath(): string;
    processExtractionQueue(): Promise<void>;
}

export function createWorkerPool({ app, sourceRootDir }: WorkerPoolOptions): WorkerPool {
    const iconWorkers: IconWorker[] = [];
    const pendingIconRequests = new Map<string | number, PendingRequest>();
    const extractionQueue: QueueItem[] = [];

    let iconReqIdCounter = 0;
    let activeExtractionReq: QueueItem | null = null;
    let isExtracting = false;
    let resolvedNodeExecPath: string | null = null;
    let workerBootstrapPromise: Promise<IconWorker> | null = null;

    function resolveNodeExecPath(): string {
        if (resolvedNodeExecPath) return resolvedNodeExecPath;

        const candidates = [
            process.env.npm_node_execpath,
            process.env.NODE,
            process.execPath.toLowerCase().endsWith('\\node.exe') ? process.execPath : null,
            process.env.ProgramFiles ? path.join(process.env.ProgramFiles, 'nodejs', 'node.exe') : null,
            process.env['ProgramFiles(x86)'] ? path.join(process.env['ProgramFiles(x86)'], 'nodejs', 'node.exe') : null
        ].filter((x): x is string => !!x);

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

        // Fallback to process.execPath (Electron) if node.exe is not found (like in packaged app)
        resolvedNodeExecPath = process.execPath;
        return resolvedNodeExecPath;
    }

    function buildExtractFileIconPath(): string {
        const candidate = path.join(app.getAppPath(), 'node_modules', 'extract-file-icon');
        if (fsSync.existsSync(candidate)) {
            return candidate.replace('app.asar', 'app.asar.unpacked');
        }
        // Fallback for development if app.getAppPath() resolves to dist/
        const devCandidate = path.join(app.getAppPath(), '..', 'node_modules', 'extract-file-icon');
        if (fsSync.existsSync(devCandidate)) {
            return devCandidate;
        }
        return candidate.replace('app.asar', 'app.asar.unpacked');
    }

    function recycleWorker(worker: IconWorker, reason: string): void {
        if (!worker) return;
        const idx = iconWorkers.indexOf(worker);
        if (idx > -1) iconWorkers.splice(idx, 1);
        try {
            worker.kill();
        } catch {}
    }

    function createIconWorker(): IconWorker {
        const workerId = iconWorkers.length + 1;
        const nodeExecPath = resolveNodeExecPath();
        const workerPath = path.join(sourceRootDir, 'icon-extractor.js');
        const isElectron = !nodeExecPath.toLowerCase().endsWith('node.exe');

        const worker: IconWorker = fork(workerPath, [], {
            execPath: nodeExecPath,
            stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
            windowsHide: true,
            env: {
                ...process.env,
                ...(isElectron ? { ELECTRON_RUN_AS_NODE: '1' } : {})
            }
        } as any) as IconWorker;

        worker.__workerId = workerId;
        worker.__healthy = false;
        worker.__ready = false;

        if (worker.stdout) {
            worker.stdout.on('data', (data) => process.stdout.write(`[NW${workerId} STDOUT] ${data}`));
        }
        if (worker.stderr) {
            worker.stderr.on('data', (data) => process.stderr.write(`[NW${workerId} STDERR] ${data}`));
        }

        worker.on('message', (msg: any) => {
            if (!msg) return;
            if (msg.type === 'ready') {
                worker.__ready = true;
                if (typeof worker.__onReady === 'function') {
                    worker.__onReady();
                }
                return;
            }
            if (msg.id === undefined) return;
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

    function probeIconWorker(worker: IconWorker, attempt: number): Promise<boolean> {
        return new Promise((resolve) => {
            const timeoutMs = 3000 + (attempt - 1) * 2000;
            let timeout: NodeJS.Timeout;

            const runProbe = () => {
                const probeId = `probe-${worker.pid}-${attempt}-${Date.now()}`;

                timeout = setTimeout(() => {
                    pendingIconRequests.delete(probeId);
                    resolve(false);
                }, timeoutMs);

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
            };

            if (worker.__ready) {
                runProbe();
            } else {
                timeout = setTimeout(() => {
                    worker.__onReady = null;
                    resolve(false);
                }, timeoutMs);

                worker.__onReady = () => {
                    clearTimeout(timeout);
                    worker.__onReady = null;
                    runProbe();
                };
            }
        });
    }

    async function ensureHealthyIconWorker(): Promise<IconWorker> {
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

    async function processExtractionQueue(): Promise<void> {
        if (isExtracting || extractionQueue.length === 0) return;
        isExtracting = true;

        const req = extractionQueue.shift();
        if (!req) {
            isExtracting = false;
            return;
        }
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

            pendingIconRequests.set(req.id, { ...req, worker, timeout: req.timeout });
            worker.send({ type: 'extract', id: req.id, path: req.path, extPath: req.extPath });
        } catch (error: any) {
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

    function enqueueExtraction(targetPath: string): Promise<{ base64: string; meta: any }> {
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

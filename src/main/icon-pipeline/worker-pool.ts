import * as fsSync from 'node:fs';
import * as path from 'node:path';
import { fork, spawnSync, ChildProcess } from 'node:child_process';
import { IconWorkerMessageRequest, IconWorkerMessageResponse } from './icon-extractor';

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
    let workerBootstrapPromise: Promise<IconWorker> | null = null;

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
        const workerPath = path.join(__dirname, 'icon-extractor.js');

        const worker: IconWorker = fork(workerPath, [], {
            execPath: process.execPath,
            stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
            windowsHide: true,
            env: {
                ...process.env,
                ELECTRON_RUN_AS_NODE: '1'
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

        worker.on('message', (msg: IconWorkerMessageResponse | { type: 'ready' }) => {
            if (!msg) return;
            if ('type' in msg && msg.type === 'ready') {
                worker.__ready = true;
                if (typeof worker.__onReady === 'function') {
                    worker.__onReady();
                }
                return;
            }
            
            const response = msg as IconWorkerMessageResponse;
            if (response.id === undefined) return;
            const pending = pendingIconRequests.get(response.id);
            if (pending) {
                clearTimeout(pending.timeout);
                pendingIconRequests.delete(response.id);
                pending.resolve({ base64: response.base64 || '', meta: response.meta || null });
            }
            if (activeExtractionReq?.id === response.id) {
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

            if (activeExtractionReq?.worker === worker) {
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
            const timeoutMs = 4000;
            let timeout: NodeJS.Timeout;

            if (worker.__ready) {
                resolve(true);
            } else {
                timeout = setTimeout(() => {
                    worker.__onReady = null;
                    resolve(false);
                }, timeoutMs);

                worker.__onReady = () => {
                    clearTimeout(timeout);
                    worker.__onReady = null;
                    resolve(true);
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
                recycleWorker(worker, `boot_failed_attempt_${attempt}`);
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
                    error: String((error?.stack) || error)
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

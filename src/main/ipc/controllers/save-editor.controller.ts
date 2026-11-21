import path from 'path';
import { fileURLToPath } from 'node:url';
import { BrowserWindow, BrowserWindow as electronBrowserWindow, dialog as electronDialog, shell as electronShell } from 'electron';
import { RegisterIpcOptions } from '../types';
import { CircularRingBuffer } from '../../../shared/ring-buffer';
import { sanitizeLoneSurrogates, sanitizeUserPaths } from '../../../shared/path-sanitizer';

const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const SAFE_FILENAME_REGEX = /^(?!(?:CON|PRN|AUX|NUL|COM[0-9]|LPT[0-9])(?:\..*)?$)[^\\/:*?"<>|\x00-\x1f]+(?<![. ])$/i;
const QUALIFIED_KEY_REGEX = /^[a-zA-Z0-9_-]+:[^\0\r\n\t]+$/;
const BCP47_REGEX = /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/;

const ALLOWED_SAVE_OPTIONS = new Set([
    'outerKey',
    'outerIv',
    'innerKey',
    'innerIv',
    'rawPlaintextFields',
    'earlyExit',
    'stalenessTimeoutMs',
    'isUpdates',
    'createBackup',
    'encoding',
    'maxBufferSizeBytes',
]);

function isValidGameKey(gameKey: unknown, allowSlashes = false): gameKey is string {
    if (typeof gameKey !== 'string') return false;
    const trimmed = gameKey.trim();
    if (!trimmed || DANGEROUS_KEYS.has(trimmed)) return false;
    if (!allowSlashes && /[\\/]/.test(gameKey)) return false;
    return true;
}

function isValidFileName(fileName: unknown): fileName is string {
    if (typeof fileName !== 'string' || !fileName) return false;
    if (DANGEROUS_KEYS.has(fileName)) return false;
    return SAFE_FILENAME_REGEX.test(fileName);
}

function sanitizeSaveOptions(rawOptions: any): Record<string, any> {
    const safeOptions = rawOptions && typeof rawOptions === 'object' && !Array.isArray(rawOptions) ? rawOptions : {};
    const sanitized: Record<string, any> = {};
    for (const key of Object.keys(safeOptions)) {
        if (DANGEROUS_KEYS.has(key)) {
            continue;
        }
        if (ALLOWED_SAVE_OPTIONS.has(key)) {
            sanitized[key] = safeOptions[key];
        }
    }
    return sanitized;
}

export class SaveEditorIpcController {
    private readonly openWindows = new Map<string, BrowserWindow>();
    private readonly activeTranslations = new Map<string, AbortController>();
    private readonly logBuffer: CircularRingBuffer<string>;
    private isQuitting = false;
    private beforeQuitBound = false;

    constructor(private readonly options: RegisterIpcOptions) {
        const rawCapacity = this.options.diagnosticBufferCapacity;
        const capacity =
            typeof rawCapacity === 'number' && Number.isInteger(rawCapacity) && rawCapacity > 0
                ? rawCapacity
                : 500;
        this.logBuffer = new CircularRingBuffer<string>(capacity);
    }

    public getLogBuffer(_gameKey?: string): CircularRingBuffer<string> {
        return this.logBuffer;
    }

    public getLogEntries(gameKey?: string): string[] {
        const entries = this.logBuffer.toArray();
        const targetKey = gameKey ? sanitizeUserPaths(gameKey) : undefined;
        return targetKey ? entries.filter((e) => e.includes(`[${targetKey}]`)) : entries;
    }

    public registerHandlers(): void {
        const { ipcMain, libraryState, saveFolderResolver, saveEditorService, fetchFn } = this.options;
        if (!ipcMain) return;

        this.isQuitting = false;
        if (!this.beforeQuitBound && typeof this.options.app?.on === 'function') {
            this.options.app.on('before-quit', () => {
                this.isQuitting = true;
            });
            this.beforeQuitBound = true;
        }

        ipcMain.handle('get-save-folder', async (_event, gameKey) => {
            console.log(`[IPC][get-save-folder] Received request for: ${sanitizeUserPaths(gameKey)}`);
            const record = await libraryState?.getGameRecord(gameKey);
            if (!record) {
                console.warn(`[IPC][get-save-folder] Could not resolve record for key: ${sanitizeUserPaths(gameKey)}`);
                return { path: null, engine: null, confidence: 'none' };
            }
            if (!record.exePath) {
                console.warn(`[IPC][get-save-folder] Record found but has no exePath: ${sanitizeUserPaths(record.name)}`);
                return { path: null, engine: null, confidence: 'none' };
            }
            console.log(`[IPC][get-save-folder] Resolved to record: ${sanitizeUserPaths(record.name)} (${sanitizeUserPaths(record.exePath)})`);
            return saveFolderResolver?.resolveSaveFolder(record.exePath, record.saveFolderOverride);
        });

        ipcMain.handle('save-editor:select-directory', async (_event) => {
            const dialog = this.options.dialog || electronDialog;
            if (!dialog?.showOpenDialog) {
                return { canceled: true, folderPath: null };
            }
            try {
                const BrowserWindowConstructor = this.options.browserWindow || electronBrowserWindow;
                const win = typeof BrowserWindowConstructor?.fromWebContents === 'function'
                    ? (BrowserWindowConstructor.fromWebContents(_event?.sender) || BrowserWindowConstructor.getFocusedWindow?.() || null)
                    : null;
                const result = win
                    ? await dialog.showOpenDialog(win, {
                        properties: ['openDirectory'],
                        title: 'Select Save Folder',
                    })
                    : await dialog.showOpenDialog({
                        properties: ['openDirectory'],
                        title: 'Select Save Folder',
                    });
                return {
                    canceled: Boolean(result?.canceled || !result?.filePaths?.length),
                    folderPath: result?.filePaths?.[0] || null,
                };
            } catch (err) {
                console.warn('[IPC][save-editor:select-directory] Dialog open failed:', err);
                return { canceled: true, folderPath: null };
            }
        });

        ipcMain.handle('save-folder:open', async (_event, gameKey) => {
            try {
                const validGameKey = typeof gameKey === 'string' ? gameKey.trim() : null;
                if (!validGameKey || ['__proto__', 'constructor', 'prototype'].includes(validGameKey)) {
                    return { ok: false, error: 'invalid-payload' };
                }
                const shell = this.options.shell || electronShell;
                if (!shell?.openPath) return { ok: false, error: 'no-shell' };
                const record = await libraryState?.getGameRecord(validGameKey);
                if (!record?.exePath) return { ok: false, error: 'no-record' };
                const resolved = await saveFolderResolver?.resolveSaveFolder(record.exePath, record.saveFolderOverride);
                if (resolved?.path && !resolved.overrideMissing) {
                    const normalizedPath = path.normalize(resolved.path);
                    const openError = await shell.openPath(normalizedPath);
                    if (openError) {
                        return { ok: false, error: openError };
                    }
                    return { ok: true, path: normalizedPath };
                }
                return { ok: false, error: resolved?.overrideMissing ? 'override-missing' : 'not-found' };
            } catch (err: any) {
                console.warn('[IPC][save-folder:open] Error opening save folder:', err);
                return { ok: false, error: err?.message || 'failed' };
            }
        });

        const handleSetSaveFolderOverride = async (_event: any, payload: any) => {
            try {
                const gameKey = typeof payload?.gameKey === 'string' ? payload.gameKey.trim() : null;
                if (!gameKey || ['__proto__', 'constructor', 'prototype'].includes(gameKey)) {
                    return { ok: false, error: 'invalid-payload' };
                }
                if (payload?.folderPath !== null && typeof payload?.folderPath !== 'string') {
                    return { ok: false, error: 'invalid-payload' };
                }
                let folderPath = payload.folderPath === null ? '' : payload.folderPath.trim().replace(/\0|%00/g, '');
                if (folderPath) {
                    const isUnc = /^(\\\\|\/\/|\\\/|\/\\)/.test(folderPath) || (path.win32.isAbsolute(folderPath) && folderPath.startsWith('\\\\'));
                    const isAbsolute = path.isAbsolute(folderPath) || path.win32.isAbsolute(folderPath) || path.posix.isAbsolute(folderPath) || /^[a-zA-Z]:[\\/]/.test(folderPath);
                    if (isUnc || !isAbsolute) {
                        return { ok: false, error: 'invalid-payload' };
                    }
                    if (/^[a-zA-Z]:[\\/]/.test(folderPath)) {
                        folderPath = path.win32.normalize(folderPath);
                    } else {
                        folderPath = path.resolve(folderPath);
                    }
                }
                const result = await libraryState?.setSaveFolderOverride(gameKey, folderPath);
                if (!result || !result.ok) {
                    return { ok: false, error: 'game-not-found' };
                }
                return { ok: true, saveFolderOverride: folderPath || null };
            } catch (err: any) {
                console.warn('[IPC][set-save-folder-override] Error setting override:', err);
                return { ok: false, error: err?.message || 'failed' };
            }
        };

        ipcMain.handle('set-save-folder-override', handleSetSaveFolderOverride);
        ipcMain.handle('save-editor:set-save-folder-override', handleSetSaveFolderOverride);

        ipcMain.handle('save-editor:list-files', async (_event, gameKey) => {
            if (!isValidGameKey(gameKey, true)) {
                console.warn('[IPC][save-editor:list-files] Invalid gameKey:', {
                    gameKey: typeof gameKey === 'string' ? sanitizeUserPaths(gameKey) : typeof gameKey,
                });
                throw new Error('invalid-payload');
            }
            try {
                return await saveEditorService?.listSaveFiles(gameKey);
            } catch (err: unknown) {
                const rawMsg = err instanceof Error ? err.message : String(err);
                console.error('[IPC][save-editor:list-files] Failed to list save files:', {
                    gameKey: sanitizeUserPaths(gameKey),
                    error: sanitizeUserPaths(rawMsg),
                    stack: err instanceof Error && err.stack ? sanitizeUserPaths(err.stack) : undefined,
                });
                throw new Error(sanitizeUserPaths(rawMsg));
            }
        });

        const activeLoads = new Map<string, Set<() => void>>();

        ipcMain.handle('save-editor:load-data', async (event, payload: any) => {
            const { gameKey, fileName, earlyExit, stalenessTimeoutMs, options } =
                payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
            if (!isValidGameKey(gameKey) || !isValidFileName(fileName)) {
                console.warn('[IPC][save-editor:load-data] Invalid payload:', {
                    gameKey: typeof gameKey === 'string' ? sanitizeUserPaths(gameKey) : typeof gameKey,
                    fileName: typeof fileName === 'string' ? sanitizeUserPaths(fileName) : typeof fileName,
                });
                throw new Error('invalid-payload');
            }
            const key = `${gameKey}:${fileName}`;
            let cancelled = false;
            const cancelFn = () => {
                cancelled = true;
            };
            let loadSet = activeLoads.get(key);
            if (!loadSet) {
                loadSet = new Set();
                activeLoads.set(key, loadSet);
            }
            loadSet.add(cancelFn);

            const sanitizedOptions = sanitizeSaveOptions(options);
            let resolvedEarlyExit = true;
            if (earlyExit !== undefined) {
                resolvedEarlyExit = Boolean(earlyExit);
            } else if (sanitizedOptions.earlyExit !== undefined) {
                resolvedEarlyExit = Boolean(sanitizedOptions.earlyExit);
            }

            let resolvedStalenessTimeoutMs = 10000;
            if (stalenessTimeoutMs !== undefined) {
                resolvedStalenessTimeoutMs = Number(stalenessTimeoutMs);
            } else if (sanitizedOptions.stalenessTimeoutMs !== undefined) {
                resolvedStalenessTimeoutMs = Number(sanitizedOptions.stalenessTimeoutMs);
            }

            const mergedOptions = {
                ...sanitizedOptions,
                earlyExit: resolvedEarlyExit,
                stalenessTimeoutMs: resolvedStalenessTimeoutMs,
                onProgress: (prog: { current?: number; total?: number; percent?: number; unit?: string; pos?: number; totalBytes?: number; iterations?: number }) => {
                    if (!event?.sender?.isDestroyed?.()) {
                        const current = prog.current ?? prog.pos ?? 0;
                        const total = prog.total ?? prog.totalBytes ?? 0;
                        const percent = prog.percent ?? (total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0);
                        const unit = prog.unit ?? 'bytes';
                        event?.sender?.send?.('save-editor:load-progress', {
                            gameKey,
                            fileName,
                            current,
                            total,
                            percent,
                            unit,
                            pos: current,
                            totalBytes: total,
                        });
                    }
                },
                shouldCancel: () => cancelled,
            };

            try {
                const loaded = await saveEditorService?.loadSaveData(gameKey, fileName, mergedOptions);
                if (!loaded || typeof loaded !== 'object') {
                    return loaded;
                }
                const { data: _legacyData, metadata: _legacyMetadata, ...normalizedDto } = loaded;
                return normalizedDto;
            } catch (err: unknown) {
                const rawMsg = err instanceof Error ? err.message : String(err);
                console.error('[IPC][save-editor:load-data] Failed to load save file:', {
                    gameKey: sanitizeUserPaths(gameKey),
                    fileName: sanitizeUserPaths(fileName),
                    error: sanitizeUserPaths(rawMsg),
                    stack: err instanceof Error && err.stack ? sanitizeUserPaths(err.stack) : undefined,
                });
                throw new Error(sanitizeUserPaths(rawMsg));
            } finally {
                const currentSet = activeLoads.get(key);
                if (currentSet) {
                    currentSet.delete(cancelFn);
                    if (currentSet.size === 0) {
                        activeLoads.delete(key);
                    }
                }
            }
        });

        ipcMain.handle('save-editor:cancel-load', async (_event, payload: any) => {
            const { gameKey, fileName } =
                payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
            if (!isValidGameKey(gameKey) || !isValidFileName(fileName)) {
                return { cancelled: false };
            }
            const key = `${gameKey}:${fileName}`;
            const cancelFns = activeLoads.get(key);
            if (cancelFns && cancelFns.size > 0) {
                for (const fn of cancelFns) {
                    fn();
                }
                activeLoads.delete(key);
                return { cancelled: true };
            }
            return { cancelled: false };
        });

        ipcMain.handle('save-editor:write-data', async (_event, payload: any) => {
            const { gameKey, fileName, updates, options } =
                payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};

            if (!isValidGameKey(gameKey) || !isValidFileName(fileName)) {
                console.warn('[IPC][save-editor:write-data] Invalid gameKey or fileName:', {
                    gameKey: typeof gameKey === 'string' ? sanitizeUserPaths(gameKey) : typeof gameKey,
                    fileName: typeof fileName === 'string' ? sanitizeUserPaths(fileName) : typeof fileName,
                });
                return { ok: false, error: 'invalid-payload' };
            }

            if (updates === undefined || updates === null || typeof updates !== 'object' || Array.isArray(updates)) {
                console.warn('[IPC][save-editor:write-data] Invalid updates payload type:', {
                    gameKey: sanitizeUserPaths(gameKey),
                    fileName: sanitizeUserPaths(fileName),
                    updatesType: updates === undefined ? 'undefined' : updates === null ? 'null' : Array.isArray(updates) ? 'array' : typeof updates,
                });
                return { ok: false, error: 'invalid-payload' };
            }

            const sanitizedOptions = sanitizeSaveOptions(options);
            if (sanitizedOptions.isUpdates === false) {
                console.warn('[IPC][save-editor:write-data] Rejecting mismatched write envelope and isUpdates option:', {
                    abort_reason: 'ENVELOPE_OPTION_MISMATCH',
                    envelope: 'updates',
                    optionIsUpdates: sanitizedOptions.isUpdates,
                    gameKey: sanitizeUserPaths(gameKey),
                    fileName: sanitizeUserPaths(fileName),
                });
                return { ok: false, error: 'invalid-payload' };
            }
            sanitizedOptions.isUpdates = true;

            const rawEntries = Object.entries(updates);
            if (rawEntries.length === 0) {
                return { ok: true };
            }

            const sanitizedUpdates: Record<string, any> = Object.create(null);
            for (const [rawKey, value] of rawEntries) {
                if (typeof rawKey !== 'string' || !QUALIFIED_KEY_REGEX.test(rawKey)) {
                    continue;
                }

                const colonIdx = rawKey.indexOf(':');
                const tabId = rawKey.slice(0, colonIdx);
                const fieldKey = rawKey.slice(colonIdx + 1);

                if (
                    DANGEROUS_KEYS.has(tabId) ||
                    DANGEROUS_KEYS.has(fieldKey) ||
                    fieldKey.split(/[.:/\\[\]]/).some((seg) => DANGEROUS_KEYS.has(seg))
                ) {
                    continue;
                }

                const isScalar =
                    value === null ||
                    typeof value === 'boolean' ||
                    typeof value === 'string' ||
                    (typeof value === 'number' && Number.isFinite(value));

                if (!isScalar) {
                    continue;
                }

                sanitizedUpdates[rawKey] = value;
            }

            if (Object.keys(sanitizedUpdates).length === 0) {
                console.warn('[IPC][save-editor:write-data] All update keys stripped during sanitization:', {
                    abort_reason: 'ALL_KEYS_STRIPPED',
                    gameKey: sanitizeUserPaths(gameKey),
                    fileName: sanitizeUserPaths(fileName),
                });
                return { ok: false, error: 'invalid-payload' };
            }

            try {
                return await saveEditorService?.writeSaveData(gameKey, fileName, sanitizedUpdates, sanitizedOptions);
            } catch (err: unknown) {
                const rawMsg = err instanceof Error ? err.message : String(err);
                const errorCode =
                    err && typeof err === 'object' && 'code' in err && typeof (err as any).code === 'string'
                        ? (err as any).code
                        : undefined;
                const sanitizedErrorMsg = sanitizeUserPaths(rawMsg);
                console.error('[IPC][save-editor:write-data] Write save data failed:', {
                    gameKey: sanitizeUserPaths(gameKey),
                    fileName: sanitizeUserPaths(fileName),
                    error: sanitizedErrorMsg,
                    code: errorCode,
                    stack: err instanceof Error && err.stack ? sanitizeUserPaths(err.stack) : undefined,
                });
                return {
                    ok: false,
                    error: sanitizedErrorMsg,
                    ...(errorCode ? { code: errorCode } : {}),
                };
            }
        });

        ipcMain.handle('save-editor:rename-file', async (_event, payload: any) => {
            const { gameKey, oldFileName, newFileName, overwrite } =
                payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
            if (!isValidGameKey(gameKey) || !isValidFileName(oldFileName) || !isValidFileName(newFileName)) {
                console.warn('[IPC][save-editor:rename-file] Invalid payload:', {
                    gameKey: typeof gameKey === 'string' ? sanitizeUserPaths(gameKey) : typeof gameKey,
                    oldFileName: typeof oldFileName === 'string' ? sanitizeUserPaths(oldFileName) : typeof oldFileName,
                    newFileName: typeof newFileName === 'string' ? sanitizeUserPaths(newFileName) : typeof newFileName,
                });
                return { ok: false, error: 'invalid-payload' };
            }
            try {
                return await saveEditorService?.renameSaveFile(gameKey, oldFileName, newFileName, overwrite);
            } catch (err: unknown) {
                const rawMsg = err instanceof Error ? err.message : String(err);
                console.error('[IPC][save-editor:rename-file] Failed to rename save file:', {
                    gameKey: sanitizeUserPaths(gameKey),
                    oldFileName: sanitizeUserPaths(oldFileName),
                    newFileName: sanitizeUserPaths(newFileName),
                    error: sanitizeUserPaths(rawMsg),
                    stack: err instanceof Error && err.stack ? sanitizeUserPaths(err.stack) : undefined,
                });
                throw new Error(sanitizeUserPaths(rawMsg));
            }
        });

        ipcMain.handle('save-editor:delete-file', async (_event, payload: any) => {
            const { gameKey, fileName } =
                payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
            if (!isValidGameKey(gameKey) || !isValidFileName(fileName)) {
                console.warn('[IPC][save-editor:delete-file] Invalid payload:', {
                    gameKey: typeof gameKey === 'string' ? sanitizeUserPaths(gameKey) : typeof gameKey,
                    fileName: typeof fileName === 'string' ? sanitizeUserPaths(fileName) : typeof fileName,
                });
                return { ok: false, error: 'invalid-payload' };
            }
            try {
                return await saveEditorService?.deleteSaveFile(gameKey, fileName);
            } catch (err: unknown) {
                const rawMsg = err instanceof Error ? err.message : String(err);
                console.error('[IPC][save-editor:delete-file] Failed to delete save file:', {
                    gameKey: sanitizeUserPaths(gameKey),
                    fileName: sanitizeUserPaths(fileName),
                    error: sanitizeUserPaths(rawMsg),
                    stack: err instanceof Error && err.stack ? sanitizeUserPaths(err.stack) : undefined,
                });
                throw new Error(sanitizeUserPaths(rawMsg));
            }
        });

        ipcMain.handle('save-editor:translate-batch', async (event, texts, targetLang, opts) => {
            const [rawTexts, rawTargetLang, rawOpts] = (
                texts !== null &&
                typeof texts === 'object' &&
                !Array.isArray(texts) &&
                'texts' in (texts as Record<string, unknown>)
            )
                ? [
                    (texts as Record<string, unknown>).texts,
                    (texts as Record<string, unknown>).targetLang,
                    ((texts as Record<string, unknown>).options ?? (texts as Record<string, unknown>).opts) as { timeoutMs?: number; maxBatchSize?: number; jobId?: string } | undefined
                ]
                : [texts, targetLang, opts];

            const jobId = typeof rawOpts?.jobId === 'string' ? rawOpts.jobId.trim() : undefined;

            if (!Array.isArray(rawTexts) || !rawTexts.every((t) => typeof t === 'string')) {
                console.warn('[save-editor:translate-batch] Ingress validation failed: texts must be an array of strings');
                throw new Error('invalid-texts-array');
            }

            if (rawTexts.length === 0) {
                return {};
            }

            if (typeof rawTargetLang !== 'string' || !BCP47_REGEX.test(rawTargetLang.trim())) {
                throw new Error('invalid-target-lang');
            }
            const cleanTargetLang = rawTargetLang.trim();

            const maxBatch = typeof rawOpts?.maxBatchSize === 'number' && rawOpts.maxBatchSize > 0 ? Math.min(rawOpts.maxBatchSize, 100) : 100;
            const totalChars = rawTexts.reduce((sum: number, t: string) => sum + t.length, 0);
            if (rawTexts.length > maxBatch || rawTexts.some((t: string) => t.length > 300) || totalChars > 2000) {
                throw new Error('batch-query-too-large');
            }

            const timeoutMs = (typeof rawOpts?.timeoutMs === 'number' &&
                               Number.isFinite(rawOpts.timeoutMs) &&
                               rawOpts.timeoutMs > 0 &&
                               rawOpts.timeoutMs <= 300_000)
                ? Math.max(1, Math.floor(rawOpts.timeoutMs))
                : 10_000;

            const validEntries = (rawTexts as string[])
                .map((raw) => ({ raw, sanitized: sanitizeLoneSurrogates(raw.replace(/[\r\n]+/g, ' ').trim()) }))
                .filter((entry) => entry.sanitized.length > 0 && encodeURIComponent(entry.sanitized).length <= 1500);
            if (validEntries.length === 0) {
                return {};
            }

            // Sub-partition validEntries so each chunk's encodeURIComponent(combined).length <= 1500 bytes (URL <= 2048 chars)
            const chunks: (typeof validEntries)[] = [];
            let curChunk: typeof validEntries = [];
            let curEncodedLen = 0;
            for (const entry of validEntries) {
                const prospectiveLen = encodeURIComponent((curChunk.length > 0 ? '\n' : '') + entry.sanitized).length;
                if (curChunk.length > 0 && curEncodedLen + prospectiveLen > 1500) {
                    chunks.push(curChunk);
                    curChunk = [entry];
                    curEncodedLen = encodeURIComponent(entry.sanitized).length;
                } else {
                    curChunk.push(entry);
                    curEncodedLen += prospectiveLen;
                }
            }
            if (curChunk.length > 0) chunks.push(curChunk);

            const controller = new AbortController();
            if (jobId) {
                const existing = this.activeTranslations.get(jobId);
                if (existing) {
                    existing.abort();
                }
                this.activeTranslations.set(jobId, controller);
            }
            const onDestroyed = () => controller.abort();
            if (event?.sender?.isDestroyed?.()) {
                controller.abort();
            } else {
                try {
                    event?.sender?.once?.('destroyed', onDestroyed);
                } catch {
                    controller.abort();
                }
            }

            function cancellableSleep(ms: number, signal: AbortSignal): Promise<void> {
                if (signal.aborted) {
                    return Promise.reject(new DOMException('Translation batch cancelled by client', 'AbortError'));
                }
                return new Promise((resolve, reject) => {
                    let timer: ReturnType<typeof setTimeout> | null = null;
                    const onAbort = () => {
                        if (timer) clearTimeout(timer);
                        signal.removeEventListener('abort', onAbort);
                        reject(new DOMException('Translation batch cancelled by client', 'AbortError'));
                    };
                    timer = setTimeout(() => {
                        signal.removeEventListener('abort', onAbort);
                        resolve();
                    }, ms);
                    signal.addEventListener('abort', onAbort, { once: true });
                });
            }

            const results: Record<string, string> = Object.create(null);
            let processedChunks = 0;
            try {
                const overallDeadline = performance.now() + timeoutMs;
                const actualFetch = fetchFn ?? globalThis.fetch;

                async function fetchWithRetry(url: string, chunkIdx: number): Promise<Response> {
                    const maxRetries = 2;
                    let lastErr: unknown;
                    for (let attempt = 0; attempt <= maxRetries; attempt++) {
                        if (controller.signal.aborted) {
                            throw new DOMException('Translation batch cancelled by client', 'AbortError');
                        }
                        const currentRemaining = overallDeadline - performance.now();
                        if (currentRemaining <= 0) {
                            throw new Error(`Translation batch timed out: overall deadline of ${timeoutMs}ms exceeded`);
                        }
                        const chunkTimeoutMs = Math.max(1, Math.floor(Math.min(currentRemaining, 5000)));
                        try {
                            const response = await actualFetch(url, {
                                signal: AbortSignal.any([controller.signal, AbortSignal.timeout(chunkTimeoutMs)]),
                                headers: {
                                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                                }
                            });
                            if (response.status === 429) {
                                // Immediate circuit break on rate limit
                                throw new Error('HTTP 429: Too Many Requests');
                            }
                            const isTransient = response.status >= 500 && response.status <= 599;
                            if (isTransient && attempt < maxRetries) {
                                let retryAfterMs = 250 * Math.pow(2, attempt) + Math.floor(Math.random() * 50);
                                const retryAfterHeader = response.headers?.get('Retry-After');
                                if (retryAfterHeader) {
                                    const parsedSec = Number.parseInt(retryAfterHeader, 10);
                                    if (Number.isFinite(parsedSec) && parsedSec > 0) {
                                        retryAfterMs = parsedSec * 1000;
                                    }
                                }
                                if (performance.now() + retryAfterMs >= overallDeadline) {
                                    throw new Error(`HTTP ${response.status}: ${response.statusText} (retry would exceed deadline)`);
                                }
                                console.warn('[save-editor:translate-batch] Transient network error encountered, retrying:', {
                                    attempt: attempt + 1,
                                    maxRetries,
                                    status: response.status,
                                    retryAfterMs,
                                    chunkIndex: chunkIdx,
                                    remainingDeadlineMs: Math.max(0, Math.floor(overallDeadline - performance.now()))
                                });
                                await cancellableSleep(retryAfterMs, controller.signal);
                                continue;
                            }
                            if (!response.ok) {
                                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                            }
                            return response;
                        } catch (err: any) {
                            lastErr = err;
                            if (controller.signal.aborted) {
                                throw err;
                            }
                            if (err?.message?.includes('HTTP 429') || attempt >= maxRetries) {
                                break;
                            }
                            const isTimeout =
                                err?.name === 'TimeoutError' ||
                                err?.name === 'AbortError' ||
                                err?.code === 'ETIMEDOUT';
                            const errCode = err?.cause?.code ?? err?.code;
                            const isTransientNetworkError =
                                ['ENOTFOUND', 'ECONNRESET', 'ECONNREFUSED', 'EAI_AGAIN', 'UND_ERR_CONNECT_TIMEOUT', 'ETIMEDOUT'].includes(errCode) ||
                                (err?.name === 'TypeError' && err?.message === 'fetch failed');
                            const isRetryable = (isTimeout || isTransientNetworkError) && attempt < maxRetries;
                            if (isRetryable) {
                                const backoffMs = 250 * Math.pow(2, attempt) + Math.floor(Math.random() * 50);
                                if (performance.now() + backoffMs >= overallDeadline) {
                                    break;
                                }
                                const rawMsg = err instanceof Error ? err.message : String(err);
                                console.warn('[save-editor:translate-batch] Transient network error encountered, retrying:', {
                                    attempt: attempt + 1,
                                    maxRetries,
                                    error: sanitizeUserPaths(rawMsg),
                                    errorCode: errCode,
                                    chunkIndex: chunkIdx,
                                    remainingDeadlineMs: Math.max(0, Math.floor(overallDeadline - performance.now()))
                                });
                                await cancellableSleep(backoffMs, controller.signal);
                                continue;
                            }
                            break;
                        }
                    }
                    if (controller.signal.aborted) {
                        throw lastErr;
                    }
                    const lastErrMsg = lastErr instanceof Error ? lastErr.message : String(lastErr);
                    console.warn('[save-editor:translate-batch] Translation request failed after retries:', {
                        chunkIndex: chunkIdx,
                        error: sanitizeUserPaths(lastErrMsg),
                        stack: lastErr instanceof Error && lastErr.stack ? sanitizeUserPaths(lastErr.stack) : undefined,
                    });
                    throw lastErr;
                }

                async function runBoundedFallback(
                    chunk: Array<{ raw: string; sanitized: string }>,
                    targetLanguage: string,
                    deadline: number,
                    totalTimeoutMs: number,
                    fetchImpl: typeof fetch,
                    outResults: Record<string, string>,
                    cancelSignal: AbortSignal
                ): Promise<void> {
                    const CONCURRENCY_LIMIT = 4;
                    const fallbackAbort = new AbortController();
                    let cursor = 0;
                    let circuitBrokenError: Error | null = null;
                    let deadlineExceeded = false;

                    async function worker(): Promise<void> {
                        while (cursor < chunk.length) {
                            if (cancelSignal.aborted) {
                                throw new DOMException('Translation batch cancelled by client', 'AbortError');
                            }
                            if (circuitBrokenError || deadlineExceeded || fallbackAbort.signal.aborted) {
                                return;
                            }
                            if (performance.now() >= deadline) {
                                deadlineExceeded = true;
                                fallbackAbort.abort();
                                return;
                            }
                            const index = cursor++;
                            const entry = chunk[index];
                            const trimmed = entry.sanitized.trim();
                            if (!trimmed) {
                                if (!DANGEROUS_KEYS.has(entry.sanitized)) outResults[entry.sanitized] = entry.sanitized;
                                if (!DANGEROUS_KEYS.has(entry.raw)) outResults[entry.raw] = entry.raw;
                                continue;
                            }

                            const remainingBudget = deadline - performance.now();
                            if (remainingBudget <= 0) {
                                deadlineExceeded = true;
                                fallbackAbort.abort();
                                return;
                            }
                            const isDeadlineBoundCall = remainingBudget <= 5000;
                            const callTimeout = Math.max(1, Math.floor(Math.min(remainingBudget, 5000)));
                            const itemTimeoutSignal = AbortSignal.timeout(callTimeout);
                            const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(
                                targetLanguage
                            )}&dt=t&q=${encodeURIComponent(entry.sanitized)}`;

                            try {
                                const res = await fetchImpl(url, {
                                    signal: AbortSignal.any([cancelSignal, fallbackAbort.signal, itemTimeoutSignal]),
                                    headers: {
                                        'User-Agent':
                                            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                                    }
                                });

                                if (res.status === 429) {
                                    circuitBrokenError = new Error('HTTP 429: Too Many Requests');
                                    fallbackAbort.abort();
                                    return;
                                }

                                if (res.ok) {
                                    const rawJson = await res.json();
                                    if (Array.isArray(rawJson?.[0])) {
                                        const fullTrans = rawJson[0].map((item: any) => (Array.isArray(item) ? item[0] ?? '' : '')).join('');
                                        const resolvedTrans = fullTrans.trim().length === 0 ? entry.sanitized : fullTrans;
                                        if (!DANGEROUS_KEYS.has(entry.sanitized)) {
                                            outResults[entry.sanitized] = resolvedTrans;
                                        }
                                        if (!DANGEROUS_KEYS.has(entry.raw)) {
                                            outResults[entry.raw] = resolvedTrans;
                                        }
                                    }
                                } else {
                                    console.warn(`[SaveEditor:Translate] Bounded fallback item failed with HTTP ${res.status}:`, {
                                        segment: sanitizeUserPaths(entry.sanitized.slice(0, 40)),
                                        status: res.status,
                                        statusText: res.statusText,
                                    });
                                }
                            } catch (err: any) {
                                if (cancelSignal.aborted) {
                                    throw new DOMException('Translation batch cancelled by client', 'AbortError');
                                }
                                if (err?.message?.includes('HTTP 429')) {
                                    circuitBrokenError = err instanceof Error ? err : new Error('HTTP 429 Rate Limited');
                                    fallbackAbort.abort();
                                    return;
                                }
                                if (fallbackAbort.signal.aborted) {
                                    return;
                                }
                                const isOverallBudgetTimeout =
                                    performance.now() >= deadline ||
                                    (isDeadlineBoundCall && (itemTimeoutSignal.aborted || err?.name === 'TimeoutError'));
                                if (isOverallBudgetTimeout) {
                                    deadlineExceeded = true;
                                    fallbackAbort.abort();
                                    return;
                                }
                                const rawFallbackMsg: unknown = err instanceof Error ? err.message : err;
                                console.warn(
                                    `[SaveEditor:Translate] Bounded fallback item translation failed for segment "${sanitizeUserPaths(entry.sanitized.slice(0, 40))}":`,
                                    {
                                        error: sanitizeUserPaths(rawFallbackMsg),
                                        stack: err instanceof Error && err.stack ? sanitizeUserPaths(err.stack) : undefined,
                                    }
                                );
                            }
                        }
                    }

                    const pool = Array.from({ length: Math.min(CONCURRENCY_LIMIT, chunk.length) }, () => worker());
                    await Promise.all(pool);

                    if (cancelSignal.aborted) {
                        throw new DOMException('Translation batch cancelled by client', 'AbortError');
                    }
                    if (circuitBrokenError) {
                        throw circuitBrokenError;
                    }
                    if (deadlineExceeded) {
                        throw new Error(`Translation batch timed out: overall deadline of ${totalTimeoutMs}ms exceeded`);
                    }
                }

                for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
                    if (controller.signal.aborted) {
                        throw new DOMException('Translation batch cancelled by client', 'AbortError');
                    }
                    const chunk = chunks[chunkIdx];
                    const remainingMs = overallDeadline - performance.now();
                    if (remainingMs <= 0) {
                        throw new Error(`Translation batch timed out: overall deadline of ${timeoutMs}ms exceeded`);
                    }
                    const combinedText = chunk.map((e) => e.sanitized).join('\n');
                    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(cleanTargetLang)}&dt=t&q=${encodeURIComponent(combinedText)}`;
                    const response = await fetchWithRetry(url, chunkIdx);
                    let rawJson: unknown;
                    try {
                        rawJson = await response.json();
                    } catch (err) {
                        if (controller.signal.aborted) {
                            throw err;
                        }
                        console.warn('[save-editor] Received invalid upstream non-JSON response from translation service; captive portal or upstream block suspected');
                        throw new Error('invalid-upstream-response', { cause: err });
                    }
                    if (!Array.isArray(rawJson) || !Array.isArray(rawJson[0])) {
                        console.warn('[save-editor:translate-batch] Invalid upstream response structure from translation service:', {
                            chunkIndex: chunkIdx,
                            receivedType: typeof rawJson,
                            isRootArray: Array.isArray(rawJson),
                        });
                        throw new Error('invalid-upstream-response');
                    }
                    const translatedFull = (rawJson[0] as unknown[])
                        .filter((segment): segment is [string, ...unknown[]] => Array.isArray(segment) && typeof segment[0] === 'string')
                        .map((segment) => segment[0])
                        .join('');
                    const translatedLines = translatedFull.split('\n');
                    if (translatedLines.length !== chunk.length) {
                        console.warn('[save-editor:translate-batch] Line count drift detected between response and chunk entries; falling back to item-by-item translation:', { chunkIndex: chunkIdx, expected: chunk.length, received: translatedLines.length });
                        await runBoundedFallback(chunk, cleanTargetLang, overallDeadline, timeoutMs, actualFetch, results, controller.signal);
                        processedChunks++;
                        continue;
                    }
                    for (let i = 0; i < chunk.length; i++) {
                        const { raw, sanitized } = chunk[i];
                        const translated = translatedLines[i];
                        if (translated !== undefined) {
                            if (!DANGEROUS_KEYS.has(sanitized)) {
                                results[sanitized] = translated;
                            }
                            if (!DANGEROUS_KEYS.has(raw)) {
                                results[raw] = translated;
                            }
                        }
                    }
                    processedChunks++;
                }
            } catch (err: unknown) {
                if (controller.signal.aborted) {
                    console.log('[save-editor:translate-batch] Translation job cancelled:', {
                        jobId: jobId ?? 'unassigned',
                        processedChunks,
                        totalChunks: chunks.length,
                        reason: event?.sender?.isDestroyed?.() ? 'window-destroyed' : 'client-cancelled',
                    });
                    throw new DOMException('Translation batch cancelled by client', 'AbortError');
                }
                throw err;
            } finally {
                try {
                    if (!event?.sender?.isDestroyed?.()) {
                        event?.sender?.removeListener?.('destroyed', onDestroyed);
                    }
                } catch {
                    // Ignore destroyed WebContents object error during cleanup
                }
                if (jobId && this.activeTranslations.get(jobId) === controller) {
                    this.activeTranslations.delete(jobId);
                }
            }

            return { ...results };
        });

        ipcMain.handle('save-editor:cancel-translate', async (_event, payload) => {
            const jobId = typeof payload?.jobId === 'string' ? payload.jobId.trim() : '';
            if (jobId && this.activeTranslations.has(jobId)) {
                this.activeTranslations.get(jobId)?.abort();
                this.activeTranslations.delete(jobId);
                return { cancelled: true };
            }
            return { cancelled: false };
        });

        ipcMain.handle('save-editor:load-translations', async (_event, lang: unknown) => {
            if (typeof lang !== 'string' || !BCP47_REGEX.test(lang)) {
                console.warn('[IPC][save-editor:load-translations] Invalid BCP-47 language tag:', {
                    lang: typeof lang === 'string' ? sanitizeUserPaths(lang) : typeof lang,
                });
                return {};
            }
            if (!saveEditorService?.loadTranslations) {
                return {};
            }
            try {
                return await saveEditorService.loadTranslations(lang);
            } catch (err: unknown) {
                const rawMsg = err instanceof Error ? err.message : String(err);
                console.error('[IPC][save-editor:load-translations] Load translations failed:', {
                    lang: sanitizeUserPaths(lang),
                    error: sanitizeUserPaths(rawMsg),
                    stack: err instanceof Error && err.stack ? sanitizeUserPaths(err.stack) : undefined,
                });
                return {};
            }
        });

        ipcMain.handle('save-editor:save-translations', async (_event, payload: any) => {
            const { lang, translations } =
                payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
            if (typeof lang !== 'string' || !BCP47_REGEX.test(lang)) {
                console.warn('[IPC][save-editor:save-translations] Invalid BCP-47 language tag:', {
                    lang: typeof lang === 'string' ? sanitizeUserPaths(lang) : typeof lang,
                });
                return { ok: false, error: 'invalid-payload' };
            }
            if (translations === null || typeof translations !== 'object' || Array.isArray(translations)) {
                console.warn('[IPC][save-editor:save-translations] Invalid translations payload:', {
                    lang: sanitizeUserPaths(lang),
                });
                return { ok: false, error: 'invalid-payload' };
            }
            const entries = Object.entries(translations);
            if (entries.length > 10000) {
                console.warn('[IPC][save-editor:save-translations] Translations entry limit exceeded:', {
                    lang: sanitizeUserPaths(lang),
                    count: entries.length,
                });
                return { ok: false, error: 'invalid-payload' };
            }
            if (entries.length === 0) {
                return { ok: true };
            }
            const sanitizedTranslations: Record<string, string> = Object.create(null);
            for (const [k, v] of entries) {
                if (typeof k !== 'string' || DANGEROUS_KEYS.has(k) || k.length === 0 || k.length > 300) {
                    continue;
                }
                if (typeof v !== 'string' || v.length > 4096) {
                    continue;
                }
                sanitizedTranslations[k] = v;
            }
            if (Object.keys(sanitizedTranslations).length === 0) {
                console.warn('[IPC][save-editor:save-translations] All translation entries stripped:', {
                    abort_reason: 'ALL_KEYS_STRIPPED',
                    lang: sanitizeUserPaths(lang),
                });
                return { ok: false, error: 'invalid-payload' };
            }
            if (!saveEditorService?.saveTranslations) {
                return { ok: false, error: 'service-unavailable' };
            }
            try {
                return await saveEditorService.saveTranslations(lang, sanitizedTranslations);
            } catch (err: unknown) {
                const rawMsg = err instanceof Error ? err.message : String(err);
                const sanitizedErrorMsg = sanitizeUserPaths(rawMsg);
                console.error('[IPC][save-editor:save-translations] Save translations failed:', {
                    lang: sanitizeUserPaths(lang),
                    error: sanitizedErrorMsg,
                    stack: err instanceof Error && err.stack ? sanitizeUserPaths(err.stack) : undefined,
                });
                return { ok: false, error: sanitizedErrorMsg };
            }
        });

        ipcMain.on('save-editor:open-window', (_event, gameKey) => {
            this.openSaveEditorWindow(gameKey);
        });
    }

    private openSaveEditorWindow(gameKey: unknown): void {
        if (typeof gameKey !== 'string' || !gameKey.trim()) {
            console.warn(
                '[IPC][save-editor:open-window] Invalid gameKey received:',
                typeof gameKey === 'string' ? sanitizeUserPaths(gameKey) : typeof gameKey
            );
            return;
        }
        const normalizedGameKey = gameKey.trim();

        const existingWin = this.openWindows.get(normalizedGameKey);
        if (existingWin && !existingWin.isDestroyed()) {
            if (existingWin.isMinimized?.()) {
                existingWin.restore?.();
            }
            existingWin.focus?.();
            return;
        }

        const BrowserWindowConstructor = this.options.browserWindow || electronBrowserWindow;
        if (typeof BrowserWindowConstructor !== 'function') {
            console.warn('[IPC][save-editor:open-window] BrowserWindowConstructor is not available in headless runtime');
            return;
        }

        const { paths } = this.options;
        const shell = this.options.shell || electronShell;

        const saveEditorWin = new BrowserWindowConstructor({
            width: 1000,
            height: 700,
            backgroundColor: '#121212',
            autoHideMenuBar: true,
            icon: paths ? paths.mainWindowIconPath : undefined,
            webPreferences: {
                preload: paths ? paths.preloadPath : undefined,
                contextIsolation: true,
                nodeIntegration: false,
                sandbox: true
            }
        });

        this.openWindows.set(normalizedGameKey, saveEditorWin);

        saveEditorWin.on?.('closed', () => {
            if (this.openWindows.get(normalizedGameKey) === saveEditorWin) {
                this.openWindows.delete(normalizedGameKey);
            }
        });

        saveEditorWin.webContents?.on?.('render-process-gone', async (_event: any, details: any) => {
            const reason = details?.reason ?? 'unknown';
            const exitCode = details?.exitCode ?? -1;
            const sanitizedKey = sanitizeUserPaths(normalizedGameKey);
            const message = `Render process gone for gameKey "${sanitizedKey}": reason=${reason}, exitCode=${exitCode}`;
            console.error(`[save-editor] ${message}`);
            this.logBuffer.push(`[${new Date().toISOString()}][ERROR][${sanitizedKey}] ${message}`);
            if (this.openWindows.get(normalizedGameKey) === saveEditorWin) {
                this.openWindows.delete(normalizedGameKey);
            }
            try {
                if (!saveEditorWin.isDestroyed()) {
                    saveEditorWin.destroy();
                }
            } catch (destroyErr) {
                console.warn('[save-editor] Non-fatal error destroying window after render-process-gone:', {
                    gameKey: sanitizedKey,
                    error: sanitizeUserPaths(destroyErr instanceof Error ? destroyErr.message : destroyErr),
                    stack: destroyErr instanceof Error && destroyErr.stack ? sanitizeUserPaths(destroyErr.stack) : undefined,
                });
            }

            if (reason === 'clean-exit' || this.isQuitting) {
                return;
            }

            const dialog = this.options.dialog || electronDialog;
            if (typeof dialog?.showMessageBox === 'function') {
                try {
                    const res = await dialog.showMessageBox({
                        type: 'error',
                        title: 'Save Editor Crashed',
                        message: 'The Save Editor window terminated unexpectedly.',
                        detail: `Reason: ${reason} (Exit Code: ${exitCode})\n\nAny unsaved edits in that window could not be preserved.`,
                        buttons: ['Reopen Save Editor', 'Close'],
                        defaultId: 0,
                        cancelId: 1,
                        noLink: true,
                    });
                    if (this.isQuitting) {
                        return;
                    }
                    if (res?.response === 0) {
                        this.openSaveEditorWindow(normalizedGameKey);
                    }
                } catch (dialogErr) {
                    console.warn('[save-editor] Failed to display crash recovery dialog:', {
                        gameKey: sanitizedKey,
                        error: sanitizeUserPaths(dialogErr instanceof Error ? dialogErr.message : dialogErr),
                        stack: dialogErr instanceof Error && dialogErr.stack ? sanitizeUserPaths(dialogErr.stack) : undefined,
                    });
                }
            }
        });

        const devServerUrl = process.env.VITE_DEV_SERVER_URL;
        let appOrigin: string | null = null;
        if (devServerUrl) {
            try {
                appOrigin = new URL(devServerUrl).origin;
            } catch {
                appOrigin = null;
            }
        }

        saveEditorWin.webContents?.setWindowOpenHandler?.(({ url: targetUrl }) => {
            try {
                const parsed = new URL(targetUrl);
                if (['https:', 'http:'].includes(parsed.protocol)) {
                    void shell?.openExternal(parsed.href);
                }
            } catch (err) {
                const sanitizedError = sanitizeUserPaths(err instanceof Error ? (err.stack || err.message) : String(err));
                console.warn('[save-editor] Blocked malformed navigation URL:', sanitizeUserPaths(targetUrl), sanitizedError);
            }
            return { action: 'deny' };
        });

        saveEditorWin.webContents?.on?.('will-navigate', (event, navigationUrl) => {
            try {
                const parsed = new URL(navigationUrl);
                if (appOrigin && parsed.origin === appOrigin) {
                    return;
                }
                if (parsed.protocol === 'file:' && paths?.saveEditorHtmlPath) {
                    const rawTarget = path.normalize(fileURLToPath(parsed.href));
                    const rawAllowed = path.normalize(paths.saveEditorHtmlPath);
                    const rawAllowedDir = path.dirname(rawAllowed);

                    const targetPlatform = this.options?.platform ?? process.platform;
                    const isCaseInsensitive = targetPlatform === 'win32' || targetPlatform === 'darwin';
                    const targetPath = isCaseInsensitive ? rawTarget.toLowerCase() : rawTarget;
                    const allowedPath = isCaseInsensitive ? rawAllowed.toLowerCase() : rawAllowed;
                    const allowedDir = isCaseInsensitive ? rawAllowedDir.toLowerCase() : rawAllowedDir;

                    const boundary = allowedDir.endsWith(path.sep) ? allowedDir : `${allowedDir}${path.sep}`;
                    if (targetPath === allowedPath || targetPath.startsWith(boundary)) {
                        return;
                    }
                }
                event.preventDefault();
                if (['https:', 'http:'].includes(parsed.protocol)) {
                    void shell?.openExternal(parsed.href);
                } else {
                    console.warn('[save-editor] Blocked unauthorized navigation:', sanitizeUserPaths(navigationUrl));
                }
            } catch (err) {
                event.preventDefault();
                const sanitizedError = sanitizeUserPaths(err instanceof Error ? (err.stack || err.message) : String(err));
                console.warn('[save-editor] Blocked malformed navigation URL:', sanitizeUserPaths(navigationUrl), sanitizedError);
            }
        });

        saveEditorWin.removeMenu?.();
        saveEditorWin.setMenuBarVisibility?.(false);

        saveEditorWin.webContents?.on?.('console-message', (event, level, message) => {
            if (saveEditorWin.isDestroyed() || (event as any)?.sender?.isDestroyed?.()) return;
            const sanitized = sanitizeUserPaths(message);
            const sanitizedKey = sanitizeUserPaths(normalizedGameKey);
            const entry = `[${new Date().toISOString()}][level:${level}][${sanitizedKey}] ${sanitized}`;
            this.logBuffer.push(entry);
        });

        if (paths) {
            if (process.env.VITE_DEV_SERVER_URL) {
                saveEditorWin.loadURL?.(`${process.env.VITE_DEV_SERVER_URL}/save-editor.html?gameKey=${encodeURIComponent(normalizedGameKey)}`);
            } else {
                saveEditorWin.loadFile?.(paths.saveEditorHtmlPath, {
                    search: `gameKey=${encodeURIComponent(normalizedGameKey)}`
                });
            }
        }
    }
}

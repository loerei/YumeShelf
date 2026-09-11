import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { buildDownloadedState, pickReleaseName, pickReleaseNotes } from './update-info';
import { classifyErrorReason } from './runtime';
import { UpdaterState, UpdaterStateFiles } from './state-files';

export interface DownloadUpdateContext {
    releasePageUrl: string;
    updateCacheDir: string;
    state: UpdaterState;
    stateFiles: UpdaterStateFiles;
    emitStatus: (payload: any) => void;
    summarizeUpdateState: (payload: any) => any;
    ensureDir: (dirPath: string) => Promise<void>;
    configureUpdaterFeed: (runtime: any) => Promise<{ updater: any; feedOverride: any }>;
    resolveRuntime: () => any;
    appendUpdateLog: (message: string) => any;
    VERBOSE_UPDATE_LOG?: boolean;
    checkForUpdates: () => Promise<any>;
    fetch?: typeof fetch;
    downloadTimeoutMs?: number;
}

export async function downloadUpdate(context: DownloadUpdateContext, releaseMetadata: any = {}): Promise<any> {
    const {
        releasePageUrl,
        updateCacheDir,
        state,
        stateFiles,
        emitStatus,
        summarizeUpdateState,
        ensureDir,
        configureUpdaterFeed,
        resolveRuntime,
        appendUpdateLog,
        VERBOSE_UPDATE_LOG
    } = context;

    const {
        writeDownloadedState
    } = stateFiles;

    if (state.activeDownloadPromise) return state.activeDownloadPromise;

    const updateState = await context.checkForUpdates();
    if (!updateState.available || !updateState.updateInfo) {
        return { ok: false, reason: 'no-update' };
    }

    if (updateState.downloadReady && updateState.downloadedState) {
        const readyUpdate = summarizeUpdateState({
            ...updateState,
            releaseName: releaseMetadata.releaseName || updateState.releaseName,
            releaseNotes: releaseMetadata.releaseNotes || updateState.releaseNotes,
            releaseUrl: releaseMetadata.releaseUrl || updateState.releaseUrl
        });
        emitStatus({
            phase: 'download-ready',
            update: readyUpdate
        });
        return {
            ok: true,
            alreadyReady: true,
            installerPath: updateState.downloadedState.installerPath,
            update: readyUpdate
        };
    }

    const readyCandidate = summarizeUpdateState({
        ...updateState,
        releaseName: releaseMetadata.releaseName || updateState.releaseName,
        releaseNotes: releaseMetadata.releaseNotes || updateState.releaseNotes,
        releaseUrl: releaseMetadata.releaseUrl || updateState.releaseUrl
    });

    emitStatus({
        phase: 'download-started',
        update: readyCandidate
    });

    state.activeDownloadPromise = (async () => {
        let tempInstallerPath: string | null = null;
        let watchdogTimer: NodeJS.Timeout | null = null;
        const abortController = new AbortController();

        try {
            const version = updateState.updateInfo.version;
            const files = Array.isArray(updateState.updateInfo.files) ? updateState.updateInfo.files : [];
            const fileEntry = files.find((entry: any) => {
                const candidate = String(entry?.url || entry?.name || entry?.path || '').toLowerCase();
                return candidate.endsWith('.exe');
            }) || files[0];

            const fileName = fileEntry?.url || fileEntry?.name || fileEntry?.path || `YumeShelf-Setup-${version}.exe`;
            const rawExpectedSha512 = fileEntry?.sha512 || updateState.updateInfo.sha512 || null;

            // SEC-08: Enforce expectedSha512 must be present up-front!
            if (!rawExpectedSha512) {
                throw new Error('Security Error: expected SHA-512 metadata is missing. Download rejected.');
            }
            const expectedSha512 = String(rawExpectedSha512).trim();

            const runtime = resolveRuntime();
            const { feedOverride } = await configureUpdaterFeed(runtime);

            let downloadUrl = fileName;
            if (!/^https?:\/\//i.test(downloadUrl)) {
                const base = feedOverride?.url || `https://github.com/loerei/YumeShelf/releases/download/v${version}`;
                const encodedFileName = encodeURIComponent(fileName).replaceAll('%2B', '+');
                downloadUrl = `${base.replace(/\/$/, '')}/${encodedFileName}`;
            }

            // URL Protocol Sanitization: Mandate HTTPS scheme
            let parsedUrl: URL;
            try {
                parsedUrl = new URL(downloadUrl);
            } catch {
                throw new Error(`invalid-artifact-url: ${downloadUrl}`);
            }

            if (parsedUrl.protocol !== 'https:') {
                await appendUpdateLog(`nsis-updater download rejected non-https url=${downloadUrl}`);
                throw new Error(`insecure-transport: URL scheme must be https, got ${parsedUrl.protocol}`);
            }

            const targetFileName = path.basename(parsedUrl.pathname) || `YumeShelf-Setup-${version}.exe`;
            const installerPath = path.join(updateCacheDir, targetFileName);
            await ensureDir(path.dirname(installerPath));

            tempInstallerPath = `${installerPath}.download.${Date.now()}`;

            if (VERBOSE_UPDATE_LOG) {
                await appendUpdateLog(`nsis-updater single-stream started url=${downloadUrl} target=${installerPath} temp=${tempInstallerPath} sha512=${expectedSha512}`);
            }

            const timeoutMs = context.downloadTimeoutMs ?? 30000;
            const resetWatchdog = () => {
                if (watchdogTimer) {
                    clearTimeout(watchdogTimer);
                }
                watchdogTimer = setTimeout(() => {
                    abortController.abort(new Error(`Download stalled: no data received for ${timeoutMs}ms`));
                }, timeoutMs);
            };

            const fetchFn = context.fetch ?? globalThis.fetch;
            resetWatchdog();

            const res = await fetchFn(downloadUrl, {
                signal: abortController.signal,
                redirect: 'follow'
            });

            if (!res.ok) {
                throw new Error(`Failed to download installer: ${res.status} ${res.statusText}`);
            }
            if (!res.body) {
                throw new Error('Response returned empty body');
            }

            const contentLengthStr = res.headers.get('content-length');
            const contentLength = contentLengthStr ? Number.parseInt(contentLengthStr, 10) : Number.NaN;

            let downloadedTotal = 0;
            let lastBytes = 0;
            let lastTime = Date.now();

            function reportProgress(bytesRead: number) {
                downloadedTotal += bytesRead;
                const now = Date.now();
                const elapsed = now - lastTime;
                if (elapsed >= 300) {
                    const speed = Math.round(((downloadedTotal - lastBytes) / elapsed) * 1000);
                    emitStatus({
                        phase: 'download-progress',
                        downloaded: downloadedTotal,
                        total: contentLength || downloadedTotal,
                        bytesPerSecond: speed,
                        update: readyCandidate
                    });
                    lastBytes = downloadedTotal;
                    lastTime = now;
                }
            }

            const hash = crypto.createHash('sha512');
            const fileHandle = await fs.open(tempInstallerPath, 'w');

            try {
                for await (const chunk of (res.body as any)) {
                    resetWatchdog();
                    const chunkBuf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
                    await fileHandle.write(chunkBuf);
                    hash.update(chunkBuf);
                    reportProgress(chunkBuf.length);
                }
            } finally {
                if (watchdogTimer) {
                    clearTimeout(watchdogTimer);
                    watchdogTimer = null;
                }
                await fileHandle.close();
            }

            if (downloadedTotal === 0) {
                throw new Error('Downloaded installer stream was empty (0 bytes received)');
            }

            // Verify SHA-512 Checksum (support both Base64 and Hex comparison)
            const computedBase64 = hash.digest('base64');
            const computedHex = Buffer.from(computedBase64, 'base64').toString('hex');

            const matches = expectedSha512 === computedBase64 || expectedSha512.toLowerCase() === computedHex.toLowerCase();
            if (!matches) {
                throw new Error(`Integrity mismatch. Expected SHA-512 ${expectedSha512}, but calculated ${computedBase64} (hex: ${computedHex})`);
            }

            if (VERBOSE_UPDATE_LOG) {
                await appendUpdateLog(`nsis-updater single-stream SHA-512 validation passed!`);
            }

            // Finalize target file with atomic rename
            try {
                await fs.rm(installerPath, { force: true });
            } catch {}
            await fs.rename(tempInstallerPath, installerPath);
            tempInstallerPath = null;

            // Normalize expectedSha512 to canonical Base64 for state storage
            // To ensure compatibility with getValidatedDeferredInstallState() which uses sha512FileBase64
            const canonicalExpectedSha512 = (/^[0-9a-fA-F]{128}$/.test(expectedSha512))
                ? Buffer.from(expectedSha512, 'hex').toString('base64')
                : expectedSha512;

            const downloadedState = buildDownloadedState(
                updateState.updateInfo,
                installerPath,
                releaseMetadata.releaseUrl || updateState.releaseUrl
            ) as any;
            downloadedState.expectedSha512 = canonicalExpectedSha512;

            if (releaseMetadata.releaseName) {
                downloadedState.releaseName = releaseMetadata.releaseName;
            }
            if (releaseMetadata.releaseNotes) {
                downloadedState.releaseNotes = releaseMetadata.releaseNotes;
            }

            await writeDownloadedState(downloadedState);

            const readyUpdate = summarizeUpdateState({
                available: true,
                canSelfUpdate: true,
                deferredUntilNextLaunch: false,
                downloadable: true,
                downloadReady: true,
                releaseName: downloadedState.releaseName,
                releaseNotes: downloadedState.releaseNotes,
                releaseUrl: downloadedState.releaseUrl || releasePageUrl,
                selfApplicable: true,
                version: downloadedState.version
            });

            emitStatus({
                phase: 'download-ready',
                update: readyUpdate
            });

            if (VERBOSE_UPDATE_LOG) {
                await appendUpdateLog(`nsis-updater ready version=${downloadedState.version} installer=${downloadedState.installerPath}`);
            }

            return {
                ok: true,
                installerPath: downloadedState.installerPath,
                update: readyUpdate
            };
        } catch (error) {
            let effectiveError: any = error;
            if (abortController.signal.aborted && (abortController.signal as any).reason) {
                effectiveError = (abortController.signal as any).reason;
            } else if (String((error as any)?.name || '').toLowerCase() === 'aborterror' || String((error as any)?.message || '').toLowerCase().includes('abort')) {
                effectiveError = new Error(`Download timed out or aborted`);
            }
            const reason = classifyErrorReason(effectiveError);
            await appendUpdateLog(`nsis-updater download-failed reason=${reason} error=${String((effectiveError as any)?.stack || effectiveError || '')}`);

            // Cleanup temp file on failure
            if (tempInstallerPath) {
                try {
                    await fs.rm(tempInstallerPath, { force: true });
                } catch {}
            }

            emitStatus({
                error: String((error as any)?.message || error || ''),
                phase: 'download-failed',
                reason,
                update: summarizeUpdateState({
                    available: true,
                    canSelfUpdate: true,
                    deferredUntilNextLaunch: false,
                    downloadable: true,
                    downloadReady: false,
                    releaseName: releaseMetadata.releaseName || pickReleaseName(updateState.updateInfo),
                    releaseNotes: releaseMetadata.releaseNotes || pickReleaseNotes(updateState.updateInfo),
                    releaseUrl: releaseMetadata.releaseUrl || updateState.releaseUrl,
                    selfApplicable: true,
                    version: updateState.updateInfo?.version || ''
                })
            });
            return {
                ok: false,
                error: String((error as any)?.message || error || ''),
                reason
            };
        } finally {
            if (watchdogTimer) {
                clearTimeout(watchdogTimer);
                watchdogTimer = null;
            }
            state.activeDownloadPromise = null;
        }
    })();

    return state.activeDownloadPromise;
}

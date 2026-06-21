import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as path from 'node:path';
import { buildDownloadedState, sha512FileBase64, pickReleaseName, pickReleaseNotes } from './update-info';
import { classifyErrorReason } from './runtime';
import { UpdaterState, UpdaterStateFiles } from './types';

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
    appendUpdateLog: (message: string) => Promise<any> | any;
    VERBOSE_UPDATE_LOG?: boolean;
    checkForUpdates: () => Promise<any>;
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
        try {
            const version = updateState.updateInfo.version;
            const files = Array.isArray(updateState.updateInfo.files) ? updateState.updateInfo.files : [];
            const fileEntry = files.find((entry: any) => {
                const candidate = String(entry?.url || entry?.name || entry?.path || '').toLowerCase();
                return candidate.endsWith('.exe');
            }) || files[0];

            const fileName = fileEntry?.url || fileEntry?.name || fileEntry?.path || `YumeShelf-Setup-${version}.exe`;
            const expectedSha512 = fileEntry?.sha512 || updateState.updateInfo.sha512 || null;

            const runtime = resolveRuntime();
            const { feedOverride } = await configureUpdaterFeed(runtime);

            let downloadUrl = fileName;
            if (!/^https?:\/\//i.test(downloadUrl)) {
                const base = feedOverride?.url || `https://github.com/loerei/YumeShelf/releases/download/v${version}`;
                const encodedFileName = encodeURIComponent(fileName).replace(/%2B/g, '+');
                downloadUrl = `${base.replace(/\/$/, '')}/${encodedFileName}`;
            }

            const installerPath = path.join(updateCacheDir, fileName);
            await ensureDir(path.dirname(installerPath));

            if (VERBOSE_UPDATE_LOG) {
                await appendUpdateLog(`nsis-updater parallel-download started url=${downloadUrl} target=${installerPath} sha512=${expectedSha512 || 'none'}`);
            }

            // 1. Fetch download size and check range support
            const headRes = await fetch(downloadUrl, { method: 'HEAD', redirect: 'follow' });
            if (!headRes.ok) {
                throw new Error(`Failed to query download headers: ${headRes.status} ${headRes.statusText}`);
            }

            const acceptRanges = headRes.headers.get('accept-ranges');
            const contentLengthStr = headRes.headers.get('content-length');
            const contentLength = contentLengthStr ? Number.parseInt(contentLengthStr, 10) : Number.NaN;

            if (VERBOSE_UPDATE_LOG) {
                await appendUpdateLog(`nsis-updater parallel-download info accept-ranges=${acceptRanges} content-length=${contentLength}`);
            }

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

            // Fallback to single-stream sequential if accepts-ranges is not supported or content length is missing
            if (acceptRanges !== 'bytes' || Number.isNaN(contentLength) || contentLength <= 0) {
                if (VERBOSE_UPDATE_LOG) {
                    await appendUpdateLog(`nsis-updater parallel-download range-requests unsupported, falling back to single stream`);
                }
                const res = await fetch(downloadUrl, { redirect: 'follow' });
                if (!res.ok) {
                    throw new Error(`Failed to download installer stream: ${res.status} ${res.statusText}`);
                }
                if (!res.body) {
                    throw new Error('Response returned empty body');
                }

                const fileStream = fsSync.createWriteStream(installerPath);
                try {
                    for await (const chunk of res.body as any) {
                        const chunkBuf = Buffer.from(chunk);
                        fileStream.write(chunkBuf);
                        reportProgress(chunkBuf.length);
                    }
                } finally {
                    fileStream.end();
                }
            } else {
                // Pre-allocate the target installer file
                const fileHandle = await fs.open(installerPath, 'w');
                try {
                    await fileHandle.truncate(contentLength);

                    const connections = 8;
                    const chunkSize = Math.ceil(contentLength / connections);
                    const chunkPromises = [];

                    if (VERBOSE_UPDATE_LOG) {
                        await appendUpdateLog(`nsis-updater parallel-download downloading via ${connections} parallel connections...`);
                    }

                    for (let i = 0; i < connections; i++) {
                        const start = i * chunkSize;
                        const end = Math.min(start + chunkSize - 1, contentLength - 1);

                        chunkPromises.push((async () => {
                            const res = await fetch(downloadUrl, {
                                headers: {
                                    'Range': `bytes=${start}-${end}`
                                },
                                redirect: 'follow'
                            });
                            if (!res.ok) {
                                throw new Error(`Connection ${i} failed with status ${res.status}`);
                            }
                            if (!res.body) {
                                throw new Error(`Connection ${i} returned empty body`);
                            }

                            let offset = start;
                            for await (const chunk of res.body as any) {
                                const chunkBuf = Buffer.from(chunk);
                                await fileHandle.write(chunkBuf, 0, chunkBuf.length, offset);
                                offset += chunkBuf.length;
                                reportProgress(chunkBuf.length);
                            }
                        })());
                    }

                    await Promise.all(chunkPromises);
                } finally {
                    await fileHandle.close();
                }
            }

            // Final integrity verification check
            if (expectedSha512) {
                if (VERBOSE_UPDATE_LOG) {
                    await appendUpdateLog(`nsis-updater parallel-download verifying SHA-512...`);
                }
                const actualSha = await sha512FileBase64(installerPath);
                if (actualSha !== expectedSha512) {
                    try {
                        await fs.unlink(installerPath);
                    } catch {}
                    throw new Error(`Integrity mismatch. Expected SHA-512 ${expectedSha512}, but calculated ${actualSha}`);
                }
                if (VERBOSE_UPDATE_LOG) {
                    await appendUpdateLog(`nsis-updater parallel-download SHA-512 validation passed!`);
                }
            } else {
                // SEC-08: Enforce expectedSha512 must be present!
                try {
                    await fs.unlink(installerPath);
                } catch {}
                throw new Error('Security Error: expected SHA-512 metadata is missing. Download rejected.');
            }

            const downloadedState = buildDownloadedState(
                updateState.updateInfo,
                installerPath,
                releaseMetadata.releaseUrl || updateState.releaseUrl
            ) as any;
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
            const reason = classifyErrorReason(error);
            await appendUpdateLog(`nsis-updater download-failed reason=${reason} error=${String((error as any)?.stack || error || '')}`);
            
            // Cleanup partial file on failure to avoid corruption in next check
            try {
                const fileName = `YumeShelf-Setup-${updateState.updateInfo?.version}.exe`;
                await fs.unlink(path.join(updateCacheDir, fileName));
            } catch {}

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
            state.activeDownloadPromise = null;
        }
    })();

    return state.activeDownloadPromise;
}

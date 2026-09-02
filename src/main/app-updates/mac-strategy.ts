import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { load } from 'js-yaml';
import { ensureDir } from '../core/shared-io';
import { compareAppReleaseVersions, getReleaseDisplayName } from './release-utils';
import { APP_UPDATE_RELEASE_PAGE_URL } from './feed-resolver';
import {
    AppUpdateCheckResult,
    AppUpdaterActionResult,
    AppUpdaterStrategy,
    AppUpdaterStrategyOptions,
    pickExpectedSha512
} from './updater-strategy';

const execFileAsync = promisify(execFile);

export async function defaultExecCommand(
    command: string,
    args: string[],
    options: any = {}
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    try {
        const { stdout, stderr } = await execFileAsync(command, args, {
            shell: false,
            ...options
        });
        return {
            stdout: String(stdout || ''),
            stderr: String(stderr || ''),
            exitCode: 0
        };
    } catch (error: any) {
        return {
            stdout: String(error?.stdout || ''),
            stderr: String(error?.stderr || error?.message || ''),
            exitCode: typeof error?.code === 'number' ? error.code : 1
        };
    }
}

export function parseMountPointFromHdiutil(stdout: string): string | null {
    if (!stdout || typeof stdout !== 'string') return null;
    const lines = stdout.split(/\r?\n/);
    for (const line of lines) {
        const volumeIndex = line.indexOf('/Volumes/');
        if (volumeIndex !== -1) {
            return line.slice(volumeIndex).trim();
        }
    }
    const directMatch = stdout.match(/\/Volumes\/[^\r\n]+/);
    return directMatch ? directMatch[0].trim() : null;
}

export async function computeFileSha512(filePath: string): Promise<{ base64: string; hex: string }> {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha512');
        const stream = fsSync.createReadStream(filePath);
        stream.on('data', chunk => hash.update(chunk));
        stream.on('error', reject);
        stream.on('end', () => {
            const buf = hash.digest();
            resolve({
                base64: buf.toString('base64'),
                hex: buf.toString('hex')
            });
        });
    });
}

export class MacUpdaterStrategyAdapter implements AppUpdaterStrategy {
    private options: AppUpdaterStrategyOptions;
    private abortController: AbortController;
    private activeTimers: Set<NodeJS.Timeout>;
    private latestKnownUpdate: AppUpdateCheckResult | null = null;
    private downloadedArtifactPath: string | null = null;
    private downloadedArtifactSha512: string | null = null;
    private mountPoint: string | null = null;

    constructor(options: AppUpdaterStrategyOptions = {}) {
        this.options = options;
        this.abortController = new AbortController();
        this.activeTimers = new Set();
    }

    private getCurrentVersion(): string {
        return this.options.app?.getVersion?.() || '0.0.0';
    }

    private emitStatus(payload: any): void {
        if (typeof this.options.broadcastStatus === 'function') {
            this.options.broadcastStatus({
                scope: 'app-update',
                timestamp: Date.now(),
                ...payload
            });
        }
    }

    private async log(message: string): Promise<void> {
        if (typeof this.options.appendUpdateLog === 'function') {
            try {
                await this.options.appendUpdateLog(message);
            } catch {}
        }
    }

    private async ensureDir(dirPath: string): Promise<void> {
        const fn = this.options.ensureDir ?? ensureDir;
        await fn(dirPath);
    }

    private async execCommand(
        command: string,
        args: string[],
        options: any = {}
    ): Promise<{ stdout: string; stderr: string; exitCode?: number }> {
        const fn = this.options.execCommand ?? defaultExecCommand;
        return fn(command, args, options);
    }

    async checkForUpdates(): Promise<AppUpdateCheckResult> {
        try {
            let feedOverride: any = null;
            if (typeof this.options.resolveFeedOverride === 'function') {
                try {
                    feedOverride = await this.options.resolveFeedOverride({
                        currentVersion: this.getCurrentVersion(),
                        runtime: { channel: 'mac' }
                    });
                } catch (error: any) {
                    await this.log(`MacUpdaterStrategyAdapter: resolveFeedOverride error=${String(error?.stack || error || '')}`);
                }
            }

            let manifestUrl = '';
            if (feedOverride?.url) {
                manifestUrl = feedOverride.url.endsWith('.yml')
                    ? feedOverride.url
                    : `${feedOverride.url.replace(/\/+$/, '')}/latest-mac.yml`;
            } else if (this.options.feedUrl) {
                manifestUrl = this.options.feedUrl;
            } else {
                manifestUrl = 'https://github.com/loerei/YumeShelf/releases/latest/download/latest-mac.yml';
            }

            // Enforce HTTPS
            try {
                const parsed = new URL(manifestUrl);
                if (parsed.protocol !== 'https:') {
                    await this.log(`MacUpdaterStrategyAdapter: rejected non-https feedUrl=${manifestUrl}`);
                    return {
                        attempted: true,
                        available: false,
                        fallbackReason: 'insecure-transport'
                    };
                }
            } catch {
                return {
                    attempted: true,
                    available: false,
                    fallbackReason: 'invalid-feed-url'
                };
            }

            const fetchFn = this.options.fetch ?? globalThis.fetch;
            const res = await fetchFn(manifestUrl, { signal: this.abortController.signal });
            if (!res.ok) {
                throw new Error(`HTTP ${res.status} ${res.statusText}`);
            }

            const manifestText = await res.text();
            const manifest: any = load(manifestText);
            if (!manifest || typeof manifest !== 'object' || !manifest.version) {
                throw new Error('Invalid manifest: missing version property');
            }

            const compareFn = this.options.compareVersions ?? compareAppReleaseVersions;
            const isNewer = compareFn(manifest.version, this.getCurrentVersion()) > 0;
            const expectedSha512 = pickExpectedSha512(manifest);

            const files = Array.isArray(manifest.files) ? manifest.files : [];
            const candidateFile = files.find((f: any) => {
                const name = String(f?.url || f?.name || f?.path || '').toLowerCase();
                return name.endsWith('.dmg') || name.endsWith('.zip');
            }) || files[0];

            const artifactFileName = manifest.path || candidateFile?.url || candidateFile?.name || '';
            const baseDownloadUrl = manifestUrl.substring(0, manifestUrl.lastIndexOf('/'));
            const artifactUrl = artifactFileName.startsWith('http')
                ? artifactFileName
                : `${baseDownloadUrl}/${artifactFileName}`;

            const checkResult: AppUpdateCheckResult = {
                attempted: true,
                available: isNewer,
                canSelfUpdate: true,
                checksumSha512: expectedSha512,
                deferredUntilNextLaunch: false,
                downloadable: isNewer && !!artifactUrl,
                downloadReady: false,
                manifest,
                artifactUrl,
                artifactFileName,
                releaseName: manifest.releaseName || (feedOverride?.release ? getReleaseDisplayName(feedOverride.release) : `v${manifest.version}`),
                releaseNotes: manifest.releaseNotes || '',
                releaseUrl: manifest.releaseUrl || feedOverride?.release?.htmlUrl || this.options.releasePageUrl || APP_UPDATE_RELEASE_PAGE_URL,
                selfApplicable: true,
                source: 'mac',
                version: manifest.version
            };

            this.latestKnownUpdate = checkResult;
            await this.log(`MacUpdaterStrategyAdapter: check completed version=${manifest.version} available=${isNewer} artifactUrl=${artifactUrl}`);
            return checkResult;
        } catch (error: any) {
            await this.log(`MacUpdaterStrategyAdapter: checkForUpdates failed error=${String(error?.stack || error || '')}`);
            return {
                attempted: true,
                available: false,
                error: String(error?.message || error || ''),
                fallbackReason: 'check-failed'
            };
        }
    }

    async downloadUpdate(releaseMetadata?: any): Promise<AppUpdaterActionResult> {
        let updateInfo = releaseMetadata || this.latestKnownUpdate;
        if (!updateInfo || !updateInfo.artifactUrl) {
            const check = await this.checkForUpdates();
            if (!check.available || !check.artifactUrl) {
                return { ok: false, reason: 'no-update-available' };
            }
            updateInfo = check;
        }

        const artifactUrl = updateInfo.artifactUrl;
        try {
            const parsed = new URL(artifactUrl);
            if (parsed.protocol !== 'https:') {
                await this.log(`MacUpdaterStrategyAdapter: download rejected non-https artifactUrl=${artifactUrl}`);
                return { ok: false, reason: 'insecure-transport' };
            }
        } catch {
            return { ok: false, reason: 'invalid-artifact-url' };
        }

        const cacheDir = this.options.updateCacheDir || (this.options.app ? path.join(this.options.app.getPath('userData'), 'app-update-cache') : process.cwd());
        await this.ensureDir(cacheDir);

        const fileName = updateInfo.artifactFileName || path.basename(new URL(artifactUrl).pathname) || 'update.dmg';
        const finalPath = path.join(cacheDir, fileName);
        const tempPath = `${finalPath}.download.${Date.now()}`;

        this.emitStatus({
            phase: 'download-started',
            update: this.summarizeUpdateState(updateInfo)
        });

        const timeoutMs = this.options.downloadTimeoutMs ?? 30000;
        const localAbort = new AbortController();
        const onParentAbort = () => localAbort.abort();
        this.abortController.signal.addEventListener('abort', onParentAbort);

        let timeoutTimer: NodeJS.Timeout | null = null;
        const resetTimeout = () => {
            if (timeoutTimer) {
                clearTimeout(timeoutTimer);
                this.activeTimers.delete(timeoutTimer);
            }
            timeoutTimer = setTimeout(() => {
                localAbort.abort(new Error(`Download timed out after ${timeoutMs}ms of inactivity`));
            }, timeoutMs);
            this.activeTimers.add(timeoutTimer);
        };

        try {
            resetTimeout();

            if (typeof this.options.downloadFile === 'function') {
                await this.options.downloadFile(artifactUrl, tempPath, {
                    timeoutMs,
                    signal: localAbort.signal
                });
            } else {
                const fetchFn = this.options.fetch ?? globalThis.fetch;
                const response = await fetchFn(artifactUrl, { signal: localAbort.signal });
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status} ${response.statusText}`);
                }

                const contentLength = Number(response.headers.get('content-length')) || 0;
                let downloadedBytes = 0;
                let lastProgressTime = Date.now();
                let lastDownloadedBytes = 0;

                if (response.body && typeof (response.body as any).getReader === 'function') {
                    const reader = (response.body as any).getReader();
                    const fileHandle = await fs.open(tempPath, 'w');
                    try {
                        while (true) {
                            const { done, value } = await reader.read();
                            if (done) break;
                            resetTimeout();
                            if (value) {
                                await fileHandle.write(value);
                                downloadedBytes += value.length;
                                const now = Date.now();
                                const elapsed = (now - lastProgressTime) / 1000;
                                if (elapsed >= 0.5) {
                                    const bytesPerSecond = elapsed > 0 ? Math.round((downloadedBytes - lastDownloadedBytes) / elapsed) : 0;
                                    this.emitStatus({
                                        phase: 'download-progress',
                                        downloaded: downloadedBytes,
                                        total: contentLength,
                                        bytesPerSecond,
                                        update: this.summarizeUpdateState(updateInfo)
                                    });
                                    lastProgressTime = now;
                                    lastDownloadedBytes = downloadedBytes;
                                }
                            }
                        }
                    } finally {
                        await fileHandle.close();
                    }
                } else if (response.body && typeof (response.body as any).pipe === 'function') {
                    await new Promise<void>((resolve, reject) => {
                        const outStream = fsSync.createWriteStream(tempPath);
                        (response.body as any).on('data', (chunk: Buffer) => {
                            resetTimeout();
                            downloadedBytes += chunk.length;
                            const now = Date.now();
                            const elapsed = (now - lastProgressTime) / 1000;
                            if (elapsed >= 0.5) {
                                const bytesPerSecond = elapsed > 0 ? Math.round((downloadedBytes - lastDownloadedBytes) / elapsed) : 0;
                                this.emitStatus({
                                    phase: 'download-progress',
                                    downloaded: downloadedBytes,
                                    total: contentLength,
                                    bytesPerSecond,
                                    update: this.summarizeUpdateState(updateInfo)
                                });
                                lastProgressTime = now;
                                lastDownloadedBytes = downloadedBytes;
                            }
                        });
                        (response.body as any).on('error', reject);
                        outStream.on('error', reject);
                        outStream.on('finish', () => resolve());
                        (response.body as any).pipe(outStream);
                    });
                } else {
                    const arrayBuffer = await response.arrayBuffer();
                    await fs.writeFile(tempPath, Buffer.from(arrayBuffer));
                }
            }

            // Verify SHA-512 Checksum
            const expectedSha512 = updateInfo.checksumSha512 || pickExpectedSha512(updateInfo.manifest);
            if (expectedSha512) {
                const computed = await computeFileSha512(tempPath);
                const normalizedExpected = expectedSha512.trim();
                const matches = normalizedExpected === computed.base64 || normalizedExpected.toLowerCase() === computed.hex.toLowerCase();
                if (!matches) {
                    await fs.rm(tempPath, { force: true });
                    await this.log(`MacUpdaterStrategyAdapter: SHA-512 checksum mismatch for ${tempPath}. Expected: ${expectedSha512}, base64: ${computed.base64}, hex: ${computed.hex}`);
                    this.emitStatus({
                        phase: 'download-failed',
                        error: `Checksum mismatch: expected ${expectedSha512}, got ${computed.base64}`,
                        reason: 'checksum-mismatch',
                        update: this.summarizeUpdateState(updateInfo)
                    });
                    return { ok: false, reason: 'checksum-mismatch' };
                }
            }

            // Finalize target file
            await fs.rm(finalPath, { force: true });
            await fs.rename(tempPath, finalPath);

            this.downloadedArtifactPath = finalPath;
            this.downloadedArtifactSha512 = expectedSha512 || null;

            const readyUpdate = {
                ...updateInfo,
                downloadReady: true
            };
            this.latestKnownUpdate = readyUpdate;

            await this.log(`MacUpdaterStrategyAdapter: download ready path=${finalPath} sha512=${expectedSha512}`);
            this.emitStatus({
                phase: 'download-ready',
                update: this.summarizeUpdateState(readyUpdate)
            });

            return { ok: true, artifactPath: finalPath };
        } catch (error: any) {
            try {
                await fs.rm(tempPath, { force: true });
            } catch {}
            await this.log(`MacUpdaterStrategyAdapter: download failed error=${String(error?.stack || error || '')}`);
            this.emitStatus({
                phase: 'download-failed',
                error: String(error?.message || error || ''),
                reason: 'download-error',
                update: this.summarizeUpdateState(updateInfo)
            });
            return { ok: false, reason: 'download-error', error: String(error?.message || error) };
        } finally {
            if (timeoutTimer) {
                clearTimeout(timeoutTimer);
                this.activeTimers.delete(timeoutTimer);
            }
            this.abortController.signal.removeEventListener('abort', onParentAbort);
        }
    }

    async installDownloadedUpdateNow(releaseMetadata?: any): Promise<AppUpdaterActionResult> {
        if (!this.downloadedArtifactPath || !fsSync.existsSync(this.downloadedArtifactPath)) {
            return { ok: false, reason: 'no-downloaded-update' };
        }

        const isDmg = this.downloadedArtifactPath.toLowerCase().endsWith('.dmg');
        if (isDmg) {
            await this.log(`MacUpdaterStrategyAdapter: attaching dmg ${this.downloadedArtifactPath}`);
            const attachRes = await this.execCommand('hdiutil', [
                'attach',
                this.downloadedArtifactPath,
                '-nobrowse',
                '-readonly'
            ]);

            const attachExitCode = attachRes.exitCode ?? 0;
            if (attachExitCode !== 0) {
                await this.log(`MacUpdaterStrategyAdapter: hdiutil attach failed exitCode=${attachExitCode} stderr=${attachRes.stderr}`);
                return {
                    ok: false,
                    reason: 'hdiutil-attach-failed',
                    error: attachRes.stderr,
                    exitCode: attachExitCode
                };
            }

            const mountPoint = parseMountPointFromHdiutil(attachRes.stdout);
            this.mountPoint = mountPoint;
            await this.log(`MacUpdaterStrategyAdapter: hdiutil attached at mountPoint=${mountPoint}`);

            try {
                if (!mountPoint) {
                    await this.log(`MacUpdaterStrategyAdapter: unable to parse mount point from stdout: ${attachRes.stdout}`);
                    return {
                        ok: false,
                        reason: 'mount-point-not-found',
                        stdout: attachRes.stdout
                    };
                }

                await this.log(`MacUpdaterStrategyAdapter: staging payload from mountPoint=${mountPoint}`);
                return { ok: true, mountPoint };
            } finally {
                if (this.mountPoint) {
                    const targetMount = this.mountPoint;
                    await this.log(`MacUpdaterStrategyAdapter: detaching mountPoint=${targetMount}`);
                    const detachRes = await this.execCommand('hdiutil', ['detach', targetMount, '-force']);
                    const detachExitCode = detachRes.exitCode ?? 0;
                    if (detachExitCode !== 0) {
                        await this.log(`MacUpdaterStrategyAdapter: hdiutil detach warning exitCode=${detachExitCode} stderr=${detachRes.stderr}`);
                    } else {
                        await this.log(`MacUpdaterStrategyAdapter: hdiutil detach succeeded for ${targetMount}`);
                    }
                    this.mountPoint = null;
                }
            }
        }

        // For .zip or other archive formats
        await this.log(`MacUpdaterStrategyAdapter: staging zip update from ${this.downloadedArtifactPath}`);
        return { ok: true, artifactPath: this.downloadedArtifactPath };
    }

    async scheduleInstallOnNextLaunch(releaseMetadata?: any): Promise<AppUpdaterActionResult> {
        const updateInfo = releaseMetadata || this.latestKnownUpdate;
        if (!this.downloadedArtifactPath) {
            return { ok: false, reason: 'no-downloaded-update' };
        }

        if (this.options.postUpdateMarkerFile) {
            try {
                await this.ensureDir(path.dirname(this.options.postUpdateMarkerFile));
                await fs.writeFile(
                    this.options.postUpdateMarkerFile,
                    JSON.stringify({
                        deferredAt: new Date().toISOString(),
                        version: updateInfo?.version || '',
                        artifactPath: this.downloadedArtifactPath
                    }, null, 2),
                    'utf8'
                );
            } catch (error: any) {
                await this.log(`MacUpdaterStrategyAdapter: failed writing postUpdateMarkerFile error=${String(error?.message || error)}`);
            }
        }

        this.emitStatus({
            phase: 'install-deferred',
            update: this.summarizeUpdateState({
                ...updateInfo,
                deferredUntilNextLaunch: true,
                downloadReady: true
            })
        });

        return { ok: true };
    }

    async prepareDeferredInstallOnLaunch(): Promise<any> {
        return { pending: false };
    }

    async beginDeferredInstallOnLaunch(): Promise<any> {
        return { ok: false, reason: 'unsupported' };
    }

    async runDeferredInstallOnLaunch(): Promise<any> {
        return { ok: false, reason: 'unsupported' };
    }

    summarizeUpdateState(update: any): any {
        return {
            available: !!update?.available,
            canSelfUpdate: !!update?.canSelfUpdate,
            deferredUntilNextLaunch: !!update?.deferredUntilNextLaunch,
            downloadable: !!update?.downloadable,
            downloadReady: !!update?.downloadReady,
            releaseName: String(update?.releaseName || ''),
            releaseNotes: String(update?.releaseNotes || ''),
            releaseUrl: String(update?.releaseUrl || this.options.releasePageUrl || APP_UPDATE_RELEASE_PAGE_URL),
            selfApplicable: !!update?.selfApplicable,
            version: String(update?.version || '')
        };
    }

    getDownloadedArtifactPath(): string | null {
        return this.downloadedArtifactPath;
    }

    getMountPoint(): string | null {
        return this.mountPoint;
    }

    dispose(): void {
        try {
            this.abortController.abort();
        } catch {}
        for (const timer of this.activeTimers) {
            try {
                clearTimeout(timer);
            } catch {}
        }
        this.activeTimers.clear();
    }
}

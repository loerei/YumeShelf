import * as path from 'node:path';
import { ensureDir } from '../core/shared-io';
import { compareAppReleaseVersions } from './release-utils';
import { createNsisUpdaterService } from '../nsis-updater';
import { APP_UPDATE_RELEASE_PAGE_URL } from './feed-resolver';

export interface AppUpdateCheckResult {
    attempted: boolean;
    available: boolean;
    canSelfUpdate?: boolean;
    checksumSha256?: string | null;
    deferredUntilNextLaunch?: boolean;
    downloadable?: boolean;
    downloadReady?: boolean;
    error?: any;
    fallbackReason?: string | null;
    offline?: boolean;
    releaseName?: string;
    releaseNotes?: string;
    releaseUrl?: string;
    selfApplicable?: boolean;
    source?: string;
    timedOut?: boolean;
    version?: string | null;
    [key: string]: any;
}

export interface AppUpdaterActionResult {
    ok: boolean;
    reason?: string;
    [key: string]: any;
}

export interface AppUpdaterStrategyOptions {
    app?: any;
    broadcastStatus?: (status: any) => void;
    updateCacheDir?: string;
    resolveFeedOverride?: (options?: any) => Promise<any>;
    compareVersions?: (a: string, b: string) => number;
    execCommand?: (command: string, args: string[], options?: any) => Promise<{ stdout: string; stderr: string; exitCode?: number }>;
    downloadTimeoutMs?: number;
    fetch?: typeof fetch;
    downloadFile?: (url: string, destPath: string, options?: { timeoutMs?: number; signal?: AbortSignal }) => Promise<{ bytesDownloaded: number }>;
    appendUpdateLog?: (message: string) => Promise<void> | void;
    ensureDir?: (dirPath: string) => Promise<void>;
    releasePageUrl?: string;
    postUpdateMarkerFile?: string;
    [key: string]: any;
}

export interface AppUpdaterStrategy {
    checkForUpdates(): Promise<AppUpdateCheckResult>;
    downloadUpdate(releaseMetadata?: any): Promise<AppUpdaterActionResult>;
    installDownloadedUpdateNow(releaseMetadata?: any): Promise<AppUpdaterActionResult>;
    summarizeUpdateState(update: any): any;
    scheduleInstallOnNextLaunch?(releaseMetadata?: any): Promise<AppUpdaterActionResult>;
    beginDeferredInstallOnLaunch?(): Promise<any>;
    prepareDeferredInstallOnLaunch?(): Promise<any>;
    runDeferredInstallOnLaunch?(): Promise<any>;
    dispose?(): void;
}

export function pickExpectedSha512(updateInfo: any): string | null {
    const files = Array.isArray(updateInfo?.files) ? updateInfo.files : [];
    const fileEntry = files.find((entry: any) => {
        const candidate = String(entry?.url || entry?.name || entry?.path || '').toLowerCase();
        return candidate.endsWith('.exe') || candidate.endsWith('.dmg') || candidate.endsWith('.zip');
    }) || files[0];
    const sha = fileEntry?.sha512 || updateInfo?.sha512;
    return typeof sha === 'string' && sha.trim() ? sha.trim() : null;
}

export class NoopUpdaterStrategy implements AppUpdaterStrategy {
    async checkForUpdates(): Promise<AppUpdateCheckResult> {
        return {
            attempted: true,
            available: false,
            fallbackReason: 'unsupported-platform'
        };
    }

    async downloadUpdate(_releaseMetadata?: any): Promise<AppUpdaterActionResult> {
        return {
            ok: false,
            reason: 'unsupported-platform'
        };
    }

    async installDownloadedUpdateNow(_releaseMetadata?: any): Promise<AppUpdaterActionResult> {
        return {
            ok: false,
            reason: 'unsupported-platform'
        };
    }

    async scheduleInstallOnNextLaunch(_releaseMetadata?: any): Promise<AppUpdaterActionResult> {
        return {
            ok: false,
            reason: 'unsupported-platform'
        };
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
            releaseUrl: String(update?.releaseUrl || ''),
            selfApplicable: !!update?.selfApplicable,
            version: String(update?.version || '')
        };
    }

    dispose(): void {
        // Safe no-op cleanup
    }
}

export class NsisUpdaterStrategyAdapter implements AppUpdaterStrategy {
    private service: any;

    constructor(serviceOrOptions?: any) {
        if (serviceOrOptions && typeof serviceOrOptions.checkForUpdates === 'function') {
            this.service = serviceOrOptions;
        } else if (serviceOrOptions) {
            this.service = createNsisUpdaterService({
                app: serviceOrOptions.app,
                appendUpdateLog: serviceOrOptions.appendUpdateLog || (() => {}),
                broadcastStatus: serviceOrOptions.broadcastStatus || (() => {}),
                compareVersions: serviceOrOptions.compareVersions || compareAppReleaseVersions,
                ensureDir: serviceOrOptions.ensureDir || ensureDir,
                releasePageUrl: serviceOrOptions.releasePageUrl || APP_UPDATE_RELEASE_PAGE_URL,
                resolveFeedOverride: serviceOrOptions.resolveFeedOverride,
                updateCacheDir: serviceOrOptions.updateCacheDir || (serviceOrOptions.app ? path.join(serviceOrOptions.app.getPath('userData'), 'app-update-cache') : ''),
                postUpdateMarkerFile: serviceOrOptions.postUpdateMarkerFile || (serviceOrOptions.app ? path.join(serviceOrOptions.app.getPath('userData'), 'app-update-cache', 'post-update.json') : '')
            });
        }
    }

    async checkForUpdates(): Promise<AppUpdateCheckResult> {
        if (!this.service) {
            return { attempted: true, available: false, fallbackReason: 'unsupported-platform' };
        }
        return this.service.checkForUpdates();
    }

    async downloadUpdate(releaseMetadata?: any): Promise<AppUpdaterActionResult> {
        if (!this.service) {
            return { ok: false, reason: 'unsupported-platform' };
        }
        return this.service.downloadUpdate(releaseMetadata);
    }

    async installDownloadedUpdateNow(releaseMetadata?: any): Promise<AppUpdaterActionResult> {
        if (!this.service) {
            return { ok: false, reason: 'unsupported-platform' };
        }
        return this.service.installDownloadedUpdateNow(releaseMetadata);
    }

    async scheduleInstallOnNextLaunch(releaseMetadata?: any): Promise<AppUpdaterActionResult> {
        if (!this.service) {
            return { ok: false, reason: 'unsupported-platform' };
        }
        return this.service.scheduleInstallOnNextLaunch(releaseMetadata);
    }

    async prepareDeferredInstallOnLaunch(): Promise<any> {
        if (!this.service || typeof this.service.prepareDeferredInstallOnLaunch !== 'function') {
            return { pending: false };
        }
        return this.service.prepareDeferredInstallOnLaunch();
    }

    async beginDeferredInstallOnLaunch(): Promise<any> {
        if (!this.service || typeof this.service.beginDeferredInstallOnLaunch !== 'function') {
            return { ok: false, reason: 'unsupported' };
        }
        return this.service.beginDeferredInstallOnLaunch();
    }

    async runDeferredInstallOnLaunch(): Promise<any> {
        if (!this.service || typeof this.service.runDeferredInstallOnLaunch !== 'function') {
            return { ok: false, reason: 'unsupported' };
        }
        return this.service.runDeferredInstallOnLaunch();
    }

    summarizeUpdateState(update: any): any {
        if (this.service && typeof this.service.summarizeUpdateState === 'function') {
            return this.service.summarizeUpdateState(update);
        }
        return {
            available: !!update?.available,
            canSelfUpdate: !!update?.canSelfUpdate,
            deferredUntilNextLaunch: !!update?.deferredUntilNextLaunch,
            downloadable: !!update?.downloadable,
            downloadReady: !!update?.downloadReady,
            releaseName: String(update?.releaseName || ''),
            releaseNotes: String(update?.releaseNotes || ''),
            releaseUrl: String(update?.releaseUrl || ''),
            selfApplicable: !!update?.selfApplicable,
            version: String(update?.version || '')
        };
    }

    getService(): any {
        return this.service;
    }

    dispose(): void {
        // Safe no-op cleanup
    }
}

export function createAppUpdaterStrategy(
    options?: AppUpdaterStrategyOptions,
    platform: NodeJS.Platform = process.platform
): AppUpdaterStrategy {
    if (platform === 'win32') {
        return new NsisUpdaterStrategyAdapter(options);
    }
    return new NoopUpdaterStrategy();
}

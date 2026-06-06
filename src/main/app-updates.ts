import * as path from 'node:path';
import { ensureDir } from './core/shared-io';
import { compareAppReleaseVersions } from './app-updates/release-utils';
import { createNsisUpdaterService } from './nsis-updater';

// Import modular submodules
import { setupFeedResolver, APP_UPDATE_RELEASE_PAGE_URL } from './app-updates/feed-resolver';
import { setupPostUpdateMarker } from './app-updates/post-update';

import {
    appendUpdateLog,
    appendVerboseUpdateLog,
    logDebug,
    summarizeAppUpdate,
    enrichUpdateInfo
} from './app-updates/helpers';

import { checkForAppUpdate } from './app-updates/check-service';

import {
    startBackgroundDownload,
    restartAndInstallDownloadedUpdate,
    scheduleInstallOnNextLaunch
} from './app-updates/download-install';

export interface AppUpdateServicesOptions {
    app: any;
    broadcastStatus: (payload: any) => void;
    compareVersions: (left: string, right: string) => number;
    openExternalUrl: (url: string) => Promise<void> | void;
    startupNetworkTimeoutMs: number;
}

export interface AppUpdateServices {
    beginDeferredInstallOnLaunch(): Promise<any>;
    checkForAppUpdate(): Promise<any>;
    consumePostUpdateMarker(): Promise<any>;
    logDebug(message: string): Promise<void>;
    openAppUpdateDownloadPage(): Promise<{ ok: boolean; releaseUrl: string }>;
    prepareDeferredInstallOnLaunch(): Promise<any>;
    restartAndInstallDownloadedUpdate(): Promise<any>;
    runDeferredInstallOnLaunch(): Promise<any>;
    scheduleInstallOnNextLaunch(): Promise<any>;
    startBackgroundDownload(): Promise<any>;
}

export function createAppUpdateServices({
    app,
    broadcastStatus,
    compareVersions,
    openExternalUrl,
    startupNetworkTimeoutMs
}: AppUpdateServicesOptions): AppUpdateServices {
    const updateCacheDir = path.join(app.getPath('userData'), 'app-update-cache');
    const postUpdateMarkerFile = path.join(updateCacheDir, 'post-update.json');
    const updateLogFile = path.join(updateCacheDir, 'portable-update.log');

    const context: any = {
        app,
        broadcastStatus,
        compareVersions,
        openExternalUrl,
        startupNetworkTimeoutMs,
        updateCacheDir,
        postUpdateMarkerFile,
        updateLogFile,
        latestKnownUpdate: null,
        resolver: null,
        nsisUpdaterService: null,
        consumePostUpdateMarker: null,

        // Loggers
        appendUpdateLog: (message: string) => appendUpdateLog(context, message),
        appendVerboseUpdateLog: (message: string) => appendVerboseUpdateLog(context, message),
        logDebug: (message: string) => logDebug(context, message),

        // Helpers
        summarizeAppUpdate: (update: any) => summarizeAppUpdate(context, update),
        enrichUpdateInfo: (update: any, runtimeStrategy: any) => enrichUpdateInfo(context, update, runtimeStrategy),

        // Services
        checkForAppUpdate: () => checkForAppUpdate(context)
    };

    // Initialize Resolver Module
    context.resolver = setupFeedResolver({
        startupNetworkTimeoutMs,
        appendVerboseUpdateLog: context.appendVerboseUpdateLog
    });

    // Initialize Post-Update Module
    const { consumePostUpdateMarker } = setupPostUpdateMarker({
        app,
        postUpdateMarkerFile,
        compareVersions,
        resolver: context.resolver,
        appendUpdateLog: context.appendUpdateLog,
        appendVerboseUpdateLog: context.appendVerboseUpdateLog
    });
    context.consumePostUpdateMarker = consumePostUpdateMarker;

    context.nsisUpdaterService = createNsisUpdaterService({
        app,
        appendUpdateLog: context.appendUpdateLog,
        broadcastStatus,
        compareVersions: compareAppReleaseVersions,
        ensureDir,
        releasePageUrl: APP_UPDATE_RELEASE_PAGE_URL,
        resolveFeedOverride: context.resolver.resolvePackagedFeedOverride,
        updateCacheDir,
        postUpdateMarkerFile
    });

    async function openAppUpdateDownloadPage(): Promise<{ ok: boolean; releaseUrl: string }> {
        const releaseUrl = context.latestKnownUpdate?.releaseUrl || APP_UPDATE_RELEASE_PAGE_URL;
        await openExternalUrl(releaseUrl);
        return { ok: true, releaseUrl };
    }

    return {
        beginDeferredInstallOnLaunch: () => context.nsisUpdaterService.beginDeferredInstallOnLaunch(),
        checkForAppUpdate: () => context.checkForAppUpdate(),
        consumePostUpdateMarker: context.consumePostUpdateMarker,
        logDebug: context.logDebug,
        openAppUpdateDownloadPage,
        prepareDeferredInstallOnLaunch: () => context.nsisUpdaterService.prepareDeferredInstallOnLaunch(),
        restartAndInstallDownloadedUpdate: () => restartAndInstallDownloadedUpdate(context),
        runDeferredInstallOnLaunch: () => context.nsisUpdaterService.runDeferredInstallOnLaunch(),
        scheduleInstallOnNextLaunch: () => scheduleInstallOnNextLaunch(context),
        startBackgroundDownload: () => startBackgroundDownload(context)
    };
}

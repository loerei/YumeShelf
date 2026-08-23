import { resolveRuntimeUpdateStrategy } from './runtime-strategy';
import { isFakeVersionRun } from '../nsis-updater';
import { APP_UPDATE_RELEASE_PAGE_URL } from './feed-resolver';
import { isNetworkLikeError } from '../core/shared-io';

export interface AppUpdateCheckContext {
    app: any;
    latestKnownUpdate: any;
    appendUpdateLog(message: string): Promise<void>;
    nsisUpdaterService: any;
    enrichUpdateInfo(update: any, runtimeStrategy: any): Promise<any>;
    summarizeAppUpdate(update: any): any;
    broadcastStatus?: (payload: any) => void;
}

export async function checkForAppUpdate(context: AppUpdateCheckContext): Promise<any> {
    const initial = {
        attempted: true,
        available: false,
        canSelfUpdate: false,
        checksumSha256: null,
        deferredUntilNextLaunch: false,
        downloadable: false,
        downloadReady: false,
        error: null,
        fallbackReason: null,
        offline: false,
        releaseName: '',
        releaseNotes: '',
        releaseUrl: APP_UPDATE_RELEASE_PAGE_URL,
        selfApplicable: false,
        source: 'unsupported',
        timedOut: false,
        version: null
    };

    try {
        const runtimeStrategy = resolveRuntimeUpdateStrategy(context.app, isFakeVersionRun);
        if (!runtimeStrategy.supportsUpdater) {
            context.latestKnownUpdate = {
                ...initial,
                fallbackReason: runtimeStrategy.manualFallbackReason,
                source: runtimeStrategy.channel
            };
            await context.appendUpdateLog(`checkForAppUpdate unsupported strategy=${JSON.stringify(runtimeStrategy)}`);
            return context.latestKnownUpdate;
        }

        const update = await context.nsisUpdaterService.checkForUpdates();
        if (!update.available) {
            context.latestKnownUpdate = {
                ...initial,
                canSelfUpdate: !!update.canSelfUpdate,
                deferredUntilNextLaunch: !!update.deferredUntilNextLaunch,
                downloadable: !!update.downloadable,
                downloadReady: !!update.downloadReady,
                releaseName: update.releaseName || '',
                releaseNotes: update.releaseNotes || '',
                releaseUrl: update.releaseUrl || APP_UPDATE_RELEASE_PAGE_URL,
                selfApplicable: !!update.selfApplicable,
                source: update.provider === 'github' ? 'github' : runtimeStrategy.channel,
                version: update.version || null
            };
            await context.appendUpdateLog(`checkForAppUpdate no-update strategy=${JSON.stringify(runtimeStrategy)} result=${JSON.stringify(context.summarizeAppUpdate(context.latestKnownUpdate))}`);
            return context.latestKnownUpdate;
        }

        context.latestKnownUpdate = {
            ...initial,
            ...update,
            source: update.provider === 'github' ? 'github' : runtimeStrategy.channel
        };
        context.broadcastStatus?.({
            phase: 'update-available',
            update: context.latestKnownUpdate
        });

        context.latestKnownUpdate = await context.enrichUpdateInfo(context.latestKnownUpdate, runtimeStrategy);
        context.broadcastStatus?.({
            phase: 'update-available',
            update: context.latestKnownUpdate
        });
        await context.appendUpdateLog(`checkForAppUpdate available strategy=${JSON.stringify(runtimeStrategy)} result=${JSON.stringify(context.summarizeAppUpdate(context.latestKnownUpdate))}`);
        return context.latestKnownUpdate;
    } catch (error: any) {
        const offline = isNetworkLikeError(error);
        context.latestKnownUpdate = {
            ...initial,
            error: String(error?.message || error || ''),
            fallbackReason: offline ? 'offline' : 'error',
            offline,
            source: offline ? 'offline' : 'error'
        };
        await context.appendUpdateLog(`checkForAppUpdate error=${String(error?.stack || error || '')}`);
        return context.latestKnownUpdate;
    }
}

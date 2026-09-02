import { AppUpdaterStrategy, NoopUpdaterStrategy, NsisUpdaterStrategyAdapter } from './updater-strategy';

export async function startBackgroundDownload(context: any): Promise<any> {
    const update = context.latestKnownUpdate || await context.checkForAppUpdate();
    await context.appendUpdateLog(`startBackgroundDownload update=${JSON.stringify(context.summarizeAppUpdate(update))}`);
    if (!update?.available) {
        return { ok: false, reason: 'no-update' };
    }
    if (!update.downloadable) {
        return {
            ok: false,
            reason: update.fallbackReason || 'not-downloadable',
            update: context.summarizeAppUpdate(update)
        };
    }

    const updater: AppUpdaterStrategy = context.updaterStrategy || (context.nsisUpdaterService ? (context.nsisUpdaterService instanceof NsisUpdaterStrategyAdapter ? context.nsisUpdaterService : new NsisUpdaterStrategyAdapter(context.nsisUpdaterService)) : new NoopUpdaterStrategy());
    const result = await updater.downloadUpdate({
        releaseName: update.releaseName,
        releaseNotes: update.releaseNotes,
        releaseUrl: update.releaseUrl,
        version: update.version
    });

    if (result?.ok) {
        context.latestKnownUpdate = {
            ...update,
            actionState: update.deferredUntilNextLaunch ? 'scheduled' : 'ready',
            deferredUntilNextLaunch: false,
            downloadReady: true
        };
        return {
            ...result,
            update: context.summarizeAppUpdate(context.latestKnownUpdate)
        };
    }

    context.latestKnownUpdate = {
        ...update,
        actionState: 'failed'
    };
    return {
        ...result,
        update: context.summarizeAppUpdate(context.latestKnownUpdate)
    };
}

export async function restartAndInstallDownloadedUpdate(context: any): Promise<any> {
    const update = context.latestKnownUpdate || await context.checkForAppUpdate();
    await context.appendUpdateLog(`restartAndInstallDownloadedUpdate update=${JSON.stringify(context.summarizeAppUpdate(update))}`);
    if (!update?.available) {
        return { ok: false, reason: 'no-update' };
    }
    const updater: AppUpdaterStrategy = context.updaterStrategy || (context.nsisUpdaterService ? (context.nsisUpdaterService instanceof NsisUpdaterStrategyAdapter ? context.nsisUpdaterService : new NsisUpdaterStrategyAdapter(context.nsisUpdaterService)) : new NoopUpdaterStrategy());
    const result = await updater.installDownloadedUpdateNow({
        fromVersion: context.app.getVersion(),
        releaseName: update.releaseName,
        releaseNotes: update.releaseNotes,
        releaseUrl: update.releaseUrl,
        version: update.version
    });
    if (!result?.ok) {
        return result || { ok: false, reason: 'install' };
    }
    return result;
}

export async function scheduleInstallOnNextLaunch(context: any): Promise<any> {
    const update = context.latestKnownUpdate || await context.checkForAppUpdate();
    await context.appendUpdateLog(`scheduleInstallOnNextLaunch update=${JSON.stringify(context.summarizeAppUpdate(update))}`);
    if (!update?.available) {
        return { ok: false, reason: 'no-update' };
    }

    const updater: AppUpdaterStrategy = context.updaterStrategy || (context.nsisUpdaterService ? (context.nsisUpdaterService instanceof NsisUpdaterStrategyAdapter ? context.nsisUpdaterService : new NsisUpdaterStrategyAdapter(context.nsisUpdaterService)) : new NoopUpdaterStrategy());
    if (typeof updater.scheduleInstallOnNextLaunch !== 'function') {
        return { ok: false, reason: 'unsupported' };
    }

    const result = await updater.scheduleInstallOnNextLaunch({
        fromVersion: context.app.getVersion(),
        releaseName: update.releaseName,
        releaseNotes: update.releaseNotes,
        releaseUrl: update.releaseUrl,
        version: update.version
    });
    if (!result?.ok) {
        return result || { ok: false, reason: 'schedule' };
    }

    context.latestKnownUpdate = {
        ...update,
        actionState: 'scheduled',
        deferredUntilNextLaunch: true,
        downloadReady: true
    };
    return {
        ...result,
        update: context.summarizeAppUpdate(context.latestKnownUpdate)
    };
}


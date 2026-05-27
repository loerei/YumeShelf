import { checkForUpdates } from './check';
import { downloadUpdate } from './download';
import {
    installDownloadedUpdateNow,
    scheduleInstallOnNextLaunch,
    prepareDeferredInstallOnLaunch,
    beginDeferredInstallOnLaunch
} from './install';

export function setupUpdateFlow(options: any): any {
    const context: any = {
        ...options,
        checkForUpdates: null,
        downloadUpdate: null,
        installDownloadedUpdateNow: null,
        scheduleInstallOnNextLaunch: null,
        prepareDeferredInstallOnLaunch: null,
        beginDeferredInstallOnLaunch: null
    };

    context.checkForUpdates = () => checkForUpdates(context);
    context.downloadUpdate = (releaseMetadata: any) => downloadUpdate(context, releaseMetadata);
    context.installDownloadedUpdateNow = (releaseMetadata: any) => installDownloadedUpdateNow(context, releaseMetadata);
    context.scheduleInstallOnNextLaunch = (releaseMetadata: any) => scheduleInstallOnNextLaunch(context, releaseMetadata);
    context.prepareDeferredInstallOnLaunch = () => prepareDeferredInstallOnLaunch(context);
    context.beginDeferredInstallOnLaunch = () => beginDeferredInstallOnLaunch(context);

    return {
        checkForUpdates: context.checkForUpdates,
        downloadUpdate: context.downloadUpdate,
        installDownloadedUpdateNow: context.installDownloadedUpdateNow,
        scheduleInstallOnNextLaunch: context.scheduleInstallOnNextLaunch,
        prepareDeferredInstallOnLaunch: context.prepareDeferredInstallOnLaunch,
        beginDeferredInstallOnLaunch: context.beginDeferredInstallOnLaunch
    };
}

// @ts-nocheck
const { checkForUpdates } = require('./check');
const { downloadUpdate } = require('./download');
const {
    installDownloadedUpdateNow,
    scheduleInstallOnNextLaunch,
    prepareDeferredInstallOnLaunch,
    beginDeferredInstallOnLaunch
} = require('./install');

function setupUpdateFlow(options) {
    const context = {
        ...options,
        checkForUpdates: null,
        downloadUpdate: null,
        installDownloadedUpdateNow: null,
        scheduleInstallOnNextLaunch: null,
        prepareDeferredInstallOnLaunch: null,
        beginDeferredInstallOnLaunch: null
    };

    context.checkForUpdates = () => checkForUpdates(context);
    context.downloadUpdate = (releaseMetadata) => downloadUpdate(context, releaseMetadata);
    context.installDownloadedUpdateNow = (releaseMetadata) => installDownloadedUpdateNow(context, releaseMetadata);
    context.scheduleInstallOnNextLaunch = (releaseMetadata) => scheduleInstallOnNextLaunch(context, releaseMetadata);
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

module.exports = {
    setupUpdateFlow
};

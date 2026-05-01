const { normalizeText } = require('./runtime');
const { pickReleaseName, pickReleaseNotes } = require('./update-info');

function attachUpdaterEventLogging({
    appendUpdateLog,
    emitStatus,
    latestDownloadedEventRef,
    latestUpdateInfoRef,
    releasePageUrl,
    summarizeUpdateState,
    updater
}) {
    updater.on('checking-for-update', () => {
        void appendUpdateLog(`nsis-updater checking-for-update runtime=${JSON.stringify(updater.__yumeshelfRuntime || null)}`);
    });

    updater.on('update-available', (updateInfo) => {
        latestUpdateInfoRef.set(updateInfo);
        void appendUpdateLog(`nsis-updater update-available version=${normalizeText(updateInfo?.version, '')} releaseName=${normalizeText(updateInfo?.releaseName, '')} releaseDate=${normalizeText(updateInfo?.releaseDate, '')}`);
    });

    updater.on('update-not-available', () => {
        latestUpdateInfoRef.set(null);
        latestDownloadedEventRef.set(null);
        void appendUpdateLog('nsis-updater update-not-available');
    });

    updater.on('download-progress', (progress) => {
        const latestUpdateInfo = latestUpdateInfoRef.get();
        const readyCandidate = summarizeUpdateState({
            available: true,
            canSelfUpdate: true,
            downloadable: true,
            downloadReady: false,
            releaseName: pickReleaseName(latestUpdateInfo),
            releaseNotes: pickReleaseNotes(latestUpdateInfo),
            releaseUrl: releasePageUrl,
            selfApplicable: true,
            version: normalizeText(latestUpdateInfo?.version, '')
        });
        emitStatus({
            phase: 'download-progress',
            downloaded: progress.transferred,
            total: progress.total,
            bytesPerSecond: progress.bytesPerSecond,
            update: readyCandidate
        });
    });

    updater.on('update-downloaded', (event) => {
        latestDownloadedEventRef.set(event);
        void appendUpdateLog(`nsis-updater update-downloaded version=${normalizeText(event?.version, '')} file=${normalizeText(event?.downloadedFile, '')}`);
    });

    updater.on('error', (error) => {
        void appendUpdateLog(`nsis-updater error=${String((error && error.stack) || error || '')}`);
    });
}

module.exports = {
    attachUpdaterEventLogging
};

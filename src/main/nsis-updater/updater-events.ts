import { normalizeText } from './runtime';
import { pickReleaseName, pickReleaseNotes } from './update-info';

export interface EventLoggingOptions {
    appendUpdateLog: (message: string) => Promise<void>;
    emitStatus: (payload: any) => void;
    latestDownloadedEventRef: { set(val: any): void; get(): any };
    latestUpdateInfoRef: { set(val: any): void; get(): any };
    releasePageUrl: string;
    summarizeUpdateState: (state: any) => any;
    updater: any;
}

export function attachUpdaterEventLogging({
    appendUpdateLog,
    emitStatus,
    latestDownloadedEventRef,
    latestUpdateInfoRef,
    releasePageUrl,
    summarizeUpdateState,
    updater
}: EventLoggingOptions): void {
    updater.on('checking-for-update', () => {
        void appendUpdateLog(`nsis-updater checking-for-update runtime=${JSON.stringify(updater.__yumeshelfRuntime || null)}`);
    });

    updater.on('update-available', (updateInfo: any) => {
        latestUpdateInfoRef.set(updateInfo);
        void appendUpdateLog(`nsis-updater update-available version=${normalizeText(updateInfo?.version, '')} releaseName=${normalizeText(updateInfo?.releaseName, '')} releaseDate=${normalizeText(updateInfo?.releaseDate, '')}`);
    });

    updater.on('update-not-available', () => {
        latestUpdateInfoRef.set(null);
        latestDownloadedEventRef.set(null);
        void appendUpdateLog('nsis-updater update-not-available');
    });

    updater.on('download-progress', (progress: any) => {
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

    updater.on('update-downloaded', (event: any) => {
        latestDownloadedEventRef.set(event);
        void appendUpdateLog(`nsis-updater update-downloaded version=${normalizeText(event?.version, '')} file=${normalizeText(event?.downloadedFile, '')}`);
    });

    updater.on('error', (error: any) => {
        void appendUpdateLog(`nsis-updater error=${String((error?.stack) || error || '')}`);
    });
}

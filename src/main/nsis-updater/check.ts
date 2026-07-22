import { pickReleaseName, pickReleaseNotes } from './update-info';
import { UpdaterState, UpdaterStateFiles } from './state-files';

export interface CheckForUpdatesContext {
    app: any;
    compareVersions: (a: string, b: string) => number;
    releasePageUrl: string;
    state: UpdaterState;
    stateFiles: UpdaterStateFiles;
    resolveRuntime: () => any;
    configureUpdaterFeed: (runtime: any) => Promise<{ updater: any; feedOverride: any }>;
    appendUpdateLog: (message: string) => Promise<any> | void;
    VERBOSE_UPDATE_LOG?: boolean;
}

export interface CheckUpdateResult {
    available: boolean;
    canSelfUpdate: boolean;
    channel: string;
    deferredUntilNextLaunch: boolean;
    downloadable: boolean;
    downloadReady: boolean;
    provider: string;
    releaseName: string;
    releaseNotes: string;
    releaseUrl: string;
    selfApplicable: boolean;
    version: string | null;
    downloadedState?: any;
    updateInfo?: any;
}

export async function checkForUpdates(context: CheckForUpdatesContext): Promise<CheckUpdateResult> {
    const {
        app,
        compareVersions,
        releasePageUrl,
        state,
        stateFiles,
        resolveRuntime,
        configureUpdaterFeed,
        appendUpdateLog,
        VERBOSE_UPDATE_LOG
    } = context;

    const {
        clearDeferredInstallState,
        getValidatedDownloadedStateForVersion,
        readDeferredInstallState
    } = stateFiles;

    const runtime = resolveRuntime();
    if (!runtime.supported) {
        return {
            available: false,
            canSelfUpdate: false,
            channel: runtime.channel,
            deferredUntilNextLaunch: false,
            downloadable: false,
            downloadReady: false,
            provider: runtime.provider,
            releaseName: '',
            releaseNotes: '',
            releaseUrl: releasePageUrl,
            selfApplicable: false,
            version: null
        };
    }

    const { updater: nsisUpdater, feedOverride } = await configureUpdaterFeed(runtime);
    const result = await nsisUpdater.checkForUpdates();
    const updateInfo = result?.updateInfo || null;
    
    if (VERBOSE_UPDATE_LOG) {
        await appendUpdateLog(`nsis-updater check-result current=${app.getVersion()} candidate=${updateInfo?.version || ''} releaseName=${updateInfo?.releaseName || ''} releaseDate=${updateInfo?.releaseDate || ''} feed=${feedOverride?.url || runtime.provider}`);
    }
    
    if (!updateInfo?.version || compareVersions(updateInfo.version, app.getVersion()) <= 0) {
        state.latestUpdateInfo = null;
        state.latestDownloadedEvent = null;
        await clearDeferredInstallState();
        if (VERBOSE_UPDATE_LOG) {
            await appendUpdateLog(`nsis-updater no-newer-update current=${app.getVersion()} candidate=${updateInfo?.version || ''}`);
        }
        return {
            available: false,
            canSelfUpdate: true,
            channel: runtime.channel,
            deferredUntilNextLaunch: false,
            downloadable: true,
            downloadReady: false,
            provider: runtime.provider,
            releaseName: '',
            releaseNotes: '',
            releaseUrl: releasePageUrl,
            selfApplicable: true,
            version: null
        };
    }

    state.latestUpdateInfo = updateInfo;
    const downloadedState = await getValidatedDownloadedStateForVersion(updateInfo.version);
    const deferredState = await readDeferredInstallState();
    if (deferredState && deferredState.version !== updateInfo.version) {
        await clearDeferredInstallState();
    }

    return {
        available: true,
        canSelfUpdate: true,
        channel: runtime.channel,
        deferredUntilNextLaunch: !!deferredState && deferredState.version === updateInfo.version,
        downloadable: true,
        downloadReady: !!downloadedState,
        downloadedState,
        provider: runtime.provider,
        releaseName: pickReleaseName(updateInfo),
        releaseNotes: pickReleaseNotes(updateInfo),
        releaseUrl: releasePageUrl,
        selfApplicable: true,
        updateInfo,
        version: updateInfo.version
    };
}

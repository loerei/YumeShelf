export interface UpdaterState {
    updater: any;
    latestUpdateInfo: any;
    latestDownloadedEvent: any;
    activeDownloadPromise: any;
    updaterFeedKey: any;
}

export interface UpdaterStateFiles {
    clearDeferredInstallState: () => Promise<void>;
    clearDownloadedState: () => Promise<void>;
    getValidatedDeferredInstallState: () => Promise<any>;
    getValidatedDownloadedStateForVersion: (version: string) => Promise<any>;
    readDeferredInstallState: () => Promise<any>;
    readDownloadedState: () => Promise<any>;
    writeDeferredInstallState: (state: any) => Promise<void>;
    writeDownloadedState: (state: any) => Promise<void>;
}

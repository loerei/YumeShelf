import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';

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

export interface DownloadedState {
    downloadedAt: string | null;
    expectedSha512: string | null;
    installerPath: string;
    releaseName: string;
    releaseNotes: string;
    releaseUrl: string;
    version: string;
}

export interface StateFilesConfig {
    appendUpdateLog: (message: string) => Promise<any> | any;
    ensureDir: (dirPath: string) => Promise<void>;
    normalizeDownloadedState: (raw: any) => DownloadedState | null;
    updateCacheDir: string;
    verifyInstallerHash: (filePath: string) => Promise<string>;
}

export function createStateFiles({
    appendUpdateLog,
    ensureDir,
    normalizeDownloadedState,
    updateCacheDir,
    verifyInstallerHash
}: StateFilesConfig) {
    const downloadedStateFile = path.join(updateCacheDir, 'nsis-downloaded-state.json');
    const deferredInstallStateFile = path.join(updateCacheDir, 'nsis-deferred-install.json');

    async function writeJson(filePath: string, value: any): Promise<void> {
        await ensureDir(path.dirname(filePath));
        await fs.writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
    }

    async function readJson(filePath: string): Promise<any> {
        try {
            return JSON.parse(await fs.readFile(filePath, 'utf8'));
        } catch {
            return null;
        }
    }

    async function readDownloadedState(): Promise<DownloadedState | null> {
        return normalizeDownloadedState(await readJson(downloadedStateFile));
    }

    async function writeDownloadedState(state: DownloadedState): Promise<void> {
        await writeJson(downloadedStateFile, state);
    }

    async function clearDownloadedState(): Promise<void> {
        try {
            await fs.unlink(downloadedStateFile);
        } catch {}
    }

    async function readDeferredInstallState(): Promise<DownloadedState | null> {
        return normalizeDownloadedState(await readJson(deferredInstallStateFile));
    }

    async function writeDeferredInstallState(state: DownloadedState): Promise<void> {
        await writeJson(deferredInstallStateFile, state);
    }

    async function clearDeferredInstallState(): Promise<void> {
        try {
            await fs.unlink(deferredInstallStateFile);
        } catch {}
    }

    async function getValidatedDownloadedStateForVersion(version: string): Promise<DownloadedState | null> {
        const state = await readDownloadedState();
        if (!state) return null;
        if (state.version !== version) {
            await clearDownloadedState();
            return null;
        }
        if (!fsSync.existsSync(state.installerPath)) {
            await clearDownloadedState();
            return null;
        }
        return state;
    }

    async function getValidatedDeferredInstallState(): Promise<DownloadedState | null> {
        const state = await readDeferredInstallState();
        if (!state) return null;
        if (!fsSync.existsSync(state.installerPath)) {
            await appendUpdateLog(`deferred-install stale-missing-installer path=${state.installerPath}`);
            await clearDeferredInstallState();
            return null;
        }
        if (state.expectedSha512) {
            const digest = await verifyInstallerHash(state.installerPath);
            if (digest !== state.expectedSha512) {
                await appendUpdateLog(`deferred-install stale-signature-mismatch path=${state.installerPath}`);
                await clearDeferredInstallState();
                return null;
            }
        }
        return state;
    }

    return {
        clearDeferredInstallState,
        clearDownloadedState,
        getValidatedDeferredInstallState,
        getValidatedDownloadedStateForVersion,
        readDeferredInstallState,
        readDownloadedState,
        writeDeferredInstallState,
        writeDownloadedState
    };
}

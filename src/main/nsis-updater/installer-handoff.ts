import * as fs from 'fs/promises';
import * as path from 'path';
import { spawn } from 'child_process';
import { BrowserWindow } from 'electron';
import { normalizeText } from './runtime';
import { pickReleaseName, pickReleaseNotes } from './update-info';

export interface InstallerHandoffConfig {
    app: any;
    appendUpdateLog: (message: string) => Promise<any> | any;
    delay: (ms: number) => Promise<void>;
    emitStatus: (payload: any) => void;
    ensureDir: (dirPath: string) => Promise<void>;
    postUpdateMarkerFile: string;
    releasePageUrl: string;
}

export interface LaunchInstallerOptions {
    installerPath: string;
    logPrefix: string;
    onAfterLaunch?: () => Promise<void> | void;
    onBeforeLaunch?: () => Promise<void> | void;
    readyUpdate: any;
    statusPatch?: any;
}

export function createInstallerHandoff({
    app,
    appendUpdateLog,
    delay,
    emitStatus,
    ensureDir,
    postUpdateMarkerFile,
    releasePageUrl
}: InstallerHandoffConfig) {
    async function launchInstallerAndQuit({
        installerPath,
        logPrefix,
        onAfterLaunch,
        onBeforeLaunch,
        readyUpdate,
        statusPatch = {}
    }: LaunchInstallerOptions) {
        if (typeof onBeforeLaunch === 'function') {
            await onBeforeLaunch();
        }

        // Hide all active windows to avoid visual glitches or frozen white screens during handover
        try {
            BrowserWindow.getAllWindows().forEach(w => {
                if (w && !w.isDestroyed()) {
                    w.hide();
                }
            });
        } catch (hideError) {
            await appendUpdateLog(`${logPrefix} window-hide-error error=${String(hideError)}`);
        }

        try {
            const child = spawn(installerPath, ['--updated', '/S', '--force-run'], {
                detached: true,
                stdio: 'ignore',
                windowsHide: true
            } as any);
            child.unref();
            if (typeof onAfterLaunch === 'function') {
                await onAfterLaunch();
            }
            emitStatus({
                phase: 'install-handoff',
                update: {
                    ...readyUpdate,
                    ...statusPatch
                }
            });
            await appendUpdateLog(`${logPrefix} launched pid=${child.pid || 'unknown'} installer=${installerPath}`);
            setTimeout(() => {
                try {
                    app.quit();
                } catch (error) {
                    void appendUpdateLog(`${logPrefix} quit-failed error=${String((error as any)?.stack || error || '')}`);
                }
            }, 80);
            return {
                launched: true,
                pid: child.pid || null
            };
        } catch (error) {
            await appendUpdateLog(`${logPrefix} launch-failed error=${String((error as any)?.stack || error || '')}`);
            throw error;
        }
    }

    function buildReleaseMetadata(updateInfo: any, override: any = {}) {
        return {
            installedAt: new Date().toISOString(),
            releaseName: normalizeText(override.releaseName || pickReleaseName(updateInfo), ''),
            releaseNotes: normalizeText(override.releaseNotes || pickReleaseNotes(updateInfo), ''),
            releaseUrl: normalizeText(override.releaseUrl, releasePageUrl),
            toVersion: normalizeText(override.version || updateInfo?.version, ''),
            fromVersion: normalizeText(override.fromVersion || app.getVersion(), '')
        };
    }

    async function writePostUpdateMarker(metadata: any) {
        await ensureDir(path.dirname(postUpdateMarkerFile));
        await fs.writeFile(postUpdateMarkerFile, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
    }

    interface PrepareOptions {
        phase: string;
        update: any;
        logMessage?: string;
    }

    async function prepareInstallPhase({ phase, update, logMessage }: PrepareOptions) {
        emitStatus({ phase, update });
        if (logMessage) {
            await appendUpdateLog(logMessage);
        }
        await delay(160);
    }

    return {
        buildReleaseMetadata,
        launchInstallerAndQuit,
        prepareInstallPhase,
        writePostUpdateMarker
    };
}

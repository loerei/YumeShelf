// @ts-nocheck
const fs = require('fs/promises');
const path = require('path');
const { spawn } = require('child_process');
const { normalizeText } = require('./runtime');
const { pickReleaseName, pickReleaseNotes } = require('./update-info');

function createInstallerHandoff({
    app,
    appendUpdateLog,
    delay,
    emitStatus,
    ensureDir,
    postUpdateMarkerFile,
    releasePageUrl
}) {
    async function launchInstallerAndQuit({
        installerPath,
        logPrefix,
        onAfterLaunch,
        onBeforeLaunch,
        readyUpdate,
        statusPatch = {}
    }) {
        if (typeof onBeforeLaunch === 'function') {
            await onBeforeLaunch();
        }

        // Hide all active windows to avoid visual glitches or frozen white screens during handover
        try {
            const { BrowserWindow } = require('electron');
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
            });
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
                    void appendUpdateLog(`${logPrefix} quit-failed error=${String((error && error.stack) || error || '')}`);
                }
            }, 80);
            return {
                launched: true,
                pid: child.pid || null
            };
        } catch (error) {
            await appendUpdateLog(`${logPrefix} launch-failed error=${String((error && error.stack) || error || '')}`);
            throw error;
        }
    }

    function buildReleaseMetadata(updateInfo, override = {}) {
        return {
            installedAt: new Date().toISOString(),
            releaseName: normalizeText(override.releaseName || pickReleaseName(updateInfo), ''),
            releaseNotes: normalizeText(override.releaseNotes || pickReleaseNotes(updateInfo), ''),
            releaseUrl: normalizeText(override.releaseUrl, releasePageUrl),
            toVersion: normalizeText(override.version || updateInfo?.version, ''),
            fromVersion: normalizeText(override.fromVersion || app.getVersion(), '')
        };
    }

    async function writePostUpdateMarker(metadata) {
        await ensureDir(path.dirname(postUpdateMarkerFile));
        await fs.writeFile(postUpdateMarkerFile, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
    }

    async function prepareInstallPhase({ phase, update, logMessage }) {
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

module.exports = {
    createInstallerHandoff
};

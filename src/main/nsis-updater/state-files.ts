// @ts-nocheck
const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');

function createStateFiles({ appendUpdateLog, ensureDir, normalizeDownloadedState, updateCacheDir, verifyInstallerHash }) {
    const downloadedStateFile = path.join(updateCacheDir, 'nsis-downloaded-state.json');
    const deferredInstallStateFile = path.join(updateCacheDir, 'nsis-deferred-install.json');

    async function writeJson(filePath, value) {
        await ensureDir(path.dirname(filePath));
        await fs.writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
    }

    async function readJson(filePath) {
        try {
            return JSON.parse(await fs.readFile(filePath, 'utf8'));
        } catch {
            return null;
        }
    }

    async function readDownloadedState() {
        return normalizeDownloadedState(await readJson(downloadedStateFile));
    }

    async function writeDownloadedState(state) {
        await writeJson(downloadedStateFile, state);
    }

    async function clearDownloadedState() {
        try {
            await fs.unlink(downloadedStateFile);
        } catch {}
    }

    async function readDeferredInstallState() {
        return normalizeDownloadedState(await readJson(deferredInstallStateFile));
    }

    async function writeDeferredInstallState(state) {
        await writeJson(deferredInstallStateFile, state);
    }

    async function clearDeferredInstallState() {
        try {
            await fs.unlink(deferredInstallStateFile);
        } catch {}
    }

    async function getValidatedDownloadedStateForVersion(version) {
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

    async function getValidatedDeferredInstallState() {
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

module.exports = {
    createStateFiles
};

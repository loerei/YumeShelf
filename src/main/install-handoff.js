const fs = require('fs/promises');
const path = require('path');
const { setTimeout: delay } = require('timers/promises');
const { readInstallerContract } = require('../shared/installer-contract');

function toBoolean(value, fallback = false) {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
    if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
    return fallback;
}

function normalizePath(value) {
    return path.normalize(String(value || '').trim()).replace(/[\\/]+$/, '').toLowerCase();
}

function createInstallHandoffService({
    app,
    markerFile,
    fallbackMarkerFiles = [],
    logFile = ''
}) {
    const markerCandidates = Array.from(new Set(
        [markerFile, ...fallbackMarkerFiles]
            .map((value) => String(value || '').trim())
            .filter(Boolean)
            .map((value) => normalizePath(value))
    ));

    async function writeLog(message) {
        if (!logFile) return;
        try {
            await fs.mkdir(path.dirname(logFile), { recursive: true });
            await fs.appendFile(logFile, `[${new Date().toISOString()}] ${message}\n`, 'utf8');
        } catch {}
    }

    async function readAvailableContract() {
        for (const candidate of markerCandidates) {
            try {
                const contract = await readInstallerContract(candidate);
                await writeLog(`marker_read_success path=${candidate}`);
                return { contract, markerPath: candidate };
            } catch (error) {
                const errorMessage = String((error && error.code) || (error && error.message) || error || '');
                await writeLog(`marker_read_miss path=${candidate} error=${errorMessage}`);
            }
        }
        return null;
    }

    async function deleteMarkerFiles() {
        for (const candidate of markerCandidates) {
            try {
                await fs.unlink(candidate);
                await writeLog(`marker_deleted path=${candidate}`);
            } catch (error) {
                const code = String((error && error.code) || '');
                if (code && code !== 'ENOENT') {
                    await writeLog(`marker_delete_failed path=${candidate} error=${String((error && error.message) || error || '')}`);
                }
            }
        }
    }

    async function consumeManualInstallHandoff() {
        await writeLog(`consume_begin markerFile=${markerFile} appData=${app.getPath('appData')} userData=${app.getPath('userData')} exe=${app.getPath('exe')}`);
        const markerPayload = await readAvailableContract();
        if (!markerPayload) {
            await writeLog(`consume_no_marker candidates=${markerCandidates.join(' | ')}`);
            return null;
        }

        const { contract, markerPath } = markerPayload;
        await deleteMarkerFiles();

        const install = contract.install || {};
        const installerPath = String(install.source || '').trim();
        const shouldDeleteSetupFile = toBoolean(install.deleteSetupFile, false);
        await writeLog(`consume_contract markerPath=${markerPath} installerPath=${installerPath || '<empty>'} deleteSetupFile=${shouldDeleteSetupFile}`);
        if (!installerPath || !shouldDeleteSetupFile) {
            return {
                cleaned: false,
                markerPath,
                installerPath,
                shouldDeleteSetupFile
            };
        }

        const currentExePath = app.getPath('exe');
        if (normalizePath(installerPath) === normalizePath(currentExePath)) {
            await writeLog(`cleanup_skipped_same_exe installerPath=${installerPath}`);
            return {
                cleaned: false,
                markerPath,
                installerPath,
                shouldDeleteSetupFile
            };
        }

        const retryDelaysMs = [0, 400, 1200, 3000, 7000];
        for (let index = 0; index < retryDelaysMs.length; index += 1) {
            const waitMs = retryDelaysMs[index];
            if (waitMs > 0) {
                await delay(waitMs);
            }
            try {
                await fs.unlink(installerPath);
                await writeLog(`cleanup_success installerPath=${installerPath} attempt=${index + 1}`);
                console.log(`[INSTALL-HANDOFF] removed installer source ${installerPath}`);
                return {
                    cleaned: true,
                    markerPath,
                    installerPath,
                    shouldDeleteSetupFile
                };
            } catch (error) {
                const errorCode = String((error && error.code) || '');
                const errorMessage = String((error && error.message) || error || '');
                if (errorCode === 'ENOENT') {
                    await writeLog(`cleanup_already_missing installerPath=${installerPath} attempt=${index + 1}`);
                    return {
                        cleaned: true,
                        markerPath,
                        installerPath,
                        shouldDeleteSetupFile
                    };
                }
                await writeLog(`cleanup_retry installerPath=${installerPath} attempt=${index + 1} waitMs=${waitMs} error=${errorCode || errorMessage}`);
                if (index === retryDelaysMs.length - 1) {
                    console.warn(`[INSTALL-HANDOFF] failed to remove installer source ${installerPath}: ${errorMessage}`);
                    return {
                        cleaned: false,
                        error: errorMessage,
                        markerPath,
                        installerPath,
                        shouldDeleteSetupFile
                    };
                }
            }
        }

        return {
            cleaned: false,
            markerPath,
            installerPath,
            shouldDeleteSetupFile
        };
    }

    return {
        consumeManualInstallHandoff
    };
}

module.exports = {
    createInstallHandoffService
};

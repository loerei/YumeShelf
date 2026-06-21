import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { readInstallerContract } from '../shared/installer-contract';

function toBoolean(value: any, fallback = false): boolean {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
    if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
    return fallback;
}

function normalizePath(value: any): string {
    return path.normalize(String(value || '').trim()).replace(/[\\/]+$/, '').toLowerCase();
}

export interface InstallHandoffServiceOptions {
    app: any;
    markerFile: string;
    fallbackMarkerFiles?: string[];
    logFile?: string;
}

export interface InstallHandoffResult {
    cleaned: boolean;
    markerPath: string;
    installerPath: string;
    shouldDeleteSetupFile: boolean;
    error?: string;
}

export interface InstallHandoffService {
    consumeManualInstallHandoff(): Promise<InstallHandoffResult | null>;
}

export function createInstallHandoffService({
    app,
    markerFile,
    fallbackMarkerFiles = [],
    logFile = ''
}: InstallHandoffServiceOptions): InstallHandoffService {
    const markerCandidates = Array.from(new Set(
        [markerFile, ...fallbackMarkerFiles]
            .map((value) => String(value || '').trim())
            .filter(Boolean)
            .map((value) => normalizePath(value))
    ));

    async function writeLog(message: string): Promise<void> {
        if (!logFile) return;
        try {
            await fs.mkdir(path.dirname(logFile), { recursive: true });
            await fs.appendFile(logFile, `[${new Date().toISOString()}] ${message}\n`, 'utf8');
        } catch {}
    }

    async function readAvailableContract(): Promise<{ contract: any; markerPath: string } | null> {
        for (const candidate of markerCandidates) {
            try {
                const contract = await readInstallerContract(candidate);
                await writeLog(`marker_read_success path=${candidate}`);
                return { contract, markerPath: candidate };
            } catch (error: any) {
                const errorMessage = String((error?.code) || (error?.message) || error || '');
                await writeLog(`marker_read_miss path=${candidate} error=${errorMessage}`);
            }
        }
        return null;
    }

    async function deleteMarkerFiles(): Promise<void> {
        for (const candidate of markerCandidates) {
            try {
                await fs.unlink(candidate);
                await writeLog(`marker_deleted path=${candidate}`);
            } catch (error: any) {
                const code = String((error?.code) || '');
                if (code && code !== 'ENOENT') {
                    await writeLog(`marker_delete_failed path=${candidate} error=${String((error?.message) || error || '')}`);
                }
            }
        }
    }

    async function consumeManualInstallHandoff(): Promise<InstallHandoffResult | null> {
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
            } catch (error: any) {
                const errorCode = String((error?.code) || '');
                const errorMessage = String((error?.message) || error || '');
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

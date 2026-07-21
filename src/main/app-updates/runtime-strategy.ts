import * as fsSync from 'node:fs';
import * as path from 'node:path';

export interface PortableEnvironment {
    detected: boolean;
    explicitPortableExe: string;
    portableAppFilename: string;
    portableDir: string;
}

export interface RuntimeUpdateStrategy {
    artifactKind: 'nsis-installer' | 'portable-exe';
    channel: 'nsis' | 'development' | 'portable-legacy';
    manualFallbackReason: 'manual-installer-required' | 'not-packaged' | null;
    supportsInPlaceApply: boolean;
    supportsUpdater: boolean;
}

export function readPortableEnvironment(): PortableEnvironment {
    const explicitPortableExe = String(process.env.PORTABLE_EXECUTABLE_FILE || '').trim();
    const portableDir = String(process.env.PORTABLE_EXECUTABLE_DIR || '').trim();
    const portableAppFilename = String(process.env.PORTABLE_EXECUTABLE_APP_FILENAME || '').trim();
    return {
        detected: !!explicitPortableExe || !!(portableDir && portableAppFilename),
        explicitPortableExe,
        portableAppFilename,
        portableDir
    };
}

export function resolveRuntimeUpdateStrategy(app: any, isFakeVersionRun: () => boolean): RuntimeUpdateStrategy {
    if (app.isPackaged) {
        return {
            artifactKind: 'nsis-installer',
            channel: 'nsis',
            manualFallbackReason: null,
            supportsInPlaceApply: true,
            supportsUpdater: true
        };
    }

    if (isFakeVersionRun()) {
        return {
            artifactKind: 'nsis-installer',
            channel: 'development',
            manualFallbackReason: null,
            supportsInPlaceApply: true,
            supportsUpdater: true
        };
    }

    const portableEnvironment = readPortableEnvironment();
    if (portableEnvironment.detected) {
        return {
            artifactKind: 'portable-exe',
            channel: 'portable-legacy',
            manualFallbackReason: 'manual-installer-required',
            supportsInPlaceApply: false,
            supportsUpdater: false
        };
    }

    return {
        artifactKind: 'nsis-installer',
        channel: 'development',
        manualFallbackReason: 'not-packaged',
        supportsInPlaceApply: false,
        supportsUpdater: false
    };
}

export function probeWritableDir(dirPath: string): { ok: boolean; reason: string | null } {
    const stamp = `${process.pid}-${Date.now()}`;
    const sourcePath = path.join(dirPath, `yumeshelf-update-probe-${stamp}.tmp`);
    const targetPath = path.join(dirPath, `yumeshelf-update-probe-${stamp}.moved.tmp`);
    try {
        fsSync.mkdirSync(dirPath, { recursive: true });
        fsSync.writeFileSync(sourcePath, 'ok');
        fsSync.renameSync(sourcePath, targetPath);
        fsSync.unlinkSync(targetPath);
        return { ok: true, reason: null };
    } catch (error: any) {
        return {
            ok: false,
            reason: String(error?.code || 'not-writable').toLowerCase()
        };
    }
}

export function resolvePortableExecutablePath(app: any): { exePath: string; dirPath: string; source: string } {
    const portableEnvironment = readPortableEnvironment();
    if (portableEnvironment.explicitPortableExe && fsSync.existsSync(portableEnvironment.explicitPortableExe)) {
        return {
            exePath: portableEnvironment.explicitPortableExe,
            dirPath: path.dirname(portableEnvironment.explicitPortableExe),
            source: 'portable-env-file'
        };
    }

    if (portableEnvironment.portableDir && portableEnvironment.portableAppFilename) {
        const candidatePath = path.join(portableEnvironment.portableDir, `${portableEnvironment.portableAppFilename}.exe`);
        if (fsSync.existsSync(candidatePath)) {
            return {
                exePath: candidatePath,
                dirPath: portableEnvironment.portableDir,
                source: 'portable-env-dir'
            };
        }
    }

    const defaultExePath = app.getPath('exe');
    return {
        exePath: defaultExePath,
        dirPath: path.dirname(defaultExePath),
        source: 'app-exe'
    };
}

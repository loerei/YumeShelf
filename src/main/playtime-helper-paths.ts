import * as fs from 'node:fs';
import * as path from 'node:path';

export function getHelperExeName(platform: NodeJS.Platform = process.platform): string {
    return platform === 'win32' ? 'playtime-helper.exe' : 'playtime-helper';
}

export const HELPER_EXE_NAME = getHelperExeName();

export function getRepoRoot(): string {
    return path.resolve(__dirname, '..', '..');
}

export function getNativeHelperProjectDir(): string {
    return path.join(getRepoRoot(), 'native', 'playtime-helper');
}

export function getNativeHelperReleasePath(platform: NodeJS.Platform = process.platform): string {
    return path.join(getNativeHelperProjectDir(), 'target', 'release', getHelperExeName(platform));
}

export function getPackagedHelperRelativePath(platform: NodeJS.Platform = process.platform): string {
    return path.join('native', 'playtime-helper', getHelperExeName(platform));
}

export function resolvePackagedHelperPath(resourcesPath: string, platform: NodeJS.Platform = process.platform): string {
    return path.join(resourcesPath, getPackagedHelperRelativePath(platform));
}

export interface ResolvePlaytimeHelperOptions {
    app?: { isPackaged: boolean };
    resourcesPath?: string;
    platform?: NodeJS.Platform;
}

export function resolvePlaytimeHelperPath({
    app,
    resourcesPath = process.resourcesPath,
    platform = process.platform
}: ResolvePlaytimeHelperOptions = {}): string {
    if (app?.isPackaged) {
        return resolvePackagedHelperPath(resourcesPath, platform);
    }
    return getNativeHelperReleasePath(platform);
}

export function assertPlaytimeHelperExists(helperPath: string): string {
    if (!fs.existsSync(helperPath)) {
        throw new Error(`Playtime helper was not found: ${helperPath}`);
    }
    return helperPath;
}

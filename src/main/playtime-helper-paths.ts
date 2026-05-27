import * as fs from 'fs';
import * as path from 'path';

export const HELPER_EXE_NAME = 'playtime-helper.exe';

export function getRepoRoot(): string {
    return path.resolve(__dirname, '..', '..');
}

export function getNativeHelperProjectDir(): string {
    return path.join(getRepoRoot(), 'native', 'playtime-helper');
}

export function getNativeHelperReleasePath(): string {
    return path.join(getNativeHelperProjectDir(), 'target', 'release', HELPER_EXE_NAME);
}

export function getPackagedHelperRelativePath(): string {
    return path.join('native', 'playtime-helper', HELPER_EXE_NAME);
}

export function resolvePackagedHelperPath(resourcesPath: string): string {
    return path.join(resourcesPath, getPackagedHelperRelativePath());
}

export interface ResolvePlaytimeHelperOptions {
    app?: { isPackaged: boolean };
    resourcesPath?: string;
}

export function resolvePlaytimeHelperPath({ app, resourcesPath = process.resourcesPath }: ResolvePlaytimeHelperOptions = {}): string {
    if (app?.isPackaged) {
        return resolvePackagedHelperPath(resourcesPath);
    }
    return getNativeHelperReleasePath();
}

export function assertPlaytimeHelperExists(helperPath: string): string {
    if (!fs.existsSync(helperPath)) {
        throw new Error(`Playtime helper was not found: ${helperPath}`);
    }
    return helperPath;
}

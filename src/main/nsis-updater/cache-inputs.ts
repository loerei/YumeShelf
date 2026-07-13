import { load } from 'js-yaml';
import { CancellationToken } from 'builder-util-runtime';

export const GITHUB_RELEASE_DOWNLOAD_BASE_URL = 'https://github.com/loerei/YumeShelf/releases/download';

function normalizeText(value: any, fallback = ''): string {
    if (typeof value !== 'string') return fallback;
    return value.trim();
}

export function normalizeReleaseTagName(version: string): string {
    const normalizedVersion = normalizeText(version, '').replace(/^v/i, '');
    return normalizedVersion ? `v${normalizedVersion}` : '';
}

export function buildGitHubReleaseDownloadBaseUrl(version: string): string {
    const tagName = normalizeReleaseTagName(version);
    return tagName ? `${GITHUB_RELEASE_DOWNLOAD_BASE_URL}/${tagName}` : '';
}

export function buildGitHubReleaseManifestUrl(version: string): string {
    const baseUrl = buildGitHubReleaseDownloadBaseUrl(version);
    return baseUrl ? `${baseUrl}/latest.yml` : '';
}

export interface CurrentReleaseCacheInputs {
    blockmapUrl: string;
    installerName: string;
    installerSha512: string;
    installerUrl: string;
    manifestUrl: string;
}

export async function resolveCurrentReleaseCacheInputs(
    version: string,
    downloadBuffer: (url: string, start?: number, end?: number, token?: any, appVersion?: string) => Promise<Buffer>,
    appVersion?: string
): Promise<CurrentReleaseCacheInputs | null> {
    const manifestUrl = buildGitHubReleaseManifestUrl(version);
    if (!manifestUrl) {
        return null;
    }

    const manifestBuffer = await downloadBuffer(manifestUrl, 0, 15000, null, appVersion);
    const manifest: any = load(manifestBuffer.toString('utf8'));
    const installerName = normalizeText(manifest?.path, '');
    const installerSha512 = normalizeText(manifest?.sha512, '');
    if (!installerName || !installerSha512) {
        throw new Error(`latest.yml for ${version} did not contain both path and sha512.`);
    }

    const releaseBaseUrl = buildGitHubReleaseDownloadBaseUrl(version);
    return {
        blockmapUrl: `${releaseBaseUrl}/${installerName}.blockmap`,
        installerName,
        installerSha512,
        installerUrl: `${releaseBaseUrl}/${installerName}`,
        manifestUrl
    };
}

export interface CacheStateOptions {
    fs: any;
    fsSync: any;
    path: any;
    ensureDir: (dirPath: string) => Promise<void>;
    sha512FileBase64: (filePath: string) => Promise<string>;
    downloadBuffer: (url: string, start?: number, end?: number, token?: any, appVersion?: string) => Promise<Buffer>;
    appVersion?: string;
    VERBOSE_UPDATE_LOG?: boolean;
    appendUpdateLog: (message: string) => any;
}

export interface InstallerCacheState {
    cacheDir: string;
    cachedBlockmapPath: string;
    cachedInstallerPath: string;
    cachedInstallerSha512?: string;
}

interface RefreshInstallerOptions {
    fs: any;
    ensureDir: any;
    path: any;
    sha512FileBase64: any;
    appendUpdateLog: any;
    currentVersion: string;
    VERBOSE_UPDATE_LOG: boolean | undefined;
}

async function refreshCachedInstaller(
    activeUpdater: any,
    releaseInputs: any,
    cachedInstallerPath: string,
    opts: RefreshInstallerOptions
): Promise<string> {
    const { fs, ensureDir, path, sha512FileBase64, appendUpdateLog, currentVersion, VERBOSE_UPDATE_LOG } = opts;
    const tempInstallerPath = `${cachedInstallerPath}.download`;
    await ensureDir(path.dirname(cachedInstallerPath));
    try {
        await fs.unlink(tempInstallerPath);
    } catch {}
    await activeUpdater.httpExecutor.download(new URL(releaseInputs.installerUrl), tempInstallerPath, {
        cancellationToken: new CancellationToken(),
        headers: activeUpdater.requestHeaders || undefined,
        sha512: releaseInputs.installerSha512
    });
    await fs.rm(cachedInstallerPath, { force: true });
    await fs.rename(tempInstallerPath, cachedInstallerPath);
    const newSha512 = await sha512FileBase64(cachedInstallerPath);
    if (VERBOSE_UPDATE_LOG) {
        await appendUpdateLog(`nsis-updater current-cache refreshed-installer current=${currentVersion} installer=${cachedInstallerPath} sha512=${newSha512}`);
    }
    return newSha512;
}

export async function ensureCurrentInstallerCacheState(
    activeUpdater: any,
    currentVersion: string,
    {
        fs,
        fsSync,
        path,
        ensureDir,
        sha512FileBase64,
        downloadBuffer,
        appVersion,
        VERBOSE_UPDATE_LOG,
        appendUpdateLog
    }: CacheStateOptions
): Promise<InstallerCacheState | null> {
    const downloadHelper = typeof activeUpdater.getOrCreateDownloadHelper === 'function'
        ? await activeUpdater.getOrCreateDownloadHelper()
        : null;
    const cacheDir = normalizeText(downloadHelper?.cacheDir, '');
    if (!cacheDir) {
        if (VERBOSE_UPDATE_LOG) {
            await appendUpdateLog(`nsis-updater current-cache skip current=${currentVersion} reason=no-cache-dir`);
        }
        return null;
    }

    const cachedInstallerPath = path.join(cacheDir, 'installer.exe');
    const cachedBlockmapPath = path.join(cacheDir, 'current.blockmap');
    const releaseInputs = await resolveCurrentReleaseCacheInputs(currentVersion, downloadBuffer, appVersion);
    if (!releaseInputs) {
        if (VERBOSE_UPDATE_LOG) {
            await appendUpdateLog(`nsis-updater current-cache skip current=${currentVersion} reason=no-release-inputs`);
        }
        return {
            cacheDir,
            cachedBlockmapPath,
            cachedInstallerPath
        };
    }

    let cachedInstallerSha512 = '';
    if (fsSync.existsSync(cachedInstallerPath)) {
        try {
            cachedInstallerSha512 = await sha512FileBase64(cachedInstallerPath);
        } catch (error) {
            await appendUpdateLog(`nsis-updater current-cache hash-error current=${currentVersion} installer=${cachedInstallerPath} error=${String((error as any)?.stack || error || '')}`);
        }
    }

    const installerMatches = cachedInstallerSha512 === releaseInputs.installerSha512;
    if (VERBOSE_UPDATE_LOG) {
        await appendUpdateLog(
            `nsis-updater current-cache probe current=${currentVersion}`
            + ` manifest=${releaseInputs.manifestUrl}`
            + ` installer=${cachedInstallerPath}`
            + ` installerExists=${fsSync.existsSync(cachedInstallerPath)}`
            + ` installerMatches=${installerMatches}`
            + ` cachedInstallerSha512=${cachedInstallerSha512 || 'missing'}`
            + ` expectedInstallerSha512=${releaseInputs.installerSha512}`
            + ` blockmapExists=${fsSync.existsSync(cachedBlockmapPath)}`
        );
    }

    if (!installerMatches) {
        cachedInstallerSha512 = await refreshCachedInstaller(
            activeUpdater,
            releaseInputs,
            cachedInstallerPath,
            { fs, ensureDir, path, sha512FileBase64, appendUpdateLog, currentVersion, VERBOSE_UPDATE_LOG }
        );
    }

    const blockmapBuffer = await downloadBuffer(releaseInputs.blockmapUrl, 0, 15000, null, appVersion);
    await ensureDir(path.dirname(cachedBlockmapPath));
    await fs.writeFile(cachedBlockmapPath, blockmapBuffer);
    if (VERBOSE_UPDATE_LOG) {
        await appendUpdateLog(`nsis-updater current-cache refreshed-blockmap current=${currentVersion} blockmap=${cachedBlockmapPath} bytes=${blockmapBuffer.length}`);
    }

    return {
        cacheDir,
        cachedBlockmapPath,
        cachedInstallerPath,
        cachedInstallerSha512
    };
}

export interface PreviousBlockmapOptions {
    currentVersion: string;
    feedOverride: any;
    runtime: any;
}

export function resolvePreviousBlockmapBaseUrl({ currentVersion, feedOverride, runtime }: PreviousBlockmapOptions): string | null {
    const overrideBaseUrl = buildGitHubReleaseDownloadBaseUrl(currentVersion);
    if (!overrideBaseUrl) {
        return null;
    }

    const isGitHubGenericOverride = feedOverride?.provider === 'generic'
        && /^https:\/\/github\.com\/loerei\/YumeShelf\/releases\/download\/[^/]+$/i.test(normalizeText(feedOverride.url, ''));
    if (isGitHubGenericOverride || runtime?.provider === 'github') {
        return overrideBaseUrl;
    }

    return null;
}

export interface DifferentialDownloadOptions {
    currentVersion: string;
    feedOverride: any;
    runtime: any;
    appendUpdateLog: (message: string) => any;
    VERBOSE_UPDATE_LOG?: boolean;
}

export async function configureDifferentialDownload(
    nsisUpdater: any,
    { currentVersion, feedOverride, runtime, appendUpdateLog, VERBOSE_UPDATE_LOG }: DifferentialDownloadOptions
): Promise<void> {
    const previousBlockmapBaseUrlOverride = resolvePreviousBlockmapBaseUrl({
        currentVersion,
        feedOverride,
        runtime
    });
    nsisUpdater.previousBlockmapBaseUrlOverride = previousBlockmapBaseUrlOverride;

    if (VERBOSE_UPDATE_LOG) {
        await appendUpdateLog(
            `nsis-updater differential-config current=${currentVersion}`
            + ` runtime=${normalizeText(runtime?.channel, '')}`
            + ` provider=${normalizeText(feedOverride?.provider || runtime?.provider, '')}`
            + ` previousBlockmapBaseUrlOverride=${previousBlockmapBaseUrlOverride || 'default'}`
            + ` disableDifferentialDownload=${nsisUpdater.disableDifferentialDownload}`
        );
    }
}

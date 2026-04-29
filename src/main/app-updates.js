const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');
const { createNsisUpdaterService, isFakeVersionRun } = require('./nsis-updater');

const APP_UPDATE_RELEASES_API_URL = 'https://api.github.com/repos/loerei/YumeShelf/releases?per_page=25';
const APP_UPDATE_RELEASE_PAGE_URL = 'https://github.com/loerei/YumeShelf/releases/latest';
const APP_UPDATE_DOWNLOAD_TIMEOUT_MS = 10 * 60 * 1000;

function extractVersion(tagName) {
    const value = String(tagName || '').trim();
    return value.replace(/^v/i, '');
}

function firstHexDigest(text) {
    const match = String(text || '').match(/\b[a-f0-9]{64}\b/i);
    return match ? match[0].toLowerCase() : null;
}

function readAssetLabel(asset) {
    return String(asset?.label || asset?.name || '').trim();
}

function readAssetName(asset) {
    return String(asset?.name || asset?.label || '').trim();
}

function normalizeRelease(raw) {
    const tagName = String(raw?.tag_name || raw?.tagName || '').trim();
    const version = extractVersion(tagName);
    const assets = Array.isArray(raw?.assets) ? raw.assets.map((asset) => ({
        name: readAssetName(asset),
        label: readAssetLabel(asset),
        browserDownloadUrl: String(asset?.browser_download_url || asset?.url || '').trim()
    })) : [];

    return {
        assets,
        body: String(raw?.body || raw?.releaseNotes || '').trim(),
        htmlUrl: String(raw?.html_url || raw?.url || APP_UPDATE_RELEASE_PAGE_URL).trim(),
        name: String(raw?.name || '').trim(),
        publishedAt: raw?.published_at ? String(raw.published_at) : null,
        tagName,
        version
    };
}

function getReleaseDisplayName(release) {
    return String(release?.name || '').trim() || `YumeShelf v${String(release?.version || '').trim()}`;
}

function formatStackedReleaseNotes(releases) {
    return releases
        .filter(release => release?.version)
        .map((release) => {
            const body = String(release.body || '').trim() || '_No release notes were published for this version._';
            return `## ${getReleaseDisplayName(release)}\n\n${body}`;
        })
        .join('\n\n---\n\n');
}

function isPortableExeAsset(asset, version) {
    const candidates = [readAssetName(asset), readAssetLabel(asset)].map(value => value.toLowerCase());
    return candidates.some((value) => {
        return value.includes('yumeshelf')
            && value.includes(version.toLowerCase())
            && value.endsWith('.exe')
            && !value.endsWith('.exe.sha256');
    });
}

function isNsisInstallerAsset(asset, version) {
    const candidates = [readAssetName(asset), readAssetLabel(asset)].map(value => value.toLowerCase());
    return candidates.some((value) => {
        return value.includes('yumeshelf')
            && value.includes('setup')
            && value.includes(version.toLowerCase())
            && value.endsWith('.exe')
            && !value.endsWith('.exe.sha256');
    });
}

function isChecksumAsset(asset, version, artifactKind) {
    const candidates = [readAssetName(asset), readAssetLabel(asset)].map(value => value.toLowerCase());
    return candidates.some((value) => {
        return value.includes('yumeshelf')
            && (artifactKind !== 'nsis-installer' || value.includes('setup'))
            && value.includes(version.toLowerCase())
            && value.endsWith('.exe.sha256');
    });
}

function inferExecutableArtifactKind(filePath) {
    const fileName = path.basename(String(filePath || '')).toLowerCase();
    if (!fileName.endsWith('.exe')) return 'unknown';
    return fileName.includes('setup') ? 'nsis-installer' : 'portable-exe';
}

function readPortableEnvironment() {
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

function resolveRuntimeUpdateStrategy(app) {
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

function probeWritableDir(dirPath) {
    const stamp = `${process.pid}-${Date.now()}`;
    const sourcePath = path.join(dirPath, `yumeshelf-update-probe-${stamp}.tmp`);
    const targetPath = path.join(dirPath, `yumeshelf-update-probe-${stamp}.moved.tmp`);
    try {
        fsSync.mkdirSync(dirPath, { recursive: true });
        fsSync.writeFileSync(sourcePath, 'ok');
        fsSync.renameSync(sourcePath, targetPath);
        fsSync.unlinkSync(targetPath);
        return { ok: true, reason: null };
    } catch (error) {
        return {
            ok: false,
            reason: String((error && error.code) || 'not-writable').toLowerCase()
        };
    }
}

function resolvePortableExecutablePath(app) {
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

function createAppUpdateServices({
    app,
    broadcastStatus,
    compareVersions,
    downloadBuffer,
    ensureDir,
    isNetworkLikeError,
    openExternalUrl,
    readJsonFile,
    sha256Hex,
    startupNetworkTimeoutMs
}) {
    const updateCacheDir = path.join(app.getPath('userData'), 'app-update-cache');
    const postUpdateMarkerFile = path.join(updateCacheDir, 'post-update.json');
    const updateLogFile = path.join(updateCacheDir, 'portable-update.log');
    let latestKnownUpdate = null;

    async function appendUpdateLog(message) {
        await ensureDir(updateCacheDir);
        const line = `[${new Date().toISOString()}] ${message}\n`;
        await fs.appendFile(updateLogFile, line, 'utf8');
    }

    async function logDebug(message) {
        await appendUpdateLog(`debug ${message}`);
    }

    const nsisUpdaterService = createNsisUpdaterService({
        app,
        appendUpdateLog,
        broadcastStatus,
        compareVersions,
        ensureDir,
        releasePageUrl: APP_UPDATE_RELEASE_PAGE_URL,
        updateCacheDir,
        postUpdateMarkerFile
    });

    function summarizeAppUpdate(update) {
        return nsisUpdaterService.summarizeUpdateState({
            available: !!update?.available,
            canSelfUpdate: !!update?.canSelfUpdate,
            deferredUntilNextLaunch: !!update?.deferredUntilNextLaunch,
            downloadable: !!update?.downloadable,
            downloadReady: !!update?.downloadReady,
            releaseName: update?.releaseName ? String(update.releaseName) : '',
            releaseNotes: update?.releaseNotes ? String(update.releaseNotes) : '',
            releaseUrl: update?.releaseUrl ? String(update.releaseUrl) : APP_UPDATE_RELEASE_PAGE_URL,
            selfApplicable: !!update?.selfApplicable,
            version: update?.version ? String(update.version) : ''
        });
    }

    async function consumePostUpdateMarker() {
        const markerExists = await fs.access(postUpdateMarkerFile).then(() => true).catch(() => false);
        await appendUpdateLog(`consumePostUpdateMarker begin exists=${markerExists}`);
        if (!markerExists) {
            return null;
        }

        let marker = null;
        try {
            const rawText = await fs.readFile(postUpdateMarkerFile, 'utf8');
            const sanitizedText = rawText.replace(/^\uFEFF/, '');
            const hasBom = rawText.charCodeAt(0) === 0xFEFF;
            await appendUpdateLog(`consumePostUpdateMarker raw length=${rawText.length} hasBom=${hasBom}`);
            marker = JSON.parse(sanitizedText);
        } catch (error) {
            await appendUpdateLog(`consumePostUpdateMarker parse-failed error=${String((error && error.stack) || error || '')}`);
        }

        try {
            await fs.unlink(postUpdateMarkerFile);
            await appendUpdateLog('consumePostUpdateMarker deleted-marker-file');
        } catch (error) {
            await appendUpdateLog(`consumePostUpdateMarker delete-failed error=${String((error && error.message) || error || '')}`);
        }

        if (!marker || typeof marker !== 'object') {
            await appendUpdateLog('consumePostUpdateMarker invalid-marker');
            return null;
        }

        const notice = {
            actionState: 'installed',
            available: false,
            deferredUntilNextLaunch: false,
            fromVersion: marker.fromVersion ? String(marker.fromVersion) : '',
            installed: true,
            installedAt: marker.installedAt ? String(marker.installedAt) : null,
            releaseName: marker.releaseName ? String(marker.releaseName) : '',
            releaseNotes: marker.releaseNotes ? String(marker.releaseNotes) : '',
            releaseUrl: marker.releaseUrl ? String(marker.releaseUrl) : APP_UPDATE_RELEASE_PAGE_URL,
            selfApplicable: true,
            version: marker.toVersion ? String(marker.toVersion) : (marker.version ? String(marker.version) : '')
        };

        if (!notice.version) {
            await appendUpdateLog('consumePostUpdateMarker missing-version');
            return null;
        }

        const currentVersion = app.getVersion();
        if (compareVersions(currentVersion, notice.version) !== 0) {
            await appendUpdateLog(`consumePostUpdateMarker version-mismatch current=${currentVersion} marker=${notice.version}`);
            return null;
        }

        try {
            const newerReleases = notice.fromVersion
                ? await resolveNewerReleases(notice.fromVersion, notice.version)
                : [];
            if (newerReleases.length > 0) {
                notice.releaseName = getReleaseDisplayName(newerReleases[0]);
                notice.releaseNotes = formatStackedReleaseNotes(newerReleases);
                notice.releaseUrl = newerReleases[0].htmlUrl || notice.releaseUrl;
            } else {
                const latestRelease = await resolveLatestRelease();
                if (latestRelease?.version === notice.version) {
                    notice.releaseName = getReleaseDisplayName(latestRelease);
                    notice.releaseNotes = formatStackedReleaseNotes([latestRelease]);
                    notice.releaseUrl = latestRelease.htmlUrl || notice.releaseUrl;
                }
            }
        } catch (error) {
            await appendUpdateLog(`consumePostUpdateMarker refresh-failed error=${String((error && error.stack) || error || '')}`);
        }

        await appendUpdateLog(`consumePostUpdateMarker notice=${JSON.stringify({
            fromVersion: notice.fromVersion,
            installedAt: notice.installedAt,
            releaseUrl: notice.releaseUrl,
            version: notice.version
        })}`);

        return notice;
    }

    async function resolveReleaseFeed() {
        const buffer = await downloadBuffer(APP_UPDATE_RELEASES_API_URL, 0, startupNetworkTimeoutMs);
        const raw = JSON.parse(buffer.toString('utf8'));
        return Array.isArray(raw)
            ? raw
                .filter(release => !release?.draft && !release?.prerelease)
                .map(normalizeRelease)
                .filter(release => !!release.version)
            : [];
    }

    async function resolveLatestRelease() {
        const releases = await resolveReleaseFeed();
        return releases[0] || null;
    }

    async function resolveNewerReleases(fromVersion, toVersion = null) {
        const releases = await resolveReleaseFeed();
        return releases.filter((release) => {
            if (compareVersions(release.version, fromVersion) <= 0) {
                return false;
            }
            if (toVersion && compareVersions(release.version, toVersion) > 0) {
                return false;
            }
            return true;
        });
    }

    async function enrichUpdateInfo(update, runtimeStrategy) {
        const enriched = {
            ...update,
            available: !!update?.available,
            canSelfUpdate: !!update?.canSelfUpdate,
            deferredUntilNextLaunch: !!update?.deferredUntilNextLaunch,
            downloadable: !!update?.downloadable,
            downloadReady: !!update?.downloadReady,
            fallbackReason: update?.fallbackReason ? String(update.fallbackReason) : null,
            releaseName: update?.releaseName ? String(update.releaseName) : '',
            releaseNotes: update?.releaseNotes ? String(update.releaseNotes) : '',
            releaseUrl: update?.releaseUrl ? String(update.releaseUrl) : APP_UPDATE_RELEASE_PAGE_URL,
            selfApplicable: !!update?.selfApplicable,
            source: update?.source ? String(update.source) : runtimeStrategy.channel,
            version: update?.version ? String(update.version) : null
        };

        if (!enriched.available || !enriched.version) {
            return enriched;
        }

        if (runtimeStrategy.channel === 'nsis') {
            try {
                const newerReleases = await resolveNewerReleases(app.getVersion(), enriched.version);
                if (newerReleases.length > 0) {
                    enriched.releaseName = getReleaseDisplayName(newerReleases[0]);
                    enriched.releaseNotes = formatStackedReleaseNotes(newerReleases);
                    enriched.releaseUrl = newerReleases[0].htmlUrl || enriched.releaseUrl;
                }
            } catch (error) {
                await appendUpdateLog(`enrichUpdateInfo release-refresh-failed error=${String((error && error.stack) || error || '')}`);
            }
        }

        return enriched;
    }

    async function checkForAppUpdate() {
        const initial = {
            attempted: true,
            available: false,
            canSelfUpdate: false,
            checksumSha256: null,
            deferredUntilNextLaunch: false,
            downloadable: false,
            downloadReady: false,
            error: null,
            fallbackReason: null,
            offline: false,
            releaseName: '',
            releaseNotes: '',
            releaseUrl: APP_UPDATE_RELEASE_PAGE_URL,
            selfApplicable: false,
            source: 'unsupported',
            timedOut: false,
            version: null
        };

        try {
            const runtimeStrategy = resolveRuntimeUpdateStrategy(app);
            if (!runtimeStrategy.supportsUpdater) {
                latestKnownUpdate = {
                    ...initial,
                    fallbackReason: runtimeStrategy.manualFallbackReason,
                    source: runtimeStrategy.channel
                };
                await appendUpdateLog(`checkForAppUpdate unsupported strategy=${JSON.stringify(runtimeStrategy)}`);
                return latestKnownUpdate;
            }

            const update = await nsisUpdaterService.checkForUpdates();
            if (!update.available) {
                latestKnownUpdate = {
                    ...initial,
                    canSelfUpdate: !!update.canSelfUpdate,
                    deferredUntilNextLaunch: !!update.deferredUntilNextLaunch,
                    downloadable: !!update.downloadable,
                    downloadReady: !!update.downloadReady,
                    releaseName: update.releaseName || '',
                    releaseNotes: update.releaseNotes || '',
                    releaseUrl: update.releaseUrl || APP_UPDATE_RELEASE_PAGE_URL,
                    selfApplicable: !!update.selfApplicable,
                    source: update.provider === 'github' ? 'github' : runtimeStrategy.channel,
                    version: update.version || null
                };
                await appendUpdateLog(`checkForAppUpdate no-update strategy=${JSON.stringify(runtimeStrategy)} result=${JSON.stringify(summarizeAppUpdate(latestKnownUpdate))}`);
                return latestKnownUpdate;
            }

            latestKnownUpdate = await enrichUpdateInfo({
                ...initial,
                ...update,
                source: update.provider === 'github' ? 'github' : runtimeStrategy.channel
            }, runtimeStrategy);
            await appendUpdateLog(`checkForAppUpdate available strategy=${JSON.stringify(runtimeStrategy)} result=${JSON.stringify(summarizeAppUpdate(latestKnownUpdate))}`);
            return latestKnownUpdate;
        } catch (error) {
            const offline = isNetworkLikeError(error);
            latestKnownUpdate = {
                ...initial,
                error: String((error && error.message) || error || ''),
                fallbackReason: offline ? 'offline' : 'error',
                offline,
                source: offline ? 'offline' : 'error'
            };
            await appendUpdateLog(`checkForAppUpdate error=${String((error && error.stack) || error || '')}`);
            return latestKnownUpdate;
        }
    }

    async function openAppUpdateDownloadPage() {
        const releaseUrl = latestKnownUpdate?.releaseUrl || APP_UPDATE_RELEASE_PAGE_URL;
        await openExternalUrl(releaseUrl);
        return { ok: true, releaseUrl };
    }

    async function startBackgroundDownload() {
        const update = latestKnownUpdate || await checkForAppUpdate();
        await appendUpdateLog(`startBackgroundDownload update=${JSON.stringify(summarizeAppUpdate(update))}`);
        if (!update?.available) {
            return { ok: false, reason: 'no-update' };
        }
        if (!update.downloadable) {
            return {
                ok: false,
                reason: update.fallbackReason || 'not-downloadable',
                update: summarizeAppUpdate(update)
            };
        }

        const result = await nsisUpdaterService.downloadUpdate({
            releaseName: update.releaseName,
            releaseNotes: update.releaseNotes,
            releaseUrl: update.releaseUrl,
            version: update.version
        });

        if (result?.ok) {
            latestKnownUpdate = {
                ...update,
                actionState: update.deferredUntilNextLaunch ? 'scheduled' : 'ready',
                deferredUntilNextLaunch: false,
                downloadReady: true
            };
            return {
                ...result,
                update: summarizeAppUpdate(latestKnownUpdate)
            };
        }

        latestKnownUpdate = {
            ...update,
            actionState: 'failed'
        };
        return {
            ...result,
            update: summarizeAppUpdate(latestKnownUpdate)
        };
    }

    async function restartAndInstallDownloadedUpdate() {
        const update = latestKnownUpdate || await checkForAppUpdate();
        await appendUpdateLog(`restartAndInstallDownloadedUpdate update=${JSON.stringify(summarizeAppUpdate(update))}`);
        if (!update?.available) {
            return { ok: false, reason: 'no-update' };
        }
        const result = await nsisUpdaterService.installDownloadedUpdateNow({
            fromVersion: app.getVersion(),
            releaseName: update.releaseName,
            releaseNotes: update.releaseNotes,
            releaseUrl: update.releaseUrl,
            version: update.version
        });
        if (!result?.ok) {
            return result || { ok: false, reason: 'install' };
        }
        return result;
    }

    async function scheduleInstallOnNextLaunch() {
        const update = latestKnownUpdate || await checkForAppUpdate();
        await appendUpdateLog(`scheduleInstallOnNextLaunch update=${JSON.stringify(summarizeAppUpdate(update))}`);
        if (!update?.available) {
            return { ok: false, reason: 'no-update' };
        }

        const result = await nsisUpdaterService.scheduleInstallOnNextLaunch({
            fromVersion: app.getVersion(),
            releaseName: update.releaseName,
            releaseNotes: update.releaseNotes,
            releaseUrl: update.releaseUrl,
            version: update.version
        });
        if (!result?.ok) {
            return result || { ok: false, reason: 'schedule' };
        }

        latestKnownUpdate = {
            ...update,
            actionState: 'scheduled',
            deferredUntilNextLaunch: true,
            downloadReady: true
        };
        return {
            ...result,
            update: summarizeAppUpdate(latestKnownUpdate)
        };
    }

    async function runDeferredInstallOnLaunch() {
        return nsisUpdaterService.runDeferredInstallOnLaunch();
    }

    return {
        checkForAppUpdate,
        consumePostUpdateMarker,
        logDebug,
        openAppUpdateDownloadPage,
        restartAndInstallDownloadedUpdate,
        runDeferredInstallOnLaunch,
        scheduleInstallOnNextLaunch,
        startBackgroundDownload
    };
}

module.exports = {
    createAppUpdateServices
};

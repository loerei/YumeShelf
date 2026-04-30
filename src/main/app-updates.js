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

function isNumericVersionIdentifier(value) {
    return /^\d+$/.test(String(value || '').trim());
}

function parseAppReleaseVersion(value) {
    const normalized = extractVersion(value);
    const [corePart, ...prereleaseParts] = String(normalized || '0').split('-');
    const core = corePart
        .split('.')
        .map(part => parseInt(part, 10))
        .map(part => Number.isFinite(part) ? part : 0);
    const prerelease = prereleaseParts
        .join('-')
        .split('.')
        .map(part => part.trim())
        .filter(Boolean)
        .map(part => isNumericVersionIdentifier(part) ? Number(part) : part.toLowerCase());
    return {
        core,
        prerelease
    };
}

function compareAppReleaseVersions(left, right) {
    const a = parseAppReleaseVersion(left);
    const b = parseAppReleaseVersion(right);
    const coreLength = Math.max(a.core.length, b.core.length);
    for (let index = 0; index < coreLength; index += 1) {
        const delta = (a.core[index] || 0) - (b.core[index] || 0);
        if (delta !== 0) return delta;
    }

    const aHasPrerelease = a.prerelease.length > 0;
    const bHasPrerelease = b.prerelease.length > 0;
    if (!aHasPrerelease && !bHasPrerelease) return 0;
    if (!aHasPrerelease) return 1;
    if (!bHasPrerelease) return -1;

    const prereleaseLength = Math.max(a.prerelease.length, b.prerelease.length);
    for (let index = 0; index < prereleaseLength; index += 1) {
        const leftPart = a.prerelease[index];
        const rightPart = b.prerelease[index];
        if (leftPart === undefined) return -1;
        if (rightPart === undefined) return 1;
        if (leftPart === rightPart) continue;

        const leftIsNumber = typeof leftPart === 'number';
        const rightIsNumber = typeof rightPart === 'number';
        if (leftIsNumber && rightIsNumber) return leftPart - rightPart;
        if (leftIsNumber) return -1;
        if (rightIsNumber) return 1;

        const delta = String(leftPart).localeCompare(String(rightPart));
        if (delta !== 0) return delta;
    }

    return 0;
}

function isPrereleaseVersion(value) {
    return String(extractVersion(value || '')).includes('-');
}

function shouldIncludePrereleaseReleases(...versions) {
    return versions.some(version => isPrereleaseVersion(version));
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

function decodeHtmlEntities(value) {
    return String(value || '')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'");
}

function normalizeInlineHtmlToMarkdown(value) {
    return String(value || '')
        .replace(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_match, href, text) => `[${normalizeInlineHtmlToMarkdown(text).trim()}](${href.trim()})`)
        .replace(/<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi, (_match, _tag, text) => `**${normalizeInlineHtmlToMarkdown(text).trim()}**`)
        .replace(/<(em|i)[^>]*>([\s\S]*?)<\/\1>/gi, (_match, _tag, text) => `*${normalizeInlineHtmlToMarkdown(text).trim()}*`)
        .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, (_match, text) => `\`${decodeHtmlEntities(text).trim()}\``)
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/?[^>]+>/g, '')
        .replace(/\n{3,}/g, '\n\n');
}

function normalizeReleaseNotesForReview(value) {
    const raw = String(value || '').replace(/\r\n?/g, '\n').trim();
    if (!raw) return '';
    if (!/<[a-z][\s\S]*>/i.test(raw)) {
        return decodeHtmlEntities(raw);
    }

    let normalized = raw;
    normalized = normalized.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_match, level, text) => {
        const headingLevel = Math.min(3, Math.max(1, Number(level) || 1));
        return `\n\n${'#'.repeat(headingLevel)} ${normalizeInlineHtmlToMarkdown(text).trim()}\n\n`;
    });
    normalized = normalized.replace(/<(ul|ol)[^>]*>([\s\S]*?)<\/\1>/gi, (_match, _tag, inner) => {
        const items = Array.from(inner.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi))
            .map((entry) => `- ${normalizeInlineHtmlToMarkdown(entry[1]).trim()}`)
            .filter(Boolean);
        return items.length > 0 ? `\n${items.join('\n')}\n` : '\n';
    });
    normalized = normalized.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (_match, text) => `\n\n${normalizeInlineHtmlToMarkdown(text).trim()}\n\n`);
    normalized = normalized.replace(/<hr\s*\/?>/gi, '\n\n---\n\n');
    normalized = normalized.replace(/<br\s*\/?>/gi, '\n');
    normalized = normalizeInlineHtmlToMarkdown(normalized);
    normalized = decodeHtmlEntities(normalized)
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    return normalized;
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
        body: normalizeReleaseNotesForReview(raw?.body || raw?.releaseNotes || ''),
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
        compareVersions: compareAppReleaseVersions,
        ensureDir,
        releasePageUrl: APP_UPDATE_RELEASE_PAGE_URL,
        resolveFeedOverride: resolvePackagedFeedOverride,
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
            releaseNotes: normalizeReleaseNotesForReview(update?.releaseNotes || ''),
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
            releaseNotes: normalizeReleaseNotesForReview(marker.releaseNotes || ''),
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
            const includePrerelease = shouldIncludePrereleaseReleases(notice.fromVersion, notice.version);
            const newerReleases = notice.fromVersion
                ? await resolveNewerReleases(notice.fromVersion, notice.version, { includePrerelease })
                : [];
            if (newerReleases.length > 0) {
                notice.releaseName = getReleaseDisplayName(newerReleases[0]);
                notice.releaseNotes = formatStackedReleaseNotes(newerReleases);
                notice.releaseUrl = newerReleases[0].htmlUrl || notice.releaseUrl;
            } else {
                const latestRelease = await resolveLatestRelease({ includePrerelease });
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

    async function resolveReleaseFeed(options = {}) {
        const includePrerelease = options.includePrerelease === true;
        const buffer = await downloadBuffer(APP_UPDATE_RELEASES_API_URL, 0, startupNetworkTimeoutMs);
        const raw = JSON.parse(buffer.toString('utf8'));
        const releases = Array.isArray(raw)
            ? raw
                .filter(release => !release?.draft && (includePrerelease || !release?.prerelease))
                .map(normalizeRelease)
                .filter(release => !!release.version)
                .sort((left, right) => {
                    const versionDelta = compareAppReleaseVersions(right.version, left.version);
                    if (versionDelta !== 0) return versionDelta;
                    const publishedDelta = new Date(right.publishedAt || 0).getTime() - new Date(left.publishedAt || 0).getTime();
                    if (publishedDelta !== 0) return publishedDelta;
                    return String(right.tagName || '').localeCompare(String(left.tagName || ''));
                })
            : [];

        await appendUpdateLog(`resolveReleaseFeed includePrerelease=${includePrerelease} count=${releases.length} tags=${JSON.stringify(releases.slice(0, 5).map(release => ({ tag: release.tagName, version: release.version })))}`);
        return releases;
    }

    async function resolveLatestRelease(options = {}) {
        const releases = await resolveReleaseFeed(options);
        return releases[0] || null;
    }

    async function resolveNewerReleases(fromVersion, toVersion = null, options = {}) {
        const releases = await resolveReleaseFeed(options);
        return releases.filter((release) => {
            if (compareAppReleaseVersions(release.version, fromVersion) <= 0) {
                return false;
            }
            if (toVersion && compareAppReleaseVersions(release.version, toVersion) > 0) {
                return false;
            }
            return true;
        });
    }

    async function resolvePackagedFeedOverride({ currentVersion, runtime }) {
        if (runtime?.channel !== 'nsis') {
            await appendUpdateLog(`resolvePackagedFeedOverride skip-non-nsis current=${currentVersion} runtime=${JSON.stringify(runtime || null)}`);
            return null;
        }
        if (!isPrereleaseVersion(currentVersion)) {
            await appendUpdateLog(`resolvePackagedFeedOverride skip-non-prerelease current=${currentVersion}`);
            return null;
        }

        const releases = await resolveReleaseFeed({ includePrerelease: true });
        await appendUpdateLog(`resolvePackagedFeedOverride candidates current=${currentVersion} releases=${JSON.stringify(releases.slice(0, 5).map(release => ({ tag: release.tagName, version: release.version })))}`);
        const targetRelease = releases.find(release => compareAppReleaseVersions(release.version, currentVersion) > 0);
        if (!targetRelease) {
            await appendUpdateLog(`resolvePackagedFeedOverride none current=${currentVersion}`);
            return null;
        }

        const hasLatestManifest = targetRelease.assets.some(asset => readAssetName(asset).toLowerCase() === 'latest.yml');
        if (!hasLatestManifest) {
            await appendUpdateLog(`resolvePackagedFeedOverride skip-missing-latest current=${currentVersion} target=${targetRelease.version} tag=${targetRelease.tagName}`);
            return null;
        }

        const override = {
            channel: 'prerelease-github-generic',
            provider: 'generic',
            release: targetRelease,
            url: `https://github.com/loerei/YumeShelf/releases/download/${targetRelease.tagName}`
        };
        await appendUpdateLog(`resolvePackagedFeedOverride selected current=${currentVersion} target=${targetRelease.version} tag=${targetRelease.tagName} url=${override.url}`);
        return override;
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
            releaseNotes: normalizeReleaseNotesForReview(update?.releaseNotes || ''),
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
                const newerReleases = await resolveNewerReleases(
                    app.getVersion(),
                    enriched.version,
                    { includePrerelease: shouldIncludePrereleaseReleases(app.getVersion(), enriched.version) }
                );
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

    async function prepareDeferredInstallOnLaunch() {
        return nsisUpdaterService.prepareDeferredInstallOnLaunch();
    }

    async function beginDeferredInstallOnLaunch() {
        return nsisUpdaterService.beginDeferredInstallOnLaunch();
    }

    return {
        beginDeferredInstallOnLaunch,
        checkForAppUpdate,
        consumePostUpdateMarker,
        logDebug,
        openAppUpdateDownloadPage,
        prepareDeferredInstallOnLaunch,
        restartAndInstallDownloadedUpdate,
        runDeferredInstallOnLaunch,
        scheduleInstallOnNextLaunch,
        startBackgroundDownload
    };
}

module.exports = {
    createAppUpdateServices
};

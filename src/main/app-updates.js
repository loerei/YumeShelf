const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const APP_UPDATE_RELEASE_API_URL = 'https://api.github.com/repos/loerei/YumeShelf/releases/latest';
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

function isPortableExeAsset(asset, version) {
    const candidates = [readAssetName(asset), readAssetLabel(asset)].map(value => value.toLowerCase());
    return candidates.some((value) => {
        return value.includes('yumeshelf')
            && value.includes(version.toLowerCase())
            && value.endsWith('.exe')
            && !value.endsWith('.exe.sha256');
    });
}

function isChecksumAsset(asset, version) {
    const candidates = [readAssetName(asset), readAssetLabel(asset)].map(value => value.toLowerCase());
    return candidates.some((value) => {
        return value.includes('yumeshelf')
            && value.includes(version.toLowerCase())
            && value.endsWith('.exe.sha256');
    });
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
    const explicitPortableExe = String(process.env.PORTABLE_EXECUTABLE_FILE || '').trim();
    if (explicitPortableExe && fsSync.existsSync(explicitPortableExe)) {
        return {
            exePath: explicitPortableExe,
            dirPath: path.dirname(explicitPortableExe),
            source: 'portable-env-file'
        };
    }

    const portableDir = String(process.env.PORTABLE_EXECUTABLE_DIR || '').trim();
    const portableAppFilename = String(process.env.PORTABLE_EXECUTABLE_APP_FILENAME || '').trim();
    if (portableDir && portableAppFilename) {
        const candidatePath = path.join(portableDir, `${portableAppFilename}.exe`);
        if (fsSync.existsSync(candidatePath)) {
            return {
                exePath: candidatePath,
                dirPath: portableDir,
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
    const helperConsoleLogFile = path.join(updateCacheDir, 'portable-update-helper.log');
    const postUpdateMarkerFile = path.join(updateCacheDir, 'post-update.json');
    const updateStateFile = path.join(updateCacheDir, 'state.json');
    const updateLogFile = path.join(updateCacheDir, 'portable-update.log');
    const localOverrideFile = path.join(app.getPath('userData'), 'app-update', 'dev-latest.json');
    let activeDownloadPromise = null;
    let latestKnownUpdate = null;

    async function appendUpdateLog(message) {
        await ensureDir(updateCacheDir);
        const line = `[${new Date().toISOString()}] ${message}\n`;
        await fs.appendFile(updateLogFile, line, 'utf8');
    }

    async function logDebug(message) {
        await appendUpdateLog(`debug ${message}`);
    }

    function emitStatus(payload) {
        if (typeof broadcastStatus === 'function') {
            broadcastStatus({
                scope: 'app-update',
                timestamp: Date.now(),
                ...payload
            });
        }
    }

    async function writeState(state) {
        await ensureDir(updateCacheDir);
        await fs.writeFile(updateStateFile, JSON.stringify(state, null, 2), 'utf8');
    }

    async function readState() {
        const raw = await readJsonFile(updateStateFile);
        if (!raw || typeof raw !== 'object') return null;
        if (!raw.version || !raw.filePath || !raw.sha256) return null;
        return {
            downloadedAt: raw.downloadedAt ? String(raw.downloadedAt) : null,
            filePath: String(raw.filePath),
            releaseUrl: raw.releaseUrl ? String(raw.releaseUrl) : APP_UPDATE_RELEASE_PAGE_URL,
            sha256: String(raw.sha256).toLowerCase(),
            version: String(raw.version)
        };
    }

    async function clearState(state = null) {
        const currentState = state || await readState();
        if (currentState?.filePath) {
            try {
                await fs.unlink(currentState.filePath);
            } catch {}
        }
        try {
            await fs.unlink(updateStateFile);
        } catch {}
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
            fromVersion: marker.fromVersion ? String(marker.fromVersion) : '',
            installed: true,
            installedAt: marker.installedAt ? String(marker.installedAt) : null,
            releaseName: marker.releaseName ? String(marker.releaseName) : '',
            releaseNotes: marker.releaseNotes ? String(marker.releaseNotes) : '',
            releaseUrl: marker.releaseUrl ? String(marker.releaseUrl) : APP_UPDATE_RELEASE_PAGE_URL,
            version: marker.toVersion ? String(marker.toVersion) : (marker.version ? String(marker.version) : '')
        };

        if (!notice.version) {
            await appendUpdateLog('consumePostUpdateMarker missing-version');
            return null;
        }

        try {
            const latestRelease = await resolveLatestRelease();
            if (latestRelease?.version === notice.version) {
                notice.releaseName = latestRelease.name || notice.releaseName;
                notice.releaseNotes = latestRelease.body || notice.releaseNotes;
                notice.releaseUrl = latestRelease.htmlUrl || notice.releaseUrl;
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

    function createDownloadedExePath(version) {
        return path.join(updateCacheDir, `YumeShelf.${version}.exe`);
    }

    async function getCachedDownloadStateForVersion(version, expectedSha256) {
        const state = await readState();
        if (!state) return null;
        if (state.version !== version) {
            await clearState(state);
            return null;
        }
        if (expectedSha256 && state.sha256 !== String(expectedSha256).toLowerCase()) {
            await clearState(state);
            return null;
        }
        if (!fsSync.existsSync(state.filePath)) {
            await clearState(state);
            return null;
        }
        return state;
    }

    async function readLocalOverride() {
        const raw = await readJsonFile(localOverrideFile);
        if (!raw || typeof raw !== 'object') return null;
        if (!raw.version || !raw.exePath || !raw.sha256) return null;
        const localFilePath = path.resolve(String(raw.exePath));
        if (!fsSync.existsSync(localFilePath)) return null;
        const executableTarget = resolvePortableExecutablePath(app);
        const writeProbe = probeWritableDir(executableTarget.dirPath);
        const canSelfUpdate = app.isPackaged && writeProbe.ok;
        await appendUpdateLog(`readLocalOverride target=${JSON.stringify(executableTarget)} probe=${JSON.stringify(writeProbe)} localFilePath=${localFilePath}`);
        return {
            available: true,
            canSelfUpdate,
            checksumSha256: String(raw.sha256).toLowerCase(),
            downloadable: canSelfUpdate,
            downloadReady: false,
            fallbackReason: null,
            localFilePath,
            releaseNotes: String(raw.releaseNotes || raw.body || '').trim(),
            releaseName: String(raw.releaseName || raw.version),
            releaseUrl: String(raw.releaseUrl || APP_UPDATE_RELEASE_PAGE_URL),
            source: 'local',
            version: String(raw.version)
        };
    }

    function summarizeAppUpdate(update) {
        return {
            available: !!update?.available,
            canSelfUpdate: !!update?.canSelfUpdate,
            checksumSha256: update?.checksumSha256 ? String(update.checksumSha256).toLowerCase() : null,
            downloadable: !!update?.downloadable,
            downloadReady: !!update?.downloadReady,
            fallbackReason: update?.fallbackReason ? String(update.fallbackReason) : null,
            releaseNotes: update?.releaseNotes ? String(update.releaseNotes) : '',
            releaseName: update?.releaseName ? String(update.releaseName) : '',
            releaseUrl: update?.releaseUrl ? String(update.releaseUrl) : APP_UPDATE_RELEASE_PAGE_URL,
            version: update?.version ? String(update.version) : ''
        };
    }

    async function resolveLatestRelease() {
        const buffer = await downloadBuffer(APP_UPDATE_RELEASE_API_URL, 0, startupNetworkTimeoutMs);
        const raw = JSON.parse(buffer.toString('utf8'));
        return normalizeRelease(raw);
    }

    async function resolveChecksumSha256(asset) {
        if (!asset?.browserDownloadUrl) return null;
        const buffer = await downloadBuffer(asset.browserDownloadUrl, 0, startupNetworkTimeoutMs);
        return firstHexDigest(buffer.toString('utf8'));
    }

    async function checkForAppUpdate() {
        const initial = {
            attempted: true,
            available: false,
            canSelfUpdate: false,
            checksumSha256: null,
            downloadable: false,
            downloadReady: false,
            error: null,
            fallbackReason: null,
            offline: false,
            releaseName: '',
            releaseUrl: APP_UPDATE_RELEASE_PAGE_URL,
            releaseNotes: '',
            source: 'github',
            timedOut: false,
            version: null
        };

        try {
            const localOverride = await readLocalOverride();
            if (localOverride && compareVersions(localOverride.version, app.getVersion()) > 0) {
                const cachedState = await getCachedDownloadStateForVersion(localOverride.version, localOverride.checksumSha256);
                latestKnownUpdate = {
                    ...initial,
                    ...localOverride,
                    downloadReady: !!cachedState && !!localOverride.canSelfUpdate,
                    downloadable: !!(localOverride.localFilePath && localOverride.checksumSha256 && localOverride.canSelfUpdate)
                };
                await appendUpdateLog(`checkForAppUpdate source=local env=${JSON.stringify({
                    appExePath: app.getPath('exe'),
                    portableExecutableDir: process.env.PORTABLE_EXECUTABLE_DIR || '',
                    portableExecutableFile: process.env.PORTABLE_EXECUTABLE_FILE || '',
                    portableExecutableAppFilename: process.env.PORTABLE_EXECUTABLE_APP_FILENAME || ''
                })} result=${JSON.stringify(summarizeAppUpdate(latestKnownUpdate))}`);
                return latestKnownUpdate;
            }

            if (!app.isPackaged) {
                latestKnownUpdate = initial;
                return {
                    ...initial,
                    fallbackReason: 'not-packaged',
                    source: 'unsupported'
                };
            }

            const release = await resolveLatestRelease();
            if (!release.version || compareVersions(release.version, app.getVersion()) <= 0) {
                latestKnownUpdate = initial;
                return initial;
            }

            const exeAsset = release.assets.find(asset => isPortableExeAsset(asset, release.version));
            const checksumAsset = release.assets.find(asset => isChecksumAsset(asset, release.version));
            const checksumSha256 = checksumAsset ? await resolveChecksumSha256(checksumAsset) : null;
            const executableTarget = resolvePortableExecutablePath(app);
            const selfUpdateProbe = probeWritableDir(executableTarget.dirPath);
            const cachedState = checksumSha256
                ? await getCachedDownloadStateForVersion(release.version, checksumSha256)
                : null;

            latestKnownUpdate = {
                ...initial,
                assetName: exeAsset?.name || null,
                available: true,
                canSelfUpdate: selfUpdateProbe.ok,
                checksumSha256,
                downloadable: !!(exeAsset?.browserDownloadUrl && checksumSha256 && selfUpdateProbe.ok),
                downloadReady: !!cachedState && selfUpdateProbe.ok,
                fallbackReason: !exeAsset?.browserDownloadUrl
                    ? 'missing-release-asset'
                    : !checksumSha256
                        ? 'missing-checksum'
                        : !selfUpdateProbe.ok
                            ? selfUpdateProbe.reason
                            : null,
                releaseName: release.name,
                releaseNotes: release.body || '',
                releaseUrl: release.htmlUrl || APP_UPDATE_RELEASE_PAGE_URL,
                source: 'github',
                version: release.version,
                downloadUrl: exeAsset?.browserDownloadUrl || null
            };

            await appendUpdateLog(`checkForAppUpdate source=github env=${JSON.stringify({
                appExePath: app.getPath('exe'),
                portableExecutableDir: process.env.PORTABLE_EXECUTABLE_DIR || '',
                portableExecutableFile: process.env.PORTABLE_EXECUTABLE_FILE || '',
                portableExecutableAppFilename: process.env.PORTABLE_EXECUTABLE_APP_FILENAME || ''
            })} target=${JSON.stringify(executableTarget)} probe=${JSON.stringify(selfUpdateProbe)} result=${JSON.stringify(summarizeAppUpdate(latestKnownUpdate))}`);
            return latestKnownUpdate;
        } catch (error) {
            const offline = isNetworkLikeError(error);
            latestKnownUpdate = {
                ...initial,
                error: String((error && error.message) || error || ''),
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
        if (activeDownloadPromise) return activeDownloadPromise;
        const update = latestKnownUpdate || await checkForAppUpdate();
        await appendUpdateLog(`startBackgroundDownload update=${JSON.stringify(summarizeAppUpdate(update))}`);
        if (!update?.available) {
            return { ok: false, reason: 'no-update' };
        }

        if (update.downloadReady) {
            emitStatus({
                phase: 'download-ready',
                update: summarizeAppUpdate(update)
            });
            return { ok: true, alreadyReady: true, update: summarizeAppUpdate(update) };
        }

        if (!update.downloadable || (!update.downloadUrl && !update.localFilePath) || !update.checksumSha256) {
            const fallbackUpdate = summarizeAppUpdate(update);
            emitStatus({
                phase: 'download-failed',
                reason: update.fallbackReason || 'not-downloadable',
                update: fallbackUpdate
            });
            return { ok: false, reason: update.fallbackReason || 'not-downloadable', update: fallbackUpdate };
        }

        activeDownloadPromise = (async () => {
            emitStatus({
                phase: 'download-started',
                update: summarizeAppUpdate(update)
            });

            try {
                await ensureDir(updateCacheDir);
                let lastProgressTime = Date.now();
                let lastDownloadedBytes = 0;
                const buffer = update.localFilePath
                    ? await fs.readFile(update.localFilePath)
                    : await downloadBuffer(update.downloadUrl, 0, APP_UPDATE_DOWNLOAD_TIMEOUT_MS, (downloaded, total) => {
                        const now = Date.now();
                        const elapsed = now - lastProgressTime;
                        
                        // Throttle updates to ~2 times per second to prevent IPC bottleneck and UI jitter
                        if (elapsed >= 500 || downloaded === total) {
                            const bytesPerSecond = elapsed > 0 ? (downloaded - lastDownloadedBytes) / (elapsed / 1000) : 0;
                            lastProgressTime = now;
                            lastDownloadedBytes = downloaded;

                            emitStatus({
                                phase: 'download-progress',
                                downloaded,
                                total,
                                bytesPerSecond,
                                update: summarizeAppUpdate(update)
                            });
                        }
                    });
                const digest = sha256Hex(buffer);
                if (digest !== update.checksumSha256) {
                    throw Object.assign(new Error('App update checksum verification failed.'), { code: 'checksum' });
                }
                await appendUpdateLog(`startBackgroundDownload verified version=${update.version} digest=${digest}`);

                const filePath = createDownloadedExePath(update.version);
                await fs.writeFile(filePath, buffer);
                await writeState({
                    downloadedAt: new Date().toISOString(),
                    filePath,
                    releaseUrl: update.releaseUrl || APP_UPDATE_RELEASE_PAGE_URL,
                    sha256: digest,
                    version: update.version
                });

                latestKnownUpdate = {
                    ...update,
                    downloadReady: true
                };

                const readyUpdate = summarizeAppUpdate(latestKnownUpdate);
                emitStatus({
                    phase: 'download-ready',
                    update: readyUpdate
                });
                await appendUpdateLog(`startBackgroundDownload ready stateFile=${updateStateFile} cachedFile=${filePath}`);
                return { ok: true, update: readyUpdate };
            } catch (error) {
                const reason = error?.code === 'checksum'
                    ? 'checksum'
                    : isNetworkLikeError(error)
                        ? 'offline'
                        : String((error && error.code) || 'download').toLowerCase();
                const failedUpdate = summarizeAppUpdate(update);
                await appendUpdateLog(`startBackgroundDownload failed reason=${reason} error=${String((error && error.stack) || error || '')}`);
                emitStatus({
                    error: String((error && error.message) || error || ''),
                    phase: 'download-failed',
                    reason,
                    update: failedUpdate
                });
                return {
                    ok: false,
                    error: String((error && error.message) || error || ''),
                    reason,
                    update: failedUpdate
                };
            } finally {
                activeDownloadPromise = null;
            }
        })();

        return activeDownloadPromise;
    }

    async function restartAndInstallDownloadedUpdate() {
        const update = latestKnownUpdate || await checkForAppUpdate();
        const state = await getCachedDownloadStateForVersion(update?.version, update?.checksumSha256);
        await appendUpdateLog(`restartAndInstallDownloadedUpdate state=${JSON.stringify(state)} update=${JSON.stringify(summarizeAppUpdate(update))}`);
        if (!update?.available || !state) {
            return { ok: false, reason: 'no-downloaded-update' };
        }

        const buffer = await fs.readFile(state.filePath);
        const digest = sha256Hex(buffer);
        if (digest !== state.sha256) {
            await clearState(state);
            return { ok: false, reason: 'checksum' };
        }

        const executableTarget = resolvePortableExecutablePath(app);
        const targetExePath = executableTarget.exePath;
        const backupExePath = `${targetExePath}.backup`;
        const helperLauncherPath = path.join(app.getPath('temp'), `yumeshelf-portable-update-launcher-${state.version}-${Date.now()}.cmd`);
        const helperScriptPath = path.join(app.getPath('temp'), `yumeshelf-portable-update-${state.version}-${Date.now()}.ps1`);
        const postUpdateMarkerBase64 = Buffer.from(JSON.stringify({
            fromVersion: app.getVersion(),
            installedAt: new Date().toISOString(),
            releaseName: update.releaseName || '',
            releaseNotes: update.releaseNotes || '',
            releaseUrl: update.releaseUrl || APP_UPDATE_RELEASE_PAGE_URL,
            toVersion: update.version || state.version
        }), 'utf8').toString('base64');
        await appendUpdateLog(`restartAndInstallDownloadedUpdate target=${JSON.stringify(executableTarget)} helper=${helperScriptPath}`);
        const helperScript = `
$PidToWait = ${process.pid}
$TargetExePath = '${targetExePath.replace(/'/g, "''")}'
$TargetExeDir = '${path.dirname(targetExePath).replace(/'/g, "''")}'
$DownloadedExePath = '${state.filePath.replace(/'/g, "''")}'
$BackupExePath = '${backupExePath.replace(/'/g, "''")}'
$PostUpdateMarkerBase64 = '${postUpdateMarkerBase64}'
$PostUpdateMarkerPath = '${postUpdateMarkerFile.replace(/'/g, "''")}'
$ReleaseUrl = '${String(state.releaseUrl || APP_UPDATE_RELEASE_PAGE_URL).replace(/'/g, "''")}'
$StateFilePath = '${updateStateFile.replace(/'/g, "''")}'
$LogFilePath = '${updateLogFile.replace(/'/g, "''")}'
$HelperScriptPath = $MyInvocation.MyCommand.Path

Start-Sleep -Milliseconds 500

function Write-Log {
    param(
        [string]$Message
    )

    try {
        Add-Content -LiteralPath $LogFilePath -Value ("[" + [DateTime]::UtcNow.ToString("o") + "] helper " + $Message)
    } catch {}
}

function Test-TargetProcessRunning {
    param(
        [string]$ExecutablePath
    )

    try {
        $normalizedTarget = [System.IO.Path]::GetFullPath($ExecutablePath)
        $processes = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
            $_.ExecutablePath -and ([System.IO.Path]::GetFullPath($_.ExecutablePath) -eq $normalizedTarget)
        }
        if ($processes) {
            Write-Log ("target-process-running count=" + @($processes).Count + " path=" + $normalizedTarget)
        }
        return [bool]$processes
    } catch {
        Write-Log ("target-process-check-failed error=" + $_.Exception.Message)
        return $false
    }
}

try {
    Wait-Process -Id $PidToWait -Timeout 60 -ErrorAction SilentlyContinue
} catch {}
Write-Log ("waited-for-inner-pid pid=" + $PidToWait)

for ($waitAttempt = 0; $waitAttempt -lt 120; $waitAttempt++) {
    if (-not (Test-TargetProcessRunning -ExecutablePath $TargetExePath)) {
        Write-Log ("target-process-cleared attempt=" + $waitAttempt)
        break
    }
    Start-Sleep -Milliseconds 500
}

$updated = $false
for ($attempt = 0; $attempt -lt 30; $attempt++) {
    try {
        Write-Log ("swap-attempt=" + $attempt + " target=" + $TargetExePath)
        if ((Test-Path -LiteralPath $TargetExePath) -and (-not (Test-Path -LiteralPath $BackupExePath))) {
            Move-Item -LiteralPath $TargetExePath -Destination $BackupExePath -Force
            Write-Log ("moved-target-to-backup path=" + $BackupExePath)
        }
        Move-Item -LiteralPath $DownloadedExePath -Destination $TargetExePath -Force
        Write-Log ("moved-downloaded-to-target path=" + $TargetExePath)
        if (Test-Path -LiteralPath $BackupExePath) {
            Remove-Item -LiteralPath $BackupExePath -Force -ErrorAction SilentlyContinue
            Write-Log ("removed-backup path=" + $BackupExePath)
        }
        if (Test-Path -LiteralPath $StateFilePath) {
            Remove-Item -LiteralPath $StateFilePath -Force -ErrorAction SilentlyContinue
            Write-Log ("removed-state path=" + $StateFilePath)
        }
        [System.IO.File]::WriteAllText(
            $PostUpdateMarkerPath,
            [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($PostUpdateMarkerBase64)),
            (New-Object System.Text.UTF8Encoding($false))
        )
        Write-Log ("wrote-post-update-marker path=" + $PostUpdateMarkerPath)
        Start-Process -FilePath $TargetExePath -WorkingDirectory $TargetExeDir -ArgumentList '--after-update'
        Write-Log ("relaunch-started path=" + $TargetExePath + " cwd=" + $TargetExeDir + " args=--after-update")
        $updated = $true
        break
    } catch {
        Write-Log ("swap-attempt-failed attempt=" + $attempt + " error=" + $_.Exception.Message)
        try {
            if ((-not (Test-Path -LiteralPath $TargetExePath)) -and (Test-Path -LiteralPath $BackupExePath)) {
                Move-Item -LiteralPath $BackupExePath -Destination $TargetExePath -Force
                Write-Log ("restored-backup path=" + $TargetExePath)
            }
        } catch {}
        Start-Sleep -Milliseconds 1000
    }
}

if (-not $updated) {
    Write-Log "swap-never-succeeded"
    try {
        if ((-not (Test-Path -LiteralPath $TargetExePath)) -and (Test-Path -LiteralPath $BackupExePath)) {
            Move-Item -LiteralPath $BackupExePath -Destination $TargetExePath -Force
            Write-Log ("restored-backup-after-failure path=" + $TargetExePath)
        }
    } catch {}
    try {
        if (Test-Path -LiteralPath $PostUpdateMarkerPath) {
            Remove-Item -LiteralPath $PostUpdateMarkerPath -Force -ErrorAction SilentlyContinue
            Write-Log ("removed-post-update-marker-after-failure path=" + $PostUpdateMarkerPath)
        }
    } catch {}
    if (Test-Path -LiteralPath $StateFilePath) {
        Remove-Item -LiteralPath $StateFilePath -Force -ErrorAction SilentlyContinue
        Write-Log ("removed-state-after-failure path=" + $StateFilePath)
    }
    if (Test-Path -LiteralPath $TargetExePath) {
        Start-Process -FilePath $TargetExePath -WorkingDirectory $TargetExeDir -ArgumentList '--after-update'
        Write-Log ("relaunch-old-target path=" + $TargetExePath + " cwd=" + $TargetExeDir + " args=--after-update")
    }
    Start-Process $ReleaseUrl
    Write-Log ("opened-release-url url=" + $ReleaseUrl)
}

Remove-Item -LiteralPath $HelperScriptPath -Force -ErrorAction SilentlyContinue
`;

        await fs.writeFile(helperScriptPath, helperScript.trimStart(), 'utf8');
        const helperLauncher = `@echo off
setlocal
echo [%date% %time%] launcher start script="${helperScriptPath}" >> "${updateLogFile}"
powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "${helperScriptPath}" >> "${helperConsoleLogFile}" 2>&1
set "EXITCODE=%ERRORLEVEL%"
echo [%date% %time%] launcher exit code=%EXITCODE% >> "${updateLogFile}"
del /f /q "${helperLauncherPath}" >nul 2>nul
endlocal
`;
        await fs.writeFile(helperLauncherPath, helperLauncher, 'utf8');
        await appendUpdateLog(`restartAndInstallDownloadedUpdate launching-helper helper=${helperScriptPath} launcher=${helperLauncherPath} consoleLog=${helperConsoleLogFile}`);
        const child = spawn('cmd.exe', [
            '/d',
            '/c',
            helperLauncherPath
        ], {
            detached: true,
            stdio: 'ignore',
            windowsHide: true
        });
        await appendUpdateLog(`restartAndInstallDownloadedUpdate helper-spawned pid=${child.pid || 'unknown'}`);
        child.unref();

        setTimeout(() => {
            app.quit();
        }, 120);

        return { ok: true };
    }

    return {
        checkForAppUpdate,
        consumePostUpdateMarker,
        logDebug,
        openAppUpdateDownloadPage,
        restartAndInstallDownloadedUpdate,
        startBackgroundDownload
    };
}

module.exports = {
    createAppUpdateServices
};

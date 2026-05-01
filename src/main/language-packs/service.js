const path = require('path');
const fs = require('fs/promises');
const fsSync = require('fs');
const crypto = require('crypto');
const http = require('http');
const https = require('https');
const { compareNumericVersions } = require('../core/version-utils');

const LANGUAGE_PACK_REPO_URL = 'https://github.com/loerei/YumeShelf/blob/main/TRANSLATION.md';
const LANGUAGE_PACK_MANIFEST_URL = 'https://raw.githubusercontent.com/loerei/YumeShelf/main/language-packs/manifest.json';
const LANGUAGE_PACK_TIMEOUT_MS = 8000;
const LOCALE_REQUIRED_STRING_KEYS = ['title', 'settings', 'lang', 'welcome', 'welcome_desc', 'placeholders'];

function normalizeLanguageCode(code) {
    return String(code || '').trim().toLowerCase();
}

function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

async function ensureDir(dirPath) {
    await fs.mkdir(dirPath, { recursive: true });
}

async function readJsonFile(filePath) {
    try {
        return JSON.parse(await fs.readFile(filePath, 'utf8'));
    } catch {
        return null;
    }
}

async function writeJsonFile(filePath, data) {
    await ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function sha256Hex(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex');
}

function isNetworkLikeError(error) {
    const msg = String((error && error.message) || error || '').toLowerCase();
    const code = String((error && error.code) || '').toLowerCase();
    return [
        'econnreset',
        'econnrefused',
        'enetunreach',
        'ehostunreach',
        'eai_again',
        'timed out',
        'enotfound',
        'socket hang up',
        'offline',
        'network'
    ].some(token => msg.includes(token) || code.includes(token));
}

function downloadBuffer(urlString, redirectCount = 0, timeoutMs = LANGUAGE_PACK_TIMEOUT_MS, onProgress = null, appVersion = '0.0.0') {
    return new Promise((resolve, reject) => {
        if (redirectCount > 5) {
            reject(new Error('Too many redirects while downloading language pack data.'));
            return;
        }

        let requestUrl;
        try {
            requestUrl = new URL(urlString);
        } catch {
            reject(new Error(`Invalid download URL: ${urlString}`));
            return;
        }

        const client = requestUrl.protocol === 'http:' ? http : https;
        const req = client.get(requestUrl, {
            headers: {
                'User-Agent': `YumeShelf/${appVersion}`
            }
        }, (res) => {
            const status = res.statusCode || 0;
            if ([301, 302, 303, 307, 308].includes(status) && res.headers.location) {
                const redirected = new URL(res.headers.location, requestUrl).toString();
                res.resume();
                resolve(downloadBuffer(redirected, redirectCount + 1, timeoutMs, onProgress, appVersion));
                return;
            }

            if (status !== 200) {
                res.resume();
                reject(new Error(`HTTP ${status} while downloading ${requestUrl.toString()}`));
                return;
            }

            const total = parseInt(res.headers['content-length'], 10);
            let downloaded = 0;
            const chunks = [];
            res.on('data', chunk => {
                chunks.push(Buffer.from(chunk));
                downloaded += chunk.length;
                if (typeof onProgress === 'function' && total) {
                    onProgress(downloaded, total);
                }
            });
            res.on('end', () => resolve(Buffer.concat(chunks)));
        });

        req.setTimeout(timeoutMs, () => {
            req.destroy(new Error('Request timed out.'));
        });
        req.on('error', reject);
    });
}

function normalizeLocalePack(raw, options = {}) {
    const { installed = false, builtIn = false, sourceLabel = 'locale pack' } = options;
    if (!isPlainObject(raw)) throw new Error(`${sourceLabel} is not a JSON object.`);

    const code = normalizeLanguageCode(raw.code);
    if (!code) throw new Error(`${sourceLabel} is missing a language code.`);
    if (!raw.englishName || !raw.nativeName) throw new Error(`${sourceLabel} is missing language names.`);
    if (!isPlainObject(raw.strings)) throw new Error(`${sourceLabel} is missing the strings object.`);

    const missingKeys = LOCALE_REQUIRED_STRING_KEYS.filter((key) => {
        if (key === 'placeholders') return !Array.isArray(raw.strings.placeholders) || raw.strings.placeholders.length === 0;
        return typeof raw.strings[key] !== 'string' || raw.strings[key].trim().length === 0;
    });
    if (missingKeys.length > 0) {
        throw new Error(`${sourceLabel} is missing required keys: ${missingKeys.join(', ')}`);
    }

    return {
        code,
        englishName: String(raw.englishName),
        nativeName: String(raw.nativeName),
        packVersion: String(raw.packVersion || raw.version || '1.0.0'),
        minAppVersion: raw.minAppVersion ? String(raw.minAppVersion) : null,
        reviewedForAppVersion: raw.reviewedForAppVersion ? String(raw.reviewedForAppVersion) : null,
        aliases: Array.isArray(raw.aliases) ? raw.aliases.map(value => String(value)).filter(Boolean) : [],
        keywords: Array.isArray(raw.keywords) ? raw.keywords.map(value => String(value)).filter(Boolean) : [],
        source: builtIn ? 'built-in' : (installed ? 'downloaded' : 'remote'),
        strings: raw.strings
    };
}

function normalizeManifest(raw) {
    if (!isPlainObject(raw)) throw new Error('Manifest payload is not a JSON object.');
    if (!Array.isArray(raw.packs)) throw new Error('Manifest is missing the packs array.');

    const packs = raw.packs.map((entry, index) => {
        if (!isPlainObject(entry)) throw new Error(`Manifest pack #${index + 1} is invalid.`);
        const code = normalizeLanguageCode(entry.code);
        if (!code) throw new Error(`Manifest pack #${index + 1} is missing a code.`);
        if (!entry.englishName || !entry.nativeName) throw new Error(`Manifest pack '${code}' is missing names.`);
        if (!entry.downloadUrl || !entry.sha256) throw new Error(`Manifest pack '${code}' is missing download metadata.`);

        return {
            code,
            englishName: String(entry.englishName),
            nativeName: String(entry.nativeName),
            packVersion: String(entry.packVersion || entry.version || '1.0.0'),
            minAppVersion: entry.minAppVersion ? String(entry.minAppVersion) : null,
            reviewedForAppVersion: entry.reviewedForAppVersion ? String(entry.reviewedForAppVersion) : null,
            aliases: Array.isArray(entry.aliases) ? entry.aliases.map(value => String(value)).filter(Boolean) : [],
            keywords: Array.isArray(entry.keywords) ? entry.keywords.map(value => String(value)).filter(Boolean) : [],
            downloadUrl: String(entry.downloadUrl),
            sha256: String(entry.sha256).toLowerCase()
        };
    });

    return {
        schemaVersion: Number(raw.schemaVersion || 1),
        generatedAt: raw.generatedAt ? String(raw.generatedAt) : null,
        packs
    };
}

function summarizeLanguagePackUpdate(installedPack, manifestEntry) {
    return {
        code: installedPack.code,
        englishName: manifestEntry.englishName,
        nativeName: manifestEntry.nativeName,
        currentPackVersion: installedPack.packVersion,
        nextPackVersion: manifestEntry.packVersion,
        minAppVersion: manifestEntry.minAppVersion,
        reviewedForAppVersion: manifestEntry.reviewedForAppVersion
    };
}

function createLanguagePackServices({
    app,
    paths
}) {
    async function loadLocaleDirectory(dirPath, options = {}) {
        const results = [];
        try {
            const entries = await fs.readdir(dirPath, { withFileTypes: true });
            for (const entry of entries) {
                if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== '.json') continue;
                const filePath = path.join(dirPath, entry.name);
                const raw = await readJsonFile(filePath);
                if (!raw) continue;
                try {
                    results.push(normalizeLocalePack(raw, {
                        ...options,
                        sourceLabel: filePath
                    }));
                } catch (error) {
                    console.warn(`[MAIN][I18N] Skipping locale file ${filePath}: ${String((error && error.message) || error)}`);
                }
            }
        } catch {
            return [];
        }
        return results;
    }

    async function buildLanguageState() {
        const builtInPacks = await loadLocaleDirectory(paths.builtInLocalesDir, { builtIn: true });
        const installedPacks = await loadLocaleDirectory(paths.userLocalesDir, { installed: true });
        const locales = {};
        const seenCodes = new Set();

        for (const pack of builtInPacks) {
            locales[pack.code] = pack.strings;
            seenCodes.add(pack.code);
        }

        const installed = [];
        for (const pack of installedPacks) {
            if (seenCodes.has(pack.code)) continue;
            installed.push(pack);
            locales[pack.code] = pack.strings;
            seenCodes.add(pack.code);
        }

        return {
            repoUrl: LANGUAGE_PACK_REPO_URL,
            manifestUrl: LANGUAGE_PACK_MANIFEST_URL,
            appVersion: app.getVersion(),
            builtIn: builtInPacks.map(({ strings, ...meta }) => meta),
            installed: installed.map(({ strings, ...meta }) => meta),
            locales
        };
    }

    async function readCachedLanguageManifest() {
        const raw = await readJsonFile(paths.languagePackManifestCacheFile);
        if (!raw) return null;
        try {
            return normalizeManifest(raw);
        } catch (error) {
            console.warn(`[MAIN][I18N] Ignoring invalid cached manifest: ${String((error && error.message) || error)}`);
            return null;
        }
    }

    async function fetchLanguageManifest() {
        if (paths.isDev) {
            const localManifest = await readJsonFile(paths.localLanguagePackManifestFile);
            if (localManifest) {
                try {
                    const manifest = normalizeManifest(localManifest);
                    return { ok: true, offline: false, source: 'local', manifest, error: null };
                } catch (error) {
                    console.warn(`[MAIN][I18N] Invalid local dev manifest: ${String((error && error.message) || error)}`);
                }
            }
        }

        try {
            const buffer = await downloadBuffer(LANGUAGE_PACK_MANIFEST_URL, 0, LANGUAGE_PACK_TIMEOUT_MS, null, app.getVersion());
            const raw = JSON.parse(buffer.toString('utf8'));
            const manifest = normalizeManifest(raw);
            await writeJsonFile(paths.languagePackManifestCacheFile, raw);
            return { ok: true, offline: false, source: 'remote', manifest, error: null };
        } catch (error) {
            const cached = await readCachedLanguageManifest();
            if (cached) {
                return {
                    ok: true,
                    offline: true,
                    source: 'cache',
                    manifest: cached,
                    error: String((error && error.message) || error)
                };
            }

            return {
                ok: false,
                offline: isNetworkLikeError(error),
                source: 'none',
                manifest: null,
                error: String((error && error.message) || error)
            };
        }
    }

    async function installLanguagePackFromManifestEntry(entry, options = {}) {
        const normalizedCode = normalizeLanguageCode(entry && entry.code);
        const downloadTimeoutMs = Number(options.downloadTimeoutMs) > 0 ? Number(options.downloadTimeoutMs) : LANGUAGE_PACK_TIMEOUT_MS;
        if (!normalizedCode) {
            return { ok: false, error: 'Missing language pack code.', reason: 'invalid-code' };
        }

        const minVersion = entry.minAppVersion || null;
        if (minVersion && compareNumericVersions(app.getVersion(), minVersion) < 0) {
            return {
                ok: false,
                error: `Language pack '${normalizedCode}' requires YumeShelf ${minVersion} or newer.`,
                reason: 'not-compatible'
            };
        }

        try {
            let buffer;
            if (paths.isDev) {
                const localPackPath = path.join(paths.localLanguagePacksDir, `${normalizedCode}.json`);
                if (fsSync.existsSync(localPackPath)) {
                    buffer = await fs.readFile(localPackPath);
                }
            }
            if (!buffer) {
                buffer = await downloadBuffer(entry.downloadUrl, 0, downloadTimeoutMs, null, app.getVersion());
            }

            const digest = sha256Hex(buffer);
            if (digest !== entry.sha256) {
                return {
                    ok: false,
                    error: `Checksum verification failed for '${normalizedCode}'.`,
                    reason: 'checksum'
                };
            }

            const raw = JSON.parse(buffer.toString('utf8'));
            const pack = normalizeLocalePack(raw, { installed: true, sourceLabel: `downloaded pack '${normalizedCode}'` });
            if (pack.code !== normalizedCode) {
                return {
                    ok: false,
                    error: `Downloaded pack code '${pack.code}' does not match '${normalizedCode}'.`,
                    reason: 'schema'
                };
            }
            if (pack.minAppVersion && compareNumericVersions(app.getVersion(), pack.minAppVersion) < 0) {
                return {
                    ok: false,
                    error: `Language pack '${normalizedCode}' requires YumeShelf ${pack.minAppVersion} or newer.`,
                    reason: 'not-compatible'
                };
            }

            await ensureDir(paths.userLocalesDir);
            await fs.writeFile(path.join(paths.userLocalesDir, `${normalizedCode}.json`), JSON.stringify(raw, null, 2), 'utf8');

            return {
                ok: true,
                installedCode: normalizedCode
            };
        } catch (error) {
            return {
                ok: false,
                offline: isNetworkLikeError(error),
                error: String((error && error.message) || error),
                reason: isNetworkLikeError(error) ? 'offline' : 'download'
            };
        }
    }

    async function applyLanguagePackUpdates(candidates, options = {}) {
        const installed = [];
        const failed = [];

        for (const candidate of candidates) {
            const result = await installLanguagePackFromManifestEntry(candidate.manifestEntry, options);
            if (result.ok) {
                installed.push(candidate.summary);
                continue;
            }

            failed.push({
                ...candidate.summary,
                offline: !!result.offline,
                error: result.error || null,
                reason: result.reason || 'download'
            });
        }

        return {
            installed,
            failed,
            state: installed.length > 0 ? await buildLanguageState() : null
        };
    }

    async function installLanguagePack(code) {
        const normalizedCode = normalizeLanguageCode(code);
        if (!normalizedCode) {
            return { ok: false, error: 'Missing language pack code.', reason: 'invalid-code' };
        }

        const manifestResult = await fetchLanguageManifest();
        if (!manifestResult.ok || !manifestResult.manifest) {
            return {
                ok: false,
                offline: manifestResult.offline,
                error: manifestResult.offline ? 'You are offline.' : (manifestResult.error || 'Unable to load language packs.'),
                reason: manifestResult.offline ? 'offline' : 'manifest'
            };
        }

        const entry = manifestResult.manifest.packs.find(pack => pack.code === normalizedCode);
        if (!entry) {
            return { ok: false, error: `Language pack '${normalizedCode}' was not found.`, reason: 'not-found' };
        }

        const installResult = await installLanguagePackFromManifestEntry(entry);
        if (!installResult.ok) {
            return installResult;
        }

        return {
            ...installResult,
            state: await buildLanguageState()
        };
    }

    function getLanguagePackUpdateCandidates(languageState, manifest) {
        if (!languageState || !Array.isArray(languageState.installed) || !manifest || !Array.isArray(manifest.packs)) {
            return [];
        }

        const manifestByCode = new Map(manifest.packs.map(pack => [pack.code, pack]));
        return languageState.installed
            .map((installedPack) => {
                const manifestEntry = manifestByCode.get(installedPack.code);
                if (!manifestEntry) return null;
                if (manifestEntry.minAppVersion && compareNumericVersions(app.getVersion(), manifestEntry.minAppVersion) < 0) return null;
                if (compareNumericVersions(manifestEntry.packVersion, installedPack.packVersion) <= 0) return null;
                return {
                    manifestEntry,
                    summary: summarizeLanguagePackUpdate(installedPack, manifestEntry)
                };
            })
            .filter(Boolean);
    }

    return {
        applyLanguagePackUpdates,
        buildLanguageState,
        fetchLanguageManifest,
        getLanguagePackUpdateCandidates,
        installLanguagePack,
        isNetworkLikeError,
        repoUrl: LANGUAGE_PACK_REPO_URL
    };
}

module.exports = {
    createLanguagePackServices
};

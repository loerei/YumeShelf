// @ts-nocheck
const path = require('path');
const fs = require('fs/promises');
const fsSync = require('fs');
const http = require('http');
const https = require('https');
const { exec } = require('child_process');
const { downloadFile, downloadBuffer, ensureDir } = require('../core/shared-io');

const XUNITY_RELEASES_API = 'https://api.github.com/repos/bbepis/XUnity.AutoTranslator/releases/latest';
const BEPINEX_RELEASES_API = 'https://api.github.com/repos/BepInEx/BepInEx/releases/latest';

class TranslationService {
    constructor({ translatorsDir, appVersion, broadcastStatus }) {
        this.translatorsDir = translatorsDir;
        this.appVersion = appVersion;
        
        const originalBroadcast = broadcastStatus;
        this.broadcastStatus = (payload) => {
            const activeName = this.jobs.get(this.activeJobKey)?.gameName || '';
            const queueData = this.syncQueue.map(item => ({
                gameKey: item.gameKey,
                gameName: item.gameName
            }));
            originalBroadcast({
                ...payload,
                activeJobName: activeName,
                queue: queueData
            });
        };
        
        this.isDownloading = false;
        
        /** @type {http.Server | null} */
        this.proxyServer = null;
        this.proxyPort = 0;

        this.jobs = new Map();
        this.activeJobKey = null;
        this.syncQueue = [];
        const { UnityExtractor } = require('./extractors/unity');
        const { RpgMakerExtractor } = require('./extractors/rpg-maker');
        this.extractors = {
            'unity': new UnityExtractor(),
            'rpg-maker': new RpgMakerExtractor()
        };
    }

    /**
     * Starts the local translation proxy server.
     */
    async startProxy() {
        if (this.proxyServer) return this.proxyPort;

        return new Promise((resolve) => {
            this.proxyServer = http.createServer(async (req, res) => {
                const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
                if (url.pathname === '/translate') {
                    const from = url.searchParams.get('from') || 'auto';
                    const to = url.searchParams.get('to') || 'en';
                    const text = url.searchParams.get('text');

                    if (!text) {
                        res.statusCode = 400;
                        res.end('Missing text');
                        return;
                    }

                    try {
                        const translation = await this.googleTranslateGtx(text, from, to);
                        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
                        res.end(translation);
                    } catch (err) {
                        console.error(`[TRANSLATION-PROXY] Failed to translate "${text.substring(0, 30)}":`, err.message);
                        res.statusCode = 200; 
                        res.end(text);
                    }
                } else {
                    res.statusCode = 404;
                    res.end();
                }
            });

            this.proxyServer.listen(0, '127.0.0.1', () => {
                this.proxyPort = this.proxyServer.address().port;
                console.log(`[TRANSLATION-PROXY] Listening on port ${this.proxyPort}`);
                resolve(this.proxyPort);
            });
        });
    }

    async googleTranslateGtx(text, from, to) {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${from}&tl=${to}&dt=t&q=${encodeURIComponent(text)}`;
        
        return new Promise((resolve, reject) => {
            const req = https.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                },
                timeout: 5000
            }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    if (res.statusCode !== 200) {
                        reject(new Error(`Google API returned ${res.statusCode}`));
                        return;
                    }
                    try {
                        const json = JSON.parse(data);
                        if (json && Array.isArray(json[0])) {
                            let result = '';
                            for (const part of json[0]) {
                                if (Array.isArray(part) && part[0]) {
                                    result += part[0];
                                }
                            }
                            if (result) {
                                resolve(result);
                                return;
                            }
                        }
                        reject(new Error('Unexpected JSON structure from Google'));
                    } catch (e) {
                        reject(new Error(`Failed to parse Google response: ${e.message}`));
                    }
                });
            });
            req.on('timeout', () => { req.destroy(); reject(new Error('Google API request timed out')); });
            req.on('error', reject);
        });
    }

    async stopProxy() {
        if (this.proxyServer) {
            return new Promise((resolve) => {
                this.proxyServer.close(() => {
                    this.proxyServer = null;
                    this.proxyPort = 0;
                    console.log('[TRANSLATION-PROXY] Server stopped');
                    resolve();
                });
            });
        }
    }



    /**
     * Cancels an ongoing Deep-Sync job.
     */
    /**
     * Cancels an ongoing Deep-Sync job or removes it from queue.
     */
    cancelDeepSync(gameKey) {
        // If it's in the pending queue, remove it
        const queueIdx = this.syncQueue.findIndex(q => q.gameKey === gameKey);
        if (queueIdx !== -1) {
            this.syncQueue.splice(queueIdx, 1);
            this.syncQueue.forEach((item, index) => {
                this.broadcastStatus({
                    gameKey: item.gameKey,
                    status: 'sync-queued',
                    queuePosition: index + 1
                });
            });
            this.broadcastStatus({ gameKey, status: 'sync-cancelled' });
            console.log(`[DEEP-SYNC] Removed queued job for ${gameKey}`);
            return;
        }

        const job = this.jobs.get(gameKey);
        if (job) {
            job.status = 'stopped';
            this.jobs.delete(gameKey);
            if (this.activeJobKey === gameKey) {
                this.activeJobKey = null;
            }
            this.broadcastStatus({ gameKey, status: 'sync-cancelled' });
            console.log(`[DEEP-SYNC] Cancelled job for ${gameKey}`);
            
            // Process the next queued item
            setTimeout(() => this.processNextQueuedJob(), 500);
        }
    }

    /**
     * Queues a background "Deep-Sync" job for a game.
     */
    async queueDeepSync(gameKey, exePath, targetLang = 'en', gameName = 'Game') {
        if (this.jobs.has(gameKey) || this.syncQueue.some(q => q.gameKey === gameKey)) return;

        // If another job is currently active, queue this one
        if (this.activeJobKey && this.activeJobKey !== gameKey) {
            this.syncQueue.push({ gameKey, exePath, targetLang, gameName });
            console.log(`[DEEP-SYNC] Queued ${gameKey} (${gameName}) at position ${this.syncQueue.length}`);
            this.broadcastStatus({
                gameKey,
                status: 'sync-queued',
                queuePosition: this.syncQueue.length
            });
            return;
        }

        this.activeJobKey = gameKey;
        const exeDir = path.dirname(exePath);
        const engineType = await this.detectEngineSupport(exePath);

        if (!engineType || !this.extractors[engineType]) {
            console.log(`[DEEP-SYNC] No extractor for ${gameKey} (${engineType})`);
            this.activeJobKey = null;
            setTimeout(() => this.processNextQueuedJob(), 100);
            return;
        }

        console.log(`[DEEP-SYNC] Starting background extraction for ${gameKey}...`);
        this.broadcastStatus({ gameKey, status: 'sync-extracting' });
        const job = { total: 0, translated: 0, status: 'extracting', queue: [], rush: false, gameName };
        this.jobs.set(gameKey, job);

        try {
            const strings = await this.extractors[engineType].extract(exeDir);
            
            const dictPath = await this.getDictionaryPath(gameKey, exePath, targetLang);
            const existing = await this.loadExistingDictionary(dictPath);
            
            const untranslated = strings.filter(s => !existing.has(s));
            
            job.total = untranslated.length;
            job.queue = untranslated;
            job.status = 'translating';

            console.log(`[DEEP-SYNC] Extracted ${strings.length} strings, ${untranslated.length} need translation.`);
            
            if (untranslated.length > 0) {
                this.broadcastStatus({
                    gameKey,
                    status: 'syncing',
                    progress: 0,
                    translated: 0,
                    total: job.total
                });
                this.runTranslationLoop(gameKey, dictPath, targetLang);
            } else {
                job.status = 'complete';
                this.jobs.delete(gameKey);
                this.activeJobKey = null;
                this.broadcastStatus({ gameKey, status: 'synced' });
                setTimeout(() => this.processNextQueuedJob(), 500);
            }
        } catch (err) {
            console.error(`[DEEP-SYNC] Extraction failed for ${gameKey}:`, err);
            this.jobs.delete(gameKey);
            this.activeJobKey = null;
            this.broadcastStatus({ gameKey, status: 'sync-error' });
            setTimeout(() => this.processNextQueuedJob(), 500);
        }
    }

    /**
     * Recursively translates a batch of strings, splitting into smaller halves on mismatch or error (Divide-and-Conquer)
     */
    async translateBatchWithFallback(chunk, targetLang) {
        if (chunk.length === 0) return [];

        try {
            const combined = chunk.join('\n◆◆◆\n');
            const translated = await this.googleTranslateGtx(combined, 'ja', targetLang);
            const lines = translated.split(/[\r\n\s]*◆◆◆[\r\n\s]*/g).map(s => s.trim());

            if (lines.length === chunk.length) {
                return lines;
            }

            console.warn(`[DEEP-SYNC] Batch mismatch (${lines.length} vs ${chunk.length}). Splitting batch...`);
        } catch (e) {
            console.warn(`[DEEP-SYNC] Batch failed with: ${e.message}. Splitting batch...`);
        }

        if (chunk.length === 1) {
            try {
                const trans = await this.googleTranslateGtx(chunk[0], 'ja', targetLang);
                return [trans];
            } catch (e) {
                return [chunk[0]]; // fallback to original
            }
        }

        const mid = Math.floor(chunk.length / 2);
        const left = chunk.slice(0, mid);
        const right = chunk.slice(mid);

        await new Promise(r => setTimeout(r, 100));
        const leftTrans = await this.translateBatchWithFallback(left, targetLang);
        await new Promise(r => setTimeout(r, 100));
        const rightTrans = await this.translateBatchWithFallback(right, targetLang);

        return [...leftTrans, ...rightTrans];
    }

    async runTranslationLoop(gameKey, dictPath, targetLang) {
        const job = this.jobs.get(gameKey);
        if (!job || job.status !== 'translating') return;

        const { DictionaryLocker } = require('./dictionary-lock');
        while (job.queue.length > 0) {
            if (job.status === 'stopped') break;

            // Dynamically slice up to 40 strings while keeping the encoded URL payload safely under 1900 characters
            const chunk = [];
            let totalLength = 0;
            while (job.queue.length > 0 && chunk.length < 40) {
                const nextStr = job.queue[0];
                const nextLen = encodeURIComponent(nextStr).length + 8;
                if (totalLength + nextLen > 1900 && chunk.length > 0) {
                    break;
                }
                chunk.push(job.queue.shift());
                totalLength += nextLen;
            }

            try {
                // Call the new Divide-and-Conquer batch translator helper
                const lines = await this.translateBatchWithFallback(chunk, targetLang);

                const pairs = [];
                chunk.forEach((orig, idx) => {
                    const trans = (lines[idx] || '').trim();
                    if (trans && trans !== orig) {
                        pairs.push(`${orig}=${trans}`);
                    }
                });

                if (pairs.length > 0) {
                    await DictionaryLocker.executeLocked(async () => {
                        await this.appendToFileWithBom(dictPath, '\n' + pairs.join('\n'));
                    });
                }

                job.translated += chunk.length;
                this.broadcastStatus({
                    gameKey,
                    status: 'syncing',
                    progress: job.total > 0 ? job.translated / job.total : 0,
                    translated: job.translated,
                    total: job.total
                });

                await new Promise(r => setTimeout(r, job.rush ? 100 : 500));
            } catch (err) {
                console.error(`[DEEP-SYNC] Batch run failed for ${gameKey}:`, err.message);
                job.queue.push(...chunk);
                await new Promise(r => setTimeout(r, 5000));
            }
        }

        if (job.queue.length === 0) {
            job.status = 'complete';
            this.jobs.delete(gameKey);
            this.activeJobKey = null;
            this.broadcastStatus({ gameKey, status: 'synced' });
            console.log(`[DEEP-SYNC] Completed for ${gameKey}`);
            
            // Process the next queued item
            setTimeout(() => this.processNextQueuedJob(), 500);
        }
    }

    async processNextQueuedJob() {
        if (this.activeJobKey || this.syncQueue.length === 0) return;
        const next = this.syncQueue.shift();

        this.syncQueue.forEach((item, index) => {
            this.broadcastStatus({
                gameKey: item.gameKey,
                status: 'sync-queued',
                queuePosition: index + 1
            });
        });

        await this.queueDeepSync(next.gameKey, next.exePath, next.targetLang);
    }

    moveQueue(gameKey, direction) {
        const idx = this.syncQueue.findIndex(q => q.gameKey === gameKey);
        if (idx === -1) return;

        if (direction === 'up' && idx > 0) {
            const temp = this.syncQueue[idx];
            this.syncQueue[idx] = this.syncQueue[idx - 1];
            this.syncQueue[idx - 1] = temp;
        } else if (direction === 'down' && idx < this.syncQueue.length - 1) {
            const temp = this.syncQueue[idx];
            this.syncQueue[idx] = this.syncQueue[idx + 1];
            this.syncQueue[idx + 1] = temp;
        }

        console.log(`[DEEP-SYNC] Re-ordered queue. New order:`, this.syncQueue.map(q => q.gameName));

        // Broadcast to all queued jobs their new positions
        this.syncQueue.forEach((item, index) => {
            this.broadcastStatus({
                gameKey: item.gameKey,
                status: 'sync-queued',
                queuePosition: index + 1
            });
        });

        // Trigger a status broadcast for the active translating job so the UI queue list updates
        if (this.activeJobKey) {
            const job = this.jobs.get(this.activeJobKey);
            if (job) {
                this.broadcastStatus({
                    gameKey: this.activeJobKey,
                    status: 'syncing',
                    progress: job.total > 0 ? job.translated / job.total : 0,
                    translated: job.translated,
                    total: job.total
                });
            }
        }
    }

    async appendToFileWithBom(filePath, text) {
        const BOM = Buffer.from([0xEF, 0xBB, 0xBF]);
        try {
            const exists = fsSync.existsSync(filePath);
            if (!exists) {
                await fs.writeFile(filePath, Buffer.concat([BOM, Buffer.from(text, 'utf8')]));
            } else {
                await fs.appendFile(filePath, text, 'utf8');
            }
        } catch (e) {
            console.error(`[TRANSLATION] Failed to write to ${filePath}:`, e);
        }
    }

    async getDictionaryPath(gameKey, exePath, targetLang = 'en') {
        const detection = await this.detectUnityType(exePath);
        if (!detection) return null;
        const bundleId = `xunity-${detection.type}-${detection.arch}`;
        const targetDir = path.join(this.translatorsDir, bundleId);
        const dictDir = path.join(targetDir, 'Translation', targetLang, 'Text');
        await ensureDir(dictDir);
        return path.join(dictDir, `_AutoGeneratedTranslations.txt`);
    }

    async loadExistingDictionary(dictPath) {
        const seen = new Set();
        try {
            if (fsSync.existsSync(dictPath)) {
                const content = await fs.readFile(dictPath, 'utf8');
                content.split('\n').forEach(line => {
                    const idx = line.indexOf('=');
                    if (idx !== -1) seen.add(line.substring(0, idx).trim());
                });
            }
        } catch (e) {}
        return seen;
    }

    /**
     * Prepares the translator and blocks until ready.
     */
    async prepareTranslator(gameKey, exePath) {
        const detection = await this.detectUnityType(exePath);
        if (!detection) return false;

        const { type: unityType, arch } = detection;
        const exeDir = path.dirname(exePath);

        this.broadcastStatus({ gameKey, status: 'preparing', unityType, arch });
        
        const corePath = await this.ensureCoreBinaries(unityType, arch, (downloaded, total) => {
            this.broadcastStatus({ gameKey, status: 'downloading', progress: downloaded / total });
        });

        if (!corePath) {
            this.broadcastStatus({ gameKey, status: 'error' });
            return false;
        }

        this.broadcastStatus({ gameKey, status: 'extracting-binaries' });
        const port = await this.startProxy();
        await this.deployShims(exeDir, corePath, unityType, port);
        
        this.broadcastStatus({ gameKey, status: 'ready' });
        return true;
    }

    async removeTranslator(exePath) {
        const exeDir = path.dirname(exePath);
        const targets = ['winhttp.dll', 'doorstop_config.ini', 'BepInEx', 'AutoTranslator', 'Translation'];
        for (const name of targets) {
            try {
                const targetPath = path.join(exeDir, name);
                const stats = await fs.lstat(targetPath).catch(() => null);
                if (!stats) continue;
                if (stats.isDirectory() || stats.isSymbolicLink()) {
                    await fs.rm(targetPath, { recursive: true, force: true });
                } else {
                    await fs.unlink(targetPath);
                }
            } catch (e) {}
        }
    }


    async isRpgMaker(exeDir) {
        return fsSync.existsSync(path.join(exeDir, 'www', 'data')) || fsSync.existsSync(path.join(exeDir, 'data'));
    }

    async detectEngineSupport(exePath) {
        const exeDir = path.dirname(exePath);
        const isUnity = await this.detectUnityType(exePath);
        if (isUnity) return 'unity';
        const isRpg = await this.isRpgMaker(exeDir);
        if (isRpg) return 'rpg-maker';
        return null;
    }

    async detectUnityType(exePath) {
        const exeDir = path.dirname(exePath);
        const entries = await fs.readdir(exeDir).catch(() => []);
        const dataDir = entries.find(e => e.toLowerCase().endsWith('_data'));
        if (!dataDir) return null;

        let arch = 'x64';
        try {
            const handle = await fs.open(exePath, 'r');
            const { buffer: peOffsetBuf } = await handle.read(Buffer.alloc(4), 0, 4, 0x3c);
            const peOffset = peOffsetBuf.readUInt32LE(0);
            const { buffer: machineBuf } = await handle.read(Buffer.alloc(2), 0, 2, peOffset + 4);
            const machine = machineBuf.readUInt16LE(0);
            arch = machine === 0x8664 ? 'x64' : (machine === 0x14c ? 'x86' : 'x64');
            await handle.close();
        } catch (e) {}

        const managedDir = path.join(exeDir, dataDir, 'Managed');
        if (fsSync.existsSync(path.join(managedDir, 'mscorlib.dll'))) return { type: 'mono', arch };

        const il2cppDll = path.join(exeDir, 'GameAssembly.dll');
        if (fsSync.existsSync(il2cppDll)) return { type: 'il2cpp', arch };

        return null;
    }

    async ensureCoreBinaries(unityType, arch, onProgress) {
        const bundleId = `xunity-${unityType}-${arch}`;
        const targetDir = path.join(this.translatorsDir, bundleId);
        const markerFile = path.join(targetDir, '.ready');
        if (fsSync.existsSync(markerFile)) return targetDir;

        if (this.isDownloading) {
            while (this.isDownloading) await new Promise(r => setTimeout(r, 500));
            if (fsSync.existsSync(markerFile)) return targetDir;
        }

        this.isDownloading = true;
        try {
            await ensureDir(targetDir);
            const [bepinexRelease, xunityRelease] = await Promise.all([
                this.getLatestRelease(BEPINEX_RELEASES_API),
                this.getLatestRelease(XUNITY_RELEASES_API)
            ]);

            if (!bepinexRelease || !xunityRelease) {
                console.error('[TRANSLATION] Failed to retrieve translator release data from GitHub API.');
                this.broadcastStatus({ gameKey, status: 'error' });
                return null;
            }

            const bepSuffix = arch === 'x64' ? 'x64' : 'x86';
            const bepAsset = bepinexRelease.assets.find(a => a.name.includes(`win_${bepSuffix}`) && a.name.endsWith('.zip'));
            const bepZip = path.join(this.translatorsDir, `bep-${bepSuffix}.zip`);
            await downloadFile(bepAsset.browser_download_url, bepZip, 0, 30000, (d, t) => onProgress(d * 0.3, t), this.appVersion);
            await this.extractZip(bepZip, targetDir);
            await fs.unlink(bepZip);

            const xunKeyword = unityType === 'mono' ? 'BepInEx-5' : 'BepInEx-IL2CPP';
            const xunAsset = xunityRelease.assets.find(a => a.name.includes(xunKeyword) && a.name.endsWith('.zip'));
            const xunZip = path.join(this.translatorsDir, `xun-${unityType}.zip`);
            await downloadFile(xunAsset.browser_download_url, xunZip, 0, 30000, (d, t) => onProgress(t * 0.3 + d * 0.7, t), this.appVersion);
            await this.extractZip(xunZip, targetDir);
            await fs.unlink(xunZip);

            await fs.writeFile(markerFile, JSON.stringify({ arch, unityType, ts: new Date().toISOString() }));
            return targetDir;
        } catch (err) {
            console.error('[TRANSLATION] Setup failed:', err);
            return null;
        } finally {
            this.isDownloading = false;
        }
    }

    async getLatestRelease(apiUrl) {
        try {
            const buffer = await downloadBuffer(apiUrl, 0, 10000, null, this.appVersion);
            return JSON.parse(buffer.toString('utf8'));
        } catch (err) { return null; }
    }

    extractZip(zipPath, outDir) {
        return new Promise((resolve, reject) => {
            const cmd = `powershell.exe -NoProfile -Command "Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${outDir.replace(/'/g, "''")}' -Force"`;
            exec(cmd, (err) => err ? reject(err) : resolve());
        });
    }

    async deployShims(exeDir, corePath, unityType, proxyPort) {
        const sourceShim = path.join(corePath, 'winhttp.dll');
        if (fsSync.existsSync(sourceShim)) await fs.copyFile(sourceShim, path.join(exeDir, 'winhttp.dll'));

        const preloader = unityType === 'mono' ? 'BepInEx.Preloader.dll' : 'BepInEx.Preloader.Core.dll';
        const preloaderPath = path.join(corePath, 'BepInEx', 'core', preloader);
        
        const config = `[General]\nenabled=true\ntarget_assembly="${preloaderPath}"\nredirect_output_log=true\n`;
        await fs.writeFile(path.join(exeDir, 'doorstop_config.ini'), config);

        const configDir = path.join(corePath, 'BepInEx', 'config');
        await ensureDir(configDir);
        
        if (!fsSync.existsSync(path.join(configDir, 'BepInEx.cfg'))) {
            await fs.writeFile(path.join(configDir, 'BepInEx.cfg'), `[Logging.Console]\nEnabled = true\n[Logging.Disk]\nEnabled = true\n`);
        }

        const atConfig = `[Service]\nEndpoint=CustomTranslate\n[Custom]\nUrl=http://127.0.0.1:${proxyPort}/translate\n[General]\nLanguage=en\nFromLanguage=ja\n[Behaviour]\nEnableBatching=False\nEnableUIResizing=True\nMaxCharactersPerTranslation=200\nIgnoreWhitespaceInDialogue=True\nMinDialogueChars=1\nTextGetterCompatibilityMode=True\n`;
        await fs.writeFile(path.join(configDir, 'AutoTranslatorConfig.ini'), atConfig);

        const folders = ['BepInEx', 'AutoTranslator', 'Translation'];
        for (const folder of folders) {
            const source = path.join(corePath, folder);
            const target = path.join(exeDir, folder);
            if (!fsSync.existsSync(source)) await ensureDir(source);
            try {
                const stats = await fs.lstat(target).catch(() => null);
                if (stats) await fs.rm(target, { recursive: true, force: true });
                await fs.symlink(source, target, 'junction');
            } catch (e) {
                console.warn(`[TRANSLATION] Junction failed for ${folder}:`, e);
            }
        }
    }
}

module.exports = { TranslationService };

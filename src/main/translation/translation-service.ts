import path from 'node:path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { exec } from 'node:child_process';
import { downloadFile, downloadBuffer, ensureDir } from '../core/shared-io';
import { RpgMakerExtractor } from './extractors/rpg-maker';
import { UnityExtractor } from './extractors/unity';
import { TranslationExtractor } from './extractors/base';
import { WolfRpgExtractor } from './extractors/wolf-rpg';

const XUNITY_RELEASES_API = 'https://api.github.com/repos/bbepis/XUnity.AutoTranslator/releases/latest';
const BEPINEX_RELEASES_API = 'https://api.github.com/repos/BepInEx/BepInEx/releases/latest';

export interface TranslationJob {
    total: number;
    translated: number;
    status: 'extracting' | 'translating' | 'stopped' | 'complete';
    queue: string[];
    rush: boolean;
}

export interface TranslationServiceOptions {
    translatorsDir: string;
    appVersion: string;
    broadcastStatus: (data: any) => void;
}

export interface UnityDetection {
    type: 'mono' | 'il2cpp';
    arch: 'x64' | 'x86';
}

export class TranslationService {
    private translatorsDir: string;
    private appVersion: string;
    private broadcastStatus: (data: any) => void;
    private isDownloading: boolean = false;
    private proxyServer: http.Server | null = null;
    private proxyPort: number = 0;
    private extractors: Record<string, TranslationExtractor>;
    private jobs: Map<string, TranslationJob>;

    constructor({ translatorsDir, appVersion, broadcastStatus }: TranslationServiceOptions) {
        this.translatorsDir = translatorsDir;
        this.appVersion = appVersion;
        this.broadcastStatus = broadcastStatus;
        this.extractors = {
            'rpg-maker': new RpgMakerExtractor(),
            'unity': new UnityExtractor()
        };
        this.jobs = new Map<string, TranslationJob>();
    }

    /**
     * Starts the local translation proxy server.
     */
    async startProxy(): Promise<number> {
        if (this.proxyServer) return this.proxyPort;

        return new Promise<number>((resolve) => {
            this.proxyServer = http.createServer((req, res) => {
                const url = new URL(req.url || '', `http://${req.headers.host || '127.0.0.1'}`);
                if (url.pathname === '/translate') {
                    const from = url.searchParams.get('from') || 'auto';
                    const to = url.searchParams.get('to') || 'en';
                    const text = url.searchParams.get('text');

                    if (!text) {
                        res.statusCode = 400;
                        res.end('Missing text');
                        return;
                    }

                    this.googleTranslateGtx(text, from, to)
                        .then((translation) => {
                            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
                            res.end(translation);
                        })
                        .catch((err) => {
                            console.error(`[TRANSLATION-PROXY] Failed to translate "${text.substring(0, 30)}":`, err.message);
                            res.statusCode = 200; 
                            res.end(text);
                        });
                } else {
                    res.statusCode = 404;
                    res.end();
                }
            });

            this.proxyServer.listen(0, '127.0.0.1', () => {
                const address = this.proxyServer?.address();
                this.proxyPort = address && typeof address !== 'string' ? address.port : 0;
                console.log(`[TRANSLATION-PROXY] Listening on port ${this.proxyPort}`);
                resolve(this.proxyPort);
            });
        });
    }

    async googleTranslateGtx(text: string, from: string, to: string): Promise<string> {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${from}&tl=${to}&dt=t&q=${encodeURIComponent(text)}`;
        
        return new Promise<string>((resolve, reject) => {
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
                    } catch (e: any) {
                        reject(new Error(`Failed to parse Google response: ${e.message}`));
                    }
                });
            });
            req.on('timeout', () => { req.destroy(); reject(new Error('Google API request timed out')); });
            req.on('error', reject);
        });
    }

    async stopProxy(): Promise<void> {
        if (this.proxyServer) {
            return new Promise<void>((resolve) => {
                this.proxyServer!.close(() => {
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
    cancelDeepSync(gameKey: string): void {
        const job = this.jobs.get(gameKey);
        if (job) {
            job.status = 'stopped';
            this.jobs.delete(gameKey);
            this.broadcastStatus({ gameKey, status: 'sync-cancelled' });
            console.log(`[DEEP-SYNC] Cancelled job for ${gameKey}`);
        }
    }

    /**
     * Queues a background "Deep-Sync" job for a game.
     */
    async queueDeepSync(gameKey: string, exePath: string): Promise<void> {
        if (this.jobs.has(gameKey)) return;

        const exeDir = path.dirname(exePath);
        const detection = await this.detectUnityType(exePath);
        const engineType = detection ? 'unity' : (await this.isWolfRpg(exeDir) ? 'wolf-rpg' : (await this.isRpgMaker(exeDir) ? 'rpg-maker' : null));

        let extractor = engineType ? this.extractors[engineType] : null;
        if (engineType === 'wolf-rpg') {
            extractor = new WolfRpgExtractor(this.translatorsDir, gameKey);
        }

        if (!engineType || !extractor) {
            console.log(`[DEEP-SYNC] No extractor for ${gameKey} (${engineType})`);
            return;
        }

        console.log(`[DEEP-SYNC] Starting background extraction for ${gameKey}...`);
        this.broadcastStatus({ gameKey, status: 'sync-extracting' });
        const job: TranslationJob = { total: 0, translated: 0, status: 'extracting', queue: [], rush: false };
        this.jobs.set(gameKey, job);

        try {
            const strings = await extractor.extract(exeDir);
            
            const dictPath = await this.getDictionaryPath(gameKey, exePath);
            if (!dictPath) {
                throw new Error('Could not determine dictionary path');
            }
            const existing = await this.loadExistingDictionary(dictPath);
            
            const untranslated = strings.filter((s: string) => !existing.has(s));
            
            job.total = untranslated.length;
            job.queue = untranslated;
            job.status = 'translating';

            console.log(`[DEEP-SYNC] Extracted ${strings.length} strings, ${untranslated.length} need translation.`);
            
            if (untranslated.length > 0) {
                this.runTranslationLoop(gameKey, dictPath, exePath);
            } else {
                // If WOLF RPG has 0 untranslated strings, run apply translations just in case to verify
                if (engineType === 'wolf-rpg') {
                    try {
                        const translations = new Map<string, string>();
                        // Load from our dictionary TXT file
                        const lines = await fs.readFile(dictPath, 'utf8').catch(() => '');
                        lines.split('\n').forEach(line => {
                            const idx = line.indexOf('=');
                            if (idx !== -1) {
                                translations.set(line.substring(0, idx).trim(), line.substring(idx + 1).trim());
                            }
                        });
                        const wolfExtractor = new WolfRpgExtractor(this.translatorsDir, gameKey);
                        await wolfExtractor.applyTranslations(exeDir, translations);
                    } catch (e) {}
                }
                job.status = 'complete';
                this.broadcastStatus({ gameKey, status: 'synced' });
            }
        } catch (err: any) {
            console.error(`[DEEP-SYNC] Extraction failed for ${gameKey}:`, err);
            this.jobs.delete(gameKey);
            this.broadcastStatus({ gameKey, status: 'sync-error', error: err.message });
        }
    }

    async runTranslationLoop(gameKey: string, dictPath: string, exePath?: string): Promise<void> {
        const job = this.jobs.get(gameKey);
        if (!job || job.status !== 'translating') return;

        const batchSize = 15;
        while (job.queue.length > 0) {
            if ((job.status as string) === 'stopped') break;

            const chunk = job.queue.splice(0, batchSize);
            try {
                const combined = chunk.join('\n');
                const translated = await this.googleTranslateGtx(combined, 'ja', 'en');
                let lines = translated.split('\n');

                if (lines.length !== chunk.length) {
                    console.warn(`[DEEP-SYNC] Line count mismatch during batch translation. Falling back to individual translation.`);
                    lines = [];
                    for (const orig of chunk) {
                        try {
                            const trans = await this.googleTranslateGtx(orig, 'ja', 'en');
                            lines.push(trans);
                        } catch (e) {
                            lines.push(orig);
                        }
                    }
                }

                const pairs: string[] = [];
                chunk.forEach((orig, idx) => {
                    const trans = (lines[idx] || '').trim();
                    if (trans && trans !== orig) {
                        pairs.push(`${orig}=${trans}`);
                    }
                });

                if (pairs.length > 0) {
                    await this.appendToFileWithBom(dictPath, '\n' + pairs.join('\n'));
                }

                job.translated += chunk.length;
                this.broadcastStatus({
                    gameKey,
                    status: 'syncing',
                    progress: job.total > 0 ? job.translated / job.total : 0
                });

                await new Promise(r => setTimeout(r, job.rush ? 200 : 1500));
            } catch (err: any) {
                console.error(`[DEEP-SYNC] Batch failed for ${gameKey}:`, err.message);
                job.queue.push(...chunk);
                await new Promise(r => setTimeout(r, 5000));
            }
        }

        if (job.queue.length === 0) {
            if (exePath) {
                const exeDir = path.dirname(exePath);
                if (await this.isWolfRpg(exeDir)) {
                    this.broadcastStatus({ gameKey, status: 'sync-extracting' });
                    try {
                        const translations = new Map<string, string>();
                        // Load from our dictionary TXT file
                        const lines = await fs.readFile(dictPath, 'utf8').catch(() => '');
                        lines.split('\n').forEach(line => {
                            const idx = line.indexOf('=');
                            if (idx !== -1) {
                                translations.set(line.substring(0, idx).trim(), line.substring(idx + 1).trim());
                            }
                        });
                        const extractor = new WolfRpgExtractor(this.translatorsDir, gameKey);
                        await extractor.applyTranslations(exeDir, translations);
                        console.log(`[DEEP-SYNC] Successfully compiled Wolf RPG translations for ${gameKey}`);
                    } catch (err) {
                        console.error('[DEEP-SYNC] Failed to apply Wolf RPG patches:', err);
                    }
                }
            }
            job.status = 'complete';
            this.broadcastStatus({ gameKey, status: 'synced' });
            console.log(`[DEEP-SYNC] Completed for ${gameKey}`);
        }
    }

    async appendToFileWithBom(filePath: string, text: string): Promise<void> {
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

    async getDictionaryPath(gameKey: string, exePath: string): Promise<string | null> {
        const exeDir = path.dirname(exePath);
        if (await this.isWolfRpg(exeDir)) {
            const sanitizedKey = gameKey.replace(/:/g, '_');
            const patchDir = path.join(this.translatorsDir, 'patches', sanitizedKey);
            await ensureDir(patchDir);
            return path.join(patchDir, 'wolf_dictionary.txt');
        }

        const detection = await this.detectUnityType(exePath);
        if (!detection) return null;
        const bundleId = `xunity-${detection.type}-${detection.arch}`;
        const targetDir = path.join(this.translatorsDir, bundleId);
        const dictDir = path.join(targetDir, 'Translation', 'en', 'Text');
        await ensureDir(dictDir);
        return path.join(dictDir, `_AutoGeneratedTranslations.txt`);
    }

    async loadExistingDictionary(dictPath: string): Promise<Set<string>> {
        const seen = new Set<string>();
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
    async prepareTranslator(gameKey: string, exePath: string): Promise<boolean> {
        const detection = await this.detectUnityType(exePath);
        if (!detection) return false;

        const { type: unityType, arch } = detection;
        const exeDir = path.dirname(exePath);

        this.broadcastStatus({ gameKey, status: 'preparing', unityType, arch });
        
        const corePath = await this.ensureCoreBinaries(gameKey, unityType, arch, (downloaded, total) => {
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

    async removeTranslator(exePath: string): Promise<void> {
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

    async detectEngineSupport(exePath: string): Promise<string | null> {
        const exeDir = path.dirname(exePath);
        const detection = await this.detectUnityType(exePath);
        if (detection) return 'unity';
        if (await this.isWolfRpg(exeDir)) return 'wolf-rpg';
        if (await this.isRpgMaker(exeDir)) return 'rpg-maker';
        return null;
    }

    async checkIsWolfRpgInternal(exeDir: string): Promise<boolean> {
        const dataDir = path.join(exeDir, 'Data');
        if (!fsSync.existsSync(dataDir)) return false;
        try {
            const files = await fs.readdir(dataDir);
            return files.some(f => f.toLowerCase().endsWith('.wolf') || ['basicdata', 'mapdata'].includes(f.toLowerCase()));
        } catch {
            return false;
        }
    }

    async isWolfRpg(exeDir: string): Promise<boolean> {
        // WOLF RPG translation is temporarily disabled due to rewolf-trans parser instability with v3.x games.
        return false;
    }

    async isRpgMaker(exeDir: string): Promise<boolean> {
        if (await this.checkIsWolfRpgInternal(exeDir)) return false;
        return fsSync.existsSync(path.join(exeDir, 'www', 'data')) || fsSync.existsSync(path.join(exeDir, 'data'));
    }

    async detectUnityType(exePath: string): Promise<UnityDetection | null> {
        const exeDir = path.dirname(exePath);
        const entries = await fs.readdir(exeDir).catch(() => []);
        const dataDir = entries.find(e => e.toLowerCase().endsWith('_data'));
        if (!dataDir) return null;

        let arch: 'x64' | 'x86' = 'x64';
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

    async ensureCoreBinaries(
        gameKey: string,
        unityType: 'mono' | 'il2cpp',
        arch: 'x64' | 'x86',
        onProgress: (downloaded: number, total: number) => void
    ): Promise<string | null> {
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
            const bepAsset = bepinexRelease.assets.find((a: any) => a.name.includes(`win_${bepSuffix}`) && a.name.endsWith('.zip'));
            const bepZip = path.join(this.translatorsDir, `bep-${bepSuffix}.zip`);
            await downloadFile(bepAsset.browser_download_url, bepZip, 0, 30000, (d, t) => onProgress(d * 0.3, t), this.appVersion);
            await this.extractZip(bepZip, targetDir);
            await fs.unlink(bepZip);

            const xunKeyword = unityType === 'mono' ? 'BepInEx-5' : 'BepInEx-IL2CPP';
            const xunAsset = xunityRelease.assets.find((a: any) => a.name.includes(xunKeyword) && a.name.endsWith('.zip'));
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

    async getLatestRelease(apiUrl: string): Promise<any> {
        try {
            const buffer = await downloadBuffer(apiUrl, 0, 10000, null, this.appVersion);
            return JSON.parse(buffer.toString('utf8'));
        } catch (err) { return null; }
    }

    extractZip(zipPath: string, outDir: string): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            const cmd = `powershell.exe -NoProfile -Command "Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${outDir.replace(/'/g, "''")}' -Force"`;
            exec(cmd, (err) => err ? reject(err) : resolve());
        });
    }

    async deployShims(exeDir: string, corePath: string, unityType: 'mono' | 'il2cpp', proxyPort: number): Promise<void> {
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

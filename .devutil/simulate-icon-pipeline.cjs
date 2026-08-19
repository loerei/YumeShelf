#!/usr/bin/env node

/**
 * YumeShelf Icon Pipeline Simulation & Benchmark Utility
 *
 * Simulates the complete 5-Branch Icon Resolution Pipeline against a target directory
 * to measure resolution speed, Worker extraction reliability, and disk cache hit rates.
 *
 * Usage:
 *   node .devutil/simulate-icon-pipeline.cjs "<target-directory>" [--bypass-cache] [--clear-cache]
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { fork } = require('node:child_process');

const args = process.argv.slice(2);
const BYPASS_CACHE = args.includes('--bypass-cache') || args.includes('--no-cache');
const CLEAR_CACHE = args.includes('--clear-cache');
const pathArgs = args.filter((a) => !a.startsWith('--'));
const TARGET_ROOT = pathArgs[0] ? path.resolve(pathArgs[0]) : path.resolve(process.cwd());

const EXECUTABLE_BLACKLIST = ['crashhandler', 'notification', 'unins', 'updater', 'ffmpeg', 'dnspy', 'gifski', 'nircmd', 'unitycrash'];
const WRAPPER_DIRECTORY_NAMES = new Set(['app', 'bin', 'binaries', 'data', 'game', 'release', 'runtime', 'win64', 'windows', 'x64', 'x86']);

function normalizePathForComparison(targetPath) {
    return path.resolve(String(targetPath || '')).replace(/[\\/]+/g, '\\').toLowerCase();
}

function getLeafFolderName(folderPath) {
    let normalized = String(folderPath || '');
    while (normalized.endsWith('\\') || normalized.endsWith('/')) {
        normalized = normalized.slice(0, -1);
    }
    return path.basename(normalized);
}

function pickPreferredExecutable(currentPath, executableEntries) {
    const folderName = path.basename(currentPath).toLowerCase();
    const nonConfigEntries = executableEntries.filter((entry) => {
        const name = entry.name.toLowerCase();
        return name !== 'config.exe' && name !== 'setup.exe' && name !== 'setting.exe' && name !== 'settings.exe' && name !== 'configure.exe';
    });
    const candidates = nonConfigEntries.length > 0 ? nonConfigEntries : executableEntries;
    const preferred = candidates.find((entry) => entry.name.toLowerCase().includes(folderName))
        || candidates.find((entry) => entry.name.toLowerCase() === 'game.exe')
        || candidates[0];
    return preferred ? path.join(currentPath, preferred.name) : null;
}

function shouldPromoteWrapperDirectory(currentPath, childFolderPath, libraryPath) {
    if (normalizePathForComparison(currentPath) === normalizePathForComparison(libraryPath)) return false;
    return WRAPPER_DIRECTORY_NAMES.has(getLeafFolderName(childFolderPath).toLowerCase());
}

async function collectGameCandidates(libraryPath, currentPath, depth, maxDepth) {
    let entries;
    try {
        entries = await fs.promises.readdir(currentPath, { withFileTypes: true });
    } catch {
        return [];
    }

    const executableEntries = entries
        .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.exe'))
        .filter((entry) => !EXECUTABLE_BLACKLIST.some((token) => entry.name.toLowerCase().includes(token)));

    if (executableEntries.length > 0) {
        const exePath = pickPreferredExecutable(currentPath, executableEntries);
        return exePath ? [{ folderPath: currentPath, exePath }] : [];
    }

    if (depth >= maxDepth) return [];

    const results = [];
    for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const childPath = path.join(currentPath, entry.name);
        const childResults = await collectGameCandidates(libraryPath, childPath, depth + 1, maxDepth);

        if (childResults.length === 1 && shouldPromoteWrapperDirectory(currentPath, childResults[0].folderPath, libraryPath)) {
            results.push({
                folderPath: currentPath,
                exePath: childResults[0].exePath
            });
        } else {
            results.push(...childResults);
        }
    }
    return results;
}

function guessGameName(folderPath, exePath, libraryPath) {
    const rel = path.relative(libraryPath, folderPath);
    const topName = rel.split(path.sep)[0] || path.basename(folderPath);
    const id = (topName.match(/RJ\d{6,8}/i) || [])[0] || (topName.match(/RY-RJ\d{6,8}/i) || [])[0];
    const clean = (s) => s
        .replace(/\[.*?\]|\(.*?\)/g, '')
        .replace(/[_-]/g, ' ')
        .trim()
        .replace(/\s+/g, ' ');
    return (id ? `[${id[0].toUpperCase()}] ` : '') + (clean(path.basename(path.dirname(exePath))) || clean(topName));
}

let findLocalGameImage = null;
try {
    const serviceModule = require('../dist/main/icon-pipeline/service');
    findLocalGameImage = serviceModule.findLocalGameImage;
} catch {
    const LOCAL_IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp'];
    const LOCAL_IMAGE_CANDIDATE_PATTERNS = [
        (dir, ext) => path.join(dir, `icon.${ext}`),
        (dir, ext) => path.join(dir, `cover.${ext}`),
        (dir, ext) => path.join(dir, `folder.${ext}`),
        (dir, ext) => path.join(dir, 'icon', `icon.${ext}`),
        (dir, ext) => path.join(dir, 'icon', `cover.${ext}`),
        (dir, ext) => path.join(dir, 'www', 'icon', `icon.${ext}`)
    ];
    findLocalGameImage = (targetPath) => {
        const dir = path.dirname(targetPath);
        for (const pattern of LOCAL_IMAGE_CANDIDATE_PATTERNS) {
            for (const ext of LOCAL_IMAGE_EXTENSIONS) {
                const imgPath = pattern(dir, ext);
                if (fs.existsSync(imgPath)) return { imgPath, ext };
            }
        }
        return null;
    };
}

function checkLocalImage(targetPath) {
    const result = findLocalGameImage(targetPath);
    if (result) {
        return {
            found: true,
            imagePath: result.imgPath,
            size: fs.statSync(result.imgPath).size
        };
    }
    return { found: false };
}

function wipeCacheFiles() {
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    const possibleAppDirs = ['YumeShelfDev', 'YumeShelf'];
    let clearedCount = 0;

    for (const appDirName of possibleAppDirs) {
        const cacheDir = path.join(appData, appDirName, 'high-res-icon-cache');
        if (fs.existsSync(cacheDir)) {
            try {
                fs.rmSync(cacheDir, { recursive: true, force: true });
                console.log(`[SIMULATOR] Cleared disk cache directory: ${cacheDir}`);
                clearedCount++;
            } catch (err) {
                console.warn(`[SIMULATOR] Failed to remove cache directory ${cacheDir}:`, err.message);
            }
        }
    }
    return clearedCount;
}

function checkHighResCache(targetPath) {
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    const possibleAppDirs = ['YumeShelfDev', 'YumeShelf'];

    for (const appDirName of possibleAppDirs) {
        const cacheDir = path.join(appData, appDirName, 'high-res-icon-cache');
        const indexPath = path.join(cacheDir, 'index.json');
        if (fs.existsSync(indexPath)) {
            try {
                const indexData = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
                const normalizedPath = path.win32.normalize(targetPath);
                const stats = fs.statSync(normalizedPath);
                const fingerprint = crypto
                    .createHash('sha1')
                    .update(`${normalizedPath}:${stats.size}:${stats.mtimeMs}`)
                    .digest('hex');

                const entry = indexData.entriesByPath?.[normalizedPath];
                if (entry && entry.fingerprint === fingerprint) {
                    const cacheFile = path.join(cacheDir, entry.fileName);
                    if (fs.existsSync(cacheFile)) {
                        return {
                            found: true,
                            fileName: entry.fileName,
                            size: fs.statSync(cacheFile).size
                        };
                    }
                }
            } catch (_err) {
            }
        }
    }
    return { found: false };
}

function createWorkerClient(electronExePath, workerScriptPath, extPath) {
    let worker = null;
    let requestId = 0;
    const pending = new Map();
    let isReady = false;
    const readyWaiters = [];

    function startWorker() {
        worker = fork(workerScriptPath, [], {
            execPath: electronExePath,
            env: {
                ...process.env,
                ELECTRON_RUN_AS_NODE: '1'
            },
            stdio: ['pipe', 'pipe', 'pipe', 'ipc']
        });

        worker.on('message', (msg) => {
            if (msg?.type === 'ready') {
                isReady = true;
                while (readyWaiters.length) readyWaiters.shift()();
                return;
            }
            if (msg?.id && pending.has(msg.id)) {
                const cb = pending.get(msg.id);
                pending.delete(msg.id);
                cb(msg);
            }
        });

        worker.on('exit', (code) => {
            isReady = false;
            for (const [, cb] of pending) {
                cb({ error: `Worker process exited with code ${code}` });
            }
            pending.clear();
        });
    }

    startWorker();

    return {
        async extract(targetPath) {
            if (!isReady) {
                await new Promise((r) => readyWaiters.push(r));
            }
            const id = ++requestId;
            return new Promise((resolve) => {
                pending.set(id, resolve);
                worker.send({
                    id,
                    type: 'extract',
                    path: targetPath,
                    extPath
                });
            });
        },
        kill() {
            if (worker) worker.kill();
        }
    };
}

async function runSimulator() {
    console.log('================================================================');
    console.log(' YumeShelf Icon Pipeline Simulation & Benchmark Utility');
    console.log(` Target Directory : ${TARGET_ROOT}`);
    console.log(` Bypass Cache     : ${BYPASS_CACHE}`);
    console.log(` Clear Cache Disk : ${CLEAR_CACHE}`);
    console.log('================================================================\n');

    if (!fs.existsSync(TARGET_ROOT)) {
        console.error(`Error: Target directory does not exist: ${TARGET_ROOT}`);
        process.exit(1);
    }

    if (CLEAR_CACHE) {
        wipeCacheFiles();
    }

    const electronExe = path.join(__dirname, '..', 'node_modules', '.pnpm', 'electron@29.4.6', 'node_modules', 'electron', 'dist', 'electron.exe');
    const workerScript = path.join(__dirname, '..', 'src', 'icon-extractor.js');
    const extModulePath = path.join(__dirname, '..', 'node_modules', 'extract-file-icon');

    console.log(`[SIMULATOR] Spawning Electron extraction worker...`);
    const workerClient = createWorkerClient(electronExe, workerScript, extModulePath);

    console.log('[SIMULATOR] Scanning for game executables (max depth: 5)...');
    const games = await collectGameCandidates(TARGET_ROOT, TARGET_ROOT, 0, 5);
    console.log(`[SIMULATOR] Discovered ${games.length} valid game executables.\n`);

    if (games.length === 0) {
        console.log('No game candidates found. Try running against a directory containing games.');
        workerClient.kill();
        return;
    }

    const results = [];
    const stats = {
        branchA: 0,
        branchB: 0,
        branchC: 0,
        branchD: 0,
        branchE: 0
    };

    let totalDurationMs = 0;

    for (let i = 0; i < games.length; i++) {
        const g = games[i];
        const name = guessGameName(g.folderPath, g.exePath, TARGET_ROOT);
        const relDir = path.relative(TARGET_ROOT, g.folderPath);
        const exeFile = path.basename(g.exePath);

        const start = Date.now();
        const localImg = checkLocalImage(g.exePath);
        if (localImg.found) {
            stats.branchA++;
            results.push({
                index: i + 1,
                name,
                relDir,
                exeFile,
                branch: 'Branch A: local-image',
                detail: `Local file: ${path.basename(localImg.imagePath)} (${(localImg.size / 1024).toFixed(1)} KB)`
            });
            continue;
        }

        if (!BYPASS_CACHE) {
            const cached = checkHighResCache(g.exePath);
            if (cached.found) {
                stats.branchB++;
                results.push({
                    index: i + 1,
                    name,
                    relDir,
                    exeFile,
                    branch: 'Branch B: cached-high-res',
                    detail: `Disk cache: ${cached.fileName} (${(cached.size / 1024).toFixed(1)} KB)`
                });
                continue;
            }
        }

        const extractRes = await workerClient.extract(g.exePath);
        const duration = Date.now() - start;
        totalDurationMs += duration;

        if (extractRes?.base64) {
            const byteLen = Buffer.from(extractRes.base64, 'base64').length;
            stats.branchC++;
            results.push({
                index: i + 1,
                name,
                relDir,
                exeFile,
                branch: 'Branch C: extracted-high-res',
                detail: `Live 256px extraction (${(byteLen / 1024).toFixed(1)} KB, ${extractRes.meta?.durationMs || duration}ms, ${extractRes.meta?.suspicion || 'ok'})`
            });
            continue;
        }

        stats.branchD++;
        results.push({
            index: i + 1,
            name,
            relDir,
            exeFile,
            branch: 'Branch D: app-file-icon-fallback',
            detail: '256px extraction yielded empty buffer, fell back to Electron getFileIcon (32px/48px)'
        });
    }

    workerClient.kill();

    console.log('----------------------------------------------------------------');
    console.log(` DETAILED RESULTS PER GAME (${BYPASS_CACHE ? 'COLD EXTRACTION MODE' : 'WARM / CACHED MODE'})`);
    console.log('----------------------------------------------------------------');
    for (const r of results) {
        console.log(`[#${String(r.index).padStart(2, '0')}] ${r.name}`);
        console.log(`     Directory : ${r.relDir}`);
        console.log(`     Executable: ${r.exeFile}`);
        console.log(`     Pipeline  : ${r.branch}`);
        console.log(`     Details   : ${r.detail}\n`);
    }

    console.log('================================================================');
    console.log(' ICON PIPELINE DISTRIBUTION METRICS');
    console.log('================================================================');
    console.log(`Total Games Scanned: ${games.length}`);
    console.log(`- Branch A (local-image)            : ${String(stats.branchA).padStart(2, ' ')} games (${((stats.branchA / games.length) * 100).toFixed(1)}%)`);
    console.log(`- Branch B (cached-high-res)        : ${String(stats.branchB).padStart(2, ' ')} games (${((stats.branchB / games.length) * 100).toFixed(1)}%)`);
    console.log(`- Branch C (extracted-high-res)     : ${String(stats.branchC).padStart(2, ' ')} games (${((stats.branchC / games.length) * 100).toFixed(1)}%)`);
    console.log(`- Branch D (app-file-icon-fallback) : ${String(stats.branchD).padStart(2, ' ')} games (${((stats.branchD / games.length) * 100).toFixed(1)}%)`);
    console.log(`- Branch E (placeholder-fallback)   : ${String(stats.branchE).padStart(2, ' ')} games (${((stats.branchE / games.length) * 100).toFixed(1)}%)`);
    if (stats.branchC > 0) {
        console.log(`\nAverage Live Extraction Latency: ${(totalDurationMs / stats.branchC).toFixed(1)} ms/game`);
    }
    console.log('================================================================\n');
}

runSimulator().catch((err) => {
    console.error('[SIMULATOR] Fatal Error:', err);
    process.exit(1);
});

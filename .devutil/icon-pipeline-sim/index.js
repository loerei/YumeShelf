#!/usr/bin/env electron

/**
 * YumeShelf Headless Icon Pipeline Simulator & Verification Tool
 *
 * Runs inside the Electron runtime to verify icon extraction, transparent border cropping,
 * ICO transcoding fallbacks, and disk caching using Chromium's real C++ nativeImage engine.
 *
 * Modes:
 *   1. Synthetic Mode (Default):
 *      electron .devutil/icon-pipeline-sim
 *      Generates mock games in os.tmpdir() (PNG PE, DIB PE, local art, shell fallback),
 *      runs protocol resolution, validates resolution/quality invariants, and cleans up.
 *
 *   2. Target Directory Mode:
 *      electron .devutil/icon-pipeline-sim "D:/Games/H Games"
 *      Scans the provided directory and tests every detected game candidate.
 */

const { app, nativeImage } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const os = require('node:os');

const { createSyntheticGameLibrary } = require('./synthetic-fixtures');

// Find user arguments, ignoring electron executable, script name, and flags
const rawArgs = process.argv.slice(1);
const userArgs = rawArgs.filter((arg) => {
    const lower = arg.toLowerCase();
    return !lower.includes('icon-pipeline-sim') &&
        !lower.endsWith('electron') &&
        !lower.endsWith('electron.exe') &&
        !lower.startsWith('--');
});

const customTargetDir = userArgs[0] ? path.resolve(process.cwd(), userArgs[0]) : null;

function decodeBufferToNativeImage(buf, mimeType) {
    if (!buf || buf.length === 0) return null;
    let img = nativeImage.createFromBuffer(buf);
    if (!img.isEmpty()) return img;

    const isIco = mimeType === 'image/x-icon' || (buf.length > 2 && buf.readUInt16LE(2) === 1);
    const ext = isIco ? 'ico' : 'png';
    const tempPath = path.join(os.tmpdir(), `sim-decode-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`);
    try {
        fsSync.writeFileSync(tempPath, buf);
        img = nativeImage.createFromPath(tempPath);
        if (!img.isEmpty()) return img;
    } catch {} finally {
        try { fsSync.unlinkSync(tempPath); } catch {}
    }
    return null;
}

app.whenReady().then(async () => {
    console.log('========================================================================');
    console.log(' YUMESHELF ICON PIPELINE RUNTIME SIMULATOR (ELECTRON ENGINE)');
    console.log('========================================================================\n');

    let serviceModule;
    let cropperModule;
    let scannerModule;
    try {
        serviceModule = require('../../dist/main/icon-pipeline/service');
        cropperModule = require('../../dist/main/icon-pipeline/cropper');
        scannerModule = require('../../dist/main/library-state/scanner');
    } catch (err) {
        console.error('[SIMULATOR] Error: compiled artifacts not found in dist/main/. Run "npm run build:main" first.');
        console.error(err.message);
        process.exit(1);
    }

    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'yumeshelf-sim-run-'));
    const userDataDir = path.join(tempRoot, 'user-data');
    await fs.mkdir(userDataDir, { recursive: true });

    let candidates = [];
    let isSynthetic = false;

    if (customTargetDir) {
        console.log(`[MODE] Target Directory Mode: "${customTargetDir}"\n`);
        try {
            const rawCandidates = await scannerModule.collectGameCandidates(fs, customTargetDir, customTargetDir, 0, 5);
            candidates = scannerModule.dedupeCandidates(rawCandidates);
        } catch (err) {
            console.error(`[SIMULATOR] Failed to scan directory "${customTargetDir}":`, err.message);
            await fs.rm(tempRoot, { recursive: true, force: true }).catch(() => {});
            process.exit(1);
        }
        if (candidates.length === 0) {
            console.log(`[SIMULATOR] No game candidates found in "${customTargetDir}".`);
            await fs.rm(tempRoot, { recursive: true, force: true }).catch(() => {});
            process.exit(0);
        }
    } else {
        isSynthetic = true;
        console.log('[MODE] Synthetic Fixture Mode (os.tmpdir)\n');
        const syntheticGamesDir = path.join(tempRoot, 'synthetic-games');
        candidates = await createSyntheticGameLibrary(syntheticGamesDir);
    }

    let protocolHandler = null;
    const mockApp = {
        getPath: () => userDataDir,
        getAppPath: () => path.resolve(__dirname, '../..'),
        getFileIcon: (p, opt) => app.getFileIcon(p, opt)
    };

    const pipeline = serviceModule.createIconPipeline({
        app: mockApp,
        protocol: {
            handle: (_scheme, handler) => {
                protocolHandler = handler;
            }
        },
        ipcMain: { handle: () => {} },
        sourceRootDir: path.resolve(__dirname, '../..')
    });
    pipeline.registerProtocolHandler();

    console.log(`Evaluating ${candidates.length} game candidate(s)...\n`);
    let issueCount = 0;

    for (let i = 0; i < candidates.length; i++) {
        const game = candidates[i];
        const exePath = game.exePath;
        const gameName = game.name || path.basename(game.folderPath || exePath);

        const startTime = Date.now();
        const req = new Request(`game-icon://app?path=${encodeURIComponent(exePath)}`);
        const resp = await protocolHandler(req);
        const duration = Date.now() - startTime;

        const mime = resp.headers.get('Content-Type');
        const buf = Buffer.from(await resp.arrayBuffer());
        const img = decodeBufferToNativeImage(buf, mime);
        const size = img ? img.getSize() : { width: 0, height: 0 };
        const summary = img ? cropperModule.summarizeNativeImageForDebug(img) : null;

        const issues = [];
        if (resp.status !== 200) {
            issues.push(`HTTP status was ${resp.status}`);
        }
        if (!img || img.isEmpty()) {
            issues.push('Image decoding failed (empty image)');
        }

        if (isSynthetic) {
            if (game.expectedType === 'pe-png' && (size.width < 256 || size.height < 256)) {
                issues.push(`Expected 256x256 PNG icon, got ${size.width}x${size.height}`);
            }
            if (game.expectedType === 'pe-dib' && (size.width < 256 || size.height < 256)) {
                issues.push(`Expected 256x256 DIB icon via fallback, got ${size.width}x${size.height} (downgraded)`);
            }
        }

        const status = issues.length === 0 ? 'OK' : 'FAIL';
        if (issues.length > 0) issueCount++;

        console.log(`[${status}] [#${i + 1}/${candidates.length}] ${gameName} (${duration}ms)`);
        console.log(`       Size: ${size.width}x${size.height} | MIME: ${mime} | Bytes: ${buf.length}`);
        if (summary && summary.opaqueBounds) {
            console.log(`       Content bounds: ${summary.opaqueBounds.width}x${summary.opaqueBounds.height} (offset ${summary.opaqueBounds.minX},${summary.opaqueBounds.minY})`);
        }
        if (issues.length > 0) {
            issues.forEach((iss) => console.log(`       >>> ISSUE: ${iss}`));
        }
    }

    // Test warm cache hit latency
    console.log('\nTesting warm cache re-queries...');
    await pipeline.flushCache();
    let warmHits = 0;
    for (const game of candidates) {
        const req = new Request(`game-icon://app?path=${encodeURIComponent(game.exePath)}`);
        const resp = await protocolHandler(req);
        if (resp.status === 200) warmHits++;
    }
    console.log(`Warm cache hit count: ${warmHits}/${candidates.length}`);

    console.log('\n========================================================================');
    console.log(` SUMMARY: Scanned ${candidates.length} game(s). Issues detected: ${issueCount}`);
    console.log('========================================================================\n');

    await fs.rm(tempRoot, { recursive: true, force: true }).catch(() => {});

    process.exit(issueCount > 0 ? 1 : 0);
});

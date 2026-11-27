#!/usr/bin/env node

/**
 * YumeShelf Library Save Probe Utility
 *
 * Hooks directly into YumeShelf's production game scanner, save-folder resolver,
 * SaveEditorService, and SaveEditorIpcController to scan a target library directory,
 * discover all save files per game, and attempt to load (and optionally test write
 * round-trip on isolated temp copies) every save file.
 *
 * Usage:
 *   node .devutil/probe-library-saves/index.cjs "<library-path>" [--probe-write] [--max-depth=5] [--rebuild] [--json] [--verbose]
 */

const fs = require('node:fs');
const fsPromises = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execSync } = require('node:child_process');

const QUALIFIED_KEY_REGEX = /^[a-zA-Z0-9_-]+:[^\0\r\n\t]+$/;

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
    console.log([
        'Usage: node .devutil/probe-library-saves/index.cjs "<library-path>" [options]',
        '',
        'Options:',
        '  --probe-write    Copy each save to a temp dir and test applySaveUpdates + reload round-trip (never touches real saves)',
        '  --max-depth=<n>  Max folder scan depth (default: 5)',
        '  --rebuild        Rebuild dist/main before running',
        '  --json           Output JSON report',
        '  --verbose, -v    Print every save file result (including successes)',
        '  --help, -h       Show this help message',
    ].join('\n'));
    process.exit(0);
}

const JSON_OUTPUT = args.includes('--json');
const VERBOSE = args.includes('--verbose') || args.includes('-v');
const SHOULD_REBUILD = args.includes('--rebuild');
const PROBE_WRITE = args.includes('--probe-write');
const maxDepthArg = args.find((a) => a.startsWith('--max-depth='));
const MAX_DEPTH = maxDepthArg ? parseInt(maxDepthArg.split('=')[1], 10) : 5;

const pathArgs = args.filter((a) => !a.startsWith('-'));
if (!pathArgs[0]) {
    console.error('[ERROR] Missing required <library-path> argument.');
    console.error('Usage: node .devutil/probe-library-saves/index.cjs "<library-path>" [--probe-write] [--max-depth=5] [--rebuild] [--json] [--verbose]');
    process.exit(1);
}

const TARGET_ROOT = path.resolve(pathArgs[0]);
if (!fs.existsSync(TARGET_ROOT)) {
    console.error(`[ERROR] Target library path does not exist: ${TARGET_ROOT}`);
    process.exit(1);
}

const repoRoot = path.resolve(__dirname, '..', '..');
const distMainPath = path.join(repoRoot, 'dist', 'main');
if (SHOULD_REBUILD || !fs.existsSync(distMainPath)) {
    if (!JSON_OUTPUT) {
        console.log('[INIT] Building main process (npm run build:main)...');
    }
    execSync('npm run build:main', { cwd: repoRoot, stdio: JSON_OUTPUT ? 'ignore' : 'inherit' });
}

const { collectGameCandidates, dedupeCandidates, buildGameKey } = require(
    path.join(distMainPath, 'library-state', 'scanner.js')
);
const { resolveSaveFolder } = require(
    path.join(distMainPath, 'save-folder-resolver', 'index.js')
);
const { createSaveEditorService } = require(
    path.join(distMainPath, 'save-editor', 'index.js')
);
const { SaveEditorIpcController } = require(
    path.join(distMainPath, 'ipc', 'controllers', 'save-editor.controller.js')
);

function createMockIpcMain() {
    const handlers = new Map();
    return {
        handle(channel, fn) {
            handlers.set(channel, fn);
        },
        on() {},
        removeListener() {},
        removeHandler(channel) {
            handlers.delete(channel);
        },
        getHandler(channel) {
            return handlers.get(channel);
        },
    };
}

function createSilentLogger(capture) {
    const origWarn = console.warn;
    const origError = console.error;
    const origLog = console.log;
    return {
        install() {
            console.warn = (...a) => capture.push({ level: 'warn', msg: a.map(String).join(' ') });
            console.error = (...a) => capture.push({ level: 'error', msg: a.map(String).join(' ') });
            if (JSON_OUTPUT) {
                console.log = () => {};
            }
        },
        restore() {
            console.warn = origWarn;
            console.error = origError;
            console.log = origLog;
        },
    };
}

function pickProbeField(fields) {
    if (!Array.isArray(fields) || fields.length === 0) return null;
    const editable = fields.filter((f) => !f.readOnly && f.id);
    if (editable.length === 0) return null;
    const numField = editable.find((f) => f.type === 'number' && typeof f.value === 'number' && Number.isFinite(f.value));
    if (numField) return { field: numField, mutated: numField.value === 0 ? 1 : numField.value + 1 };
    const boolField = editable.find((f) => f.type === 'boolean' && typeof f.value === 'boolean');
    if (boolField) return { field: boolField, mutated: !boolField.value };
    const strField = editable.find((f) => f.type === 'string' && typeof f.value === 'string');
    if (strField) return { field: strField, mutated: `${strField.value}_probe` };
    return null;
}

async function main() {
    const startMs = Date.now();
    const capturedLogs = [];
    const logger = createSilentLogger(capturedLogs);

    const rawCandidates = await collectGameCandidates(
        fsPromises,
        TARGET_ROOT,
        TARGET_ROOT,
        0,
        MAX_DEPTH,
        process.platform
    );
    const candidates = dedupeCandidates(rawCandidates, process.platform);

    const records = new Map();
    for (const candidate of candidates) {
        const gameKey = buildGameKey(TARGET_ROOT, candidate.folderPath, process.platform);
        if (!gameKey) continue;
        records.set(gameKey, {
            gameKey,
            name: candidate.name || path.basename(candidate.folderPath),
            folderPath: candidate.folderPath,
            exePath: candidate.exePath,
        });
    }

    const mockLibraryState = {
        async getGameRecord(gameKey) {
            return records.get(gameKey) || null;
        },
    };
    const saveFolderResolver = {
        resolveSaveFolder(exePath, overridePath) {
            return resolveSaveFolder(exePath, overridePath);
        },
    };
    const saveEditorService = createSaveEditorService({
        libraryState: mockLibraryState,
        saveFolderResolver,
        fs,
        fsPromises,
        translationsDir: path.join(os.tmpdir(), 'yumeshelf-probe-saves'),
    });

    const mockIpcMain = createMockIpcMain();
    const controller = new SaveEditorIpcController({
        ipcMain: mockIpcMain,
        libraryState: mockLibraryState,
        saveFolderResolver,
        saveEditorService,
    });
    controller.registerHandlers();

    const ipcListFiles = mockIpcMain.getHandler('save-editor:list-files');
    const ipcLoadData = mockIpcMain.getHandler('save-editor:load-data');
    const mockEvent = { sender: { isDestroyed: () => true, send: () => {} } };

    // Isolated temp-save-dir service for --probe-write (never touches real saves)
    let activeTempSaveDir = null;
    let activeTempEngine = null;
    const tempSaveEditorService = PROBE_WRITE
        ? createSaveEditorService({
              libraryState: mockLibraryState,
              saveFolderResolver: {
                  async resolveSaveFolder() {
                      return {
                          path: activeTempSaveDir,
                          engine: activeTempEngine,
                          confidence: 'high',
                      };
                  },
              },
              fs,
              fsPromises,
              translationsDir: path.join(os.tmpdir(), 'yumeshelf-probe-saves'),
          })
        : null;

    const tempProbeRoot = PROBE_WRITE
        ? await fsPromises.mkdtemp(path.join(os.tmpdir(), 'yumeshelf-write-probe-'))
        : null;

    const gameReports = [];
    const ipcErrorGroups = new Map();
    const serviceErrorGroups = new Map();
    const writeErrorGroups = new Map();
    const emptySchemaFiles = [];
    const invalidKeyFiles = [];

    let totalSaveFiles = 0;
    let ipcSuccessCount = 0;
    let ipcFailCount = 0;
    let serviceSuccessCount = 0;
    let serviceFailCount = 0;
    let writeAttempted = 0;
    let writeSuccessCount = 0;
    let writeFailCount = 0;
    let writeSkippedNoEditable = 0;
    let gamesWithSaves = 0;

    function addGroup(map, errorMsg, entry) {
        const key = errorMsg || 'unknown-error';
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(entry);
    }

    logger.install();
    try {
        let probeIdx = 0;
        for (const [gameKey, record] of records.entries()) {
            let saveInfo = null;
            try {
                saveInfo = await resolveSaveFolder(record.exePath);
            } catch (err) {
                saveInfo = { path: null, engine: null, error: err instanceof Error ? err.message : String(err) };
            }

            let files = [];
            let listIpcError = null;
            let listServiceError = null;

            try {
                files = await ipcListFiles(mockEvent, gameKey);
            } catch (err) {
                listIpcError = err instanceof Error ? err.message : String(err);
                try {
                    files = await saveEditorService.listSaveFiles(gameKey);
                } catch (svcErr) {
                    listServiceError = svcErr instanceof Error ? svcErr.message : String(svcErr);
                }
            }

            if (!Array.isArray(files)) files = [];
            if (files.length > 0) gamesWithSaves++;

            const fileResults = [];
            for (const fileName of files) {
                totalSaveFiles++;
                let ipcOk = false;
                let ipcErr = null;
                let serviceOk = false;
                let serviceErr = null;
                let loadedDto = null;
                let writeStatus = null;
                let writeErr = null;

                try {
                    loadedDto = await ipcLoadData(mockEvent, { gameKey, fileName });
                    ipcOk = true;
                    serviceOk = true;
                    ipcSuccessCount++;
                    serviceSuccessCount++;
                } catch (err) {
                    ipcErr = err instanceof Error ? err.message : String(err);
                    ipcFailCount++;
                    addGroup(ipcErrorGroups, ipcErr, {
                        gameKey,
                        engine: saveInfo?.engine || 'unknown',
                        fileName,
                    });

                    try {
                        loadedDto = await saveEditorService.loadSaveData(gameKey, fileName, {
                            earlyExit: true,
                            stalenessTimeoutMs: 10000,
                        });
                        serviceOk = true;
                        serviceSuccessCount++;
                    } catch (svcErr) {
                        serviceErr = svcErr instanceof Error ? svcErr.message : String(svcErr);
                        serviceFailCount++;
                        addGroup(serviceErrorGroups, serviceErr, {
                            gameKey,
                            engine: saveInfo?.engine || 'unknown',
                            fileName,
                        });
                    }
                }

                const strategy = loadedDto?.strategy || null;
                const fields = Array.isArray(loadedDto?.fields) ? loadedDto.fields : [];

                if (serviceOk) {
                    if (fields.length === 0) {
                        emptySchemaFiles.push({
                            gameKey,
                            engine: saveInfo?.engine || 'unknown',
                            strategy,
                            fileName,
                        });
                    }
                    const badFieldKeys = fields
                        .filter((f) => !f.readOnly && (!f.id || !QUALIFIED_KEY_REGEX.test(f.id)))
                        .map((f) => f.id);
                    if (badFieldKeys.length > 0) {
                        invalidKeyFiles.push({
                            gameKey,
                            engine: saveInfo?.engine || 'unknown',
                            strategy,
                            fileName,
                            count: badFieldKeys.length,
                            sample: badFieldKeys.slice(0, 5),
                        });
                    }

                    if (PROBE_WRITE && saveInfo?.path) {
                        const target = pickProbeField(fields);
                        if (!target) {
                            writeSkippedNoEditable++;
                            writeStatus = 'skipped-no-editable';
                        } else {
                            writeAttempted++;
                            const caseDir = path.join(tempProbeRoot, `case_${++probeIdx}`);
                            await fsPromises.mkdir(caseDir, { recursive: true });
                            const srcPath = path.join(saveInfo.path, fileName);
                            const dstPath = path.join(caseDir, fileName);
                            await fsPromises.copyFile(srcPath, dstPath);

                            activeTempSaveDir = caseDir;
                            activeTempEngine = saveInfo.engine;
                            try {
                                const writeRes = await tempSaveEditorService.writeSaveData(
                                    gameKey,
                                    fileName,
                                    { [target.field.id]: target.mutated },
                                    { isUpdates: true, createBackup: false }
                                );
                                if (!writeRes?.ok) {
                                    throw new Error(writeRes?.error || 'writeSaveData returned ok:false');
                                }
                                const reloaded = await tempSaveEditorService.loadSaveData(gameKey, fileName, {
                                    earlyExit: true,
                                    stalenessTimeoutMs: 10000,
                                });
                                const reloadedFields = Array.isArray(reloaded?.fields) ? reloaded.fields : [];
                                const updatedField = reloadedFields.find((f) => f.id === target.field.id);
                                if (!updatedField) {
                                    throw new Error(`Field disappeared after write: ${target.field.id}`);
                                }
                                if (updatedField.value !== target.mutated) {
                                    throw new Error(
                                        `Value mismatch after write for ${target.field.id}: expected ${JSON.stringify(target.mutated)}, got ${JSON.stringify(updatedField.value)}`
                                    );
                                }
                                writeStatus = 'ok';
                                writeSuccessCount++;
                            } catch (wErr) {
                                writeStatus = 'fail';
                                writeErr = wErr instanceof Error ? wErr.message : String(wErr);
                                writeFailCount++;
                                addGroup(writeErrorGroups, writeErr, {
                                    gameKey,
                                    engine: saveInfo?.engine || 'unknown',
                                    strategy,
                                    fileName,
                                    fieldId: target.field.id,
                                });
                            } finally {
                                await fsPromises.rm(caseDir, { recursive: true, force: true }).catch(() => {});
                            }
                        }
                    }
                }

                fileResults.push({
                    fileName,
                    ipcOk,
                    ipcErr,
                    serviceOk,
                    serviceErr,
                    strategy,
                    fieldCount: fields.length,
                    writeStatus,
                    writeErr,
                });
            }

            gameReports.push({
                gameKey,
                name: record.name,
                engine: saveInfo?.engine || null,
                saveDir: saveInfo?.path || null,
                confidence: saveInfo?.confidence || null,
                listIpcError,
                listServiceError,
                fileCount: files.length,
                files: fileResults,
            });
        }
    } finally {
        logger.restore();
        if (tempProbeRoot) {
            await fsPromises.rm(tempProbeRoot, { recursive: true, force: true }).catch(() => {});
        }
    }

    const report = {
        targetRoot: TARGET_ROOT,
        elapsedMs: Date.now() - startMs,
        summary: {
            totalGames: records.size,
            gamesWithSaves,
            totalSaveFiles,
            ipcSuccessCount,
            ipcFailCount,
            serviceSuccessCount,
            serviceFailCount,
            emptySchemaCount: emptySchemaFiles.length,
            invalidQualifiedKeyFileCount: invalidKeyFiles.length,
            ...(PROBE_WRITE
                ? {
                      writeAttempted,
                      writeSuccessCount,
                      writeFailCount,
                      writeSkippedNoEditable,
                  }
                : {}),
        },
        ipcErrorsByType: Object.fromEntries(ipcErrorGroups.entries()),
        serviceErrorsByType: Object.fromEntries(serviceErrorGroups.entries()),
        writeErrorsByType: Object.fromEntries(writeErrorGroups.entries()),
        emptySchemaFiles,
        invalidKeyFiles,
        games: gameReports,
    };

    if (JSON_OUTPUT) {
        console.log(JSON.stringify(report, null, 2));
        return;
    }

    console.log('='.repeat(80));
    console.log('  YUMESHELF LIBRARY SAVE PROBE REPORT');
    console.log('='.repeat(80));
    console.log(`  Library Path     : ${TARGET_ROOT}`);
    console.log(`  Elapsed          : ${report.elapsedMs}ms`);
    console.log(`  Games Discovered : ${report.summary.totalGames}`);
    console.log(`  Games w/ Saves   : ${report.summary.gamesWithSaves}`);
    console.log(`  Total Save Files : ${report.summary.totalSaveFiles}`);
    console.log(`  IPC Load OK/Fail : ${ipcSuccessCount} OK / ${ipcFailCount} FAIL`);
    console.log(`  Service OK/Fail  : ${serviceSuccessCount} OK / ${serviceFailCount} FAIL`);
    console.log(`  Empty Schema     : ${emptySchemaFiles.length} file(s)`);
    console.log(`  Bad Field Keys   : ${invalidKeyFiles.length} file(s) (fail QUALIFIED_KEY_REGEX)`);
    if (PROBE_WRITE) {
        console.log(
            `  Write Round-Trip : ${writeSuccessCount} OK / ${writeFailCount} FAIL (${writeSkippedNoEditable} skipped, no editable fields)`
        );
    }
    console.log('='.repeat(80));

    if (ipcErrorGroups.size > 0) {
        console.log('\n[IPC LAYER ERRORS] (SaveEditorIpcController -> save-editor:load-data)');
        for (const [errMsg, items] of ipcErrorGroups.entries()) {
            console.log(`\n  Error: "${errMsg}" (${items.length} file(s))`);
            for (const item of items.slice(0, 15)) {
                console.log(`    - [${item.engine}] ${item.gameKey} :: ${item.fileName}`);
            }
            if (items.length > 15) {
                console.log(`    ... and ${items.length - 15} more`);
            }
        }
    }

    if (serviceErrorGroups.size > 0) {
        console.log('\n[SAVE-EDITOR SERVICE ERRORS] (SaveEditorService / SaveDataEngine)');
        for (const [errMsg, items] of serviceErrorGroups.entries()) {
            console.log(`\n  Error: "${errMsg}" (${items.length} file(s))`);
            for (const item of items.slice(0, 15)) {
                console.log(`    - [${item.engine}] ${item.gameKey} :: ${item.fileName}`);
            }
            if (items.length > 15) {
                console.log(`    ... and ${items.length - 15} more`);
            }
        }
    }

    if (emptySchemaFiles.length > 0) {
        console.log(`\n[EMPTY SCHEMA FILES] (0 fields extracted: ${emptySchemaFiles.length} file(s))`);
        for (const item of emptySchemaFiles.slice(0, 20)) {
            console.log(`    - [${item.engine}/${item.strategy}] ${item.gameKey} :: ${item.fileName}`);
        }
        if (emptySchemaFiles.length > 20) {
            console.log(`    ... and ${emptySchemaFiles.length - 20} more`);
        }
    }

    if (invalidKeyFiles.length > 0) {
        console.log(`\n[INVALID QUALIFIED FIELD KEYS] (would be rejected by save-editor:write-data)`);
        for (const item of invalidKeyFiles.slice(0, 20)) {
            console.log(
                `    - [${item.engine}/${item.strategy}] ${item.gameKey} :: ${item.fileName} (${item.count} bad key(s), sample: ${JSON.stringify(item.sample)})`
            );
        }
    }

    if (PROBE_WRITE && writeErrorGroups.size > 0) {
        console.log('\n[WRITE ROUND-TRIP ERRORS] (Temp-copy applySaveUpdates -> reload)');
        for (const [errMsg, items] of writeErrorGroups.entries()) {
            console.log(`\n  Error: "${errMsg}" (${items.length} file(s))`);
            for (const item of items.slice(0, 15)) {
                console.log(`    - [${item.engine}/${item.strategy}] ${item.gameKey} :: ${item.fileName} (field=${item.fieldId})`);
            }
            if (items.length > 15) {
                console.log(`    ... and ${items.length - 15} more`);
            }
        }
    }

    if (VERBOSE) {
        console.log('\n[VERBOSE PER-GAME DETAILS]');
        for (const g of gameReports) {
            if (g.fileCount === 0 && !g.listIpcError && !g.listServiceError) continue;
            console.log(`\n  Game: ${g.gameKey} (engine=${g.engine || 'unknown'}, files=${g.fileCount})`);
            if (g.listIpcError) console.log(`    list-files IPC error: ${g.listIpcError}`);
            if (g.listServiceError) console.log(`    list-files Service error: ${g.listServiceError}`);
            for (const f of g.files) {
                const status = f.ipcOk
                    ? `OK (strategy=${f.strategy}, fields=${f.fieldCount}, write=${f.writeStatus || 'n/a'})`
                    : `IPC_ERR(${f.ipcErr}) -> SVC_${f.serviceOk ? `OK(strategy=${f.strategy}, fields=${f.fieldCount}, write=${f.writeStatus || 'n/a'})` : `ERR(${f.serviceErr})`}`;
                console.log(`    - ${f.fileName}: ${status}`);
            }
        }
    }
}

main().catch((err) => {
    console.error('[FATAL]', err);
    process.exit(1);
});

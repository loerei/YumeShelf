#!/usr/bin/env node

/**
 * YumeShelf Save Pipeline Simulation & Benchmark Utility
 *
 * Simulates YumeShelf's complete Save Resolution Pipeline against any target library directory.
 * Hooks directly into real production modules (scanner.js, save-folder-resolver, SaveDataEngine)
 * to measure game discovery, save directory resolution rates, confidence distribution, and
 * recognized save file formats.
 *
 * Usage:
 *   node .devutil/simulate-save-pipeline.cjs "<target-directory>" [--list-files] [--json] [--verbose] [--max-depth=5] [--rebuild]
 */

const fs = require('node:fs');
const fsPromises = require('node:fs/promises');
const path = require('node:path');
const { execSync } = require('node:child_process');

// Parse CLI arguments
const args = process.argv.slice(2);
const JSON_OUTPUT = args.includes('--json');
const LIST_FILES = args.includes('--list-files') || args.includes('-l');
const SHOW_METADATA = args.includes('--metadata') || args.includes('-m');
const VERBOSE = args.includes('--verbose') || args.includes('-v');
const SHOULD_REBUILD = args.includes('--rebuild');

const maxDepthArg = args.find((a) => a.startsWith('--max-depth='));
const MAX_DEPTH = maxDepthArg ? parseInt(maxDepthArg.split('=')[1], 10) : 5;

const pathArgs = args.filter((a) => !a.startsWith('-'));
const TARGET_ROOT = pathArgs[0] ? path.resolve(pathArgs[0]) : path.resolve(process.cwd());

// Ensure compiled modules exist in dist/
const distMainPath = path.resolve(__dirname, '..', 'dist', 'main');
if (SHOULD_REBUILD || !fs.existsSync(distMainPath)) {
    if (!JSON_OUTPUT) {
        console.log('[INIT] Compiling TypeScript main process to dist/main...');
    }
    execSync('npm run build:main', { cwd: path.resolve(__dirname, '..'), stdio: JSON_OUTPUT ? 'ignore' : 'inherit' });
}

// Require real production modules from dist/
const { collectGameCandidates, dedupeCandidates } = require(path.join(distMainPath, 'library-state', 'scanner.js'));
const { resolveSaveFolder } = require(path.join(distMainPath, 'save-folder-resolver', 'index.js'));
const { SaveDataEngine } = require(path.join(distMainPath, 'save-editor', 'engine.js'));

async function simulate() {
    const startTime = Date.now();

    if (!fs.existsSync(TARGET_ROOT)) {
        console.error(`[ERROR] Target directory does not exist: ${TARGET_ROOT}`);
        process.exit(1);
    }

    if (!JSON_OUTPUT) {
        console.log('='.repeat(80));
        console.log(`  YUMESHELF SAVE RESOLVER PIPELINE SIMULATOR`);
        console.log('='.repeat(80));
        console.log(`  Target Root : ${TARGET_ROOT}`);
        console.log(`  Max Depth   : ${MAX_DEPTH}`);
        console.log(`  List Files  : ${LIST_FILES ? 'YES' : 'NO'}`);
        console.log(`  Timestamp   : ${new Date().toISOString()}`);
        console.log('='.repeat(80));
        console.log('\n[1/3] Scanning for game candidates via collectGameCandidates...');
    }

    // Step 1: Game Discovery
    const rawCandidates = await collectGameCandidates(fsPromises, TARGET_ROOT, TARGET_ROOT, 0, MAX_DEPTH, process.platform);
    const games = dedupeCandidates(rawCandidates, process.platform);

    if (!JSON_OUTPUT) {
        console.log(`[DISCOVERY] Discovered ${games.length} unique game candidates in ${Date.now() - startTime}ms`);
        console.log('\n[2/3] Resolving save directories and inspecting save files...\n');
    }

    // Instantiate real SaveDataEngine with mock paths resolver
    let currentSaveDir = null;
    let currentExeDir = null;
    let currentEngine = null;

    const saveDataEngine = new SaveDataEngine({
        getGamePaths: async () => ({
            exeDir: currentExeDir || '',
            saveDir: currentSaveDir || '',
            dataDir: path.join(currentExeDir || '', 'www', 'data'),
            langDataDir: null,
            engine: currentEngine || undefined
        }),
        loadMetadata: async () => ({})
    });

    const results = [];
    const stats = {
        totalGames: games.length,
        resolvedGames: 0,
        existingFolderGames: 0,
        predictedFolderGames: 0,
        unresolvedGames: 0,
        totalSaveFiles: 0,
        totalItemsParsed: 0,
        totalWeaponsParsed: 0,
        totalArmorsParsed: 0,
        totalVariablesParsed: 0,
        totalSwitchesParsed: 0,
        confidenceBreakdown: { high: 0, medium: 0, low: 0, none: 0 },
        engineBreakdown: {},
        sourceBreakdown: {},
        formatBreakdown: {}
    };

    async function resolveAuxMetadata(exePath, engine, saveDir) {
        const exeDir = path.dirname(exePath);
        const meta = {
            title: null,
            company: null,
            product: null,
            variablesCount: 0,
            switchesCount: 0,
            itemsCount: 0,
            weaponsCount: 0,
            armorsCount: 0,
            sampleItems: [],
            auxFiles: []
        };

        if (engine === 'rpg-mv-mz') {
            const parentOfSave = saveDir ? path.dirname(saveDir) : exeDir;
            const candidateDataDirs = [
                path.join(parentOfSave, 'data'),
                path.join(exeDir, 'www', 'data'),
                path.join(exeDir, 'data'),
                path.join(exeDir, 'bin', 'www', 'data'),
                path.join(exeDir, 'bin', 'data')
            ];
            let dataDir = null;
            for (const c of candidateDataDirs) {
                if (fs.existsSync(c)) { dataDir = c; break; }
            }
            if (dataDir) {
                meta.auxFiles.push('dataDir: ' + path.relative(exeDir, dataDir));
                const sysPath = path.join(dataDir, 'System.json');
                if (fs.existsSync(sysPath)) {
                    meta.auxFiles.push('System.json');
                    try {
                        const sys = JSON.parse(fs.readFileSync(sysPath, 'utf8'));
                        meta.title = sys.gameTitle || '';
                        meta.variablesCount = (sys.variables || []).filter(Boolean).length;
                        meta.switchesCount = (sys.switches || []).filter(Boolean).length;
                    } catch {}
                }
                const itemsPath = path.join(dataDir, 'Items.json');
                if (fs.existsSync(itemsPath)) {
                    meta.auxFiles.push('Items.json');
                    try {
                        const items = JSON.parse(fs.readFileSync(itemsPath, 'utf8'));
                        const valid = items.filter(it => it && it.name);
                        meta.itemsCount = valid.length;
                        meta.sampleItems = valid.slice(0, 3).map(it => it.name);
                    } catch {}
                }
                const weapsPath = path.join(dataDir, 'Weapons.json');
                if (fs.existsSync(weapsPath)) {
                    meta.auxFiles.push('Weapons.json');
                    try {
                        const weaps = JSON.parse(fs.readFileSync(weapsPath, 'utf8'));
                        meta.weaponsCount = weaps.filter(w => w && w.name).length;
                    } catch {}
                }
                const armorsPath = path.join(dataDir, 'Armors.json');
                if (fs.existsSync(armorsPath)) {
                    meta.auxFiles.push('Armors.json');
                    try {
                        const armors = JSON.parse(fs.readFileSync(armorsPath, 'utf8'));
                        meta.armorsCount = armors.filter(a => a && a.name).length;
                    } catch {}
                }
                for (const lang of ['VN', 'EN', 'JP', 'CN', 'TW', 'UA', 'KR']) {
                    if (fs.existsSync(path.join(dataDir, lang))) {
                        meta.auxFiles.push('Lang:' + lang);
                    }
                }
            }
        } else if (engine === 'unity') {
            try {
                const entries = fs.readdirSync(exeDir);
                for (const df of entries.filter(e => e.endsWith('_Data'))) {
                    const appInfo = path.join(exeDir, df, 'app.info');
                    if (fs.existsSync(appInfo)) {
                        meta.auxFiles.push(df + '/app.info');
                        const lines = fs.readFileSync(appInfo, 'utf8').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
                        if (lines.length >= 2) {
                            meta.company = lines[0];
                            meta.product = lines[1];
                            meta.title = lines[1];
                        }
                    }
                    const bootConfig = path.join(exeDir, df, 'boot.config');
                    if (fs.existsSync(bootConfig)) meta.auxFiles.push(df + '/boot.config');
                }
            } catch {}
        } else if (engine === 'wolf-rpg') {
            const iniPath = path.join(exeDir, 'Game.ini');
            if (fs.existsSync(iniPath)) {
                meta.auxFiles.push('Game.ini');
                const content = fs.readFileSync(iniPath, 'utf8');
                const m = content.match(/title\s*=\s*(.+)/i);
                if (m) meta.title = m[1].trim();
            }
        } else if (engine === 'gamemaker') {
            const opt = path.join(exeDir, 'options.ini');
            if (fs.existsSync(opt)) meta.auxFiles.push('options.ini');
        } else if (engine === 'renpy') {
            if (fs.existsSync(path.join(exeDir, 'renpy'))) meta.auxFiles.push('renpy-core');
        }

        return meta;
    }

    for (let i = 0; i < games.length; i++) {
        const game = games[i];
        const gameFolder = game.folderPath;
        const exePath = game.exePath;
        const gameName = path.basename(gameFolder);

        // Step 2: Resolve Save Directory
        const resolution = await resolveSaveFolder(exePath, null);
        const resolvedPath = resolution.path;
        const engine = resolution.engine || 'unknown';
        const confidence = resolution.confidence || 'none';
        const source = resolution.source || 'none';

        // Auxiliary metadata resolution
        const aux = await resolveAuxMetadata(exePath, engine, resolvedPath);
        stats.totalItemsParsed += aux.itemsCount;
        stats.totalWeaponsParsed += aux.weaponsCount;
        stats.totalArmorsParsed += aux.armorsCount;
        stats.totalVariablesParsed += aux.variablesCount;
        stats.totalSwitchesParsed += aux.switchesCount;

        // Update stats
        stats.confidenceBreakdown[confidence] = (stats.confidenceBreakdown[confidence] || 0) + 1;
        stats.engineBreakdown[engine] = (stats.engineBreakdown[engine] || 0) + 1;
        stats.sourceBreakdown[source] = (stats.sourceBreakdown[source] || 0) + 1;

        let saveFiles = [];
        let formatMatches = [];
        let allFolderFiles = [];

        if (resolvedPath) {
            stats.resolvedGames++;
            if (fs.existsSync(resolvedPath)) {
                stats.existingFolderGames++;
                currentSaveDir = resolvedPath;
                currentExeDir = path.dirname(exePath);
                currentEngine = engine;

                // Step 3: List & categorize save files
                try {
                    saveFiles = await saveDataEngine.listSaveFiles(gameName);
                    stats.totalSaveFiles += saveFiles.length;

                    // Inspect formats
                    for (const sf of saveFiles) {
                        try {
                            const fmt = saveDataEngine.findFormat(sf);
                            const fmtName = fmt.constructor?.name || 'UnknownFormat';
                            stats.formatBreakdown[fmtName] = (stats.formatBreakdown[fmtName] || 0) + 1;
                            formatMatches.push({ file: sf, format: fmtName });
                        } catch {
                            formatMatches.push({ file: sf, format: 'Unsupported' });
                        }
                    }

                    // Check for loose unmapped files in save dir
                    try {
                        const rawDir = await fsPromises.readdir(resolvedPath);
                        allFolderFiles = rawDir.filter((f) => {
                            const stat = fs.statSync(path.join(resolvedPath, f));
                            return stat.isFile();
                        });
                    } catch {}
                } catch (err) {
                    if (VERBOSE) console.warn(`[WARN] Error listing saves for ${gameName}: ${err.message}`);
                }
            } else {
                stats.predictedFolderGames++;
            }
        } else {
            stats.unresolvedGames++;
        }

        results.push({
            index: i + 1,
            gameName,
            folderPath: gameFolder,
            exePath,
            platform: game.platform,
            engine,
            confidence,
            source,
            saveDir: resolvedPath,
            saveDirExists: resolvedPath ? fs.existsSync(resolvedPath) : false,
            saveCount: saveFiles.length,
            saveFiles,
            formatMatches,
            totalFilesInSaveDir: allFolderFiles.length,
            auxMetadata: aux
        });
    }

    const durationMs = Date.now() - startTime;

    if (JSON_OUTPUT) {
        console.log(JSON.stringify({ targetRoot: TARGET_ROOT, durationMs, stats, results }, null, 2));
        return;
    }

    // Step 4: Render Human-Readable Formatted Table
    console.log('─'.repeat(120));
    console.log(
        `#  | ${'Game Name'.padEnd(35)} | ${'Engine'.padEnd(12)} | ${'Conf.'.padEnd(6)} | ${'Saves'.padEnd(5)} | ${'Save Directory / Status'}`
    );
    console.log('─'.repeat(120));

    for (const r of results) {
        const idx = String(r.index).padStart(2, ' ');
        const name = r.gameName.length > 35 ? r.gameName.substring(0, 32) + '...' : r.gameName.padEnd(35);
        const eng = r.engine.padEnd(12);
        const conf = r.confidence.padEnd(6);
        const saves = String(r.saveCount).padStart(5, ' ');
        const savePathStr = r.saveDir ? r.saveDir : '(No save directory found)';

        console.log(`${idx} | ${name} | ${eng} | ${conf} | ${saves} | ${savePathStr}`);

        if (SHOW_METADATA || LIST_FILES) {
            const aux = r.auxMetadata;
            if (aux && (aux.title || aux.itemsCount > 0 || aux.variablesCount > 0 || aux.auxFiles.length > 0)) {
                const titlePart = aux.title ? `Title: "${aux.title}" | ` : '';
                const itemsPart = aux.itemsCount > 0 ? `Items: ${aux.itemsCount} (e.g. ${aux.sampleItems.slice(0, 2).join(', ')}) | ` : '';
                const equipPart = (aux.weaponsCount > 0 || aux.armorsCount > 0) ? `Weapons: ${aux.weaponsCount}, Armors: ${aux.armorsCount} | ` : '';
                const varsPart = aux.variablesCount > 0 ? `Vars: ${aux.variablesCount}, Switches: ${aux.switchesCount} | ` : '';
                const filesPart = aux.auxFiles.length > 0 ? `Files: [${aux.auxFiles.slice(0, 3).join(', ')}]` : '';
                console.log(`     └─ [Metadata] ${titlePart}${itemsPart}${equipPart}${varsPart}${filesPart}`);
            }
        }

        if (LIST_FILES && r.formatMatches.length > 0) {
            for (const fm of r.formatMatches) {
                console.log(`     └─ [${fm.format}] ${fm.file}`);
            }
        }
    }

    console.log('─'.repeat(120));

    // Summary Analytics
    console.log('\n' + '='.repeat(80));
    console.log('  PIPELINE EVALUATION SUMMARY & METRICS');
    console.log('='.repeat(80));
    console.log(`  Total Games Discovered     : ${stats.totalGames}`);
    console.log(`  Save Path Resolved         : ${stats.resolvedGames}/${stats.totalGames} (${((stats.resolvedGames / (stats.totalGames || 1)) * 100).toFixed(1)}%)`);
    console.log(`    ├─ Active Folders on Disk: ${stats.existingFolderGames}`);
    console.log(`    └─ Predicted Pre-launch  : ${stats.predictedFolderGames}`);
    console.log(`  Save Path Unresolved       : ${stats.unresolvedGames} (${((stats.unresolvedGames / (stats.totalGames || 1)) * 100).toFixed(1)}%)`);
    console.log(`  Total Save Files Found     : ${stats.totalSaveFiles}`);
    console.log(`  Total In-Game Items Parsed : ${stats.totalItemsParsed}`);
    console.log(`  Total Weapons Parsed       : ${stats.totalWeaponsParsed}`);
    console.log(`  Total Armors Parsed        : ${stats.totalArmorsParsed}`);
    console.log(`  Total Variables Parsed     : ${stats.totalVariablesParsed}`);
    console.log(`  Total Processing Time      : ${durationMs}ms (${(durationMs / (stats.totalGames || 1)).toFixed(1)}ms / game)`);

    console.log('\n── Confidence Distribution:');
    for (const [k, v] of Object.entries(stats.confidenceBreakdown)) {
        console.log(`   ${k.padEnd(8)} : ${String(v).padStart(3)} (${((v / (stats.totalGames || 1)) * 100).toFixed(1)}%)`);
    }

    console.log('\n── Engine Distribution:');
    for (const [k, v] of Object.entries(stats.engineBreakdown)) {
        console.log(`   ${k.padEnd(15)} : ${String(v).padStart(3)} (${((v / (stats.totalGames || 1)) * 100).toFixed(1)}%)`);
    }

    console.log('\n── Resolution Sources:');
    for (const [k, v] of Object.entries(stats.sourceBreakdown)) {
        console.log(`   ${k.padEnd(15)} : ${String(v).padStart(3)} (${((v / (stats.totalGames || 1)) * 100).toFixed(1)}%)`);
    }

    if (Object.keys(stats.formatBreakdown).length > 0) {
        console.log('\n── Recognized Save Formats:');
        for (const [k, v] of Object.entries(stats.formatBreakdown)) {
            console.log(`   ${k.padEnd(20)} : ${String(v).padStart(3)} files`);
        }
    }

    if (stats.unresolvedGames > 0) {
        console.log('\n── Unresolved Games Diagnostic:');
        const unresolved = results.filter((r) => !r.saveDir);
        for (const u of unresolved) {
            console.log(`   [UNRESOLVED] ${u.gameName}`);
            console.log(`                Exe: ${u.exePath}`);
            console.log(`                Engine Detected: ${u.engine}`);
        }
    }

    console.log('='.repeat(80) + '\n');
}

simulate().catch((err) => {
    console.error('[FATAL]', err);
    process.exit(1);
});

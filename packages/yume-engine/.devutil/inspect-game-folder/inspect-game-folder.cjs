#!/usr/bin/env node
/**
 * inspect-game-folder.cjs
 * YumeEngine Developer Utility — Full-Spectrum Game Folder Inspector
 *
 * Scans a directory of game folders and produces a comprehensive JSON report
 * that exposes EVERY layer of engine output: raw PE binary structure, engine
 * rule resolution, surface metadata (app.info / System.json / package.json),
 * save location resolution, and a sample save-file decode attempt.
 *
 * Usage:
 *   node .devutil/inspect-game-folder/inspect-game-folder.cjs --dir <path>
 *   node .devutil/inspect-game-folder/inspect-game-folder.cjs --dir <path> --out <file.json>
 *   node .devutil/inspect-game-folder/inspect-game-folder.cjs --dir <path> --depth <n>
 *   node .devutil/inspect-game-folder/inspect-game-folder.cjs --dir <path> --processed
 *
 * Options:
 *   --dir       <path>  Root folder containing one game per sub-directory. (required)
 *   --out       <path>  Output JSON file path. (default: inspect-output.json in CWD)
 *   --depth     <n>     Max .exe search depth inside each game folder. (default: 2)
 *   --processed         Emit only the final-value whitelist: identity, engine profile,
 *                       title candidates, save location, codec status. Drops raw PE
 *                       structure and intermediate surface metadata fields.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// --- CLI --------------------------------------------------------------------

function parseArgs(argv) {
  const a = { dir: null, out: null, depth: 2, processed: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--dir'       && argv[i + 1]) { a.dir   = argv[++i]; continue; }
    if (argv[i] === '--out'       && argv[i + 1]) { a.out   = argv[++i]; continue; }
    if (argv[i] === '--depth'     && argv[i + 1]) { a.depth = parseInt(argv[++i], 10); continue; }
    if (argv[i] === '--processed')                { a.processed = true;  continue; }
  }
  return a;
}

const args = parseArgs(process.argv);

if (!args.dir) {
  console.error('Error: --dir <path> is required.');
  console.error('Usage: node inspect-game-folder.cjs --dir <path> [--out <file.json>] [--depth <n>] [--processed]');
  process.exit(1);
}

const TARGET_DIR  = path.resolve(args.dir);
const OUTPUT_FILE = args.out ? path.resolve(args.out) : path.join(process.cwd(), 'inspect-output.json');
const MAX_DEPTH   = isNaN(args.depth) ? 2 : args.depth;
const PROCESSED   = args.processed;

// --- Engine bootstrap -------------------------------------------------------

const ENGINE_DIST = path.resolve(__dirname, '../../dist/index.cjs');
if (!fs.existsSync(ENGINE_DIST)) {
  console.error(`Error: engine build not found at ${ENGINE_DIST}`);
  console.error('Run "npm run build" inside packages/yume-engine first.');
  process.exit(1);
}

const { YumeEngine, PEInspector, NodeFileSystemProvider } = require(ENGINE_DIST);

// --- Constants --------------------------------------------------------------

const SKIP_EXE = new Set([
  'unins000.exe','uninstall.exe','dxwebsetup.exe',
  'vcredist_x86.exe','vcredist_x64.exe',
  'unitycrashhandler32.exe','unitycrashhandler64.exe',
]);

const SKIP_DIRS = new Set(['node_modules','.git','save','savedata','saves']);

// --- Helpers ----------------------------------------------------------------

function fwd(p) { return p.replace(/\\/g, '/'); }

function findExecutables(dir, depth = 0) {
  if (depth > MAX_DEPTH) return [];
  const out = [];
  try {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name.toLowerCase()))
          out.push(...findExecutables(path.join(dir, e.name), depth + 1));
      } else if (e.isFile() && e.name.toLowerCase().endsWith('.exe')) {
        if (!SKIP_EXE.has(e.name.toLowerCase()))
          out.push(path.join(dir, e.name));
      }
    }
  } catch { /* permission / read error */ }
  return out;
}

// --- Surface metadata -------------------------------------------------------
// Files that live beside / near the .exe but are NOT embedded in the PE binary.
// These expose the "real" game title & identity through the engine's data layer.

function readSurfaceMetadata(exePath) {
  const dir  = path.dirname(exePath);
  const meta = {
    packageJson:  null,  // NW.js / Electron  -- window.title, name
    systemJson:   null,  // RPG Maker MV/MZ   -- gameTitle
    appInfo:      null,  // Unity             -- { companyName, productName }
    godotProject: null,  // Godot             -- application/config/name
    renpyConfig:  null,  // Ren'Py            -- config.name
    steamAppId:   null,  // Steam             -- numeric AppID
  };

  // package.json (NW.js / Electron)
  try {
    const pkgPath = path.join(dir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const raw = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      meta.packageJson = {
        name:        raw.name           || null,
        windowTitle: raw.window?.title  || null,
        main:        raw.main           || null,
        width:       raw.window?.width  || null,
        height:      raw.window?.height || null,
      };
    }
  } catch { /* malformed JSON */ }

  // data/System.json or www/data/System.json (RPG Maker MV/MZ)
  for (const sub of ['data/System.json', 'www/data/System.json', 'data/system.json']) {
    try {
      const sp = path.join(dir, sub);
      if (fs.existsSync(sp)) {
        const raw = JSON.parse(fs.readFileSync(sp, 'utf8'));
        if (raw.gameTitle !== undefined) {
          meta.systemJson = {
            gameTitle:    raw.gameTitle    || null,
            locale:       raw.locale       || null,
            battleSystem: raw.battleSystem ?? null,
          };
          break;
        }
      }
    } catch { /* malformed */ }
  }

  // <Game>_Data/app.info (Unity)
  try {
    const entries = fs.readdirSync(dir);
    const dataDir = entries.find(e => e.endsWith('_Data') && fs.statSync(path.join(dir, e)).isDirectory());
    if (dataDir) {
      const infoPath = path.join(dir, dataDir, 'app.info');
      if (fs.existsSync(infoPath)) {
        const lines = fs.readFileSync(infoPath, 'utf8').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        meta.appInfo = {
          dataFolder:  dataDir,
          companyName: lines[0] || null,
          productName: lines[1] || null,
        };
      }
    }
  } catch { /* io error */ }

  // project.godot (Godot)
  try {
    const godotPath = path.join(dir, 'project.godot');
    if (fs.existsSync(godotPath)) {
      const content = fs.readFileSync(godotPath, 'utf8');
      const m = content.match(/config\/name\s*=\s*"([^"]+)"/);
      meta.godotProject = { configName: m ? m[1] : null };
    }
  } catch { /* io error */ }

  // game/options.rpy or game/gui.rpy -- scan for config.name (Ren'Py)
  for (const rpyRel of ['game/options.rpy', 'game/gui.rpy', 'renpy/common/00start.rpy']) {
    try {
      const rpyPath = path.join(dir, rpyRel);
      if (fs.existsSync(rpyPath)) {
        const content = fs.readFileSync(rpyPath, 'utf8');
        const m = content.match(/config\.name\s*=\s*[_u]?"([^"]+)"/);
        if (m) {
          meta.renpyConfig = { configName: m[1], source: rpyRel };
          break;
        }
      }
    } catch { /* io error */ }
  }

  // steam_appid.txt
  try {
    const steamPath = path.join(dir, 'steam_appid.txt');
    if (fs.existsSync(steamPath)) {
      const raw = fs.readFileSync(steamPath, 'utf8').trim();
      const appId = parseInt(raw, 10);
      if (!isNaN(appId)) meta.steamAppId = appId;
    }
  } catch { /* io error */ }

  return meta;
}

// --- PE binary details ------------------------------------------------------
// Extract raw PE structural fields from PEInspector (not surfaced by GameEngineProfile).

async function readPEDetails(exePath) {
  const engineFs = new NodeFileSystemProvider();
  try {
    const inspector = await PEInspector.fromPath(fwd(exePath), engineFs);
    if (!inspector.isValid) return { valid: false };

    const coff = inspector.coffHeader;
    const opt  = inspector.optionalHeader;

    return {
      valid:    true,
      is64Bit:  inspector.is64Bit,
      coff: {
        machine:          '0x' + coff.machine.toString(16).toUpperCase(),
        numberOfSections: coff.numberOfSections,
        timeDateStamp:    coff.timeDateStamp,
        timestamp:        coff.timeDateStamp ? new Date(coff.timeDateStamp * 1000).toISOString() : null,
        characteristics:  '0x' + coff.characteristics.toString(16).toUpperCase(),
      },
      optional: {
        magic:               '0x' + opt.magic.toString(16).toUpperCase(),
        imageBase:           '0x' + opt.imageBase.toString(16).toUpperCase(),
        subsystem:           opt.subsystem,
        sizeOfImage:         opt.sizeOfImage,
        sizeOfCode:          opt.sizeOfCode,
        addressOfEntryPoint: '0x' + opt.addressOfEntryPoint.toString(16).toUpperCase(),
        majorLinkerVersion:  opt.majorLinkerVersion,
        minorLinkerVersion:  opt.minorLinkerVersion,
      },
      sections: inspector.sections.map(s => ({
        name:            s.name,
        virtualAddress:  '0x' + s.virtualAddress.toString(16).toUpperCase(),
        virtualSize:     s.virtualSize,
        rawSize:         s.rawSize,
        characteristics: '0x' + s.characteristics.toString(16).toUpperCase(),
      })),
      imports: inspector.imports.map(lib => ({
        dll:       lib.name,
        functions: lib.functions.slice(0, 20),  // cap to 20 per DLL
        total:     lib.functions.length,
      })),
      versionInfo: inspector.versionInfo ? {
        fileDescription:  inspector.versionInfo.fileDescription  || null,
        productName:      inspector.versionInfo.productName      || null,
        internalName:     inspector.versionInfo.internalName     || null,
        originalFilename: inspector.versionInfo.originalFilename || null,
        fileVersion:      inspector.versionInfo.fileVersion      || null,
        productVersion:   inspector.versionInfo.productVersion   || null,
        companyName:      inspector.versionInfo.companyName      || null,
        legalCopyright:   inspector.versionInfo.legalCopyright   || null,
        comments:         inspector.versionInfo.comments         || null,
      } : null,
    };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

// --- Save codec probe -------------------------------------------------------
// Decode the first available save file to verify the codec actually works.

async function probeSaveCodec(resolvedSave, profile) {
  if (!resolvedSave?.path || !resolvedSave?.files?.length)
    return { attempted: false, reason: 'no resolved save files' };

  const strategy = profile?.saveStrategy || resolvedSave.matchedStrategy;
  if (!strategy || strategy === 'unknown')
    return { attempted: false, reason: 'unknown save strategy' };

  // Codecs that require external runtimes -- flag but skip live decode
  if (new Set(['renpy-pickle']).has(strategy))
    return { attempted: false, reason: `strategy "${strategy}" requires external runtime` };

  const sampleFile = resolvedSave.files[0];
  const samplePath = path.join(resolvedSave.path, sampleFile);

  try {
    if (!fs.existsSync(samplePath)) return { attempted: false, reason: 'sample file missing' };
    const buf     = fs.readFileSync(samplePath);
    const decoded = await YumeEngine.decodeSaveFile(strategy, buf, { fileName: sampleFile });
    const topKeys = decoded && typeof decoded === 'object' ? Object.keys(decoded).slice(0, 10) : [];
    return {
      attempted:    true,
      strategy,
      sampleFile,
      sampleSizeKb: +(buf.length / 1024).toFixed(2),
      decoded:      true,
      topKeys,
    };
  } catch (err) {
    return { attempted: true, strategy, sampleFile, decoded: false, error: err.message };
  }
}

// --- Processed whitelist ----------------------------------------------------
//
// Whitelist philosophy: keep only fields whose value is the *end destination*
// of reasoning -- not a means to derive something else.
//
// INCLUDED (final values):
//   - Folder & exe identity (folderName, folderPath, exeName, relativeExePath)
//   - Engine classification (tag, family, variant, arch, runtime, saveStrategy)
//   - All title candidates flattened -- every source that names the game
//   - Save location (path, confidence, source, filesFound count)
//   - Codec status (does the engine actually decode a real save?)
//
// EXCLUDED (structural / intermediate):
//   - peDetails.coff / optional / sections / imports -- binary plumbing
//   - peDetails.versionInfo.*  -> mined into titleCandidates
//   - surfaceMetadata (raw)    -> mined into titleCandidates
//   - engineProfile.detectedBy -- internal rule note, not user-facing
//   - saveCodecProbe.topKeys, sampleSizeKb -- debug noise
//   - resolvedSaveLocation.files[] -- raw list; filesFound count suffices

function applyProcessedWhitelist(folderReport) {
  return {
    folderName: folderReport.folderName,
    folderPath: folderReport.folderPath,

    inspections: folderReport.inspections.map(insp => {
      const sm  = insp.surfaceMetadata       || {};
      const vi  = insp.peDetails?.versionInfo || {};
      const ep  = insp.engineProfile         || {};
      const rsl = insp.resolvedSaveLocation;
      const scp = insp.saveCodecProbe;

      // All game-title signals ordered by expected reliability:
      //   1. RPG Maker System.json  -- written by the developer's database
      //   2. Unity app.info         -- stamped at build time
      //   3. Ren'Py options.rpy     -- config.name in the VN script
      //   4. Godot project.godot    -- application/config/name
      //   5. PE VS_VERSIONINFO      -- optional, often generic for engine wrappers
      //   6. NW.js package.json     -- sometimes blank or set by localizer
      //   7. Steam AppID            -- 100% deterministic when present
      const titleCandidates = {
        systemJsonTitle:    sm.systemJson?.gameTitle         || null,
        appInfoProduct:     sm.appInfo?.productName          || null,
        appInfoCompany:     sm.appInfo?.companyName          || null,
        renpyConfigName:    sm.renpyConfig?.configName       || null,
        godotConfigName:    sm.godotProject?.configName      || null,
        peFileDescription:  vi.fileDescription               || null,
        peProductName:      vi.productName                   || null,
        peCompanyName:      vi.companyName                   || null,
        packageWindowTitle: sm.packageJson?.windowTitle      || null,
        steamAppId:         sm.steamAppId                    ?? null,
      };

      // Engine classification -- only values that inform UX/logic decisions
      const engineProfile = ep.error
        ? { error: ep.error }
        : {
            tag:          ep.tag,
            family:       ep.family,
            variant:      ep.variant      || null,
            arch:         ep.arch,
            runtime:      ep.runtime,
            saveStrategy: ep.saveStrategy,
          };

      // Save location -- path + quality signal + codec verification
      let saveLocation = null;
      if (rsl && !rsl.error) {
        saveLocation = {
          path:       rsl.path,
          confidence: rsl.confidence,
          source:     rsl.source,
          filesFound: rsl.filesFound ?? (Array.isArray(rsl.files) ? rsl.files.length : null),
          codecWorks: scp?.decoded   ?? null,
        };
      } else if (rsl?.error) {
        saveLocation = { error: rsl.error };
      }

      return {
        exeName:         insp.exeName,
        relativeExePath: insp.relativeExePath,
        engineProfile,
        titleCandidates,
        saveLocation,
      };
    }),
  };
}

// --- inspectFolder ----------------------------------------------------------

async function inspectFolder(folder) {
  const folderName = path.basename(folder);
  const exes       = findExecutables(folder, 0);

  const folderReport = {
    folderName,
    folderPath:       fwd(folder),
    executablesFound: exes.length,
    inspections:      [],
  };

  for (const exe of exes) {
    const exeFwd  = fwd(exe);
    const relPath = fwd(path.relative(folder, exe));

    let profile        = null;
    let peDetails      = null;
    let surfaceMeta    = null;
    let resolvedSave   = null;
    let saveCodecProbe = null;
    let profileError   = null;

    // 1. Surface metadata (files beside .exe -- no binary parsing needed)
    surfaceMeta = readSurfaceMetadata(exe);

    // 2. Raw PE binary structure (COFF, sections, imports, VS_VERSIONINFO)
    peDetails = await readPEDetails(exe);

    // 3. Engine rule resolution -> GameEngineProfile
    try {
      profile = await YumeEngine.inspectExecutable(exeFwd);
    } catch (err) {
      profileError = err.message;
    }

    // 4. Save directory resolution (full resolver chain)
    if (profile) {
      try {
        resolvedSave = await YumeEngine.resolveSaveDirectory(profile, exeFwd);
      } catch (err) {
        resolvedSave = { error: err.message };
      }
    }

    // 5. Save codec probe (decode a real save file as smoke-test)
    if (profile && resolvedSave && !resolvedSave.error) {
      saveCodecProbe = await probeSaveCodec(resolvedSave, profile);
    }

    folderReport.inspections.push({
      exePath:         exeFwd,
      exeName:         path.basename(exe),
      relativeExePath: relPath,

      // Raw PE binary structure (COFF, Optional Header, Sections, Imports, VS_VERSIONINFO)
      peDetails,

      // Engine family / runtime / save strategy from rule registry
      engineProfile: profile
        ? {
            tag:          profile.tag,
            family:       profile.family,
            variant:      profile.variant      || null,
            arch:         profile.arch,
            runtime:      profile.runtime,
            saveStrategy: profile.saveStrategy,
            detectedBy:   profile.detectedBy,
          }
        : { error: profileError },

      // Metadata from adjacent data files (not embedded in the .exe)
      surfaceMetadata: surfaceMeta,

      // Resolved save directory (full resolver chain result)
      resolvedSaveLocation: resolvedSave && !resolvedSave.error
        ? {
            path:            resolvedSave.path,
            confidence:      resolvedSave.confidence,
            source:          resolvedSave.source,
            matchedStrategy: resolvedSave.matchedStrategy,
            files:           resolvedSave.files  || [],
            filesFound:      (resolvedSave.files || []).length,
          }
        : resolvedSave,  // null  or  { error: '...' }

      // Save codec smoke-test: can we decode a real save file?
      saveCodecProbe,
    });
  }

  return folderReport;
}

// --- Main -------------------------------------------------------------------

async function run() {
  if (!fs.existsSync(TARGET_DIR)) {
    console.error(`Error: target directory does not exist: ${TARGET_DIR}`);
    process.exit(1);
  }

  const outDir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  console.log(`[inspect-game-folder] Target    : ${TARGET_DIR}`);
  console.log(`[inspect-game-folder] Output    : ${OUTPUT_FILE}`);
  console.log(`[inspect-game-folder] Depth     : ${MAX_DEPTH}`);
  console.log(`[inspect-game-folder] Processed : ${PROCESSED}`);
  console.log('');

  const gameFolders = fs.readdirSync(TARGET_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => path.join(TARGET_DIR, d.name));

  console.log(`[inspect-game-folder] Scanning ${gameFolders.length} game directories...`);
  console.log('');

  const report = {
    scannedAt:        new Date().toISOString(),
    engineVersion:    require(path.resolve(__dirname, '../../package.json')).version,
    targetDirectory:  fwd(TARGET_DIR),
    maxDepth:         MAX_DEPTH,
    processed:        PROCESSED,
    totalGameFolders: gameFolders.length,
    results:          [],
  };

  for (const folder of gameFolders) {
    const raw = await inspectFolder(folder);
    const folderReport = PROCESSED ? applyProcessedWhitelist(raw) : raw;
    report.results.push(folderReport);
    process.stdout.write(
      `  [${String(report.results.length).padStart(2)}/${gameFolders.length}] ` +
      `${raw.folderName}  (${raw.executablesFound} exe)\n`
    );
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(report, null, 2), 'utf8');
  const sizeKb = (fs.statSync(OUTPUT_FILE).size / 1024).toFixed(2);
  console.log('');
  console.log(`[inspect-game-folder] Done -- ${sizeKb} KB -> ${OUTPUT_FILE}`);
}

run().catch(err => {
  console.error('[inspect-game-folder] Fatal:', err);
  process.exit(1);
});

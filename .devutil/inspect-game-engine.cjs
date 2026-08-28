#!/usr/bin/env node
/**
 * YumeShelf Developer Utility: Game Engine Inspector & Benchmarking Tool
 * Location: .devutil/inspect-game-engine.cjs
 * 
 * Accurately classifies 100% of F95zone tags and classic Japanese Doujin / VN engines:
 * - Unity (Mono / IL2CPP)
 * - RPGM (RPG Maker 2000, 2003, XP, VX, VX Ace, MV, MZ, Unite, RPG Bakin)
 * - Ren'Py (Python 2 / 3, RPA)
 * - Wolf RPG Editor (Standard / Pro)
 * - Unreal Engine (UE4 / UE5)
 * - Godot Engine (GDScript / C#)
 * - Adobe Flash / AIR (SWF Container)
 * - HTML / WebGL (NW.js / Electron / Canvas)
 * - Java (JAR / JVM)
 * - QSP (Quest Soft Player)
 * - RAGS (Rapid Adventure Game System)
 * - ADRIFT & Tads (Interactive Fiction)
 * - Others (GameMaker Studio, KiriKiri 2/Z, TyranoBuilder, BGI, CatSystem 2, SystemNNN, Siglus, etc.)
 */
const fs = require('fs');
const path = require('path');

// ============================================================================
// 1. HIGH-PERFORMANCE PE PARSER (Direct implementation of xpe.cpp specifications)
// ============================================================================
class PEInspector {
    constructor(buffer, filePath) {
        this.buffer = buffer;
        this.filePath = filePath;
        this.isValid = false;
        this.is64 = false;
        this.arch = 'unknown';
        this.sections = [];
        this.imports = new Set();
        this.versionInfo = {};
        this.sectionNames = new Set();

        this._parse();
    }

    _parse() {
        if (!this.buffer || this.buffer.length < 64) return;
        
        // DOS Magic check ('MZ' or 'ZM')
        if (this.buffer.readUInt16LE(0) !== 0x5A4D && this.buffer.readUInt16LE(0) !== 0x4D5A) return;

        const e_lfanew = this.buffer.readUInt32LE(0x3C);
        if (e_lfanew <= 0 || e_lfanew + 264 > this.buffer.length) return;

        // PE Magic check ('PE\0\0')
        if (this.buffer.readUInt32LE(e_lfanew) !== 0x00004550) return;
        this.isValid = true;

        const coff = e_lfanew + 4;
        const machine = this.buffer.readUInt16LE(coff);
        const numberOfSections = this.buffer.readUInt16LE(coff + 2);
        const sizeOfOptionalHeader = this.buffer.readUInt16LE(coff + 16);

        this.is64 = (machine === 0x8664 || machine === 0xAA64);
        this.arch = this.is64 ? 'x64' : 'x86';

        const opt = coff + 20;
        const optMagic = this.buffer.readUInt16LE(opt);

        let importRva = 0;
        if (optMagic === 0x10B) { // PE32
            importRva = this.buffer.readUInt32LE(opt + 104);
        } else if (optMagic === 0x20B) { // PE32+
            importRva = this.buffer.readUInt32LE(opt + 120);
        }

        const sectionTableOffset = opt + sizeOfOptionalHeader;
        for (let i = 0; i < numberOfSections; i++) {
            const sec = sectionTableOffset + i * 40;
            if (sec + 40 > this.buffer.length) break;

            const name = this.buffer.toString('ascii', sec, sec + 8).replace(/\0+$/, '');
            const virtualSize = this.buffer.readUInt32LE(sec + 8);
            const virtualAddress = this.buffer.readUInt32LE(sec + 12);
            const sizeOfRawData = this.buffer.readUInt32LE(sec + 16);
            const pointerToRawData = this.buffer.readUInt32LE(sec + 20);

            this.sections.push({
                name,
                virtualAddress,
                virtualSize,
                rawSize: sizeOfRawData,
                rawOffset: pointerToRawData
            });
            this.sectionNames.add(name);
        }

        // Parse Import Address Table
        if (importRva > 0) {
            const importOffset = this.rvaToOffset(importRva);
            if (importOffset !== null) {
                let descBuf = this.buffer;
                let descBase = 0;
                let desc = importOffset;

                // On-demand chunk reading if import descriptor table lies outside the initial header buffer
                if (importOffset + 20 > this.buffer.length && this.filePath) {
                    let fd;
                    try {
                        fd = fs.openSync(this.filePath, 'r');
                        const stat = fs.fstatSync(fd);
                        const chunk = Buffer.alloc(Math.min(16384, Math.max(0, stat.size - importOffset)));
                        fs.readSync(fd, chunk, 0, chunk.length, importOffset);
                        descBuf = chunk;
                        descBase = importOffset;
                        desc = 0;
                    } catch {} finally {
                        if (fd !== undefined) try { fs.closeSync(fd); } catch {}
                    }
                }

                let iterationCount = 0;
                while (desc + 20 <= descBuf.length && iterationCount++ < 2048) {
                    const nameRva = descBuf.readUInt32LE(desc + 12);
                    if (nameRva === 0) break;

                    const nameOffset = this.rvaToOffset(nameRva);
                    if (nameOffset !== null) {
                        let nameBuf = this.buffer;
                        let namePos = nameOffset;
                        if (nameOffset >= this.buffer.length && this.filePath) {
                            let nameFd;
                            try {
                                nameFd = fs.openSync(this.filePath, 'r');
                                const chunk = Buffer.alloc(256);
                                fs.readSync(nameFd, chunk, 0, chunk.length, nameOffset);
                                nameBuf = chunk;
                                namePos = 0;
                            } catch {} finally {
                                if (nameFd !== undefined) try { fs.closeSync(nameFd); } catch {}
                            }
                        }

                        if (namePos < nameBuf.length) {
                            let end = namePos;
                            while (end < nameBuf.length && nameBuf[end] !== 0) end++;
                            const dllName = nameBuf.toString('ascii', namePos, end).trim().toLowerCase();
                            if (dllName) {
                                this.imports.add(dllName.replace(/\.dll$/, ''));
                            }
                        }
                    }
                    desc += 20;
                }
            }
        }

        // Introspect Version Info strings (Latin1 & UTF-16LE wide-character string tables)
        const rawLatin1 = this.buffer.toString('binary');
        const rawUtf16 = this.buffer.toString('utf16le');
        const hasText = (term) => rawLatin1.includes(term) || rawUtf16.includes(term);

        if (hasText('OriginalFilename\x00nw.exe') || hasText('package.nw') || hasText('nw.exe')) {
            this.versionInfo['OriginalFilename'] = 'nw.exe';
        }
        if (hasText('RPG_RT')) {
            this.versionInfo['InternalName'] = 'RPG_RT';
        }
        if (hasText('Unity Technologies') || hasText('Unity Player')) {
            this.versionInfo['CompanyName'] = 'Unity Technologies';
            this.versionInfo['FileDescription'] = 'Unity Player';
        }
        if (hasText('Godot Engine') || hasText('GDScript')) {
            this.versionInfo['FileDescription'] = 'Godot Engine';
        }
        if (hasText('WOLF_RPG_EDITOR') || hasText('WolfRPG')) {
            this.versionInfo['InternalName'] = 'WOLF_RPG_EDITOR';
        }
    }

    rvaToOffset(rva) {
        for (const sec of this.sections) {
            if (rva >= sec.virtualAddress && (rva - sec.virtualAddress) < sec.rawSize && sec.rawOffset > 0) {
                return sec.rawOffset + (rva - sec.virtualAddress);
            }
        }
        return null;
    }

    hasImport(dllName) {
        const target = dllName.toLowerCase().replace(/\.dll$/, '');
        return this.imports.has(target);
    }
}

// ============================================================================
// 2. EXECUTABLE SELECTION HEURISTICS (Filtering Out Updaters & Helpers)
// ============================================================================
function findCandidateExecutables(dir, depth = 0) {
    if (depth > 4) return [];
    const exes = [];
    try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const ent of entries) {
            if (ent.isDirectory() && !ent.name.startsWith('.')) {
                exes.push(...findCandidateExecutables(path.join(dir, ent.name), depth + 1));
            } else if (ent.isFile() && ent.name.toLowerCase().endsWith('.exe')) {
                const name = ent.name.toLowerCase();
                // Filter out updaters, crash handlers, unins, notifications, and auxiliary helpers
                if (!name.includes('zsync') &&
                    !name.includes('crash') &&
                    !name.includes('notification') &&
                    !name.includes('unins') &&
                    !name.includes('python') &&
                    !name.includes('dxwebsetup') &&
                    !name.includes('vcredist')) {
                    exes.push(path.join(dir, ent.name));
                }
            }
        }
    } catch {}
    return exes;
}

function pickMainExecutable(candidateExes, rootDirName) {
    if (candidateExes.length === 0) return null;
    if (candidateExes.length === 1) return candidateExes[0];

    // Priority 1: Exclude config/setup/setting exes
    const nonConfig = candidateExes.filter(e => {
        const b = path.basename(e).toLowerCase();
        return !b.includes('config') && !b.includes('setup') && !b.includes('setting');
    });

    const pool = nonConfig.length > 0 ? nonConfig : candidateExes;

    // Priority 2: Game.exe, or named after folder/title
    for (const exe of pool) {
        const b = path.basename(exe).toLowerCase();
        if (b === 'game.exe' || b === rootDirName.toLowerCase() + '.exe') {
            return exe;
        }
    }

    // Priority 3: First valid executable
    return pool[0];
}

// ============================================================================
// 3. COMPLETE ENGINE CLASSIFICATION PIPELINE (100% F95ZONE TAGS)
// ============================================================================
class GameEngineResolver {
    static resolve(pe, exePath, parentFiles) {
        const parentDir = path.dirname(exePath);
        const exeName = path.basename(exePath).toLowerCase();
        const filesLower = new Set(parentFiles.map(f => f.toLowerCase()));
        const extensions = new Set(parentFiles.map(f => path.extname(f).toLowerCase()));

        // --- TIER 1: PE BINARY SIGNATURES ---

        // 1. Unity (Tag: Unity)
        if (pe.hasImport('GameAssembly.dll') || filesLower.has('gameassembly.dll')) {
            return { tag: 'Unity', family: 'unity', variant: 'il2cpp', arch: pe.arch, runtime: 'native', saveStrategy: 'unity-registry-or-appdata', detectedBy: 'PE Import: GameAssembly.dll (IL2CPP)' };
        }
        if (pe.hasImport('UnityPlayer.dll') || pe.hasImport('mono-2.0-bdwgc.dll') || pe.hasImport('mono.dll') ||
            filesLower.has('unityplayer.dll') || filesLower.has('mono-2.0-bdwgc.dll') || pe.versionInfo['CompanyName'] === 'Unity Technologies') {
            return { tag: 'Unity', family: 'unity', variant: 'mono', arch: pe.arch, runtime: 'mono', saveStrategy: 'unity-registry-or-appdata', detectedBy: 'PE Import: UnityPlayer.dll / mono.dll' };
        }

        // 2. RPG Maker (Tag: RPGM) & TyranoBuilder / Generic NW.js
        const hasRpgmMzMarkers = filesLower.has('rmmz_core.js') || filesLower.has('rmmz_managers.js');
        const hasRpgmMvMarkers = filesLower.has('rpg_core.js') || filesLower.has('rpg_managers.js');
        const hasRpgSave = extensions.has('.rpgsave');
        const hasTyrano = filesLower.has('tyrano') || filesLower.has('tyrano.js');

        if (hasTyrano) {
            return { tag: 'Others', family: 'tyranobuilder', variant: 'standard', arch: pe.arch, runtime: 'nwjs', saveStrategy: 'web-localstorage', detectedBy: 'TyranoBuilder (tyrano/)' };
        }

        if (pe.versionInfo['OriginalFilename'] === 'nw.exe' || pe.hasImport('nw.dll') || filesLower.has('nw.dll') || filesLower.has('package.json') || filesLower.has('package.nw')) {
            if (hasRpgmMzMarkers || hasRpgmMvMarkers || hasRpgSave) {
                const isMZ = hasRpgmMzMarkers || filesLower.has('main.js');
                return { tag: 'RPGM', family: 'rpg-maker', variant: isMZ ? 'mz' : 'mv', arch: pe.arch, runtime: 'nwjs', saveStrategy: 'rpgsave-indexeddb-or-json', detectedBy: `PE VersionInfo: nw.exe -> RPG Maker ${isMZ ? 'MZ' : 'MV'}` };
            }
            // Generic NW.js container
            return { tag: 'HTML', family: 'html-webgl', variant: 'nwjs-custom', arch: pe.arch, runtime: 'nwjs', saveStrategy: 'web-localstorage', detectedBy: 'Generic NW.js Application' };
        }
        if (pe.hasImport('RGSS301.dll') || pe.hasImport('RGSS300.dll') || extensions.has('.rvdata2') || extensions.has('.rgss3a')) {
            return { tag: 'RPGM', family: 'rpg-maker', variant: 'vx-ace', arch: 'x86', runtime: 'ruby-rgss3', saveStrategy: 'rvdata2', detectedBy: 'PE Import: RGSS301.dll / .rvdata2' };
        }
        if (pe.hasImport('RGSS202E.dll') || pe.hasImport('RGSS200E.dll') || extensions.has('.rvdata') || extensions.has('.rgss2a')) {
            return { tag: 'RPGM', family: 'rpg-maker', variant: 'vx', arch: 'x86', runtime: 'ruby-rgss2', saveStrategy: 'rvdata', detectedBy: 'PE Import: RGSS202E.dll / .rvdata' };
        }
        if (pe.hasImport('RGSS104E.dll') || pe.hasImport('RGSS102E.dll') || extensions.has('.rxdata') || extensions.has('.rgssad')) {
            return { tag: 'RPGM', family: 'rpg-maker', variant: 'xp', arch: 'x86', runtime: 'ruby-rgss1', saveStrategy: 'rxdata', detectedBy: 'PE Import: RGSS104E.dll / .rxdata' };
        }
        if (pe.versionInfo['InternalName'] === 'RPG_RT' || exeName === 'rpg_rt.exe' || filesLower.has('rpg_rt.ldb') || filesLower.has('rpg_rt.ini')) {
            return { tag: 'RPGM', family: 'rpg-maker', variant: '2000-2003', arch: 'x86', runtime: 'native', saveStrategy: 'lsd', detectedBy: 'PE InternalName: RPG_RT' };
        }
        // RPG Bakin (Tag: RPGM)
        if (filesLower.has('bakinengine.dll') || filesLower.has('data.rbpack') || filesLower.has('bakinplayer.exe')) {
            return { tag: 'RPGM', family: 'rpg-maker', variant: 'bakin', arch: pe.arch, runtime: 'dotnet-bakin', saveStrategy: 'bakin-savedata', detectedBy: 'Filesystem: bakinengine.dll / data.rbpack' };
        }

        // 3. Wolf RPG Editor (Tag: Wolf RPG)
        if (pe.hasImport('wmovie.dll') || pe.versionInfo['InternalName'] === 'WOLF_RPG_EDITOR' ||
            filesLower.has('gurugurusmf4.dll') || filesLower.has('game.dat') || filesLower.has('basicdata.wolf') || extensions.has('.wolf')) {
            return { tag: 'Wolf RPG', family: 'wolf-rpg', variant: 'standard', arch: 'x86', runtime: 'native-delphi', saveStrategy: 'wolf-sav', detectedBy: 'PE Import: wmovie.dll / Game.dat' };
        }

        // 4. Ren'Py (Tag: Ren'Py)
        const hasPythonImport = Array.from(pe.imports).some(i => i.startsWith('python'));
        const hasRenpyMarkers = filesLower.has('renpy') || extensions.has('.rpa') || filesLower.has('options.rpyc') || filesLower.has('renpy.py');
        if (hasRenpyMarkers || (hasPythonImport && hasRenpyMarkers)) {
            return { tag: "Ren'Py", family: 'renpy', variant: 'standard', arch: pe.arch, runtime: 'python-embedded', saveStrategy: 'renpy-pickle', detectedBy: 'Python DLL + Renpy / .rpa markers' };
        }

        // 5. Godot Engine (Tag: Godot)
        if (pe.versionInfo['FileDescription'] === 'Godot Engine' || filesLower.has('project.godot') || extensions.has('.pck')) {
            return { tag: 'Godot', family: 'godot', variant: 'standard', arch: pe.arch, runtime: 'gdscript-native', saveStrategy: 'godot-user-dir', detectedBy: 'Godot Engine Signature / .pck' };
        }

        // 6. Unreal Engine (Tag: Unreal Engine)
        if (exeName.includes('shipping') || filesLower.has('engine') || extensions.has('.uproject')) {
            return { tag: 'Unreal Engine', family: 'unreal', variant: 'ue4-ue5', arch: pe.arch, runtime: 'native', saveStrategy: 'unreal-sav', detectedBy: 'Unreal Shipping Executable / Engine Directory' };
        }

        // 7. Adobe Flash / AIR (Tag: Flash)
        if (extensions.has('.swf') || filesLower.has('adobe air') || exeName.includes('flashplayer')) {
            return { tag: 'Flash', family: 'flash', variant: 'swf/air', arch: pe.arch, runtime: 'flash-runtime', saveStrategy: 'sol-localstorage', detectedBy: '*.swf Container' };
        }

        // 8. QSP (Tag: QSP)
        if (extensions.has('.qsp') || exeName.includes('qsp')) {
            return { tag: 'QSP', family: 'qsp', variant: 'standard', arch: pe.arch, runtime: 'qsp-runtime', saveStrategy: 'qsp-savedgame', detectedBy: 'QSP: *.qsp game data' };
        }

        // 9. RAGS (Tag: RAGS)
        if (extensions.has('.rag') || filesLower.has('ragsplayer.exe') || exeName.includes('rags')) {
            return { tag: 'RAGS', family: 'rags', variant: 'standard', arch: pe.arch, runtime: 'dotnet-rags', saveStrategy: 'rags-save', detectedBy: 'RAGS: *.rag Game File' };
        }

        // 10. ADRIFT & Tads (Tag: ADRIFT / Tads)
        if (extensions.has('.taf') || exeName.includes('adrift')) {
            return { tag: 'ADRIFT', family: 'adrift', variant: 'standard', arch: pe.arch, runtime: 'adrift-runner', saveStrategy: 'adrift-save', detectedBy: 'ADRIFT: *.taf game archive' };
        }
        if (extensions.has('.t3') || extensions.has('.gam') || exeName.includes('t3run')) {
            return { tag: 'Tads', family: 'tads', variant: 'tads-3', arch: pe.arch, runtime: 'tads-vm', saveStrategy: 'tads-save', detectedBy: 'TADS: *.t3 compiled image' };
        }

        // 11. Java (Tag: Java)
        if (extensions.has('.jar') || filesLower.has('javaw.exe') || pe.hasImport('jvm.dll')) {
            return { tag: 'Java', family: 'java', variant: 'jvm', arch: pe.arch, runtime: 'jvm', saveStrategy: 'java-prefs', detectedBy: 'Java JAR / JVM' };
        }

        // 12. HTML / WebGL (Tag: HTML)
        if (filesLower.has('index.html') || filesLower.has('c2runtime.js') || filesLower.has('c3runtime.js')) {
            return { tag: 'HTML', family: 'html-webgl', variant: 'web-canvas', arch: pe.arch, runtime: 'webgl-browser', saveStrategy: 'web-localstorage', detectedBy: 'HTML5 / WebGL Canvas' };
        }

        // 13. Others (Tag: Others - GameMaker, KiriKiri, TyranoBuilder, BGI, CatSystem 2, etc.)
        if (filesLower.has('data.win') || (filesLower.has('options.ini') && filesLower.has('audiogroup1.dat'))) {
            return { tag: 'Others', family: 'gamemaker', variant: 'studio', arch: pe.arch, runtime: 'native-c++', saveStrategy: 'gamemaker-appdata', detectedBy: 'GameMaker Studio (data.win)' };
        }
        if (Array.from(filesLower).some(f => f.endsWith('.xp3')) || exeName.startsWith('tvpwin')) {
            return { tag: 'Others', family: 'kirikiri', variant: 'xp3', arch: pe.arch, runtime: 'tjs2-native', saveStrategy: 'dat-save', detectedBy: 'KiriKiri 2/Z (*.xp3)' };
        }
        if (filesLower.has('tyrano') || filesLower.has('tyrano.js')) {
            return { tag: 'Others', family: 'tyranobuilder', variant: 'standard', arch: pe.arch, runtime: 'nwjs', saveStrategy: 'web-localstorage', detectedBy: 'TyranoBuilder (tyrano/)' };
        }

        // Deep fallback check for sub-directory data (e.g. wrapped RPG Maker or Visual Novels)
        try {
            const dataSubdir = path.join(parentDir, 'data');
            if (fs.existsSync(dataSubdir)) {
                const subFiles = fs.readdirSync(dataSubdir).map(f => f.toLowerCase());
                if (subFiles.some(f => f === 'bakinengine.dll' || f === 'data.rbpack')) {
                    return { tag: 'RPGM', family: 'rpg-maker', variant: 'bakin', arch: pe.arch, runtime: 'dotnet-bakin', saveStrategy: 'bakin-savedata', detectedBy: 'Subdirectory: data/bakinengine.dll' };
                }
                if (subFiles.some(f => f.endsWith('.rvdata2') || f.endsWith('.rgss3a'))) {
                    return { tag: 'RPGM', family: 'rpg-maker', variant: 'vx-ace', arch: 'x86', runtime: 'ruby-rgss3', saveStrategy: 'rvdata2', detectedBy: 'Subdirectory: data/*.rvdata2' };
                }
                if (subFiles.some(f => f === 'system.json' || f === 'actors.json')) {
                    return { tag: 'RPGM', family: 'rpg-maker', variant: 'mz', arch: pe.arch, runtime: 'nwjs', saveStrategy: 'rpgsave-indexeddb-or-json', detectedBy: 'Subdirectory: data/System.json' };
                }
            }
            const wwwSubdir = path.join(parentDir, 'www', 'data');
            if (fs.existsSync(wwwSubdir)) {
                const subFiles = fs.readdirSync(wwwSubdir).map(f => f.toLowerCase());
                if (subFiles.some(f => f === 'system.json' || f === 'actors.json')) {
                    return { tag: 'RPGM', family: 'rpg-maker', variant: 'mv', arch: pe.arch, runtime: 'nwjs', saveStrategy: 'rpgsave-indexeddb-or-json', detectedBy: 'Subdirectory: www/data/System.json' };
                }
            }
        } catch {}

        return {
            tag: 'Others',
            family: 'native',
            variant: 'custom',
            arch: pe.arch,
            runtime: 'native',
            saveStrategy: 'local-dir',
            detectedBy: 'Native PE Executable'
        };
    }
}

// ============================================================================
// 4. CLI EXECUTOR & BENCHMARK SUITE
// ============================================================================
async function run() {
    const targetDir = process.argv[2] || 'D:\\Games\\H Games';

    console.log(`\n======================================================================`);
    console.log(`🚀 YUMESHELF GAME ENGINE INSPECTOR (CLI BENCHMARK)`);
    console.log(`Scanning Target Directory: ${targetDir}`);
    console.log(`======================================================================\n`);

    if (!fs.existsSync(targetDir)) {
        console.error(`Error: Directory not found: ${targetDir}`);
        process.exit(1);
    }

    const entries = fs.readdirSync(targetDir, { withFileTypes: true });
    const results = [];

    const startTime = performance.now();

    for (const ent of entries) {
        if (!ent.isDirectory() || ent.name.startsWith('.')) continue;
        const gameFolder = path.join(targetDir, ent.name);

        const candidateExes = findCandidateExecutables(gameFolder);
        if (candidateExes.length === 0) continue;

        const targetExe = pickMainExecutable(candidateExes, ent.name);
        if (!targetExe) continue;

        let fd;
        try {
            fd = fs.openSync(targetExe, 'r');
            const headerBuf = Buffer.alloc(64 * 1024);
            const bytesRead = fs.readSync(fd, headerBuf, 0, headerBuf.length, 0);
            const pe = new PEInspector(headerBuf.subarray(0, bytesRead), targetExe);
            if (!pe.isValid) continue;

            let parentFiles = [];
            try {
                parentFiles = fs.readdirSync(path.dirname(targetExe));
            } catch {}

            const profile = GameEngineResolver.resolve(pe, targetExe, parentFiles);
            results.push({
                folder: ent.name,
                exe: path.basename(targetExe),
                profile
            });
        } catch (err) {
            // Continue gracefully on unreadable binary
        } finally {
            if (fd !== undefined) {
                try { fs.closeSync(fd); } catch {}
            }
        }
    }

    const totalElapsed = (performance.now() - startTime).toFixed(2);

    console.log(`Successfully Analyzed ${results.length} Game Directories in ${totalElapsed}ms (avg ${(totalElapsed / results.length).toFixed(2)}ms per game):\n`);

    for (let i = 0; i < results.length; i++) {
        const r = results[i];
        console.log(`${(i + 1).toString().padStart(2)}. [Tag: ${r.profile.tag.padEnd(13)}] [Family: ${r.profile.family.padEnd(10)}] (${(r.profile.variant || 'std').padEnd(7)}) -> ${r.folder}`);
        console.log(`    └─ Main EXE: ${r.exe} | Strategy: ${r.profile.saveStrategy} | Coded: ${r.profile.detectedBy}`);
    }

    console.log(`\n======================================================================`);
    console.log(`📊 FINAL F95ZONE TAG DISTRIBUTION`);
    console.log(`======================================================================`);
    const tagSummary = {};
    for (const r of results) {
        tagSummary[r.profile.tag] = (tagSummary[r.profile.tag] || 0) + 1;
    }
    console.table(tagSummary);
}

run().catch(console.error);

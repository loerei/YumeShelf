/// <reference types="node" />
/**
 * YumeEngine - Declarative Rules for Japanese Doujin & RPG Engines
 * (RPG Maker MV/MZ/VX Ace/VX/XP/2000-2003/Bakin, Ren'Py, Wolf RPG, TyranoBuilder)
 *
 * Derived from Detect-It-Easy & XPEViewer specifications by horsicq
 * MIT License - Copyright (c) horsicq / YumeShelf Contributors
 */

import type { EngineClassificationRule, ScanContext } from './types.js';
import type { GameEngineProfile } from '../types.js';

export const RPGMakerRule: EngineClassificationRule = {
  name: 'rpg-maker',
  priority: 60,
  async match(ctx: ScanContext): Promise<GameEngineProfile | null> {
    const { pe, exeName, filesLowerSet, extensionsSet, fs } = ctx;
    const arch = pe.is64Bit ? 'x64' : (pe.coffHeader.machine === 0x014c ? 'x86' : 'unknown');

    // 1. RPG Maker MV / MZ (NW.js / HTML5 Hybrid)
    const isNwContainer =
      pe.versionInfo?.originalFilename?.toLowerCase() === 'nw.exe' ||
      pe.versionInfo?.rawValues?.['OriginalFilename']?.toLowerCase() === 'nw.exe' ||
      pe.hasImport('nw.dll') ||
      filesLowerSet.has('nw.dll') ||
      filesLowerSet.has('package.nw') ||
      filesLowerSet.has('package.json');

    // Check for explicit RPG Maker MV / MZ markers
    let hasMzMarker =
      filesLowerSet.has('rmmz_core.js') ||
      filesLowerSet.has('rmmz_managers.js') ||
      filesLowerSet.has('rmmz_scenes.js');

    let hasMvMarker =
      filesLowerSet.has('rpg_core.js') ||
      filesLowerSet.has('rpg_managers.js') ||
      filesLowerSet.has('rpg_scenes.js');

    const hasRpgSave = extensionsSet.has('.rpgsave');

    // Check subdirectories for RPG Maker MV / MZ signatures if fs is provided
    if (fs && !hasMzMarker && !hasMvMarker) {
      try {
        if (await fs.exists(`${ctx.parentDir}/js/rmmz_core.js`)) {
          hasMzMarker = true;
        } else if (await fs.exists(`${ctx.parentDir}/data/System.json`) || await fs.exists(`${ctx.parentDir}/data/system.json`)) {
          if (await fs.exists(`${ctx.parentDir}/main.js`) || filesLowerSet.has('main.js')) {
            hasMzMarker = true;
          }
        }
      } catch {}

      try {
        if (
          (await fs.exists(`${ctx.parentDir}/js/rpg_core.js`)) ||
          (await fs.exists(`${ctx.parentDir}/www/js/rpg_core.js`)) ||
          (await fs.exists(`${ctx.parentDir}/www/js/main.js`)) ||
          (await fs.exists(`${ctx.parentDir}/www/save`))
        ) {
          hasMvMarker = true;
        } else if ((await fs.exists(`${ctx.parentDir}/www/data/System.json`)) || (await fs.exists(`${ctx.parentDir}/www/data/system.json`))) {
          hasMvMarker = true;
        }
      } catch {}
    }

    if (hasMzMarker || hasMvMarker || (isNwContainer && hasRpgSave)) {
      const isMZ = hasMzMarker || (!hasMvMarker && (filesLowerSet.has('main.js') || !filesLowerSet.has('www')));
      return {
        tag: 'RPGM',
        family: 'rpg-maker',
        variant: isMZ ? 'mz' : 'mv',
        arch,
        runtime: 'nwjs',
        saveStrategy: 'rpg-maker-mv-mz',
        detectedBy: `RPG Maker ${isMZ ? 'MZ' : 'MV'} (NW.js container)`,
      };
    }

    // 2. RGSS Archive Magic & File Inspector
    let rgssVariantFromArchive: 'vx-ace' | 'vx' | 'xp' | null = null;

    // Check archive magic if archive file exists and fs is available
    if (fs) {
      const archiveCandidate = ctx.parentFiles.find(f => {
        const lower = f.toLowerCase();
        return lower.endsWith('.rgss3a') || lower.endsWith('.rgss2a') || lower.endsWith('.rgssad') || lower === 'game.rgssad';
      });

      if (archiveCandidate) {
        try {
          const handle = await fs.open(`${ctx.parentDir}/${archiveCandidate}`);
          try {
            const head = await handle.read(0, 8);
            if (head && head.length >= 7) {
              const magicStr = head.toString('ascii', 0, 6);
              if (magicStr === 'RGSSAD') {
                const versionByte = head.length >= 8 ? head.readUInt8(7) : 1;
                if (versionByte === 3) rgssVariantFromArchive = 'vx-ace';
                else if (versionByte === 2) rgssVariantFromArchive = 'vx';
                else rgssVariantFromArchive = 'xp';
              } else if (head.toString('ascii', 0, 6) === 'RGSS3A' || head.toString('ascii', 0, 4) === 'RGSS3A') {
                rgssVariantFromArchive = 'vx-ace';
              } else if (head.toString('ascii', 0, 6) === 'RGSS2A' || head.toString('ascii', 0, 4) === 'RGSS2A') {
                rgssVariantFromArchive = 'vx';
              }
            }
          } finally {
            await handle.close();
          }
        } catch {}
      }

      // Check data/ subdirectory if no top-level archive found
      if (!rgssVariantFromArchive && filesLowerSet.has('data')) {
        try {
          if (await fs.exists(`${ctx.parentDir}/data`)) {
            const dataEntries = await fs.readdir(`${ctx.parentDir}/data`);
            const lowerEntries = dataEntries.map(e => e.toLowerCase());
            if (lowerEntries.some(e => e.endsWith('.rvdata2') || e.endsWith('.rgss3a'))) {
              rgssVariantFromArchive = 'vx-ace';
            } else if (lowerEntries.some(e => e.endsWith('.rvdata') || e.endsWith('.rgss2a'))) {
              rgssVariantFromArchive = 'vx';
            } else if (lowerEntries.some(e => e.endsWith('.rxdata') || e.endsWith('.rgssad'))) {
              rgssVariantFromArchive = 'xp';
            }
          }
        } catch {}
      }
    }

    // 3. RGSS3 (RPG Maker VX Ace)
    const hasRgss3Import =
      pe.hasImport('RGSS301.dll') ||
      pe.hasImport('RGSS300.dll') ||
      pe.hasImport('RGSS302.dll') ||
      filesLowerSet.has('rgss301.dll') ||
      filesLowerSet.has('rgss300.dll') ||
      filesLowerSet.has('rgss302.dll');

    const hasRgss3Files =
      extensionsSet.has('.rvdata2') ||
      extensionsSet.has('.rgss3a') ||
      filesLowerSet.has('game.rgss3a');

    if (hasRgss3Import || hasRgss3Files || rgssVariantFromArchive === 'vx-ace') {
      return {
        tag: 'RPGM',
        family: 'rpg-maker',
        variant: 'vx-ace',
        arch: 'x86',
        runtime: 'native',
        saveStrategy: 'rpg-maker-rgss',
        detectedBy: hasRgss3Import
          ? 'PE Import: RGSS301.dll (RPG Maker VX Ace)'
          : rgssVariantFromArchive === 'vx-ace'
          ? 'RGSS3 Archive Magic / Subdirectory Marker'
          : 'RPG Maker VX Ace (*.rvdata2 / *.rgss3a)',
      };
    }

    // 4. RGSS2 (RPG Maker VX)
    const hasRgss2Import =
      pe.hasImport('RGSS202E.dll') ||
      pe.hasImport('RGSS200E.dll') ||
      pe.hasImport('RGSS202J.dll') ||
      pe.hasImport('RGSS200J.dll') ||
      pe.hasImport('RGSS201E.dll') ||
      filesLowerSet.has('rgss202e.dll') ||
      filesLowerSet.has('rgss200e.dll');

    const hasRgss2Files =
      extensionsSet.has('.rvdata') ||
      extensionsSet.has('.rgss2a') ||
      filesLowerSet.has('game.rgss2a');

    if (hasRgss2Import || hasRgss2Files || rgssVariantFromArchive === 'vx') {
      return {
        tag: 'RPGM',
        family: 'rpg-maker',
        variant: 'vx',
        arch: 'x86',
        runtime: 'native',
        saveStrategy: 'rpg-maker-rgss',
        detectedBy: hasRgss2Import
          ? 'PE Import: RGSS202E.dll (RPG Maker VX)'
          : rgssVariantFromArchive === 'vx'
          ? 'RGSS2 Archive Magic / Subdirectory Marker'
          : 'RPG Maker VX (*.rvdata / *.rgss2a)',
      };
    }

    // 5. RGSS1 (RPG Maker XP)
    const hasRgss1Import =
      pe.hasImport('RGSS104E.dll') ||
      pe.hasImport('RGSS102E.dll') ||
      pe.hasImport('RGSS100J.dll') ||
      pe.hasImport('RGSS103J.dll') ||
      pe.hasImport('RGSS104J.dll') ||
      filesLowerSet.has('rgss104e.dll') ||
      filesLowerSet.has('rgss102e.dll');

    const hasRgss1Files =
      extensionsSet.has('.rxdata') ||
      extensionsSet.has('.rgssad') ||
      filesLowerSet.has('game.rgssad');

    if (hasRgss1Import || hasRgss1Files || rgssVariantFromArchive === 'xp') {
      return {
        tag: 'RPGM',
        family: 'rpg-maker',
        variant: 'xp',
        arch: 'x86',
        runtime: 'native',
        saveStrategy: 'rpg-maker-rgss',
        detectedBy: hasRgss1Import
          ? 'PE Import: RGSS104E.dll (RPG Maker XP)'
          : rgssVariantFromArchive === 'xp'
          ? 'RGSS1 Archive Magic / Subdirectory Marker'
          : 'RPG Maker XP (*.rxdata / *.rgssad)',
      };
    }

    // 6. RPG Maker 2000 / 2003 (RPG_RT)
    const isRpgRtVersion =
      pe.versionInfo?.internalName?.includes('RPG_RT') ||
      pe.versionInfo?.originalFilename?.includes('RPG_RT') ||
      pe.versionInfo?.rawValues?.['InternalName']?.includes('RPG_RT') ||
      pe.versionInfo?.fileDescription?.includes('RPG2000') ||
      pe.versionInfo?.fileDescription?.includes('RPG2003');

    const isRpgRtExe = exeName === 'rpg_rt.exe';
    const hasRpgRtFiles =
      filesLowerSet.has('rpg_rt.ldb') ||
      filesLowerSet.has('rpg_rt.ini') ||
      filesLowerSet.has('rpg_rt.lmt') ||
      filesLowerSet.has('harmony.dll');

    if (isRpgRtVersion || isRpgRtExe || hasRpgRtFiles) {
      return {
        tag: 'RPGM',
        family: 'rpg-maker',
        variant: '2000-2003',
        arch: 'x86',
        runtime: 'native',
        saveStrategy: 'rpg-maker-rgss',
        detectedBy: isRpgRtVersion
          ? 'PE VersionInfo: RPG_RT (RPG Maker 2000/2003)'
          : isRpgRtExe
          ? 'Executable Name: RPG_RT.exe'
          : 'Filesystem: RPG_RT.ldb / RPG_RT.ini',
      };
    }

    // 7. RPG Bakin & SMILE GAME BUILDER
    const hasBakinMarkers =
      pe.hasImport('bakinengine.dll') ||
      filesLowerSet.has('bakinengine.dll') ||
      filesLowerSet.has('data.rbpack') ||
      filesLowerSet.has('bakinplayer.exe') ||
      pe.versionInfo?.productName?.includes('Bakin') ||
      pe.versionInfo?.fileDescription?.includes('Bakin');

    let hasBakinSubdir = false;
    if (fs && !hasBakinMarkers && filesLowerSet.has('data')) {
      try {
        if (await fs.exists(`${ctx.parentDir}/data/bakinengine.dll`) || await fs.exists(`${ctx.parentDir}/data/data.rbpack`)) {
          hasBakinSubdir = true;
        }
      } catch {}
    }

    const hasSmileGameBuilder =
      filesLowerSet.has('data.sbpack') ||
      filesLowerSet.has('game.rpo') ||
      pe.versionInfo?.fileDescription?.includes('SmileGameBuilder') ||
      pe.versionInfo?.productName?.includes('SMILE GAME BUILDER');

    if (hasBakinMarkers || hasBakinSubdir || hasSmileGameBuilder) {
      return {
        tag: 'RPGM',
        family: 'rpg-maker',
        variant: 'bakin',
        arch,
        runtime: 'native',
        saveStrategy: 'custom',
        detectedBy: hasSmileGameBuilder
          ? 'SMILE GAME BUILDER (*.sbpack / Game.rpo)'
          : 'RPG Bakin (bakinengine.dll / data.rbpack)',
      };
    }

    return null;
  },
};

export const RenpyRule: EngineClassificationRule = {
  name: 'renpy',
  priority: 70,
  async match(ctx: ScanContext): Promise<GameEngineProfile | null> {
    const { pe, filesLowerSet, extensionsSet, fs } = ctx;
    const arch = pe.is64Bit ? 'x64' : (pe.coffHeader.machine === 0x014c ? 'x86' : 'unknown');

    // 1. Check for Python DLL imports in PE
    const hasPythonImport = Array.from(pe.importsSet).some(i => i.startsWith('python'));

    // 2. Check for Ren'Py filesystem markers
    let hasRenpyFiles =
      filesLowerSet.has('renpy') ||
      filesLowerSet.has('renpy.py') ||
      filesLowerSet.has('options.rpyc') ||
      filesLowerSet.has('script.rpy') ||
      extensionsSet.has('.rpa') ||
      extensionsSet.has('.rpy') ||
      extensionsSet.has('.rpyc') ||
      pe.versionInfo?.fileDescription?.includes("Ren'Py") ||
      pe.versionInfo?.comments?.includes("Ren'Py");

    // 3. Check game/ subdirectory for .rpa, .rpy, or .rpyc if fs is available
    if (!hasRenpyFiles && fs && filesLowerSet.has('game')) {
      try {
        if (await fs.exists(`${ctx.parentDir}/game`)) {
          const gameEntries = await fs.readdir(`${ctx.parentDir}/game`);
          const lowerEntries = gameEntries.map(e => e.toLowerCase());
          if (lowerEntries.some(e => e.endsWith('.rpa') || e.endsWith('.rpyc') || e.endsWith('.rpy') || e === 'options.rpyc' || e === 'script.rpy')) {
            hasRenpyFiles = true;
          }
        }
      } catch {}
    }

    // Only classify as Ren'Py if explicit Ren'Py markers are present (generic Python binaries default to Others/native)
    if (hasRenpyFiles) {
      return {
        tag: "Ren'Py",
        family: 'renpy',
        variant: 'standard',
        arch,
        runtime: 'python',
        saveStrategy: 'renpy-pickle',
        detectedBy: hasPythonImport
          ? 'Python DLL Import + Ren\'Py Markers (*.rpa / options.rpyc)'
          : 'Ren\'Py Structure (*.rpa / renpy/ directory)',
      };
    }

    return null;
  },
};

export const WolfRPGRule: EngineClassificationRule = {
  name: 'wolf-rpg',
  priority: 80,
  async match(ctx: ScanContext): Promise<GameEngineProfile | null> {
    const { pe, filesLowerSet, extensionsSet, fs } = ctx;

    const hasWolfImport =
      pe.hasImport('wmovie.dll') ||
      pe.hasImport('GuruguruSMF4.dll');

    const hasWolfVersionInfo =
      pe.versionInfo?.internalName?.includes('WOLF_RPG_EDITOR') ||
      pe.versionInfo?.internalName?.includes('WolfRPG') ||
      pe.versionInfo?.fileDescription?.includes('WOLF_RPG_EDITOR') ||
      pe.versionInfo?.productName?.includes('WOLF_RPG_EDITOR');

    let hasWolfFiles =
      filesLowerSet.has('wmovie.dll') ||
      filesLowerSet.has('gurugurusmf4.dll') ||
      filesLowerSet.has('game.dat') ||
      filesLowerSet.has('basicdata.wolf') ||
      filesLowerSet.has('data.wolf') ||
      filesLowerSet.has('game.wolf') ||
      extensionsSet.has('.wolf');

    // Check data/ subdirectory if fs is available
    if (!hasWolfFiles && fs && filesLowerSet.has('data')) {
      try {
        if (await fs.exists(`${ctx.parentDir}/data`)) {
          const dataEntries = await fs.readdir(`${ctx.parentDir}/data`);
          const lowerEntries = dataEntries.map(e => e.toLowerCase());
          if (lowerEntries.some(e => e.endsWith('.wolf') || e === 'basicdata.wolf' || e === 'data.wolf' || e === 'game.dat')) {
            hasWolfFiles = true;
          }
        }
      } catch {}
    }

    if (hasWolfImport || hasWolfVersionInfo || hasWolfFiles) {
      return {
        tag: 'Wolf RPG',
        family: 'wolf-rpg',
        variant: 'standard',
        arch: 'x86',
        runtime: 'native',
        saveStrategy: 'wolf-sav',
        detectedBy: hasWolfImport
          ? 'PE Import: wmovie.dll (Wolf RPG Editor)'
          : hasWolfVersionInfo
          ? 'PE VersionInfo: WOLF_RPG_EDITOR'
          : 'Wolf RPG Structure (Game.dat / BasicData.wolf)',
      };
    }

    return null;
  },
};

export const TyranoBuilderRule: EngineClassificationRule = {
  name: 'tyranobuilder',
  priority: 90,
  async match(ctx: ScanContext): Promise<GameEngineProfile | null> {
    const { pe, filesLowerSet, fs } = ctx;
    const arch = pe.is64Bit ? 'x64' : (pe.coffHeader.machine === 0x014c ? 'x86' : 'unknown');

    let hasTyranoMarker =
      filesLowerSet.has('tyrano') ||
      filesLowerSet.has('tyrano.js') ||
      pe.versionInfo?.fileDescription?.includes('TyranoBuilder') ||
      pe.versionInfo?.productName?.includes('TyranoBuilder');

    if (!hasTyranoMarker && fs) {
      try {
        if (await fs.exists(`${ctx.parentDir}/tyrano/tyrano.js`) || await fs.exists(`${ctx.parentDir}/data/scenario`)) {
          hasTyranoMarker = true;
        }
      } catch {}
    }

    if (hasTyranoMarker) {
      return {
        tag: 'Others',
        family: 'tyranobuilder',
        variant: 'standard',
        arch,
        runtime: 'nwjs',
        saveStrategy: 'custom',
        detectedBy: 'TyranoBuilder (tyrano/ / tyrano.js)',
      };
    }

    return null;
  },
};

export const DoujinAndRPGRules: EngineClassificationRule[] = [
  RPGMakerRule,
  RenpyRule,
  WolfRPGRule,
  TyranoBuilderRule,
];

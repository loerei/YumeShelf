/// <reference types="node" />
/**
 * YumeEngine - Declarative Rules for Classic Japanese Visual Novel Engines
 * (KiriKiri 2/Z, GameMaker Studio, CatSystem 2, BGI/Ethornell, SiglusEngine/RealLive,
 *  Nitroplus, SystemNNN, Majiro, NScripter, Artemis, Lilim, LiveMaker,
 *  AdvPlayer, Silky, Circus, M2/E-mote)
 *
 * Derived from Detect-It-Easy & XPEViewer specifications by horsicq
 * MIT License - Copyright (c) horsicq / YumeShelf Contributors
 */

import type { EngineClassificationRule, ScanContext } from './types.js';
import type { GameEngineProfile } from '../types.js';

export const GameMakerStudioRule: EngineClassificationRule = {
  name: 'gamemaker-studio',
  priority: 150,
  async match(ctx: ScanContext): Promise<GameEngineProfile | null> {
    const { pe, exeName, filesLowerSet, fs } = ctx;
    const arch = pe.is64Bit ? 'x64' : (pe.coffHeader.machine === 0x014c ? 'x86' : 'unknown');

    const hasDataWin = filesLowerSet.has('data.win');
    const hasGameMakerFiles =
      hasDataWin ||
      filesLowerSet.has('game.unx') ||
      filesLowerSet.has('game.ios') ||
      filesLowerSet.has('game.droid') ||
      (filesLowerSet.has('options.ini') && filesLowerSet.has('audiogroup1.dat')) ||
      (filesLowerSet.has('options.ini') && filesLowerSet.has('game.win'));

    const hasGameMakerImport =
      pe.hasImport('YoYo_Functions.dll') ||
      filesLowerSet.has('yoyo_functions.dll');

    const isGameMakerVinfo =
      pe.versionInfo?.fileDescription?.toLowerCase().includes('gamemaker') ||
      pe.versionInfo?.productName?.toLowerCase().includes('gamemaker') ||
      pe.versionInfo?.companyName?.toLowerCase().includes('yoyo games');

    // Check subdirectories if fs is available
    let hasSubdirDataWin = false;
    if (fs && !hasGameMakerFiles && !hasGameMakerImport && !isGameMakerVinfo) {
      try {
        if (await fs.exists(`${ctx.parentDir}/assets/data.win`)) {
          hasSubdirDataWin = true;
        }
      } catch {}
    }

    if (hasDataWin || hasSubdirDataWin || hasGameMakerFiles || hasGameMakerImport || isGameMakerVinfo) {
      return {
        tag: 'Others',
        family: 'gamemaker',
        variant: 'studio',
        arch,
        runtime: 'native',
        saveStrategy: 'gamemaker-appdata',
        detectedBy: hasDataWin
          ? 'GameMaker Studio (data.win)'
          : hasSubdirDataWin
          ? 'GameMaker Studio (assets/data.win)'
          : (filesLowerSet.has('options.ini') && filesLowerSet.has('audiogroup1.dat'))
          ? 'GameMaker Studio (audiogroup1.dat / options.ini)'
          : isGameMakerVinfo
          ? 'PE VersionInfo: GameMaker Studio (YoYo Games)'
          : 'GameMaker Studio',
      };
    }

    return null;
  },
};

export const KiriKiriRule: EngineClassificationRule = {
  name: 'kirikiri',
  priority: 160,
  async match(ctx: ScanContext): Promise<GameEngineProfile | null> {
    const { pe, exeName, filesLowerSet, extensionsSet, fs } = ctx;
    const arch = pe.is64Bit ? 'x64' : (pe.coffHeader.machine === 0x014c ? 'x86' : 'unknown');

    const isKiriKiriExe =
      exeName === 'tvpwin32.exe' ||
      exeName === 'tvpwin64.exe' ||
      exeName === 'krkr.exe' ||
      exeName === 'krkrz.exe' ||
      exeName.startsWith('tvpwin') ||
      exeName.startsWith('krkr');

    const isKiriKiriVinfo =
      pe.versionInfo?.originalFilename?.toLowerCase().includes('tvpwin') ||
      pe.versionInfo?.internalName?.toLowerCase().includes('tvpwin') ||
      pe.versionInfo?.fileDescription?.toLowerCase().includes('kirikiri') ||
      pe.versionInfo?.fileDescription?.toLowerCase().includes('kag') ||
      pe.versionInfo?.productName?.toLowerCase().includes('kirikiri') ||
      pe.versionInfo?.productName?.toLowerCase().includes('kag');

    const hasKiriKiriImport =
      pe.hasImport('tvpsnd.dll') ||
      pe.hasImport('tvpwin32.exe') ||
      filesLowerSet.has('tvpsnd.dll') ||
      filesLowerSet.has('plugin/tvpsnd.dll');

    const hasXp3Ext = extensionsSet.has('.xp3');
    const hasDataXp3 = filesLowerSet.has('data.xp3');

    let hasXp3Magic = false;
    if (fs && hasXp3Ext) {
      const xp3Candidate = ctx.parentFiles.find(f => f.toLowerCase().endsWith('.xp3'));
      if (xp3Candidate) {
        try {
          const handle = await fs.open(`${ctx.parentDir}/${xp3Candidate}`);
          try {
            const head = await handle.read(0, 16);
            if (head && head.length >= 8) {
              // XP3 header magic: 58 50 33 0D 0A 1A 0A 00 ('XP3\r\n\x1a\n\0') or starts with 'XP3'
              const magicStr = head.toString('ascii', 0, 3);
              if (
                magicStr === 'XP3' &&
                head[3] === 0x0d &&
                head[4] === 0x0a &&
                (head[5] === 0x1a || head[5] === 0x0a)
              ) {
                hasXp3Magic = true;
              } else if (magicStr === 'XP3') {
                hasXp3Magic = true;
              }
            }
          } finally {
            await handle.close();
          }
        } catch {}
      }
    }

    if (isKiriKiriExe || isKiriKiriVinfo || hasKiriKiriImport || hasXp3Ext || hasDataXp3 || hasXp3Magic) {
      const isZ =
        exeName.includes('krkrz') ||
        exeName.includes('64') ||
        pe.is64Bit ||
        pe.versionInfo?.fileDescription?.toLowerCase().includes('kirikiri z') ||
        pe.versionInfo?.productName?.toLowerCase().includes('kirikiri z');

      return {
        tag: 'Others',
        family: 'kirikiri',
        variant: isZ ? 'kirikiri-z' : 'xp3',
        arch,
        runtime: 'native',
        saveStrategy: 'custom',
        detectedBy: hasXp3Magic
          ? 'KiriKiri 2/Z Archive Magic (*.xp3 XP3\\r\\n\\n\\0)'
          : hasDataXp3
          ? 'KiriKiri 2/Z (data.xp3)'
          : hasXp3Ext
          ? 'KiriKiri 2/Z (*.xp3 Archive)'
          : isKiriKiriExe
          ? `KiriKiri Executable: ${ctx.exeName}`
          : isKiriKiriVinfo
          ? 'PE VersionInfo: KiriKiri / KAG'
          : 'KiriKiri 2/Z Engine',
      };
    }

    return null;
  },
};

export const CatSystemRule: EngineClassificationRule = {
  name: 'catsystem',
  priority: 170,
  async match(ctx: ScanContext): Promise<GameEngineProfile | null> {
    const { pe, exeName, filesLowerSet, extensionsSet, fs } = ctx;
    const arch = pe.is64Bit ? 'x64' : (pe.coffHeader.machine === 0x014c ? 'x86' : 'unknown');

    const isCs2Exe =
      exeName === 'cs2.exe' ||
      exeName === 'cs2_config.exe' ||
      exeName === 'catsystem.exe' ||
      exeName.startsWith('cs2');

    const isCs2Vinfo =
      pe.versionInfo?.fileDescription?.toLowerCase().includes('catsystem') ||
      pe.versionInfo?.productName?.toLowerCase().includes('catsystem') ||
      pe.versionInfo?.originalFilename?.toLowerCase().includes('cs2.exe') ||
      pe.versionInfo?.internalName?.toLowerCase().includes('catsystem');

    const hasCs2Files =
      filesLowerSet.has('scene.dat') ||
      filesLowerSet.has('scene.int') ||
      filesLowerSet.has('fes.int') ||
      filesLowerSet.has('cstitle.ini') ||
      filesLowerSet.has('cs2.ini') ||
      filesLowerSet.has('syscomm.int') ||
      filesLowerSet.has('system.int') ||
      filesLowerSet.has('config.int');

    const hasIntExt = extensionsSet.has('.int');

    let hasKifMagic = false;
    if (fs && (hasIntExt || hasCs2Files)) {
      const intCandidate = ctx.parentFiles.find(f => f.toLowerCase().endsWith('.int'));
      if (intCandidate) {
        try {
          const handle = await fs.open(`${ctx.parentDir}/${intCandidate}`);
          try {
            const head = await handle.read(0, 8);
            if (head && head.length >= 4) {
              // CatSystem KIF magic: 'KIF\0' (4B 49 46 00)
              if (
                head[0] === 0x4B &&
                head[1] === 0x49 &&
                head[2] === 0x46 &&
                head[3] === 0x00
              ) {
                hasKifMagic = true;
              }
            }
          } finally {
            await handle.close();
          }
        } catch {}
      }
    }

    if (isCs2Exe || isCs2Vinfo || hasCs2Files || hasKifMagic) {
      return {
        tag: 'Others',
        family: 'catsystem',
        variant: 'catsystem-2',
        arch,
        runtime: 'native',
        saveStrategy: 'custom',
        detectedBy: hasKifMagic
          ? 'CatSystem 2 Archive Magic (*.int KIF\\0)'
          : (filesLowerSet.has('scene.int') || filesLowerSet.has('fes.int'))
          ? 'CatSystem 2 (scene.int / fes.int)'
          : filesLowerSet.has('scene.dat')
          ? 'CatSystem 2 (scene.dat)'
          : isCs2Exe
          ? `CatSystem 2 Executable: ${ctx.exeName}`
          : 'CatSystem 2 Engine',
      };
    }

    return null;
  },
};

export const BGIEthornellRule: EngineClassificationRule = {
  name: 'bgi-ethornell',
  priority: 180,
  async match(ctx: ScanContext): Promise<GameEngineProfile | null> {
    const { pe, exeName, filesLowerSet, extensionsSet, fs } = ctx;
    const arch = pe.is64Bit ? 'x64' : (pe.coffHeader.machine === 0x014c ? 'x86' : 'unknown');

    const isBgiExe =
      exeName === 'bgi.exe' ||
      exeName === 'bgi_debug.exe' ||
      exeName.startsWith('bgi');

    const isBgiVinfo =
      pe.versionInfo?.fileDescription?.toLowerCase().includes('ethornell') ||
      pe.versionInfo?.fileDescription?.toLowerCase().includes('buriko') ||
      pe.versionInfo?.productName?.toLowerCase().includes('ethornell') ||
      pe.versionInfo?.productName?.toLowerCase().includes('bgi') ||
      pe.versionInfo?.originalFilename?.toLowerCase().includes('bgi.exe');

    const hasBgiFiles =
      filesLowerSet.has('sysgrp.arc') ||
      filesLowerSet.has('sysprg.arc') ||
      filesLowerSet.has('sysgrp.hdr') ||
      filesLowerSet.has('sysprg.hdr') ||
      filesLowerSet.has('bgi.arc') ||
      filesLowerSet.has('syssnd.arc');

    const hasArcExt = extensionsSet.has('.arc');

    let hasBurikoMagic = false;
    if (fs && (hasArcExt || hasBgiFiles)) {
      const arcCandidates = ctx.parentFiles.filter(f => f.toLowerCase().endsWith('.arc'));
      for (const arcFile of arcCandidates) {
        try {
          const handle = await fs.open(`${ctx.parentDir}/${arcFile}`);
          try {
            const head = await handle.read(0, 16);
            if (head && head.length >= 10) {
              // BURIKO ARC magic: 'BURIKO ARC' (42 55 52 49 4B 4F 20 41 52 43)
              const sig = head.toString('ascii', 0, 10);
              if (sig === 'BURIKO ARC') {
                hasBurikoMagic = true;
                break;
              }
            }
          } finally {
            await handle.close();
          }
        } catch {}
      }
    }

    if (isBgiExe || isBgiVinfo || hasBgiFiles || hasBurikoMagic) {
      return {
        tag: 'Others',
        family: 'bgi-ethornell',
        variant: 'ethornell',
        arch,
        runtime: 'native',
        saveStrategy: 'custom',
        detectedBy: hasBurikoMagic
          ? 'BGI / Ethornell Archive Magic (BURIKO ARC)'
          : (filesLowerSet.has('sysgrp.arc') && filesLowerSet.has('sysprg.arc'))
          ? 'BGI / Ethornell (SysGrp.arc / SysPrg.arc)'
          : hasBgiFiles
          ? 'BGI / Ethornell Filesystem Markers (*.arc / *.hdr)'
          : isBgiExe
          ? `BGI Executable: ${ctx.exeName}`
          : 'BGI / Ethornell Engine',
      };
    }

    return null;
  },
};

export const SiglusRealLiveRule: EngineClassificationRule = {
  name: 'siglus-reallive',
  priority: 190,
  async match(ctx: ScanContext): Promise<GameEngineProfile | null> {
    const { pe, exeName, filesLowerSet, extensionsSet, fs } = ctx;
    const arch = pe.is64Bit ? 'x64' : (pe.coffHeader.machine === 0x014c ? 'x86' : 'unknown');

    // 1. SiglusEngine
    const isSiglusExe =
      exeName === 'siglusengine.exe' ||
      exeName === 'siglusengine_steam.exe' ||
      exeName === 'siglus.exe' ||
      exeName === 'siglus_steam.exe' ||
      exeName.includes('siglus');

    const isSiglusVinfo =
      pe.versionInfo?.fileDescription?.toLowerCase().includes('siglusengine') ||
      pe.versionInfo?.productName?.toLowerCase().includes('siglusengine') ||
      pe.versionInfo?.originalFilename?.toLowerCase().includes('siglusengine');

    const hasSiglusFiles =
      filesLowerSet.has('scene.pck') ||
      filesLowerSet.has('siglusengine.dll') ||
      filesLowerSet.has('g00') ||
      (filesLowerSet.has('gameexe.dat') && isSiglusExe);

    let hasG00Dir = false;
    if (fs && (isSiglusExe || hasSiglusFiles || filesLowerSet.has('g00'))) {
      try {
        if (await fs.exists(`${ctx.parentDir}/g00`)) {
          hasG00Dir = true;
        }
      } catch {}
    }

    if (isSiglusExe || isSiglusVinfo || hasSiglusFiles || hasG00Dir) {
      return {
        tag: 'Others',
        family: 'siglus-reallive',
        variant: 'siglus',
        arch,
        runtime: 'native',
        saveStrategy: 'custom',
        detectedBy: filesLowerSet.has('scene.pck')
          ? 'SiglusEngine (scene.pck)'
          : hasG00Dir
          ? 'SiglusEngine (g00/ directory)'
          : isSiglusExe
          ? `SiglusEngine Executable: ${ctx.exeName}`
          : 'SiglusEngine (VisualArt\'s)',
      };
    }

    // 2. RealLive
    const isRealLiveExe =
      exeName === 'reallive.exe' ||
      exeName === 'reallive_utf8.exe' ||
      exeName === 'reallivedebug.exe' ||
      exeName.includes('reallive');

    const isRealLiveVinfo =
      pe.versionInfo?.fileDescription?.toLowerCase().includes('reallive') ||
      pe.versionInfo?.productName?.toLowerCase().includes('reallive') ||
      pe.versionInfo?.originalFilename?.toLowerCase().includes('reallive');

    const hasRealLiveFiles =
      filesLowerSet.has('seen.txt') ||
      (filesLowerSet.has('gameexe.dat') && (isRealLiveExe || extensionsSet.has('.g00') || extensionsSet.has('.nwa'))) ||
      filesLowerSet.has('reallive.dll') ||
      extensionsSet.has('.g00') ||
      extensionsSet.has('.nwa');

    if (isRealLiveExe || isRealLiveVinfo || hasRealLiveFiles) {
      return {
        tag: 'Others',
        family: 'siglus-reallive',
        variant: 'reallive',
        arch,
        runtime: 'native',
        saveStrategy: 'custom',
        detectedBy: (filesLowerSet.has('gameexe.dat') && filesLowerSet.has('seen.txt'))
          ? 'RealLive Engine (Gameexe.dat / Seen.txt)'
          : (extensionsSet.has('.g00') || extensionsSet.has('.nwa'))
          ? 'RealLive Engine (*.g00 / *.nwa / Gameexe.dat)'
          : isRealLiveExe
          ? `RealLive Executable: ${ctx.exeName}`
          : 'RealLive Engine (VisualArt\'s)',
      };
    }

    return null;
  },
};

export const NitroplusRule: EngineClassificationRule = {
  name: 'nitroplus',
  priority: 200,
  async match(ctx: ScanContext): Promise<GameEngineProfile | null> {
    const { pe, exeName, filesLowerSet, extensionsSet, fs } = ctx;
    const arch = pe.is64Bit ? 'x64' : (pe.coffHeader.machine === 0x014c ? 'x86' : 'unknown');

    const isNitroExe =
      exeName === 'nitroplus.exe' ||
      exeName === 'nitro.exe' ||
      exeName.includes('nitroplus') ||
      exeName.includes('nitrosystem');

    const isNitroVinfo =
      pe.versionInfo?.fileDescription?.toLowerCase().includes('nitroplus') ||
      pe.versionInfo?.productName?.toLowerCase().includes('nitroplus') ||
      pe.versionInfo?.companyName?.toLowerCase().includes('nitroplus');

    const hasNlsData = filesLowerSet.has('nlsdata.bin');
    const hasNpkExt = extensionsSet.has('.npk');
    const hasNpaExt = extensionsSet.has('.npa');
    const hasNitroFiles =
      hasNlsData ||
      hasNpkExt ||
      hasNpaExt ||
      filesLowerSet.has('nitro.arc') ||
      filesLowerSet.has('npk.bin');

    let hasNpkMagic = false;
    if (fs && (hasNpkExt || hasNpaExt || hasNlsData)) {
      const npkCandidate = ctx.parentFiles.find(f => {
        const lower = f.toLowerCase();
        return lower.endsWith('.npk') || lower.endsWith('.npa');
      });

      if (npkCandidate) {
        try {
          const handle = await fs.open(`${ctx.parentDir}/${npkCandidate}`);
          try {
            const head = await handle.read(0, 8);
            if (head && head.length >= 3) {
              // NPK Magic: 'NPK\0' or starts with 'NPK' / 'NPA'
              const magic = head.toString('ascii', 0, 3);
              if (magic === 'NPK' || magic === 'NPA') {
                hasNpkMagic = true;
              }
            }
          } finally {
            await handle.close();
          }
        } catch {}
      }
    }

    if (isNitroExe || isNitroVinfo || hasNitroFiles || hasNpkMagic) {
      return {
        tag: 'Others',
        family: 'nitroplus',
        variant: 'standard',
        arch,
        runtime: 'native',
        saveStrategy: 'custom',
        detectedBy: hasNpkMagic
          ? 'Nitroplus Engine Archive Magic (*.npk NPK)'
          : hasNlsData
          ? 'Nitroplus Engine (nlsdata.bin / *.npk)'
          : (hasNpkExt || hasNpaExt)
          ? 'Nitroplus Engine (*.npk / *.npa archive)'
          : isNitroExe
          ? `Nitroplus Executable: ${ctx.exeName}`
          : 'Nitroplus Engine (Nitro+)',
      };
    }

    return null;
  },
};

export const MajiroRule: EngineClassificationRule = {
  name: 'majiro',
  priority: 210,
  async match(ctx: ScanContext): Promise<GameEngineProfile | null> {
    const { pe, exeName, filesLowerSet } = ctx;
    const arch = pe.is64Bit ? 'x64' : (pe.coffHeader.machine === 0x014c ? 'x86' : 'unknown');

    const hasMajiroImport =
      pe.hasImport('MajiroObjX.dll') ||
      pe.hasImport('MajiroObj.dll') ||
      pe.hasImport('MajiroObjX') ||
      pe.hasImport('MajiroObj');

    const hasMajiroDll =
      filesLowerSet.has('majiroobjx.dll') ||
      filesLowerSet.has('majiroobj.dll') ||
      filesLowerSet.has('majirov.dll');

    const isMajiroExe =
      exeName === 'majiro.exe' ||
      exeName.includes('majiro');

    const isMajiroVinfo =
      pe.versionInfo?.fileDescription?.toLowerCase().includes('majiro') ||
      pe.versionInfo?.productName?.toLowerCase().includes('majiro');

    const hasMajiroFiles =
      filesLowerSet.has('scenario.arc') ||
      filesLowerSet.has('mjp.arc') ||
      (filesLowerSet.has('data.arc') && (hasMajiroDll || isMajiroExe || hasMajiroImport)) ||
      filesLowerSet.has('data01000.arc');

    if (hasMajiroImport || hasMajiroDll || isMajiroExe || isMajiroVinfo || hasMajiroFiles) {
      return {
        tag: 'Others',
        family: 'majiro',
        variant: 'standard',
        arch,
        runtime: 'native',
        saveStrategy: 'custom',
        detectedBy: hasMajiroImport
          ? 'PE Import: MajiroObjX.dll (Majiro Engine)'
          : hasMajiroDll
          ? 'Majiro Engine (MajiroObjX.dll)'
          : filesLowerSet.has('scenario.arc')
          ? 'Majiro Engine (scenario.arc / data.arc)'
          : isMajiroExe
          ? `Majiro Executable: ${ctx.exeName}`
          : 'Majiro Engine',
      };
    }

    return null;
  },
};

export const NScripterRule: EngineClassificationRule = {
  name: 'nscripter',
  priority: 220,
  async match(ctx: ScanContext): Promise<GameEngineProfile | null> {
    const { pe, exeName, filesLowerSet, extensionsSet } = ctx;
    const arch = pe.is64Bit ? 'x64' : (pe.coffHeader.machine === 0x014c ? 'x86' : 'unknown');

    const isNscripterExe =
      exeName === 'nscript.exe' ||
      exeName === 'onscripter.exe' ||
      exeName === 'onscripter-en.exe' ||
      exeName === 'onscripter-ru.exe' ||
      exeName === 'onscripter-zh.exe' ||
      exeName === 'nscr.exe' ||
      exeName.includes('nscript') ||
      exeName.includes('onscripter');

    const isNscripterVinfo =
      pe.versionInfo?.fileDescription?.toLowerCase().includes('nscripter') ||
      pe.versionInfo?.fileDescription?.toLowerCase().includes('onscripter') ||
      pe.versionInfo?.productName?.toLowerCase().includes('nscripter') ||
      pe.versionInfo?.productName?.toLowerCase().includes('onscripter');

    const hasNscriptDat = filesLowerSet.has('nscript.dat');
    const hasZeroTxt = filesLowerSet.has('0.txt') || filesLowerSet.has('00.txt');
    const hasNsaExt = extensionsSet.has('.nsa') || extensionsSet.has('.sar');
    const hasNscripterFiles =
      hasNscriptDat ||
      (hasZeroTxt && (filesLowerSet.has('default.ttf') || hasNsaExt || isNscripterExe)) ||
      filesLowerSet.has('arc.nsa') ||
      filesLowerSet.has('arc1.nsa') ||
      filesLowerSet.has('envdata');

    if (isNscripterExe || isNscripterVinfo || hasNscripterFiles) {
      const isOnscripter =
        exeName.includes('onscripter') ||
        pe.versionInfo?.fileDescription?.toLowerCase().includes('onscripter');

      return {
        tag: 'Others',
        family: 'nscripter',
        variant: isOnscripter ? 'onscripter' : 'nscripter',
        arch,
        runtime: 'native',
        saveStrategy: 'custom',
        detectedBy: hasNscriptDat
          ? 'NScripter (nscript.dat / 0.txt)'
          : (hasZeroTxt && filesLowerSet.has('default.ttf'))
          ? 'NScripter / ONScripter (0.txt / default.ttf)'
          : filesLowerSet.has('arc.nsa')
          ? 'NScripter (*.nsa Archive)'
          : isNscripterExe
          ? `NScripter Executable: ${ctx.exeName}`
          : 'NScripter Engine',
      };
    }

    return null;
  },
};

export const ArtemisRule: EngineClassificationRule = {
  name: 'artemis',
  priority: 230,
  async match(ctx: ScanContext): Promise<GameEngineProfile | null> {
    const { pe, exeName, filesLowerSet, extensionsSet, fs } = ctx;
    const arch = pe.is64Bit ? 'x64' : (pe.coffHeader.machine === 0x014c ? 'x86' : 'unknown');

    const isArtemisExe =
      exeName === 'artemis.exe' ||
      exeName === 'artemis64.exe' ||
      exeName.includes('artemis');

    const isArtemisVinfo =
      pe.versionInfo?.fileDescription?.toLowerCase().includes('artemis') ||
      pe.versionInfo?.productName?.toLowerCase().includes('artemis');

    const hasRootPfs = filesLowerSet.has('root.pfs');
    const hasPfsExt = extensionsSet.has('.pfs');
    const hasArtemisFiles =
      hasRootPfs ||
      filesLowerSet.has('system.pfs') ||
      filesLowerSet.has('artemis.dll') ||
      (hasPfsExt && (isArtemisExe || isArtemisVinfo));

    let hasPfsMagic = false;
    if (fs && (hasPfsExt || hasRootPfs)) {
      const pfsCandidate = ctx.parentFiles.find(f => f.toLowerCase().endsWith('.pfs'));
      if (pfsCandidate) {
        try {
          const handle = await fs.open(`${ctx.parentDir}/${pfsCandidate}`);
          try {
            const head = await handle.read(0, 8);
            if (head && head.length >= 3) {
              const sig = head.toString('ascii', 0, 3);
              if (sig === 'pf8' || sig === 'pfs' || sig === 'PFS') {
                hasPfsMagic = true;
              }
            }
          } finally {
            await handle.close();
          }
        } catch {}
      }
    }

    if (isArtemisExe || isArtemisVinfo || hasArtemisFiles || hasPfsMagic) {
      return {
        tag: 'Others',
        family: 'artemis',
        variant: 'standard',
        arch,
        runtime: 'native',
        saveStrategy: 'custom',
        detectedBy: hasPfsMagic
          ? 'Artemis Engine Archive Magic (*.pfs)'
          : hasRootPfs
          ? 'Artemis Engine (root.pfs)'
          : isArtemisExe
          ? `Artemis Executable: ${ctx.exeName}`
          : 'Artemis Engine (*.pfs)',
      };
    }

    return null;
  },
};

export const LilimRule: EngineClassificationRule = {
  name: 'lilim',
  priority: 240,
  async match(ctx: ScanContext): Promise<GameEngineProfile | null> {
    const { pe, exeName, filesLowerSet, extensionsSet } = ctx;
    const arch = pe.is64Bit ? 'x64' : (pe.coffHeader.machine === 0x014c ? 'x86' : 'unknown');

    const isLilimExe =
      exeName === 'lilim.exe' ||
      exeName === 'aoi.exe' ||
      exeName === 'lilim_run.exe' ||
      exeName.includes('lilim');

    const isLilimVinfo =
      pe.versionInfo?.fileDescription?.toLowerCase().includes('lilim') ||
      pe.versionInfo?.productName?.toLowerCase().includes('lilim') ||
      pe.versionInfo?.companyName?.toLowerCase().includes('lilim');

    const hasAoiExt = extensionsSet.has('.aoi');
    const hasLilimFiles =
      hasAoiExt ||
      filesLowerSet.has('sys.aoi') ||
      filesLowerSet.has('data.aoi') ||
      filesLowerSet.has('voice.aoi');

    if (isLilimExe || isLilimVinfo || hasLilimFiles) {
      return {
        tag: 'Others',
        family: 'lilim',
        variant: 'standard',
        arch,
        runtime: 'native',
        saveStrategy: 'custom',
        detectedBy: hasAoiExt
          ? 'Lilim Engine (*.aoi Archive)'
          : isLilimExe
          ? `Lilim Executable: ${ctx.exeName}`
          : 'Lilim Engine (LiLiM)',
      };
    }

    return null;
  },
};

export const LiveMakerRule: EngineClassificationRule = {
  name: 'livemaker',
  priority: 250,
  async match(ctx: ScanContext): Promise<GameEngineProfile | null> {
    const { pe, exeName, filesLowerSet, extensionsSet } = ctx;
    const arch = pe.is64Bit ? 'x64' : (pe.coffHeader.machine === 0x014c ? 'x86' : 'unknown');

    const isLiveMakerExe =
      exeName === 'live.exe' ||
      exeName === 'livepreview.exe' ||
      exeName === 'livemaker.exe' ||
      exeName.includes('livemaker');

    const isLiveMakerVinfo =
      pe.versionInfo?.fileDescription?.toLowerCase().includes('livemaker') ||
      pe.versionInfo?.productName?.toLowerCase().includes('livemaker') ||
      pe.versionInfo?.companyName?.toLowerCase().includes('human balance');

    const hasPylExt = extensionsSet.has('.pyl');
    const hasLiveMakerFiles =
      hasPylExt ||
      filesLowerSet.has('game.pyl') ||
      filesLowerSet.has('live.dll') ||
      filesLowerSet.has('livepreview.exe');

    if (isLiveMakerExe || isLiveMakerVinfo || hasLiveMakerFiles) {
      return {
        tag: 'Others',
        family: 'livemaker',
        variant: 'standard',
        arch,
        runtime: 'native',
        saveStrategy: 'custom',
        detectedBy: hasPylExt
          ? 'LiveMaker Engine (*.pyl / Live.exe)'
          : isLiveMakerExe
          ? `LiveMaker Executable: ${ctx.exeName}`
          : 'LiveMaker Engine (HUMAN BALANCE)',
      };
    }

    return null;
  },
};

export const AdvPlayerRule: EngineClassificationRule = {
  name: 'advplayer',
  priority: 260,
  async match(ctx: ScanContext): Promise<GameEngineProfile | null> {
    const { pe, exeName, filesLowerSet, extensionsSet } = ctx;
    const arch = pe.is64Bit ? 'x64' : (pe.coffHeader.machine === 0x014c ? 'x86' : 'unknown');

    const isAdvPlayerExe =
      exeName === 'advplayer.exe' ||
      exeName === 'advplayerhd.exe' ||
      exeName === 'advplayer_steam.exe' ||
      exeName.includes('advplayer');

    const isAdvPlayerVinfo =
      pe.versionInfo?.fileDescription?.toLowerCase().includes('advplayer') ||
      pe.versionInfo?.productName?.toLowerCase().includes('advplayer') ||
      pe.versionInfo?.companyName?.toLowerCase().includes('interheart');

    const hasAdvPlayerImport =
      pe.hasImport('AdvPlayer.dll') ||
      pe.hasImport('AdvPlayerHD.dll') ||
      filesLowerSet.has('advplayer.dll');

    const hasMpkExt = extensionsSet.has('.mpk');
    const hasAdvPlayerFiles =
      hasAdvPlayerImport ||
      filesLowerSet.has('data.mpk') ||
      filesLowerSet.has('sys.mpk') ||
      (hasMpkExt && isAdvPlayerExe);

    if (isAdvPlayerExe || isAdvPlayerVinfo || hasAdvPlayerFiles) {
      return {
        tag: 'Others',
        family: 'advplayer',
        variant: 'standard',
        arch,
        runtime: 'native',
        saveStrategy: 'custom',
        detectedBy: hasAdvPlayerImport
          ? 'PE Import: AdvPlayer.dll'
          : hasMpkExt
          ? 'AdvPlayer Engine (*.mpk / AdvPlayer.exe)'
          : isAdvPlayerExe
          ? `AdvPlayer Executable: ${ctx.exeName}`
          : 'AdvPlayer Engine (Interheart)',
      };
    }

    return null;
  },
};

export const SilkyRule: EngineClassificationRule = {
  name: 'silky',
  priority: 270,
  async match(ctx: ScanContext): Promise<GameEngineProfile | null> {
    const { pe, exeName, filesLowerSet } = ctx;
    const arch = pe.is64Bit ? 'x64' : (pe.coffHeader.machine === 0x014c ? 'x86' : 'unknown');

    const isSilkyExe =
      exeName === 'silky.exe' ||
      exeName === 'silkys.exe' ||
      exeName === 'ai6win.exe' ||
      exeName === 'ai5win.exe' ||
      exeName.includes('silky') ||
      exeName.includes('ai6win');

    const isSilkyVinfo =
      pe.versionInfo?.fileDescription?.toLowerCase().includes('silky') ||
      pe.versionInfo?.fileDescription?.toLowerCase().includes('ai6win') ||
      pe.versionInfo?.productName?.toLowerCase().includes('silky') ||
      pe.versionInfo?.companyName?.toLowerCase().includes('silky');

    const hasSilkyFiles =
      filesLowerSet.has('ai6win.exe') ||
      filesLowerSet.has('silky.ini') ||
      (filesLowerSet.has('arc.dat') && isSilkyExe);

    if (isSilkyExe || isSilkyVinfo || hasSilkyFiles) {
      return {
        tag: 'Others',
        family: 'silky',
        variant: 'standard',
        arch,
        runtime: 'native',
        saveStrategy: 'custom',
        detectedBy: isSilkyExe
          ? `Silky Engine Executable: ${ctx.exeName}`
          : isSilkyVinfo
          ? 'PE VersionInfo: Silky\'s / AI6WIN'
          : 'Silky\'s / AI6WIN Engine',
      };
    }

    return null;
  },
};

export const SystemNNNRule: EngineClassificationRule = {
  name: 'system-nnn',
  priority: 280,
  async match(ctx: ScanContext): Promise<GameEngineProfile | null> {
    const { pe, exeName, filesLowerSet, fs } = ctx;
    const arch = pe.is64Bit ? 'x64' : (pe.coffHeader.machine === 0x014c ? 'x86' : 'unknown');

    const isSystemNnnExe =
      exeName === 'system39.exe' ||
      exeName === 'systemnnn.exe' ||
      exeName === 's39.exe' ||
      exeName === 'nnnconfig.exe' ||
      exeName.includes('system39') ||
      exeName.includes('systemnnn');

    const isSystemNnnVinfo =
      pe.versionInfo?.fileDescription?.toLowerCase().includes('system39') ||
      pe.versionInfo?.fileDescription?.toLowerCase().includes('systemnnn') ||
      pe.versionInfo?.productName?.toLowerCase().includes('system39') ||
      pe.versionInfo?.productName?.toLowerCase().includes('system-nnn');

    let hasN3nDir = filesLowerSet.has('n3n') || filesLowerSet.has('s39');
    if (fs && !hasN3nDir) {
      try {
        if ((await fs.exists(`${ctx.parentDir}/n3n`)) || (await fs.exists(`${ctx.parentDir}/s39`))) {
          hasN3nDir = true;
        }
      } catch {}
    }

    const hasSystemNnnFiles =
      hasN3nDir ||
      filesLowerSet.has('system39.ini') ||
      filesLowerSet.has('nnndata.arc') ||
      filesLowerSet.has('n3n.dll');

    if (isSystemNnnExe || isSystemNnnVinfo || hasSystemNnnFiles) {
      return {
        tag: 'Others',
        family: 'system-nnn',
        variant: 'system39',
        arch,
        runtime: 'native',
        saveStrategy: 'custom',
        detectedBy: hasN3nDir
          ? 'SystemNNN / System39 (n3n/ directory)'
          : isSystemNnnExe
          ? `SystemNNN Executable: ${ctx.exeName}`
          : 'SystemNNN / System39 Engine',
      };
    }

    return null;
  },
};

export const CircusRule: EngineClassificationRule = {
  name: 'circus',
  priority: 290,
  async match(ctx: ScanContext): Promise<GameEngineProfile | null> {
    const { pe, exeName, filesLowerSet, extensionsSet } = ctx;
    const arch = pe.is64Bit ? 'x64' : (pe.coffHeader.machine === 0x014c ? 'x86' : 'unknown');

    const isCircusExe =
      exeName === 'circus.exe' ||
      exeName === 'escrude.exe' ||
      exeName === 'circusadv.exe' ||
      exeName.includes('circus') ||
      exeName.includes('escrude');

    const isCircusVinfo =
      pe.versionInfo?.fileDescription?.toLowerCase().includes('circus') ||
      pe.versionInfo?.fileDescription?.toLowerCase().includes('escrude') ||
      pe.versionInfo?.productName?.toLowerCase().includes('circus') ||
      pe.versionInfo?.companyName?.toLowerCase().includes('circus');

    const hasCrxExt = extensionsSet.has('.crx');
    const hasCircusFiles =
      hasCrxExt ||
      filesLowerSet.has('data.crx') ||
      filesLowerSet.has('escrude.dll') ||
      filesLowerSet.has('circus.ini');

    if (isCircusExe || isCircusVinfo || hasCircusFiles) {
      return {
        tag: 'Others',
        family: 'circus',
        variant: 'escrude',
        arch,
        runtime: 'native',
        saveStrategy: 'custom',
        detectedBy: hasCrxExt
          ? 'Circus / ESCRUDE (*.crx Archive)'
          : isCircusExe
          ? `Circus Executable: ${ctx.exeName}`
          : 'Circus / ESCRUDE Engine',
      };
    }

    return null;
  },
};

export const EmoteRule: EngineClassificationRule = {
  name: 'emote',
  priority: 300,
  async match(ctx: ScanContext): Promise<GameEngineProfile | null> {
    const { pe, exeName, filesLowerSet, extensionsSet } = ctx;
    const arch = pe.is64Bit ? 'x64' : (pe.coffHeader.machine === 0x014c ? 'x86' : 'unknown');

    const hasEmoteImport =
      pe.hasImport('emotedriver.dll') ||
      pe.hasImport('emotedriver64.dll') ||
      pe.hasImport('m2engine.dll');

    const hasEmoteFiles =
      filesLowerSet.has('emotedriver.dll') ||
      filesLowerSet.has('emotedriver64.dll') ||
      filesLowerSet.has('m2engine.dll') ||
      filesLowerSet.has('m2engine.exe') ||
      extensionsSet.has('.psb') ||
      extensionsSet.has('.m2b');

    const isEmoteExe =
      exeName === 'm2engine.exe' ||
      exeName.includes('emote') ||
      exeName.includes('m2engine');

    if (hasEmoteImport || hasEmoteFiles || isEmoteExe) {
      return {
        tag: 'Others',
        family: 'emote',
        variant: 'standard',
        arch,
        runtime: 'native',
        saveStrategy: 'custom',
        detectedBy: hasEmoteImport
          ? 'PE Import: emotedriver.dll (M2 / E-mote)'
          : hasEmoteFiles
          ? 'M2 / E-mote (emotedriver.dll / *.psb)'
          : `M2 / E-mote Executable: ${ctx.exeName}`,
      };
    }

    return null;
  },
};

export const ClassicVisualNovelRules: EngineClassificationRule[] = [
  GameMakerStudioRule,
  KiriKiriRule,
  CatSystemRule,
  BGIEthornellRule,
  SiglusRealLiveRule,
  NitroplusRule,
  MajiroRule,
  NScripterRule,
  ArtemisRule,
  LilimRule,
  LiveMakerRule,
  AdvPlayerRule,
  SilkyRule,
  SystemNNNRule,
  CircusRule,
  EmoteRule,
];

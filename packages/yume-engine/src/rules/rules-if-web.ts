/// <reference types="node" />
/**
 * YumeEngine - Declarative Rules for Interactive Fiction & HTML5/WebGL Engines
 * (QSP, RAGS, ADRIFT, TADS, Twine, Construct, NW.js, Electron, Tauri, Neutralino, HTML5)
 *
 * Derived from Detect-It-Easy & XPEViewer specifications by horsicq
 * MIT License - Copyright (c) horsicq / YumeShelf Contributors
 */

import type { EngineClassificationRule, ScanContext } from './types.js';
import type { GameEngineProfile } from '../types.js';

export const QSPRule: EngineClassificationRule = {
  name: 'qsp',
  priority: 100,
  async match(ctx: ScanContext): Promise<GameEngineProfile | null> {
    const { pe, exeName, filesLowerSet, extensionsSet, fs } = ctx;
    const arch = pe.is64Bit ? 'x64' : (pe.coffHeader.machine === 0x014c ? 'x86' : 'unknown');

    const isQspExe =
      exeName.includes('qsp') ||
      exeName === 'qspgui.exe' ||
      exeName === 'qsp.exe' ||
      pe.versionInfo?.originalFilename?.toLowerCase().includes('qsp') ||
      pe.versionInfo?.productName?.toLowerCase().includes('qsp') ||
      pe.versionInfo?.fileDescription?.toLowerCase().includes('qsp');

    const isQuestExe =
      exeName === 'quest.exe' ||
      exeName.includes('questsoft') ||
      pe.versionInfo?.productName?.toLowerCase().includes('quest soft') ||
      pe.versionInfo?.fileDescription?.toLowerCase().includes('quest engine');

    const hasQspExt = extensionsSet.has('.qsp');
    const hasAslxExt = extensionsSet.has('.aslx') || extensionsSet.has('.quest');
    const hasQspFiles =
      filesLowerSet.has('qspgui.exe') ||
      filesLowerSet.has('qsp.exe') ||
      filesLowerSet.has('quest.exe');

    let hasQspMagic = false;
    let hasAslxMagic = false;

    if (fs) {
      if (hasQspExt) {
        const qspFile = ctx.parentFiles.find(f => f.toLowerCase().endsWith('.qsp'));
        if (qspFile) {
          try {
            const handle = await fs.open(`${ctx.parentDir}/${qspFile}`);
            try {
              const head = await handle.read(0, 16);
              if (head && head.length >= 3) {
                const sig = head.toString('ascii', 0, Math.min(head.length, 12));
                if (sig.startsWith('QSP') || sig.startsWith('QSPSAVEDGAME') || sig.startsWith('QSPGAME')) {
                  hasQspMagic = true;
                }
              }
            } finally {
              await handle.close();
            }
          } catch {}
        }
      }

      if (hasAslxExt) {
        const aslxFile = ctx.parentFiles.find(f => f.toLowerCase().endsWith('.aslx') || f.toLowerCase().endsWith('.quest'));
        if (aslxFile) {
          try {
            const handle = await fs.open(`${ctx.parentDir}/${aslxFile}`);
            try {
              const head = await handle.read(0, 128);
              if (head && head.length >= 4) {
                const text = head.toString('utf8');
                if (text.includes('<asl') || text.includes('<quest')) {
                  hasAslxMagic = true;
                }
              }
            } finally {
              await handle.close();
            }
          } catch {}
        }
      }
    }

    if (isQspExe || isQuestExe || hasQspExt || hasAslxExt || hasQspFiles || hasQspMagic || hasAslxMagic) {
      const isQuestVariant = hasAslxExt || hasAslxMagic || isQuestExe;
      return {
        tag: 'QSP',
        family: 'qsp',
        variant: isQuestVariant ? 'quest' : 'standard',
        arch,
        runtime: 'qsp-runtime',
        saveStrategy: 'qsp-savedgame',
        detectedBy: hasAslxMagic
          ? 'Quest: *.aslx game file (<asl magic)'
          : hasAslxExt
          ? 'Quest: *.aslx / *.quest game file'
          : hasQspMagic
          ? 'QSP: *.qsp game data (QSP magic header)'
          : hasQspExt
          ? 'QSP: *.qsp game file'
          : isQspExe
          ? `QSP Executable: ${ctx.exeName}`
          : 'Quest Soft Player (QSP)',
      };
    }

    return null;
  },
};

export const RAGSRule: EngineClassificationRule = {
  name: 'rags',
  priority: 110,
  async match(ctx: ScanContext): Promise<GameEngineProfile | null> {
    const { pe, exeName, filesLowerSet, extensionsSet, fs } = ctx;
    const arch = pe.is64Bit ? 'x64' : (pe.coffHeader.machine === 0x014c ? 'x86' : 'unknown');

    const isRagsExe =
      exeName === 'ragsplayer.exe' ||
      exeName === 'rags_setup.exe' ||
      exeName.includes('rags') ||
      pe.versionInfo?.originalFilename?.toLowerCase().includes('rags') ||
      pe.versionInfo?.productName?.toLowerCase().includes('rags') ||
      pe.versionInfo?.fileDescription?.toLowerCase().includes('rags');

    const hasRagExt = extensionsSet.has('.rag');
    const hasSdfExt = extensionsSet.has('.sdf');
    const hasRagsFiles =
      filesLowerSet.has('ragsplayer.exe') ||
      filesLowerSet.has('rags_setup.exe');

    let hasRagsMagic = false;
    if (hasRagExt && fs) {
      const ragFile = ctx.parentFiles.find(f => f.toLowerCase().endsWith('.rag'));
      if (ragFile) {
        try {
          const handle = await fs.open(`${ctx.parentDir}/${ragFile}`);
          try {
            const head = await handle.read(0, 8);
            if (head && head.length >= 4) {
              const sig = head.toString('ascii', 0, 4);
              if (sig === 'RAGS') {
                hasRagsMagic = true;
              }
            }
          } finally {
            await handle.close();
          }
        } catch {}
      }
    }

    if (hasRagExt || hasRagsMagic || isRagsExe || hasRagsFiles || (hasSdfExt && isRagsExe)) {
      return {
        tag: 'RAGS',
        family: 'rags',
        variant: 'standard',
        arch,
        runtime: 'dotnet-rags',
        saveStrategy: 'rags-save',
        detectedBy: hasRagsMagic
          ? 'RAGS: *.rag encrypted game (RAGS magic)'
          : hasRagExt
          ? 'RAGS: *.rag Game File'
          : hasSdfExt
          ? 'RAGS: *.sdf Database / RAGS Runner'
          : `RAGS Executable: ${ctx.exeName}`,
      };
    }

    return null;
  },
};

export const ADRIFTRule: EngineClassificationRule = {
  name: 'adrift',
  priority: 120,
  async match(ctx: ScanContext): Promise<GameEngineProfile | null> {
    const { pe, exeName, filesLowerSet, extensionsSet, fs } = ctx;
    const arch = pe.is64Bit ? 'x64' : (pe.coffHeader.machine === 0x014c ? 'x86' : 'unknown');

    const isAdriftExe =
      exeName.includes('adrift') ||
      exeName === 'scrun.exe' ||
      exeName === 'adrift5.exe' ||
      pe.versionInfo?.productName?.toLowerCase().includes('adrift') ||
      pe.versionInfo?.fileDescription?.toLowerCase().includes('adrift') ||
      pe.versionInfo?.fileDescription?.toLowerCase().includes('scrun');

    const hasTafExt = extensionsSet.has('.taf');
    const hasBlorbExt =
      extensionsSet.has('.blorb') ||
      extensionsSet.has('.blb') ||
      extensionsSet.has('.zblorb') ||
      extensionsSet.has('.gblorb');

    const hasAdriftFiles =
      filesLowerSet.has('scrun.exe') ||
      filesLowerSet.has('adrift.exe') ||
      filesLowerSet.has('adrift5.exe');

    let hasBlorbMagic = false;
    if (hasBlorbExt && fs) {
      const blorbFile = ctx.parentFiles.find(f => {
        const lower = f.toLowerCase();
        return lower.endsWith('.blorb') || lower.endsWith('.blb') || lower.endsWith('.zblorb') || lower.endsWith('.gblorb');
      });
      if (blorbFile) {
        try {
          const handle = await fs.open(`${ctx.parentDir}/${blorbFile}`);
          try {
            const head = await handle.read(0, 12);
            if (head && head.length >= 12) {
              const formSig = head.toString('ascii', 0, 4);
              const ifrsSig = head.toString('ascii', 8, 12);
              if (formSig === 'FORM' && ifrsSig === 'IFRS') {
                hasBlorbMagic = true;
              }
            }
          } finally {
            await handle.close();
          }
        } catch {}
      }
    }

    if (hasTafExt || hasBlorbExt || hasBlorbMagic || isAdriftExe || hasAdriftFiles) {
      return {
        tag: 'ADRIFT',
        family: 'adrift',
        variant: (hasBlorbExt || hasBlorbMagic) ? 'blorb' : 'standard',
        arch,
        runtime: 'adrift-runner',
        saveStrategy: 'adrift-save',
        detectedBy: hasBlorbMagic
          ? 'ADRIFT: Blorb Container (FORM/IFRS)'
          : hasBlorbExt
          ? 'ADRIFT: Blorb Interactive Fiction Container (*.blorb)'
          : hasTafExt
          ? 'ADRIFT: *.taf game archive'
          : `ADRIFT Executable: ${ctx.exeName}`,
      };
    }

    return null;
  },
};

export const TadsRule: EngineClassificationRule = {
  name: 'tads',
  priority: 130,
  async match(ctx: ScanContext): Promise<GameEngineProfile | null> {
    const { pe, exeName, filesLowerSet, extensionsSet, fs } = ctx;
    const arch = pe.is64Bit ? 'x64' : (pe.coffHeader.machine === 0x014c ? 'x86' : 'unknown');

    const isTadsExe =
      exeName.includes('t3run') ||
      exeName.includes('tads') ||
      exeName === 'htmltads.exe' ||
      exeName === 'tads2.exe' ||
      exeName === 'tads3.exe' ||
      pe.versionInfo?.productName?.toLowerCase().includes('tads') ||
      pe.versionInfo?.fileDescription?.toLowerCase().includes('tads');

    const hasT3Ext = extensionsSet.has('.t3');
    const hasGamExt = extensionsSet.has('.gam');
    const hasTadsFiles =
      filesLowerSet.has('t3run.exe') ||
      filesLowerSet.has('htmltads.exe') ||
      filesLowerSet.has('tads2.exe') ||
      filesLowerSet.has('tads3.exe');

    let hasT3Magic = false;
    let hasTads2Magic = false;

    if (fs) {
      if (hasT3Ext) {
        const t3File = ctx.parentFiles.find(f => f.toLowerCase().endsWith('.t3'));
        if (t3File) {
          try {
            const handle = await fs.open(`${ctx.parentDir}/${t3File}`);
            try {
              const head = await handle.read(0, 16);
              if (head && head.length >= 8) {
                const sig = head.toString('ascii', 0, 8);
                if (sig.startsWith('T3-image')) {
                  hasT3Magic = true;
                }
              }
            } finally {
              await handle.close();
            }
          } catch {}
        }
      }

      if (hasGamExt) {
        const gamFile = ctx.parentFiles.find(f => f.toLowerCase().endsWith('.gam'));
        if (gamFile) {
          try {
            const handle = await fs.open(`${ctx.parentDir}/${gamFile}`);
            try {
              const head = await handle.read(0, 16);
              if (head && head.length >= 8) {
                const sig = head.toString('ascii', 0, 8);
                if (sig.startsWith('TADS2') || sig.startsWith('TADS')) {
                  hasTads2Magic = true;
                }
              }
            } finally {
              await handle.close();
            }
          } catch {}
        }
      }
    }

    if (hasT3Ext || hasGamExt || hasT3Magic || hasTads2Magic || isTadsExe || hasTadsFiles) {
      const isTads3 = hasT3Ext || hasT3Magic || exeName.includes('t3');
      const isTads2 = hasGamExt || hasTads2Magic || exeName.includes('tads2');

      return {
        tag: 'Tads',
        family: 'tads',
        variant: isTads3 ? 'tads-3' : isTads2 ? 'tads-2' : 'standard',
        arch,
        runtime: 'tads-vm',
        saveStrategy: 'tads-save',
        detectedBy: hasT3Magic
          ? 'TADS: *.t3 compiled image (T3-image magic)'
          : hasT3Ext
          ? 'TADS: *.t3 compiled image'
          : hasTads2Magic
          ? 'TADS: *.gam compiled image (TADS2 bin magic)'
          : hasGamExt
          ? 'TADS: *.gam compiled game image'
          : `TADS Executable: ${ctx.exeName}`,
      };
    }

    return null;
  },
};

function detectTwineStoryFormat(content: string): 'twine-sugarcube' | 'twine-harlowe' | 'twine-chapbook' | 'twine-snowman' | 'twine' | null {
  const lower = content.toLowerCase();

  // 1. Specific Twine story formats
  if (
    lower.includes('data-format="sugarcube') ||
    lower.includes('format="sugarcube') ||
    lower.includes('sugarcube-2') ||
    lower.includes('sugarcube')
  ) {
    return 'twine-sugarcube';
  }

  if (
    lower.includes('data-format="harlowe') ||
    lower.includes('format="harlowe') ||
    lower.includes('harlowe-') ||
    lower.includes('harlowe')
  ) {
    return 'twine-harlowe';
  }

  if (
    lower.includes('data-format="chapbook') ||
    lower.includes('format="chapbook') ||
    lower.includes('chapbook-') ||
    lower.includes('chapbook')
  ) {
    return 'twine-chapbook';
  }

  if (
    lower.includes('data-format="snowman') ||
    lower.includes('format="snowman') ||
    lower.includes('snowman-') ||
    lower.includes('snowman')
  ) {
    return 'twine-snowman';
  }

  // 2. Generic Twine container markers
  if (lower.includes('<tw-storydata') || lower.includes('twine-user-script') || lower.includes('twine')) {
    return 'twine';
  }

  return null;
}

export const HTMLWebGLRule: EngineClassificationRule = {
  name: 'html-webgl',
  priority: 140,
  async match(ctx: ScanContext): Promise<GameEngineProfile | null> {
    const { pe, exeName, filesLowerSet, extensionsSet, fs } = ctx;
    const arch = pe.is64Bit ? 'x64' : (pe.coffHeader.machine === 0x014c ? 'x86' : 'unknown');

    // 1. Construct 2 / Construct 3 engine markers
    const hasC2 = filesLowerSet.has('c2runtime.js');
    const hasC3 =
      filesLowerSet.has('c3runtime.js') ||
      filesLowerSet.has('c3repo.js') ||
      filesLowerSet.has('c3runtime');

    // 2. Electron Application Container
    const hasElectronAsar =
      filesLowerSet.has('electron.asar') ||
      filesLowerSet.has('app.asar');

    const isElectronExe =
      pe.versionInfo?.originalFilename?.toLowerCase() === 'electron.exe' ||
      pe.versionInfo?.productName?.toLowerCase().includes('electron') ||
      pe.versionInfo?.fileDescription?.toLowerCase().includes('electron') ||
      pe.hasImport('electron.exe') ||
      exeName === 'electron.exe';

    let hasElectronResources = false;
    if (fs && (filesLowerSet.has('resources') || isElectronExe)) {
      try {
        if (
          (await fs.exists(`${ctx.parentDir}/resources/app.asar`)) ||
          (await fs.exists(`${ctx.parentDir}/resources/app`)) ||
          (await fs.exists(`${ctx.parentDir}/resources/electron.asar`))
        ) {
          hasElectronResources = true;
        }
      } catch {}
    }

    const isElectron = hasElectronAsar || isElectronExe || hasElectronResources;

    // 3. NW.js Application Container
    const isNwContainer =
      pe.versionInfo?.originalFilename?.toLowerCase() === 'nw.exe' ||
      pe.versionInfo?.rawValues?.['OriginalFilename']?.toLowerCase() === 'nw.exe' ||
      pe.hasImport('nw.dll') ||
      filesLowerSet.has('nw.dll') ||
      filesLowerSet.has('package.nw') ||
      exeName === 'nw.exe';

    // 4. Tauri Container
    const isTauri =
      filesLowerSet.has('tauri.conf.json') ||
      filesLowerSet.has('libtauri.dll') ||
      pe.hasImport('libtauri.dll') ||
      pe.versionInfo?.fileDescription?.toLowerCase().includes('tauri') ||
      pe.versionInfo?.productName?.toLowerCase().includes('tauri');

    // 5. Neutralino Container
    const isNeutralino =
      filesLowerSet.has('neutralino.js') ||
      filesLowerSet.has('neutralino.config.json');

    // 6. Generic HTML5 / WebGL entry points
    const hasHtmlEntry =
      filesLowerSet.has('index.html') ||
      filesLowerSet.has('index.htm') ||
      filesLowerSet.has('game.html') ||
      filesLowerSet.has('story.html') ||
      extensionsSet.has('.html') ||
      extensionsSet.has('.htm');

    const hasPackageJson = filesLowerSet.has('package.json');

    // Check subdirectories (www/ or app/) for web entry points if fs is available
    let hasSubdirHtml = false;
    if (fs && !hasHtmlEntry && (filesLowerSet.has('www') || filesLowerSet.has('app'))) {
      try {
        if (
          (await fs.exists(`${ctx.parentDir}/www/index.html`)) ||
          (await fs.exists(`${ctx.parentDir}/app/index.html`))
        ) {
          hasSubdirHtml = true;
        }
      } catch {}
    }

    const isWebContainer =
      isElectron ||
      isNwContainer ||
      isTauri ||
      isNeutralino ||
      hasHtmlEntry ||
      hasSubdirHtml ||
      hasC2 ||
      hasC3 ||
      hasPackageJson;

    if (!isWebContainer) {
      return null;
    }

    // 7. Inspect HTML content for Twine story formats (SugarCube, Harlowe, Chapbook, Snowman)
    let twineVariant: 'twine-sugarcube' | 'twine-harlowe' | 'twine-chapbook' | 'twine-snowman' | 'twine' | null = null;
    if (fs) {
      const candidateHtmlFiles = [
        'index.html',
        'story.html',
        'game.html',
        'www/index.html',
        'app/index.html',
        ...ctx.parentFiles.filter(f => f.toLowerCase().endsWith('.html') || f.toLowerCase().endsWith('.htm')),
      ];

      for (const relPath of candidateHtmlFiles) {
        const fullPath = `${ctx.parentDir}/${relPath}`.replace(/\\/g, '/');
        try {
          if (await fs.exists(fullPath)) {
            const handle = await fs.open(fullPath);
            try {
              const buf = await handle.read(0, 32768);
              if (buf && buf.length > 0) {
                const detected = detectTwineStoryFormat(buf.toString('utf8'));
                if (detected) {
                  twineVariant = detected;
                  break;
                }
              }
            } finally {
              await handle.close();
            }
          }
        } catch {}
      }
    }

    // Determine runtime environment
    let runtime: GameEngineProfile['runtime'] = 'webgl-browser';
    if (isElectron) {
      runtime = 'electron';
    } else if (isNwContainer) {
      runtime = 'nwjs';
    }

    // Determine variant & description
    if (twineVariant) {
      const twineNames: Record<string, string> = {
        'twine-sugarcube': 'SugarCube',
        'twine-harlowe': 'Harlowe',
        'twine-chapbook': 'Chapbook',
        'twine-snowman': 'Snowman',
        'twine': 'Interactive Story',
      };
      const formatName = twineNames[twineVariant] || 'Standard';
      const containerDesc = isElectron
        ? 'Electron Container'
        : isNwContainer
        ? 'NW.js Container'
        : isTauri
        ? 'Tauri Container'
        : isNeutralino
        ? 'Neutralino Container'
        : 'HTML5 Web Entry';

      return {
        tag: 'HTML',
        family: 'html-webgl',
        variant: twineVariant,
        arch,
        runtime,
        saveStrategy: 'custom',
        detectedBy: `Twine (${formatName}) in ${containerDesc}`,
      };
    }

    if (hasC3) {
      return {
        tag: 'HTML',
        family: 'html-webgl',
        variant: 'construct-3',
        arch,
        runtime,
        saveStrategy: 'custom',
        detectedBy: 'Construct 3 Game Engine (c3runtime.js)',
      };
    }

    if (hasC2) {
      return {
        tag: 'HTML',
        family: 'html-webgl',
        variant: 'construct-2',
        arch,
        runtime,
        saveStrategy: 'custom',
        detectedBy: 'Construct 2 Game Engine (c2runtime.js)',
      };
    }

    if (isElectron) {
      return {
        tag: 'HTML',
        family: 'html-webgl',
        variant: 'electron',
        arch,
        runtime: 'electron',
        saveStrategy: 'custom',
        detectedBy: hasElectronResources
          ? 'Electron Application (resources/app.asar)'
          : hasElectronAsar
          ? 'Electron Application (app.asar)'
          : 'Electron Container Binary',
      };
    }

    if (isTauri) {
      return {
        tag: 'HTML',
        family: 'html-webgl',
        variant: 'tauri',
        arch,
        runtime: 'webgl-browser',
        saveStrategy: 'custom',
        detectedBy: 'Tauri Desktop Container (tauri.conf.json)',
      };
    }

    if (isNeutralino) {
      return {
        tag: 'HTML',
        family: 'html-webgl',
        variant: 'neutralino',
        arch,
        runtime: 'webgl-browser',
        saveStrategy: 'custom',
        detectedBy: 'Neutralinojs Desktop Container (neutralino.js)',
      };
    }

    if (isNwContainer) {
      return {
        tag: 'HTML',
        family: 'html-webgl',
        variant: 'nwjs',
        arch,
        runtime: 'nwjs',
        saveStrategy: 'custom',
        detectedBy: 'Generic NW.js Web Application Container',
      };
    }

    return {
      tag: 'HTML',
      family: 'html-webgl',
      variant: 'web-canvas',
      arch,
      runtime: 'webgl-browser',
      saveStrategy: 'custom',
      detectedBy: 'HTML5 / WebGL Canvas Entry (index.html)',
    };
  },
};

export const InteractiveFictionAndWebRules: EngineClassificationRule[] = [
  QSPRule,
  RAGSRule,
  ADRIFTRule,
  TadsRule,
  HTMLWebGLRule,
];

/// <reference types="node" />
/**
 * YumeEngine - Declarative Rules for Major 3D and VM Binary Engines
 * (Unity, Unreal Engine, Godot, Flash, Java)
 *
 * Derived from Detect-It-Easy & XPEViewer specifications by horsicq,
 * XUnity.AutoTranslator by bbepis, and BepInEx runtime hooking models.
 * MIT License - Copyright (c) horsicq, bbepis, BepInEx Contributors / YumeShelf Contributors
 */

import type { EngineClassificationRule, ScanContext } from './types.js';
import type { GameEngineProfile } from '../types.js';

export const UnityRule: EngineClassificationRule = {
  name: 'unity',
  priority: 10,
  async match(ctx: ScanContext): Promise<GameEngineProfile | null> {
    const { pe, filesLowerSet, fs } = ctx;
    const arch = pe.is64Bit ? 'x64' : (pe.coffHeader.machine === 0x014c ? 'x86' : 'unknown');

    // 1. IL2CPP Detection: GameAssembly.dll import or filesystem marker
    const hasGameAssembly = pe.hasImport('GameAssembly.dll') || filesLowerSet.has('gameassembly.dll');
    if (hasGameAssembly) {
      return {
        tag: 'Unity',
        family: 'unity',
        variant: 'il2cpp',
        arch,
        runtime: 'native',
        saveStrategy: 'custom',
        detectedBy: 'PE Import: GameAssembly.dll (IL2CPP)',
      };
    }

    // Check for global-metadata.dat magic (0xFAB11BAF) if Data directory is accessible via fs
    if (fs && (filesLowerSet.has('data') || Array.from(filesLowerSet).some(f => f.endsWith('_data')))) {
      const dataFolder = Array.from(filesLowerSet).find(f => f.endsWith('_data') || f === 'data');
      if (dataFolder) {
        const metadataPath = `${ctx.parentDir}/${dataFolder}/Managed/Metadata/global-metadata.dat`.replace(/\\/g, '/');
        try {
          if (await fs.exists(metadataPath)) {
            const handle = await fs.open(metadataPath);
            try {
              const metaBuf = await handle.read(0, 4);
              if (metaBuf && metaBuf.length >= 4 && metaBuf.readUInt32LE(0) === 0xFAB11BAF) {
                return {
                  tag: 'Unity',
                  family: 'unity',
                  variant: 'il2cpp',
                  arch,
                  runtime: 'native',
                  saveStrategy: 'custom',
                  detectedBy: 'Unity global-metadata.dat magic (0xFAB11BAF)',
                };
              }
            } finally {
              await handle.close();
            }
          }
        } catch {}
      }
    }

    // 2. Mono Detection: UnityPlayer.dll, mono-2.0-bdwgc.dll, mono.dll, or VersionInfo CompanyName
    const hasUnityPlayer =
      pe.hasImport('UnityPlayer.dll') ||
      pe.hasImport('mono-2.0-bdwgc.dll') ||
      pe.hasImport('mono.dll') ||
      filesLowerSet.has('unityplayer.dll') ||
      filesLowerSet.has('mono-2.0-bdwgc.dll') ||
      filesLowerSet.has('mono.dll') ||
      pe.versionInfo?.companyName === 'Unity Technologies' ||
      pe.versionInfo?.rawValues?.['CompanyName'] === 'Unity Technologies' ||
      pe.versionInfo?.fileDescription?.includes('Unity Player');

    if (hasUnityPlayer) {
      return {
        tag: 'Unity',
        family: 'unity',
        variant: 'mono',
        arch,
        runtime: 'mono',
        saveStrategy: 'custom',
        detectedBy: 'PE Import: UnityPlayer.dll / Mono runtime',
      };
    }

    return null;
  },
};

export const UnrealEngineRule: EngineClassificationRule = {
  name: 'unreal-engine',
  priority: 20,
  async match(ctx: ScanContext): Promise<GameEngineProfile | null> {
    const { pe, exeName, filesLowerSet, extensionsSet, fs } = ctx;
    const arch = pe.is64Bit ? 'x64' : (pe.coffHeader.machine === 0x014c ? 'x86' : 'unknown');

    // 1. Check for Shipping executable name pattern, Engine/ directory, or *.uproject
    const isShippingExe = exeName.includes('shipping');
    const hasEngineDir = filesLowerSet.has('engine');
    const hasUProject = extensionsSet.has('.uproject');

    // 2. Check for UE PAK Magic (0x5A6F12E1 or 0x9E2A83C1) in *.pak files if available
    let hasUePak = false;
    if (extensionsSet.has('.pak') && fs) {
      const pakFile = ctx.parentFiles.find(f => f.toLowerCase().endsWith('.pak'));
      if (pakFile) {
        try {
          const handle = await fs.open(`${ctx.parentDir}/${pakFile}`);
          try {
            const fileStat = await fs.stat(`${ctx.parentDir}/${pakFile}`);
            if (fileStat.size >= 4) {
              const headBuf = await handle.read(0, 4);
              const magic = headBuf.readUInt32LE(0);
              if (magic === 0x5A6F12E1 || magic === 0x9E2A83C1) {
                hasUePak = true;
              } else if (fileStat.size >= 204) {
                // Check footer magic
                const footerBuf = await handle.read(Math.max(0, fileStat.size - 204), 204);
                for (let i = 0; i <= footerBuf.length - 4; i += 4) {
                  const footMagic = footerBuf.readUInt32LE(i);
                  if (footMagic === 0x5A6F12E1 || footMagic === 0x9E2A83C1) {
                    hasUePak = true;
                    break;
                  }
                }
              }
            }
          } finally {
            await handle.close();
          }
        } catch {}
      }
    }

    if (isShippingExe || hasEngineDir || hasUProject || hasUePak) {
      return {
        tag: 'Unreal Engine',
        family: 'unreal',
        variant: 'ue4-ue5',
        arch,
        runtime: 'native',
        saveStrategy: 'unreal-sav',
        detectedBy: isShippingExe
          ? 'Unreal Shipping Executable'
          : hasEngineDir
          ? 'Engine Directory / Binaries'
          : hasUProject
          ? '*.uproject file marker'
          : 'UE PAK magic header/footer',
      };
    }

    return null;
  },
};

export const GodotRule: EngineClassificationRule = {
  name: 'godot',
  priority: 30,
  async match(ctx: ScanContext): Promise<GameEngineProfile | null> {
    const { pe, exeName, filesLowerSet, extensionsSet, fs } = ctx;
    const arch = pe.is64Bit ? 'x64' : (pe.coffHeader.machine === 0x014c ? 'x86' : 'unknown');

    // 1. Version info signature: FileDescription "Godot Engine" or GDScript
    const isGodotVersionInfo =
      pe.versionInfo?.fileDescription?.includes('Godot Engine') ||
      pe.versionInfo?.productName?.includes('Godot Engine') ||
      pe.versionInfo?.comments?.includes('Godot');

    // 2. Project marker or standalone .pck file
    const hasProjectGodot = filesLowerSet.has('project.godot');
    const hasPckExtension = extensionsSet.has('.pck');

    // 3. Embedded / Standalone .pck magic GDPC (0x43504447)
    let hasGdpcMagic = false;
    if (hasPckExtension && fs) {
      const pckFile = ctx.parentFiles.find(f => f.toLowerCase().endsWith('.pck'));
      if (pckFile) {
        try {
          const handle = await fs.open(`${ctx.parentDir}/${pckFile}`);
          try {
            const pckBuf = await handle.read(0, 4);
            if (pckBuf && pckBuf.length >= 4 && pckBuf.readUInt32LE(0) === 0x43504447) {
              hasGdpcMagic = true;
            }
          } finally {
            await handle.close();
          }
        } catch {}
      }
    }

    const isSiglusMarker =
      exeName.includes('siglus') ||
      filesLowerSet.has('scene.pck') ||
      filesLowerSet.has('siglusengine.dll');

    const hasPckMatch = hasGdpcMagic || (hasPckExtension && !isSiglusMarker);

    if (isGodotVersionInfo || hasProjectGodot || hasPckMatch) {
      return {
        tag: 'Godot',
        family: 'godot',
        variant: 'standard',
        arch,
        runtime: 'native',
        saveStrategy: 'godot',
        detectedBy: isGodotVersionInfo
          ? 'PE VersionInfo: Godot Engine'
          : hasProjectGodot
          ? 'Filesystem: project.godot'
          : hasGdpcMagic
          ? 'Godot .pck package container (GDPC magic)'
          : 'Godot .pck package container',
      };
    }

    return null;
  },
};

export const FlashRule: EngineClassificationRule = {
  name: 'flash',
  priority: 40,
  async match(ctx: ScanContext): Promise<GameEngineProfile | null> {
    const { pe, exeName, filesLowerSet, extensionsSet, fs } = ctx;
    const arch = pe.is64Bit ? 'x64' : (pe.coffHeader.machine === 0x014c ? 'x86' : 'unknown');

    const hasSwf = extensionsSet.has('.swf');
    const hasAdobeAir = filesLowerSet.has('adobe air') || filesLowerSet.has('mimetype');
    const isFlashPlayerExe = exeName.includes('flashplayer') || exeName.includes('adl.exe');

    let hasSwfMagic = false;
    if (hasSwf && fs) {
      const swfFile = ctx.parentFiles.find(f => f.toLowerCase().endsWith('.swf'));
      if (swfFile) {
        try {
          const handle = await fs.open(`${ctx.parentDir}/${swfFile}`);
          try {
            const headBuf = await handle.read(0, 3);
            if (headBuf && headBuf.length >= 3) {
              const sig = headBuf.toString('ascii', 0, 3);
              if (sig === 'FWS' || sig === 'CWS' || sig === 'ZWS') {
                hasSwfMagic = true;
              }
            }
          } finally {
            await handle.close();
          }
        } catch {}
      }
    }

    if (hasSwf || hasAdobeAir || isFlashPlayerExe || hasSwfMagic) {
      return {
        tag: 'Flash',
        family: 'flash',
        variant: hasAdobeAir ? 'air' : 'swf',
        arch,
        runtime: 'flash',
        saveStrategy: 'custom',
        detectedBy: hasAdobeAir
          ? 'Adobe AIR Runtime Container'
          : '*.swf Container (FWS/CWS/ZWS)',
      };
    }

    return null;
  },
};

export const JavaRule: EngineClassificationRule = {
  name: 'java',
  priority: 50,
  async match(ctx: ScanContext): Promise<GameEngineProfile | null> {
    const { pe, exeName, filesLowerSet, extensionsSet } = ctx;
    const arch = pe.is64Bit ? 'x64' : (pe.coffHeader.machine === 0x014c ? 'x86' : 'unknown');

    const hasJar = extensionsSet.has('.jar');
    const isJavaw = exeName === 'javaw.exe' || exeName === 'java.exe';
    const hasJvmDll = pe.hasImport('jvm.dll') || filesLowerSet.has('jvm.dll');

    if (hasJar || isJavaw || hasJvmDll) {
      return {
        tag: 'Java',
        family: 'java',
        variant: 'standard',
        arch,
        runtime: 'jvm',
        saveStrategy: 'custom',
        detectedBy: hasJar ? 'Java Archive (*.jar)' : 'JVM Runtime Executable (jvm.dll)',
      };
    }

    return null;
  },
};

export const Core3DAndBinaryRules: EngineClassificationRule[] = [
  UnityRule,
  UnrealEngineRule,
  GodotRule,
  FlashRule,
  JavaRule,
];

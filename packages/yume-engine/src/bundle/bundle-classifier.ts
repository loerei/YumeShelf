/// <reference types="node" />
/**
 * macOS Bundle Layout Engine Classifier (@yumeshelf/engine)
 *
 * Classifies game engine families and runtime variants for macOS `.app` bundles
 * based on bundle structure, resource layout, and Mach-O binary inspection.
 *
 * MIT License - Copyright (c) YumeShelf Contributors
 */

import type { IFileSystem, GameEngineProfile, AppBundleInspectionResult } from '../types.js';
import { NodeFileSystemProvider } from '../fs/node-fs-provider.js';
import { MachOInspector } from '../binary/index.js';
import { resolveBundleRoot, AppBundleInspector } from './app-bundle-inspector.js';

/**
 * Classifies the game engine and runtime profile of a macOS `.app` bundle.
 *
 * @param bundlePath Outer bundle directory or nested binary path
 * @param fs File system provider (defaults to NodeFileSystemProvider)
 * @param bundleInfo Optional pre-computed AppBundleInspectionResult
 * @returns GameEngineProfile populated with engine family, runtime, save strategy, and arch
 */
export async function classifyAppBundle(
  bundlePath: string,
  fs?: IFileSystem,
  bundleInfo?: AppBundleInspectionResult | null
): Promise<GameEngineProfile> {
  const fileSystem = fs || new NodeFileSystemProvider();

  let bundleRoot = resolveBundleRoot(bundlePath);
  if (!bundleRoot) {
    const normalized = bundlePath.replace(/\\/g, '/').replace(/\/+$/, '');
    const lastSeg = normalized.split('/').pop() || '';
    if (lastSeg.length > 4 && lastSeg.toLowerCase().endsWith('.app')) {
      bundleRoot = normalized;
    } else {
      bundleRoot = normalized;
    }
  }

  if (/^[a-zA-Z]:\//.test(bundleRoot)) {
    bundleRoot = bundleRoot[0].toUpperCase() + bundleRoot.slice(1);
  }

  let info = bundleInfo;
  if (info === undefined) {
    info = await AppBundleInspector.fromPath(bundleRoot, fileSystem);
  }

  let machoArch: 'x64' | 'arm64' | 'x86' | 'fat' | 'unknown' = 'unknown';
  const candidateExePath = info?.executablePath;
  if (candidateExePath) {
    try {
      const machoResult = await MachOInspector.fromPath(candidateExePath, fileSystem);
      if (machoResult) {
        machoArch = machoResult.arch;
      }
    } catch {
      machoArch = 'unknown';
    }
  }

  if (machoArch === 'unknown') {
    try {
      const macOSDir = `${bundleRoot}/Contents/MacOS`;
      const entries = await fileSystem.readdir(macOSDir);
      for (const entry of entries) {
        if (entry.startsWith('.')) continue;
        const p = `${macOSDir}/${entry}`;
        try {
          const machoResult = await MachOInspector.fromPath(p, fileSystem);
          if (machoResult) {
            machoArch = machoResult.arch;
            break;
          }
        } catch {}
      }
    } catch {}
  }

  // 1. Unity: Contents/Resources/Data/ or Contents/Frameworks/UnityPlayer.dylib
  let isUnity = false;
  try {
    if (
      (await fileSystem.exists(`${bundleRoot}/Contents/Resources/Data`)) ||
      (await fileSystem.exists(`${bundleRoot}/Contents/Frameworks/UnityPlayer.dylib`))
    ) {
      isUnity = true;
    }
  } catch {}

  if (isUnity) {
    return {
      tag: 'Unity',
      family: 'unity',
      variant: 'standard',
      arch: machoArch || 'unknown',
      runtime: 'native',
      saveStrategy: 'unity-appsupport-playerprefs',
      detectedBy: 'macOS App Bundle (Unity)',
    };
  }

  // 2. RPG Maker MV / MZ: Contents/Resources/app.nw/
  let isRpgMaker = false;
  const appNwDir = `${bundleRoot}/Contents/Resources/app.nw`;
  try {
    if (await fileSystem.exists(appNwDir)) {
      isRpgMaker = true;
    }
  } catch {}

  if (isRpgMaker) {
    let isMZ = false;
    try {
      if (
        (await fileSystem.exists(`${appNwDir}/js/rmmz_core.js`)) ||
        (await fileSystem.exists(`${appNwDir}/rmmz_core.js`)) ||
        (await fileSystem.exists(`${appNwDir}/js/rmmz_managers.js`)) ||
        (await fileSystem.exists(`${appNwDir}/js/rmmz_scenes.js`))
      ) {
        isMZ = true;
      } else if (
        (await fileSystem.exists(`${appNwDir}/js/rpg_core.js`)) ||
        (await fileSystem.exists(`${appNwDir}/www/js/rpg_core.js`)) ||
        (await fileSystem.exists(`${appNwDir}/www`))
      ) {
        isMZ = false;
      } else {
        const entries = await fileSystem.readdir(appNwDir);
        const entriesLower = entries.map((e) => e.toLowerCase());
        if (entriesLower.some((e) => e.includes('rmmz'))) {
          isMZ = true;
        } else if (entriesLower.some((e) => e.includes('rpg_') || e === 'www')) {
          isMZ = false;
        } else if (await fileSystem.exists(`${appNwDir}/main.js`)) {
          isMZ = true;
        }
      }
    } catch {}

    return {
      tag: 'RPGM',
      family: 'rpg-maker',
      variant: isMZ ? 'mz' : 'mv',
      arch: machoArch || 'unknown',
      runtime: 'nwjs',
      saveStrategy: 'rpgmaker-bundle-data',
      detectedBy: 'macOS App Bundle (RPG Maker)',
    };
  }

  // 3. Ren'Py: Contents/Resources/autorun/ or Contents/MacOS/ containing .py/.pyo
  let isRenPy = false;
  try {
    if (
      (await fileSystem.exists(`${bundleRoot}/Contents/Resources/autorun`)) ||
      (await fileSystem.exists(`${bundleRoot}/Contents/Resources/autorun.py`))
    ) {
      isRenPy = true;
    }
  } catch {}

  if (!isRenPy) {
    try {
      const macOSEntries = await fileSystem.readdir(`${bundleRoot}/Contents/MacOS`);
      if (
        macOSEntries.some((e) => {
          const lower = e.toLowerCase();
          return lower.endsWith('.py') || lower.endsWith('.pyo');
        })
      ) {
        isRenPy = true;
      }
    } catch {}
  }

  if (!isRenPy) {
    try {
      const resEntries = await fileSystem.readdir(`${bundleRoot}/Contents/Resources`);
      if (
        resEntries.some((e) => {
          const lower = e.toLowerCase();
          return lower === 'autorun' || lower.endsWith('.py');
        })
      ) {
        isRenPy = true;
      }
    } catch {}
  }

  if (isRenPy) {
    return {
      tag: "Ren'Py",
      family: 'renpy',
      variant: 'standard',
      arch: machoArch || 'unknown',
      runtime: 'python',
      saveStrategy: 'renpy-appsupport-saves',
      detectedBy: "macOS App Bundle (Ren'Py)",
    };
  }

  // 4. Godot: Contents/Resources/*.pck
  let isGodot = false;
  try {
    const resEntries = await fileSystem.readdir(`${bundleRoot}/Contents/Resources`);
    if (resEntries.some((e) => e.toLowerCase().endsWith('.pck'))) {
      isGodot = true;
    }
  } catch {}

  if (isGodot) {
    return {
      tag: 'Godot',
      family: 'godot',
      variant: 'standard',
      arch: machoArch || 'unknown',
      runtime: 'native',
      saveStrategy: 'godot-appsupport-user',
      detectedBy: 'macOS App Bundle (Godot)',
    };
  }

  // 5. Unreal Engine: Contents/UE4, Contents/UE5, Contents/Engine, Contents/Resources/Engine, *.pak, *.uproject
  let isUnreal = false;
  try {
    if (
      (await fileSystem.exists(`${bundleRoot}/Contents/UE4`)) ||
      (await fileSystem.exists(`${bundleRoot}/Contents/UE5`)) ||
      (await fileSystem.exists(`${bundleRoot}/Contents/Engine`)) ||
      (await fileSystem.exists(`${bundleRoot}/Contents/Resources/Engine`))
    ) {
      isUnreal = true;
    } else {
      const resEntries = await fileSystem.readdir(`${bundleRoot}/Contents/Resources`);
      if (
        resEntries.some((e) => {
          const lower = e.toLowerCase();
          return lower.endsWith('.pak') || lower.endsWith('.uproject');
        })
      ) {
        isUnreal = true;
      }
    }
  } catch {}

  if (!isUnreal && info?.executableName) {
    const exeLower = info.executableName.toLowerCase();
    if (exeLower.includes('shipping') || exeLower.includes('unreal')) {
      isUnreal = true;
    }
  }

  if (isUnreal) {
    return {
      tag: 'Unreal Engine',
      family: 'unreal',
      variant: 'standard',
      arch: machoArch || 'unknown',
      runtime: 'native',
      saveStrategy: 'unreal-sav',
      detectedBy: 'macOS App Bundle (Unreal Engine)',
    };
  }

  // 6. Electron: Contents/Frameworks/Electron Framework.framework or app.asar/electron.asar
  let isElectron = false;
  try {
    if (
      (await fileSystem.exists(`${bundleRoot}/Contents/Frameworks/Electron Framework.framework`)) ||
      (await fileSystem.exists(`${bundleRoot}/Contents/Resources/app.asar`)) ||
      (await fileSystem.exists(`${bundleRoot}/Contents/Resources/electron.asar`)) ||
      (await fileSystem.exists(`${bundleRoot}/Contents/Resources/default_app.asar`))
    ) {
      isElectron = true;
    }
  } catch {}

  if (isElectron) {
    return {
      tag: 'HTML',
      family: 'html-webgl',
      variant: 'electron',
      arch: machoArch || 'unknown',
      runtime: 'electron',
      saveStrategy: 'custom',
      detectedBy: 'macOS App Bundle (Electron)',
    };
  }

  // 7. NW.js (standalone): Contents/Frameworks/nwjs Framework.framework or package.nw
  let isNwjs = false;
  try {
    if (
      (await fileSystem.exists(`${bundleRoot}/Contents/Frameworks/nwjs Framework.framework`)) ||
      (await fileSystem.exists(`${bundleRoot}/Contents/Resources/package.nw`))
    ) {
      isNwjs = true;
    }
  } catch {}

  if (isNwjs) {
    return {
      tag: 'HTML',
      family: 'html-webgl',
      variant: 'nwjs',
      arch: machoArch || 'unknown',
      runtime: 'nwjs',
      saveStrategy: 'custom',
      detectedBy: 'macOS App Bundle (NW.js)',
    };
  }

  // 8. Unclassified fallback
  return {
    tag: 'Others',
    family: 'unknown',
    variant: 'standard',
    arch: machoArch || 'unknown',
    runtime: 'native',
    saveStrategy: 'unknown',
    detectedBy: 'macOS App Bundle (Unclassified)',
  };
}
